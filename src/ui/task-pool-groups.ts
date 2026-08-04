import type { TaskPoolItem } from "../daily/task-pool-types";

export const TASK_POOL_UNCATEGORIZED = "未分类";

export interface TaskPoolCategoryTab {
  id: string;
  label: string;
  count: number;
}

export interface TaskPoolCategoryGroup extends TaskPoolCategoryTab {
  items: TaskPoolItem[];
}

/**
 * An explicit task category wins. A project is a useful fallback for older
 * items, while truly unclassified tasks stay visible in one predictable tab.
 */
export function taskPoolCategoryLabel(
  item: Pick<TaskPoolItem, "category" | "project">
): string {
  return item.category?.trim()
    || item.project?.replace(/^\[\[|\]\]$/gu, "").trim()
    || TASK_POOL_UNCATEGORIZED;
}

export function taskPoolCategoryTabs(
  items: readonly TaskPoolItem[]
): TaskPoolCategoryTab[] {
  return taskPoolCategoryGroups(items).map(({ id, label, count }) => ({
    id,
    label,
    count
  }));
}

export function taskPoolCategoryGroups(
  items: readonly TaskPoolItem[],
  selectedCategory = ""
): TaskPoolCategoryGroup[] {
  const groups = new Map<string, TaskPoolItem[]>();
  for (const item of items) {
    const label = taskPoolCategoryLabel(item);
    const current = groups.get(label) ?? [];
    current.push(item);
    groups.set(label, current);
  }
  return [...groups.entries()]
    .filter(([label]) => !selectedCategory || selectedCategory === label)
    .sort(([left], [right]) => {
      if (left === TASK_POOL_UNCATEGORIZED) return 1;
      if (right === TASK_POOL_UNCATEGORIZED) return -1;
      return left.localeCompare(right, "zh-CN");
    })
    .map(([label, groupItems]) => ({
      id: label,
      label,
      count: groupItems.length,
      items: groupItems
    }));
}
