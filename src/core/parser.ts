import { makeQuestionId } from "./hash";
import { stripQuestionRuleSyntax } from "./rule-text";
import type {
  OpenQuestion,
  OpenQuestionColor,
  OpenQuestionKind,
  OpenQuestionLane,
  OpenQuestionPriority,
  OpenQuestionStatus,
  OpenQuestionSuggestion
} from "./types";

export interface ParseOptions {
  enableCandidateDetection?: boolean;
  candidateTriggerWords?: string[];
  defaultThinkColor?: OpenQuestionColor;
  defaultWriteColor?: OpenQuestionColor;
}

export interface ParsedOpenQuestionDocument {
  questions: OpenQuestion[];
  suggestions: OpenQuestionSuggestion[];
}

interface HeadingState {
  level: number;
  text: string;
}

interface LineMeta {
  skip: boolean;
  headingPath: string[];
}

type LaneColors = Record<OpenQuestionLane, OpenQuestionColor>;

const DEFAULT_TRIGGER_WORDS = [
  "这里要补",
  "补一点",
  "补充",
  "还要补",
  "分析一下",
  "有没有实测",
  "需要确认",
  "来源是什么",
  "继续写",
  "后续写",
  "待写",
  "补写",
  "扩写",
  "todo",
  "TODO"
];

export function parseOpenQuestions(
  content: string,
  filePath: string,
  options: ParseOptions = {}
): OpenQuestion[] {
  return parseOpenQuestionDocument(content, filePath, options).questions;
}

export function parseOpenQuestionDocument(
  content: string,
  filePath: string,
  options: ParseOptions = {}
): ParsedOpenQuestionDocument {
  const lines = content.replace(/\r\n?/gu, "\n").split("\n");
  const meta = buildLineMeta(lines);
  const consumed = new Set<number>();
  const questions: OpenQuestion[] = [];
  const defaultColors: LaneColors = {
    think: options.defaultThinkColor ?? "amber",
    write: options.defaultWriteColor ?? "sky"
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (meta[lineIndex]?.skip) {
      continue;
    }

    const line = lines[lineIndex] ?? "";
    const doubleQuestion = parseDoubleQuestion(line);
    if (doubleQuestion) {
      questions.push(
        buildQuestion({
          filePath,
          lineStart: lineIndex,
          lineEnd: lineIndex,
          headingPath: meta[lineIndex]?.headingPath ?? [],
          text: doubleQuestion.text,
          blockId: doubleQuestion.blockId,
          metadata: doubleQuestion.metadata,
          status: "open",
          kind: inferKind(doubleQuestion.text),
          rule: "double-question",
          contextSummary: buildContextSummary(lines, lineIndex, lineIndex),
          defaultColors
        })
      );
      consumed.add(lineIndex);
      continue;
    }

    const taskQuestion = parseTaskQuestion(line);
    if (taskQuestion) {
      questions.push(
        buildQuestion({
          filePath,
          lineStart: lineIndex,
          lineEnd: lineIndex,
          headingPath: meta[lineIndex]?.headingPath ?? [],
          text: taskQuestion.text,
          blockId: taskQuestion.blockId,
          metadata: taskQuestion.metadata,
          status: taskQuestion.checked ? "resolved" : "open",
          kind: "todo",
          rule: "task-question",
          contextSummary: buildContextSummary(lines, lineIndex, lineIndex),
          defaultColors
        })
      );
      consumed.add(lineIndex);
      continue;
    }

    const callout = parseQuestionCallout(lines, lineIndex, meta);
    if (callout) {
      questions.push(
        buildQuestion({
          filePath,
          lineStart: callout.lineStart,
          lineEnd: callout.lineEnd,
          headingPath: meta[lineIndex]?.headingPath ?? [],
          text: callout.text,
          blockId: callout.blockId,
          metadata: callout.metadata,
          status: callout.status ?? "open",
          kind: callout.kind ?? inferKind(callout.text),
          rule: "question-callout",
          contextSummary: buildContextSummary(lines, callout.lineStart, callout.lineEnd),
          defaultColors
        })
      );

      for (let consumedLine = callout.lineStart; consumedLine <= callout.lineEnd; consumedLine += 1) {
        consumed.add(consumedLine);
      }

      lineIndex = callout.lineEnd;
    }
  }

  const suggestions = options.enableCandidateDetection ?? true
    ? parseSuggestions(
        lines,
        meta,
        consumed,
        filePath,
        options.candidateTriggerWords ?? DEFAULT_TRIGGER_WORDS,
        defaultColors
      )
    : [];

  return {
    questions: dedupeQuestions(questions),
    suggestions: dedupeSuggestions(suggestions)
  };
}

