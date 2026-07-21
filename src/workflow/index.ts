import { TFile, type App } from "obsidian";
import { mapInBatches } from "../core/async-batch";
import type { ArticleTypeSettings, ArticleTypesSettings, WorkflowStageSettings, WorkflowStagesSettings } from "../core/settings";
import type { OpenQuestion, OpenQuestionColor } from "../core/types";
import { normalizeWorkflowStageId, readExplicitWorkflowStage } from "../core/workflow-metadata";

export interface WorkflowSourceDocument {
  filePath: string;
  basename: string;
  content: string;
  /** Precomputed during Vault reads so the incremental cache does not retain full note bodies. */
  description?: string;
  tags: string[];
  headings: Array<{
    heading: string;
    level: number;
  }>;
  frontmatter?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowFileSummary {
  filePath: string;
  title: string;
  description: string;
  tags: string[];
  frontmatter?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  ageDays: number;
  stale: boolean;
  typeId?: string;
  typeTitle?: string;
  typeColor?: OpenQuestionColor;
  stageId?: string;
  stageTitle?: string;
  stageColor?: OpenQuestionColor;
  openQuestionCount: number;
  thinkCount: number;
  writeCount: number;
  nextAction: string;
  openUri: string;
}

export interface WorkflowStageSummary {
  id: string;
  title: string;
  description: string;
  color: OpenQuestionColor;
  limit: number;
  staleAfterDays: number;
  count: number;
  staleCount: number;
  files: WorkflowFileSummary[];
}

export interface WorkflowIndexPayload {
  schemaVersion: 1;
  generatedAt: string;
  vaultName: string;
  enabled: boolean;
  counts: {
    stages: number;
    uniqueFiles: number;
  };
  files?: WorkflowFileSummary[];
  stages: WorkflowStageSummary[];
}

export interface WorkflowQuery {
  stage?: string;
  limit?: number;
  search?: string;
  compact?: boolean;
}

export interface WorkflowSummaryPayload {
  enabled: boolean;
  stageCount: number;
  uniqueFiles: number;
  stages: Array<Omit<WorkflowStageSummary, "files" | "limit" | "staleAfterDays"> & {
    limit: number;
    staleAfterDays: number;
  }>;
}

export class WorkflowIndex {
  private payload: WorkflowIndexPayload = emptyWorkflowPayload("Obsidian", false);
  private readonly documentsByPath = new Map<string, WorkflowSourceDocument>();
  private activeRebuild?: { changes: Map<string, WorkflowSourceDocument | null> };

  constructor(
    private readonly app: App,
    private readonly getWorkflowSettings: () => WorkflowStagesSettings,
    private readonly getArticleTypesSettings: () => ArticleTypesSettings,
    private readonly getExportDirectory: () => string,
    private readonly getQuestions: () => OpenQuestion[]
  ) {}

  async rebuild(): Promise<void> {
    const settings = this.getWorkflowSettings();
    const articleTypes = this.getArticleTypesSettings();
    const vaultName = this.app.vault.getName();
    const generatedAt = new Date().toISOString();

    if (!settings.enabled && !articleTypes.enabled) {
      this.documentsByPath.clear();
      this.payload = emptyWorkflowPayload(vaultName, false, generatedAt);
      return;
    }

    const rebuild = { changes: new Map<string, WorkflowSourceDocument | null>() };
    this.activeRebuild = rebuild;
    try {
      const documents = await readWorkflowDocuments(this.app, this.getExportDirectory());
      if (this.activeRebuild !== rebuild) {
        return;
      }
      const next = new Map(documents.map((document) => [document.filePath, document]));
      for (const [filePath, document] of rebuild.changes) {
        if (document) {
          next.set(filePath, document);
        } else {
          next.delete(filePath);
        }
      }
      this.documentsByPath.clear();
      for (const [filePath, document] of next) {
        this.documentsByPath.set(filePath, document);
      }
      this.rebuildPayload(generatedAt);
    } finally {
      if (this.activeRebuild === rebuild) {
        this.activeRebuild = undefined;
      }
    }
  }

