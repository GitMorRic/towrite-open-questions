import type { QuestionAnchor } from "./types";

const CONTEXT_RADIUS = 36;
const ORPHAN_THRESHOLD = 0.38;

export interface AnchorResolution {
  anchor: QuestionAnchor;
  startOffset: number;
  endOffset: number;
  confidence: number;
  orphaned: boolean;
}

export interface LineRange {
  lineStart: number;
  lineEnd: number;
}

export function createQuestionAnchor(content: string, startOffset: number, endOffset: number): QuestionAnchor {
  const source = normalizeContent(content);
  const start = clamp(startOffset, 0, source.length);
  const end = clamp(Math.max(start, endOffset), start, source.length);

  return {
    startOffset: start,
    endOffset: end,
    selectedText: source.slice(start, end),
    before: source.slice(Math.max(0, start - CONTEXT_RADIUS), start),
    after: source.slice(end, Math.min(source.length, end + CONTEXT_RADIUS)),
    confidence: 1,
    orphaned: false
  };
}

export function resolveQuestionAnchor(content: string, anchor: QuestionAnchor): AnchorResolution {
  const source = normalizeContent(content);
  const normalizedAnchor = normalizeAnchor(anchor);
  const direct = source.slice(normalizedAnchor.startOffset, normalizedAnchor.endOffset);

  if (direct === normalizedAnchor.selectedText) {
    return resolved(source, normalizedAnchor.startOffset, normalizedAnchor.endOffset, 1);
  }

  const contextual = findWithContext(source, normalizedAnchor);
  if (contextual) {
    return contextual;
  }

  const approximate = findApproximate(source, normalizedAnchor);
  if (approximate) {
    return approximate;
  }

  return {
    anchor: { ...normalizedAnchor, confidence: 0, orphaned: true },
    startOffset: normalizedAnchor.startOffset,
    endOffset: normalizedAnchor.endOffset,
    confidence: 0,
    orphaned: true
  };
}

export function lineRangeForOffsets(content: string, startOffset: number, endOffset: number): LineRange {
  const source = normalizeContent(content);
  const start = clamp(startOffset, 0, source.length);
  const end = clamp(endOffset, start, source.length);
  const beforeStart = source.slice(0, start);
  const beforeEnd = source.slice(0, end);

  return {
    lineStart: countLineBreaks(beforeStart),
    lineEnd: countLineBreaks(beforeEnd)
  };
}

function findWithContext(source: string, anchor: QuestionAnchor): AnchorResolution | null {
  if (!anchor.selectedText) {
    return null;
  }

  let best: AnchorResolution | null = null;
  let cursor = source.indexOf(anchor.selectedText);

  while (cursor >= 0) {
    const end = cursor + anchor.selectedText.length;
    const before = source.slice(Math.max(0, cursor - CONTEXT_RADIUS), cursor);
    const after = source.slice(end, Math.min(source.length, end + CONTEXT_RADIUS));
    const score = 0.5 + tailScore(anchor.before, before) * 0.25 + headScore(anchor.after, after) * 0.25;
    const candidate = resolved(source, cursor, end, score);

    if (!best || candidate.confidence > best.confidence) {
      best = candidate;
    }

    cursor = source.indexOf(anchor.selectedText, cursor + 1);
  }

  return best;
}

function findApproximate(source: string, anchor: QuestionAnchor): AnchorResolution | null {
  const target = anchor.selectedText.trim();
  if (target.length < 4) {
    return null;
  }

  const expectedLength = target.length;
  const windowLength = Math.min(source.length, Math.max(expectedLength + 24, Math.ceil(expectedLength * 1.35)));
  const step = Math.max(1, Math.floor(expectedLength / 6));
  const center = clamp(anchor.startOffset, 0, source.length);
  const scanStart = Math.max(0, center - Math.max(220, expectedLength * 4));
  const scanEnd = Math.min(source.length, center + Math.max(220, expectedLength * 4));
  let best: AnchorResolution | null = null;

  for (let start = scanStart; start <= scanEnd; start += step) {
    const candidateText = source.slice(start, Math.min(source.length, start + windowLength));
    const score = similarity(target, candidateText);
    if (score > (best?.confidence ?? 0)) {
      const end = Math.min(source.length, start + Math.max(1, expectedLength));
      best = resolved(source, start, end, score);
    }
  }

  return best && best.confidence >= ORPHAN_THRESHOLD ? best : null;
}

function resolved(source: string, start: number, end: number, confidence: number): AnchorResolution {
  const nextAnchor = createQuestionAnchor(source, start, end);
  const orphaned = confidence < ORPHAN_THRESHOLD;

  return {
    anchor: {
      ...nextAnchor,
      confidence,
      orphaned
    },
    startOffset: start,
    endOffset: end,
    confidence,
    orphaned
  };
}

function normalizeAnchor(anchor: QuestionAnchor): QuestionAnchor {
  return {
    ...anchor,
    selectedText: normalizeContent(anchor.selectedText),
    before: normalizeContent(anchor.before),
    after: normalizeContent(anchor.after)
  };
}

function normalizeContent(content: string): string {
  return content.replace(/\r\n?/gu, "\n");
}

function tailScore(expected: string, actual: string): number {
  const max = Math.min(expected.length, actual.length);
  if (max === 0) {
    return expected.length === actual.length ? 1 : 0;
  }

  for (let length = max; length > 0; length -= 1) {
    if (expected.slice(-length) === actual.slice(-length)) {
      return length / Math.max(expected.length, actual.length);
    }
  }
  return 0;
}

function headScore(expected: string, actual: string): number {
  const max = Math.min(expected.length, actual.length);
  if (max === 0) {
    return expected.length === actual.length ? 1 : 0;
  }

  for (let length = max; length > 0; length -= 1) {
    if (expected.slice(0, length) === actual.slice(0, length)) {
      return length / Math.max(expected.length, actual.length);
    }
  }
  return 0;
}

function similarity(left: string, right: string): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return left === right ? 1 : 0;
  }

  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }

  return (shared * 2) / (leftTokens.size + rightTokens.size);
}

function tokenSet(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/gu, " ").trim();
  const tokens = normalized.match(/[\p{L}\p{N}]{2,}|[^\s]/gu) ?? [];
  return new Set(tokens);
}

function countLineBreaks(text: string): number {
  return (text.match(/\n/gu) ?? []).length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
