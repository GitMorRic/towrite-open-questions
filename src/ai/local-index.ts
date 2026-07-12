import { TFile, type App } from "obsidian";
import type { OpenQuestion } from "../core/types";
import type { LocalKnowledgeCandidate } from "./types";

export interface LocalKnowledgeDocument {
  file: string;
  title: string;
  headings: string[];
  tags: string[];
  frontmatter?: Record<string, unknown>;
  content: string;
}

export interface LocalKnowledgeScope {
  includeFolders?: string[];
  excludeFolders?: string[];
  excludeTags?: string[];
  excludeFrontmatter?: string[];
}

export interface LocalKnowledgeTextQuery {
  text: string;
  excludeFile?: string;
}

interface IndexedDocument extends LocalKnowledgeDocument {
  tokens: Map<string, number>;
  searchText: string;
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "have",
  "need",
  "todo",
  "这里",
  "这个",
  "需要",
  "一下",
  "什么",
  "是否"
]);

export class LocalKnowledgeIndex {
  private documents: IndexedDocument[] = [];

  async rebuild(app: App, exportDirectory: string, scope: LocalKnowledgeScope = {}): Promise<void> {
    const ignoredPrefix = normalizePath(exportDirectory);
    const files = app.vault.getMarkdownFiles()
      .filter((file) => !normalizePath(file.path).startsWith(`${ignoredPrefix}/`))
      .filter((file) => pathAllowed(file.path, scope));
    const documents = await Promise.all(files.map((file) => readDocument(app, file)));
    this.replaceDocuments(documents.filter((document) => documentAllowed(document, scope)));
  }

  async upsert(app: App, file: TFile, exportDirectory: string, scope: LocalKnowledgeScope = {}): Promise<void> {
    const normalized = normalizePath(file.path);
    const ignoredPrefix = normalizePath(exportDirectory);
    if (file.extension !== "md" || normalized.startsWith(`${ignoredPrefix}/`) || !pathAllowed(file.path, scope)) {
      this.remove(file.path);
      return;
    }
    const document = await readDocument(app, file);
    if (!documentAllowed(document, scope)) {
      this.remove(file.path);
      return;
    }
    const remaining = this.documents.filter((item) => item.file !== file.path).map(stripIndexedFields);
    this.replaceDocuments([...remaining, document]);
  }

  remove(filePath: string): void {
    this.documents = this.documents.filter((item) => item.file !== filePath);
  }

  replaceDocuments(documents: LocalKnowledgeDocument[]): void {
    this.documents = documents.map((document) => {
      const searchText = [
        document.file,
        document.title,
        document.headings.join(" "),
        document.tags.join(" "),
        stringifyFrontmatter(document.frontmatter),
        document.content
      ].join("\n");

      return {
        ...document,
        searchText,
        tokens: countTokens(searchText)
      };
    });
  }

  query(question: OpenQuestion, limit = 20): LocalKnowledgeCandidate[] {
    const queryText = [
      question.title,
      question.question,
      question.anchorText,
      question.contextSummary,
      question.tags.join(" "),
      question.kind,
      question.source.headingPath.join(" ")
    ]
      .filter(Boolean)
      .join("\n");
    return this.queryText({ text: queryText, excludeFile: question.source.file }, limit);
  }

