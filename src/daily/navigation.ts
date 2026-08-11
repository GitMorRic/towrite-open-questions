export type DailyPlanCacheInvalidation = "refresh" | "ignore";

/**
 * A tracked delete always causes an active-plan re-read. In particular,
 * deleting tomorrow's separate daily note must never clear today's cache.
 */
export function dailyPlanCacheInvalidationForPath(
  changedPath: string,
  todayPath: string,
  tomorrowPath: string
): DailyPlanCacheInvalidation {
  const changed = comparableVaultPath(changedPath);
  return changed && (
    changed === comparableVaultPath(todayPath)
    || changed === comparableVaultPath(tomorrowPath)
  )
    ? "refresh"
    : "ignore";
}

/** Builds a target that retains an Open Question's stable block anchor. */
export function dailyWikiLink(filePath: string, blockId?: string): string {
  const target = filePath
    .replace(/\\/gu, "/")
    .replace(/\.md$/iu, "")
    .replaceAll("[", "")
    .replaceAll("]", "");
  const block = blockId?.trim().replace(/^\^/u, "").replace(/[^A-Za-z0-9_-]/gu, "");
  return `[[${target}${block ? `#^${block}` : ""}]]`;
}

/** Title used by create-only Capture when a create_note target is absent. */
export function dailyCreateOnlyTitle(
  item: Pick<DailyPlanItem, "kind" | "text" | "target" | "linkedNotes">
): string | undefined {
  if (item.kind !== "create_note") return undefined;
  const raw = item.target?.trim()
    || item.linkedNotes[0]
    || item.text;
  const link = raw
    .replace(/^\[\[/u, "")
    .replace(/\]\]$/u, "")
    .split("|")[0]
    .split("#")[0]
    .trim();
  return link.split("/").at(-1) || item.text;
}

function comparableVaultPath(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/\\/gu, "/")
    .replace(/^\/+|\/+$/gu, "");
}
import type { DailyPlanItem } from "./types";
