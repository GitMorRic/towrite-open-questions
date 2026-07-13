import type { App, TAbstractFile, TFile } from "obsidian";
import { shortHash, slugify } from "../core/hash";
import type { ToWriteSettings } from "../core/settings";
import {
  CAPTURE_SCHEMA_VERSION,
  type CaptureCommitRequest,
  type CaptureCommitResult,
  type CaptureDraft,
  type CapturePreview,
  type CaptureTargetCandidate,
  type CaptureUndoResult
} from "./types";
import {
  MISSING_TARGET_REVISION,
  assertSafeCapturePath,
  captureContentRevision,
  captureIntegrityDigest,
  normalizeCapturePath
} from "./revision";

export type CaptureConflictCode =
  | "target-changed"
  | "capture-id-reused"
  | "capture-id-mismatch"
  | "target-exists"
  | "undo-conflict";

export class CaptureConflictError extends Error {
  constructor(
    public readonly code: CaptureConflictCode,
    message: string
  ) {
    super(message);
    this.name = "CaptureConflictError";
  }
}

export class CaptureUndoTokenError extends Error {
  constructor(message = "Invalid capture undo token.") {
    super(message);
    this.name = "CaptureUndoTokenError";
  }
}

export interface CaptureServiceOptions {
  appendHeading?: string;
  defaultTags?: string[];
  now?: () => Date;
  /** Lets the plugin refresh its incremental index/store after a successful mutation. */
  onVaultChanged?: (path: string, operation: "commit" | "undo") => void | Promise<void>;
}

export function captureServiceOptionsFromPluginSettings(
  settings: Pick<ToWriteSettings, "deviceCapture">,
  overrides: Omit<CaptureServiceOptions, "appendHeading" | "defaultTags"> = {}
): CaptureServiceOptions {
  return {
    appendHeading: settings.deviceCapture.appendHeading,
    defaultTags: settings.deviceCapture.defaultTags,
    ...overrides
  };
}

interface LocatedAppendBlock {
  start: number;
  end: number;
  full: string;
  inner: string;
  payloadDigest: string;
  contentDigest: string;
}

interface UndoPayload {
  operation: "append" | "create";
  captureId: string;
  path: string;
  guard: string;
}

const CAPTURE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

/**
 * Owns all Vault writes for native and external capture clients. Appends are
 * atomically revision-checked and marked; creates carry a durable capture_id.
 */
