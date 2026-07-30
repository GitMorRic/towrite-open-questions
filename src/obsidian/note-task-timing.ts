import type { DailyTaskTimingSnapshot } from "../daily";
import type { TrackedNoteTask } from "../daily";

export interface NoteTaskTimingPlan {
  plannedStartAt?: string;
  expectedFinishAt?: string;
  deadlineAt?: string;
}

export interface NoteTaskDerivedTiming {
  /** First actual start through completion or the supplied current time. */
  spanMs: number;
  /** Time in the span that was not actively being worked. */
  inactiveMs: number;
  /** Current paused time, or lateness in starting a scheduled unstarted task. */
  stalledMs: number;
  /** Time beyond the expected finish while the task is still incomplete. */
  scheduleDelayMs: number;
  /** Time past the DDL, using completion time when the task is done. */
  overdueMs: number;
}

export function deriveNoteTaskTiming(
  timing: DailyTaskTimingSnapshot,
  plan: NoteTaskTimingPlan = {},
  now = Date.now()
): NoteTaskDerivedTiming {
  const firstStarted = parseOptional(timing.firstStartedAt);
  const completed = parseOptional(timing.completedAt);
  const spanMs = firstStarted === undefined
    ? 0
    : Math.max(0, (completed ?? now) - firstStarted);
  const inactiveMs = Math.max(0, spanMs - timing.activeMs);

  let stalledMs = 0;
  if (timing.status === "paused") {
    const lastTransition = parseOptional(timing.lastTransitionAt);
    stalledMs = lastTransition === undefined ? 0 : Math.max(0, now - lastTransition);
  } else if (timing.status === "not-started") {
    const plannedStart = parseOptional(plan.plannedStartAt);
    stalledMs = plannedStart === undefined ? 0 : Math.max(0, now - plannedStart);
  }

  const expectedFinish = parseOptional(plan.expectedFinishAt);
  const scheduleDelayMs = expectedFinish === undefined
    ? 0
    : Math.max(0, (completed ?? now) - expectedFinish);

  const deadline = parseOptional(plan.deadlineAt);
  const overdueMs = deadline === undefined
    ? 0
    : Math.max(0, (completed ?? now) - deadline);

  return { spanMs, inactiveMs, stalledMs, scheduleDelayMs, overdueMs };
}

/**
 * Reconciles the completion checkbox with the append-only timer ledger.
 * Running/paused state deliberately remains a timer concern so an automatic
 * pause never has to rewrite an unrelated note merely to change `[ / ]`.
 */
export function noteTaskTimingReconciliationAction(
  markdownStatus: TrackedNoteTask["status"],
  timingStatus: DailyTaskTimingSnapshot["status"]
): "complete" | "reopen" | undefined {
  if (markdownStatus === "done" && timingStatus !== "completed") return "complete";
  if (markdownStatus !== "done" && timingStatus === "completed") return "reopen";
  return undefined;
}

function parseOptional(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
