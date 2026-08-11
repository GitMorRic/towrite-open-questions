import type { DailyPlanItem } from "./types";

/**
 * Returns the unfinished tasks that can be migrated independently.
 * Structural parent tasks stay in the source document; their unfinished leaf
 * descendants carry the actionable work into the target day.
 */
export function unfinishedDailyLeafItems(
  items: readonly DailyPlanItem[]
): DailyPlanItem[] {
  const parentIds = new Set(items
    .map((item) => item.parentTaskId)
    .filter((id): id is string => Boolean(id)));
  return items.filter((item) => item.status !== "done" && !parentIds.has(item.id));
}

/**
 * Expands legacy parent selections into their unfinished leaf descendants.
 * The result is de-duplicated and keeps the source document order.
 */
export function expandDailyMigrationSelections(
  items: readonly DailyPlanItem[],
  selectedIds: ReadonlySet<string>
): DailyPlanItem[] {
  const childrenByParent = new Map<string, DailyPlanItem[]>();
  for (const item of items) {
    if (!item.parentTaskId) continue;
    const children = childrenByParent.get(item.parentTaskId) ?? [];
    children.push(item);
    childrenByParent.set(item.parentTaskId, children);
  }

  const selectedLeaves = new Set<string>();
  const visit = (item: DailyPlanItem, seen: Set<string>): void => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    const children = childrenByParent.get(item.id) ?? [];
    if (children.length === 0) {
      if (item.status !== "done") selectedLeaves.add(item.id);
      return;
    }
    for (const child of children) visit(child, seen);
  };

  const byId = new Map(items.map((item) => [item.id, item]));
  for (const id of selectedIds) {
    const selected = byId.get(id);
    if (selected) visit(selected, new Set());
  }
  return items.filter((item) => selectedLeaves.has(item.id));
}