export class CaptureService {
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly app: App,
    private options: CaptureServiceOptions = {}
  ) {}

  updateOptions(options: CaptureServiceOptions): void {
    this.options = options;
  }

  async preview(draft: CaptureDraft, candidate: CaptureTargetCandidate): Promise<CapturePreview> {
    validateDraft(draft);
    validateCandidate(candidate);

    if (candidate.action === "create") {
      const existing = await this.findCreatedCapture(candidate.path, draft.id);
      const path = existing?.path ?? await this.availableCreatePath(candidate.path, draft);
      const createdAt = existing ? readFrontmatterValue(await this.app.vault.read(existing), "created") : normalizedCreatedAt(draft, this.options.now);
      const content = existing
        ? await this.app.vault.read(existing)
        : formatCreatedNote(draft, candidate, createdAt, this.options.defaultTags);
      return {
        schemaVersion: CAPTURE_SCHEMA_VERSION,
        captureId: draft.id,
        candidateId: candidate.id,
        action: "create",
        path,
        targetRevision: existing ? captureContentRevision(content) : candidate.targetRevision,
        excerpt: previewExcerpt(content)
      };
    }

    const path = assertSafeCapturePath(candidate.path, "file");
    const file = this.app.vault.getFileByPath(path);
    const content = file ? await this.app.vault.read(file) : "";
    const createdAt = normalizedCreatedAt(draft, this.options.now);
    const block = formatAppendBlock(draft, createdAt);
    const proposed = insertCaptureBlock(content, normalizeHeading(candidate.heading ?? this.options.appendHeading), block);
    return {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      captureId: draft.id,
      candidateId: candidate.id,
      action: "append",
      path,
      targetRevision: file ? captureContentRevision(content) : MISSING_TARGET_REVISION,
      excerpt: previewExcerpt(proposed.slice(Math.max(0, proposed.indexOf(block) - 80)))
    };
  }

  async commit(request: CaptureCommitRequest): Promise<CaptureCommitResult> {
    validateDraft(request.draft);
    validateCandidate(request.candidate);
    if (request.targetRevision !== undefined && request.targetRevision !== request.candidate.targetRevision) {
      // A preview revision is expected to supersede the candidate's older revision.
      // Both values are valid opaque revisions, so no rejection is needed here.
    }
    return this.withCaptureLock(request.draft.id, async () => request.candidate.action === "create"
      ? this.commitCreate(request)
      : this.commitAppend(request));
  }

  async undo(token: string, expectedCaptureId?: string): Promise<CaptureUndoResult> {
    const payload = decodeUndoToken(token);
    if (expectedCaptureId && payload.captureId !== expectedCaptureId) {
      throw new CaptureConflictError("capture-id-mismatch", "Undo token does not match capture id.");
    }
    return this.withCaptureLock(payload.captureId, async () => {
      const file = this.app.vault.getFileByPath(payload.path);
      if (!file) {
        return undoResult(payload, false);
      }

      if (payload.operation === "create") {
        const content = await this.app.vault.read(file);
        if (captureContentRevision(content) !== payload.guard) {
          throw new CaptureConflictError("undo-conflict", "The created note changed after capture and cannot be safely removed.");
        }
        await this.app.fileManager.trashFile(file);
        await this.notifyVaultChanged(payload.path, "undo");
        return undoResult(payload, true);
      }

      let removed = false;
      await this.app.vault.process(file, (content) => {
        const located = locateAppendBlock(content, payload.captureId);
        if (!located) {
          return content;
        }
        if (!validLocatedBlock(located) || captureIntegrityDigest(located.full) !== payload.guard) {
          throw new CaptureConflictError("undo-conflict", "The appended capture block changed and cannot be safely removed.");
        }
        removed = true;
        return removeLocatedBlock(content, located);
      });
      if (removed) {
        await this.notifyVaultChanged(payload.path, "undo");
      }
      return undoResult(payload, removed);
    });
  }

  private async commitAppend(request: CaptureCommitRequest): Promise<CaptureCommitResult> {
    const { draft, candidate } = request;
    const path = assertSafeCapturePath(candidate.path, "file");
    await this.ensureParentFolder(path);
    const expectedRevision = request.targetRevision ?? candidate.targetRevision;
    const createdAt = normalizedCreatedAt(draft, this.options.now);
    const newBlock = formatAppendBlock(draft, createdAt);
    const heading = normalizeHeading(candidate.heading ?? this.options.appendHeading);
    let file = this.app.vault.getFileByPath(path);
    let idempotent = false;
    let mutated = false;
    let justCreated = false;

    if (!file) {
      if (expectedRevision !== MISSING_TARGET_REVISION) {
        throw changedTarget(path);
      }
      const content = insertCaptureBlock("", heading, newBlock);
      try {
        file = await this.app.vault.create(path, content);
        justCreated = true;
        mutated = true;
      } catch (error) {
        file = this.app.vault.getFileByPath(path);
        if (!file) {
          throw error;
        }
      }
    }

    if (file) {
      await this.app.vault.process(file, (content) => {
        const existing = locateAppendBlock(content, draft.id);
        if (existing) {
          if (!validLocatedBlock(existing) || existing.payloadDigest !== draftPayloadDigest(draft)) {
            throw reusedCaptureId(draft.id);
          }
          idempotent = !justCreated;
          return content;
        }

        if (captureContentRevision(content) !== expectedRevision) {
          throw changedTarget(path);
        }
        mutated = true;
        return insertCaptureBlock(content, heading, newBlock);
      });
    }

    const finalFile = this.app.vault.getFileByPath(path);
    if (!finalFile) {
      throw new Error(`Capture target disappeared: ${path}`);
    }
    const finalContent = await this.app.vault.read(finalFile);
    const located = locateAppendBlock(finalContent, draft.id);
    if (!located || !validLocatedBlock(located)) {
      throw new CaptureConflictError("capture-id-reused", "Capture marker could not be verified after writing.");
    }
    const revision = captureContentRevision(finalContent);
    if (mutated) {
      await this.notifyVaultChanged(path, "commit");
    }
    return this.commitResult({
      draft,
      candidate,
      finalPath: path,
      createdAt: readCapturedAt(located.inner) || createdAt,
      targetRevision: revision,
      undoToken: encodeUndoToken({ operation: "append", captureId: draft.id, path, guard: captureIntegrityDigest(located.full) }),
      idempotent
    });
  }

  private async commitCreate(request: CaptureCommitRequest): Promise<CaptureCommitResult> {
    const { draft, candidate } = request;
    const folder = assertSafeCapturePath(candidate.path, "folder");
    await this.ensureFolder(folder);
    const existing = await this.findCreatedCapture(folder, draft.id);
    if (existing) {
      const content = await this.app.vault.read(existing);
      if (readFrontmatterValue(content, "capture_fingerprint") !== draftPayloadDigest(draft)) {
        throw reusedCaptureId(draft.id);
      }
      const createdAt = readFrontmatterValue(content, "created") || normalizedCreatedAt(draft, this.options.now);
      const pristine = content === formatCreatedNote(draft, candidate, createdAt, this.options.defaultTags);
      const revision = captureContentRevision(content);
      return this.commitResult({
        draft,
        candidate,
        finalPath: existing.path,
        createdAt,
        targetRevision: revision,
        undoToken: pristine
          ? encodeUndoToken({ operation: "create", captureId: draft.id, path: existing.path, guard: revision })
          : undefined,
        idempotent: true
      });
    }

    const createdAt = normalizedCreatedAt(draft, this.options.now);
    const path = await this.availableCreatePath(folder, draft);
    const content = formatCreatedNote(draft, candidate, createdAt, this.options.defaultTags);
    let file: TFile;
    try {
      file = await this.app.vault.create(path, content);
    } catch (error) {
      const raced = await this.findCreatedCapture(folder, draft.id);
      if (!raced) {
        throw error;
      }
      const racedContent = await this.app.vault.read(raced);
      if (readFrontmatterValue(racedContent, "capture_fingerprint") !== draftPayloadDigest(draft)) {
        throw reusedCaptureId(draft.id);
      }
      return this.commitResult({
        draft,
        candidate,
        finalPath: raced.path,
        createdAt: readFrontmatterValue(racedContent, "created") || createdAt,
        targetRevision: captureContentRevision(racedContent),
        undoToken: racedContent === content
          ? encodeUndoToken({ operation: "create", captureId: draft.id, path: raced.path, guard: captureContentRevision(racedContent) })
          : undefined,
        idempotent: true
      });
    }

    const revision = captureContentRevision(content);
    await this.notifyVaultChanged(file.path, "commit");
    return this.commitResult({
      draft,
      candidate,
      finalPath: file.path,
      createdAt,
      targetRevision: revision,
      undoToken: encodeUndoToken({ operation: "create", captureId: draft.id, path: file.path, guard: revision }),
      idempotent: false
    });
  }

  private commitResult(input: {
    draft: CaptureDraft;
    candidate: CaptureTargetCandidate;
    finalPath: string;
    createdAt: string;
    targetRevision: string;
    undoToken?: string;
    idempotent: boolean;
  }): CaptureCommitResult {
    return {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      captureId: input.draft.id,
      candidateId: input.candidate.id,
      finalPath: input.finalPath,
      action: input.candidate.action,
      createdAt: input.createdAt,
      openUri: buildObsidianOpenUri(this.app.vault.getName(), input.finalPath),
      undoToken: input.undoToken,
      idempotent: input.idempotent,
      targetRevision: input.targetRevision
    };
  }

  private async availableCreatePath(folderPath: string, draft: CaptureDraft): Promise<string> {
    const folder = normalizeCapturePath(folderPath);
    const base = `${slugify(captureTitle(draft)).replace(/_/gu, "-")}-${shortHash(`capture:${draft.id}`)}`;
    for (let index = 0; index < 1000; index += 1) {
      const suffix = index === 0 ? "" : `-${index + 1}`;
      const path = `${folder ? `${folder}/` : ""}${base}${suffix}.md`;
      if (!this.app.vault.getAbstractFileByPath(path)) {
        return path;
      }
    }
    throw new CaptureConflictError("target-exists", "Could not allocate a unique note path for this capture.");
  }

  private async findCreatedCapture(folderPath: string, captureId: string): Promise<TFile | undefined> {
    const folder = normalizeCapturePath(folderPath);
    const expected = captureId;
    const files = this.app.vault.getMarkdownFiles()
      .sort((left, right) => {
        const leftPreferred = parentPath(left.path) === folder ? 0 : 1;
        const rightPreferred = parentPath(right.path) === folder ? 0 : 1;
        return leftPreferred - rightPreferred || left.path.localeCompare(right.path);
      });
    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      if (readFrontmatterValue(content, "capture_id") === expected) {
        return file;
      }
    }
    return undefined;
  }

  private async ensureParentFolder(filePath: string): Promise<void> {
    await this.ensureFolder(parentPath(filePath));
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const normalized = assertSafeCapturePath(folderPath, "folder");
    if (!normalized) {
      return;
    }
    let current = "";
    for (const segment of normalized.split("/")) {
      current = current ? `${current}/${segment}` : segment;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing) {
        if (isFile(existing)) {
          throw new CaptureConflictError("target-exists", `${current} exists and is not a folder.`);
        }
        continue;
      }
      await this.app.vault.createFolder(current);
    }
  }

  private async notifyVaultChanged(path: string, operation: "commit" | "undo"): Promise<void> {
    await this.options.onVaultChanged?.(path, operation);
  }

  private async withCaptureLock<T>(captureId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(captureId) ?? Promise.resolve();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => gate);
    this.locks.set(captureId, queued);
    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(captureId) === queued) {
        this.locks.delete(captureId);
      }
    }
  }
}

