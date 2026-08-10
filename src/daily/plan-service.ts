import { contentHash128 } from "../core/hash";
import {
  DAILY_PLAN_SCHEMA_VERSION,
  DAILY_SCHEMA_VERSION,
  type DailyDevicePolicy,
  type DailyPlanCreateInput,
  type DailyPlanDiagnostic,
  type DailyPlanDocument,
  type DailyPlanHierarchy,
  type DailyPlanItem,
  type DailyPlanItemKind,
  type DailyPlanMetadataUpdate,
  type DailyPlanPriority,
  type DailyPlanSource,
  type DailyPlanStatus,
  type DailyPlanUpdate,
  type DailySummary,
  type DailyTaskMigration,
  type DailyTaskRevision,
  type DailyWorkKind
} from "./types";
import { parseDailyPlanHierarchy } from "./hierarchy";

export interface DailyPlanStorage {
  readText(path: string): Promise<string | undefined>;
  writeText(path: string, content: string): Promise<void>;
}

export interface DailyPlanServiceOptions {
  /** V2 source selection. `dailyRoot` remains the V1 compatibility shortcut. */
  source?: DailyPlanSource;
  dailyRoot?: string;
  planHeading?: string;
  todoHeading?: string;
  summaryHeading?: string;
  /**
   * Emits Tasks-compatible date emoji on the checkbox line. The default
   * keeps the task title clean and stores authored dates as continuation
   * metadata instead.
   */
  tasksCompatibilityOutput?: boolean;
  now?: () => Date;
  createId?: () => string;
  onChanged?: (path: string) => void | Promise<void>;
}

export interface DailyPlanParseOptions {
  source?: DailyPlanSource;
  planHeading?: string;
  summaryHeading?: string;
}

export interface DailyPlanFormatOptions {
  tasksCompatibilityOutput?: boolean;
}

export class DailyPlanConflictError extends Error {
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
    this.name = "DailyPlanConflictError";
  }
}

export const DAILY_SUMMARY_START_MARKER = "<!-- towrite:daily-summary:start -->";
export const DAILY_SUMMARY_END_MARKER = "<!-- towrite:daily-summary:end -->";
export const DAILY_MIGRATION_MARKER = "towrite:daily-task-migrated";

const TASK_RE = /^(?<indent>\s*)-\s+\[(?<mark>[^\]]*)\]\s+(?<body>.*)$/u;
const ANY_TASK_RE = /^(?<indent>\s*)(?:[-+*]|\d+[.)])(?<spacing>\s+)(?<checkbox>\[[^\]]*\]\s+.*)$/u;
const LIST_NODE_RE = /^(?<indent>[ \t]*)(?:[-+*]|\d+[.)])[ \t]+.*$/u;
const INLINE_BLOCK_RE = /(?:^|\s)\^(?<id>[A-Za-z0-9_-]+)\s*$/u;
const STANDALONE_BLOCK_RE = /^(?<indent>\s+)\^(?<id>[A-Za-z0-9_-]+)\s*$/u;
const OWNED_FIELD_RE = /\[towrite-(?<key>kind|category|task-ref|pool-revision|work-kind|work-ref|work-revision|device|at|scheduled|due|primary|minimum|goal|next|estimate|target|started)::\s*(?<value>\[\[[^\]]+\]\]|[^\]]*)\]/giu;
const THEME_FIELD_RE = /\[towrite-theme::\s*(?<value>[^\]]*)\]/giu;
const PRIORITY_RE = /(?:^|\s)(?<emoji>🔺|⏫|🔼|🔽|⏬)(?=\s|$)/gu;
const DATE_RE = {
  scheduled: /\s+⏳\s+(\d{4}-\d{2}-\d{2})/u,
  due: /\s+📅\s+(\d{4}-\d{2}-\d{2})/u,
  completion: /\s+✅\s+(\d{4}-\d{2}-\d{2})/u
} as const;
const TAG_RE = /(?<!\S)#([\p{L}\p{N}_/-]+)/gu;
const LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/gu;

interface ResolvedSource {
  source: DailyPlanSource;
  path: string;
  nestedDate: boolean;
  planLevel: number;
}

interface SectionRange {
  heading: number;
  start: number;
  end: number;
  level: number;
}

interface DateScope {
  heading?: number;
  start: number;
  end: number;
}

interface ParsedTaskEntry {
  item?: DailyPlanItem;
  diagnostic?: DailyPlanDiagnostic;
  blockIds: string[];
  line: number;
  endLine: number;
}

