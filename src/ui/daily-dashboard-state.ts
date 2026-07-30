import type {
  DailyDashboardSnapshot,
  DailyPlanGroup,
  DailyPlanHierarchy,
  DailyPlanItem,
  DailySummary
} from "../daily/types";
import type {
  DailyDueDateShortcut,
  DailyPlanItemPresentation,
  TaskPoolItem
} from "./daily-dashboard-types";

export type DailyPlanningDay = "today" | "tomorrow";

export interface DailyOverviewSelection {
  current?: DailyPlanItem;
  upcoming: DailyPlanItem[];
  done: number;
  total: number;
}

export interface DailyCalendarEntry {
  date: string;
  items: DailyPlanItemPresentation[];
}

export interface DailyItemGroupProjection {
  key: string;
  label: string;
  path?: string;
  group?: DailyPlanGroup;
  items: Array<{ item: DailyPlanItemPresentation; index: number }>;
}

/** Uses the user's local calendar rather than UTC, including around midnight. */
export function dailyDateForPlanningDay(
  day: DailyPlanningDay,
  now = new Date()
): string {
  const value = new Date(now);
  if (day === "tomorrow") value.setDate(value.getDate() + 1);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const date = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

/**
 * Selects the one task the overview should protect and only two following
 * tasks. Every item still contributes to progress and device task pages.
 */
export function selectDailyOverview(
  items: readonly DailyPlanItem[]
): DailyOverviewSelection {
  const unfinished = items.filter((item) => item.status !== "done");
  const current = unfinished.find((item) => item.status === "in-progress")
    ?? unfinished.find((item) => Boolean(item.primary))
    ?? unfinished[0];
  return {
    current,
    upcoming: current
      ? [current, ...unfinished.filter((item) => item.id !== current.id)].slice(1, 3)
      : [],
    done: items.filter((item) => item.status === "done").length,
    total: items.length
  };
}

/** Returns the explicit category, then the nearest Markdown group, without mutating the task. */
export function dailyItemCategory(item: DailyPlanItemPresentation): string {
  const explicit = item.category?.trim();
  if (explicit) return explicit;
  const group = item.lineage?.groups.at(-1);
  if (!group) return "未分类";
  return stripMarkdownLink(group.text).trim()
    || group.links[0]?.label
    || group.links[0]?.linkText
    || "未分类";
}

export function dailyItemDepth(item: DailyPlanItemPresentation): number {
  if (Number.isFinite(item.depth) && (item.depth ?? 0) >= 0) {
    return Math.floor(item.depth ?? 0);
  }
  return Math.max(0, (item.lineage?.groups.length ?? 1) - 1);
}

export function dailyCategories(items: readonly DailyPlanItemPresentation[]): string[] {
  return [...new Set(items.map(dailyItemCategory))].sort((left, right) =>
    left.localeCompare(right, "zh-CN")
  );
}

export function filterDailyItemsByCategory(
  items: readonly DailyPlanItemPresentation[],
  category: string
): DailyPlanItemPresentation[] {
  if (!category) return [...items];
  return items.filter((item) => dailyItemCategory(item) === category);
}

export function filterAvailableTaskPoolItems(
  items: readonly TaskPoolItem[],
  query = ""
): TaskPoolItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (item.state !== "pool" && item.state !== "returned") return false;
    if (!normalizedQuery) return true;
    return [item.text, item.category, item.project, item.target]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });
}

/**
 * Projects the Markdown hierarchy into stable Dashboard groups without
 * creating a second source of truth. Explicit category metadata wins over the
 * structural parent label, while row indexes continue to refer to Markdown
 * order even when the UI is filtered.
 */
export function groupDailyItems(
  visibleItems: readonly DailyPlanItemPresentation[],
  hierarchy?: Pick<DailyPlanHierarchy, "groups">,
  orderedItems: readonly DailyPlanItemPresentation[] = visibleItems
): DailyItemGroupProjection[] {
  const result: DailyItemGroupProjection[] = [];
  const byKey = new Map<string, DailyItemGroupProjection>();
  const orderById = new Map(orderedItems.map((item, index) => [item.id, index]));

  for (const item of visibleItems) {
    const groups = item.lineage?.groups ?? [];
    const group = groups.at(-1)
      ?? (item.groupId ? hierarchy?.groups.find((candidate) => candidate.id === item.groupId) : undefined);
    const explicitCategory = item.category?.trim();
    const key = explicitCategory ? `category:${explicitCategory}` : (group?.id ?? "__ungrouped");
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: explicitCategory || dailyGroupLabel(group),
        path: groups.length > 1 ? groups.map(dailyGroupLabel).join(" / ") : undefined,
        group,
        items: []
      };
      byKey.set(key, bucket);
      result.push(bucket);
    }
    bucket.items.push({ item, index: orderById.get(item.id) ?? 0 });
  }

  return result;
}

