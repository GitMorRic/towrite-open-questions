import { describe, expect, it } from "vitest";
import { buildDailyAnalyticsRange, buildDailyMonthlySummary } from "./analytics";
import type { DailyDashboardSnapshot, DailyPlanItem } from "./types";
import type { DailyTaskTimingSnapshot, DailyTimerEvent } from "./task-timer-types";

describe("daily analytics", () => {
  it("combines plan completion, privacy-safe activity, and timer time by local day", () => {
    const timing = timingSnapshot("daily_a", {
      activeMs: 30 * 60_000,
      wallMs: 60 * 60_000,
      firstStartedAt: "2026-08-10T09:00:00+08:00",
      completedAt: "2026-08-10T10:00:00+08:00",
      dailyActiveMs: { "2026-08-10": 30 * 60_000 }
    });
    const events: DailyTimerEvent[] = [
      timerEvent("evt_start", "daily_a", "start", "2026-08-10T09:00:00+08:00"),
      timerEvent("evt_pause", "daily_a", "pause", "2026-08-10T09:30:00+08:00"),
      timerEvent("evt_complete", "daily_a", "complete", "2026-08-10T10:00:00+08:00")
    ];
    const result = buildDailyAnalyticsRange([
      { snapshot: snapshot("2026-08-10", [item("daily_a", true, "项目")]), timings: { daily_a: timing } }
    ], events, new Date("2026-08-10T12:00:00+08:00"));

    expect(result.days[0]).toMatchObject({
      planned: 1,
      completed: 1,
      completionRate: 1,
      activeMs: 30 * 60_000,
      wallMs: 60 * 60_000,
      pausedMs: 30 * 60_000,
      interruptions: 1,
      positiveWritingUnits: 120
    });
    expect(result.byCategory).toEqual([
      { id: "项目", label: "项目", planned: 1, completed: 1, activeMs: 30 * 60_000 }
    ]);
  });

  it("builds a natural-month summary and preserves incomplete-data warnings", () => {
    const august = snapshot("2026-08-01", [item("daily_aug", false)]);
    august.activity.trackingComplete = false;
    const july = snapshot("2026-07-31", [item("daily_jul", true)]);
    const result = buildDailyMonthlySummary("2026-08", [
      { snapshot: july, timings: {} },
      { snapshot: august, timings: {} }
    ], [], new Date("2026-08-10T12:00:00+08:00"));
    expect(result.days.map((day) => day.date)).toEqual(["2026-08-01"]);
    expect(result.totals.trackingComplete).toBe(false);
  });
});

function snapshot(date: string, items: DailyPlanItem[]): DailyDashboardSnapshot {
  return {
    schemaVersion: 1,
    date,
    plan: {
      items,
      total: items.length,
      todo: items.filter((entry) => !entry.done).length,
      inProgress: 0,
      done: items.filter((entry) => entry.done).length
    },
    activity: {
      date,
      positiveWritingUnits: 120,
      netWritingUnits: 80,
      notesCreated: 1,
      notesModified: 2,
      tasksCompleted: items.filter((entry) => entry.done).length,
      questionsResolved: 0,
      capturesCommitted: 0,
      cardsSelected: 0,
      cardsDisplayed: 0,
      trackingComplete: true
    },
    summary: {
      schemaVersion: 1,
      date,
      generatedAt: `${date}T12:00:00.000Z`,
      headline: "",
      lines: [],
      markdown: "",
      metrics: {
        planned: items.length,
        completed: items.filter((entry) => entry.done).length,
        remaining: items.filter((entry) => !entry.done).length,
        positiveWritingUnits: 120,
        netWritingUnits: 80,
        notesCreated: 1,
        notesModified: 2
      }
    },
    trackingStartedAt: "2026-08-01T00:00:00.000Z"
  };
}

function item(id: string, done: boolean, category?: string): DailyPlanItem {
  return {
    schemaVersion: 1,
    id,
    blockId: id,
    date: "2026-08-10",
    text: id,
    kind: "task",
    status: done ? "done" : "todo",
    done,
    sourcePath: "Daily/2026-08-10.md",
    line: 1,
    rawLine: "",
    revision: { value: "rev", sourcePath: "Daily/2026-08-10.md", blockId: id },
    category,
    scheduledDate: "2026-08-10",
    scheduledDateExplicit: false,
    dueDate: "2026-08-10",
    dueDateExplicit: false,
    devicePolicy: "none",
    tags: [],
    linkedNotes: []
  };
}

function timingSnapshot(id: string, patch: Partial<DailyTaskTimingSnapshot>): DailyTaskTimingSnapshot {
  return {
    schemaVersion: 1,
    taskId: id,
    status: "completed",
    activeMs: 0,
    wallMs: 0,
    interruptionCount: 0,
    dailyActiveMs: {},
    needsReview: false,
    reviewReasons: [],
    timingRevision: "timer-rev",
    ...patch
  };
}

function timerEvent(
  eventId: string,
  taskId: string,
  kind: DailyTimerEvent["kind"],
  at: string
): DailyTimerEvent {
  return {
    schemaVersion: 1,
    eventId,
    taskId,
    sessionId: "ses_a",
    kind,
    at,
    source: "obsidian"
  };
}
