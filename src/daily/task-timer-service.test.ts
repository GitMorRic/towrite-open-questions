import { describe, expect, it } from "vitest";
import {
  DailyTaskTimerService,
  DailyTimerIdempotencyConflictError,
  DailyTimerTransitionCoordinator,
  DailyTimerTransitionError,
  DailyTimerValidationError,
  InMemoryDailyTimerEventLog,
  InMemoryDailyTimerTransitionJournal,
  PersistentDailyTaskTimer,
  createFixedOffsetDailyTimerCalendar,
  eventsToJsonl,
  parseDailyTimerJsonl
} from "./task-timer-service";
import {
  DAILY_TIMER_SCHEMA_VERSION,
  type DailyTimerEvent,
  type DailyTimerTransitionAdapter,
  type DailyTimerTransitionJournalEntry
} from "./task-timer-types";

const calendar = createFixedOffsetDailyTimerCalendar(8 * 60);

describe("DailyTaskTimerService", () => {
  it("reads legacy camelCase and canonical snake_case JSONL and writes canonical snake_case", () => {
    const camel = JSON.stringify({
      schemaVersion: 1,
      eventId: "event_camel",
      taskId: "task_canonical",
      sessionId: "session_canonical",
      kind: "start",
      at: "2026-07-24T09:00:00+08:00",
      source: "obsidian"
    });
    const snake = JSON.stringify({
      schema_version: 1,
      event_id: "event_snake",
      task_id: "task_canonical",
      session_id: "session_canonical",
      kind: "pause",
      at: "2026-07-24T09:30:00+08:00",
      source: "backend"
    });
    const events = parseDailyTimerJsonl(`${camel}\n${snake}\n`);
    expect(events.map((event) => event.eventId)).toEqual(["event_camel", "event_snake"]);
    const written = eventsToJsonl(events);
    expect(written).toContain('"schema_version":1');
    expect(written).toContain('"event_id":"event_camel"');
    expect(written).not.toContain('"schemaVersion"');
  });

  it("tracks active time, wall time, interruptions, sessions, and estimate delta", () => {
    const service = createService();
    service.start("task-a", at("2026-07-24T09:00:00+08:00", "start-a", "session-a"));
    service.pause("task-a", at("2026-07-24T09:30:00+08:00", "pause-a"));
    service.resume("task-a", at("2026-07-24T10:00:00+08:00", "resume-a", "session-b"));
    service.complete("task-a", at("2026-07-24T10:45:00+08:00", "complete-a"));

    expect(service.getSnapshot("task-a", 60, "2026-07-24T11:00:00+08:00")).toMatchObject({
      status: "completed",
      activeMs: 75 * 60_000,
      wallMs: 105 * 60_000,
      interruptionCount: 1,
      firstStartedAt: "2026-07-24T09:00:00+08:00",
      completedAt: "2026-07-24T10:45:00+08:00",
      estimateMinutes: 60,
      estimateDeltaMinutes: 15,
      needsReview: false,
      dailyActiveMs: { "2026-07-24": 75 * 60_000 }
    });
    expect(service.getEvents().map((event) => event.sessionId)).toEqual([
      "session-a",
      "session-a",
      "session-b",
      "session-b"
    ]);
  });

  it("auto-pauses the previous task at the exact activation time", () => {
    const service = createService();
    service.start("task-a", at("2026-07-24T09:00:00+08:00", "start-a", "session-a"));
    const transition = service.start("task-b", at("2026-07-24T10:00:00+08:00", "start-b", "session-b"));

    expect(transition.events).toHaveLength(2);
    expect(transition.events[0]).toMatchObject({
      taskId: "task-a",
      kind: "pause",
      at: "2026-07-24T10:00:00+08:00",
      automatic: true,
      relatedTaskId: "task-b"
    });
    expect(service.getSnapshot("task-a", undefined, "2026-07-24T10:10:00+08:00")).toMatchObject({
      status: "paused",
      activeMs: 60 * 60_000,
      interruptionCount: 1
    });
    expect(service.getActiveTaskId("2026-07-24T10:10:00+08:00")).toBe("task-b");
  });

  it("makes command retries idempotent and rejects event ID reuse", () => {
    const service = createService();
    const first = service.start("task-a", at("2026-07-24T09:00:00+08:00", "stable-event", "session-a"));
    const retry = service.start("task-a", at("2026-07-24T09:00:00+08:00", "stable-event", "session-a"));

    expect(first.idempotent).toBe(false);
    expect(retry).toMatchObject({ idempotent: true, events: [] });
    expect(() => service.complete("task-a", at("2026-07-24T09:01:00+08:00", "stable-event")))
      .toThrow(DailyTimerIdempotencyConflictError);
    expect(() => service.start("task-b", at("2026-07-24T09:01:00+08:00", "stable-event", "session-b")))
      .toThrow(DailyTimerIdempotencyConflictError);
  });

  it("recognizes an old command retry after later state changes", () => {
    const service = createService();
    service.start("task-a", at("2026-07-24T09:00:00+08:00", "start-a", "session-a"));
    service.pause("task-a", at("2026-07-24T09:30:00+08:00", "pause-a"));

    expect(service.start("task-a", at("2026-07-24T09:00:00+08:00", "start-a", "session-a")))
      .toMatchObject({ idempotent: true, events: [] });
    expect(() => service.start("task-a", at("2026-07-24T09:01:00+08:00", "start-a", "session-a")))
      .toThrow(DailyTimerIdempotencyConflictError);
  });

  it("reopens a completed task as paused and does not silently resume it", () => {
    const service = createService();
    service.start("task-a", at("2026-07-24T08:55:00+08:00", "start-a", "session-a"));
    service.complete("task-a", at("2026-07-24T09:00:00+08:00", "complete-a", "session-a"));
    service.reopen("task-a", at("2026-07-24T09:05:00+08:00", "reopen-a"));

    expect(service.getSnapshot("task-a", undefined, "2026-07-24T09:10:00+08:00").status).toBe("paused");
    expect(service.getActiveTaskId("2026-07-24T09:10:00+08:00")).toBeUndefined();
    expect(() => service.start("task-a", at("2026-07-24T09:10:00+08:00", "wrong-start")))
      .toThrow(DailyTimerTransitionError);
  });

  it("does not complete an unstarted task without an explicit start transition", () => {
    const service = createService();
    expect(() => service.complete(
      "task-a",
      at("2026-07-24T09:00:00+08:00", "complete-before-start", "session-a")
    )).toThrow(DailyTimerTransitionError);
  });

  it("supports UI completion of an unstarted task as an auditable zero-time start+complete", () => {
    const service = createService();
    const transition = service.startAndComplete(
      "task-a",
      at("2026-07-24T09:00:00+08:00", "complete-from-idle", "session-a")
    );

    expect(transition.events.map((event) => [event.kind, event.eventId])).toEqual([
      ["start", "complete-from-idle:start"],
      ["complete", "complete-from-idle"]
    ]);
    expect(service.getSnapshot("task-a", undefined, "2026-07-24T09:01:00+08:00")).toMatchObject({
      status: "completed",
      activeMs: 0,
      wallMs: 0,
      interruptionCount: 0
    });
    expect(service.startAndComplete(
      "task-a",
      at("2026-07-24T09:00:00+08:00", "complete-from-idle", "session-a")
    )).toMatchObject({ idempotent: true, events: [] });
  });

  it("splits a closed session across local calendar days", () => {
    const service = createService();
    service.start("task-a", at("2026-07-24T23:50:00+08:00", "start-a", "session-a"));
    service.complete("task-a", at("2026-07-25T00:20:00+08:00", "complete-a"));

    expect(service.getSnapshot("task-a", undefined, "2026-07-25T01:00:00+08:00").dailyActiveMs).toEqual({
      "2026-07-24": 10 * 60_000,
      "2026-07-25": 20 * 60_000
    });
  });

  it("caps an unclosed cross-midnight session and marks it for review", () => {
    const service = createService();
    service.start("task-a", at("2026-07-24T23:50:00+08:00", "start-a", "session-a"));

    const snapshot = service.getSnapshot("task-a", undefined, "2026-07-25T02:00:00+08:00");
    expect(snapshot.activeMs).toBe(10 * 60_000);
    expect(snapshot.dailyActiveMs).toEqual({ "2026-07-24": 10 * 60_000 });
    expect(snapshot.needsReview).toBe(true);
    expect(snapshot.reviewReasons).toContain("open-session-crossed-midnight");
  });

  it("caps an unclosed session at four hours and marks it for review", () => {
    const service = createService();
    service.start("task-a", at("2026-07-24T08:00:00+08:00", "start-a", "session-a"));

    const snapshot = service.getSnapshot("task-a", undefined, "2026-07-24T15:00:00+08:00");
    expect(snapshot.activeMs).toBe(4 * 60 * 60_000);
    expect(snapshot.wallMs).toBe(4 * 60 * 60_000);
    expect(snapshot.reviewReasons).toEqual(["open-session-over-4h"]);
  });

  it("does not turn a late close of an anomalous open session into unlimited active time", () => {
    const service = createService();
    service.start("task-a", at("2026-07-24T08:00:00+08:00", "start-a", "session-a"));
    service.pause("task-a", at("2026-07-24T18:00:00+08:00", "pause-a"));

    expect(service.getSnapshot("task-a", undefined, "2026-07-24T18:01:00+08:00")).toMatchObject({
      status: "paused",
      activeMs: 4 * 60 * 60_000,
      needsReview: true,
      reviewReasons: ["open-session-over-4h"]
    });
  });

  it("keeps a closed cross-midnight session split by day and marks it for confirmation", () => {
    const service = createService();
    service.start("task-a", at("2026-07-24T23:50:00+08:00", "start-a", "session-a"));
    service.complete("task-a", at("2026-07-25T00:20:00+08:00", "complete-a"));

    expect(service.getSnapshot("task-a", undefined, "2026-07-25T00:30:00+08:00")).toMatchObject({
      activeMs: 30 * 60_000,
      needsReview: true,
      reviewReasons: ["open-session-crossed-midnight"],
      dailyActiveMs: {
        "2026-07-24": 10 * 60_000,
        "2026-07-25": 20 * 60_000
      }
    });
  });

  it("corrects immutable events and resets task history without deleting the ledger", () => {
    const service = createService();
    service.start("task-a", at("2026-07-24T09:00:00+08:00", "start-a", "session-a"));
    service.complete("task-a", at("2026-07-24T10:00:00+08:00", "complete-a"));
    service.correct("start-a", {
      ...at("2026-07-24T10:10:00+08:00", "correct-a"),
      replacementAt: "2026-07-24T09:30:00+08:00",
      reason: "Corrected from the task history panel."
    });

    expect(service.getSnapshot("task-a", undefined, "2026-07-24T10:20:00+08:00").activeMs).toBe(30 * 60_000);
    service.reset("task-a", at("2026-07-24T10:30:00+08:00", "reset-a"));
    expect(service.getSnapshot("task-a", undefined, "2026-07-24T10:31:00+08:00")).toMatchObject({
      status: "not-started",
      activeMs: 0
    });
    expect(service.getEvents()).toHaveLength(4);
  });

  it("validates content-free absolute JSONL records and conflicting duplicates", () => {
    const service = createService();
    service.start("task-a", at("2026-07-24T09:00:00+08:00", "start-a", "session-a"));
    const jsonl = service.exportJsonl();

    expect(jsonl).not.toContain("task text");
    expect(parseDailyTimerJsonl(jsonl)).toEqual(service.getEvents());
    expect(() => parseDailyTimerJsonl("{bad json}\n")).toThrow(DailyTimerValidationError);
    expect(() => parseDailyTimerJsonl(`${JSON.stringify({
      ...service.getEvents()[0],
      at: "2026-07-24 09:00"
    })}\n`)).toThrow(DailyTimerValidationError);
    expect(() => parseDailyTimerJsonl(eventsToJsonl([
      service.getEvents()[0],
      { ...service.getEvents()[0], source: "device" }
    ]))).toThrow(DailyTimerIdempotencyConflictError);
    expect(() => parseDailyTimerJsonl(eventsToJsonl([{
      schemaVersion: DAILY_TIMER_SCHEMA_VERSION,
      eventId: "orphan-correction",
      taskId: "task-a",
      sessionId: "session-a",
      kind: "correct",
      at: "2026-07-24T10:00:00+08:00",
      source: "obsidian",
      targetEventId: "missing",
      replacementAt: "2026-07-24T09:30:00+08:00",
      reason: "Correction"
    }]))).toThrow(DailyTimerValidationError);
  });
});