export class DailyPlanService {
  private readonly source: DailyPlanSource;
  private readonly root: string;
  private readonly dateFormat: string;
  private readonly planHeading: string;
  private readonly todoHeading: string;
  private readonly summaryHeading: string;
  private readonly tasksCompatibilityOutput: boolean;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly storage: DailyPlanStorage,
    private readonly options: DailyPlanServiceOptions = {}
  ) {
    this.source = normalizeSource(options.source, options.dailyRoot);
    this.root = this.source.kind === "daily-note"
      ? normalizeRoot(this.source.dailyRoot ?? options.dailyRoot ?? "Daily")
      : "";
    this.dateFormat = this.source.kind === "daily-note"
      ? normalizeDateFormat(this.source.dateFormat)
      : "YYYY-MM-DD";
    this.planHeading = normalizeHeading(options.planHeading ?? "今日计划");
    this.todoHeading = normalizeHeading(options.todoHeading ?? "ToDo");
    this.summaryHeading = normalizeHeading(options.summaryHeading ?? "今日总结");
    this.tasksCompatibilityOutput = options.tasksCompatibilityOutput === true;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? createDailyId;
  }

  get planSource(): DailyPlanSource {
    return cloneSource(this.source, this.root);
  }

  pathForDate(value: Date | string = this.now()): string {
    const date = normalizeDate(value);
    if (this.source.kind === "fixed-document") return normalizeVaultPath(this.source.path);
    return `${this.root}/${formatDailyNoteName(date, this.dateFormat)}.md`;
  }

  async read(value: Date | string = this.now()): Promise<DailyPlanDocument> {
    const date = normalizeDate(value);
    const path = this.pathForDate(date);
    const markdown = await this.storage.readText(path) ?? "";
    const document = parseDailyPlanDocumentWithDiagnostics(
      markdown,
      path,
      date,
      this.todoHeading,
      {
        source: this.planSource,
        planHeading: this.planHeading,
        summaryHeading: this.summaryHeading
      }
    );
    const hierarchy = parseDailyPlanHierarchy(markdown, path, date, {
      source: this.planSource,
      todoHeading: this.todoHeading,
      planHeading: this.planHeading
    });
    return mergeHierarchyIntoPlanDocument(document, hierarchy, markdown);
  }

  async readHierarchy(value: Date | string = this.now()): Promise<DailyPlanHierarchy> {
    const date = normalizeDate(value);
    const path = this.pathForDate(date);
    return parseDailyPlanHierarchy(await this.storage.readText(path) ?? "", path, date, {
      source: this.planSource,
      todoHeading: this.todoHeading,
      planHeading: this.planHeading
    });
  }

  async list(value: Date | string = this.now()): Promise<DailyPlanItem[]> {
    return (await this.read(value)).items;
  }

  async get(id: string, value: Date | string = this.now()): Promise<DailyPlanItem | undefined> {
    return (await this.list(value)).find((item) => item.id === id);
  }

  async create(input: DailyPlanCreateInput, now = this.now()): Promise<DailyPlanItem> {
    const date = normalizeDate(input.date ?? now);
    const path = this.pathForDate(date);
    const id = normalizeBlockId(input.id) || normalizeBlockId(this.createId());
    if (!id) throw new Error("Daily plan item id is invalid.");

    const desired = createItemShape({
      id,
      date,
      sourcePath: path,
      input
    });

    return this.withPathLock(path, async () => {
      const current = await this.storage.readText(path) ?? "";
      const document = this.parse(current, path, date);
      assertWritable(document);
      const existing = document.items.find((item) => item.id === id);
      if (existing) {
        if (sameCreateRequest(existing, desired)) return existing;
        throw new DailyPlanConflictError("id-reused", `Daily plan item id is already used: ${id}`);
      }

      const changedItems = new Map<string, DailyPlanItem>();
      if (desired.primary) {
        for (const item of document.items.filter((entry) => entry.primary)) {
          changedItems.set(item.id, { ...(changedItems.get(item.id) ?? item), primary: false });
        }
      }
      if (desired.minimum) {
        for (const item of document.items.filter((entry) => entry.minimum)) {
          changedItems.set(item.id, { ...(changedItems.get(item.id) ?? item), minimum: false });
        }
      }
      const replacements = new Map<number, string>();
      for (const item of document.items) {
        const changed = changedItems.get(item.id);
        if (changed) replacements.set(item.line, formatTaskBlock(changed, item.rawBlock, {
          tasksCompatibilityOutput: this.tasksCompatibilityOutput
        }));
      }
      let next = replaceTaskBlocks(current, document.items, replacements);
      next = appendToTodoSection(next, date, this.resolveSource(date), {
        planHeading: this.planHeading,
        todoHeading: this.todoHeading
      }, formatTaskBlock(desired, undefined, {
        tasksCompatibilityOutput: this.tasksCompatibilityOutput
      }));
      await this.storage.writeText(path, next);
      await this.notify(path);
      const created = this.parse(next, path, date).items.find((item) => item.id === id);
      if (!created) throw new Error("Daily plan item could not be verified after writing.");
      return created;
    });
  }

  update(
    id: string,
    expectedRevision: string | DailyTaskRevision,
    patch: DailyPlanUpdate,
    value: Date | string = this.now()
  ): Promise<DailyPlanItem> {
    return this.mutateItems(id, expectedRevision, value, (target, items) => {
      const updated = applyUpdate(target, patch);
      const replacements = new Map<string, DailyPlanItem>([[target.id, updated]]);
      if (updated.primary && patch.primary === true) {
        for (const item of items) {
          if (item.id !== target.id && item.primary) {
            replacements.set(item.id, { ...(replacements.get(item.id) ?? item), primary: false });
          }
        }
      }
      if (updated.minimum && patch.minimum === true) {
        for (const item of items) {
          if (item.id !== target.id && item.minimum) {
            replacements.set(item.id, { ...(replacements.get(item.id) ?? item), minimum: false });
          }
        }
      }
      if (updated.status === "in-progress" && patch.status === "in-progress") {
        for (const item of items) {
          if (item.id !== target.id && item.status === "in-progress") {
            replacements.set(item.id, {
              ...(replacements.get(item.id) ?? item),
              status: "todo",
              done: false
            });
          }
        }
      }
      return replacements;
    });
  }

  start(
    id: string,
    expectedRevision: string | DailyTaskRevision,
    value: Date | string = this.now()
  ): Promise<DailyPlanItem> {
    return this.mutateItems(id, expectedRevision, value, (target, items) => {
      if (target.status === "done") {
        throw new DailyPlanConflictError("invalid-state", "A completed daily task cannot be started.");
      }
      const onlyCurrent = target.status === "in-progress"
        && items.every((item) => item.id === target.id || item.status !== "in-progress");
      if (onlyCurrent) return new Map<string, DailyPlanItem>();
      const replacements = new Map<string, DailyPlanItem>();
      for (const item of items) {
        if (item.id === target.id) {
          replacements.set(item.id, {
            ...item,
            status: "in-progress",
            done: false,
            completionDate: undefined
          });
        } else if (item.status === "in-progress") {
          replacements.set(item.id, { ...item, status: "todo", done: false });
        }
      }
      return replacements;
    });
  }

  complete(
    id: string,
    expectedRevision: string | DailyTaskRevision,
    value: Date | string = this.now()
  ): Promise<DailyPlanItem> {
    return this.mutateItems(id, expectedRevision, value, (target) => {
      if (target.status === "done") return new Map<string, DailyPlanItem>();
      return new Map([[
        target.id,
        {
          ...target,
          status: "done",
          done: true
        }
      ]]);
    });
  }

  reopen(
    id: string,
    expectedRevision: string | DailyTaskRevision,
    value: Date | string = this.now()
  ): Promise<DailyPlanItem> {
    return this.mutateItems(id, expectedRevision, value, (target) => {
      if (target.status === "todo" && !target.completionDate) return new Map<string, DailyPlanItem>();
      return new Map([[
        target.id,
        {
          ...target,
          status: "todo",
          done: false,
          completionDate: undefined
        }
      ]]);
    });
  }

  async move(
    id: string,
    expectedRevision: string | DailyTaskRevision,
    direction: "up" | "down",
    value: Date | string = this.now()
  ): Promise<DailyPlanItem> {
    const date = normalizeDate(value);
    const path = this.pathForDate(date);
    return this.withPathLock(path, async () => {
      const current = await this.storage.readText(path);
      if (current === undefined) {
        throw new DailyPlanConflictError("not-found", `Daily plan file does not exist: ${path}`);
      }
      const document = this.parse(current, path, date);
      assertWritable(document);
      const index = document.items.findIndex((item) => item.id === id);
      if (index < 0) throw new DailyPlanConflictError("not-found", `Daily plan item does not exist: ${id}`);
      assertRevision(document.items[index], expectedRevision);
      const item = document.items[index];
      const nodes = parseMovableListNodes(current);
      const node = nodes.find((entry) => entry.line === item.line);
      if (!node) {
        throw new DailyPlanConflictError(
          "invalid-document",
          `Daily plan item is not backed by a movable list node: ${id}`
        );
      }
      const siblings = nodes.filter((entry) =>
        entry.parentLine === node.parentLine && entry.indent === node.indent
      );
      const siblingIndex = siblings.findIndex((entry) => entry.line === node.line);
      const adjacentNode = siblings[siblingIndex + (direction === "up" ? -1 : 1)];
      if (!adjacentNode) return item;

      const adjacentItem = document.items.find((entry) => entry.line === adjacentNode.line);
      if (
        !adjacentItem
        || nearestGroupId(adjacentItem) !== nearestGroupId(item)
      ) {
        return item;
      }

      const next = swapAdjacentListSubtrees(current, node, adjacentNode);
      await this.storage.writeText(path, next);
      await this.notify(path);
      const moved = this.parse(next, path, date).items.find((item) => item.id === id);
      if (!moved) throw new Error("Daily plan item could not be verified after moving.");
      return moved;
    });
  }

  /**
   * Removes the complete structural list subtree guarded by the task's
   * current logical-block revision. Removing a parent task therefore removes
   * its nested task/document children as one explicit operation; siblings,
   * headings, and unrelated user text remain untouched.
   */
  async remove(
    id: string,
    expectedRevision: string | DailyTaskRevision,
    value: Date | string = this.now()
  ): Promise<DailyPlanItem> {
    const date = normalizeDate(value);
    const path = this.pathForDate(date);
    return this.withPathLock(path, async () => {
      const current = await this.storage.readText(path);
      if (current === undefined) {
        throw new DailyPlanConflictError("not-found", `Daily plan file does not exist: ${path}`);
      }
      const document = this.parse(current, path, date);
      assertWritable(document);
      const target = document.items.find((item) => item.id === id);
      if (!target) throw new DailyPlanConflictError("not-found", `Daily plan item does not exist: ${id}`);
      assertRevision(target, expectedRevision);

      const node = parseMovableListNodes(current).find((entry) => entry.line === target.line);
      if (!node) {
        throw new DailyPlanConflictError(
          "invalid-document",
          `Daily plan item is not backed by a removable list node: ${id}`
        );
      }
      const eol = current.includes("\r\n") ? "\r\n" : "\n";
      const lines = current.split(/\r?\n/u);
      lines.splice(node.start, Math.max(1, node.end - node.start));
      const next = lines.join(eol);
      await this.storage.writeText(path, next);
      await this.notify(path);
      if (this.parse(next, path, date).items.some((item) => item.id === id)) {
        throw new Error("Daily plan item could not be verified after removal.");
      }
      return target;
    });
  }

  /**
   * Replaces one leaf commitment with an audit-only comment after its
   * destination has been created. The marker is deliberately not parsed as a
   * task, so progress counts cannot include both the old and new copy.
   */
  async recordMigration(
    id: string,
    expectedRevision: string | DailyTaskRevision,
    destination: { date: string; taskId: string; migrationId: string; migratedAt?: string },
    value: Date | string = this.now()
  ): Promise<DailyTaskMigration> {
    const fromDate = normalizeDate(value);
    const toDate = normalizeDate(destination.date);
    const path = this.pathForDate(fromDate);
    return this.withPathLock(path, async () => {
      const current = await this.storage.readText(path);
      if (current === undefined) {
        throw new DailyPlanConflictError("not-found", `Daily plan file does not exist: ${path}`);
      }
      const document = this.parse(current, path, fromDate);
      assertWritable(document);
      const target = document.items.find((item) => item.id === id);
      if (!target) throw new DailyPlanConflictError("not-found", `Daily plan item does not exist: ${id}`);
      assertRevision(target, expectedRevision);
      const node = parseMovableListNodes(current).find((entry) => entry.line === target.line);
      if (!node) {
        throw new DailyPlanConflictError("invalid-document", `Daily plan item is not backed by a migratable list node: ${id}`);
      }
      if (document.items.some((item) => item.parentTaskId === id)) {
        throw new DailyPlanConflictError("invalid-state", "A Daily task with child tasks cannot be migrated as one leaf.");
      }
      const migratedAt = normalizeAbsoluteIso(destination.migratedAt ?? this.now().toISOString());
      const indent = /^\s*/u.exec(target.rawLine)?.[0] ?? "";
      const marker = `${indent}%% ${DAILY_MIGRATION_MARKER} from=${safeMarkerValue(id)} to=${safeMarkerValue(destination.taskId)} date=${toDate} migration=${safeMarkerValue(destination.migrationId)} at=${migratedAt} %%`;
      const eol = current.includes("\r\n") ? "\r\n" : "\n";
      const lines = current.split(/\r?\n/u);
      lines.splice(node.start, Math.max(1, node.end - node.start), marker);
      const next = lines.join(eol);
      await this.storage.writeText(path, next);
      await this.notify(path);
      if (this.parse(next, path, fromDate).items.some((item) => item.id === id)) {
        throw new Error("Migrated Daily task still participates in the source plan.");
      }
      return {
        schemaVersion: 1,
        migrationId: destination.migrationId,
        taskId: id,
        fromDate,
        toDate,
        fromSourcePath: path,
        toSourcePath: this.pathForDate(toDate),
        migratedAt,
        destinationTaskId: destination.taskId
      };
    });
  }

  async updateMetadata(
    patch: DailyPlanMetadataUpdate,
    expectedRevision?: string,
    value: Date | string = this.now()
  ): Promise<DailyPlanDocument> {
    const date = normalizeDate(value);
    const path = this.pathForDate(date);
    return this.withPathLock(path, async () => {
      const current = await this.storage.readText(path) ?? "";
      const document = this.parse(current, path, date);
      assertWritable(document);
      if (expectedRevision && expectedRevision !== document.revision) {
        throw new DailyPlanConflictError("revision-changed", "The daily plan changed after it was loaded.");
      }
      let next = current;
      const replacements = new Map<number, string>();
      for (const [key, requestedId] of [
        ["primary", patch.primaryId],
        ["minimum", patch.minimumId]
      ] as const) {
        if (requestedId === undefined) continue;
        if (requestedId !== null && !document.items.some((item) => item.id === requestedId)) {
          throw new DailyPlanConflictError(
            "not-found",
            `Daily plan ${key} task does not exist in ${date}: ${requestedId}`
          );
        }
        for (const item of document.items) {
          const updated = {
            ...item,
            [key]: requestedId !== null && item.id === requestedId
          };
          if (Boolean(updated[key]) !== Boolean(item[key])) {
            replacements.set(item.line, formatTaskBlock(updated, item.rawBlock, {
              tasksCompatibilityOutput: this.tasksCompatibilityOutput
            }));
          }
        }
      }
      if (replacements.size > 0) {
        next = replaceTaskBlocks(next, document.items, replacements);
      }
      if (patch.theme !== undefined) {
        next = updateTheme(
          next,
          date,
          this.resolveSource(date),
          this.planHeading,
          this.todoHeading,
          normalizeOptionalText(patch.theme, 500)
        );
      }
      if (next !== current) {
        await this.storage.writeText(path, next);
        await this.notify(path);
      }
      return this.parse(next, path, date);
    });
  }

  async writeSummary(
    summary: Pick<DailySummary, "date" | "markdown">,
    value: Date | string = summary.date
  ): Promise<{ path: string; changed: boolean }> {
    const date = normalizeDate(value);
    const path = this.pathForDate(date);
    return this.withPathLock(path, async () => {
      const current = await this.storage.readText(path) ?? "";
      const body = stripSummaryWrapper(summary.markdown);
      const next = replaceManagedSummary(
        current,
        date,
        this.resolveSource(date),
        this.summaryHeading,
        body,
        this.planHeading,
        this.todoHeading
      );
      if (next === current) return { path, changed: false };
      await this.storage.writeText(path, next);
      await this.notify(path);
      return { path, changed: true };
    });
  }

  private async mutateItems(
    id: string,
    expectedRevision: string | DailyTaskRevision,
    value: Date | string,
    buildReplacements: (
      target: DailyPlanItem,
      items: DailyPlanItem[]
    ) => Map<string, DailyPlanItem>
  ): Promise<DailyPlanItem> {
    const date = normalizeDate(value);
    const path = this.pathForDate(date);
    return this.withPathLock(path, async () => {
      const current = await this.storage.readText(path);
      if (current === undefined) {
        throw new DailyPlanConflictError("not-found", `Daily plan file does not exist: ${path}`);
      }
      const document = this.parse(current, path, date);
      assertWritable(document);
      const target = document.items.find((item) => item.id === id);
      if (!target) throw new DailyPlanConflictError("not-found", `Daily plan item does not exist: ${id}`);
      assertRevision(target, expectedRevision);
      const byId = buildReplacements(target, document.items);
      if (byId.size === 0) return target;

      const replacements = new Map<number, string>();
      for (const item of document.items) {
        const replacement = byId.get(item.id);
        if (replacement) replacements.set(item.line, formatTaskBlock(replacement, item.rawBlock, {
          tasksCompatibilityOutput: this.tasksCompatibilityOutput
        }));
      }
      const next = replaceTaskBlocks(current, document.items, replacements);
      await this.storage.writeText(path, next);
      await this.notify(path);
      const updated = this.parse(next, path, date).items.find((item) => item.id === id);
      if (!updated) throw new Error("Daily plan item could not be verified after writing.");
      return updated;
    });
  }

  private parse(markdown: string, path: string, date: string): DailyPlanDocument {
    const document = parseDailyPlanDocumentWithDiagnostics(markdown, path, date, this.todoHeading, {
      source: this.planSource,
      planHeading: this.planHeading,
      summaryHeading: this.summaryHeading
    });
    const hierarchy = parseDailyPlanHierarchy(markdown, path, date, {
      source: this.planSource,
      todoHeading: this.todoHeading,
      planHeading: this.planHeading
    });
    return mergeHierarchyIntoPlanDocument(document, hierarchy, markdown);
  }

  private resolveSource(date: string): ResolvedSource {
    return resolveSource(this.planSource, this.pathForDate(date));
  }

  private async withPathLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
    const prior = this.locks.get(path) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const next = new Promise<void>((resolve) => { release = resolve; });
    const chain = prior.then(() => next);
    this.locks.set(path, chain);
    await prior;
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(path) === chain) this.locks.delete(path);
    }
  }

  private async notify(path: string): Promise<void> {
    await this.options.onChanged?.(path);
  }
}

