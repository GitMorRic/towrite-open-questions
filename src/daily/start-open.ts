import { DailyPlanConflictError } from "./plan-service";
import type { DailyPlanItem } from "./types";
import type { DailyTaskTimingSnapshot } from "./task-timer-types";

export interface DailyStartOpenActions {
  loadCurrent(): Promise<DailyPlanItem | undefined>;
  getTiming(item: DailyPlanItem): Promise<DailyTaskTimingSnapshot>;
  start(item: DailyPlanItem, timing: DailyTaskTimingSnapshot): Promise<DailyPlanItem>;
  open(item: DailyPlanItem): Promise<void>;
}

/**
 * One-click contract used by the desktop widget: verify the frozen Markdown
 * item, start/resume it when needed, then open only the resulting revision.
 */
export async function executeDailyStartAndOpen(
  frozen: DailyPlanItem,
  actions: DailyStartOpenActions
): Promise<DailyPlanItem> {
  const current = await actions.loadCurrent();
  if (!current) {
    throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${frozen.id}`);
  }
  if (current.revision.value !== frozen.revision.value
    || (frozen.lineageRevision && current.lineageRevision !== frozen.lineageRevision)) {
    throw new DailyPlanConflictError(
      "revision-changed",
      "The Daily task or inherited target changed after the floating card was loaded."
    );
  }
  const timing = await actions.getTiming(current);
  const active = current.status !== "done" && timing.status !== "running"
    ? await actions.start(current, timing)
    : current;
  await actions.open(active);
  return active;
}