  queryText(query: LocalKnowledgeTextQuery | string, limit = 20): LocalKnowledgeCandidate[] {
    const input = typeof query === "string" ? { text: query } : query;
    const queryTokens = Array.from(countTokens(input.text).entries());

    return this.documents
      .filter((document) => document.file !== input.excludeFile)
      .map((document) => ({
        document,
        score: scoreDocument(queryTokens, document)
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.document.title.localeCompare(right.document.title))
      .slice(0, limit)
      .map(({ document, score }) => ({
        file: document.file,
        title: document.title,
        headings: document.headings.slice(0, 8),
        tags: document.tags.slice(0, 12),
        snippet: bestSnippet(document.content, queryTokens.map(([token]) => token)),
        score: Number(score.toFixed(4))
      }));
  }

  getSnippet(filePath: string): string | undefined {
    const document = this.documents.find((item) => item.file === filePath);
    return document ? bestSnippet(document.content, []) : undefined;
  }

  size(): number {
    return this.documents.length;
  }
}

function stripIndexedFields(document: IndexedDocument): LocalKnowledgeDocument {
  return {
    file: document.file,
    title: document.title,
    headings: [...document.headings],
    tags: [...document.tags],
    frontmatter: document.frontmatter,
    content: document.content
  };
}

async function readDocument(app: App, file: TFile): Promise<LocalKnowledgeDocument> {
  const content = await app.vault.cachedRead(file);
  const cache = app.metadataCache.getFileCache(file);
  const frontmatter = cache?.frontmatter;
  const frontmatterTags = collectFrontmatterTags(frontmatter);
  const cacheTags = cache?.tags?.map((tag) => tag.tag.replace(/^#/u, "")) ?? [];

  return {
    file: file.path,
    title: file.basename,
    headings: cache?.headings?.map((heading) => heading.heading) ?? [],
    tags: unique([...frontmatterTags, ...cacheTags]),
    frontmatter,
    content
  };
}

function scoreDocument(queryTokens: Array<[string, number]>, document: IndexedDocument): number {
  let score = 0;
  for (const [token, queryWeight] of queryTokens) {
    const count = document.tokens.get(token) ?? 0;
    if (count === 0) {
      continue;
    }
    const titleBonus = document.title.toLowerCase().includes(token) ? 2.2 : 1;
    const pathBonus = document.file.toLowerCase().includes(token) ? 1.4 : 1;
    score += Math.sqrt(count) * Math.sqrt(queryWeight) * titleBonus * pathBonus;
  }
  return score;
}

function countTokens(text: string): Map<string, number> {
  const tokens = tokenize(text);
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const latin = lower.match(/[a-z0-9][a-z0-9_-]{1,}/gu) ?? [];
  const cjk = Array.from(lower.matchAll(/\p{Script=Han}/gu)).map((match) => match[0]);
  const cjkBigrams: string[] = [];
  for (let index = 0; index < cjk.length - 1; index += 1) {
    cjkBigrams.push(`${cjk[index]}${cjk[index + 1]}`);
  }

  return [...latin, ...cjk, ...cjkBigrams]
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

function bestSnippet(content: string, queryTokens: string[]): string {
  const lines = content
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return "";
  }

  const scored = lines.map((line, index) => {
    const lower = line.toLowerCase();
    const score = queryTokens.reduce((sum, token) => sum + (lower.includes(token) ? 1 : 0), 0);
    return { line, index, score };
  });
  const best = scored.sort((left, right) => right.score - left.score || left.index - right.index)[0] ?? scored[0];
  return best.line.slice(0, 220);
}

function collectFrontmatterTags(frontmatter?: Record<string, unknown>): string[] {
  const tags = frontmatter?.tags;
  if (Array.isArray(tags)) {
    return tags.map(String).map((tag) => tag.replace(/^#/u, ""));
  }
  if (typeof tags === "string") {
    return tags
      .split(/[,，\s]+/u)
      .map((tag) => tag.replace(/^#/u, ""))
      .filter(Boolean);
  }
  return [];
}

function stringifyFrontmatter(frontmatter?: Record<string, unknown>): string {
  if (!frontmatter) {
    return "";
  }
  return Object.entries(frontmatter)
    .map(([key, value]) => `${key} ${Array.isArray(value) ? value.join(" ") : String(value)}`)
    .join(" ");
}

function normalizePath(path: string): string {
  return path.replace(/\\/gu, "/").replace(/\/+$/u, "");
}

function pathAllowed(filePath: string, scope: LocalKnowledgeScope): boolean {
  const path = normalizePath(filePath).replace(/^\/+|\/+$/gu, "");
  const includes = normalizeFolders(scope.includeFolders);
  const excludes = normalizeFolders(scope.excludeFolders);
  if (includes.length > 0 && !includes.some((folder) => path === folder || path.startsWith(`${folder}/`))) {
    return false;
  }
  return !excludes.some((folder) => path === folder || path.startsWith(`${folder}/`));
}

function documentAllowed(document: LocalKnowledgeDocument, scope: LocalKnowledgeScope): boolean {
  const excludedTags = new Set((scope.excludeTags ?? []).map(normalizeTag).filter(Boolean));
  if (document.tags.some((tag) => excludedTags.has(normalizeTag(tag)))) {
    return false;
  }
  const frontmatter = document.frontmatter ?? {};
  return !(scope.excludeFrontmatter ?? []).some((key) => isTruthyFrontmatter(frontmatter[key]));
}

function normalizeFolders(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => normalizePath(String(value)).replace(/^\/+|\/+$/gu, "")).filter(Boolean);
}

function normalizeTag(value: string): string {
  return value.replace(/^#+/u, "").trim().toLowerCase();
}

function isTruthyFrontmatter(value: unknown): boolean {
  if (value === true || typeof value === "number" && value !== 0) {
    return true;
  }
  return typeof value === "string" && ["1", "true", "yes", "on", "private"].includes(value.trim().toLowerCase());
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