export function formatAppendBlock(draft: CaptureDraft, createdAt: string): string {
  const payloadDigest = draftPayloadDigest(draft);
  const innerParts: string[] = [];
  const title = cleanInline(draft.title);
  if (title) {
    innerParts.push(`### ${title}`);
  }
  innerParts.push(draft.body.trim());
  const links = uniqueStrings(draft.links);
  if (links.length > 0) {
    innerParts.push(`Links: ${links.join(" · ")}`);
  }
  const tags = normalizeTags(draft.tags);
  if (tags.length > 0) {
    innerParts.push(`Tags: ${tags.map((tag) => `#${tag}`).join(" ")}`);
  }
  const source = sourceReference(draft);
  if (source) {
    innerParts.push(`Source: ${source}`);
  }
  innerParts.push(`Captured: ${createdAt}`);
  const inner = innerParts.join("\n\n");
  const contentDigest = captureIntegrityDigest(inner);
  return `${startMarker(draft.id, payloadDigest, contentDigest)}\n${inner}\n${endMarker(draft.id)}`;
}

export function insertCaptureBlock(content: string, heading: string, block: string): string {
  const normalized = content.replace(/\r\n?/gu, "\n").replace(/\s+$/u, "");
  const sectionHeading = normalizeHeading(heading);
  const lines = normalized.split("\n");
  const headingIndex = lines.findIndex((line) => line.trim() === `## ${sectionHeading}`);
  if (headingIndex < 0) {
    return `${normalized}${normalized ? "\n\n" : ""}## ${sectionHeading}\n\n${block}\n`;
  }

  let insertionLine = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (/^#{1,2}\s+/u.test(lines[index]?.trim() ?? "")) {
      insertionLine = index;
      break;
    }
  }
  const before = lines.slice(0, insertionLine).join("\n").replace(/\s+$/u, "");
  const after = lines.slice(insertionLine).join("\n").replace(/^\s+/u, "");
  return `${before}\n\n${block}\n${after ? `\n${after}\n` : ""}`;
}

