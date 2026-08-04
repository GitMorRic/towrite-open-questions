import { describe, expect, it } from "vitest";
import type { TaskPoolItem } from "../daily/task-pool-types";
import {
  TASK_POOL_UNCATEGORIZED,
  taskPoolCategoryGroups,
  taskPoolCategoryLabel,
  taskPoolCategoryTabs
} from "./task-pool-groups";

describe("task pool category groups", () => {
  it("uses explicit category, then project, then the unclassified fallback", () => {
    expect(taskPoolCategoryLabel(item("a", "项目", "[[Echo]]"))).toBe("项目");
    expect(taskPoolCategoryLabel(item("b", undefined, "[[Echo]]"))).toBe("Echo");
    expect(taskPoolCategoryLabel(item("c"))).toBe(TASK_POOL_UNCATEGORIZED);
  });

  it("builds stable tabs and supports one selected collapsible group", () => {
    const items = [
      item("a", "写作"),
      item("b", "项目"),
      item("c", "写作"),
      item("d")
    ];
    expect(taskPoolCategoryTabs(items)).toEqual([
      { id: "项目", label: "项目", count: 1 },
      { id: "写作", label: "写作", count: 2 },
      { id: "未分类", label: "未分类", count: 1 }
    ]);
    expect(taskPoolCategoryGroups(items, "写作")[0].items).toHaveLength(2);
  });
});

function item(suffix: string, category?: string, project?: string): TaskPoolItem {
  const taskId = `task_${suffix.repeat(32)}`;
  return {
    schemaVersion: 1,
    id: taskId,
    taskId,
    text: suffix,
    state: "pool",
    sourcePath: "Planning/Task Pool.md",
    line: 1,
    endLine: 2,
    rawLine: `- [ ] ${suffix}`,
    rawBlock: `- [ ] ${suffix}\n  ^${taskId}`,
    revision: { value: `rev_${suffix}`, sourcePath: "Planning/Task Pool.md", taskId },
    unknownLines: [],
    category,
    project
  };
}
