import type { App, TFile } from "obsidian";
import { tokenize } from "../ai/local-index";
import type { LocalKnowledgeCandidate } from "../ai/types";
import { shortHash } from "../core/hash";
import type { ToWriteSettings } from "../core/settings";
import type { OpenQuestion } from "../core/types";
import {
  CAPTURE_SCHEMA_VERSION,
  type CaptureConfidence,
  type CaptureDraft,
  type CaptureRecommendationSet,
  type CaptureRecommendationSettings,
  type CaptureTargetCandidate,
  type CaptureWorkflowStage
} from "./types";
import {
  MISSING_TARGET_REVISION,
  captureCandidateId,
  captureContentRevision,
  captureFolderRevision,
  normalizeCapturePath
} from "./revision";

export interface CaptureLocalKnowledgeIndex {
  queryText?(query: string | { text: string; excludeFile?: string }, limit?: number): LocalKnowledgeCandidate[];
  query?(question: OpenQuestion, limit?: number): LocalKnowledgeCandidate[];
}

interface NoteScore {
  file: TFile;
  score: number;
  matchedTags: string[];
  fromLocalIndex: boolean;
  sourceNote: boolean;
  linkedFromSource: boolean;
  sameArticleType: boolean;
  sameWorkflowStage: boolean;
  recentlyUsed: boolean;
}

interface StageScore {
  stage: CaptureWorkflowStage;
  folder: string;
  score: number;
  sourceMatch: boolean;
  tagMatches: string[];
}

/**
 * Fast, deterministic local target recommendation. It never invents a path:
 * every result comes from the vault, configured target folders/stages, or Inbox.
 */
export class CaptureTargetRecommender {
  constructor(
    private readonly app: App,
    private settings: CaptureRecommendationSettings,
    private readonly localIndex?: CaptureLocalKnowledgeIndex
  ) {}

  updateSettings(settings: CaptureRecommendationSettings): void {
    this.settings = settings;
  }

  async recommend(draft: CaptureDraft): Promise<CaptureRecommendationSet> {
    assertCaptureDraft(draft);
    const inboxPath = markdownPath(this.settings.inboxFile || "00-Raw/Device Inbox.md");
    const existing = await this.existingNoteCandidate(draft, inboxPath);
    const folder = this.folderCandidate(draft, inboxPath);
    const inbox = await this.inboxCandidate(inboxPath);
    const candidates = applyConfirmedRouteBoost(draft, [existing, folder, inbox], this.settings.confirmedRoutes ?? []);

    return {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      draftId: draft.id,
      candidates,
      selectedCandidateId: selectDefaultCaptureTarget(candidates).id
    };
  }

  async recommendCandidates(draft: CaptureDraft): Promise<CaptureTargetCandidate[]> {
    return (await this.recommend(draft)).candidates;
  }

  private async existingNoteCandidate(draft: CaptureDraft, inboxPath: string): Promise<CaptureTargetCandidate> {
    const note = this.bestExistingNote(draft, inboxPath);
    const path = note?.file.path ? normalizeCapturePath(note.file.path) : inboxPath;
    const targetRevision = await readNoteRevision(this.app, path);
    const score = note ? roundScore(note.score) : 0;
    const confidence = note ? confidenceForNote(score, note.sourceNote) : "weak";

    return {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      id: captureCandidateId("existingNote", "append", path),
      kind: "existingNote",
      action: "append",
      path,
      heading: normalizeHeading(this.settings.appendHeading),
      reason: noteReason(note),
      confidence,
      score,
      targetRevision
    };
  }