function formatCreatedNote(
  draft: CaptureDraft,
  candidate: CaptureTargetCandidate,
  createdAt: string,
  defaultTags: string[] | undefined
): string {
  const tags = normalizeTags([...(defaultTags ?? []), ...draft.tags, ...(candidate.stageId ? [candidate.stageId] : [])]);
  const frontmatter = [
    "---",
    `capture_id: ${yamlString(draft.id)}`,
    `capture_fingerprint: ${yamlString(draftPayloadDigest(draft))}`,
    `created: ${yamlString(createdAt)}`,
    ...(candidate.stageId ? [`workflow_stage: ${yamlString(candidate.stageId)}`] : []),
    "tags:",
    ...(tags.length > 0 ? tags.map((tag) => `  - ${yamlString(tag)}`) : ["  - capture"]),
    "---"
  ];
  const body = [`# ${captureTitle(draft)}`, "", draft.body.trim()];
  if (draft.links.length > 0) {
    body.push("", "## Links", "", ...uniqueStrings(draft.links).map((link) => `- ${link}`));
  }
  const source = sourceReference(draft);
  if (source) {
    body.push("", `Source: ${source}`);
  }
  return `${frontmatter.join("\n")}\n\n${body.join("\n")}\n`;
}

function locateAppendBlock(content: string, captureId: string): LocatedAppendBlock | undefined {
  const encodedId = encodeURIComponent(captureId);
  const prefix = `<!-- towrite-capture:start id="${encodedId}" payload="`;
  const end = endMarker(captureId);
  const firstStart = content.indexOf(prefix);
  if (firstStart < 0) {
    return undefined;
  }
  if (content.indexOf(prefix, firstStart + prefix.length) >= 0) {
    throw reusedCaptureId(captureId);
  }
  const markerEnd = content.indexOf(" -->", firstStart + prefix.length);
  if (markerEnd < 0) {
    throw reusedCaptureId(captureId);
  }
  const startMarkerText = content.slice(firstStart, markerEnd + 4);
  const attributes = /^<!-- towrite-capture:start id="[^"]+" payload="([a-z0-9]+)" content="([a-z0-9]+)" -->$/u.exec(startMarkerText);
  if (!attributes) {
    throw reusedCaptureId(captureId);
  }
  const endStart = content.indexOf(end, markerEnd + 4);
  if (endStart < 0 || content.indexOf(end, endStart + end.length) >= 0) {
    throw reusedCaptureId(captureId);
  }
  const innerStart = markerEnd + 4 + (content[markerEnd + 4] === "\n" ? 1 : 0);
  const innerEnd = endStart > innerStart && content[endStart - 1] === "\n" ? endStart - 1 : endStart;
  const blockEnd = endStart + end.length;
  return {
    start: firstStart,
    end: blockEnd,
    full: content.slice(firstStart, blockEnd),
    inner: content.slice(innerStart, innerEnd),
    payloadDigest: attributes[1] ?? "",
    contentDigest: attributes[2] ?? ""
  };
}

