import type { DailyTimerEvent, DailyTaskTimingSnapshot } from "./task-timer-types";
import type {
  DailyAnalyticsBreakdown,
  DailyAnalyticsDay,
  DailyAnalyticsRange,
  DailyDashboardSnapshot,
  DailyMonthlySummary,
  DailyPlanItem
} from "./types";

export interface DailyAnalyticsInputDay {
  snapshot: DailyDashboardSnapshot;
  timings: Readonly<Record<string, DailyTaskTimingSnapshot>>;
}

/**
 * Builds content-free review statistics from the Markdown plan snapshots and
 * the append-only timer ledger. No note body or task keystroke is required.
 */
export function buildDailyAnalyticsRange(
  days: readonly DailyAnalyticsInputDay[],
  timerEvents: readonly DailyTimerEvent[],
  now = new Date()
): DailyAnalyticsRange {
  const ordered = [...days].sort((left, right) =>
    left.snapshot.date.localeCompare(right.snapshot.date)
  );
  const effectiveEvents = normalizeEffectiveEvents(timerEvents);
  const byCategory = new Map<string, DailyAnalyticsBreakdown>();
  const dayRows = ordered.map(({ snapshot, timings }) => {
    for (const item of snapshot.plan.items) addCategory(byCategory, item, timings[item.id]);
    return buildDay(snapshot, timings, effectiveEvents, now);
  });
  const planned = sum(dayRows, (day) => day.planned);
  const completed = sum(dayRows, (day) => day.completed);
  const firstStartedAt = firstIso(dayRows.map((day) => day.firstStartedAt));
  const lastCompletedAt = lastIso(dayRows.map((day) => day.lastCompletedAt));
  return {
    schemaVersion: 1,
    from: dayRows[0]?.date ?? localDateKey(now),
    to: dayRows.at(-1)?.date ?? localDateKey(now),
    generatedAt: now.toISOString(),
    days: dayRows,
    totals: {
      planned,
      completed,
      completionRate: planned > 0 ? completed / planned : 0,
      activeMs: sum(dayRows, (day) => day.activeMs),
      wallMs: sum(dayRows, (day) => day.wallMs),
      pausedMs: sum(dayRows, (day) => day.pausedMs),
      interruptions: sum(dayRows, (day) => day.interruptions),
      positiveWritingUnits: sum(dayRows, (day) => day.positiveWritingUnits),
      netWritingUnits: sum(dayRows, (day) => day.netWritingUnits),
      notesCreated: sum(dayRows, (day) => day.notesCreated),
      notesModified: sum(dayRows, (day) => day.notesModified),
      trackingComplete: dayRows.every((day) => day.trackingComplete),
      needsReview: dayRows.some((day) => day.needsReview),
      firstStartedAt,
      lastCompletedAt
    },
    byCategory: [...byCategory.values()].sort((left, right) =>
      right.activeMs - left.activeMs || right.planned - left.planned || left.label.localeCompare(right.label)
    )
  };
}

export function buildDailyMonthlySummary(
  month: string,
  days: readonly DailyAnalyticsInputDay[],
  timerEvents: readonly DailyTimerEvent[],
  now = new Date()
): DailyMonthlySummary {
  const normalizedMonth = /^\d{4}-\d{2}$/u.test(month) ? month : localDateKey(now).slice(0, 7);
  const result = buildDailyAnalyticsRange(
    days.filter((day) => day.snapshot.date.startsWith(`${normalizedMonth}-`)),
    timerEvents,
    now
  );
  return { ...result, month: normalizedMonth };
}