export function dailyGroupLabel(group: DailyPlanGroup | undefined): string {
  if (!group) return "未分类";
  return stripMarkdownLink(group.text).trim()
    || group.links[0]?.label
    || group.links[0]?.linkText
    || "未分类";
}

/** Date-only shortcuts deliberately use the local calendar, not UTC. */
export function dailyDueDateForShortcut(
  shortcut: DailyDueDateShortcut,
  now = new Date()
): string {
  if (shortcut === "clear") return "";
  const value = new Date(now);
  value.setHours(12, 0, 0, 0);
  if (shortcut === "tomorrow") {
    value.setDate(value.getDate() + 1);
  } else if (shortcut === "friday") {
    value.setDate(value.getDate() + ((5 - value.getDay() + 7) % 7));
  } else if (shortcut === "next-week") {
    value.setDate(value.getDate() + 7);
  }
  return localDate(value);
}

export function buildDailyCalendar(
  items: readonly DailyPlanItemPresentation[],
  fallbackDate: string
): DailyCalendarEntry[] {
  const byDate = new Map<string, DailyPlanItemPresentation[]>();
  for (const item of items) {
    const scheduledDate = item.scheduledFor?.slice(0, 10);
    const date = item.dueDate || scheduledDate || fallbackDate;
    const bucket = byDate.get(date) ?? [];
    bucket.push(item);
    byDate.set(date, bucket);
  }
  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, groupedItems]) => ({ date, items: groupedItems }));
}

/**
 * Stable identity for the data used to generate a Daily summary.
 *
 * `summary.generatedAt` is intentionally excluded because snapshots rebuild
 * deterministic copy on every read. Task content/revisions and every displayed
 * activity counter are included so an AI or rules draft cannot survive a
 * meaningful Today-state change.
 */
export function dailySnapshotFingerprint(snapshot: DailyDashboardSnapshot): string {
  return JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    date: snapshot.date,
    trackingStartedAt: snapshot.trackingStartedAt,
    plan: snapshot.plan.items.map(fingerprintPlanItem),
    activity: {
      date: snapshot.activity.date,
      positiveWritingUnits: snapshot.activity.positiveWritingUnits,
      netWritingUnits: snapshot.activity.netWritingUnits,
      notesCreated: snapshot.activity.notesCreated,
      notesModified: snapshot.activity.notesModified,
      tasksCompleted: snapshot.activity.tasksCompleted,
      questionsResolved: snapshot.activity.questionsResolved,
      capturesCommitted: snapshot.activity.capturesCommitted,
      cardsSelected: snapshot.activity.cardsSelected,
      cardsDisplayed: snapshot.activity.cardsDisplayed,
      trackingComplete: snapshot.activity.trackingComplete
    }
  });
}

/** Returns true only when a summary still describes the exact snapshot basis. */
export function isDailySummaryCurrent(
  summary: Pick<DailySummary, "date" | "metrics">,
  basisFingerprint: string,
  snapshot: DailyDashboardSnapshot
): boolean {
  if (!basisFingerprint || basisFingerprint !== dailySnapshotFingerprint(snapshot)) {
    return false;
  }
  if (summary.date !== snapshot.date) {
    return false;
  }
  const expected = snapshot.summary.metrics;
  const actual = summary.metrics;
  return actual.planned === expected.planned
    && actual.completed === expected.completed
    && actual.remaining === expected.remaining
    && actual.positiveWritingUnits === expected.positiveWritingUnits
    && actual.netWritingUnits === expected.netWritingUnits
    && actual.notesCreated === expected.notesCreated
    && actual.notesModified === expected.notesModified;
}

function fingerprintPlanItem(item: DailyPlanItem): Record<string, unknown> {
  return {
    id: item.id,
    revision: item.revision.value,
    text: item.text,
    kind: item.kind,
    status: item.status,
    devicePolicy: item.devicePolicy,
    scheduledFor: item.scheduledFor ?? "",
    dueDate: item.dueDate,
    tags: item.tags,
    primary: Boolean(item.primary),
    minimum: Boolean(item.minimum),
    goal: item.goal ?? "",
    nextStep: item.nextStep ?? "",
    estimateMinutes: item.estimateMinutes ?? 0,
    target: item.target ?? "",
    startedAt: item.startedAt ?? ""
  };
}

function localDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const date = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function stripMarkdownLink(value: string): string {
  return value
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/gu, (_match, target: string, alias?: string) =>
      alias?.trim() || target.trim()
    )
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1");
}
