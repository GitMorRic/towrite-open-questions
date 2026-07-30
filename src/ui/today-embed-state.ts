import type { DailyPlanItem } from "../daily/types";
import { selectDailyOverview } from "./daily-dashboard-state";

export interface TodayEmbedOptions {
  mode: "compact" | "list";
  limit: number;
  showCompleted: boolean;
}

const DEFAULT_OPTIONS: TodayEmbedOptions = {
  mode: "list",
  limit: 3,
  showCompleted: false
};

export function parseTodayEmbedOptions(source: string): TodayEmbedOptions {
  const options = { ...DEFAULT_OPTIONS };
  for (const rawLine of source.split(/\r?\n/u)) {
    const [rawKey, ...rawValue] = rawLine.split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = rawValue.join(":").trim().toLowerCase();
    if (key === "mode" && (value === "compact" || value === "list")) {
      options.mode = value;
    } else if (key === "limit") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) options.limit = Math.max(1, Math.min(6, parsed));
    } else if (key === "show-completed") {
      options.showCompleted = value === "true" || value === "yes" || value === "1";
    }
  }
  if (options.mode === "compact" && options.limit === DEFAULT_OPTIONS.limit) {
    options.limit = 1;
  }
  return options;
}

export function selectTodayEmbedItems(
  items: readonly DailyPlanItem[],
  options: TodayEmbedOptions
): DailyPlanItem[] {
  const overview = selectDailyOverview(items);
  const available = options.showCompleted
    ? [...items]
    : items.filter((item) => item.status !== "done");
  if (!overview.current) return available.slice(0, options.limit);
  return [
    overview.current,
    ...available.filter((item) => item.id !== overview.current?.id)
  ].slice(0, options.limit);
}

export function todayEmbedMarkdown(): string {
  return [
    "```towrite-today",
    "mode: list",
    "limit: 3",
    "```"
  ].join("\n");
}