describe("PersistentDailyTaskTimer", () => {
  it("does not publish a transition in memory when persistence fails", async () => {
    class FailingLog extends InMemoryDailyTimerEventLog {
      override async appendJsonl(): Promise<void> {
        throw new Error("disk full");
      }
    }
    const ledger = await PersistentDailyTaskTimer.load(new FailingLog(), timerOptions());

    await expect(ledger.transition((draft) =>
      draft.start("task-a", at("2026-07-24T09:00:00+08:00", "start-a", "session-a"))
    )).rejects.toThrow("disk full");
    expect(ledger.core.getEvents()).toEqual([]);
  });

  it("reloads, exports, archives, and explicitly clears JSONL", async () => {
    const log = new InMemoryDailyTimerEventLog();
    const ledger = await PersistentDailyTaskTimer.load(log, timerOptions());
    await ledger.transition((draft) =>
      draft.start("task-a", at("2026-07-24T09:00:00+08:00", "start-a", "session-a"))
    );

    const reloaded = await PersistentDailyTaskTimer.load(log, timerOptions());
    expect(reloaded.core.getSnapshot("task-a", undefined, "2026-07-24T09:10:00+08:00").status).toBe("running");
    const archive = await reloaded.archiveAndClear("CLEAR");
    expect(archive.eventCount).toBe(1);
    expect(log.archives.size).toBe(1);
    expect(await log.readJsonl()).toBe("");
    expect(reloaded.core.getEvents()).toEqual([]);
  });

  it("serializes concurrent transitions so neither event nor auto-pause is lost", async () => {
    class YieldingLog extends InMemoryDailyTimerEventLog {
      override async appendJsonl(jsonl: string): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await super.appendJsonl(jsonl);
      }
    }
    const ledger = await PersistentDailyTaskTimer.load(new YieldingLog(), timerOptions());

    await Promise.all([
      ledger.transition((draft) =>
        draft.start("task-a", at("2026-07-24T09:00:00+08:00", "start-a", "session-a"))
      ),
      ledger.transition((draft) =>
        draft.start("task-b", at("2026-07-24T09:05:00+08:00", "start-b", "session-b"))
      )
    ]);

    expect(ledger.core.getEvents().map((event) => [event.taskId, event.kind])).toEqual([
      ["task-a", "start"],
      ["task-a", "pause"],
      ["task-b", "start"]
    ]);
    expect(ledger.core.getSnapshot("task-a", undefined, "2026-07-24T09:10:00+08:00").status)
      .toBe("paused");
    expect(ledger.core.getSnapshot("task-b", undefined, "2026-07-24T09:10:00+08:00").status)
      .toBe("running");
  });
});

