import { describe, expect, it } from "vitest";
import type { TaskPoolItem } from "../daily/task-pool-types";
import { floatingTaskPoolSummary } from "./today-floating-state";

describe("today floating task pool", () => {
  it("shows available and returned tasks while retaining lifecycle counts", () => {
    const result = floatingTaskPoolSummary([
      item("a", "稍后", "pool"),
      item("b", "已安排", "planned"),
      item("c", "已完成", "done"),
      item("d", "先做", "returned", "2026-07-30")
    ]);

    expect(result.available.map((entry) => entry.taskId)).toEqual([
      `task_${"d".repeat(32)}`,
      `task_${"a".repeat(32)}`
    ]);
    expect(result.availableCount).toBe(2);
    expect(result.planned).toBe(1);
    expect(result.done).toBe(1);
  });
});

function item(
  suffix: string,
  text: string,
  state: TaskPoolItem["state"],
  dueDate?: string
): TaskPoolItem {
  const taskId = `task_${suffix.repeat(32)}`;
  return {
    schemaVersion: 1,
    id: taskId,
    taskId,
    text,
    state,
    sourcePath: "Planning/Task Pool.md",
    line: 1,
    endLine: 2,
    rawLine: `- [ ] ${text}`,
    rawBlock: `- [ ] ${text}\n  ^${taskId}`,
    revision: {
      value: `rev_${suffix}`,
      sourcePath: "Planning/Task Pool.md",
      taskId
    },
    unknownLines: [],
    dueDate
  };
}
