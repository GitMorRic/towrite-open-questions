import { describe, expect, it } from "vitest";
import { HabitLearningService, RAW_EVENT_RETENTION_MS } from "./habit-learning";
import { buildSessionSummaries, SESSION_IDLE_MS } from "./sessions";
import type { NewActivityEvent } from "./types";

describe("HabitLearningService", () => {
  it("keeps events content-free and strips unknown sensitive fields", () => {
    const service = new HabitLearningService();
    const event = service.recordEvent({
      kind: "edit-presence",
      at: "2026-07-01T10:00:00.000Z",
      timezoneOffsetMinutes: 480,
      filePath: "Private/draft.md",
      workflowStageId: "Processing",
      body: "SECRET BODY",
      selection: "SECRET SELECTION",
      clipboard: "SECRET CLIPBOARD",
      keystrokeCount: 9001
    } as unknown as NewActivityEvent, new Date("2026-07-02T00:00:00.000Z"));

    expect(event).toEqual(expect.objectContaining({
      kind: "edit-presence",
      filePath: "Private/draft.md",
      workflowStageId: "processing"
    }));
    const serialized = service.exportBundle(new Date("2026-07-02T00:00:00.000Z")).eventsJsonl;
    expect(serialized).not.toContain("SECRET");
    expect(serialized).not.toContain("keystroke");
    expect(Object.keys(event ?? {})).not.toContain("body");
  });

  it("ends a session after five idle minutes and omits precise paths from summaries", () => {
    const events = [
      fileEvent("focus", "file-switched", "2026-07-01T10:00:00.000Z", "Projects/A.md"),
      fileEvent("edit-1", "edit-presence", "2026-07-01T10:02:00.000Z", "Projects/A.md"),
      fileEvent("edit-2", "edit-presence", new Date(Date.parse("2026-07-01T10:02:00.000Z") + SESSION_IDLE_MS).toISOString(), "Projects/A.md")
    ];

    const sessions = buildSessionSummaries(events);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({
      startedAt: "2026-07-01T10:00:00.000Z",
      endedAt: "2026-07-01T10:02:00.000Z",
      activeDurationMs: 120_000,
      hadEdit: true,
      workflowStageId: "processing"
    });
    expect(sessions[1].hadEdit).toBe(true);
    expect(sessions.every((session) => !("filePath" in session))).toBe(true);
  });

  it("coalesces repeated editor changes into one presence period instead of a key-count log", () => {
    const service = new HabitLearningService();
    const now = new Date("2026-07-02T00:00:00.000Z");
    service.recordEvent(fileInput("edit-1", "2026-07-01T10:00:00.000Z"), now);
    service.recordEvent(fileInput("edit-2", "2026-07-01T10:04:00.000Z"), now);
    service.recordEvent(fileInput("edit-3", "2026-07-01T10:08:00.000Z"), now);

    expect(service.getEvents()).toHaveLength(1);
    expect(service.getEvents()[0]).toMatchObject({
      id: "edit-1",
      kind: "edit-presence",
      at: "2026-07-01T10:00:00.000Z",
      lastActiveAt: "2026-07-01T10:08:00.000Z"
    });
    expect(service.getSessionSummaries(now)[0].activeDurationMs).toBe(8 * 60 * 1000);
  });

  it("purges raw events after 30 days", () => {
    const service = new HabitLearningService();
    service.recordEvent(fileInput("old", "2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:00.000Z"));
    service.recordEvent(fileInput("recent", "2026-01-20T00:00:00.000Z"), new Date("2026-01-20T00:00:00.000Z"));

    const removed = service.purge(new Date(Date.parse("2026-01-01T00:00:00.000Z") + RAW_EVENT_RETENTION_MS + 1));
    expect(removed).toBe(1);
    expect(service.getEvents().map((event) => event.id)).toEqual(["recent"]);
  });

  it("infers a pending time/stage habit only after 5 sessions across 3 days at 70%", () => {
    const service = new HabitLearningService();
    const now = new Date("2026-07-10T00:00:00.000Z");
    for (const [index, at] of [
      "2026-07-01T18:10:00.000Z",
      "2026-07-01T18:20:00.000Z",
      "2026-07-02T19:00:00.000Z",
      "2026-07-03T20:00:00.000Z",
      "2026-07-03T12:00:00.000Z"
    ].entries()) {
      service.recordEvent(fileInput(`edit-${index}`, at), now);
    }

    const [candidate] = service.inferCandidates(now);
    expect(candidate).toMatchObject({
      status: "pending",
      rule: {
        kind: "time-stage",
        workflowStageId: "processing",
        timeWindow: { startHour: 18, endHour: 21 }
      },
      evidence: {
        sampleSize: 5,
        matchingSamples: 4,
        distinctDays: 3,
        ratio: 0.8
      }
    });
    expect(service.getAcceptedHabits()).toEqual([]);
    expect(service.acceptCandidate(candidate.id, now).status).toBe("accepted");
  });

  it("does not infer a time habit without three matching days", () => {
    const service = new HabitLearningService();
    const now = new Date("2026-07-10T00:00:00.000Z");
    for (const [index, at] of [
      "2026-07-01T18:00:00.000Z",
      "2026-07-01T18:10:00.000Z",
      "2026-07-01T18:20:00.000Z",
      "2026-07-02T19:00:00.000Z",
      "2026-07-02T19:10:00.000Z"
    ].entries()) {
      service.recordEvent(fileInput(`edit-${index}`, at), now);
    }
    expect(service.inferCandidates(now)).toEqual([]);
  });

  it("infers a routing habit at 80% across 5 comparable saves and 3 days", () => {
    const service = new HabitLearningService();
    const now = new Date("2026-07-10T00:00:00.000Z");
    addRouteEvents(service, [
      ["2026-07-01T10:00:00.000Z", "target-a"],
      ["2026-07-01T10:10:00.000Z", "target-a"],
      ["2026-07-02T10:00:00.000Z", "target-a"],
      ["2026-07-03T10:00:00.000Z", "target-a"],
      ["2026-07-03T11:00:00.000Z", "target-b"]
    ], now);

    const [candidate] = service.inferCandidates(now);
    expect(candidate).toMatchObject({
      status: "pending",
      rule: {
        kind: "routing",
        context: { workflowStageId: "processing" },
        targetId: "target-a",
        targetKind: "folder"
      },
      evidence: { sampleSize: 5, matchingSamples: 4, distinctDays: 3, ratio: 0.8 }
    });
  });

  it("lets an undone capture supersede its earlier route feedback", () => {
    const service = new HabitLearningService();
    const now = new Date("2026-07-10T00:00:00.000Z");
    [
      ["capture-1", "2026-07-01T10:00:00.000Z"],
      ["capture-2", "2026-07-01T10:10:00.000Z"],
      ["capture-3", "2026-07-02T10:00:00.000Z"],
      ["capture-4", "2026-07-03T10:00:00.000Z"],
      ["capture-5", "2026-07-03T11:00:00.000Z"]
    ].forEach(([captureId, at], index) => {
      service.recordEvent({
        id: `commit-${index}`,
        kind: "capture-route",
        captureId,
        at,
        timezoneOffsetMinutes: 0,
        workflowStageId: "processing",
        entryPoint: "selection",
        selectedTargetId: "target-a",
        selectedTargetKind: "folder",
        selection: "accepted"
      }, now);
    });
    service.recordEvent({
      id: "undo-5",
      kind: "capture-route",
      captureId: "capture-5",
      at: "2026-07-03T11:05:00.000Z",
      timezoneOffsetMinutes: 0,
      workflowStageId: "processing",
      entryPoint: "selection",
      selectedTargetId: "target-a",
      selectedTargetKind: "folder",
      selection: "undone"
    }, now);

    expect(service.inferCandidates(now)).toEqual([]);
  });

  it("presents a pending candidate at most weekly and suppresses dismissal for 90 days", () => {
    const service = new HabitLearningService();
    const detectedAt = new Date("2026-07-05T00:00:00.000Z");
    addRouteEvents(service, [
      ["2026-07-01T10:00:00.000Z", "target-a"],
      ["2026-07-01T10:10:00.000Z", "target-a"],
      ["2026-07-02T10:00:00.000Z", "target-a"],
      ["2026-07-03T10:00:00.000Z", "target-a"],
      ["2026-07-03T11:00:00.000Z", "target-b"]
    ], detectedAt);
    const [candidate] = service.inferCandidates(detectedAt);

    service.markCandidatePresented(candidate.id, detectedAt);
    expect(service.getPresentablePendingCandidates(new Date("2026-07-11T23:59:59.999Z"))).toEqual([]);
    expect(service.getPresentablePendingCandidates(new Date("2026-07-12T00:00:00.000Z"))).toHaveLength(1);

    service.dismissCandidate(candidate.id, detectedAt);
    service.inferCandidates(new Date("2026-07-20T00:00:00.000Z"));
    expect(service.getCandidates()[0].status).toBe("dismissed");
    expect(service.getPresentablePendingCandidates(new Date("2026-07-20T00:00:00.000Z"))).toEqual([]);
  });

  it("revives a dismissed candidate when evidence materially changes", () => {
    const service = new HabitLearningService();
    const detectedAt = new Date("2026-07-05T00:00:00.000Z");
    addRouteEvents(service, [
      ["2026-07-01T10:00:00.000Z", "target-a"],
      ["2026-07-01T10:10:00.000Z", "target-a"],
      ["2026-07-02T10:00:00.000Z", "target-a"],
      ["2026-07-03T10:00:00.000Z", "target-a"],
      ["2026-07-03T11:00:00.000Z", "target-b"]
    ], detectedAt);
    const [candidate] = service.inferCandidates(detectedAt);
    service.dismissCandidate(candidate.id, detectedAt);

    addRouteEvents(service, [
      ["2026-07-06T10:00:00.000Z", "target-a"],
      ["2026-07-07T10:00:00.000Z", "target-a"],
      ["2026-07-08T10:00:00.000Z", "target-a"],
      ["2026-07-09T10:00:00.000Z", "target-a"],
      ["2026-07-10T10:00:00.000Z", "target-a"]
    ], new Date("2026-07-11T00:00:00.000Z"), 5);
    service.inferCandidates(new Date("2026-07-11T00:00:00.000Z"));
    expect(service.getCandidates()[0].status).toBe("pending");
    expect(service.getCandidates()[0]).not.toHaveProperty("dismissedAt");
  });

  it("allows a still-detected pattern to return after the 90-day suppression expires", () => {
    const service = new HabitLearningService();
    const detectedAt = new Date("2026-07-05T00:00:00.000Z");
    addRouteEvents(service, [
      ["2026-07-01T10:00:00.000Z", "target-a"],
      ["2026-07-01T10:10:00.000Z", "target-a"],
      ["2026-07-02T10:00:00.000Z", "target-a"],
      ["2026-07-03T10:00:00.000Z", "target-a"],
      ["2026-07-03T11:00:00.000Z", "target-b"]
    ], detectedAt);
    const [candidate] = service.inferCandidates(detectedAt);
    service.dismissCandidate(candidate.id, detectedAt);

    const afterSuppression = new Date("2026-10-10T00:00:00.000Z");
    addRouteEvents(service, [
      ["2026-10-06T10:00:00.000Z", "target-a"],
      ["2026-10-06T10:10:00.000Z", "target-a"],
      ["2026-10-07T10:00:00.000Z", "target-a"],
      ["2026-10-08T10:00:00.000Z", "target-a"],
      ["2026-10-08T11:00:00.000Z", "target-b"]
    ], afterSuppression, 10);
    service.inferCandidates(afterSuppression);

    expect(service.getCandidates()[0].status).toBe("pending");
  });

  it("pauses collection, exports readable files, rewrites copy without accepting, and clears all state", () => {
    const service = new HabitLearningService();
    service.setCollectionPaused(true);
    expect(service.recordEvent(fileInput("ignored", "2026-07-01T00:00:00.000Z"), new Date("2026-07-02T00:00:00.000Z"))).toBeUndefined();
    service.setCollectionPaused(false);
    service.recordEvent(fileInput("saved", "2026-07-01T00:00:00.000Z"), new Date("2026-07-02T00:00:00.000Z"));

    const bundle = service.exportBundle(new Date("2026-07-02T00:00:00.000Z"));
    expect(bundle.files).toEqual({ events: "learning/events.jsonl", habits: "learning/habits.json" });
    expect(JSON.parse(bundle.eventsJsonl)).toMatchObject({ id: "saved", kind: "edit-presence" });
    expect(JSON.parse(bundle.habitsJson)).toMatchObject({ collectionPaused: false, candidates: [], accepted: [], dismissed: [] });

    service.clearLearningData();
    expect(service.getState()).toMatchObject({ events: [], habits: [], collectionPaused: false });
  });
});

function fileInput(id: string, at: string): NewActivityEvent {
  return {
    id,
    kind: "edit-presence",
    at,
    timezoneOffsetMinutes: 0,
    filePath: "Projects/A.md",
    articleTypeId: "project",
    workflowStageId: "processing"
  };
}

function fileEvent(id: string, kind: "file-switched" | "edit-presence", at: string, filePath: string) {
  return {
    id,
    kind,
    at,
    timezoneOffsetMinutes: 0,
    filePath,
    articleTypeId: "project",
    workflowStageId: "processing"
  } as const;
}

function addRouteEvents(
  service: HabitLearningService,
  samples: Array<[string, string]>,
  now: Date,
  idOffset = 0
): void {
  samples.forEach(([at, selectedTargetId], index) => {
    service.recordEvent({
      id: `route-${idOffset + index}`,
      kind: "capture-route",
      at,
      timezoneOffsetMinutes: 0,
      workflowStageId: "processing",
      entryPoint: "selection",
      selectedTargetId,
      selectedTargetKind: "folder",
      suggestedTargetId: "target-a",
      selection: selectedTargetId === "target-a" ? "accepted" : "reselected"
    }, now);
  });
}
