import { contentHash128 } from "../core/hash";
import type { DailyPlanEnrichmentPatch } from "./types";

const CHECKBOX_RE = /^(?<indent>[ \t]*)(?<bullet>[-+*])[ \t]+\[(?<mark>[^\]])\][ \t]*(?<body>.*)$/u;
const TASK_ID_RE = /(?:^|\s)\^(?<id>task_[0-9a-f]{32})\s*$/u;
const DAILY_ID_RE = /(?:^|\s)\^daily_[0-9a-f]{32}\s*$/u;
const OWNED_FIELD_RE = /^(?<indent>[ \t]*)\[towrite-(?<key>category|target|due|estimate|next|planned-start|expected-finish|deadline|pool-ref)::[ \t]*(?<value>\[\[[^\]]+\]\]|[^\]]*)\][ \t]*$/iu;
const LIST_ITEM_RE = /^(?<indent>[ \t]*)(?:[-+*]|\d+[.)])[ \t]+/u;
const SAFE_WIKI_TARGET_RE = /^\[\[[^\]\r\n]+\]\]$/u;
const SAFE_MARKDOWN_TARGET_RE = /^(?![A-Za-z][A-Za-z0-9+.-]*:)(?![/\\])[^<>\0\r\n]+(?:\.md)?(?:#[^<>\0\r\n]+)?$/u;
const LIST_ITEM_BODY_RE = /^(?<indent>[ \t]*)(?:[-+*]|\d+[.)])[ \t]+(?<body>.*)$/u;
const WIKI_LINK_RE = /(?<!!)\[\[(?<target>[^\]|\r\n]+)(?:\|[^\]\r\n]*)?\]\]/gu;
const MARKDOWN_LINK_RE = /(?<!!)\[[^\]\r\n]*\]\((?<target>[^)\r\n]+)\)/gu;

export interface NoteTaskStorage {
  readText(path: string): Promise<string | undefined>;
  writeText(path: string, content: string): Promise<void>;
  /** Obsidian Vault.process adapter for atomic read-modify-write when available. */
  processText?(path: string, update: (current: string) => string): Promise<string>;
}

export interface NoteTaskCandidate {
  sourcePath: string;
  line: number;
  before: string;
  taskText: string;
  status: "todo" | "in-progress" | "done";
  proposedTaskId: string;
  documentRevision: string;
  taskRevision: string;
  resolvedTargetLabel: string;
}

export interface TrackedNoteTask {
  id: string;
  taskId: string;
  sourcePath: string;
  line: number;
  endLine: number;
  rawLine: string;
  rawBlock: string;
  text: string;
  status: "todo" | "in-progress" | "done";
  revision: string;
  category?: string;
  target?: string;
  dueDate?: string;
  estimateMinutes?: number;
  nextStep?: string;
  plannedStartAt?: string;
  expectedFinishAt?: string;
  deadlineAt?: string;
  /** Stable reference to the canonical Task Pool item. */
  poolTaskRef?: string;
  ownedMetadataLines: number[];
  /** Owned-looking lines that must be fixed explicitly instead of silently rewritten. */
  invalidOwnedMetadataLines: number[];
}

/**
 * A structural link authored below a tracked checkbox. The linked note keeps
 * its own task Markdown; this record only preserves the parent/project
 * relationship needed by the unified Work Pool.
 */
export interface NoteTaskChildRelation {
  parentTaskId: string;
  parentTaskText: string;
  parentSourcePath: string;
  childLinkText: string;
  line: number;
  revision: string;
}

export interface NoteTaskSchedulePatch {
  plannedStartAt?: string | null;
  expectedFinishAt?: string | null;
  deadlineAt?: string | null;
}

export interface NoteTaskPatch extends DailyPlanEnrichmentPatch, NoteTaskSchedulePatch {
  poolTaskRef?: string | null;
}

export interface NoteTaskDocument {
  sourcePath: string;
  revision: string;
  tasks: TrackedNoteTask[];
  candidates: NoteTaskCandidate[];
  relations: NoteTaskChildRelation[];
}