  async upsert(file: TFile): Promise<void> {
    await this.upsertFiles([file]);
  }

  async upsertFiles(files: TFile[]): Promise<void> {
    const settings = this.getWorkflowSettings();
    const articleTypes = this.getArticleTypesSettings();
    if (!settings.enabled && !articleTypes.enabled) {
      this.documentsByPath.clear();
      this.payload = emptyWorkflowPayload(this.app.vault.getName(), false);
      return;
    }

    const ignoredPrefix = normalizePath(this.getExportDirectory());
    const readable: TFile[] = [];
    let changed = false;
    for (const file of files) {
      if (file.extension !== "md" || pathStartsWith(normalizePath(file.path), ignoredPrefix)) {
        changed = this.documentsByPath.delete(file.path) || changed;
        this.activeRebuild?.changes.set(file.path, null);
      } else {
        readable.push(file);
      }
    }

    const documents = await Promise.all(readable.map((file) => readWorkflowDocument(this.app, file)));
    for (const document of documents) {
      this.documentsByPath.set(document.filePath, document);
      this.activeRebuild?.changes.set(document.filePath, document);
      changed = true;
    }
    if (changed) {
      this.rebuildPayload();
    }
  }

  removeFile(filePath: string): void {
    this.activeRebuild?.changes.set(filePath, null);
    if (this.documentsByPath.delete(filePath)) {
      this.rebuildPayload();
    }
  }

  refreshQuestions(): void {
    this.rebuildPayload();
  }

  private rebuildPayload(generatedAt = new Date().toISOString()): void {
    const settings = this.getWorkflowSettings();
    const articleTypes = this.getArticleTypesSettings();
    const vaultName = this.app.vault.getName();
    if (!settings.enabled && !articleTypes.enabled) {
      this.payload = emptyWorkflowPayload(vaultName, false, generatedAt);
      return;
    }
    this.payload = buildWorkflowPayload({
      settings,
      articleTypes,
      documents: Array.from(this.documentsByPath.values()),
      questions: this.getQuestions(),
      vaultName,
      generatedAt
    });
  }

  getPayload(query: WorkflowQuery = {}): WorkflowIndexPayload {
    return queryWorkflowPayload(this.payload, query);
  }

  getSummary(): WorkflowSummaryPayload {
    return {
      enabled: this.payload.enabled,
      stageCount: this.payload.counts.stages,
      uniqueFiles: this.payload.counts.uniqueFiles,
      stages: this.payload.stages.map((stage) => ({
        id: stage.id,
        title: stage.title,
        description: stage.description,
        color: stage.color,
        limit: stage.limit,
        staleAfterDays: stage.staleAfterDays,
        count: stage.count,
        staleCount: stage.staleCount
      }))
    };
  }
}

export function buildWorkflowPayload(options: {
  settings: WorkflowStagesSettings;
  articleTypes?: ArticleTypesSettings;
  documents: WorkflowSourceDocument[];
  questions: OpenQuestion[];
  vaultName: string;
  generatedAt?: string;
  query?: WorkflowQuery;
}): WorkflowIndexPayload {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const articleTypes = normalizeArticleTypes(options.articleTypes);
  if (!options.settings.enabled && !articleTypes.enabled) {
    return emptyWorkflowPayload(options.vaultName, false, generatedAt);
  }

  const questionMap = groupQuestionsByFile(options.questions);
  const stages = options.settings.enabled
    ? normalizeStages(options.settings.stages)
      .map((stage) => buildStage(stage, options.documents, questionMap, options.vaultName, generatedAt, articleTypes))
    : [];
  const files = buildClassifiedFiles(options.documents, questionMap, options.vaultName, generatedAt, stages, articleTypes);

  const payload: WorkflowIndexPayload = {
    schemaVersion: 1,
    generatedAt,
    vaultName: options.vaultName,
    enabled: true,
    counts: {
      stages: stages.length,
      uniqueFiles: files.length
    },
    files,
    stages
  };

  return options.query ? queryWorkflowPayload(payload, options.query) : payload;
}

export function queryWorkflowPayload(payload: WorkflowIndexPayload, query: WorkflowQuery = {}): WorkflowIndexPayload {
  const search = query.search?.trim().toLowerCase();
  const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 200) : undefined;
  const stageId = query.stage?.trim();
  const matchedFiles = (payload.files ?? []).filter((file) => {
    if (stageId && file.stageId !== stageId) {
      return false;
    }
    return !search || workflowFileMatchesSearch(file, search);
  });

