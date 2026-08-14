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

export interface DailyMigrationDuplicateGroup {
  key: string;
  sourceItems: DailyPlanItem[];
  destinationItem?: DailyPlanItem;
}

export interface DailyMigrationMergeUnit {
  items: DailyPlanItem[];
  destinationItem?: DailyPlanItem;
}

export interface DailyMigrationPreview {
  selectedCount: number;
  destinationCount: number;
  createCount: number;
  mergeIntoExistingCount: number;
  consolidatedSourceCount: number;
  units: DailyMigrationMergeUnit[];
}

/**
 * Returns a conservative task-intent fingerprint. Task Pool projections are
 * deliberately excluded because their canonical assignment must be resolved
 * by the pool service rather than by Daily-text de-duplication.
 */
export function dailyMigrationExactMergeKey(item: DailyPlanItem): string | undefined {
  if (item.taskRef) return undefined;
  const normalize = (value: string | undefined): string => value?.replace(/\s+/gu, " ").trim().toLocaleLowerCase() ?? "";
  return contentHash128(JSON.stringify({
    text: normalize(item.text),
    kind: item.kind,
    category: normalize(item.category),
    workKind: item.workKind ?? "",
    workRef: normalize(item.workRef),
    workRevision: item.workRevision ?? "",
    devicePolicy: item.devicePolicy,
    scheduledFor: item.scheduledFor ?? "",
    dueDate: item.dueDateExplicit ? item.dueDate : "",
    estimateMinutes: item.estimateMinutes ?? null,
    target: normalize(item.target),
    desktopActionId: normalize(item.desktopActionId),
    goal: normalize(item.goal),
    nextStep: normalize(item.nextStep),
    priority: item.priority ?? "normal",
    tags: [...item.tags].map(normalize).sort(),
    primary: Boolean(item.primary),
    minimum: Boolean(item.minimum)
  }));
}

/**
 * Previews exact duplicate groups before any Markdown is changed. A group is
 * actionable when at least two historical items match, or when one historical
 * item already has an exact counterpart in the destination day.
 */
export function analyzeDailyMigrationDuplicates(
  sourceItems: readonly DailyPlanItem[],
  destinationItems: readonly DailyPlanItem[] = []
): DailyMigrationDuplicateGroup[] {
  const sources = new Map<string, DailyPlanItem[]>();
  const destinations = new Map<string, DailyPlanItem[]>();
  for (const item of sourceItems) {
    const key = dailyMigrationExactMergeKey(item);
    if (!key) continue;
    const bucket = sources.get(key) ?? [];
    bucket.push(item);
    sources.set(key, bucket);
  }
  for (const item of destinationItems) {
    // An unfinished carry-over must never disappear into a completed task
    // merely because the visible text and metadata happen to match.
    if (item.status === "done") continue;
    const key = dailyMigrationExactMergeKey(item);
    if (!key) continue;
    const bucket = destinations.get(key) ?? [];
    bucket.push(item);
    destinations.set(key, bucket);
  }
  return [...sources.entries()]
    .filter(([key, items]) => {
      const destinationCount = destinations.get(key)?.length ?? 0;
      return destinationCount <= 1 && (items.length > 1 || destinationCount === 1);
    })
    .map(([key, items]) => ({
      key,
      sourceItems: items,
      // More than one matching destination is already ambiguous. Surface the
      // source group, but do not claim that it has one safe merge target.
      destinationItem: destinations.get(key)?.length === 1 ? destinations.get(key)![0] : undefined
    }));
}

/** Builds stable execution units for the optional exact-duplicate mode. */
export function planDailyMigrationMergeUnits(
  sourceItems: readonly DailyPlanItem[],
  destinationItems: readonly DailyPlanItem[],
  mergeExactDuplicates: boolean
): DailyMigrationMergeUnit[] {
  if (!mergeExactDuplicates) return sourceItems.map((item) => ({ items: [item] }));
  const groups = new Map(analyzeDailyMigrationDuplicates(sourceItems, destinationItems)
    .map((group) => [group.key, group]));
  const seen = new Set<string>();
  const units: DailyMigrationMergeUnit[] = [];
  for (const item of sourceItems) {
    const key = dailyMigrationExactMergeKey(item);
    const group = key ? groups.get(key) : undefined;
    if (!group) {
      units.push({ items: [item] });
      continue;
    }
    if (seen.has(key!)) continue;
    seen.add(key!);
    units.push({ items: group.sourceItems, destinationItem: group.destinationItem });
  }
  return units;
}

/** Stable identity shared by preview editing and revision-guarded execution. */
export function dailyMigrationMergeUnitKey(unit: DailyMigrationMergeUnit): string {
  const destination = unit.destinationItem
    ? dailyMigrationSelectionKey(unit.destinationItem)
    : "";
  const sources = unit.items.map(dailyMigrationSelectionKey).sort().join("\u0001");
  return `migration_unit_${contentHash128(`${destination}\u0000${sources}`)}`;
}

/** Applies a partial preferred order while retaining every unmentioned unit. */
export function orderDailyMigrationMergeUnits(
  units: readonly DailyMigrationMergeUnit[],
  preferredOrder: readonly string[] = []
): DailyMigrationMergeUnit[] {
  if (preferredOrder.length === 0) return [...units];
  const byKey = new Map(units.map((unit) => [dailyMigrationMergeUnitKey(unit), unit]));
  const seen = new Set<string>();
  const ordered: DailyMigrationMergeUnit[] = [];
  for (const key of preferredOrder) {
    if (seen.has(key)) continue;
    const unit = byKey.get(key);
    if (!unit) continue;
    seen.add(key);
    ordered.push(unit);
  }
  for (const unit of units) {
    const key = dailyMigrationMergeUnitKey(unit);
    if (!seen.has(key)) ordered.push(unit);
  }
  return ordered;
}

/**
 * Uses the execution planner itself to describe the exact post-migration
 * effect. Keeping preview and write planning on one path prevents the UI from
 * promising a merge that the migration service would execute differently.
 */
export function buildDailyMigrationPreview(
  sourceItems: readonly DailyPlanItem[],
  destinationItems: readonly DailyPlanItem[],
  mergeExactDuplicates: boolean
): DailyMigrationPreview {
  const units = planDailyMigrationMergeUnits(sourceItems, destinationItems, mergeExactDuplicates);
  const createCount = units.filter((unit) => !unit.destinationItem).length;
  return {
    selectedCount: sourceItems.length,
    destinationCount: units.length,
    createCount,
    mergeIntoExistingCount: units.length - createCount,
    consolidatedSourceCount: sourceItems.length - createCount,
    units
  };
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
