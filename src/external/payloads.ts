import type { ArticleSummary, OpenQuestion, OpenQuestionKind, OpenQuestionLane, OpenQuestionQuery, OpenQuestionStatus, PdfAnchorRect } from "../core/types";
import { buildEinkPayload } from "../export/exporter";
import type { WorkflowSummaryPayload } from "../workflow";

export interface ExternalApiEnvelope<T> {
  schemaVersion: 1;
  generatedAt: string;
  vaultName: string;
  data: T;
}

export interface ExternalDeckCard {
  id: string;
  title: string;
  body: string;
  question: string;
  note?: string;
  latestNote?: string;
  reminderAt?: string;
  reminderNote?: string;
  reminderSource?: string;
  reminderDue?: boolean;
  article: string;
  sourceFile: string;
  sourceLine: number;
  sourcePage?: number;
  sourceRects?: PdfAnchorRect[];
  sourceSelectedText?: string;
  lane: OpenQuestionLane;
  status: OpenQuestionStatus;
  kind: OpenQuestionKind;
  tags: string[];
  openUri: string;
  updatedAt?: string;
}

export function buildQuestionsPayload(
  vaultName: string,
  questions: OpenQuestion[],
  generatedAt = new Date().toISOString()
): ExternalApiEnvelope<OpenQuestion[]> {
  return {
    schemaVersion: 1,
    generatedAt,
    vaultName,
    data: questions
  };
}

export function buildArticlesPayload(
  vaultName: string,
  articles: ArticleSummary[],
  generatedAt = new Date().toISOString()
): ExternalApiEnvelope<ArticleSummary[]> {
  return {
    schemaVersion: 1,
    generatedAt,
    vaultName,
    data: articles
  };
}

export function buildExternalEinkPayload(
  vaultName: string,
  questions: OpenQuestion[],
  articles: ArticleSummary[],
  limit: number,
  generatedAt = new Date().toISOString()
) {
  return buildEinkPayload(generatedAt, questions, articles, vaultName, limit);
}

export function buildDeckPayload(
  vaultName: string,
  questions: OpenQuestion[],
  limit: number,
  generatedAt = new Date().toISOString()
): ExternalApiEnvelope<{ cards: ExternalDeckCard[] }> {
  const cards = questions
    .filter((question) => isWorkStatus(question.status))
    .slice(0, limit)
    .map((question) => toDeckCard(vaultName, question));

  return {
    schemaVersion: 1,
    generatedAt,
    vaultName,
    data: { cards }
  };
}

export function buildSseSnapshot(
  vaultName: string,
  questions: OpenQuestion[],
  articles: ArticleSummary[],
  workflows?: WorkflowSummaryPayload,
  generatedAt = new Date().toISOString()
) {
  return {
    schemaVersion: 1,
    generatedAt,
    vaultName,
    summary: {
      questions: questions.length,
      open: questions.filter((question) => isWorkStatus(question.status)).length,
      candidate: questions.filter((question) => question.status === "candidate").length,
      articles: articles.length,
      blockedArticles: articles.filter((article) => article.needsWork).length
    },
    questions,
    articles,
    workflows
  };
}