/**
 * V1-compatible parser. Use parseDailyPlanDocumentWithDiagnostics when edits
 * must be blocked on malformed IDs.
 */
export function parseDailyPlanDocument(
  markdown: string,
  sourcePath: string,
  date: string,
  todoHeading = "ToDo"
): DailyPlanItem[] {
  return parseDailyPlanDocumentWithDiagnostics(markdown, sourcePath, date, todoHeading).items;
}

export function parseDailyPlanDocumentWithDiagnostics(
  markdown: string,
  sourcePath: string,
  date: string,
  todoHeading = "ToDo",
  options: DailyPlanParseOptions = {}
): DailyPlanDocument {
  const normalizedDate = normalizeDate(date);
  const source = normalizeSource(options.source, undefined);
  const resolved = resolveSource(source, sourcePath);
  const lines = markdown.split(/\r?\n/u);
  const scope = findDateScope(lines, normalizedDate, resolved.nestedDate);
  const planHeading = normalizeHeading(options.planHeading ?? "今日计划");
  const canonicalTodo = scope
    ? findNamedSection(lines, todoHeading, resolved.planLevel, scope)
    : undefined;
  const fallbackPlan = scope
    ? findNamedSection(lines, planHeading, resolved.planLevel, scope)
    : undefined;
  const todo = canonicalTodo && sectionContainsTask(lines, canonicalTodo)
    ? canonicalTodo
    : fallbackPlan && sectionContainsListItem(lines, fallbackPlan)
      ? fallbackPlan
      : scope
        ? wholeDateSection(scope, resolved.planLevel)
        : canonicalTodo;
  const entries: ParsedTaskEntry[] = [];

  if (todo) {
    for (let index = todo.start; index < todo.end; index += 1) {
      const match = TASK_RE.exec(lines[index]);
      if (!match?.groups) continue;
      const entry = parseTaskEntry(lines, index, todo.end, match.groups.indent.length, sourcePath, normalizedDate);
      entries.push(entry);
      index = Math.max(index, entry.endLine - 1);
    }
  }

  const diagnostics = entries.flatMap((entry) => entry.diagnostic ? [entry.diagnostic] : []);
  const items = entries.flatMap((entry) => entry.item ? [entry.item] : []);
  const hierarchyTasks = parseDailyPlanHierarchy(markdown, sourcePath, normalizedDate, {
    source,
    todoHeading,
    planHeading: options.planHeading
  }).tasks;
  for (const item of items) {
    const task = hierarchyTasks.find((entry) => entry.blockId === item.id);
    if (!task) continue;
    item.revision = {
      ...item.revision,
      value: dailyTaskRevisionValue(sourcePath, normalizedDate, item.id, task.rawBlock)
    };
  }
  const duplicateScopeItems = resolved.nestedDate
    ? parseAllFixedDocumentItems(lines, todoHeading, sourcePath)
    : items;
  const occurrences = new Map<string, DailyPlanItem[]>();
  for (const item of duplicateScopeItems) {
    const group = occurrences.get(item.id) ?? [];
    group.push(item);
    occurrences.set(item.id, group);
  }
  for (const [blockId, group] of occurrences) {
    if (group.length < 2) continue;
    for (const item of group) {
      diagnostics.push(diagnostic(
        "duplicate-block-id",
        sourcePath,
        item.line,
        `Daily plan block id is used more than once: ${blockId}`,
        blockId
      ));
    }
  }

  const primary = items.filter((item) => item.primary);
  if (primary.length > 1) {
    for (const item of primary) {
      diagnostics.push(diagnostic(
        "duplicate-primary",
        sourcePath,
        item.line,
        "Only one daily task may be marked as primary.",
        item.id
      ));
    }
  }
  const minimum = items.filter((item) => item.minimum);
  if (minimum.length > 1) {
    for (const item of minimum) {
      diagnostics.push(diagnostic(
        "duplicate-minimum",
        sourcePath,
        item.line,
        "Only one daily task may be marked as the minimum commitment.",
        item.id
      ));
    }
  }

  const metadataSection = scope
    ? findNamedSection(lines, planHeading, resolved.planLevel, scope)
    : undefined;
  const theme = metadataSection
    ? normalizeOptionalText(parseTheme(lines.slice(metadataSection.start, metadataSection.end).join("\n")), 500)
    : undefined;
  const scopedRaw = scope ? lines.slice(scope.heading ?? scope.start, scope.end).join("\n") : "";
  return {
    schemaVersion: DAILY_PLAN_SCHEMA_VERSION,
    date: normalizedDate,
    source: cloneSource(source, source.kind === "daily-note" ? normalizeRoot(source.dailyRoot ?? "Daily") : ""),
    sourcePath,
    metadata: {
      theme,
      primaryId: primary.length === 1 ? primary[0].id : undefined,
      minimumId: minimum.length === 1 ? minimum[0].id : undefined
    },
    items,
    diagnostics,
    revision: `dpr_${contentHash128(`${sourcePath}\n${normalizedDate}\n${scopedRaw}`)}`
  };
}