  private bestExistingNote(draft: CaptureDraft, inboxPath: string): NoteScore | undefined {
    const sourcePath = normalizeCapturePath(draft.source?.file ?? "");
    const included = normalizedPrefixes(this.settings.includeFolders);
    const excluded = normalizedPrefixes(this.settings.excludeFolders);
    const excludedTags = new Set((this.settings.excludeTags ?? []).map(normalizeTag).filter(Boolean));
    const excludedFrontmatter = new Set((this.settings.excludeFrontmatter ?? []).map((key) => String(key).trim()).filter(Boolean));
    const localScores = new Map<string, number>();
    if (this.localIndex) {
      for (const item of queryLocalIndex(this.localIndex, draft)) {
        localScores.set(normalizeCapturePath(item.file), Number.isFinite(item.score) ? item.score : 0);
      }
    }

    const draftTokens = new Set(tokenize([draft.title, draft.body, draft.tags.join(" ")].filter(Boolean).join("\n")));
    const draftTags = new Set(draft.tags.map(normalizeTag).filter(Boolean));
    const sourceLinks = sourcePath ? this.app.metadataCache.resolvedLinks?.[sourcePath] ?? {} : {};
    const sourceArticleType = normalizeTag(draft.source?.articleTypeId ?? "");
    const sourceWorkflowStage = String(draft.source?.workflowStageId ?? "").trim();
    const workflowStage = (this.settings.workflowStages ?? []).find((stage) => stage.id === sourceWorkflowStage);
    const scored: NoteScore[] = [];

    for (const file of this.app.vault.getMarkdownFiles()) {
      const path = normalizeCapturePath(file.path);
      if (!path || (included.length > 0 && !isIncluded(path, included)) || isExcluded(path, excluded)) {
        continue;
      }
      // Keep Inbox as the fallback slot unless the vault has no other note at all.
      if (path === inboxPath) {
        continue;
      }
      const cache = this.app.metadataCache.getFileCache(file);
      const tags = collectTags(cache?.frontmatter, cache?.tags?.map((item) => item.tag));
      if (tags.some((tag) => excludedTags.has(tag)) || hasExcludedFrontmatter(cache?.frontmatter, excludedFrontmatter)) {
        continue;
      }
      const matchedTags = tags.filter((tag) => draftTags.has(tag));
      const headings = cache?.headings?.map((item) => item.heading) ?? [];
      const searchable = [file.basename, path, ...headings, ...tags].join(" ");
      const overlap = tokenOverlap(draftTokens, tokenize(searchable));
      const sourceNote = Boolean(sourcePath && path === sourcePath);
      const linkedFromSource = Number(sourceLinks[path] ?? 0) > 0;
      const noteArticleTypes = [
        cache?.frontmatter?.article_type,
        cache?.frontmatter?.articleType,
        cache?.frontmatter?.type
      ].flatMap(stringValues).map(normalizeTag).filter(Boolean);
      const sameArticleType = Boolean(sourceArticleType && noteArticleTypes.includes(sourceArticleType));
      const sameWorkflowStage = Boolean(workflowStage && (
        workflowStage.folderPrefixes.some((prefix) => isPathWithin(path, normalizeCapturePath(prefix)))
        || workflowStage.tags.map(normalizeTag).some((tag) => tags.includes(tag))
      ));
      const recentScore = recentUseScore(file.stat.mtime);
      const localScore = localScores.get(path) ?? 0;
      const titleTokens = new Set(tokenize(file.basename));
      const titleOverlap = Array.from(draftTokens).filter((token) => titleTokens.has(token)).length;
      const score = (sourceNote ? 24 : 0)
        + (linkedFromSource ? 10 : 0)
        + (sameArticleType ? 7 : 0)
        + (sameWorkflowStage ? 8 : 0)
        + matchedTags.length * 6
        + titleOverlap * 4
        + overlap * 1.5
        + Math.min(18, Math.sqrt(Math.max(0, localScore)) * 3)
        + recentScore;
      scored.push({
        file,
        score,
        matchedTags,
        fromLocalIndex: localScore > 0,
        sourceNote,
        linkedFromSource,
        sameArticleType,
        sameWorkflowStage,
        recentlyUsed: recentScore >= 2
      });
    }

    return scored.sort((left, right) => right.score - left.score || compareText(normalizeCapturePath(left.file.path), normalizeCapturePath(right.file.path)))[0];
  }

