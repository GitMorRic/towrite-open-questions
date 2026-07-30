import { describe, expect, it } from "vitest";
import { DailyTaskTimerService } from "../daily";
import {
  deriveNoteTaskTiming,
  noteTaskTimingReconciliationAction
} from "./note-task-timing";

const taskId = `task_${"a".repeat(32)}`;

describe("ordinary note task derived timing", () => {
  it("separates active work, full span, and paused waiting", () => {
    const timer = new DailyTaskTimerService([], {
      createId: (() => {
        let id = 0;
        return (prefix) => `${prefix}_${++id}`;
      })()
    });
    timer.start(taskId, { at: "2026-07-29T09:00:00+08:00" });
    timer.pause(taskId, { at: "2026-07-29T09:30:00+08:00" });
    timer.resume(taskId, { at: "2026-07-29T10:00:00+08:00" });
    timer.complete(taskId, { at: "2026-07-29T10:45:00+08:00" });

    const timing = timer.getSnapshot(taskId, undefined, "2026-07-29T10:45:00+08:00");
    const derived = deriveNoteTaskTiming(timing, {
      expectedFinishAt: "2026-07-29T10:15",
      deadlineAt: "2026-07-29T10:30"
    }, Date.parse("2026-07-29T10:45:00+08:00"));

    expect(timing.activeMs).toBe(75 * 60_000);
    expect(derived.spanMs).toBe(105 * 60_000);
    expect(derived.inactiveMs).toBe(30 * 60_000);
    expect(derived.scheduleDelayMs).toBe(30 * 60_000);
    expect(derived.overdueMs).toBe(15 * 60_000);
    expect(timing.interruptionCount).toBe(1);
  });

  it("derives current stagnation from a missed plan or paused transition", () => {
    const timer = new DailyTaskTimerService();
    const notStarted = timer.getSnapshot(taskId, undefined, "2026-07-29T10:00:00+08:00");
    expect(deriveNoteTaskTiming(notStarted, {
      plannedStartAt: "2026-07-29T09:30",
      expectedFinishAt: "2026-07-29T09:45"
    }, Date.parse("2026-07-29T10:00:00+08:00"))).toMatchObject({
      stalledMs: 30 * 60_000,
      scheduleDelayMs: 15 * 60_000
    });

    timer.start(taskId, { at: "2026-07-29T10:00:00+08:00" });
    timer.pause(taskId, { at: "2026-07-29T10:15:00+08:00" });
    const paused = timer.getSnapshot(taskId, undefined, "2026-07-29T10:45:00+08:00");
    expect(deriveNoteTaskTiming(paused, {}, Date.parse("2026-07-29T10:45:00+08:00")).stalledMs)
      .toBe(30 * 60_000);
  });

  it("repairs manual completion and reopening without treating pause as a checkbox state", () => {
    expect(noteTaskTimingReconciliationAction("done", "running")).toBe("complete");
    expect(noteTaskTimingReconciliationAction("done", "not-started")).toBe("complete");
    expect(noteTaskTimingReconciliationAction("todo", "completed")).toBe("reopen");
    expect(noteTaskTimingReconciliationAction("in-progress", "completed")).toBe("reopen");
    expect(noteTaskTimingReconciliationAction("todo", "paused")).toBeUndefined();
  });
});
