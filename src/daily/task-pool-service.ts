import { contentHash128 } from "../core/hash";
import {
  DEFAULT_TASK_POOL_HEADING,
  DEFAULT_TASK_POOL_PATH,
  TASK_POOL_SCHEMA_VERSION,
  type TaskPoolAssignmentResult,
  type TaskPoolCreateInput,
  type TaskPoolDailyAssignment,
  type TaskPoolDailyReference,
  type TaskPoolDiagnostic,
  type TaskPoolDocument,
  type TaskPoolExport,
  type TaskPoolFormatPreview,
  type TaskPoolFormatResult,
  type TaskPoolFormatUndoResult,
  type TaskPoolItem,
  type TaskPoolLifecycleState,
  type TaskPoolReconciliation,
  type TaskPoolRevision,
  type TaskPoolTransitionResult,
  type TaskPoolUpdate
} from "./task-pool-types";

const TASK_RE = /^(?<indent>[ \t]*)[-+*][ \t]+\[(?<mark>[^\]])\][ \t]+(?<body>.*)$/u;
const INLINE_TASK_ID_RE = /(?:^|\s)\^(?<id>task_[A-Za-z0-9_-]+)\s*$/u;
const STANDALONE_TASK_ID_RE = /^[ \t]+\^(?<id>task_[A-Za-z0-9_-]+)\s*$/u;
const INLINE_DAILY_ID_RE = /(?:^|\s)\^(?<id>daily_[A-Za-z0-9_-]+)\s*$/u;
const STANDALONE_DAILY_ID_RE = /^[ \t]+\^(?<id>daily_[A-Za-z0-9_-]+)\s*$/u;
const OWNED_FIELD_RE = /^[ \t]*\[towrite-(?<key>[a-z-]+)::[ \t]*(?<value>.*)\][ \t]*$/iu;
const OWNED_COMMENT_FIELD_RE = /^[ \t]*%%[ \t]*\[towrite-(?<key>[a-z-]+)::[ \t]*(?<value>.*)\][ \t]*%%[ \t]*$/iu;
const TASK_REF_RE = /\[towrite-task-ref::[ \t]*(?<id>task_[A-Za-z0-9_-]+)\]/iu;
const TASK_ID_RE = /^task_[0-9a-f]{32}$/u;
const DAILY_ID_RE = /^daily_[0-9a-f]{32}$/u;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const OWNED_KEYS = new Set([
  "state",
  "category",
  "project",
  "target",
  "source",
  "due",
  "estimate",
  "planned",
  "returned",
  "dropped",
  "completed",
  "assignment"
]);

export interface TaskPoolStorage {
  readText(path: string): Promise<string | undefined>;
  writeText(path: string, content: string): Promise<void>;
}

export interface TaskPoolServiceOptions {
  path?: string;
  heading?: string;
  now?: () => Date;
  createTaskId?: () => string;
  createAssignmentId?: () => string;
  onChanged?: (path: string) => void | Promise<void>;
}

export interface TaskPoolDailyReferenceLike {
  taskRef?: string;
  date?: string;
  assignmentId?: string;
}

export class TaskPoolConflictError extends Error {
  constructor(
    public readonly code:
      | "not-found"
      | "revision-changed"
      | "id-reused"
      | "invalid-document"
      | "invalid-state",
    message: string
  ) {
    super(message);
    this.name = "TaskPoolConflictError";
  }
}

export class TaskPoolService {
  readonly path: string;
  readonly heading: string;
  private readonly now: () => Date;
  private readonly createTaskId: () => string;
  private readonly createAssignmentId: () => string;
  private lock: Promise<void> = Promise.resolve();
  private formatUndo?: {
    token: string;
    before: string;
    afterRevision: string;
  };

  constructor(
    private readonly storage: TaskPoolStorage,
    private readonly options: TaskPoolServiceOptions = {}
  ) {
    this.path = normalizePoolPath(options.path ?? DEFAULT_TASK_POOL_PATH);
    this.heading = normalizeHeading(options.heading ?? DEFAULT_TASK_POOL_HEADING);
    this.now = options.now ?? (() => new Date());
    this.createTaskId = options.createTaskId ?? createTaskPoolId;
    this.createAssignmentId = options.createAssignmentId ?? createDailyAssignmentId;
  }

  async read(): Promise<TaskPoolDocument> {
    return parseTaskPoolMarkdown(
      await this.storage.readText(this.path) ?? "",
      this.path,
      this.heading
    );
  }

  async list(): Promise<TaskPoolItem[]> {
    return (await this.read()).items;
  }

  async get(taskId: string): Promise<TaskPoolItem | undefined> {
    return (await this.read()).items.find((item) => item.taskId === taskId);
  }

  async create(input: TaskPoolCreateInput): Promise<TaskPoolItem> {
    const taskId = normalizeTaskId(input.id ?? this.createTaskId());
    if (!taskId) throw new Error("Task pool id must be task_<128-bit hex>.");
    const desired = createTaskShape(taskId, input, this.path);
    return this.withLock(async () => {
      const current = await this.storage.readText(this.path) ?? "";
      const document = parseTaskPoolMarkdown(current, this.path, this.heading);
      assertWritable(document);
      const existing = document.items.find((item) => item.taskId === taskId);
      if (existing) {
        if (sameCreateRequest(existing, desired)) return existing;
        throw new TaskPoolConflictError("id-reused", `Task pool id is already used: ${taskId}`);
      }
      const next = appendTaskBlock(current, this.heading, formatTaskPoolItem(desired));
      await this.write(next);
      return requireTask(parseTaskPoolMarkdown(next, this.path, this.heading), taskId);
    });
  }

  update(
    taskId: string,
    expectedRevision: string | TaskPoolRevision,
    patch: TaskPoolUpdate
  ): Promise<TaskPoolItem> {
    return this.mutate(taskId, expectedRevision, (item) => {
      if (item.state === "planned") {
        throw new TaskPoolConflictError(
          "invalid-state",
          "Edit a planned task through its Daily assignment so both documents remain consistent."
        );
      }
      return applyTaskPoolUpdate(item, patch);
    });
  }