  const stageMatches = payload.stages
    .filter((stage) => !stageId || stage.id === stageId)
    .map((stage) => {
      const matched = stage.files.filter((file) => !search || workflowFileMatchesSearch(file, search));
      return { stage, matched };
    });

  const stages = stageMatches
    .map(({ stage, matched }) => {
      const effectiveLimit = limit ?? stage.limit;
      return {
        ...stage,
        count: matched.length,
        staleCount: matched.filter((file) => file.stale).length,
        files: matched.slice(0, effectiveLimit).map((file) => query.compact ? compactWorkflowFile(file) : file)
      };
    });

  return {
    ...payload,
    counts: {
      stages: stages.length,
      uniqueFiles: matchedFiles.length
    },
    files: (limit ? matchedFiles.slice(0, limit) : matchedFiles).map((file) => query.compact ? compactWorkflowFile(file) : file),
    stages
  };
}

export function workflowQueryFromUrl(url: URL): WorkflowQuery {
  const stage = url.searchParams.get("stage")?.trim();
  const search = url.searchParams.get("search")?.trim();
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  return {
    stage: stage || undefined,
    search: search || undefined,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : undefined,
    compact: url.searchParams.get("compact") === "1" || url.searchParams.get("compact") === "true"
  };
}

export function matchWorkflowStage(
  document: Pick<WorkflowSourceDocument, "filePath" | "tags" | "frontmatter">,
  stage: WorkflowStageSettings,
  parseHierarchicalTags = true
): boolean {
  const explicitStage = readExplicitWorkflowStage(document.frontmatter);
  if (explicitStage) {
    return normalizeWorkflowStageId(explicitStage) === normalizeWorkflowStageId(stage.id);
  }

  const folders = normalizeList(stage.folderPrefixes).map(normalizePath);
  const tags = new Set(normalizeList(stage.tags).map(normalizeTag));
  const filePath = normalizePath(document.filePath);
  const documentTags = tagTokens(document.tags, parseHierarchicalTags);

  const folderMatched = folders.some((prefix) => pathStartsWith(filePath, prefix));
  const tagMatched = Array.from(tags).some((tag) => documentTags.has(tag));
  return folderMatched || tagMatched;
}

export function titleForWorkflowDocument(document: WorkflowSourceDocument): string {
  return readFrontmatterString(document.frontmatter, "title")
    || document.headings.find((heading) => heading.level === 1)?.heading
    || document.basename.replace(/\.md$/iu, "");
}

export function descriptionForWorkflowDocument(document: WorkflowSourceDocument): string {
  return truncateText(
    readFrontmatterString(document.frontmatter, "description")
      || readFrontmatterString(document.frontmatter, "summary")
      || document.description
      || firstBodyParagraph(document.content),
    180
  );
}

export function nextActionForWorkflowDocument(document: WorkflowSourceDocument, questions: OpenQuestion[]): string {
  const frontmatterAction = readFrontmatterString(document.frontmatter, "next")
    || readFrontmatterString(document.frontmatter, "next_action")
    || readFrontmatterString(document.frontmatter, "todo")
    || readFrontmatterString(document.frontmatter, "action");
  if (frontmatterAction) {
    return frontmatterAction;
  }

  const question = questions.find((item) => isWorkStatus(item.status));
  return question?.title || question?.question || "";
}

