import type { DailySummary } from "./types";

export interface ConstrainedDailyAiSummary {
  headline: string;
  lines: string[];
}

const METRIC_PLACEHOLDERS = [
  "planned",
  "completed",
  "remaining",
  "positiveWritingUnits",
  "netWritingUnits",
  "notesCreated",
  "notesModified"
] as const;

type MetricPlaceholder = typeof METRIC_PLACEHOLDERS[number];

/**
 * Parses an AI wording draft while mechanically preventing it from inventing
 * numeric facts. The model may emit only named placeholders; the plugin owns
 * every value substituted into them. Any literal number, Chinese number word,
 * unknown placeholder, or malformed response rejects the entire draft.
 */
export function parseConstrainedDailyAiSummary(
  value: string,
  factualSummary: Pick<DailySummary, "date" | "metrics">
): ConstrainedDailyAiSummary | undefined {
  const trimmed = value.trim();
  const jsonText = trimmed.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  let parsed: { headline?: unknown; lines?: unknown };
  try {
    parsed = JSON.parse(jsonText) as { headline?: unknown; lines?: unknown };
  } catch {
    return undefined;
  }
  const headline = typeof parsed.headline === "string" ? parsed.headline.trim() : "";
  const lines = Array.isArray(parsed.lines)
    ? parsed.lines.filter((line): line is string => typeof line === "string").map((line) => line.trim())
    : [];
  if (!headline || lines.length > 5 || lines.some((line) => !line)) return undefined;

  const templates = [headline, ...lines];
  if (templates.some((template) => !isSafeNumericTemplate(template))) return undefined;
  const values: Record<MetricPlaceholder | "date", string> = {
    planned: String(factualSummary.metrics.planned),
    completed: String(factualSummary.metrics.completed),
    remaining: String(factualSummary.metrics.remaining),
    positiveWritingUnits: String(factualSummary.metrics.positiveWritingUnits),
    netWritingUnits: signed(factualSummary.metrics.netWritingUnits),
    notesCreated: String(factualSummary.metrics.notesCreated),
    notesModified: String(factualSummary.metrics.notesModified),
    date: factualSummary.date
  };
  const hydrate = (template: string): string => template
    .replace(/\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/gu, (_match, key: string) => values[key as keyof typeof values])
    .trim();
  const hydratedHeadline = hydrate(headline).slice(0, 200);
  const hydratedLines = lines.map((line) => hydrate(line).slice(0, 300));
  if (!hydratedHeadline || hydratedLines.some((line) => !line)) return undefined;
  return { headline: hydratedHeadline, lines: hydratedLines };
}

export function dailyAiSummaryPlaceholderInstruction(): string {
  return [
    "Return strict JSON with keys headline and lines (an array of at most 5 short strings).",
    "Do not write any numeric literal or number word.",
    "When a counter is needed, copy only one of these exact placeholders:",
    "{{planned}}, {{completed}}, {{remaining}}, {{positiveWritingUnits}},",
    "{{netWritingUnits}}, {{notesCreated}}, {{notesModified}}, or {{date}}.",
    "Do not create any other placeholder."
  ].join(" ");
}

function isSafeNumericTemplate(value: string): boolean {
  const placeholders = [...value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/gu)];
  for (const match of placeholders) {
    const key = match[1]?.trim();
    if (key !== "date" && !METRIC_PLACEHOLDERS.includes(key as MetricPlaceholder)) return false;
  }
  const withoutPlaceholders = value.replace(/\{\{\s*[^{}]+?\s*\}\}/gu, "");
  if (/[{}]/u.test(withoutPlaceholders)) return false;
  if (/\p{N}/u.test(withoutPlaceholders)) return false;
  if (/[零〇一二两三四五六七八九十百千万亿兆半]+/u.test(withoutPlaceholders)) return false;
  if (/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/iu.test(withoutPlaceholders)) {
    return false;
  }
  return !/\b(?:II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\b/u.test(withoutPlaceholders);
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