  updateAssigned(
    taskId: string,
    expectedRevision: string | TaskPoolRevision,
    date: string,
    assignmentId: string,
    patch: TaskPoolUpdate
  ): Promise<TaskPoolItem> {
    const plannedDate = requireDate(date, "planned date");
    const normalizedAssignmentId = normalizeDailyId(assignmentId);
    if (!normalizedAssignmentId) {
      throw new Error("Daily assignment id must be daily_<128-bit hex>.");
    }
    return this.mutate(taskId, expectedRevision, (item) => {
      assertCurrentAssignment(item, plannedDate, normalizedAssignmentId);
      return applyTaskPoolUpdate(item, patch);
    });
  }

  async assignToDate(
    taskId: string,
    expectedRevision: string | TaskPoolRevision,
    date: string
  ): Promise<TaskPoolAssignmentResult> {
    const plannedDate = requireDate(date, "planned date");
    let idempotent = false;
    const task = await this.mutate(taskId, expectedRevision, (item) => {
      if (item.state === "done" || item.state === "dropped") {
        throw new TaskPoolConflictError("invalid-state", `Cannot plan a ${item.state} task.`);
      }
      if (item.state === "planned" && item.plannedDate === plannedDate && item.assignmentId) {
        idempotent = true;
        return item;
      }
      const assignmentId = normalizeDailyId(this.createAssignmentId());
      if (!assignmentId) throw new Error("Daily assignment id must be daily_<128-bit hex>.");
      return {
        ...item,
        state: "planned",
        plannedDate,
        assignmentId,
        returnedDate: undefined,
        droppedAt: undefined,
        completedAt: undefined
      };
    });
    const assignment = toDailyAssignment(task, plannedDate);
    return {
      task,
      assignment,
      referenceMarkdown: formatDailyTaskPoolReference(assignment),
      idempotent
    };
  }

  async returnToPool(
    taskId: string,
    expectedRevision: string | TaskPoolRevision,
    returnedDate = localDate(this.now())
  ): Promise<TaskPoolTransitionResult> {
    const date = requireDate(returnedDate, "returned date");
    let releasedAssignmentId: string | undefined;
    let idempotent = false;
    const task = await this.mutate(taskId, expectedRevision, (item) => {
      if (item.state === "returned" && item.returnedDate === date && !item.assignmentId) {
        idempotent = true;
        return item;
      }
      if (item.state !== "planned") {
        throw new TaskPoolConflictError("invalid-state", "Only a planned task can return to the pool.");
      }
      releasedAssignmentId = item.assignmentId;
      return {
        ...item,
        state: "returned",
        plannedDate: undefined,
        assignmentId: undefined,
        returnedDate: date
      };
    });
    return { task, releasedAssignmentId, idempotent };
  }

  async drop(
    taskId: string,
    expectedRevision: string | TaskPoolRevision,
    at = this.now()
  ): Promise<TaskPoolTransitionResult> {
    let releasedAssignmentId: string | undefined;
    let idempotent = false;
    const droppedAt = absoluteIso(at);
    const task = await this.mutate(taskId, expectedRevision, (item) => {
      if (item.state === "dropped") {
        idempotent = true;
        return item;
      }
      if (item.state === "done") {
        throw new TaskPoolConflictError("invalid-state", "A completed task cannot be dropped.");
      }
      releasedAssignmentId = item.assignmentId;
      return {
        ...item,
        state: "dropped",
        plannedDate: undefined,
        assignmentId: undefined,
        droppedAt,
        completedAt: undefined
      };
    });
    return { task, releasedAssignmentId, idempotent };
  }

  async complete(
    taskId: string,
    expectedRevision: string | TaskPoolRevision,
    at = this.now()
  ): Promise<TaskPoolTransitionResult> {
    let releasedAssignmentId: string | undefined;
    let idempotent = false;
    const completedAt = absoluteIso(at);
    const task = await this.mutate(taskId, expectedRevision, (item) => {
      if (item.state === "done") {
        idempotent = true;
        return item;
      }
      if (item.state === "dropped") {
        throw new TaskPoolConflictError("invalid-state", "A dropped task cannot be completed.");
      }
      releasedAssignmentId = item.assignmentId;
      return {
        ...item,
        state: "done",
        completedAt,
        droppedAt: undefined
      };
    });
    return { task, releasedAssignmentId, idempotent };
  }

  async completeAssigned(
    taskId: string,
    expectedRevision: string | TaskPoolRevision,
    date: string,
    assignmentId: string,
    at = this.now()
  ): Promise<TaskPoolTransitionResult> {
    const plannedDate = requireDate(date, "planned date");
    const normalizedAssignmentId = normalizeDailyId(assignmentId);
    if (!normalizedAssignmentId) {
      throw new Error("Daily assignment id must be daily_<128-bit hex>.");
    }
    const completedAt = absoluteIso(at);
    const task = await this.mutate(taskId, expectedRevision, (item) => {
      assertCurrentAssignment(item, plannedDate, normalizedAssignmentId);
      return {
        ...item,
        state: "done",
        completedAt,
        droppedAt: undefined
      };
    });
    return { task, releasedAssignmentId: normalizedAssignmentId, idempotent: false };
  }

  /**
   * Compensation-only removal for a task that has not been assigned.
   * Normal user removal uses the visible `dropped` lifecycle state instead.
   */
  removeUnassigned(
    taskId: string,
    expectedRevision: string | TaskPoolRevision
  ): Promise<void> {
    return this.withLock(async () => {
      const current = await this.storage.readText(this.path);
      if (current === undefined) {
        throw new TaskPoolConflictError("not-found", `Task pool does not exist: ${this.path}`);
      }
      const document = parseTaskPoolMarkdown(current, this.path, this.heading);
      assertWritable(document);
      const item = document.items.find((candidate) => candidate.taskId === taskId);
      if (!item) throw new TaskPoolConflictError("not-found", `Task does not exist: ${taskId}`);
      assertRevision(item, expectedRevision);
      if (item.state !== "pool" && item.state !== "returned") {
        throw new TaskPoolConflictError(
          "invalid-state",
          "Only an unassigned Task Pool item can be removed as transaction compensation."
        );
      }
      await this.write(removeTaskBlock(current, item));
    });
  }