function buildStage(
  stage: WorkflowStageSettings,
  documents: WorkflowSourceDocument[],
  questionMap: Map<string, OpenQuestion[]>,
  vaultName: string,
  generatedAt: string,
  articleTypes: NormalizedArticleTypes
): WorkflowStageSummary {
  const limit = clampInteger(stage.limit, 1, 200, 20);
  const files = documents
    .filter((document) => matchWorkflowStage(document, stage, articleTypes.parseHierarchicalTags))
    .map((document) => summarizeWorkflowFile(
      document,
      questionMap.get(document.filePath) ?? [],
      vaultName,
      generatedAt,
      stage.staleAfterDays,
      stage,
      matchArticleType(document, articleTypes)
    ))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title));

  return {
    id: stage.id,
    title: stage.title,
    description: stage.description,
    color: stage.color,
    limit,
    staleAfterDays: Math.max(0, Math.floor(stage.staleAfterDays || 0)),
    count: files.length,
    staleCount: files.filter((file) => file.stale).length,
    files
  };
}

function summarizeWorkflowFile(
  document: WorkflowSourceDocument,
  questions: OpenQuestion[],
  vaultName: string,
  generatedAt: string,
  staleAfterDays: number,
  stage?: WorkflowStageSettings,
  articleType?: ArticleTypeSettings
): WorkflowFileSummary {
  const workQuestions = questions.filter((question) => isWorkStatus(question.status));
  const ageDays = daysBetween(document.updatedAt, generatedAt);

  return {
    filePath: document.filePath,
    title: titleForWorkflowDocument(document),
    description: descriptionForWorkflowDocument(document),
    tags: document.tags,
    frontmatter: document.frontmatter,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    ageDays,
    stale: staleAfterDays > 0 && ageDays >= staleAfterDays,
    typeId: articleType?.id,
    typeTitle: articleType?.title,
    typeColor: articleType?.color,
    stageId: stage?.id,
    stageTitle: stage?.title,
    stageColor: stage?.color,
    openQuestionCount: workQuestions.length,
    thinkCount: workQuestions.filter((question) => question.lane === "think").length,
    writeCount: workQuestions.filter((question) => question.lane === "write").length,
    nextAction: nextActionForWorkflowDocument(document, questions),
    openUri: buildFileObsidianUri(vaultName, document.filePath)
  };
}

async function readWorkflowDocuments(app: App, exportDirectory: string): Promise<WorkflowSourceDocument[]> {
  const ignoredPrefix = normalizePath(exportDirectory);
  const files = app.vault.getMarkdownFiles()
    .filter((file) => !pathStartsWith(normalizePath(file.path), ignoredPrefix));

  return mapInBatches(files, (file) => readWorkflowDocument(app, file));
}

async function readWorkflowDocument(app: App, file: TFile): Promise<WorkflowSourceDocument> {
  const content = await app.vault.cachedRead(file);
  const cache = app.metadataCache.getFileCache(file);
  const frontmatter = cache?.frontmatter;
  const frontmatterTags = collectFrontmatterTags(frontmatter);
  const cacheTags = cache?.tags?.map((tag) => tag.tag.replace(/^#/u, "")) ?? [];
  const inlineTags = collectInlineTags(content);

  return {
    filePath: file.path,
    basename: file.basename || file.path.split("/").pop()?.replace(/\.md$/iu, "") || file.path,
    content: "",
    description: firstBodyParagraph(content),
    tags: unique([...frontmatterTags, ...cacheTags, ...inlineTags].map(normalizeTag).filter(Boolean)),
    headings: cache?.headings?.map((heading) => ({
      heading: heading.heading,
      level: heading.level
    })) ?? [],
    frontmatter,
    createdAt: new Date(file.stat.ctime).toISOString(),
    updatedAt: new Date(file.stat.mtime).toISOString()
  };
}

function emptyWorkflowPayload(vaultName: string, enabled: boolean, generatedAt = new Date().toISOString()): WorkflowIndexPayload {
  return {
    schemaVersion: 1,
    generatedAt,
    vaultName,
    enabled,
    counts: {
      stages: 0,
      uniqueFiles: 0
    },
    files: [],
    stages: []
  };
}

interface NormalizedArticleTypes {
  enabled: boolean;
  parseHierarchicalTags: boolean;
  types: ArticleTypeSettings[];
}

function normalizeArticleTypes(settings?: ArticleTypesSettings): NormalizedArticleTypes {
  return {
    enabled: settings?.enabled === true,
    parseHierarchicalTags: settings?.parseHierarchicalTags !== false,
    types: settings?.types ?? []
  };
}

function buildClassifiedFiles(
  documents: WorkflowSourceDocument[],
  questionMap: Map<string, OpenQuestion[]>,
  vaultName: string,
  generatedAt: string,
  stages: WorkflowStageSummary[],
  articleTypes: NormalizedArticleTypes
): WorkflowFileSummary[] {
  const byFile = new Map<string, WorkflowFileSummary>();
  for (const stage of stages) {
    for (const file of stage.files) {
      if (!byFile.has(file.filePath)) {
        byFile.set(file.filePath, file);
      }
    }
  }

  for (const document of documents) {
    if (byFile.has(document.filePath)) {
      continue;
    }
    const articleType = matchArticleType(document, articleTypes);
    if (!articleType) {
      continue;
    }
    byFile.set(document.filePath, summarizeWorkflowFile(
      document,
      questionMap.get(document.filePath) ?? [],
      vaultName,
      generatedAt,
      0,
      undefined,
      articleType
    ));
  }

  return Array.from(byFile.values())
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title));
}

