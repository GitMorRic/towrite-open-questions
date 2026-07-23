import type { DailyDevicePolicy, DailyPlanPriority } from "./types";

export interface DailyDeviceScoringInput {
  devicePolicy: DailyDevicePolicy;
  priority?: DailyPlanPriority;
  scheduledFor?: string;
}

/**
 * Deterministic Daily candidate order:
 * explicitly fixed, due schedule, future schedule, high-priority opt-in,
 * ordinary Agent items, then rotation. A `none` policy remains ineligible in
 * the adapter; priority never opts an item into delivery by itself.
 */
export function dailyDeviceScore(item: DailyDeviceScoringInput, nowMs = Date.now()): number {
  if (item.devicePolicy === "manual") return 1;
  if (item.devicePolicy === "scheduled") {
    const scheduled = Date.parse(item.scheduledFor ?? "");
    return Number.isFinite(scheduled) && scheduled <= nowMs ? 0.98 : 0.9;
  }
  const highPriority = item.priority === "highest" || item.priority === "high";
  if (item.devicePolicy === "agent") return highPriority ? 0.86 : item.priority === "low" || item.priority === "lowest" ? 0.64 : 0.72;
  if (item.devicePolicy === "rotation") return highPriority ? 0.82 : item.priority === "low" || item.priority === "lowest" ? 0.45 : 0.55;
  return 0.2;
}

/** Keeps Tasks priority metadata when the Backend rewrites task text. */
export function dailyTaskTextForBackend(
  text: string,
  priority: DailyPlanPriority | undefined,
  explicit: boolean | undefined
): string {
  const clean = text
    .replace(/(?:^|\s)(?:🔺|⏫|🔼|🔽|⏬)(?=\s|$)/gu, " ")
    .replace(/\s{2,}/gu, " ")
    .trim();
  const marker = priority === "highest"
    ? "🔺"
    : priority === "high"
      ? "⏫"
      : priority === "low"
        ? "🔽"
        : priority === "lowest"
          ? "⏬"
          : explicit
            ? "🔼"
            : "";
  return marker ? `${clean} ${marker}` : clean;
}