  async reopenForDate(
    taskId: string,
    expectedRevision: string | TaskPoolRevision,
    date: string,
    assignmentId: string
  ): Promise<TaskPoolTransitionResult> {
    const plannedDate = requireDate(date, "planned date");
    const normalizedAssignmentId = normalizeDailyId(assignmentId);
    if (!normalizedAssignmentId) {
      throw new Error("Daily assignment id must be daily_<128-bit hex>.");
    }
    let idempotent = false;
    const task = await this.mutate(taskId, expectedRevision, (item) => {
      if (
        item.state === "planned"
        && item.plannedDate === plannedDate
        && item.assignmentId === normalizedAssignmentId
      ) {
        idempotent = true;
        return item;
      }
      if (item.state !== "done") {
        throw new TaskPoolConflictError("invalid-state", "Only a completed task can be reopened.");
      }
      if (item.plannedDate !== plannedDate || item.assignmentId !== normalizedAssignmentId) {
        throw new TaskPoolConflictError(
          "invalid-state",
          "The completed task belongs to another Daily assignment."
        );
      }
      return {
        ...item,
        state: "planned",
        plannedDate,
        assignmentId: normalizedAssignmentId,
        completedAt: undefined,
        returnedDate: undefined,
        droppedAt: undefined
      };
    });
    return { task, idempotent };
  }

  async restoreAssignment(
    taskId: string,
    expectedRevision: string | TaskPoolRevision,
    date: string,
    assignmentId: string
  ): Promise<TaskPoolTransitionResult> {
    const plannedDate = requireDate(date, "planned date");
    const normalizedAssignmentId = normalizeDailyId(assignmentId);
    if (!normalizedAssignmentId) {
      throw new Error("Daily assignment id must be daily_<128-bit hex>.");
    }
    let idempotent = false;
    const task = await this.mutate(taskId, expectedRevision, (item) => {
      if (
        item.state === "planned"
        && item.plannedDate === plannedDate
        && item.assignmentId === normalizedAssignmentId
      ) {
        idempotent = true;
        return item;
      }
      if (item.state === "done") {
        throw new TaskPoolConflictError("invalid-state", "A completed task cannot restore a live assignment.");
      }
      return {
        ...item,
        state: "planned",
        plannedDate,
        assignmentId: normalizedAssignmentId,
        returnedDate: undefined,
        droppedAt: undefined,
        completedAt: undefined
      };
    });
    return { task, idempotent };
  }

  async candidates(
    date: string,
    dailyReferences: readonly TaskPoolDailyReferenceLike[] = []
  ): Promise<TaskPoolItem[]> {
    const document = await this.read();
    assertWritable(document);
    return reconcileDailyAssignments(document.items, dailyReferences, date).candidates;
  }

  async export(at = this.now()): Promise<TaskPoolExport> {
    return exportTaskPoolDocument(await this.read(), at);
  }

  async previewFormatCleanup(): Promise<TaskPoolFormatPreview> {
    const before = await this.storage.readText(this.path) ?? "";
    const document = parseTaskPoolMarkdown(before, this.path, this.heading);
    assertWritable(document);
    return createTaskPoolFormatPreview(before, document);
  }

  async applyFormatCleanup(expectedRevision: string): Promise<TaskPoolFormatResult> {
    return this.withLock(async () => {
      const before = await this.storage.readText(this.path) ?? "";
      const document = parseTaskPoolMarkdown(before, this.path, this.heading);
      assertWritable(document);
      if (taskPoolMarkdownRevision(this.path, before) !== expectedRevision) {
        throw new TaskPoolConflictError(
          "revision-changed",
          "Task Pool changed after the cleanup preview was generated."
        );
      }
      const preview = createTaskPoolFormatPreview(before, document);
      if (!preview.changed) return { document, changed: false };
      await this.write(preview.after);
      const next = parseTaskPoolMarkdown(preview.after, this.path, this.heading);
      const token = `tpf_${contentHash128(`${this.path}\n${this.now().toISOString()}\n${next.revision}\n${before}`)}`;
      this.formatUndo = {
        token,
        before,
        afterRevision: taskPoolMarkdownRevision(this.path, preview.after)
      };
      return { document: next, undoToken: token, changed: true };
    });
  }

  async undoFormatCleanup(token: string): Promise<TaskPoolFormatUndoResult> {
    return this.withLock(async () => {
      const undo = this.formatUndo;
      if (!undo || undo.token !== token) {
        throw new TaskPoolConflictError("invalid-state", "The Task Pool cleanup undo token is no longer available.");
      }
      const current = await this.storage.readText(this.path) ?? "";
      const document = parseTaskPoolMarkdown(current, this.path, this.heading);
      assertWritable(document);
      if (taskPoolMarkdownRevision(this.path, current) !== undo.afterRevision) {
        throw new TaskPoolConflictError(
          "revision-changed",
          "Task Pool changed after cleanup, so undo was refused."
        );
      }
      await this.write(undo.before);
      this.formatUndo = undefined;
      return {
        document: parseTaskPoolMarkdown(undo.before, this.path, this.heading),
        restored: true
      };
    });
  }