function matchArticleType(
  document: Pick<WorkflowSourceDocument, "filePath" | "tags">,
  articleTypes: NormalizedArticleTypes
): ArticleTypeSettings | undefined {
  if (!articleTypes.enabled) {
    return undefined;
  }
  const filePath = normalizePath(document.filePath);
  const documentTags = tagTokens(document.tags, articleTypes.parseHierarchicalTags);
  const hierarchicalTypes = new Set(
    articleTypes.parseHierarchicalTags
      ? document.tags
        .map(normalizeTag)
        .filter((tag) => tag.includes("/"))
        .map((tag) => tag.split("/").filter(Boolean)[0])
        .filter(Boolean)
      : []
  );

  return articleTypes.types.find((type) => {
    const folders = normalizeList(type.folderPrefixes).map(normalizePath);
    const tags = new Set(normalizeList(type.tags).map(normalizeTag));
    const folderMatched = folders.some((prefix) => pathStartsWith(filePath, prefix));
    const tagMatched = Array.from(tags).some((tag) => documentTags.has(tag));
    const hierarchyMatched = hierarchicalTypes.has(normalizeTag(type.id));
    return folderMatched || tagMatched || hierarchyMatched;
  });
}

function normalizeStages(stages: WorkflowStageSettings[]): WorkflowStageSettings[] {
  const seen = new Set<string>();
  const normalized: WorkflowStageSettings[] = [];

  for (const stage of stages) {
    const id = normalizeStageId(stage.id);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push({
      id,
      title: stage.title.trim() || id,
      description: stage.description.trim(),
      color: isWorkflowColor(stage.color) ? stage.color : "slate",
      folderPrefixes: normalizeList(stage.folderPrefixes),
      tags: normalizeList(stage.tags).map(normalizeTag).filter(Boolean),
      limit: clampInteger(stage.limit, 1, 200, 20),
      staleAfterDays: Math.max(0, Math.floor(Number(stage.staleAfterDays) || 0))
    });
  }

  return normalized;
}

function groupQuestionsByFile(questions: OpenQuestion[]): Map<string, OpenQuestion[]> {
  const byFile = new Map<string, OpenQuestion[]>();
  for (const question of questions) {
    const existing = byFile.get(question.source.file) ?? [];
    existing.push(question);
    byFile.set(question.source.file, existing);
  }
  return byFile;
}

function collectFrontmatterTags(frontmatter?: Record<string, unknown>): string[] {
  const raw = frontmatter?.tags ?? frontmatter?.tag;
  if (Array.isArray(raw)) {
    return raw.map(String);
  }
  if (typeof raw === "string") {
    return raw.split(/[,，\s]+/u);
  }
  return [];
}