function sectionContainsTask(
  lines: readonly string[],
  section: { start: number; end: number }
): boolean {
  for (let index = section.start; index < section.end; index += 1) {
    if (TASK_RE.test(lines[index])) return true;
  }
  return false;
}

function sectionContainsListItem(
  lines: readonly string[],
  section: { start: number; end: number }
): boolean {
  for (let index = section.start; index < section.end; index += 1) {
    if (LIST_NODE_RE.test(lines[index])) return true;
  }
  return false;
}

function wholeDateSection(scope: DateScope, level: number): SectionRange {
  return {
    heading: scope.heading ?? Math.max(0, scope.start - 1),
    start: scope.start,
    end: scope.end,
    level
  };
}

/**
 * Predicts the exact revision produced by a status-only managed update. It
 * uses the same formatter as the write path, so crash recovery verifies the
 * complete logical task block rather than its checkbox alone.
 */
export function predictDailyPlanItemStatusRevision(
  item: DailyPlanItem,
  status: DailyPlanItem["status"],
  options: DailyPlanFormatOptions = {}
): DailyTaskRevision {
  const updated = status === "done"
    ? { ...item, status, done: true }
    : applyUpdate(item, { status });
  const rawBlock = formatTaskBlock(updated, item.rawBlock, options);
  return {
    ...item.revision,
    value: dailyTaskRevisionValue(item.sourcePath, item.date, item.id, rawBlock)
  };
}

function mergeHierarchyIntoPlanDocument(
  document: DailyPlanDocument,
  hierarchy: DailyPlanHierarchy,
  _markdown: string
): DailyPlanDocument {
  const merged: DailyPlanItem[] = [];
  for (const task of hierarchy.tasks) {
    if (!task.blockId || task.normalizationRequired) continue;
    const taskLines = task.rawBlock.split(/\r?\n/u);
    const anyTask = ANY_TASK_RE.exec(taskLines[0] ?? "");
    if (!anyTask?.groups) continue;
    taskLines[0] = `${anyTask.groups.indent}-${anyTask.groups.spacing}${anyTask.groups.checkbox}`;
    const match = TASK_RE.exec(taskLines[0]);
    if (!match?.groups) continue;
    const parsed = parseTaskEntry(
      taskLines,
      0,
      taskLines.length,
      match.groups.indent.length,
      document.sourcePath,
      document.date
    );
    let item = parsed.item;
    if (item) {
      item = {
        ...item,
        revision: {
          ...item.revision,
          value: dailyTaskRevisionValue(
            document.sourcePath,
            document.date,
            task.blockId,
            task.rawBlock
          )
        }
      };
    }
    if (!item) continue;
    merged.push({
      ...item,
      line: task.line,
      endLine: task.endLine,
      depth: task.depth,
      parentTaskId: task.parentTaskId,
      category: item.category ?? task.category,
      taskRef: item.taskRef ?? task.taskRef,
      rawLine: task.rawLine,
      rawBlock: task.rawBlock,
      detachedOwnedLines: task.detachedOwnedLines,
      groupId: task.lineage.groups[task.lineage.groups.length - 1]?.id,
      lineage: task.lineage,
      lineageRevision: task.lineageRevision,
      targetResolution: task.targetResolution
    });
  }
  // Preserve V1 compatibility for a malformed item that the hierarchy parser
  // intentionally excludes, so existing diagnostics and repair UI still see it.
  for (const item of document.items) {
    if (!merged.some((entry) => entry.id === item.id)) merged.push(item);
  }
  merged.sort((left, right) => left.line - right.line);
  return { ...document, items: merged };
}

function parseTaskEntry(
  lines: string[],
  index: number,
  sectionEnd: number,
  parentIndentLength: number,
  sourcePath: string,
  date: string
): ParsedTaskEntry {
  const rawLine = lines[index];
  const match = TASK_RE.exec(rawLine)!;
  const body = match.groups!.body.trim();
  const continuation: string[] = [];
  let endIndex = index;
  for (let cursor = index + 1; cursor < sectionEnd; cursor += 1) {
    const line = lines[cursor];
    if (!line.trim()) {
      const next = nextNonBlank(lines, cursor + 1, sectionEnd);
      if (next === undefined || indentation(lines[next]) <= parentIndentLength) break;
      continuation.push(line);
      endIndex = cursor;
      continue;
    }
    const indent = indentation(line);
    const nextTask = TASK_RE.exec(line);
    if (indent <= parentIndentLength || (nextTask?.groups && nextTask.groups.indent.length <= parentIndentLength)) break;
    continuation.push(line);
    endIndex = cursor;
  }
  while (continuation.length && !continuation[continuation.length - 1].trim()) {
    continuation.pop();
    endIndex -= 1;
  }

  const blockIds: string[] = [];
  const inline = INLINE_BLOCK_RE.exec(body)?.groups?.id;
  if (inline && normalizeBlockId(inline)) blockIds.push(inline);
  const directIndent = continuation
    .filter((line) => line.trim())
    .reduce((lowest, line) => Math.min(lowest, indentation(line)), Number.POSITIVE_INFINITY);
  for (const line of continuation) {
    const standalone = STANDALONE_BLOCK_RE.exec(line);
    if (standalone?.groups?.id
      && normalizeBlockId(standalone.groups.id)
      && indentation(line) === directIndent) {
      blockIds.push(standalone.groups.id);
    }
  }
  const lineNumber = index + 1;
  if (blockIds.length === 0) {
    return {
      line: lineNumber,
      endLine: endIndex + 1,
      blockIds,
      diagnostic: diagnostic(
        "missing-block-id",
        sourcePath,
        lineNumber,
        "Daily plan tasks require a stable ^daily_* block id."
      )
    };
  }
  if (blockIds.length > 1) {
    return {
      line: lineNumber,
      endLine: endIndex + 1,
      blockIds,
      diagnostic: diagnostic(
        "multiple-block-ids",
        sourcePath,
        lineNumber,
        "A daily plan task contains more than one block id.",
        blockIds[0]
      )
    };
  }

  const blockId = blockIds[0];
  const rawBlock = [rawLine, ...continuation].join("\n");
  const fields = parseFields(rawBlock);
  const status = normalizeStatus(match.groups!.mark);
  const logicalSource = rawBlock.replace(/\r?\n/gu, " ");
  const legacyScheduledDate = DATE_RE.scheduled.exec(logicalSource)?.[1];
  const legacyDueDate = DATE_RE.due.exec(logicalSource)?.[1];
  const metadataScheduledDate = normalizeOptionalDate(fields.scheduled);
  const metadataDueDate = normalizeOptionalDate(fields.due);
  const target = normalizeOptionalTarget(fields.target);
  // A Daily checkbox often acts as a project/category row whose indented
  // children contain the actual note links. Keep those links in the cached
  // item so the Work Pool allowlist can follow the whole authored task block.
  const linkedSource = `${cleanTaskText(body)} ${continuation.join(" ")} ${target ?? ""}`;
  const revision: DailyTaskRevision = {
    value: dailyTaskRevisionValue(sourcePath, date, blockId, rawBlock),
    sourcePath,
    blockId,
    date
  };
  return {
    line: lineNumber,
    endLine: endIndex + 1,
    blockIds,
    item: {
      schemaVersion: DAILY_SCHEMA_VERSION,
      id: blockId,
      blockId,
      date,
      text: cleanTaskText(body),
      kind: normalizeKind(fields.kind),
      status,
      done: status === "done",
      sourcePath,
      line: lineNumber,
      endLine: endIndex + 1,
      rawLine,
      rawBlock,
      revision,
      category: normalizeOptionalText(fields.category, 120),
      taskRef: normalizeTaskRef(fields["task-ref"]),
      taskPoolRevision: normalizePoolRevision(fields["pool-revision"]),
      workKind: normalizeWorkKind(fields["work-kind"]),
      workRef: normalizeWorkRef(fields["work-ref"]),
      workRevision: normalizeWorkRevision(fields["work-revision"]),
      scheduledDate: metadataScheduledDate ?? legacyScheduledDate ?? date,
      scheduledDateExplicit: Boolean(metadataScheduledDate || legacyScheduledDate),
      dueDate: metadataDueDate ?? legacyDueDate ?? date,
      dueDateExplicit: Boolean(metadataDueDate || legacyDueDate),
      completionDate: DATE_RE.completion.exec(logicalSource)?.[1],
      scheduledFor: normalizeScheduledFor(fields.at),
      devicePolicy: normalizePolicy(fields.device),
      priority: parsePriority(logicalSource),
      priorityExplicit: Boolean([...logicalSource.matchAll(PRIORITY_RE)][0]),
      tags: unique([...logicalSource.matchAll(TAG_RE)].map((tag) => tag[1])),
      linkedNotes: unique([...linkedSource.matchAll(LINK_RE)].map((link) => link[1].trim()).filter(Boolean)),
      primary: parseBoolean(fields.primary),
      minimum: parseBoolean(fields.minimum),
      goal: normalizeOptionalText(fields.goal, 1_000),
      nextStep: normalizeOptionalText(fields.next, 1_000),
      estimateMinutes: parseEstimateMinutes(fields.estimate),
      target,
      startedAt: normalizeScheduledFor(fields.started)
    }
  };
}