  private mutate(
    taskId: string,
    expectedRevision: string | TaskPoolRevision,
    update: (item: TaskPoolItem) => TaskPoolItem
  ): Promise<TaskPoolItem> {
    return this.withLock(async () => {
      const current = await this.storage.readText(this.path);
      if (current === undefined) {
        throw new TaskPoolConflictError("not-found", `Task pool does not exist: ${this.path}`);
      }
      const document = parseTaskPoolMarkdown(current, this.path, this.heading);
      assertWritable(document);
      const item = document.items.find((candidate) => candidate.taskId === taskId);
      if (!item) throw new TaskPoolConflictError("not-found", `Task does not exist: ${taskId}`);
      assertRevision(item, expectedRevision);
      const updated = update(item);
      if (sameTask(item, updated)) return item;
      const next = replaceTaskBlock(current, item, formatTaskPoolItem(updated, item.rawBlock));
      await this.write(next);
      return requireTask(parseTaskPoolMarkdown(next, this.path, this.heading), taskId);
    });
  }

  private async write(markdown: string): Promise<void> {
    await this.storage.writeText(this.path, markdown);
    await this.options.onChanged?.(this.path);
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.lock;
    let release: (() => void) | undefined;
    this.lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
    }
  }
}

export function parseTaskPoolMarkdown(
  markdown: string,
  sourcePath = DEFAULT_TASK_POOL_PATH,
  heading = DEFAULT_TASK_POOL_HEADING
): TaskPoolDocument {
  const lines = markdown.split(/\r?\n/u);
  const section = findSection(lines, normalizeHeading(heading));
  const diagnostics: TaskPoolDiagnostic[] = [];
  const items: TaskPoolItem[] = [];
  if (section) {
    const taskLines: number[] = [];
    for (let index = section.start; index < section.end; index += 1) {
      if (TASK_RE.test(lines[index])) taskLines.push(index);
    }
    for (let position = 0; position < taskLines.length; position += 1) {
      const start = taskLines[position];
      const limit = taskLines[position + 1] ?? section.end;
      let end = limit - 1;
      while (end > start && !lines[end].trim()) end -= 1;
      const rawBlock = lines.slice(start, end + 1).join("\n");
      const parsed = parseTaskBlock(rawBlock, sourcePath, start + 1, end + 1, diagnostics);
      if (parsed) items.push(parsed);
    }
  }

  const byId = new Map<string, TaskPoolItem[]>();
  for (const item of items) {
    const matches = byId.get(item.taskId) ?? [];
    matches.push(item);
    byId.set(item.taskId, matches);
  }
  for (const [taskId, matches] of byId) {
    if (matches.length < 2) continue;
    for (const item of matches) {
      diagnostics.push({
        code: "duplicate-task-id",
        severity: "error",
        message: `Task pool id is used more than once: ${taskId}`,
        sourcePath,
        line: item.line,
        taskId
      });
    }
  }
  const scoped = section ? lines.slice(section.headingLine, section.end).join("\n") : "";
  return {
    schemaVersion: TASK_POOL_SCHEMA_VERSION,
    sourcePath,
    heading: normalizeHeading(heading),
    items,
    diagnostics,
    revision: `tpd_${contentHash128(`${sourcePath}\n${scoped}`)}`
  };
}

export function formatTaskPoolItem(item: TaskPoolItem, existingRawBlock?: string): string {
  const indent = /^[ \t]*/u.exec(item.rawLine)?.[0] ?? "";
  const continuationIndent = `${indent}  `;
  const mark = item.state === "done" ? "x" : " ";
  const lines = [
    `${indent}- [${mark}] ${normalizeText(item.text)}`,
    `${continuationIndent}%% [towrite-state:: ${item.state}] %%`,
    ...fieldLine(continuationIndent, "category", item.category),
    ...fieldLine(continuationIndent, "project", item.project, true),
    ...fieldLine(continuationIndent, "target", item.target, true),
    ...fieldLine(continuationIndent, "source", item.source, true),
    ...fieldLine(continuationIndent, "due", item.dueDate),
    ...fieldLine(continuationIndent, "estimate", item.estimateMinutes ? `${item.estimateMinutes}m` : undefined),
    ...fieldLine(continuationIndent, "planned", item.plannedDate),
    ...fieldLine(continuationIndent, "returned", item.returnedDate),
    ...fieldLine(continuationIndent, "dropped", item.droppedAt),
    ...fieldLine(continuationIndent, "completed", item.completedAt),
    ...fieldLine(continuationIndent, "assignment", item.assignmentId),
    ...extractUnknownLines(existingRawBlock, item.unknownLines),
    `${continuationIndent}^${item.taskId}`
  ];
  return lines.join("\n");
}

export function createTaskPoolFormatPreview(
  markdown: string,
  document: TaskPoolDocument
): TaskPoolFormatPreview {
  const legacyItems = document.items.filter((item) => hasLegacyTaskPoolFormatting(item.rawBlock));
  let after = markdown;
  for (const item of [...legacyItems].sort((left, right) => right.line - left.line)) {
    after = replaceTaskBlock(after, item, formatTaskPoolItem(item, item.rawBlock));
  }
  return {
    sourcePath: document.sourcePath,
    expectedRevision: taskPoolMarkdownRevision(document.sourcePath, markdown),
    changed: after !== markdown,
    legacyFieldCount: legacyItems.reduce((count, item) => count + countLegacyOwnedFields(item.rawBlock), 0),
    affectedTaskIds: legacyItems.map((item) => item.taskId),
    before: markdown,
    after
  };
}

function hasLegacyTaskPoolFormatting(rawBlock: string): boolean {
  return countLegacyOwnedFields(rawBlock) > 0;
}

function countLegacyOwnedFields(rawBlock: string): number {
  return rawBlock.split(/\r?\n/u).slice(1)
    .filter((line) => OWNED_FIELD_RE.test(line.replace(/\u200b/gu, "")))
    .length;
}

function taskPoolMarkdownRevision(sourcePath: string, markdown: string): string {
  return `tpfrev_${contentHash128(`${sourcePath}\n${markdown}`)}`;
}

export function toDailyAssignment(task: TaskPoolItem, date: string): TaskPoolDailyAssignment {
  const normalizedDate = requireDate(date, "Daily assignment date");
  return {
    schemaVersion: TASK_POOL_SCHEMA_VERSION,
    taskRef: task.taskId,
    date: normalizedDate,
    category: task.category,
    project: task.project,
    target: task.target,
    dueDate: task.dueDate,
    estimateMinutes: task.estimateMinutes,
    taskRevision: task.revision.value,
    assignmentId: task.assignmentId
  };
}