function collectInlineTags(content: string): string[] {
  const tags: string[] = [];
  const body = stripFrontmatter(content);
  const tagPattern = /(^|[\s([{])#([\p{L}\p{N}_/-]+)/gu;
  for (const match of body.matchAll(tagPattern)) {
    tags.push(match[2]);
  }
  return tags;
}

function firstBodyParagraph(content: string): string {
  const lines = stripFrontmatter(content)
    .replace(/\r\n?/gu, "\n")
    .split("\n");
  const paragraph: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^#{1,6}\s/u.test(trimmed) || /^```/u.test(trimmed) || /^[-*]\s+\[[ xX]\]/u.test(trimmed)) {
      if (paragraph.length > 0) {
        break;
      }
      continue;
    }
    paragraph.push(stripMarkdown(trimmed));
  }

  return paragraph.join(" ").trim();
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/u, "");
}

function stripMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]+\)/gu, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/gu, "$2")
    .replace(/\[\[([^\]]+)\]\]/gu, "$1")
    .replace(/[*_`>#-]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function readFrontmatterString(frontmatter: Record<string, unknown> | undefined, key: string): string {
  const value = frontmatter?.[key];
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function workflowFileMatchesSearch(file: WorkflowFileSummary, search: string): boolean {
  return [
    file.filePath,
    file.title,
    file.description,
    file.nextAction,
    file.typeTitle,
    file.stageTitle,
    file.tags.join(" "),
    stringifyFrontmatter(file.frontmatter)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(search);
}

function compactWorkflowFile(file: WorkflowFileSummary): WorkflowFileSummary {
  const compact = { ...file };
  delete compact.frontmatter;
  return compact;
}

function uniqueFileCount(stages: Array<Pick<WorkflowStageSummary, "files">>): number {
  return new Set(stages.flatMap((stage) => stage.files.map((file) => file.filePath))).size;
}

function stringifyFrontmatter(frontmatter?: Record<string, unknown>): string {
  if (!frontmatter) {
    return "";
  }
  return Object.entries(frontmatter)
    .map(([key, value]) => `${key} ${Array.isArray(value) ? value.join(" ") : String(value)}`)
    .join(" ");
}

function buildFileObsidianUri(vaultName: string, filePath: string): string {
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(filePath)}`;
}

function daysBetween(earlier: string, later: string): number {
  const start = Date.parse(earlier);
  const end = Date.parse(later);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }
  return Math.floor((end - start) / 86_400_000);
}

function isWorkStatus(status: string): boolean {
  return status !== "candidate" && status !== "resolved" && status !== "ignored";
}

function pathStartsWith(filePath: string, prefix: string): boolean {
  const normalizedPrefix = prefix.replace(/\/+$/u, "");
  return filePath === normalizedPrefix || filePath.startsWith(`${normalizedPrefix}/`);
}

function normalizePath(value: string): string {
  return value.replace(/\\/gu, "/").replace(/^\/+/u, "").replace(/\/+$/u, "");
}

function normalizeList(value: string[] | undefined): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of value ?? []) {
    const normalized = item.trim().replace(/^#+/u, "").replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/u, "").toLowerCase();
}

function tagTokens(values: string[], parseHierarchicalTags: boolean): Set<string> {
  const tokens = new Set<string>();
  for (const value of values) {
    const tag = normalizeTag(value);
    if (!tag) {
      continue;
    }
    tokens.add(tag);
    if (!parseHierarchicalTags || !tag.includes("/")) {
      continue;
    }
    for (const part of tag.split("/")) {
      const normalized = normalizeTag(part);
      if (normalized) {
        tokens.add(normalized);
      }
    }
  }
  return tokens;
}

function normalizeStageId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9_-]/gu, "");
}

function truncateText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1)}…`;
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function isWorkflowColor(value: unknown): value is OpenQuestionColor {
  return value === "amber"
    || value === "mint"
    || value === "sky"
    || value === "rose"
    || value === "violet"
    || value === "slate";
}