function validLocatedBlock(block: LocatedAppendBlock): boolean {
  return captureIntegrityDigest(block.inner) === block.contentDigest;
}

function removeLocatedBlock(content: string, block: LocatedAppendBlock): string {
  const before = content.slice(0, block.start).replace(/[ \t]+$/u, "").replace(/\n{2}$/u, "\n");
  const after = content.slice(block.end).replace(/^[ \t]*\n?/u, "");
  const joined = `${before}${after}`;
  return joined.replace(/\n{3,}/gu, "\n\n").replace(/\s+$/u, "") + (joined.trim() ? "\n" : "");
}

function startMarker(captureId: string, payloadDigest: string, contentDigest: string): string {
  return `<!-- towrite-capture:start id="${encodeURIComponent(captureId)}" payload="${payloadDigest}" content="${contentDigest}" -->`;
}

function endMarker(captureId: string): string {
  return `<!-- towrite-capture:end id="${encodeURIComponent(captureId)}" -->`;
}

function draftPayloadDigest(draft: CaptureDraft): string {
  return captureIntegrityDigest(JSON.stringify({
    intent: draft.intent,
    title: cleanInline(draft.title),
    body: draft.body.trim(),
    tags: normalizeTags(draft.tags),
    links: uniqueStrings(draft.links),
    source: {
      file: normalizeCapturePath(draft.source?.file ?? ""),
      headingPath: draft.source?.headingPath?.map(cleanInline).filter(Boolean) ?? [],
      questionId: draft.source?.questionId ?? ""
    }
  }));
}

function sourceReference(draft: CaptureDraft): string {
  const path = normalizeCapturePath(draft.source?.file ?? "");
  if (!path) {
    return "";
  }
  const heading = draft.source?.headingPath?.map(cleanInline).filter(Boolean).join(" > ");
  return `[[${path}${heading ? `#${heading}` : ""}]]`;
}

function captureTitle(draft: CaptureDraft): string {
  const explicit = cleanInline(draft.title);
  if (explicit) {
    return explicit.slice(0, 160);
  }
  const firstLine = cleanInline(draft.body.split(/\r?\n/u)[0]);
  return (firstLine || "Capture").slice(0, 80);
}