export function formatDailyTaskPoolReference(assignment: TaskPoolDailyAssignment): string {
  const assignmentId = normalizeDailyId(assignment.assignmentId);
  if (!assignmentId) {
    throw new Error("A content-free Daily task reference requires a stable assignment id.");
  }
  return [
    `- [ ] [towrite-task-ref:: ${assignment.taskRef}]`,
    `  ^${assignmentId}`
  ].join("\n");
}

export function parseDailyTaskPoolReferences(
  markdown: string,
  date: string
): TaskPoolDailyReference[] {
  const normalizedDate = requireDate(date, "Daily reference date");
  const lines = markdown.split(/\r?\n/u);
  const output: TaskPoolDailyReference[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const taskId = normalizeTaskId(TASK_REF_RE.exec(lines[index])?.groups?.id);
    if (!taskId) continue;
    const inline = normalizeDailyId(INLINE_DAILY_ID_RE.exec(lines[index])?.groups?.id);
    const standalone = normalizeDailyId(STANDALONE_DAILY_ID_RE.exec(lines[index + 1] ?? "")?.groups?.id);
    output.push({
      schemaVersion: TASK_POOL_SCHEMA_VERSION,
      taskRef: taskId,
      date: normalizedDate,
      line: index + 1,
      assignmentId: inline ?? standalone
    });
  }
  return output;
}

export function reconcileDailyAssignments(
  poolItems: readonly TaskPoolItem[],
  dailyReferences: readonly TaskPoolDailyReferenceLike[],
  date: string
): TaskPoolReconciliation {
  const normalizedDate = requireDate(date, "reconciliation date");
  const byId = new Map(poolItems.map((item) => [item.taskId, item]));
  const counts = new Map<string, number>();
  for (const reference of dailyReferences) {
    const referenceDate = reference.date ? requireDate(reference.date, "Daily reference date") : normalizedDate;
    if (referenceDate !== normalizedDate) continue;
    const taskId = normalizeTaskId(reference.taskRef);
    if (!taskId) continue;
    counts.set(taskId, (counts.get(taskId) ?? 0) + 1);
  }
  const assignedTaskIds = [...counts.keys()].filter((taskId) => byId.has(taskId)).sort();
  const duplicateTaskIds = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([taskId]) => taskId)
    .sort();
  const staleTaskIds = [...counts.keys()].filter((taskId) => !byId.has(taskId)).sort();
  const orphanedPlannedTaskIds = poolItems
    .filter((item) => item.state === "planned" && item.plannedDate === normalizedDate && !counts.has(item.taskId))
    .map((item) => item.taskId)
    .sort();
  const stateMismatchTaskIds = assignedTaskIds
    .filter((taskId) => {
      const item = byId.get(taskId)!;
      return item.state !== "planned" || item.plannedDate !== normalizedDate;
    })
    .sort();
  const candidates = poolItems
    .filter((item) => (item.state === "pool" || item.state === "returned") && !counts.has(item.taskId))
    .map(cloneTask);
  return {
    date: normalizedDate,
    assignedTaskIds,
    duplicateTaskIds,
    staleTaskIds,
    orphanedPlannedTaskIds,
    stateMismatchTaskIds,
    candidates
  };
}

export function exportTaskPoolDocument(
  document: TaskPoolDocument,
  at: Date | string = new Date()
): TaskPoolExport {
  const exportedAt = absoluteIso(at);
  return {
    schemaVersion: TASK_POOL_SCHEMA_VERSION,
    exportedAt,
    sourcePath: document.sourcePath,
    revision: document.revision,
    items: document.items.map((item) => ({
      taskId: item.taskId,
      text: item.text,
      state: item.state,
      category: item.category,
      project: item.project,
      target: item.target,
      source: item.source,
      dueDate: item.dueDate,
      estimateMinutes: item.estimateMinutes,
      plannedDate: item.plannedDate,
      returnedDate: item.returnedDate,
      droppedAt: item.droppedAt,
      completedAt: item.completedAt,
      assignmentId: item.assignmentId,
      revision: item.revision.value
    }))
  };
}