function buildLineMeta(lines: string[]): LineMeta[] {
  const metadata: LineMeta[] = [];
  const headingStack: HeadingState[] = [];
  let inFrontmatter = false;
  let frontmatterDone = false;
  let inFence = false;
  let fenceMarker = "";
  let inMathBlock = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex] ?? "";
    const trimmed = rawLine.trim();

    if (lineIndex === 0 && trimmed === "---") {
      inFrontmatter = true;
      metadata[lineIndex] = { skip: true, headingPath: [] };
      continue;
    }

    if (inFrontmatter) {
      metadata[lineIndex] = { skip: true, headingPath: [] };
      if (trimmed === "---" && lineIndex > 0) {
        inFrontmatter = false;
        frontmatterDone = true;
      }
      continue;
    }

    if (!frontmatterDone && lineIndex === 0) {
      frontmatterDone = true;
    }

    if (/^(```+|~~~+)/u.test(trimmed)) {
      const marker = trimmed.slice(0, 3);
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = "";
      }
      metadata[lineIndex] = { skip: true, headingPath: headingStack.map((heading) => heading.text) };
      continue;
    }

    if (trimmed === "$$") {
      inMathBlock = !inMathBlock;
      metadata[lineIndex] = { skip: true, headingPath: headingStack.map((heading) => heading.text) };
      continue;
    }

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(rawLine);
    if (heading && !inFence && !inMathBlock) {
      const level = heading[1].length;
      const text = heading[2].trim();
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text });
      metadata[lineIndex] = { skip: true, headingPath: headingStack.map((item) => item.text) };
      continue;
    }

    const isTable = isLikelyTableLine(rawLine, lines[lineIndex - 1], lines[lineIndex + 1]);
    metadata[lineIndex] = {
      skip: inFence || inMathBlock || isTable,
      headingPath: headingStack.map((heading) => heading.text)
    };
  }

  return metadata;
}

function isLikelyTableLine(line: string, previous?: string, next?: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) {
    return false;
  }
  if (/^\|?[\s:-]+\|[\s|:-]*$/u.test(trimmed)) {
    return true;
  }
  return Boolean(previous?.includes("|") || next?.includes("|"));
}

function parseDoubleQuestion(line: string) {
  const match = /^\s*(?:\?\?|？？)\s+(.+?)\s*$/u.exec(line);
  return match ? normalizeRuleText(match[1]) : null;
}

function parseTaskQuestion(line: string) {
  const match = /^\s*[-*+]\s+\[([ xX])\]\s+\[\?\]\s+(.+?)\s*$/u.exec(line);
  if (!match) {
    return null;
  }
  return {
    ...normalizeRuleText(match[2]),
    checked: match[1].toLowerCase() === "x"
  };
}

function parseQuestionCallout(lines: string[], start: number, meta: LineMeta[]) {
  const firstLine = lines[start] ?? "";
  const firstMatch = /^\s*>\s*\[!question\][+-]?\s*(.*?)\s*$/iu.exec(firstLine);
  if (!firstMatch || meta[start]?.skip) {
    return null;
  }

  const metadata: Record<string, string> = {};
  const body: string[] = [];
  let lineEnd = start;
  const title = firstMatch[1]?.replace(/^待解决[:：]?\s*/u, "").trim();

  for (let lineIndex = start + 1; lineIndex < lines.length; lineIndex += 1) {
    const quote = /^\s*>\s?(.*)$/u.exec(lines[lineIndex] ?? "");
    if (!quote) {
      break;
    }
    lineEnd = lineIndex;
    const text = quote[1].trim();
    const field = /^(id|qid|status|kind|priority|title|tags|color|lane|type)\s*:\s*(.+)$/iu.exec(text);
    if (field) {
      metadata[field[1].toLowerCase()] = field[2].trim();
      continue;
    }
    if (text.length > 0) {
      body.push(text);
    }
  }

  const normalizedTitle = title ? normalizeRuleText(title) : null;
  const normalizedBody = body.length > 0 ? normalizeRuleText(body.join("\n")) : null;
  const text = normalizedBody?.text || normalizedTitle?.text || "Untitled question";
  const blockId = normalizedBody?.blockId ?? normalizedTitle?.blockId ?? metadata.id ?? metadata.qid;

  return {
    lineStart: start,
    lineEnd,
    text,
    blockId,
    metadata: {
      ...normalizedTitle?.metadata,
      ...normalizedBody?.metadata,
      ...metadata
    },
    status: normalizeStatus(metadata.status),
    kind: normalizeKind(metadata.kind)
  };
}

function normalizeRuleText(text: string) {
  const metadata = parseInlineMetadata(text);
  const blockId = parseBlockId(text) ?? metadata.qid;
  const cleaned = stripQuestionRuleSyntax(text);

  return {
    text: cleaned,
    blockId,
    metadata
  };
}

function parseInlineMetadata(text: string): Record<string, string> {
  const metadata: Record<string, string> = {};
  const fieldRegex = /\[(qid|kind|status|priority|title|tags|color|lane|type)::\s*([^\]]+)\]/giu;
  let match = fieldRegex.exec(text);
  while (match) {
    metadata[match[1].toLowerCase()] = match[2].trim();
    match = fieldRegex.exec(text);
  }
  return metadata;
}

function parseBlockId(text: string): string | undefined {
  return /(?:^|\s)\^([\p{L}\p{N}_-]+)(?=\s|$)/u.exec(text)?.[1];
}

function buildQuestion(input: {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  headingPath: string[];
  text: string;
  blockId?: string;
  metadata: Record<string, string>;
  status: OpenQuestionStatus;
  kind: OpenQuestionKind;
  rule: OpenQuestion["source"]["rule"];
  contextSummary?: string;
  defaultColors: LaneColors;
}): OpenQuestion {
  const status = normalizeStatus(input.metadata.status) ?? input.status;
  const kind = normalizeKind(input.metadata.kind) ?? input.kind;
  const lane = normalizeLane(input.metadata.lane ?? input.metadata.type) ?? inferLane(input.text);
  const priority = normalizePriority(input.metadata.priority);
  const tags = normalizeTags(input.metadata.tags);
  const color = normalizeColor(input.metadata.color) ?? defaultColorForLane(lane, input.defaultColors);
  const id = input.metadata.qid ?? input.blockId ?? makeQuestionId(input.filePath, input.lineStart, input.text);

  return {
    id,
    title: input.metadata.title,
    lane,
    status,
    kind,
    priority,
    tags,
    color,
    question: input.text,
    anchorText: input.text,
    source: {
      file: input.filePath,
      headingPath: input.headingPath,
      lineStart: input.lineStart,
      lineEnd: input.lineEnd,
      blockId: input.blockId,
      rule: input.rule
    },
    contextSummary: input.contextSummary
  };
}

function parseSuggestions(
  lines: string[],
  meta: LineMeta[],
  consumed: Set<number>,
  filePath: string,
  triggerWords: string[],
  defaultColors: LaneColors
): OpenQuestionSuggestion[] {
  const suggestions: OpenQuestionSuggestion[] = [];
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    if (meta[lineIndex]?.skip || consumed.has(lineIndex) || lines[lineIndex].trim().length === 0) {
      lineIndex += 1;
      continue;
    }

    const start = lineIndex;
    const paragraphLines: string[] = [];
    while (
      lineIndex < lines.length &&
      !meta[lineIndex]?.skip &&
      !consumed.has(lineIndex) &&
      lines[lineIndex].trim().length > 0
    ) {
      paragraphLines.push(lines[lineIndex].trim());
      lineIndex += 1;
    }

    const end = lineIndex - 1;
    const beforeBlank = start === 0 || lines[start - 1].trim().length === 0 || meta[start - 1]?.skip;
    const afterBlank = end === lines.length - 1 || lines[end + 1].trim().length === 0 || meta[end + 1]?.skip;
    const text = paragraphLines.join("\n").trim();

    const suggestionLane = classifySuggestionText(text, triggerWords);
    if (
      beforeBlank &&
      afterBlank &&
      paragraphLines.length <= 3 &&
      text.length <= 260 &&
      suggestionLane
    ) {
      const lane = suggestionLane;
      suggestions.push({
        id: makeQuestionId(filePath, -1, `candidate:${lane}:${stripBlockId(text)}`),
        lane,
        kind: lane === "write" ? "todo" : inferKind(text),
        tags: [],
        color: defaultColorForLane(lane, defaultColors),
        question: stripBlockId(text),
        anchorText: text,
        source: {
          file: filePath,
          headingPath: meta[start]?.headingPath ?? [],
          lineStart: start,
          lineEnd: end,
          blockId: parseBlockId(text),
          rule: "candidate"
        },
        contextSummary: buildContextSummary(lines, start, end)
      });
    }
  }

  return suggestions;
}

function classifySuggestionText(text: string, triggerWords: string[]): OpenQuestionLane | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  if (isWriteSuggestionText(trimmed)) {
    return "write";
  }
  if (isThinkSuggestionText(trimmed)) {
    return "think";
  }

  const words = triggerWords.map((word) => word.trim()).filter(Boolean);
  const matchedCustomWord = words.some((word) => matchesTriggerWord(trimmed, word));
  return matchedCustomWord ? inferLane(trimmed) : undefined;
}

function isThinkSuggestionText(text: string): boolean {
  return /(?:^|[，,。；;\s])(?:分析一下|需要确认|需要验证|查一下|查证一下|找资料|找证据|来源是什么|出处是什么|有没有实测|有没有数据|是否有人|怎么验证|为什么会|原理是什么)(?:[，,。！？!?；;\s]|$)/u.test(text);
}

function isWriteSuggestionText(text: string): boolean {
  return /(?:^|[，,。；;\s])(?:继续写|接着写|后续写|待写|补写|扩写|改写|润色|成文|这里要补|补一点|补充一下|补一段|补个例子|补个说明|补个结论|TODO|todo)(?:[，,。！？!?；;\s]|$)/u.test(text);
}

function matchesTriggerWord(text: string, word: string): boolean {
  if (/^[a-z0-9_-]+$/iu.test(word)) {
    return new RegExp(`(?:^|[^\\p{L}\\p{N}_-])${escapeRegExp(word)}(?:$|[^\\p{L}\\p{N}_-])`, "iu").test(text);
  }
  return text.includes(word);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function stripBlockId(text: string): string {
  return text.replace(/\s*\^[\p{L}\p{N}_-]+(?=\s|$)/gu, "").trim();
}

function inferKind(text: string): OpenQuestionKind {
  if (/实测|测量|实验|测试/u.test(text)) {
    return "experiment";
  }
  if (/找资料|查询|资料|搜索|research|有没有|是否有人/u.test(text)) {
    return "research";
  }
  if (/解释|为什么|分析|原理/u.test(text)) {
    return "explanation";
  }
  if (/引用|出处|来源|citation/u.test(text)) {
    return "citation";
  }
  if (/证据|依据|数据/u.test(text)) {
    return "evidence";
  }
  if (/补|添加|TODO|todo|继续写|后续写|待写|扩写|改写/u.test(text)) {
    return "todo";
  }
  return "other";
}

function normalizeStatus(value?: string): OpenQuestionStatus | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "candidate" || normalized === "open" || normalized === "resolved" || normalized === "ignored") {
    return normalized;
  }
  if (normalized === "done" || normalized === "closed") {
    return "resolved";
  }
  return normalized.replace(/\s+/gu, "-");
}

function normalizeKind(value?: string): OpenQuestionKind | undefined {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "research" ||
    normalized === "experiment" ||
    normalized === "explanation" ||
    normalized === "citation" ||
    normalized === "todo" ||
    normalized === "evidence" ||
    normalized === "other"
  ) {
    return normalized;
  }
  return undefined;
}

function normalizePriority(value?: string): OpenQuestionPriority | undefined {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "P1" || normalized === "P2" || normalized === "P3") {
    return normalized;
  }
  return undefined;
}

function normalizeColor(value?: string): OpenQuestionColor | undefined {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "amber" ||
    normalized === "mint" ||
    normalized === "sky" ||
    normalized === "rose" ||
    normalized === "violet" ||
    normalized === "slate"
  ) {
    return normalized;
  }
  return undefined;
}

function normalizeLane(value?: string): OpenQuestionLane | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "think" || normalized === "tothink" || normalized === "thought") {
    return "think";
  }
  if (normalized === "write" || normalized === "towrite" || normalized === "draft") {
    return "write";
  }
  return undefined;
}

function normalizeTags(value?: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/[,\s\uFF0C\u3001\uFF1B]+/u)
    .map((tag) => tag.replace(/^#/u, "").trim())
    .filter(Boolean);
}

function inferLane(text: string): OpenQuestionLane {
  if (/继续写|接着写|后续写|待写|补写|补充|还要补|扩写|改写|润色|成文|文案|段落|标题|开头|结尾|这句话|这段|这里要补/u.test(text)) {
    return "write";
  }
  return "think";
}

function defaultColorForLane(lane: OpenQuestionLane, colors: LaneColors): OpenQuestionColor {
  return colors[lane];
}

function buildContextSummary(lines: string[], start: number, end: number): string | undefined {
  const before = findNearbyNonEmptyLine(lines, start, -1);
  const after = findNearbyNonEmptyLine(lines, end, 1);
  const fragments = [before, after].filter(Boolean);
  return fragments.length > 0 ? fragments.join(" / ").slice(0, 180) : undefined;
}

function findNearbyNonEmptyLine(lines: string[], from: number, direction: -1 | 1): string | undefined {
  for (let offset = 1; offset <= 4; offset += 1) {
    const line = lines[from + offset * direction]?.trim();
    if (line) {
      return line.replace(/^>\s?/u, "");
    }
  }
  return undefined;
}

function dedupeQuestions(questions: OpenQuestion[]): OpenQuestion[] {
  const seen = new Set<string>();
  const output: OpenQuestion[] = [];
  for (const question of questions) {
    if (!seen.has(question.id)) {
      seen.add(question.id);
      output.push(question);
    }
  }
  return output;
}

function dedupeSuggestions(suggestions: OpenQuestionSuggestion[]): OpenQuestionSuggestion[] {
  const seen = new Set<string>();
  const output: OpenQuestionSuggestion[] = [];
  for (const suggestion of suggestions) {
    if (!seen.has(suggestion.id)) {
      seen.add(suggestion.id);
      output.push(suggestion);
    }
  }
  return output;
}