export function buildRssFeed(vaultName: string, questions: OpenQuestion[], selfUrl: string, generatedAt = new Date().toISOString()): string {
  const publicSelfUrl = stripTokenFromUrl(selfUrl);
  const items = questions
    .filter((question) => isWorkStatus(question.status))
    .slice(0, 50)
    .map((question) => {
      const title = question.title || question.source.headingPath.at(-1) || question.question.slice(0, 80);
      const description = [
        question.question,
        question.note,
        question.notes?.at(-1)?.text,
        question.contextSummary ? `Context: ${question.contextSummary}` : "",
        `Source: ${question.source.file}${question.source.page ? ` page ${question.source.page}` : `:${question.source.lineStart + 1}`}`,
        `Lane: ${question.lane}`,
        `Status: ${question.status}`,
        question.tags.length > 0 ? `Tags: ${question.tags.map((tag) => `#${tag}`).join(" ")}` : ""
      ]
        .filter(Boolean)
        .join("\n\n");

      return [
        "    <item>",
        `      <guid isPermaLink="false">${escapeXml(question.id)}</guid>`,
        `      <title>${escapeXml(title)}</title>`,
        `      <link>${escapeXml(buildObsidianUri(vaultName, question))}</link>`,
        `      <description>${escapeXml(description)}</description>`,
        `      <pubDate>${formatRssDate(question.updatedAt ?? question.createdAt ?? generatedAt)}</pubDate>`,
        "    </item>"
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    `    <title>${escapeXml(`ToWrite Open Questions - ${vaultName}`)}</title>`,
    `    <link>${escapeXml(publicSelfUrl)}</link>`,
    "    <description>Open ToThink and ToWrite cards from Obsidian ToWrite.</description>",
    `    <lastBuildDate>${formatRssDate(generatedAt)}</lastBuildDate>`,
    items,
    "  </channel>",
    "</rss>"
  ].filter(Boolean).join("\n");
}

export function queryFromUrl(url: URL): OpenQuestionQuery {
  const query: OpenQuestionQuery = {};
  const status = readCsv(url.searchParams.get("status"));
  const lane = readCsv(url.searchParams.get("lane"));
  const kind = readCsv(url.searchParams.get("kind"));
  const filePath = url.searchParams.get("filePath")?.trim();
  const folderPath = url.searchParams.get("folderPath")?.trim();
  const search = url.searchParams.get("search")?.trim();
  const limit = parseLimit(url.searchParams.get("limit"), 0);

  if (status.length > 0) {
    query.status = status.filter(isOpenQuestionStatus);
  }
  if (lane.length > 0) {
    query.lane = lane.filter((value): value is OpenQuestionLane => value === "think" || value === "write");
  }
  if (kind.length > 0) {
    query.kind = kind.filter(isOpenQuestionKind);
  }
  if (filePath) {
    query.filePath = filePath;
  }
  if (folderPath) {
    query.folderPath = folderPath;
  }
  if (search) {
    query.search = search;
  }
  if (limit > 0) {
    query.limit = limit;
  }

  return query;
}

function isOpenQuestionStatus(value: string): value is OpenQuestionStatus {
  return value.length > 0;
}

const OPEN_QUESTION_KIND_VALUES: readonly string[] = [
  "research",
  "experiment",
  "explanation",
  "citation",
  "todo",
  "evidence",
  "other"
];

function isOpenQuestionKind(value: string): value is OpenQuestionKind {
  return OPEN_QUESTION_KIND_VALUES.includes(value);
}

export function parseLimit(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 200);
}

export function buildObsidianUri(vaultName: string, question: OpenQuestion): string {
  const fragment = question.source.blockId ? `#^${question.source.blockId}` : "";
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(`${question.source.file}${fragment}`)}`;
}

function toDeckCard(vaultName: string, question: OpenQuestion): ExternalDeckCard {
  return {
    id: question.id,
    title: question.title || question.source.headingPath.at(-1) || question.question.slice(0, 40),
    body: question.question,
    question: question.question,
    note: question.note,
    latestNote: question.notes?.at(-1)?.text,
    reminderAt: question.reminderAt || undefined,
    reminderNote: question.reminderNote || undefined,
    reminderSource: question.reminderSource,
    reminderDue: isReminderDue(question.reminderAt),
    article: question.source.file.replace(/\.md$/iu, ""),
    sourceFile: question.source.file,
    sourceLine: question.source.lineStart + 1,
    sourcePage: question.source.page,
    sourceRects: question.source.pdfAnchor?.rects,
    sourceSelectedText: question.source.pdfAnchor?.selectedText ?? question.anchorText,
    lane: question.lane,
    status: question.status,
    kind: question.kind,
    tags: question.tags,
    openUri: buildObsidianUri(vaultName, question),
    updatedAt: question.updatedAt ?? question.createdAt
  };
}

function isWorkStatus(status: string): boolean {
  return status !== "candidate" && status !== "resolved" && status !== "ignored";
}

function isReminderDue(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }
  return timestamp <= Date.now();
}

function readCsv(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function stripTokenFromUrl(value: string): string {
  try {
    const url = new URL(value);
    url.searchParams.delete("token");
    return url.toString();
  } catch {
    return value.replace(/([?&])token=[^&]+/u, "$1").replace(/[?&]$/u, "");
  }
}

function formatRssDate(value: string): string {
  const timestamp = Date.parse(value);
  return new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toUTCString();
}