function parseTaskBlock(
  rawBlock: string,
  sourcePath: string,
  line: number,
  endLine: number,
  diagnostics: TaskPoolDiagnostic[]
): TaskPoolItem | undefined {
  const blockLines = rawBlock.split("\n");
  const match = TASK_RE.exec(blockLines[0] ?? "");
  if (!match?.groups) return undefined;
  const fields = new Map<string, string>();
  const unknownLines: string[] = [];
  const ids: string[] = [];
  const inlineId = INLINE_TASK_ID_RE.exec(match.groups.body)?.groups?.id;
  if (inlineId) ids.push(inlineId);
  for (const continuation of blockLines.slice(1)) {
    const standaloneId = STANDALONE_TASK_ID_RE.exec(continuation)?.groups?.id;
    if (standaloneId) {
      ids.push(standaloneId);
      continue;
    }
    const field = parseOwnedField(continuation);
    if (field?.groups && OWNED_KEYS.has(field.groups.key.toLowerCase())) {
      fields.set(field.groups.key.toLowerCase(), field.groups.value.trim());
      continue;
    }
    unknownLines.push(continuation);
  }
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    diagnostics.push({
      code: "missing-task-id",
      severity: "error",
      message: "Task pool item is missing a stable ^task_<128-bit> id.",
      sourcePath,
      line
    });
    return undefined;
  }
  const taskId = normalizeTaskId(uniqueIds[0]);
  if (!taskId || uniqueIds.length !== 1) {
    diagnostics.push({
      code: "invalid-task-id",
      severity: "error",
      message: uniqueIds.length > 1
        ? "Task pool item contains more than one task id."
        : `Task pool id is invalid: ${uniqueIds[0]}`,
      sourcePath,
      line,
      taskId: uniqueIds[0]
    });
    return undefined;
  }

  const declaredState = normalizeState(fields.get("state"), match.groups.mark);
  const checkboxDone = match.groups.mark.toLowerCase() === "x";
  const state = checkboxDone
    ? "done"
    : declaredState === "done"
      ? "pool"
      : declaredState;
  if (!state) {
    diagnostics.push({
      code: "invalid-state",
      severity: "error",
      message: `Task pool lifecycle state is invalid: ${fields.get("state") ?? ""}`,
      sourcePath,
      line,
      taskId
    });
    return undefined;
  }
  const dueDate = parsedDate(fields.get("due"), "due date", taskId, sourcePath, line, diagnostics);
  const plannedDate = parsedDate(fields.get("planned"), "planned date", taskId, sourcePath, line, diagnostics);
  const returnedDate = parsedDate(fields.get("returned"), "returned date", taskId, sourcePath, line, diagnostics);
  const estimateMinutes = parsedEstimate(fields.get("estimate"), taskId, sourcePath, line, diagnostics);
  const assignmentId = parsedAssignmentId(fields.get("assignment"), taskId, sourcePath, line, diagnostics);
  const text = normalizeText(match.groups.body.replace(INLINE_TASK_ID_RE, ""));
  return {
    schemaVersion: TASK_POOL_SCHEMA_VERSION,
    id: taskId,
    taskId,
    text,
    state,
    sourcePath,
    line,
    endLine,
    rawLine: blockLines[0],
    rawBlock,
    revision: taskRevision(sourcePath, taskId, rawBlock),
    category: normalizeOptional(fields.get("category")),
    project: normalizeOptional(fields.get("project")),
    target: parsedTaskTarget(fields.get("target"), taskId, sourcePath, line, diagnostics),
    source: parsedTaskSource(fields.get("source"), taskId, sourcePath, line, diagnostics),
    dueDate,
    estimateMinutes,
    plannedDate,
    returnedDate,
    droppedAt: parsedTimestamp(fields.get("dropped"), "dropped time", taskId, sourcePath, line, diagnostics),
    completedAt: parsedTimestamp(fields.get("completed"), "completed time", taskId, sourcePath, line, diagnostics),
    assignmentId,
    unknownLines
  };
}

function createTaskShape(taskId: string, input: TaskPoolCreateInput, sourcePath: string): TaskPoolItem {
  const item: TaskPoolItem = {
    schemaVersion: TASK_POOL_SCHEMA_VERSION,
    id: taskId,
    taskId,
    text: normalizeText(input.text),
    state: "pool",
    sourcePath,
    line: 0,
    endLine: 0,
    rawLine: "",
    rawBlock: "",
    revision: { value: "", sourcePath, taskId },
    category: normalizeOptional(input.category),
    project: normalizeOptional(input.project),
    target: normalizeTaskTarget(input.target),
    source: normalizeTaskSource(input.source),
    dueDate: input.dueDate ? requireDate(input.dueDate, "due date") : undefined,
    estimateMinutes: input.estimateMinutes === undefined ? undefined : normalizeEstimate(input.estimateMinutes),
    unknownLines: []
  };
  const rawBlock = formatTaskPoolItem(item);
  return {
    ...item,
    rawLine: rawBlock.split("\n")[0],
    rawBlock,
    revision: taskRevision(sourcePath, taskId, rawBlock)
  };
}

function findSection(
  lines: readonly string[],
  heading: string
): { headingLine: number; start: number; end: number; level: number } | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(?<marks>#{1,6})[ \t]+(?<text>.+?)[ \t]*#*[ \t]*$/u.exec(lines[index]);
    if (!match?.groups || match.groups.text.trim().toLowerCase() !== heading.toLowerCase()) continue;
    const level = match.groups.marks.length;
    let end = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const next = /^(?<marks>#{1,6})[ \t]+/u.exec(lines[cursor]);
      if (next?.groups && next.groups.marks.length <= level) {
        end = cursor;
        break;
      }
    }
    return { headingLine: index, start: index + 1, end, level };
  }
  return undefined;
}

function appendTaskBlock(markdown: string, heading: string, block: string): string {
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown ? markdown.split(/\r?\n/u) : [];
  const section = findSection(lines, heading);
  if (!section) {
    const prefix = markdown.trimEnd();
    const created = [
      prefix || "# Task Pool",
      "",
      `## ${heading}`,
      "",
      block
    ].join(newline);
    return `${created}${newline}`;
  }
  const before = lines.slice(0, section.end);
  while (before.length > section.start && !before[before.length - 1].trim()) before.pop();
  const after = lines.slice(section.end);
  const joined = [
    ...before,
    ...(before.length > section.start ? [""] : []),
    ...block.split("\n"),
    ...(after.length ? ["", ...after] : [])
  ].join(newline);
  return `${joined.replace(/\s+$/u, "")}${newline}`;
}

function replaceTaskBlock(markdown: string, item: TaskPoolItem, block: string): string {
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/u);
  lines.splice(item.line - 1, item.endLine - item.line + 1, ...block.split("\n"));
  return lines.join(newline);
}

function removeTaskBlock(markdown: string, item: TaskPoolItem): string {
  const lines = markdown.split(/\r?\n/u);
  const start = item.line - 1;
  lines.splice(start, item.endLine - item.line + 1);
  // Collapse only the extra separator left by this block. User-authored
  // spacing elsewhere in the document remains untouched.
  if (start > 0 && lines[start - 1] === "" && lines[start] === "") {
    lines.splice(start, 1);
  }
  return lines.join("\n");
}

function extractUnknownLines(existingRawBlock: string | undefined, fallback: readonly string[]): string[] {
  if (!existingRawBlock) return [...fallback];
  return existingRawBlock.split(/\r?\n/u).slice(1).filter((line) => {
    if (STANDALONE_TASK_ID_RE.test(line)) return false;
    const field = parseOwnedField(line);
    return !(field?.groups && OWNED_KEYS.has(field.groups.key.toLowerCase()));
  });
}

