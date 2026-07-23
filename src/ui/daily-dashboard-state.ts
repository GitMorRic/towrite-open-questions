import type {
  DailyDashboardSnapshot,
  DailyPlanItem,
  DailySummary
} from "../daily/types";

export type DailyPlanningDay = "today" | "tomorrow";

export interface DailyOverviewSelection {
  current?: DailyPlanItem;
  upcoming: DailyPlanItem[];
  done: number;
  total: number;
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