function cleanInline(value: unknown): string {
  return String(value ?? "").replace(/[\r\n]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function normalizeTags(tags: string[]): string[] {
  return uniqueStrings(tags.map((tag) => String(tag).trim().replace(/^#+/u, "").replace(/\s+/gu, "-").toLowerCase()).filter(Boolean));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));
}

function normalizeHeading(value: string | undefined): string {
  return cleanInline(value || "Captures").replace(/^#{1,6}\s*/u, "") || "Captures";
}

function normalizedCreatedAt(draft: CaptureDraft, now: CaptureServiceOptions["now"]): string {
  if (draft.createdAt) {
    const parsed = Date.parse(draft.createdAt);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return (now?.() ?? new Date()).toISOString();
}

function readCapturedAt(inner: string): string {
  return /^Captured:\s*(.+)$/gmu.exec(inner)?.[1]?.trim() ?? "";
}

function readFrontmatterValue(content: string, key: string): string {
  const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(content.replace(/\r\n?/gu, "\n"))?.[1];
  if (!frontmatter) {
    return "";
  }
  const line = frontmatter.split("\n").find((item) => item.startsWith(`${key}:`));
  if (!line) {
    return "";
  }
  const raw = line.slice(key.length + 1).trim();
  if (raw.startsWith("\"") && raw.endsWith("\"")) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      return "";
    }
  }
  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/gu, "'");
  }
  return raw;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function previewExcerpt(value: string): string {
  return value.length <= 1200 ? value : `${value.slice(0, 1199)}…`;
}

function parentPath(path: string): string {
  return normalizeCapturePath(path).split("/").slice(0, -1).join("/");
}

function isFile(value: TAbstractFile): value is TFile {
  return "extension" in value;
}

function validateDraft(draft: CaptureDraft): void {
  if (draft.schemaVersion !== CAPTURE_SCHEMA_VERSION) {
    throw new Error(`Unsupported capture schema version: ${String(draft.schemaVersion)}`);
  }
  if (!CAPTURE_ID_PATTERN.test(draft.id)) {
    throw new Error("Capture id must use 1-128 letters, numbers, '.', '_', ':', or '-'.");
  }
  if (!draft.body.trim()) {
    throw new Error("Capture body is required.");
  }
  if (!Array.isArray(draft.tags) || !Array.isArray(draft.links)) {
    throw new Error("Capture tags and links must be arrays.");
  }
}

function validateCandidate(candidate: CaptureTargetCandidate): void {
  if (candidate.schemaVersion !== CAPTURE_SCHEMA_VERSION) {
    throw new Error(`Unsupported capture target schema version: ${String(candidate.schemaVersion)}`);
  }
  if (!candidate.id.trim()) {
    throw new Error("Capture candidate id is required.");
  }
  if (candidate.kind === "folder" && candidate.action !== "create") {
    throw new Error("Folder capture targets must create a note.");
  }
  if (candidate.kind !== "folder" && candidate.action !== "append") {
    throw new Error("Existing-note and Inbox capture targets must append.");
  }
  assertSafeCapturePath(candidate.path, candidate.action === "create" ? "folder" : "file");
}

function changedTarget(path: string): CaptureConflictError {
  return new CaptureConflictError("target-changed", `${path} changed after preview. Refresh the preview before saving.`);
}

function reusedCaptureId(captureId: string): CaptureConflictError {
  return new CaptureConflictError("capture-id-reused", `Capture id ${captureId} is already attached to different or modified content.`);
}

function buildObsidianOpenUri(vault: string, path: string): string {
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path)}`;
}

function encodeUndoToken(payload: UndoPayload): string {
  const fields = ["v1", payload.operation, payload.captureId, payload.path, payload.guard].map(encodeURIComponent);
  const unsigned = fields.join("|");
  return `${unsigned}|${shortHash(`capture-undo:${unsigned}`)}`;
}

function decodeUndoToken(token: string): UndoPayload {
  const fields = token.split("|");
  if (fields.length !== 6) {
    throw new CaptureUndoTokenError();
  }
  const unsigned = fields.slice(0, 5).join("|");
  if (fields[5] !== shortHash(`capture-undo:${unsigned}`)) {
    throw new CaptureUndoTokenError("Invalid capture undo token checksum.");
  }
  let decoded: string[];
  try {
    decoded = fields.slice(0, 5).map(decodeURIComponent);
  } catch {
    throw new CaptureUndoTokenError("Invalid capture undo token encoding.");
  }
  const [version, operation, captureId, path, guard] = decoded;
  if (version !== "v1" || (operation !== "append" && operation !== "create") || !captureId || !path || !guard) {
    throw new CaptureUndoTokenError("Invalid capture undo token payload.");
  }
  return { operation, captureId, path: assertSafeCapturePath(path, "file"), guard };
}

function undoResult(payload: UndoPayload, undone: boolean): CaptureUndoResult {
  return {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    captureId: payload.captureId,
    finalPath: payload.path,
    undone
  };
}