export class NoteTaskConflictError extends Error {
  constructor(
    public readonly code: "not-found" | "revision-changed" | "invalid-document",
    message: string
  ) {
    super(message);
    this.name = "NoteTaskConflictError";
  }
}

/**
 * Progressive task metadata for ordinary Markdown notes.
 *
 * The service is intentionally file-scoped: callers inspect only the active
 * note after Obsidian has saved it. Nothing runs in the editor keystroke path,
 * and no content is moved into a separate task database.
 */
export class NoteTaskService {
  private lock: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: NoteTaskStorage,
    private readonly createTaskId: () => string = createNoteTaskId
  ) {}

  async inspect(path: string): Promise<NoteTaskDocument> {
    return parseNoteTasks(await this.storage.readText(path) ?? "", path, this.createTaskId);
  }

  async adopt(
    candidate: NoteTaskCandidate,
    patch: NoteTaskPatch = {}
  ): Promise<TrackedNoteTask> {
    return this.transform(candidate.sourcePath, (current) => {
      if (documentRevision(current, candidate.sourcePath) !== candidate.documentRevision) {
        throw new NoteTaskConflictError(
          "revision-changed",
          "The note changed after this task was recognized. Wait for the editor to refresh and try again."
        );
      }
      const lines = splitLines(current);
      const currentLine = lines[candidate.line - 1];
      if (
        currentLine !== candidate.before
        || taskRevision(candidate.sourcePath, candidate.line, currentLine) !== candidate.taskRevision
      ) {
        throw new NoteTaskConflictError("revision-changed", "The task line changed before it could be tracked.");
      }
      const parsed = parseCheckbox(currentLine);
      if (!parsed || !parsed.text || parsed.taskId) {
        throw new NoteTaskConflictError("invalid-document", "The selected line is no longer an untracked task.");
      }
      const taskId = normalizeGeneratedTaskId(candidate.proposedTaskId);
      const taskLine = `${currentLine.replace(/\s+$/u, "")} ^${taskId}`;
      const propertyLines = propertyMarkdownLines(parsed.indent, patch, candidate.sourcePath);
      lines.splice(candidate.line - 1, 1, taskLine, ...propertyLines);
      const next = joinLines(lines, current);
      return {
        next,
        result: requireTrackedTask(parseNoteTasks(next, candidate.sourcePath, this.createTaskId), taskId)
      };
    });
  }

  /**
   * Registers several candidates from the same saved document in one atomic
   * edit. This is used by automatic Task Pool registration so one candidate
   * cannot make every later candidate's document revision stale.
   */
  async adoptMany(
    entries: ReadonlyArray<{ candidate: NoteTaskCandidate; patch?: NoteTaskPatch }>
  ): Promise<TrackedNoteTask[]> {
    if (entries.length === 0) return [];
    const sourcePath = entries[0].candidate.sourcePath;
    const expectedDocumentRevision = entries[0].candidate.documentRevision;
    if (entries.some(({ candidate }) =>
      candidate.sourcePath !== sourcePath
      || candidate.documentRevision !== expectedDocumentRevision
    )) {
      throw new NoteTaskConflictError(
        "invalid-document",
        "Automatic task registration requires candidates from one saved document revision."
      );
    }
    const taskIds = entries.map(({ candidate }) => normalizeGeneratedTaskId(candidate.proposedTaskId));
    if (new Set(taskIds).size !== taskIds.length) {
      throw new NoteTaskConflictError("invalid-document", "Automatic task registration generated duplicate IDs.");
    }
    return this.transform(sourcePath, (current) => {
      if (documentRevision(current, sourcePath) !== expectedDocumentRevision) {
        throw new NoteTaskConflictError(
          "revision-changed",
          "The note changed before automatic task registration completed."
        );
      }
      const lines = splitLines(current);
      const replacements = entries.map(({ candidate, patch = {} }, entryIndex) => {
        const currentLine = lines[candidate.line - 1];
        if (
          currentLine !== candidate.before
          || taskRevision(sourcePath, candidate.line, currentLine) !== candidate.taskRevision
        ) {
          throw new NoteTaskConflictError(
            "revision-changed",
            "A task line changed before automatic registration completed."
          );
        }
        const parsed = parseCheckbox(currentLine);
        if (!parsed || !parsed.text || parsed.taskId || candidate.status === "done") {
          throw new NoteTaskConflictError(
            "invalid-document",
            "Only unfinished, untracked checkboxes can be registered automatically."
          );
        }
        const taskId = taskIds[entryIndex];
        return {
          index: candidate.line - 1,
          taskId,
          taskLine: `${currentLine.replace(/\s+$/u, "")} ^${taskId}`,
          propertyLines: propertyMarkdownLines(parsed.indent, {
            ...patch,
            poolTaskRef: patch.poolTaskRef ?? taskId
          }, sourcePath)
        };
      }).sort((left, right) => right.index - left.index);
      for (const replacement of replacements) {
        lines.splice(
          replacement.index,
          1,
          replacement.taskLine,
          ...replacement.propertyLines
        );
      }
      const next = joinLines(lines, current);
      const parsed = parseNoteTasks(next, sourcePath, this.createTaskId);
      return {
        next,
        result: taskIds.map((taskId) => requireTrackedTask(parsed, taskId))
      };
    });
  }

  async update(
    item: TrackedNoteTask,
    patch: NoteTaskPatch
  ): Promise<TrackedNoteTask> {
    return this.transform(item.sourcePath, (current) => {
      const document = parseNoteTasks(current, item.sourcePath, this.createTaskId);
      const matches = document.tasks.filter((task) => task.taskId === item.taskId);
      if (matches.length !== 1) {
        throw new NoteTaskConflictError("invalid-document", "The tracked task ID is missing or duplicated.");
      }
      const latest = matches[0];
      if (latest.revision !== item.revision) {
        throw new NoteTaskConflictError(
          "revision-changed",
          "The task changed after its properties were opened. Your note was not overwritten."
        );
      }
      if (latest.invalidOwnedMetadataLines.length > 0) {
        throw new NoteTaskConflictError(
          "invalid-document",
          `Task metadata is invalid or duplicated on line(s): ${latest.invalidOwnedMetadataLines.join(", ")}.`
        );
      }
      const lines = splitLines(current);
      const parsed = parseCheckbox(lines[latest.line - 1]);
      if (!parsed) throw new NoteTaskConflictError("invalid-document", "The tracked task line is invalid.");
      const ownedIndexes = latest.ownedMetadataLines.map((line) => line - 1).sort((a, b) => b - a);
      for (const index of ownedIndexes) lines.splice(index, 1);
      const propertyLines = propertyMarkdownLines(parsed.indent, {
        category: patch.category === undefined ? latest.category : patch.category,
        target: patch.target === undefined ? latest.target : patch.target,
        dueDate: patch.dueDate === undefined ? latest.dueDate : patch.dueDate,
        estimateMinutes: patch.estimateMinutes === undefined ? latest.estimateMinutes : patch.estimateMinutes,
        nextStep: patch.nextStep === undefined ? latest.nextStep : patch.nextStep,
        plannedStartAt: patch.plannedStartAt === undefined ? latest.plannedStartAt : patch.plannedStartAt,
        expectedFinishAt: patch.expectedFinishAt === undefined ? latest.expectedFinishAt : patch.expectedFinishAt,
        deadlineAt: patch.deadlineAt === undefined ? latest.deadlineAt : patch.deadlineAt,
        poolTaskRef: patch.poolTaskRef === undefined ? latest.poolTaskRef : patch.poolTaskRef
      }, item.sourcePath);
      lines.splice(latest.line, 0, ...propertyLines);
      const next = joinLines(lines, current);
      return {
        next,
        result: requireTrackedTask(parseNoteTasks(next, item.sourcePath, this.createTaskId), item.taskId)
      };
    });
  }

  async setStatus(
    item: TrackedNoteTask,
    status: TrackedNoteTask["status"]
  ): Promise<TrackedNoteTask> {
    return this.transform(item.sourcePath, (current) => {
      const document = parseNoteTasks(current, item.sourcePath, this.createTaskId);
      const matches = document.tasks.filter((task) => task.taskId === item.taskId);
      if (matches.length !== 1) {
        throw new NoteTaskConflictError("invalid-document", "The tracked task ID is missing or duplicated.");
      }
      const latest = matches[0];
      if (latest.revision !== item.revision) {
        throw new NoteTaskConflictError(
          "revision-changed",
          "The task changed before its status could be updated."
        );
      }
      const lines = splitLines(current);
      const mark = status === "done" ? "x" : status === "in-progress" ? "/" : " ";
      lines[latest.line - 1] = lines[latest.line - 1].replace(
        /^([ \t]*[-+*][ \t]+\[)[^\]](\])/u,
        `$1${mark}$2`
      );
      const next = joinLines(lines, current);
      return {
        next,
        result: requireTrackedTask(parseNoteTasks(next, item.sourcePath, this.createTaskId), item.taskId)
      };
    });
  }

  private transform<T>(
    path: string,
    operation: (current: string) => { next: string; result: T }
  ): Promise<T> {
    return this.withLock(async () => {
      if (this.storage.processText) {
        let result: T | undefined;
        let completed = false;
        await this.storage.processText(path, (current) => {
          const transformed = operation(current);
          result = transformed.result;
          completed = true;
          return transformed.next;
        });
        if (!completed) throw new NoteTaskConflictError("not-found", `Markdown note does not exist: ${path}`);
        return result as T;
      }
      const current = await this.storage.readText(path);
      if (current === undefined) {
        throw new NoteTaskConflictError("not-found", `Markdown note does not exist: ${path}`);
      }
      const transformed = operation(current);
      await this.storage.writeText(path, transformed.next);
      return transformed.result;
    });
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.lock;
    let release!: () => void;
    this.lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export function parseNoteTasks(
  markdown: string,
  sourcePath: string,
  createTaskId: () => string = createNoteTaskId
): NoteTaskDocument {
  const lines = splitLines(markdown);
  const tasks: TrackedNoteTask[] = [];
  const candidates: NoteTaskCandidate[] = [];
  const revision = documentRevision(markdown, sourcePath);
  const ignoredLines = ignoredMarkdownLines(lines);

  for (let index = 0; index < lines.length; index += 1) {
    if (ignoredLines.has(index + 1)) continue;
    if (DAILY_ID_RE.test(lines[index])) continue;
    const parsed = parseCheckbox(lines[index]);
    if (!parsed || !parsed.text) continue;
    const line = index + 1;
    if (!parsed.taskId) {
      candidates.push({
        sourcePath,
        line,
        before: lines[index],
        taskText: parsed.text,
        status: parsed.mark.toLowerCase() === "x"
          ? "done"
          : parsed.mark === "/"
            ? "in-progress"
            : "todo",
        proposedTaskId: normalizeGeneratedTaskId(createTaskId()),
        documentRevision: revision,
        taskRevision: taskRevision(sourcePath, line, lines[index]),
        resolvedTargetLabel: firstTaskTarget(parsed.text) ?? sourcePath
      });
      continue;
    }
    const ownedMetadataLines: number[] = [];
    const invalidOwnedMetadataLines: number[] = [];
    const fields: Record<string, string> = {};
    let endLine = line;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const next = lines[cursor];
      const listMatch = LIST_ITEM_RE.exec(next);
      // A child list item is its own task/block. Never absorb its metadata
      // into the parent task's editable property range.
      if (listMatch) break;
      const owned = OWNED_FIELD_RE.exec(next);
      if (owned && indentWidth(owned.groups?.indent ?? "") > indentWidth(parsed.indent)) {
        const key = owned.groups?.key?.toLowerCase();
        if (key) {
          const value = owned.groups?.value?.trim() ?? "";
          if (fields[key] !== undefined || !isValidOwnedField(key, value)) {
            invalidOwnedMetadataLines.push(cursor + 1);
          }
          fields[key] = value;
          ownedMetadataLines.push(cursor + 1);
        }
      }
      endLine = cursor + 1;
    }
    const rawBlock = lines.slice(index, endLine).join("\n");
    tasks.push({
      id: parsed.taskId,
      taskId: parsed.taskId,
      sourcePath,
      line,
      endLine,
      rawLine: lines[index],
      rawBlock,
      text: parsed.text,
      status: parsed.mark.toLowerCase() === "x"
        ? "done"
        : parsed.mark === "/"
          ? "in-progress"
          : "todo",
      revision: contentHash128(`${sourcePath}\n${rawBlock}`),
      category: clean(fields.category),
      target: clean(fields.target),
      dueDate: validDate(fields.due),
      estimateMinutes: validEstimate(fields.estimate),
      nextStep: clean(fields.next),
      plannedStartAt: validLocalDateTime(fields["planned-start"]),
      expectedFinishAt: validLocalDateTime(fields["expected-finish"]),
      deadlineAt: validLocalDateTime(fields.deadline),
      poolTaskRef: validPoolTaskRef(fields["pool-ref"]),
      ownedMetadataLines,
      invalidOwnedMetadataLines
    });
  }
  return {
    sourcePath,
    revision,
    tasks,
    candidates,
    relations: parseNoteTaskChildRelations(lines, sourcePath, tasks, ignoredLines)
  };
}