describe("DailyTimerTransitionCoordinator", () => {
  it("persists prepare, applies Markdown CAS, appends events, and removes the journal", async () => {
    const journal = new InMemoryDailyTimerTransitionJournal();
    const calls: string[] = [];
    const adapter = adapterStub(calls);
    const coordinator = new DailyTimerTransitionCoordinator(journal, adapter, {
      now: () => new Date("2026-07-24T01:00:00.000Z"),
      createId: () => "txn-a"
    });
    const event = startEvent();
    const entry = await coordinator.prepare([event], { "task-a": "markdown-rev-a" });

    await expect(coordinator.execute(entry)).resolves.toEqual({
      transactionId: "txn-a",
      status: "committed"
    });
    expect(calls).toEqual(["inspect", "markdown", "has-events", "append-events"]);
    expect(await journal.list()).toEqual([]);
  });

  it("makes journal preparation idempotent without allowing transaction ID reuse", async () => {
    const journal = new InMemoryDailyTimerTransitionJournal();
    const coordinator = new DailyTimerTransitionCoordinator(journal, adapterStub([]), {
      createId: () => "txn-stable"
    });
    const first = await coordinator.prepare([startEvent()], { "task-a": "rev-a" });
    const retry = await coordinator.prepare([startEvent()], { "task-a": "rev-a" });

    expect(retry).toEqual(first);
    await expect(coordinator.prepare([{ ...startEvent(), at: "2026-07-24T09:01:00+08:00" }], {
      "task-a": "rev-a"
    })).rejects.toThrow(DailyTimerIdempotencyConflictError);
  });

  it("refuses ledger administration while any crash-recovery transaction remains", async () => {
    const journal = new InMemoryDailyTimerTransitionJournal();
    const coordinator = new DailyTimerTransitionCoordinator(journal, adapterStub([]), {
      createId: () => "txn-pending"
    });
    const entry = await coordinator.prepare([startEvent()], { "task-a": "rev-a" });

    await expect(coordinator.assertNoPendingTransactions()).rejects.toThrow(
      "Cannot clear the task timer ledger while 1 transaction(s) are pending reconciliation."
    );

    await coordinator.execute(entry);
    await expect(coordinator.assertNoPendingTransactions()).resolves.toBeUndefined();
  });

  it("persists exact opaque after-state revisions before appending ledger events", async () => {
    class RetainedJournal extends InMemoryDailyTimerTransitionJournal {
      override async remove(): Promise<void> {
        // Simulate a crash after the ledger-applied phase was persisted but
        // before journal cleanup completed.
      }
    }
    const journal = new RetainedJournal();
    const calls: string[] = [];
    const coordinator = new DailyTimerTransitionCoordinator(journal, {
      ...adapterStub(calls),
      async captureMarkdownRevisions() {
        calls.push("capture-revisions");
        return { "task-a": "after-task-rev\u0000after-lineage-rev" };
      }
    }, {
      createId: () => "txn-after-revision"
    });
    const entry = await coordinator.prepare([startEvent()], { "task-a": "before-task-rev\u0000lineage-rev" });

    await coordinator.execute(entry);

    expect(calls).toEqual([
      "inspect",
      "markdown",
      "capture-revisions",
      "has-events",
      "append-events"
    ]);
    expect(await journal.list()).toMatchObject([{
      phase: "ledger-applied",
      appliedMarkdownRevisions: {
        "task-a": "after-task-rev\u0000after-lineage-rev"
      }
    }]);
  });

  it("persists the predicted full-block revision before inspection and rejects a different after block", async () => {
    const journal = new InMemoryDailyTimerTransitionJournal();
    const calls: string[] = [];
    const coordinator = new DailyTimerTransitionCoordinator(journal, {
      async predictMarkdownRevisions() {
        calls.push("predict");
        return { "task-a": "intended-full-block-rev" };
      },
      async inspectMarkdown(entry) {
        calls.push("inspect");
        expect(entry.expectedAfterMarkdownRevisions).toEqual({
          "task-a": "intended-full-block-rev"
        });
        return "before";
      },
      async applyMarkdown() {
        calls.push("markdown");
      },
      async captureMarkdownRevisions() {
        calls.push("capture-revisions");
        return { "task-a": "same-checkbox-but-edited-prose-rev" };
      },
      async hasTimerEvents() {
        calls.push("has-events");
        return false;
      },
      async appendTimerEvents() {
        calls.push("append-events");
      }
    }, { createId: () => "txn-full-block" });
    const entry = await coordinator.prepare([startEvent()], { "task-a": "before-full-block-rev" });

    await expect(coordinator.execute(entry)).resolves.toEqual({
      transactionId: "txn-full-block",
      status: "conflict"
    });
    expect(calls).toEqual(["predict", "inspect", "markdown", "capture-revisions"]);
    expect(await journal.list()).toMatchObject([{
      phase: "conflict",
      expectedAfterMarkdownRevisions: { "task-a": "intended-full-block-rev" },
      appliedMarkdownRevisions: { "task-a": "same-checkbox-but-edited-prose-rev" }
    }]);
  });

  it("reconciles after Markdown was already applied without repeating it", async () => {
    const journal = new InMemoryDailyTimerTransitionJournal();
    const event = startEvent();
    await journal.put({
      schemaVersion: DAILY_TIMER_SCHEMA_VERSION,
      transactionId: "txn-replay",
      createdAt: "2026-07-24T01:00:00.000Z",
      updatedAt: "2026-07-24T01:00:00.000Z",
      phase: "prepared",
      expectedMarkdownRevisions: { "task-a": "rev-a" },
      events: [event]
    });
    const calls: string[] = [];
    const adapter = adapterStub(calls, "after");
    const coordinator = new DailyTimerTransitionCoordinator(journal, adapter);

    expect(await coordinator.reconcilePending()).toEqual([
      { transactionId: "txn-replay", status: "committed" }
    ]);
    expect(calls).toEqual(["inspect", "has-events", "append-events"]);
  });

  it("retains a visible conflict without appending timer events", async () => {
    const journal = new InMemoryDailyTimerTransitionJournal();
    const calls: string[] = [];
    const coordinator = new DailyTimerTransitionCoordinator(journal, adapterStub(calls, "conflict"), {
      createId: () => "txn-conflict"
    });
    const entry = await coordinator.prepare([startEvent()], { "task-a": "stale-revision" });

    expect(await coordinator.execute(entry)).toEqual({
      transactionId: "txn-conflict",
      status: "conflict"
    });
    expect(calls).toEqual(["inspect"]);
    expect(await journal.list()).toMatchObject([{ phase: "conflict", error: "Markdown revision conflict." }]);
  });
});

