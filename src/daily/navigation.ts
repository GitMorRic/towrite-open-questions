import type { DailyPlanItem, DailyPlanSource } from "./types";

export type DailyPlanCacheInvalidation = "refresh" | "ignore";

const DAILY_DATE_TOKEN = /YYYY|YY|MM|DD|M|D/gu;
const DAILY_DATE_TOKEN_PATTERN: Record<string, string> = {
  YYYY: "\\d{4}",
  YY: "\\d{2}",
  MM: "(?:0[1-9]|1[0-2])",
  M: "(?:[1-9]|1[0-2])",
  DD: "(?:0[1-9]|[12]\\d|3[01])",
  D: "(?:[1-9]|[12]\\d|3[01])"
};

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

/**
 * Whether a Vault path is itself a configured Daily plan source.
 *
 * Fixed documents match exactly. Daily Notes must be direct children of the
 * configured root and have the configured date-shaped filename; ordinary
 * Markdown in a nested project folder is deliberately not treated as Daily.
 */
export function isConfiguredDailyPlanSourcePath(path: string, source: DailyPlanSource): boolean {
  const candidate = comparableVaultPath(path);
  if (!candidate) return false;
  if (source.kind === "fixed-document") {
    return candidate === comparableVaultPath(source.path);
  }

  const root = comparableVaultPath(source.dailyRoot || "Daily");
  const prefix = root ? `${root}/` : "";
  if (!prefix || !candidate.startsWith(prefix)) return false;
  const fileName = candidate.slice(prefix.length);
  if (!fileName || fileName.includes("/")) return false;
  return dailyDateFilePattern(source.dateFormat).test(fileName);
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

function dailyDateFilePattern(value: string | undefined): RegExp {
  const format = normalizedDailyDateFormat(value);
  let pattern = "";
  let offset = 0;
  for (const match of format.matchAll(DAILY_DATE_TOKEN)) {
    pattern += escapeRegexLiteral(format.slice(offset, match.index));
    pattern += DAILY_DATE_TOKEN_PATTERN[match[0]];
    offset = match.index + match[0].length;
  }
  pattern += escapeRegexLiteral(format.slice(offset));
  return new RegExp(`^${pattern}\\.md$`, "iu");
}

function normalizedDailyDateFormat(value: string | undefined): string {
  const normalized = String(value ?? "YYYY-MM-DD")
    .trim()
    .replace(/\.md$/iu, "");
  return normalized && !/[\\/:*?"<>|]/u.test(normalized) ? normalized : "YYYY-MM-DD";
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