function createItemShape(args: {
  id: string;
  date: string;
  sourcePath: string;
  input: DailyPlanCreateInput;
}): DailyPlanItem {
  const dueDate = normalizeOptionalDate(args.input.dueDate) ?? args.date;
  const scheduledDate = normalizeOptionalDate(args.input.scheduledDate) ?? args.date;
  const text = normalizeTaskText(args.input.text);
  const target = normalizeOptionalTarget(args.input.target);
  return {
    schemaVersion: DAILY_SCHEMA_VERSION,
    id: args.id,
    blockId: args.id,
    date: args.date,
    text,
    kind: normalizeKind(args.input.kind),
    status: "todo",
    done: false,
    sourcePath: args.sourcePath,
    line: 0,
    endLine: 0,
    rawLine: "",
    rawBlock: "",
    revision: { value: "", sourcePath: args.sourcePath, blockId: args.id, date: args.date },
    category: normalizeOptionalText(args.input.category, 120),
    taskRef: normalizeTaskRef(args.input.taskRef),
    taskPoolRevision: normalizePoolRevision(args.input.taskPoolRevision),
    workKind: normalizeWorkKind(args.input.workKind),
    workRef: normalizeWorkRef(args.input.workRef),
    workRevision: normalizeWorkRevision(args.input.workRevision),
    depth: 0,
    scheduledDate,
    scheduledDateExplicit: args.input.scheduledDate !== undefined,
    dueDate,
    dueDateExplicit: args.input.dueDate !== undefined,
    scheduledFor: normalizeScheduledFor(args.input.scheduledFor),
    devicePolicy: normalizePolicy(args.input.devicePolicy),
    priority: normalizePriority(args.input.priority),
    priorityExplicit: args.input.priority !== undefined,
    tags: normalizeTags(args.input.tags),
    linkedNotes: unique([...`${text} ${target ?? ""}`.matchAll(LINK_RE)].map((link) => link[1].trim())),
    primary: Boolean(args.input.primary),
    minimum: Boolean(args.input.minimum),
    goal: normalizeOptionalText(args.input.goal, 1_000),
    nextStep: normalizeOptionalText(args.input.nextStep, 1_000),
    estimateMinutes: normalizeEstimateMinutes(args.input.estimateMinutes),
    target
  };
}

function applyUpdate(item: DailyPlanItem, patch: DailyPlanUpdate): DailyPlanItem {
  const target = patch.target === undefined ? item.target : normalizeOptionalTarget(patch.target);
  const text = patch.text === undefined ? item.text : normalizeTaskText(patch.text);
  const status = patch.status ?? item.status;
  return {
    ...item,
    text,
    kind: patch.kind === undefined ? item.kind : normalizeKind(patch.kind),
    category: patch.category === undefined
      ? item.category
      : normalizeOptionalText(patch.category, 120),
    taskRef: patch.taskRef === undefined ? item.taskRef : normalizeTaskRef(patch.taskRef),
    taskPoolRevision: patch.taskPoolRevision === undefined
      ? item.taskPoolRevision
      : normalizePoolRevision(patch.taskPoolRevision),
    workKind: patch.workKind === undefined ? item.workKind : normalizeWorkKind(patch.workKind),
    workRef: patch.workRef === undefined ? item.workRef : normalizeWorkRef(patch.workRef),
    workRevision: patch.workRevision === undefined
      ? item.workRevision
      : normalizeWorkRevision(patch.workRevision),
    devicePolicy: patch.devicePolicy === undefined ? item.devicePolicy : normalizePolicy(patch.devicePolicy),
    priority: patch.priority === undefined ? item.priority : normalizePriority(patch.priority),
    priorityExplicit: patch.priority === undefined ? item.priorityExplicit : true,
    scheduledDate: patch.scheduledDate === undefined
      ? item.scheduledDate
      : normalizeOptionalDate(patch.scheduledDate) ?? item.date,
    scheduledDateExplicit: patch.scheduledDate === undefined
      ? item.scheduledDateExplicit
      : patch.scheduledDate !== null && normalizeOptionalDate(patch.scheduledDate) !== undefined,
    dueDate: patch.dueDate === undefined ? item.dueDate : normalizeOptionalDate(patch.dueDate) ?? item.date,
    dueDateExplicit: patch.dueDate === undefined
      ? item.dueDateExplicit
      : patch.dueDate !== null && normalizeOptionalDate(patch.dueDate) !== undefined,
    scheduledFor: patch.scheduledFor === undefined
      ? item.scheduledFor
      : normalizeScheduledFor(patch.scheduledFor),
    tags: patch.tags === undefined ? item.tags : normalizeTags(patch.tags),
    status,
    done: status === "done",
    completionDate: status === "done" ? item.completionDate : undefined,
    primary: patch.primary === undefined ? item.primary : Boolean(patch.primary),
    minimum: patch.minimum === undefined ? item.minimum : Boolean(patch.minimum),
    goal: patch.goal === undefined ? item.goal : normalizeOptionalText(patch.goal, 1_000),
    nextStep: patch.nextStep === undefined ? item.nextStep : normalizeOptionalText(patch.nextStep, 1_000),
    estimateMinutes: patch.estimateMinutes === undefined
      ? item.estimateMinutes
      : normalizeEstimateMinutes(patch.estimateMinutes),
    target,
    // Legacy compatibility is read-only. Runtime timing transitions belong to
    // the JSONL timer ledger and must never be authored through plan updates.
    startedAt: item.startedAt,
    linkedNotes: unique([...`${text} ${target ?? ""}`.matchAll(LINK_RE)].map((link) => link[1].trim()))
  };
}

function formatTaskBlock(
  item: DailyPlanItem,
  existingRawBlock?: string,
  options: DailyPlanFormatOptions = {}
): string {
  const indent = /^\s*/u.exec(item.rawLine)?.[0] ?? "";
  const childIndent = `${indent}  `;
  const mark = item.status === "done" ? "x" : item.status === "in-progress" ? "/" : " ";
  const priority = item.priority !== "normal" || item.priorityExplicit ? priorityEmoji(item.priority) : "";
  const completed = item.status === "done" && item.completionDate ? ` ✅ ${item.completionDate}` : "";
  const tags = item.tags.length ? ` ${item.tags.map((tag) => `#${tag}`).join(" ")}` : "";
  const checkbox = `${indent}- [${mark}] ${item.text}${priority ? ` ${priority}` : ""}`
    + (options.tasksCompatibilityOutput
      ? ` ⏳ ${item.scheduledDate || item.date} 📅 ${item.dueDate}`
      : "")
    + `${completed}${tags} ^${item.id}`;
  const controlLines = [
    `${childIndent}[towrite-kind:: ${item.kind}] [towrite-device:: ${item.devicePolicy}]`
      + (item.scheduledFor ? ` [towrite-at:: ${item.scheduledFor}]` : ""),
    ...optionalFieldLine(childIndent, "category", item.category),
    ...optionalFieldLine(childIndent, "task-ref", item.taskRef),
    ...optionalFieldLine(childIndent, "pool-revision", item.taskPoolRevision),
    ...optionalFieldLine(childIndent, "work-kind", item.workKind),
    ...optionalFieldLine(childIndent, "work-ref", item.workRef),
    ...optionalFieldLine(childIndent, "work-revision", item.workRevision),
    ...optionalFieldLine(
      childIndent,
      "scheduled",
      !options.tasksCompatibilityOutput && item.scheduledDateExplicit ? item.scheduledDate : undefined
    ),
    ...optionalFieldLine(
      childIndent,
      "due",
      !options.tasksCompatibilityOutput && item.dueDateExplicit ? item.dueDate : undefined
    ),
    ...optionalFieldLine(childIndent, "primary", item.primary ? "true" : undefined),
    ...optionalFieldLine(childIndent, "minimum", item.minimum ? "true" : undefined),
    ...optionalFieldLine(childIndent, "goal", item.goal),
    ...optionalFieldLine(childIndent, "next", item.nextStep),
    ...optionalFieldLine(childIndent, "estimate", item.estimateMinutes ? `${item.estimateMinutes}m` : undefined),
    ...optionalFieldLine(childIndent, "target", item.target),
    // `towrite-started` is a legacy, read-only field. Preserve it when it
    // already exists, but never synthesize runtime timing into plan Markdown.
    ...optionalFieldLine(
      childIndent,
      "started",
      hasOwnedField(existingRawBlock, "started") ? item.startedAt : undefined
    )
  ];
  const unknown = extractUnknownContinuation(existingRawBlock, item.id);
  return [checkbox, ...controlLines.map(commentOwnedFieldLine), ...unknown].join("\n");
}

