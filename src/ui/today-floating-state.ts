import type { TaskPoolItem } from "../daily/task-pool-types";

export interface FloatingTaskPoolSummary {
  available: TaskPoolItem[];
  availableCount: number;
  planned: number;
  done: number;
}

export function floatingTaskPoolSummary(
  items: readonly TaskPoolItem[],
  limit = 20
): FloatingTaskPoolSummary {
  const available = items
    .filter((item) => item.state === "pool" || item.state === "returned")
    .sort((left, right) =>
      compareOptionalDate(left.dueDate, right.dueDate)
      || left.text.localeCompare(right.text, "zh-CN")
      || left.taskId.localeCompare(right.taskId)
    );
  return {
    available: available.slice(0, Math.max(0, limit)),
    availableCount: available.length,
    planned: items.filter((item) => item.state === "planned").length,
    done: items.filter((item) => item.state === "done").length
  };
}

function compareOptionalDate(left?: string, right?: string): number {
  if (left && right) return left.localeCompare(right);
  if (left) return -1;
  if (right) return 1;
  return 0;
}