  private folderCandidate(draft: CaptureDraft, inboxPath: string): CaptureTargetCandidate {
    const stage = bestStage(draft, this.settings.workflowStages ?? []);
    const configuredFolders = normalizedPrefixes(this.settings.targetFolders);
    const inboxFolder = inboxPath.split("/").slice(0, -1).join("/");
    const path = normalizeCapturePath(stage?.folder || configuredFolders[0] || inboxFolder);
    const score = roundScore(stage?.score ?? (configuredFolders.length > 0 ? 2 : 0));
    const confidence: CaptureConfidence = stage
      ? stage.sourceMatch || stage.score >= 12 ? "strong" : "medium"
      : "weak";
    const stageId = stage?.stage.id;

    return {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      id: captureCandidateId("folder", "create", path, stageId),
      kind: "folder",
      action: "create",
      path,
      stageId,
      reason: stage
        ? stage.sourceMatch
          ? `The source note is already in the ${stage.stage.title} workflow stage.`
          : `Tags and topic match the ${stage.stage.title} workflow stage.`
        : configuredFolders.length > 0
          ? "Uses the first configured capture folder."
          : "Uses the Inbox folder as the safe create fallback.",
      confidence,
      score,
      targetRevision: captureFolderRevision(path, this.settings.settingsRevision, stageId)
    };
  }

  private async inboxCandidate(inboxPath: string): Promise<CaptureTargetCandidate> {
    return {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      id: captureCandidateId("inbox", "append", inboxPath),
      kind: "inbox",
      action: "append",
      path: inboxPath,
      heading: normalizeHeading(this.settings.appendHeading),
      reason: "Inbox is always available as the predictable fallback.",
      confidence: "strong",
      score: 1,
      targetRevision: await readNoteRevision(this.app, inboxPath)
    };
  }
}

function applyConfirmedRouteBoost(
  draft: CaptureDraft,
  candidates: CaptureTargetCandidate[],
  routes: NonNullable<CaptureRecommendationSettings["confirmedRoutes"]>
): CaptureTargetCandidate[] {
  const matchingTargetIds = new Set(routes
    .filter((route) => routeContextMatches(route.context, draft))
    .map((route) => route.targetId));
  if (matchingTargetIds.size === 0) {
    return candidates;
  }
  const boosted = candidates.map((candidate) => matchingTargetIds.has(candidate.id) ? {
    ...candidate,
    reason: `${candidate.reason} You previously confirmed this destination for similar captures.`,
    confidence: "strong" as const,
    score: candidate.score + 40
  } : candidate);
  return boosted.sort((left, right) => {
    const leftMatched = matchingTargetIds.has(left.id) ? 1 : 0;
    const rightMatched = matchingTargetIds.has(right.id) ? 1 : 0;
    return rightMatched - leftMatched;
  });
}

function routeContextMatches(
  context: NonNullable<CaptureRecommendationSettings["confirmedRoutes"]>[number]["context"],
  draft: CaptureDraft
): boolean {
  if (context.entryPoint && context.entryPoint !== draft.source?.entryPoint) {
    return false;
  }
  if (context.workflowStageId && context.workflowStageId !== draft.source?.workflowStageId) {
    return false;
  }
  if (context.articleTypeId && context.articleTypeId !== draft.source?.articleTypeId) {
    return false;
  }
  return true;
}

