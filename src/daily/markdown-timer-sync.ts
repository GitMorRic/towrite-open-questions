import type { DailyPlanItem } from "./types";
import type { DailyTaskTimingStatus } from "./task-timer-types";

export type DailyMarkdownTimerOperation =
  | "start"
  | "pause"
  | "resume"
  | "complete"
  | "reopen";

/**
 * Markdown is the source of truth. This maps its three checkbox states onto
 * the append-only timer state machine. A completed task that is manually
 * changed straight to `[/]` needs both transitions, but they are committed in
 * one journal transaction so the intermediate paused state is never exposed.
 */
export function dailyMarkdownTimerOperations(
  markdownStatus: DailyPlanItem["status"],
  timingStatus: DailyTaskTimingStatus
): DailyMarkdownTimerOperation[] {
  if (markdownStatus === "done") {
    // Completing a never-started checkbox must not invent a zero-duration
    // session or completion timestamp in the runtime ledger.
    return timingStatus === "running" || timingStatus === "paused" ? ["complete"] : [];
  }
  if (markdownStatus === "in-progress") {
    if (timingStatus === "not-started") return ["start"];
    if (timingStatus === "paused") return ["resume"];
    if (timingStatus === "completed") return ["reopen", "resume"];
    return [];
  }
  if (timingStatus === "running") return ["pause"];
  if (timingStatus === "completed") return ["reopen"];
  return [];
}

export interface DailyMarkdownTimerEventIdentity {
  date: string;
  taskId: string;
  operation: DailyMarkdownTimerOperation;
  taskRevision: string;
  lineageRevision: string;
  timingRevision: string;
}

/**
 * The event identity intentionally includes the pre-transition timer revision.
 * Toggling the same checkbox back and forth therefore creates distinct events,
 * while retries of the same observed state reuse the exact event ID.
 */
export function dailyMarkdownTimerEventId(input: DailyMarkdownTimerEventIdentity): string {
  return [
    "evt_markdown",
    input.date,
    input.taskId,
    input.operation,
    input.taskRevision,
    input.lineageRevision,
    input.timingRevision
  ].join(":");
}

export function dailyMarkdownTimerTransactionId(eventIds: readonly string[]): string {
  if (eventIds.length === 0) throw new Error("A Markdown timer transaction requires an event.");
  return `txn_markdown:${eventIds.join("|")}`;
}

export function changedDailyMarkdownTimerTaskIds(
  previousItems: readonly Pick<DailyPlanItem, "id" | "date" | "sourcePath" | "status">[],
  currentItems: readonly Pick<DailyPlanItem, "id" | "date" | "sourcePath" | "status">[]
): Set<string> {
  const previousByIdentity = new Map(previousItems.map((item) => [
    `${item.sourcePath}\u0000${item.date}\u0000${item.id}`,
    item
  ]));
  return new Set(currentItems.flatMap((item) => {
    const previous = previousByIdentity.get(`${item.sourcePath}\u0000${item.date}\u0000${item.id}`);
    return previous && previous.status !== item.status ? [item.id] : [];
  }));
}

/**
 * Starting a new task automatically pauses the previously running timer. If
 * that older task's Daily Markdown was deleted or moved beyond the configured
 * plan source, there is no document left to coordinate. The append-only pause
 * event is still safe and prevents the orphaned timer from blocking all new
 * work. The requested task itself, and every non-pause transition, must still
 * have an exact Markdown revision.
 */
export function canSkipMissingDailyTimerMarkdownTask(input: {
  currentTaskId: string;
  affectedTaskId: string;
  desiredStatus: DailyPlanItem["status"] | undefined;
}): boolean {
  return input.affectedTaskId !== input.currentTaskId && input.desiredStatus === "todo";
}
