import type { ArticleSummary, ExportEinkPayload, OpenQuestion } from "../core/types";
import type { EchoCard } from "../hub/echo-cards";
import { echoCardLocalId } from "../hub/echo-cards";
import { buildExternalEinkPayload } from "./payloads";

export interface EinkPlaylistOptions {
  orderedLocalIds: readonly string[];
  selectedLocalId?: string;
  cursor?: number;
  limit?: number;
  generatedAt?: string;
}

/**
 * Builds the backwards-compatible `/api/v1/eink` payload used by early ESP32
 * firmware. Saved Echo cards and ToThink/ToWrite questions share one ordered
 * playlist, while the legacy `focus` shape remains intact.
 */
export function buildExternalEinkPlaylistPayload(
  vaultName: string,
  questions: readonly OpenQuestion[],
  articles: readonly ArticleSummary[],
  echoCards: readonly EchoCard[],
  options: EinkPlaylistOptions
): ExportEinkPayload {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const echoByLocalId = new Map(echoCards.map((card) => [echoCardLocalId(card), card]));
  const base = buildExternalEinkPayload(
    vaultName,
    [...questions],
    [...articles],
    Math.max(1, questions.length),
    generatedAt
  );
  const questionFocusById = new Map(base.focus.map((item) => [item.id, {
    ...item,
    sourceType: "question" as const
  }]));

  const orderedIds = unique([
    ...(options.selectedLocalId ? [options.selectedLocalId] : []),
    ...options.orderedLocalIds
  ]).filter((localId) => echoByLocalId.has(localId) || questionById.has(localId));
  const allFocus = orderedIds.flatMap((localId): ExportEinkPayload["focus"] => {
    const echo = echoByLocalId.get(localId);
    if (echo) return [echoFocus(echo)];
    const question = questionFocusById.get(localId);
    return question ? [question] : [];
  });

  const total = allFocus.length;
  const cursor = normalizeCursor(options.cursor, total);
  const limit = clampInteger(options.limit, 1, 100, 12);
  const focus = wrapSlice(allFocus, cursor, limit);
  return {
    ...base,
    focus,
    playlist: {
      order: "echo_then_questions",
      cursor,
      total,
      nextCursor: total > 0 ? (cursor + 1) % total : 0,
      previousCursor: total > 0 ? (cursor - 1 + total) % total : 0,
      selectedId: options.selectedLocalId && orderedIds.includes(options.selectedLocalId)
        ? options.selectedLocalId
        : undefined,
      revision: playlistRevision(orderedIds, questionById, echoByLocalId)
    }
  };
}

function echoFocus(card: EchoCard): ExportEinkPayload["focus"][number] {
  const body = [card.context.trim(), card.content.trim()].filter(Boolean).join("\n\n");
  return {
    id: echoCardLocalId(card),
    title: [card.typeLabel.trim(), card.subject.trim()].filter(Boolean).join(" · ") || card.name,
    body,
    question: body,
    article: card.sourceLabel.trim() || card.name,
    lane: "write",
    kind: "other",
    nextAction: card.whyNow.trim() || undefined,
    sourceType: "echo",
    contentType: card.contentType,
    actions: [...card.actions]
  };
}

function wrapSlice<T>(items: readonly T[], cursor: number, limit: number): T[] {
  if (items.length === 0) return [];
  const count = Math.min(limit, items.length);
  return Array.from({ length: count }, (_, offset) => items[(cursor + offset) % items.length]);
}

function normalizeCursor(value: number | undefined, total: number): number {
  if (total <= 0) return 0;
  const integer = Number.isFinite(value) ? Math.trunc(value ?? 0) : 0;
  return ((integer % total) + total) % total;
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value ?? fallback)));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function playlistRevision(
  orderedIds: readonly string[],
  questions: ReadonlyMap<string, OpenQuestion>,
  echoCards: ReadonlyMap<string, EchoCard>
): string {
  const input = orderedIds.map((id) => {
    const question = questions.get(id);
    const echo = echoCards.get(id);
    return question
      ? `${id}:${question.updatedAt ?? ""}:${question.status}`
      : echo
        ? `${id}:${echo.updatedAt}:${echo.content}`
        : id;
  }).join("\u0000");
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `einkrev_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
