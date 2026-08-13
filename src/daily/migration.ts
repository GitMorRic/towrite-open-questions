import { contentHash128 } from "../core/hash";
import type { DailyPlanItem, DailyTaskRevision } from "./types";

/**
 * Historical Daily ids are only unique inside their original date scope.
 * Keep the source date and logical-block revision in every UI/service key so
 * an id reused on another day cannot select or validate the wrong task.
 */
export function dailyMigrationSelectionKey(
  item: { id: string; revision: DailyTaskRevision }
): string {
  return `${item.revision.date ?? ""}\u0000${item.id}\u0000${item.revision.value}`;
}

export interface DailyMigrationDestinationPlan {
  item: DailyPlanItem;
  destinationId: string;
}

/**
 * Reserves every destination id before a migration batch starts mutating its
 * source notes. The first source may retain its id when that id is unused in
 * the target date. Reused historical ids receive a deterministic, valid Daily
 * id derived from their date-scoped identity, even when their content matches.
 */
export function planDailyMigrationDestinations(
  items: readonly DailyPlanItem[],
  destinationItems: readonly Pick<DailyPlanItem, "id">[],
  destinationDate: string
): DailyMigrationDestinationPlan[] {
  const occupied = new Set(destinationItems.map((item) => item.id));
  return items.map((item) => {
    let destinationId = item.id;
    if (occupied.has(destinationId)) {
      const identity = `${destinationDate}\u0000${dailyMigrationSelectionKey(item)}`;
      let attempt = 0;
      do {
        destinationId = `daily_${contentHash128(`${identity}\u0000${attempt}`)}`;
        attempt += 1;
      } while (occupied.has(destinationId));
    }
    occupied.add(destinationId);
    return { item, destinationId };
  });
}

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