function buildDay(
  snapshot: DailyDashboardSnapshot,
  timings: Readonly<Record<string, DailyTaskTimingSnapshot>>,
  events: readonly DailyTimerEvent[],
  now: Date
): DailyAnalyticsDay {
  const date = snapshot.date;
  const itemIds = new Set(snapshot.plan.items.map((item) => item.id));
  const itemTimings = [...itemIds].map((id) => timings[id]).filter(Boolean);
  const relevantEvents = events.filter((event) => itemIds.has(event.taskId) && localDateKey(event.at) === date);
  const firstStartedAt = firstIso(itemTimings.map((timing) => timing.firstStartedAt)
    .filter((value) => value && localDateKey(value) === date));
  const lastCompletedAt = lastIso(itemTimings.map((timing) => timing.completedAt)
    .filter((value) => value && localDateKey(value) === date));
  const activeMs = sum(itemTimings, (timing) => timing.dailyActiveMs[date] ?? 0);
  const wallMs = sum(itemTimings, (timing) => clippedTaskWallMs(timing, date, now));
  const interruptions = relevantEvents.filter((event) => event.kind === "pause").length;
  const planned = snapshot.plan.total;
  const completed = snapshot.plan.done;
  return {
    date,
    planned,
    completed,
    completionRate: planned > 0 ? completed / planned : 0,
    firstStartedAt,
    lastCompletedAt,
    activeMs,
    wallMs,
    pausedMs: Math.max(0, wallMs - activeMs),
    interruptions,
    positiveWritingUnits: snapshot.activity.positiveWritingUnits,
    netWritingUnits: snapshot.activity.netWritingUnits,
    notesCreated: snapshot.activity.notesCreated,
    notesModified: snapshot.activity.notesModified,
    trackingComplete: snapshot.activity.trackingComplete,
    needsReview: itemTimings.some((timing) => timing.needsReview)
  };
}

function clippedTaskWallMs(timing: DailyTaskTimingSnapshot, date: string, now: Date): number {
  if (!timing.firstStartedAt) return 0;
  const [start, end] = localDayBounds(date);
  const taskStart = Date.parse(timing.firstStartedAt);
  const taskEnd = timing.completedAt ? Date.parse(timing.completedAt) : now.getTime();
  if (!Number.isFinite(taskStart) || !Number.isFinite(taskEnd)) return 0;
  return Math.max(0, Math.min(taskEnd, end) - Math.max(taskStart, start));
}

function addCategory(
  output: Map<string, DailyAnalyticsBreakdown>,
  item: DailyPlanItem,
  timing: DailyTaskTimingSnapshot | undefined
): void {
  const label = item.category?.trim()
    || item.lineage?.groups.at(-1)?.text?.trim()
    || "未分类";
  const id = label.toLocaleLowerCase();
  const current = output.get(id) ?? { id, label, planned: 0, completed: 0, activeMs: 0 };
  current.planned += 1;
  current.completed += item.done ? 1 : 0;
  current.activeMs += timing?.dailyActiveMs[item.date] ?? 0;
  output.set(id, current);
}

function normalizeEffectiveEvents(events: readonly DailyTimerEvent[]): DailyTimerEvent[] {
  const corrections = new Map<string, DailyTimerEvent>();
  for (const event of events) {
    if (event.kind === "correct" && event.targetEventId) corrections.set(event.targetEventId, event);
  }
  return events
    .filter((event) => event.kind !== "correct" && !corrections.get(event.eventId)?.invalidateTarget)
    .map((event) => {
      const replacementAt = corrections.get(event.eventId)?.replacementAt;
      return replacementAt ? { ...event, at: replacementAt } : { ...event };
    })
    .sort((left, right) => left.at.localeCompare(right.at) || left.eventId.localeCompare(right.eventId));
}

function localDayBounds(date: string): [number, number] {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start.getTime(), end.getTime()];
}

function localDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function firstIso(values: Array<string | undefined>): string | undefined {
  return values.filter((value): value is string => Boolean(value)).sort()[0];
}

function lastIso(values: Array<string | undefined>): string | undefined {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1);
}

function sum<T>(values: readonly T[], read: (value: T) => number): number {
  return values.reduce((total, value) => total + read(value), 0);
}