function parseNoteTaskChildRelations(
  lines: readonly string[],
  sourcePath: string,
  tasks: readonly TrackedNoteTask[],
  ignoredLines: ReadonlySet<number>
): NoteTaskChildRelation[] {
  const output: NoteTaskChildRelation[] = [];
  const seen = new Set<string>();
  for (const task of tasks) {
    const parent = CHECKBOX_RE.exec(task.rawLine);
    const parentIndent = indentWidth(parent?.groups?.indent ?? "");
    for (let index = task.line; index < lines.length; index += 1) {
      if (ignoredLines.has(index + 1)) continue;
      const line = lines[index];
      const list = LIST_ITEM_BODY_RE.exec(line);
      if (list?.groups) {
        const childIndent = indentWidth(list.groups.indent ?? "");
        if (childIndent <= parentIndent) break;
        const body = list.groups.body ?? "";
        for (const childLinkText of localNoteLinks(body)) {
          const key = `${task.taskId}\u0000${childLinkText.toLocaleLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          output.push({
            parentTaskId: task.taskId,
            parentTaskText: task.text,
            parentSourcePath: sourcePath,
            childLinkText,
            line: index + 1,
            revision: contentHash128(`${sourcePath}\n${task.taskId}\n${line}`)
          });
        }
        continue;
      }
      if (/^\s*$/u.test(line)) continue;
      const leading = /^[ \t]*/u.exec(line)?.[0] ?? "";
      if (indentWidth(leading) <= parentIndent && !OWNED_FIELD_RE.test(line)) break;
    }
  }
  return output;
}

function localNoteLinks(value: string): string[] {
  const output: string[] = [];
  for (const match of value.matchAll(WIKI_LINK_RE)) {
    const target = cleanLocalLinkTarget(match.groups?.target);
    if (target) output.push(target);
  }
  for (const match of value.matchAll(MARKDOWN_LINK_RE)) {
    const target = cleanLocalLinkTarget(match.groups?.target);
    if (target) output.push(target);
  }
  return [...new Set(output)];
}

function cleanLocalLinkTarget(value: string | undefined): string | undefined {
  const decoded = String(value ?? "").trim().replace(/^<|>$/gu, "");
  if (!decoded || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(decoded) || decoded.startsWith("/")) {
    return undefined;
  }
  return decoded.split("#")[0]?.trim() || undefined;
}

function parseCheckbox(line: string): {
  indent: string;
  mark: string;
  text: string;
  taskId?: string;
} | undefined {
  const match = CHECKBOX_RE.exec(line);
  if (!match?.groups) return undefined;
  const body = match.groups.body ?? "";
  const id = TASK_ID_RE.exec(body)?.groups?.id;
  const text = body.replace(TASK_ID_RE, "").trim();
  return {
    indent: match.groups.indent ?? "",
    mark: match.groups.mark ?? " ",
    text,
    taskId: id
  };
}

function propertyMarkdownLines(
  taskIndent: string,
  patch: NoteTaskPatch,
  sourcePath: string
): string[] {
  const plannedStartAt = normalizedLocalDateTime(patch.plannedStartAt, "Planned start");
  const expectedFinishAt = normalizedLocalDateTime(patch.expectedFinishAt, "Expected finish");
  const deadlineAt = normalizedLocalDateTime(patch.deadlineAt, "Deadline");
  if (
    plannedStartAt
    && expectedFinishAt
    && Date.parse(expectedFinishAt) < Date.parse(plannedStartAt)
  ) {
    throw new Error("Expected finish cannot be earlier than planned start.");
  }
  const indent = `${taskIndent}  `;
  const values: Array<[string, string | undefined]> = [
    ["category", normalizedText(patch.category)],
    ["target", normalizedTarget(patch.target, sourcePath)],
    ["due", normalizedDate(patch.dueDate)],
    ["estimate", normalizedEstimate(patch.estimateMinutes)],
    ["next", normalizedText(patch.nextStep)],
    ["planned-start", plannedStartAt],
    ["expected-finish", expectedFinishAt],
    ["deadline", deadlineAt],
    ["pool-ref", normalizedPoolTaskRef(patch.poolTaskRef)]
  ];
  return values
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${indent}[towrite-${key}:: ${value}]`);
}

function normalizedText(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  return value.replace(/[\r\n]+/gu, " ").trim() || undefined;
}

function normalizedDate(value: string | null | undefined): string | undefined {
  const normalized = normalizedText(value);
  if (!normalized) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) throw new Error("Task due date must use YYYY-MM-DD.");
  const parsed = new Date(`${normalized}T12:00:00`);
  if (Number.isNaN(parsed.getTime()) || localDate(parsed) !== normalized) {
    throw new Error("Task due date is invalid.");
  }
  return normalized;
}

function normalizedEstimate(value: number | null | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > 1_440) {
    throw new Error("Task estimate must be an integer between 1 and 1440 minutes.");
  }
  return `${value}m`;
}

function normalizedPoolTaskRef(value: string | null | undefined): string | undefined {
  const normalized = normalizedText(value);
  if (!normalized) return undefined;
  if (!/^task_[0-9a-f]{32}$/u.test(normalized)) {
    throw new Error("Task Pool reference must use task_<128-bit hex>.");
  }
  return normalized;
}

function validPoolTaskRef(value: string | undefined): string | undefined {
  const normalized = clean(value);
  return normalized && /^task_[0-9a-f]{32}$/u.test(normalized) ? normalized : undefined;
}

function normalizedTarget(value: string | null | undefined, sourcePath: string): string | undefined {
  const normalized = normalizedText(value);
  if (!normalized) return undefined;
  if (
    !SAFE_WIKI_TARGET_RE.test(normalized)
    && !/^https:\/\/[^\s<>\0]+$/u.test(normalized)
    && !SAFE_MARKDOWN_TARGET_RE.test(normalized)
  ) {
    throw new Error(`Task target is not a safe Obsidian note or HTTPS URL: ${sourcePath}`);
  }
  return normalized;
}

function normalizedLocalDateTime(
  value: string | null | undefined,
  label: string
): string | undefined {
  const normalized = normalizedText(value);
  if (!normalized) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(normalized)) {
    throw new Error(`${label} must use YYYY-MM-DDTHH:mm.`);
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime()) || localDateTime(parsed) !== normalized) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function firstTaskTarget(text: string): string | undefined {
  const wiki = /\[\[([^\]\r\n]+)\]\]/u.exec(text);
  if (wiki) return wiki[1].split("|", 1)[0]?.trim();
  const markdown = /\[[^\]\r\n]*\]\((?!https?:\/\/)([^)\r\n]+)\)/u.exec(text);
  return markdown?.[1]?.trim();
}