function fieldLine(indent: string, key: string, value: string | undefined, allowWikilink = false): string[] {
  const normalized = safeField(value, allowWikilink);
  return normalized ? [`${indent}%% [towrite-${key}:: ${normalized}] %%`] : [];
}

function parseOwnedField(line: string): RegExpExecArray | null {
  return OWNED_COMMENT_FIELD_RE.exec(line) ?? OWNED_FIELD_RE.exec(line);
}

function safeField(value: string | undefined, allowWikilink: boolean): string | undefined {
  const normalized = normalizeOptional(value);
  if (!normalized) return undefined;
  if (allowWikilink && /^\[\[[^\]\r\n]+\]\]$/u.test(normalized)) return normalized;
  return normalized.replace(/[\r\n\]]+/gu, " ").replace(/\s+/gu, " ").trim() || undefined;
}

function parsedTaskTarget(
  value: string | undefined,
  taskId: string,
  sourcePath: string,
  line: number,
  diagnostics: TaskPoolDiagnostic[]
): string | undefined {
  try {
    return normalizeTaskTarget(value);
  } catch (error) {
    diagnostics.push({
      code: "invalid-target",
      severity: "error",
      message: error instanceof Error ? error.message : "Task Pool target is invalid.",
      sourcePath,
      line,
      taskId
    });
    return normalizeOptional(value);
  }
}

function parsedTaskSource(
  value: string | undefined,
  taskId: string,
  sourcePath: string,
  line: number,
  diagnostics: TaskPoolDiagnostic[]
): string | undefined {
  try {
    return normalizeTaskSource(value);
  } catch (error) {
    diagnostics.push({
      code: "invalid-source",
      severity: "error",
      message: error instanceof Error ? error.message : "Task Pool source is invalid.",
      sourcePath,
      line,
      taskId
    });
    return normalizeOptional(value);
  }
}

function parsedDate(
  value: string | undefined,
  label: string,
  taskId: string,
  sourcePath: string,
  line: number,
  diagnostics: TaskPoolDiagnostic[]
): string | undefined {
  if (!value) return undefined;
  if (validDate(value)) return value;
  diagnostics.push({
    code: "invalid-date",
    severity: "warning",
    message: `Task pool ${label} is invalid: ${value}`,
    sourcePath,
    line,
    taskId
  });
  return undefined;
}

function parsedTimestamp(
  value: string | undefined,
  label: string,
  taskId: string,
  sourcePath: string,
  line: number,
  diagnostics: TaskPoolDiagnostic[]
): string | undefined {
  if (!value) return undefined;
  if (Number.isFinite(Date.parse(value))) return value;
  diagnostics.push({
    code: "invalid-date",
    severity: "warning",
    message: `Task pool ${label} is invalid: ${value}`,
    sourcePath,
    line,
    taskId
  });
  return undefined;
}

function parsedEstimate(
  value: string | undefined,
  taskId: string,
  sourcePath: string,
  line: number,
  diagnostics: TaskPoolDiagnostic[]
): number | undefined {
  if (!value) return undefined;
  const match = /^(?<minutes>\d{1,4})(?:m|min)?$/iu.exec(value);
  const minutes = match?.groups ? Number(match.groups.minutes) : Number.NaN;
  if (Number.isInteger(minutes) && minutes >= 1 && minutes <= 1_440) return minutes;
  diagnostics.push({
    code: "invalid-estimate",
    severity: "warning",
    message: `Task pool estimate is invalid: ${value}`,
    sourcePath,
    line,
    taskId
  });
  return undefined;
}

function parsedAssignmentId(
  value: string | undefined,
  taskId: string,
  sourcePath: string,
  line: number,
  diagnostics: TaskPoolDiagnostic[]
): string | undefined {
  if (!value) return undefined;
  const assignmentId = normalizeDailyId(value);
  if (assignmentId) return assignmentId;
  diagnostics.push({
    code: "invalid-assignment-id",
    severity: "warning",
    message: `Task pool assignment id is invalid: ${value}`,
    sourcePath,
    line,
    taskId
  });
  return undefined;
}

function normalizeState(value: string | undefined, mark: string): TaskPoolLifecycleState | undefined {
  if (!value) return mark.toLowerCase() === "x" ? "done" : "pool";
  return value === "pool"
    || value === "planned"
    || value === "returned"
    || value === "dropped"
    || value === "done"
    ? value
    : undefined;
}

function normalizeText(value: unknown): string {
  const text = String(value ?? "").replace(/[\r\n]+/gu, " ").replace(/\s+/gu, " ").trim();
  if (!text) throw new Error("Task pool text is empty.");
  return text.slice(0, 2_000);
}

function normalizeOptional(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = String(value).replace(/[\r\n]+/gu, " ").replace(/\s+/gu, " ").trim();
  return normalized ? normalized.slice(0, 1_000) : undefined;
}

function optionalValue(
  current: string | undefined,
  requested: string | null | undefined
): string | undefined {
  return requested === undefined ? current : normalizeOptional(requested);
}

function applyTaskPoolUpdate(item: TaskPoolItem, patch: TaskPoolUpdate): TaskPoolItem {
  return {
    ...item,
    text: patch.text === undefined ? item.text : normalizeText(patch.text),
    category: optionalValue(item.category, patch.category),
    project: optionalValue(item.project, patch.project),
    target: patch.target === undefined ? item.target : normalizeTaskTarget(patch.target),
    source: patch.source === undefined ? item.source : normalizeTaskSource(patch.source),
    dueDate: patch.dueDate === undefined
      ? item.dueDate
      : patch.dueDate === null
        ? undefined
        : requireDate(patch.dueDate, "due date"),
    estimateMinutes: patch.estimateMinutes === undefined
      ? item.estimateMinutes
      : patch.estimateMinutes === null
        ? undefined
        : normalizeEstimate(patch.estimateMinutes)
  };
}