function optionalFieldLine(indent: string, key: string, value: string | undefined): string[] {
  if (!value) return [];
  return [`${indent}[towrite-${key}:: ${safeFieldValue(value, key === "target")}]`];
}

function commentOwnedFieldLine(value: string): string {
  const indent = /^\s*/u.exec(value)?.[0] ?? "";
  return `${indent}%% ${value.slice(indent.length)} %%`;
}

function safeMarkerValue(value: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9_.:-]/gu, "_");
  if (!normalized) throw new DailyPlanConflictError("invalid-document", "Migration marker value is empty.");
  return normalized.slice(0, 180);
}

function normalizeAbsoluteIso(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new DailyPlanConflictError("invalid-document", "Migration time is invalid.");
  }
  return parsed.toISOString();
}

function hasOwnedField(rawBlock: string | undefined, key: string): boolean {
  if (!rawBlock) return false;
  return [...rawBlock.matchAll(OWNED_FIELD_RE)]
    .some((match) => match.groups?.key.toLowerCase() === key);
}

function extractUnknownContinuation(rawBlock: string | undefined, parentBlockId: string): string[] {
  if (!rawBlock) return [];
  const lines = rawBlock.split(/\r?\n/u).slice(1);
  const result: string[] = [];
  let pendingBlank = false;
  for (const line of lines) {
    const standalone = STANDALONE_BLOCK_RE.exec(line);
    if (standalone?.groups?.id === parentBlockId) {
      pendingBlank = false;
      continue;
    }
    const cleaned = line
      .replace(OWNED_FIELD_RE, "")
      .replace(/^\s*%%\s*%%\s*$/u, "")
      .replace(/\s+$/u, "");
    if (!cleaned.trim()) {
      if (!line.trim() && result.length) pendingBlank = true;
      continue;
    }
    if (pendingBlank) result.push("");
    pendingBlank = false;
    result.push(cleaned);
  }
  return result;
}

function replaceTaskBlocks(
  markdown: string,
  items: DailyPlanItem[],
  replacements: ReadonlyMap<number, string>
): string {
  if (!replacements.size) return markdown;
  const lines = markdown.split(/\r?\n/u);
  const affected = items
    .filter((item) => replacements.has(item.line))
    .sort((left, right) => right.line - left.line);
  const detachedLines = [...new Set(affected.flatMap((item) => item.detachedOwnedLines ?? []))]
    .sort((left, right) => right - left);
  const affectedByLine = new Map(affected.map((item) => [item.line, item]));
  const operationLines = [...new Set([...affectedByLine.keys(), ...detachedLines])]
    .sort((left, right) => right - left);
  for (const line of operationLines) {
    const item = affectedByLine.get(line);
    if (item) {
      lines.splice(
        item.line - 1,
        Math.max(1, (item.endLine ?? item.line) - item.line + 1),
        ...replacements.get(item.line)!.split("\n")
      );
    } else {
      lines.splice(line - 1, 1);
    }
  }
  return ensureTrailingNewline(lines.join("\n"));
}

interface MovableListNode {
  /** One-based source line, matching DailyPlanItem.line. */
  line: number;
  /** Zero-based inclusive source index. */
  start: number;
  /** Zero-based exclusive end of this list node, including its descendants. */
  end: number;
  indent: number;
  /** Source line of the structural list parent, not merely the nearest category. */
  parentLine?: number;
}

function parseMovableListNodes(markdown: string): MovableListNode[] {
  const lines = markdown.split(/\r?\n/u);
  const nodes: MovableListNode[] = [];
  const stack: MovableListNode[] = [];
  const closeThrough = (indent: number, end: number): void => {
    while (stack.length && stack[stack.length - 1].indent >= indent) {
      stack.pop()!.end = end;
    }
  };
  const closeAll = (end: number): void => {
    while (stack.length) stack.pop()!.end = end;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const list = LIST_NODE_RE.exec(lines[index]);
    if (list?.groups) {
      const indent = markdownIndentationWidth(list.groups.indent);
      closeThrough(indent, index);
      const node: MovableListNode = {
        line: index + 1,
        start: index,
        end: lines.length,
        indent,
        parentLine: stack[stack.length - 1]?.line
      };
      nodes.push(node);
      stack.push(node);
      continue;
    }

    if (!lines[index].trim()) continue;
    if (headingLevel(lines[index]) > 0) {
      closeAll(index);
      continue;
    }
    closeThrough(
      markdownIndentationWidth(/^[ \t]*/u.exec(lines[index])?.[0] ?? ""),
      index
    );
  }
  closeAll(lines.length);
  return nodes;
}

function swapAdjacentListSubtrees(
  markdown: string,
  left: MovableListNode,
  right: MovableListNode
): string {
  const lines = markdown.split(/\r?\n/u);
  const [first, second] = left.start < right.start ? [left, right] : [right, left];
  if (first.end !== second.start) {
    throw new DailyPlanConflictError(
      "invalid-document",
      "Daily plan sibling nodes are no longer adjacent."
    );
  }

  const firstContentEnd = trimTrailingBlankLines(lines, first.start, first.end);
  const secondContentEnd = trimTrailingBlankLines(lines, second.start, second.end);
  const firstBlock = lines.slice(first.start, firstContentEnd);
  const separator = lines.slice(firstContentEnd, second.start);
  const secondBlock = lines.slice(second.start, secondContentEnd);
  const trailing = lines.slice(secondContentEnd, second.end);
  lines.splice(
    first.start,
    second.end - first.start,
    ...secondBlock,
    ...separator,
    ...firstBlock,
    ...trailing
  );
  return ensureTrailingNewline(lines.join("\n"));
}

function trimTrailingBlankLines(lines: string[], start: number, end: number): number {
  let result = end;
  while (result > start + 1 && !lines[result - 1].trim()) result -= 1;
  return result;
}

function markdownIndentationWidth(value: string): number {
  let width = 0;
  for (const character of value) {
    width = character === "\t" ? width + (4 - (width % 4)) : width + 1;
  }
  return width;
}

function nearestGroupId(item: DailyPlanItem): string | undefined {
  return item.groupId ?? item.lineage?.groups[item.lineage.groups.length - 1]?.id;
}

function dailyTaskRevisionValue(
  sourcePath: string,
  date: string,
  blockId: string,
  rawBlock: string
): string {
  return `dtr_${contentHash128(`${sourcePath}\n${date}\n${blockId}\n${rawBlock}`)}`;
}

function appendToTodoSection(
  markdown: string,
  date: string,
  source: ResolvedSource,
  headings: { planHeading: string; todoHeading: string },
  block: string
): string {
  let current = ensurePlanScaffold(markdown, date, source, headings.planHeading, headings.todoHeading);
  const lines = current.replace(/\s+$/u, "").split(/\r?\n/u);
  const scope = findDateScope(lines, date, source.nestedDate)!;
  const section = findNamedSection(lines, headings.todoHeading, source.planLevel, scope)!;
  let insertion = section.end;
  while (insertion > section.start && !lines[insertion - 1].trim()) insertion -= 1;
  lines.splice(insertion, 0, ...(insertion > section.start ? [""] : []), ...block.split("\n"));
  return ensureTrailingNewline(lines.join("\n"));
}

function updateTheme(
  markdown: string,
  date: string,
  source: ResolvedSource,
  heading: string,
  todoHeading: string,
  theme: string | undefined
): string {
  let current = ensurePlanScaffold(markdown, date, source, heading, todoHeading);
  const lines = current.replace(/\s+$/u, "").split(/\r?\n/u);
  const scope = findDateScope(lines, date, source.nestedDate)!;
  const section = findNamedSection(lines, heading, source.planLevel, scope)!;
  let found = false;
  for (let index = section.start; index < section.end; index += 1) {
    if (![...lines[index].matchAll(THEME_FIELD_RE)].length) continue;
    const residual = lines[index].replace(THEME_FIELD_RE, "").trim();
    if (!found && theme) {
      lines[index] = `${residual ? `${residual} ` : ""}[towrite-theme:: ${safeFieldValue(theme, false)}]`;
      found = true;
    } else if (residual) {
      lines[index] = residual;
    } else {
      lines.splice(index, 1);
      index -= 1;
      section.end -= 1;
    }
  }
  if (!found && theme) lines.splice(section.start, 0, "", `[towrite-theme:: ${safeFieldValue(theme, false)}]`);
  return ensureTrailingNewline(lines.join("\n"));
}