export function captureRecommendationSettingsFromPluginSettings(
  settings: Pick<ToWriteSettings, "deviceCapture" | "workflowStages">
): CaptureRecommendationSettings {
  const capture = settings.deviceCapture;
  const workflowStages = settings.workflowStages.enabled ? settings.workflowStages.stages : [];
  const revisionPayload = {
    inboxFile: capture.inboxFile,
    targetFolders: capture.targetFolders,
    appendHeading: capture.appendHeading,
    includeFolders: capture.includeFolders,
    excludeFolders: capture.excludeFolders,
    excludeTags: capture.excludeTags,
    excludeFrontmatter: capture.excludeFrontmatter,
    workflowStages
  };
  return {
    ...revisionPayload,
    workflowStages,
    settingsRevision: shortHash(JSON.stringify(revisionPayload))
  };
}

export function selectDefaultCaptureTarget(candidates: CaptureTargetCandidate[]): CaptureTargetCandidate {
  const confident = candidates.find((candidate) => candidate.kind !== "inbox" && candidate.confidence !== "weak");
  if (confident) {
    return confident;
  }
  return candidates.find((candidate) => candidate.kind === "inbox") ?? candidates[0] ?? invalidFallbackCandidate();
}

async function readNoteRevision(app: App, path: string): Promise<string> {
  const file = app.vault.getFileByPath(path);
  if (!file) {
    return MISSING_TARGET_REVISION;
  }
  try {
    const content = await app.vault.cachedRead(file);
    return captureContentRevision(content);
  } catch {
    return `unavailable-${shortHash(`${path}\u0000${file.stat.mtime}\u0000${file.stat.size}`)}`;
  }
}

function bestStage(draft: CaptureDraft, stages: CaptureWorkflowStage[]): StageScore | undefined {
  const sourcePath = normalizeCapturePath(draft.source?.file ?? "");
  const draftTags = new Set(draft.tags.map(normalizeTag).filter(Boolean));
  const draftTokens = new Set(tokenize([draft.title, draft.body, ...draft.tags].filter(Boolean).join(" ")));
  const scores: StageScore[] = [];

  for (const stage of stages) {
    const folders = normalizedPrefixes(stage.folderPrefixes);
    const folder = folders[0];
    if (!folder) {
      continue;
    }
    const sourceMatch = folders.some((prefix) => sourcePath === prefix || sourcePath.startsWith(`${prefix}/`));
    const stageTags = stage.tags.map(normalizeTag).filter(Boolean);
    const tagMatches = stageTags.filter((tag) => draftTags.has(tag));
    const stageTokens = new Set(tokenize([stage.id, stage.title, ...stageTags].join(" ")));
    const topicMatches = Array.from(draftTokens).filter((token) => stageTokens.has(token)).length;
    const score = (sourceMatch ? 20 : 0) + tagMatches.length * 8 + topicMatches * 3;
    if (score > 0) {
      scores.push({ stage, folder, score, sourceMatch, tagMatches });
    }
  }

  return scores.sort((left, right) => right.score - left.score || compareText(left.stage.id, right.stage.id))[0];
}

function draftAsQuestion(draft: CaptureDraft): OpenQuestion {
  return {
    id: `capture_${draft.id}`,
    title: draft.title,
    lane: "write",
    status: "open",
    kind: "other",
    tags: draft.tags,
    color: "slate",
    question: draft.body,
    anchorText: draft.source?.selection,
    source: {
      file: normalizeCapturePath(draft.source?.file ?? ""),
      headingPath: draft.source?.headingPath ?? [],
      lineStart: 0,
      lineEnd: 0,
      rule: "selection"
    }
  };
}

function queryLocalIndex(index: CaptureLocalKnowledgeIndex, draft: CaptureDraft): LocalKnowledgeCandidate[] {
  try {
    if (index.queryText) {
      return index.queryText({
        text: [draft.title, draft.body, draft.tags.join(" "), draft.source?.headingPath?.join(" ")]
          .filter(Boolean)
          .join("\n"),
        excludeFile: normalizeCapturePath(draft.source?.file ?? "") || undefined
      }, 20);
    }
    return index.query?.(draftAsQuestion(draft), 20) ?? [];
  } catch {
    return [];
  }
}