function assertCurrentAssignment(
  item: TaskPoolItem,
  date: string,
  assignmentId: string
): void {
  if (
    item.state !== "planned"
    || item.plannedDate !== date
    || item.assignmentId !== assignmentId
  ) {
    throw new TaskPoolConflictError(
      "invalid-state",
      "The Daily assignment is no longer the current Task Pool assignment."
    );
  }
}

function normalizeTaskTarget(value: unknown): string | undefined {
  const normalized = normalizeOptional(value);
  if (!normalized) return undefined;
  if (/^\[\[[^\]\r\n]+\]\]$/u.test(normalized)) return normalized;
  const markdown = /^\[([^\]\r\n]+)\]\(([^)\r\n]+)\)$/u.exec(normalized);
  if (markdown) {
    const label = markdown[1].trim();
    const target = safeMarkdownNoteTarget(markdown[2]);
    if (!target) throw new Error("Task Pool target must be a safe Vault-relative Markdown note.");
    return `[[${target}${label ? `|${label}` : ""}]]`;
  }
  if (/[\[\]]/u.test(normalized)) {
    throw new Error("Task Pool target contains malformed Markdown link syntax.");
  }
  return normalized;
}

function normalizeTaskSource(value: unknown): string | undefined {
  const normalized = normalizeTaskTarget(value);
  if (!normalized) return undefined;
  if (!/^\[\[[^\]\r\n]+#\^task_[0-9a-f]{32}\]\]$/u.test(normalized)) {
    throw new Error("Task Pool source must be a Vault block link ending in #^task_<128-bit hex>.");
  }
  return normalized;
}

function safeMarkdownNoteTarget(value: string): string | undefined {
  const decoded = (() => {
    try {
      return decodeURIComponent(value.trim());
    } catch {
      return value.trim();
    }
  })();
  if (!decoded || /^(?:[a-z]+:|[\\/])/iu.test(decoded)) return undefined;
  const fragmentIndex = decoded.indexOf("#");
  const path = fragmentIndex >= 0 ? decoded.slice(0, fragmentIndex) : decoded;
  const fragment = fragmentIndex >= 0 ? decoded.slice(fragmentIndex) : "";
  if (!path.toLowerCase().endsWith(".md") || path.split(/[\\/]/u).includes("..")) return undefined;
  return `${path.slice(0, -3).replace(/\\/gu, "/")}${fragment}`;
}

function normalizeEstimate(value: unknown): number {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1_440) {
    throw new Error("Task pool estimate must be an integer from 1 to 1440 minutes.");
  }
  return minutes;
}

function normalizeTaskId(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim().replace(/^\^/u, "").toLowerCase();
  return TASK_ID_RE.test(normalized) ? normalized : undefined;
}

function normalizeDailyId(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim().replace(/^\^/u, "").toLowerCase();
  return DAILY_ID_RE.test(normalized) ? normalized : undefined;
}

function normalizeHeading(value: string): string {
  const normalized = value.replace(/^#+[ \t]*/u, "").trim();
  if (!normalized || /[\r\n]/u.test(normalized)) throw new Error("Task pool heading is invalid.");
  return normalized;
}

function normalizePoolPath(value: string): string {
  const normalized = value.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Task pool path must be a safe Vault-relative path.");
  }
  return normalized.toLowerCase().endsWith(".md") ? normalized : `${normalized}.md`;
}

function requireDate(value: string, label: string): string {
  if (!validDate(value)) throw new Error(`${label} must be YYYY-MM-DD.`);
  return value;
}

function validDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function localDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function absoluteIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Task pool transition time is invalid.");
  return date.toISOString();
}

function taskRevision(sourcePath: string, taskId: string, rawBlock: string): TaskPoolRevision {
  return {
    value: `tpr_${contentHash128(`${sourcePath}\n${taskId}\n${rawBlock}`)}`,
    sourcePath,
    taskId
  };
}

function assertRevision(item: TaskPoolItem, expected: string | TaskPoolRevision): void {
  const value = typeof expected === "string" ? expected : expected.value;
  if (!value || value !== item.revision.value) {
    throw new TaskPoolConflictError("revision-changed", "Task pool item changed after it was loaded.");
  }
}

function assertWritable(document: TaskPoolDocument): void {
  const errors = document.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length) {
    throw new TaskPoolConflictError(
      "invalid-document",
      `Task pool contains ${errors.length} blocking diagnostic(s).`
    );
  }
}

function requireTask(document: TaskPoolDocument, taskId: string): TaskPoolItem {
  const item = document.items.find((candidate) => candidate.taskId === taskId);
  if (!item) throw new Error(`Task pool write could not be verified: ${taskId}`);
  return item;
}

function sameCreateRequest(left: TaskPoolItem, right: TaskPoolItem): boolean {
  return left.text === right.text
    && left.category === right.category
    && left.project === right.project
    && left.target === right.target
    && left.source === right.source
    && left.dueDate === right.dueDate
    && left.estimateMinutes === right.estimateMinutes;
}

function sameTask(left: TaskPoolItem, right: TaskPoolItem): boolean {
  return left.text === right.text
    && left.state === right.state
    && left.category === right.category
    && left.project === right.project
    && left.target === right.target
    && left.source === right.source
    && left.dueDate === right.dueDate
    && left.estimateMinutes === right.estimateMinutes
    && left.plannedDate === right.plannedDate
    && left.returnedDate === right.returnedDate
    && left.droppedAt === right.droppedAt
    && left.completedAt === right.completedAt
    && left.assignmentId === right.assignmentId;
}

function cloneTask(item: TaskPoolItem): TaskPoolItem {
  return {
    ...item,
    revision: { ...item.revision },
    unknownLines: [...item.unknownLines]
  };
}

function randomHex128(): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Cryptographically secure randomness is unavailable.");
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function createTaskPoolId(): string {
  return `task_${randomHex128()}`;
}

function createDailyAssignmentId(): string {
  return `daily_${randomHex128()}`;
}
