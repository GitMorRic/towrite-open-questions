export interface MarkdownTaskInputSuggestion {
  id: string;
  kind: "task" | "note";
  label: string;
  detail: string;
  replacement: string;
  searchText: string;
}

const OPEN_CHECKBOX_PREFIX_RE = /^(?<prefix>\s*(?:[-+*]|\d+[.)])\s+\[(?: |\/)\]\s+)(?<query>[^\r\n]*)$/u;

export function matchMarkdownTaskInput(
  lineBeforeCursor: string
): { startCh: number; query: string } | undefined {
  const match = OPEN_CHECKBOX_PREFIX_RE.exec(lineBeforeCursor);
  const rawQuery = match?.groups?.query ?? "";
  const query = normalizeTaskSuggestionQuery(rawQuery);
  if (!match?.groups?.prefix || query.length < 2 || rawQuery.includes("%%")) return undefined;
  return { startCh: match.groups.prefix.length, query };
}

export function rankMarkdownTaskInputSuggestions(
  items: readonly MarkdownTaskInputSuggestion[],
  query: string,
  limit = 8
): MarkdownTaskInputSuggestion[] {
  const normalized = normalizeTaskSuggestionQuery(query);
  if (normalized.length < 2) return [];
  const seen = new Set<string>();
  return items
    .map((item) => ({ item, score: suggestionScore(item.searchText, normalized) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => left.score - right.score || left.item.label.localeCompare(right.item.label, "zh-CN"))
    .flatMap(({ item }) => {
      const key = `${item.kind}:${item.replacement.toLocaleLowerCase()}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [item];
    })
    .slice(0, Math.max(1, limit));
}

export function normalizeTaskSuggestionQuery(value: string): string {
  return value
    .replace(/^\[\[/u, "")
    .replace(/[\]|#^].*$/u, "")
    .trim()
    .toLocaleLowerCase();
}

function suggestionScore(value: string, query: string): number {
  const normalized = value.toLocaleLowerCase();
  if (normalized === query) return 0;
  if (normalized.startsWith(query)) return 1 + (normalized.length - query.length) / 1_000;
  const word = normalized.split(/[\s/_-]+/u).findIndex((part) => part.startsWith(query));
  if (word >= 0) return 2 + word / 100;
  const position = normalized.indexOf(query);
  return position >= 0 ? 3 + position / 1_000 : Number.POSITIVE_INFINITY;
}