function requireTrackedTask(document: NoteTaskDocument, taskId: string): TrackedNoteTask {
  const matches = document.tasks.filter((task) => task.taskId === taskId);
  if (matches.length !== 1) {
    throw new NoteTaskConflictError("invalid-document", `Tracked task could not be verified: ${taskId}`);
  }
  return matches[0];
}

function taskRevision(sourcePath: string, line: number, value: string): string {
  return contentHash128(`${sourcePath}\n${line}\n${value}`);
}

function documentRevision(markdown: string, sourcePath: string): string {
  return contentHash128(`${sourcePath}\n${markdown}`);
}

function createNoteTaskId(): string {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return `task_${[...bytes].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function normalizeGeneratedTaskId(value: string): string {
  const normalized = String(value).trim().toLowerCase();
  if (!/^task_[0-9a-f]{32}$/u.test(normalized)) {
    throw new Error("Tracked task ID must be task_<128-bit hex>.");
  }
  return normalized;
}

function splitLines(value: string): string[] {
  return value.replace(/\r\n/gu, "\n").split("\n");
}

function joinLines(lines: string[], original: string): string {
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  return lines.join(newline);
}

function indentWidth(value: string): number {
  return value.replace(/\t/gu, "    ").length;
}

function clean(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function validDate(value: string | undefined): string | undefined {
  const normalized = clean(value);
  return normalized && /^\d{4}-\d{2}-\d{2}$/u.test(normalized) ? normalized : undefined;
}

function validEstimate(value: string | undefined): number | undefined {
  const match = /^(?<minutes>\d{1,4})m?$/u.exec(value?.trim() ?? "");
  const parsed = Number(match?.groups?.minutes);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1_440 ? parsed : undefined;
}

function validLocalDateTime(value: string | undefined): string | undefined {
  const normalized = clean(value);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(normalized)) return undefined;
  const parsed = new Date(normalized);
  return !Number.isNaN(parsed.getTime()) && localDateTime(parsed) === normalized
    ? normalized
    : undefined;
}

function isValidOwnedField(key: string, value: string): boolean {
  if (!value) return true;
  if (key === "due") return validDate(value) !== undefined;
  if (key === "estimate") return validEstimate(value) !== undefined;
  if (key === "planned-start" || key === "expected-finish" || key === "deadline") {
    return validLocalDateTime(value) !== undefined;
  }
  if (key === "pool-ref") return validPoolTaskRef(value) !== undefined;
  return true;
}

function localDate(value: Date): string {
  return `${value.getFullYear().toString().padStart(4, "0")}-${(value.getMonth() + 1).toString().padStart(2, "0")}-${value.getDate().toString().padStart(2, "0")}`;
}

function localDateTime(value: Date): string {
  return `${localDate(value)}T${value.getHours().toString().padStart(2, "0")}:${value.getMinutes().toString().padStart(2, "0")}`;
}

function ignoredMarkdownLines(lines: readonly string[]): Set<number> {
  const ignored = new Set<number>();
  let frontmatter = lines[0]?.trim() === "---";
  let fenced = false;
  let fenceMarker = "";
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (frontmatter) {
      ignored.add(index + 1);
      if (index > 0 && trimmed === "---") frontmatter = false;
      continue;
    }
    const fence = /^(?<marker>`{3,}|~{3,})/u.exec(trimmed)?.groups?.marker;
    if (!fenced && fence) {
      fenced = true;
      fenceMarker = fence[0];
      ignored.add(index + 1);
      continue;
    }
    if (fenced) {
      ignored.add(index + 1);
      if (
        (fenceMarker === "`" && /^`{3,}\s*$/u.test(trimmed))
        || (fenceMarker === "~" && /^~{3,}\s*$/u.test(trimmed))
      ) {
        fenced = false;
        fenceMarker = "";
      }
    }
  }
  return ignored;
}