function collectTags(frontmatter: Record<string, unknown> | undefined, cacheTags: string[] | undefined): string[] {
  const raw = frontmatter?.tags;
  const frontmatterTags = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === "string"
      ? raw.split(/[,;\s，、；]+/u)
      : [];
  return Array.from(new Set([...frontmatterTags, ...(cacheTags ?? [])].map(normalizeTag).filter(Boolean)));
}

function normalizedPrefixes(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map(normalizeCapturePath).filter(Boolean)));
}

function isExcluded(path: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function isIncluded(path: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function isPathWithin(path: string, prefix: string): boolean {
  return Boolean(prefix && (path === prefix || path.startsWith(`${prefix}/`)));
}

function hasExcludedFrontmatter(frontmatter: Record<string, unknown> | undefined, keys: Set<string>): boolean {
  if (!frontmatter || keys.size === 0) {
    return false;
  }
  return Array.from(keys).some((key) => Boolean(frontmatter[key]));
}

function normalizeTag(tag: string): string {
  return String(tag).trim().replace(/^#+/u, "").toLowerCase();
}

function tokenOverlap(left: Set<string>, rightTokens: string[]): number {
  return Array.from(new Set(rightTokens)).filter((token) => left.has(token)).length;
}

function confidenceForNote(score: number, sourceNote: boolean): CaptureConfidence {
  if (sourceNote || score >= 16) {
    return "strong";
  }
  return score >= 5 ? "medium" : "weak";
}

function noteReason(note: NoteScore | undefined): string {
  if (!note) {
    return "No related note is indexed yet; append to Inbox instead.";
  }
  if (note.sourceNote) {
    return "The current source note provides the closest context.";
  }
  if (note.linkedFromSource) {
    return "The source note already links to this destination.";
  }
  if (note.sameArticleType && note.sameWorkflowStage) {
    return "Matches both the source Article Type and Workflow Stage.";
  }
  if (note.sameWorkflowStage) {
    return "Belongs to the same Workflow Stage as the source note.";
  }
  if (note.sameArticleType) {
    return "Matches the source note's Article Type.";
  }
  if (note.matchedTags.length > 0) {
    return `Shares ${note.matchedTags.slice(0, 3).map((tag) => `#${tag}`).join(", ")} with this capture.`;
  }
  if (note.fromLocalIndex) {
    return "Title, headings, or note content match this capture.";
  }
  if (note.recentlyUsed) {
    return "This recently used note is the closest eligible destination.";
  }
  return note.score > 0 ? "Title or path terms match this capture." : "Uses the first available note as a weak fallback.";
}

function recentUseScore(mtime: number): number {
  if (!Number.isFinite(mtime) || mtime <= 0) {
    return 0;
  }
  const ageDays = Math.max(0, (Date.now() - mtime) / 86_400_000);
  return Math.max(0, 3 - Math.log2(ageDays + 1));
}

function stringValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  return value === undefined || value === null ? [] : [String(value)];
}

function normalizeHeading(value: string | undefined): string {
  return String(value ?? "Captures").trim().replace(/^#{1,6}\s*/u, "") || "Captures";
}

function markdownPath(value: string): string {
  const normalized = normalizeCapturePath(value);
  return normalized.toLowerCase().endsWith(".md") ? normalized : `${normalized}.md`;
}

function roundScore(score: number): number {
  return Number(score.toFixed(4));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertCaptureDraft(draft: CaptureDraft): void {
  if (draft.schemaVersion !== CAPTURE_SCHEMA_VERSION) {
    throw new Error(`Unsupported capture schema version: ${String(draft.schemaVersion)}`);
  }
  if (!draft.id.trim() || !draft.body.trim()) {
    throw new Error("Capture id and body are required.");
  }
}

function invalidFallbackCandidate(): CaptureTargetCandidate {
  throw new Error("At least one capture target candidate is required.");
}
