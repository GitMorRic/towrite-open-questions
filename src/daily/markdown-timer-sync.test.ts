import { describe, expect, it } from "vitest";
import {
  changedDailyMarkdownTimerTaskIds,
  dailyMarkdownTimerEventId,
  dailyMarkdownTimerOperations,
  dailyMarkdownTimerTransactionId
} from "./markdown-timer-sync";

describe("dailyMarkdownTimerOperations", () => {
  it("starts or resumes when Markdown is manually marked in progress", () => {
    expect(dailyMarkdownTimerOperations("in-progress", "not-started")).toEqual(["start"]);
    expect(dailyMarkdownTimerOperations("in-progress", "paused")).toEqual(["resume"]);
    expect(dailyMarkdownTimerOperations("in-progress", "running")).toEqual([]);
  });

  it("pauses a running task when Markdown returns to todo", () => {
    expect(dailyMarkdownTimerOperations("todo", "running")).toEqual(["pause"]);
    expect(dailyMarkdownTimerOperations("todo", "paused")).toEqual([]);
    expect(dailyMarkdownTimerOperations("todo", "not-started")).toEqual([]);
  });

  it("completes active tasks without inventing a session for never-started tasks", () => {
    expect(dailyMarkdownTimerOperations("done", "not-started")).toEqual([]);
    expect(dailyMarkdownTimerOperations("done", "running")).toEqual(["complete"]);
    expect(dailyMarkdownTimerOperations("done", "paused")).toEqual(["complete"]);
    expect(dailyMarkdownTimerOperations("done", "completed")).toEqual([]);
    expect(dailyMarkdownTimerOperations("todo", "completed")).toEqual(["reopen"]);
  });

  it("atomically reopens and resumes a completed task changed directly to [/]", () => {
    expect(dailyMarkdownTimerOperations("in-progress", "completed"))
      .toEqual(["reopen", "resume"]);
  });
});

describe("changedDailyMarkdownTimerTaskIds", () => {
  const task = {
    id: "daily_task",
    date: "2026-07-24",
    sourcePath: "Daily/2026-07-24.md",
    status: "todo" as const
  };

  it("only reports checkbox transitions already observed in the same plan", () => {
    expect([...changedDailyMarkdownTimerTaskIds([task], [{ ...task, status: "in-progress" }])])
      .toEqual(["daily_task"]);
    expect([...changedDailyMarkdownTimerTaskIds([], [{ ...task, status: "done" }])])
      .toEqual([]);
    expect([...changedDailyMarkdownTimerTaskIds([task], [{ ...task }])])
      .toEqual([]);
  });

  it("does not compare tasks across dates or plan sources", () => {
    expect([...changedDailyMarkdownTimerTaskIds([task], [{
      ...task,
      date: "2026-07-25",
      status: "done"
    }])]).toEqual([]);
    expect([...changedDailyMarkdownTimerTaskIds([task], [{
      ...task,
      sourcePath: "Planning/Daily Plans.md",
      status: "done"
    }])]).toEqual([]);
  });
});

describe("dailyMarkdownTimerEventId", () => {
  const input = {
    date: "2026-07-24",
    taskId: "daily_0123456789abcdef",
    operation: "resume" as const,
    taskRevision: "dtr_task",
    lineageRevision: "dlr_parent",
    timingRevision: "tmr_before"
  };

  it("is deterministic for a repeated debounced refresh", () => {
    expect(dailyMarkdownTimerEventId(input)).toBe(dailyMarkdownTimerEventId({ ...input }));
  });

  it("changes after another timer transition even when Markdown returns to the same text", () => {
    expect(dailyMarkdownTimerEventId(input))
      .not.toBe(dailyMarkdownTimerEventId({ ...input, timingRevision: "tmr_after" }));
  });

  it("builds a deterministic transaction identity from its events", () => {
    const first = dailyMarkdownTimerEventId(input);
    const second = dailyMarkdownTimerEventId({
      ...input,
      operation: "pause",
      timingRevision: "tmr_after"
    });
    expect(dailyMarkdownTimerTransactionId([first, second]))
      .toBe(dailyMarkdownTimerTransactionId([first, second]));
  });
});