function createService(): DailyTaskTimerService {
  return new DailyTaskTimerService([], timerOptions());
}

function timerOptions() {
  let id = 0;
  return {
    calendar,
    createId: (prefix: "evt" | "ses" | "txn") => `${prefix}_${++id}`
  };
}

function at(atValue: string, eventId: string, sessionId?: string) {
  return {
    at: atValue,
    eventId,
    sessionId,
    source: "obsidian" as const
  };
}

function startEvent(): DailyTimerEvent {
  return {
    schemaVersion: DAILY_TIMER_SCHEMA_VERSION,
    eventId: "event-a",
    taskId: "task-a",
    sessionId: "session-a",
    kind: "start",
    at: "2026-07-24T09:00:00+08:00",
    source: "obsidian"
  };
}

function adapterStub(
  calls: string[],
  inspection: "before" | "after" | "conflict" = "before"
): DailyTimerTransitionAdapter {
  return {
    async inspectMarkdown(_entry: DailyTimerTransitionJournalEntry) {
      calls.push("inspect");
      return inspection;
    },
    async applyMarkdown() {
      calls.push("markdown");
    },
    async hasTimerEvents() {
      calls.push("has-events");
      return false;
    },
    async appendTimerEvents() {
      calls.push("append-events");
    }
  };
}