function replaceManagedSummary(
  markdown: string,
  date: string,
  source: ResolvedSource,
  summaryHeading: string,
  body: string,
  planHeading: string,
  todoHeading: string
): string {
  let current = ensurePlanScaffold(markdown, date, source, planHeading, todoHeading);
  let lines = current.replace(/\s+$/u, "").split(/\r?\n/u);
  let scope = findDateScope(lines, date, source.nestedDate)!;
  let section = findNamedSection(lines, summaryHeading, source.planLevel, scope);
  const managed = [DAILY_SUMMARY_START_MARKER, body, DAILY_SUMMARY_END_MARKER];
  if (!section) {
    const heading = `${"#".repeat(source.planLevel)} ${summaryHeading}`;
    lines.splice(scope.end, 0, "", heading, "", ...managed);
    return ensureTrailingNewline(lines.join("\n"));
  }

  const startIndexes: number[] = [];
  const endIndexes: number[] = [];
  for (let index = section.start; index < section.end; index += 1) {
    if (lines[index].trim() === DAILY_SUMMARY_START_MARKER) startIndexes.push(index);
    if (lines[index].trim() === DAILY_SUMMARY_END_MARKER) endIndexes.push(index);
  }
  if (startIndexes.length !== endIndexes.length || startIndexes.length > 1
    || (startIndexes.length === 1 && startIndexes[0] >= endIndexes[0])) {
    throw new DailyPlanConflictError(
      "invalid-document",
      "Daily summary markers are malformed; repair them before writing a summary."
    );
  }
  if (startIndexes.length === 1) {
    lines.splice(startIndexes[0], endIndexes[0] - startIndexes[0] + 1, ...managed);
  } else {
    let insertion = section.end;
    while (insertion > section.start && !lines[insertion - 1].trim()) insertion -= 1;
    lines.splice(insertion, 0, ...(insertion > section.start ? [""] : []), ...managed);
  }
  return ensureTrailingNewline(lines.join("\n"));
}

function stripSummaryWrapper(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+[^\r\n]+\r?\n/u, "")
    .replaceAll(DAILY_SUMMARY_START_MARKER, "")
    .replaceAll(DAILY_SUMMARY_END_MARKER, "")
    .trim();
}

function ensurePlanScaffold(
  markdown: string,
  date: string,
  source: ResolvedSource,
  planHeading: string,
  todoHeading: string
): string {
  const trimmed = markdown.replace(/\s+$/u, "");
  if (!source.nestedDate) {
    let lines = (trimmed || `# ${date}`).split(/\r?\n/u);
    const scope: DateScope = { start: 0, end: lines.length };
    if (!findNamedSection(lines, planHeading, source.planLevel, scope)) {
      lines.push("", `${"#".repeat(source.planLevel)} ${planHeading}`);
    }
    const refreshed: DateScope = { start: 0, end: lines.length };
    if (!findNamedSection(lines, todoHeading, source.planLevel, refreshed)) {
      lines.push("", `${"#".repeat(source.planLevel)} ${todoHeading}`);
    }
    return ensureTrailingNewline(lines.join("\n"));
  }

  let lines = trimmed ? trimmed.split(/\r?\n/u) : [];
  let scope = findDateScope(lines, date, true);
  if (!scope) {
    if (lines.length) lines.push("");
    lines.push(`## ${date}`, "", `### ${planHeading}`, "", `### ${todoHeading}`);
    return ensureTrailingNewline(lines.join("\n"));
  }
  if (!findNamedSection(lines, planHeading, source.planLevel, scope)) {
    lines.splice(scope.end, 0, "", `### ${planHeading}`);
    scope = findDateScope(lines, date, true)!;
  }
  if (!findNamedSection(lines, todoHeading, source.planLevel, scope)) {
    lines.splice(scope.end, 0, "", `### ${todoHeading}`);
  }
  return ensureTrailingNewline(lines.join("\n"));
}

function findDateScope(lines: string[], date: string, nested: boolean): DateScope | undefined {
  if (!nested) return { start: 0, end: lines.length };
  const heading = lines.findIndex((line) => headingLevel(line) === 2 && headingText(line) === date);
  if (heading < 0) return undefined;
  let end = lines.length;
  for (let index = heading + 1; index < lines.length; index += 1) {
    const level = headingLevel(lines[index]);
    if (level > 0 && level <= 2) {
      end = index;
      break;
    }
  }
  return { heading, start: heading + 1, end };
}

function parseAllFixedDocumentItems(
  lines: string[],
  todoHeading: string,
  sourcePath: string
): DailyPlanItem[] {
  const items: DailyPlanItem[] = [];
  for (let heading = 0; heading < lines.length; heading += 1) {
    if (headingLevel(lines[heading]) !== 2) continue;
    const date = headingText(lines[heading]);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) continue;
    const scope = findDateScope(lines, date, true);
    const todo = scope ? findNamedSection(lines, todoHeading, 3, scope) : undefined;
    if (!todo) continue;
    for (let index = todo.start; index < todo.end; index += 1) {
      const match = TASK_RE.exec(lines[index]);
      if (!match?.groups) continue;
      const entry = parseTaskEntry(
        lines,
        index,
        todo.end,
        match.groups.indent.length,
        sourcePath,
        date
      );
      if (entry.item) items.push(entry.item);
      index = Math.max(index, entry.endLine - 1);
    }
    heading = Math.max(heading, scope?.end ? scope.end - 1 : heading);
  }
  return items;
}

function findNamedSection(
  lines: string[],
  heading: string,
  level: number,
  scope: DateScope
): SectionRange | undefined {
  const wanted = normalizeHeading(heading).toLowerCase();
  let headingIndex = -1;
  for (let index = scope.start; index < scope.end; index += 1) {
    if (headingLevel(lines[index]) === level && headingText(lines[index]).toLowerCase() === wanted) {
      headingIndex = index;
      break;
    }
  }
  if (headingIndex < 0) return undefined;
  let end = scope.end;
  for (let index = headingIndex + 1; index < scope.end; index += 1) {
    const nextLevel = headingLevel(lines[index]);
    if (nextLevel > 0 && nextLevel <= level) {
      end = index;
      break;
    }
  }
  return { heading: headingIndex, start: headingIndex + 1, end, level };
}

function headingLevel(line: string): number {
  return /^(#{1,6})\s+/u.exec(line)?.[1].length ?? 0;
}

function headingText(line: string): string {
  return line.replace(/^#{1,6}\s+/u, "").trim();
}

function nextNonBlank(lines: string[], from: number, end: number): number | undefined {
  for (let index = from; index < end; index += 1) {
    if (lines[index].trim()) return index;
  }
  return undefined;
}

function indentation(line: string): number {
  return /^\s*/u.exec(line)?.[0].length ?? 0;
}

function parseFields(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of body.matchAll(OWNED_FIELD_RE)) {
    if (match.groups) result[match.groups.key.toLowerCase()] = match.groups.value.trim();
  }
  return result;
}

function parseTheme(body: string): string | undefined {
  return [...body.matchAll(THEME_FIELD_RE)][0]?.groups?.value.trim();
}

function cleanTaskText(body: string): string {
  let text = body.replace(INLINE_BLOCK_RE, "");
  text = text.replace(OWNED_FIELD_RE, "");
  text = text.replace(DATE_RE.scheduled, "").replace(DATE_RE.due, "").replace(DATE_RE.completion, "");
  text = text.replace(PRIORITY_RE, " ");
  text = text.replace(TAG_RE, "");
  return text.replace(/\s{2,}/gu, " ").trim();
}

function parsePriority(value: string): DailyPlanPriority {
  const emoji = [...value.matchAll(PRIORITY_RE)][0]?.groups?.emoji;
  if (emoji === "🔺") return "highest";
  if (emoji === "⏫") return "high";
  if (emoji === "🔼") return "normal";
  if (emoji === "🔽") return "low";
  if (emoji === "⏬") return "lowest";
  return "normal";
}

function priorityEmoji(priority: DailyPlanPriority | undefined): string {
  if (priority === "highest") return "🔺";
  if (priority === "high") return "⏫";
  if (priority === "normal") return "🔼";
  if (priority === "low") return "🔽";
  if (priority === "lowest") return "⏬";
  return "";
}

function parseBoolean(value: unknown): boolean {
  return typeof value === "string" && /^(?:true|yes|1)$/iu.test(value.trim());
}

function parseEstimateMinutes(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d{1,4})(?:\s*(?:m|min|minutes?|分钟))?$/iu.exec(value.trim());
  return match ? normalizeEstimateMinutes(Number(match[1])) : undefined;
}

function normalizeEstimateMinutes(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 1_440 ? number : undefined;
}

function normalizeStatus(mark: string): DailyPlanStatus {
  if (mark.trim().toLowerCase() === "x") return "done";
  if (mark.trim() === "/" || mark.trim() === "-") return "in-progress";
  return "todo";
}

export function normalizeDailyDate(value: Date | string): string {
  return normalizeDate(value);
}

function normalizeDate(value: Date | string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    const parsed = new Date(`${value}T12:00:00`);
    if (Number.isFinite(parsed.getTime()) && localDate(parsed) === value) return value;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Daily plan date is invalid.");
  return localDate(date);
}

