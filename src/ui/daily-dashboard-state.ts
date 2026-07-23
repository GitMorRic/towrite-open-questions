import type {
  DailyDashboardSnapshot,
  DailyPlanItem,
  DailySummary
} from "../daily/types";

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
    tags: item.tags
  };
}
