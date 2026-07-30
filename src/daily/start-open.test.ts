import { describe, expect, it, vi } from "vitest";
import type { DailyPlanItem } from "./types";
import type { DailyTaskTimingSnapshot } from "./task-timer-types";
import { executeDailyStartAndOpen } from "./start-open";

function item(revision = "rev_1", status: DailyPlanItem["status"] = "todo"): DailyPlanItem {
  return {
    schemaVersion: 1,
    id: "daily_echo",
    blockId: "daily_echo",
    date: "2026-07-27",
    text: "Echo",
    kind: "edit_note",
    status,
    done: status === "done",
    revision: {
      value: revision,
      sourcePath: "Daily/2026-07-27.md",
      blockId: "daily_echo",
      date: "2026-07-27"
    },
    sourcePath: "Daily/2026-07-27.md",
    rawLine: "- [ ] Echo",
    line: 2,
    tags: [],
    linkedNotes: [],
    devicePolicy: "rotation",
    scheduledDate: "2026-07-27",
    dueDate: "2026-07-27",
    dueDateExplicit: false,
    lineageRevision: "dlr_1"
  };
}

function timing(status: DailyTaskTimingSnapshot["status"]): DailyTaskTimingSnapshot {
  return {
    schemaVersion: 1,
    taskId: "daily_echo",
    status,
    timingRevision: `timing_${status}`,
    activeMs: 0,
    wallMs: 0,
    interruptionCount: 0,
    dailyActiveMs: {},
    needsReview: false,
    reviewReasons: []
  };
}

describe("executeDailyStartAndOpen", () => {
  it("opens the new revision returned by start, never the stale frozen item", async () => {
    const frozen = item();
    const started = item("rev_2", "in-progress");
    const open = vi.fn(async () => undefined);
    const start = vi.fn(async () => started);
    await executeDailyStartAndOpen(frozen, {
      loadCurrent: async () => frozen,
      getTiming: async () => timing("not-started"),
      start,
      open
    });
    expect(start).toHaveBeenCalledWith(frozen, expect.objectContaining({ status: "not-started" }));
    expect(open).toHaveBeenCalledWith(started);
  });

  it("opens a running item without another transition", async () => {
    const running = item("rev_2", "in-progress");
    const start = vi.fn();
    const open = vi.fn(async () => undefined);
    await executeDailyStartAndOpen(running, {
      loadCurrent: async () => running,
      getTiming: async () => timing("running"),
      start,
      open
    });
    expect(start).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(running);
  });

  it("does not open when the task or lineage revision changed", async () => {
    const frozen = item();
    const open = vi.fn();
    await expect(executeDailyStartAndOpen(frozen, {
      loadCurrent: async () => item("rev_changed"),
      getTiming: async () => timing("not-started"),
      start: vi.fn(),
      open
    })).rejects.toMatchObject({ code: "revision-changed" });
    expect(open).not.toHaveBeenCalled();
  });

  it("does not open when starting fails", async () => {
    const frozen = item();
    const open = vi.fn();
    await expect(executeDailyStartAndOpen(frozen, {
      loadCurrent: async () => frozen,
      getTiming: async () => timing("paused"),
      start: async () => {
        throw new Error("CAS failed");
      },
      open
    })).rejects.toThrow("CAS failed");
    expect(open).not.toHaveBeenCalled();
  });
});