function localDate(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

function normalizeSource(source: DailyPlanSource | undefined, legacyRoot: string | undefined): DailyPlanSource {
  if (source?.kind === "fixed-document") {
    return { kind: "fixed-document", path: normalizeVaultPath(source.path) };
  }
  return {
    kind: "daily-note",
    dailyRoot: normalizeRoot(source?.kind === "daily-note" ? source.dailyRoot ?? legacyRoot ?? "Daily" : legacyRoot ?? "Daily"),
    dateFormat: normalizeDateFormat(source?.kind === "daily-note" ? source.dateFormat : undefined)
  };
}

function cloneSource(source: DailyPlanSource, root: string): DailyPlanSource {
  return source.kind === "fixed-document"
    ? { kind: "fixed-document", path: normalizeVaultPath(source.path) }
    : {
        kind: "daily-note",
        dailyRoot: normalizeRoot(root || source.dailyRoot || "Daily"),
        dateFormat: normalizeDateFormat(source.dateFormat)
      };
}

function resolveSource(source: DailyPlanSource, sourcePath: string): ResolvedSource {
  const normalized = source.kind === "fixed-document"
    ? { kind: "fixed-document" as const, path: normalizeVaultPath(source.path || sourcePath) }
    : {
        kind: "daily-note" as const,
        dailyRoot: normalizeRoot(source.dailyRoot ?? "Daily"),
        dateFormat: normalizeDateFormat(source.dateFormat)
      };
  return {
    source: normalized,
    path: sourcePath,
    nestedDate: normalized.kind === "fixed-document",
    planLevel: normalized.kind === "fixed-document" ? 3 : 2
  };
}

function normalizeRoot(value: string): string {
  const raw = String(value ?? "");
  if (unsafeVaultPath(raw)) {
    throw new Error("Daily note root is invalid.");
  }
  const normalized = raw.replace(/\\/gu, "/").replace(/\/+$/gu, "");
  if (!normalized || unsafeVaultSegments(normalized)) throw new Error("Daily note root is invalid.");
  return normalized;
}

export function normalizeDateFormat(value: string | undefined): string {
  const normalized = String(value ?? "YYYY-MM-DD")
    .trim()
    .replace(/\.md$/iu, "");
  if (!normalized || /[\\/:*?"<>|]/u.test(normalized)) return "YYYY-MM-DD";
  return normalized;
}

export function formatDailyNoteName(value: Date | string, format: string): string {
  const date = normalizeDate(value);
  const [year, month, day] = date.split("-");
  const replacements: Record<string, string> = {
    YYYY: year,
    YY: year.slice(-2),
    MM: month,
    M: String(Number(month)),
    DD: day,
    D: String(Number(day))
  };
  return normalizeDateFormat(format).replace(/YYYY|YY|MM|DD|M|D/gu, (token) => replacements[token] ?? token);
}

function normalizeVaultPath(value: string): string {
  const raw = String(value ?? "");
  if (unsafeVaultPath(raw)) {
    throw new Error("Daily fixed planning document path is invalid.");
  }
  const normalized = raw.replace(/\\/gu, "/").replace(/\/+$/gu, "");
  if (!normalized || !normalized.toLowerCase().endsWith(".md") || unsafeVaultSegments(normalized)) {
    throw new Error("Daily fixed planning document path is invalid.");
  }
  return normalized;
}

function unsafeVaultPath(value: string): boolean {
  return !value
    || /^[A-Za-z]:/u.test(value)
    || /^[\\/]/u.test(value)
    || /[\u0000-\u001f\u007f:]/u.test(value);
}

function unsafeVaultSegments(value: string): boolean {
  return value.split("/").some((part) => {
    const normalized = part.trim();
    const basename = normalized.split(".")[0].toUpperCase();
    return !normalized
      || normalized !== part
      || normalized === "."
      || normalized === ".."
      || /[. ]$/u.test(part)
      || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/u.test(basename);
  });
}

function normalizeHeading(value: string): string {
  const heading = value.replace(/^#+\s*/u, "").trim();
  if (!heading || /[\r\n]/u.test(heading)) throw new Error("Daily note heading is invalid.");
  return heading;
}

function normalizeTaskText(value: string): string {
  const text = String(value ?? "").replace(/[\r\n]+/gu, " ").replace(/\s+/gu, " ").trim();
  if (!text) throw new Error("Daily plan text is empty.");
  return text.slice(0, 2_000);
}

function normalizeBlockId(value: unknown): string | undefined {
  const id = String(value ?? "").trim().replace(/^\^/u, "");
  return /^(?:daily_)?[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/u.test(id) ? id : undefined;
}

function normalizeKind(value: unknown): DailyPlanItemKind {
  return value === "create_note" || value === "edit_note" || value === "send_card" ? value : "task";
}

function normalizePolicy(value: unknown): DailyDevicePolicy {
  return value === "manual" || value === "scheduled" || value === "rotation" || value === "agent" ? value : "none";
}

function normalizePriority(value: unknown): DailyPlanPriority {
  return value === "highest" || value === "high" || value === "low" || value === "lowest"
    ? value
    : "normal";
}

function normalizeOptionalDate(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? normalizeDate(value) : undefined;
}

function normalizeScheduledFor(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.trim().replace(" ", "T");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})?$/u.test(normalized)) {
    return undefined;
  }
  return normalized;
}

function normalizeOptionalText(value: unknown, maxLength: number): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = String(value).replace(/[\r\n]+/gu, " ").replace(/\s+/gu, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function normalizeOptionalTarget(value: unknown): string | undefined {
  const normalized = normalizeOptionalText(value, 500);
  if (!normalized) return undefined;
  const wikilink = /^\[\[([^\]\r\n]+)\]\]$/u.exec(normalized);
  if (wikilink) return `[[${wikilink[1]}]]`;
  const markdown = /^\[([^\]\r\n]+)\]\(([^)\r\n]+)\)$/u.exec(normalized);
  if (markdown) {
    const target = safeMarkdownNoteTarget(markdown[2]);
    if (!target) return undefined;
    const label = markdown[1].trim();
    return `[[${target}${label ? `|${label}` : ""}]]`;
  }
  return normalized.replace(/[\[\]]/gu, "").trim() || undefined;
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

function normalizeTaskRef(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9_:-]{5,127}$/u.test(normalized)
    ? normalized
    : undefined;
}

function normalizePoolRevision(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return /^tpr_[0-9a-f]{32}$/u.test(normalized) ? normalized : undefined;
}

function normalizeWorkKind(value: unknown): DailyWorkKind | undefined {
  return value === "question" || value === "note" || value === "inbox"
    ? value
    : undefined;
}

function normalizeWorkRef(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\\/gu, "/");
  return normalized
    && normalized.length <= 500
    && !/[\r\n\]]/u.test(normalized)
    ? normalized
    : undefined;
}

function normalizeWorkRevision(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return /^(?:wq|wn)_[0-9a-f]{32}$/u.test(normalized) ? normalized : undefined;
}

function normalizeTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return unique(values.map((value) => String(value).trim().replace(/^#+/u, ""))
    .filter((value) => /^[\p{L}\p{N}_/-]+$/u.test(value))).slice(0, 32);
}

function safeFieldValue(value: string, allowWikilink: boolean): string {
  if (allowWikilink && /^\[\[[^\]\r\n]+\]\]$/u.test(value)) return value;
  return value.replace(/[\r\n\]]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function ensureTrailingNewline(value: string): string {
  return `${value.replace(/\s+$/u, "")}\n`;
}

function sameCreateRequest(left: DailyPlanItem, right: DailyPlanItem): boolean {
  return left.text === right.text
    && left.kind === right.kind
    && left.category === right.category
    && left.taskRef === right.taskRef
    && left.taskPoolRevision === right.taskPoolRevision
    && left.workKind === right.workKind
    && left.workRef === right.workRef
    && left.workRevision === right.workRevision
    && left.devicePolicy === right.devicePolicy
    && left.priority === right.priority
    && left.scheduledDate === right.scheduledDate
    && Boolean(left.scheduledDateExplicit) === Boolean(right.scheduledDateExplicit)
    && left.dueDate === right.dueDate
    && Boolean(left.dueDateExplicit) === Boolean(right.dueDateExplicit)
    && left.scheduledFor === right.scheduledFor
    && Boolean(left.primary) === Boolean(right.primary)
    && Boolean(left.minimum) === Boolean(right.minimum)
    && left.goal === right.goal
    && left.nextStep === right.nextStep
    && left.estimateMinutes === right.estimateMinutes
    && left.target === right.target
    && sameStrings(left.tags, right.tags);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function assertRevision(item: DailyPlanItem, expectedRevision: string | DailyTaskRevision): void {
  const expected = typeof expectedRevision === "string" ? expectedRevision : expectedRevision.value;
  if (!expected || expected !== item.revision.value) {
    throw new DailyPlanConflictError("revision-changed", "The daily plan item changed after it was loaded.");
  }
}

function assertWritable(document: DailyPlanDocument): void {
  // A newly typed checkbox can temporarily be missing its hidden stable id.
  // That row is excluded from managed writes until normalization, but it must
  // not prevent an already-normalized sibling task from being started or
  // completed. Structural ambiguity (duplicate/multiple ids) still blocks the
  // whole document because it can make a targeted write unsafe.
  const blocking = document.diagnostics.filter((entry) => entry.code !== "missing-block-id");
  if (!blocking.length) return;
  const details = blocking
    .map((entry) => `${entry.code} at line ${entry.line}`)
    .join(", ");
  throw new DailyPlanConflictError(
    "invalid-document",
    `The daily plan contains diagnostics that must be repaired before writing: ${details}`
  );
}

function diagnostic(
  code: DailyPlanDiagnostic["code"],
  sourcePath: string,
  line: number,
  message: string,
  blockId?: string
): DailyPlanDiagnostic {
  return { code, severity: "error", message, sourcePath, line, blockId };
}

function createDailyId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `daily_${globalThis.crypto.randomUUID().replace(/-/gu, "")}`;
  }
  const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(16));
  if (!bytes) throw new Error("Secure randomness is unavailable for daily plan ids.");
  return `daily_${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
