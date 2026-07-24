import { shortHash } from "../core/hash";
import { parseDailyPlanHierarchy, type DailyPlanHierarchyParseOptions } from "./hierarchy";
import {
  DailyPlanConflictError,
  DailyPlanService,
  type DailyPlanServiceOptions,
  type DailyPlanStorage
} from "./plan-service";
import type {
  DailyPlanNormalizationEdit,
  DailyPlanNormalizationPreview,
  DailyPlanNormalizationResult,
  DailyPlanNormalizationUndoResult
} from "./types";

const LIST_RE = /^(?<prefix>[ \t]*(?:[-+*]|\d+[.)])[ \t]+)(?<body>.*)$/u;
const CHECKBOX_RE = /^(?<prefix>[ \t]*(?:[-+*]|\d+[.)])[ \t]+\[[^\]]*\][ \t]+)(?<body>.*)$/u;
const INLINE_BLOCK_RE = /(?:^|\s)\^(?<id>[A-Za-z0-9_-]+)\s*$/u;
const DEFAULT_UNDO_TTL_MS = 10 * 60 * 1_000;

export interface DailyPlanNormalizationServiceOptions extends DailyPlanServiceOptions {
  targetExists?: DailyPlanHierarchyParseOptions["targetExists"];
  undoTtlMs?: number;
}

interface UndoEntry {
  path: string;
  date: string;
  before: string;
  after: string;
  expiresAt: number;
}

export class DailyPlanNormalizationService {
  private readonly plan: DailyPlanService;
  private readonly createId: () => string;
  private readonly now: () => Date;
  private readonly undoTtlMs: number;
  private readonly undoEntries = new Map<string, UndoEntry>();
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly storage: DailyPlanStorage,
    private readonly options: DailyPlanNormalizationServiceOptions = {}
  ) {
    this.plan = new DailyPlanService(storage, options);
    this.createId = options.createId ?? createDailyId;
    this.now = options.now ?? (() => new Date());
    this.undoTtlMs = normalizeUndoTtl(options.undoTtlMs);
  }

  async preview(value: Date | string = this.now()): Promise<DailyPlanNormalizationPreview> {
    const date = normalizeDate(value);
    const sourcePath = this.plan.pathForDate(date);
    const markdown = await this.storage.readText(sourcePath) ?? "";
    return createDailyPlanNormalizationPreview(markdown, sourcePath, date, {
      source: this.plan.planSource,
      todoHeading: this.options.todoHeading,
      targetExists: this.options.targetExists,
      createId: this.createId
    });
  }

  async normalize(preview: DailyPlanNormalizationPreview): Promise<DailyPlanNormalizationResult> {
    const sourcePath = this.plan.pathForDate(preview.date);
    if (sourcePath !== preview.sourcePath || !sameSource(this.plan.planSource, preview.source)) {
      throw new DailyPlanConflictError("invalid-document", "The normalization preview belongs to another plan source.");
    }
    return this.withPathLock(sourcePath, async () => {
      const current = await this.storage.readText(sourcePath) ?? "";
      const parsed = parseDailyPlanHierarchy(current, sourcePath, preview.date, {
        source: this.plan.planSource,
        todoHeading: this.options.todoHeading,
        targetExists: this.options.targetExists
      });
      if (parsed.revision !== preview.expectedRevision) {
        throw new DailyPlanConflictError(
          "revision-changed",
          "The daily plan changed after the normalization preview was generated."
        );
      }
      assertNormalizable({ ...preview, diagnostics: parsed.diagnostics });
      const newline = current.includes("\r\n") ? "\r\n" : "\n";
      const lines = current.split(/\r?\n/u);
      assertCanonicalNormalizationEdits(preview, parsed.tasks, lines);
      for (const edit of [...preview.edits].sort((left, right) => right.line - left.line)) {
        if (lines[edit.line - 1] !== edit.before) {
          throw new DailyPlanConflictError(
            "revision-changed",
            `Daily plan line ${edit.line} changed after preview.`
          );
        }
        lines[edit.line - 1] = edit.after;
      }
      const next = lines.join(newline);
      if (next === current) {
        return { preview, revision: parsed.revision };
      }
      await this.storage.writeText(sourcePath, next);
      await this.options.onChanged?.(sourcePath);

      const undoToken = createUndoToken();
      this.pruneUndoEntries();
      this.undoEntries.set(undoToken, {
        path: sourcePath,
        date: preview.date,
        before: current,
        after: next,
        expiresAt: this.now().getTime() + this.undoTtlMs
      });
      const updated = createDailyPlanNormalizationPreview(next, sourcePath, preview.date, {
        source: this.plan.planSource,
        todoHeading: this.options.todoHeading,
        targetExists: this.options.targetExists,
        createId: this.createId
      });
      return { preview: updated, revision: updated.expectedRevision, undoToken };
    });
  }

  async undo(token: string): Promise<DailyPlanNormalizationUndoResult> {
    const entry = this.undoEntries.get(token);
    if (!entry || entry.expiresAt < this.now().getTime()) {
      this.undoEntries.delete(token);
      throw new DailyPlanConflictError("not-found", "The normalization undo token is missing or expired.");
    }
    return this.withPathLock(entry.path, async () => {
      const current = await this.storage.readText(entry.path) ?? "";
      if (current !== entry.after) {
        throw new DailyPlanConflictError(
          "revision-changed",
          "The daily plan changed after normalization and cannot be safely undone."
        );
      }
      await this.storage.writeText(entry.path, entry.before);
      await this.options.onChanged?.(entry.path);
      this.undoEntries.delete(token);
      const restored = parseDailyPlanHierarchy(entry.before, entry.path, entry.date, {
        source: this.plan.planSource,
        todoHeading: this.options.todoHeading,
        targetExists: this.options.targetExists
      });
      return { restored: true, revision: restored.revision };
    });
  }

  private pruneUndoEntries(): void {
    const now = this.now().getTime();
    for (const [token, entry] of this.undoEntries) {
      if (entry.expiresAt < now) this.undoEntries.delete(token);
    }
  }

  private async withPathLock<T>(path: string, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(path) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.locks.set(path, tail);
    await previous;
    try {
      return await action();
    } finally {
      release?.();
      if (this.locks.get(path) === tail) this.locks.delete(path);
    }
  }
}

export interface CreateDailyPlanNormalizationPreviewOptions extends DailyPlanHierarchyParseOptions {
  createId?: () => string;
}

export function createDailyPlanNormalizationPreview(
  markdown: string,
  sourcePath: string,
  date: string,
  options: CreateDailyPlanNormalizationPreviewOptions = {}
): DailyPlanNormalizationPreview {
  const hierarchy = parseDailyPlanHierarchy(markdown, sourcePath, date, options);
  const createId = options.createId ?? createDailyId;
  const usedIds = new Set(hierarchy.tasks.flatMap((task) => task.blockId ? [task.blockId] : []));
  const edits: DailyPlanNormalizationEdit[] = [];
  for (const task of hierarchy.tasks) {
    if (!task.normalizationRequired) continue;
    const proposedBlockId = task.blockId ?? nextUniqueId(createId, usedIds);
    const after = normalizedTaskLine(task.rawLine, task.checkbox, task.status === "done", proposedBlockId);
    if (after === task.rawLine) continue;
    edits.push({
      line: task.line,
      kind: task.checkbox ? "missing-block-id" : "plain-leaf",
      before: task.rawLine,
      after,
      proposedBlockId,
      taskText: task.text,
      lineageRevision: task.lineageRevision,
      targetResolution: task.targetResolution,
      legacyTimingSuggestion: inferLegacyTimingSuggestion(task.text)
    });
  }
  return {
    schemaVersion: 1,
    date: hierarchy.date,
    source: hierarchy.source,
    sourcePath,
    expectedRevision: hierarchy.revision,
    groups: hierarchy.groups,
    tasks: hierarchy.tasks,
    diagnostics: hierarchy.diagnostics,
    edits,
    changed: edits.length > 0,
    diff: formatCompactDiff(edits)
  };
}

function inferLegacyTimingSuggestion(
  text: string
): DailyPlanNormalizationEdit["legacyTimingSuggestion"] {
  const estimateMatch = /(?:^|[,\s，])(\d{1,4})\s*(?:m|min|minutes?|分钟)(?=$|[,\s，])/iu.exec(text);
  const estimate = estimateMatch ? Number(estimateMatch[1]) : undefined;
  const observedTimes = [...text.matchAll(/(?<!\d)([01]?\d|2[0-3])[:：]([0-5]\d)(?!\d)/gu)]
    .map((match) => `${match[1].padStart(2, "0")}:${match[2]}`);
  if (!estimate && !observedTimes.length) return undefined;
  return {
    estimateMinutes: estimate && estimate <= 1_440 ? estimate : undefined,
    observedTimes: [...new Set(observedTimes)],
    confidence: "low"
  };
}

function normalizedTaskLine(
  rawLine: string,
  checkbox: boolean,
  done: boolean,
  blockId: string
): string {
  if (checkbox) {
    const match = CHECKBOX_RE.exec(rawLine);
    if (!match?.groups) return rawLine;
    const body = replaceInlineBlockId(match.groups.body, blockId);
    return `${match.groups.prefix}${body}`;
  }
  const match = LIST_RE.exec(rawLine);
  if (!match?.groups) return rawLine;
  const body = replaceInlineBlockId(match.groups.body, blockId);
  return `${match.groups.prefix}[${done ? "x" : " "}] ${body}`;
}

function replaceInlineBlockId(body: string, blockId: string): string {
  const content = body.replace(INLINE_BLOCK_RE, "").replace(/\s+$/u, "");
  return `${content} ^${blockId}`;
}

function assertNormalizable(preview: DailyPlanNormalizationPreview): void {
  const errors = preview.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (!errors.length) return;
  throw new DailyPlanConflictError(
    "invalid-document",
    `The daily plan has normalization errors: ${errors.map((entry) => `${entry.code} at line ${entry.line}`).join(", ")}`
  );
}

function assertCanonicalNormalizationEdits(
  preview: DailyPlanNormalizationPreview,
  tasks: DailyPlanNormalizationPreview["tasks"],
  lines: readonly string[]
): void {
  const required = tasks.filter((task) => task.normalizationRequired);
  if (preview.edits.length !== required.length) {
    throw new DailyPlanConflictError(
      "invalid-document",
      "Normalization edits must exactly match the tasks in the current plan."
    );
  }
  const byLine = new Map(required.map((task) => [task.line, task]));
  const usedIds = new Set(tasks.flatMap((task) => task.blockId ? [task.blockId] : []));
  const seenLines = new Set<number>();
  for (const edit of preview.edits) {
    const task = byLine.get(edit.line);
    if (!task || seenLines.has(edit.line) || lines[edit.line - 1] !== task.rawLine) {
      throw new DailyPlanConflictError(
        "invalid-document",
        `Normalization edit at line ${edit.line} is outside the canonical task set.`
      );
    }
    seenLines.add(edit.line);
    const proposedId = normalizeGeneratedId(edit.proposedBlockId);
    if (usedIds.has(proposedId)) {
      throw new DailyPlanConflictError(
        "invalid-document",
        `Normalization block id ${proposedId} is duplicated.`
      );
    }
    usedIds.add(proposedId);
    const expectedKind = task.checkbox ? "missing-block-id" : "plain-leaf";
    const expectedAfter = normalizedTaskLine(
      task.rawLine,
      task.checkbox,
      task.status === "done",
      proposedId
    );
    if (edit.kind !== expectedKind
      || edit.before !== task.rawLine
      || edit.after !== expectedAfter
      || edit.lineageRevision !== task.lineageRevision) {
      throw new DailyPlanConflictError(
        "invalid-document",
        `Normalization edit at line ${edit.line} does not match the canonical transformation.`
      );
    }
  }
}

function formatCompactDiff(edits: readonly DailyPlanNormalizationEdit[]): string {
  return edits
    .map((edit) => `@@ line ${edit.line} @@\n-${edit.before}\n+${edit.after}`)
    .join("\n");
}

function nextUniqueId(createId: () => string, used: Set<string>): string {
  for (let attempts = 0; attempts < 100; attempts += 1) {
    const id = normalizeGeneratedId(createId());
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
  throw new Error("Could not allocate a unique daily task block id.");
}

function normalizeGeneratedId(value: string): string {
  const id = String(value ?? "").trim().replace(/^\^/u, "");
  if (!/^daily_[a-f0-9]{32}$/u.test(id)) {
    throw new Error("Normalization task ids must contain 128 bits of lowercase hexadecimal randomness.");
  }
  return id;
}

function createDailyId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `daily_${globalThis.crypto.randomUUID().replace(/-/gu, "")}`;
  }
  const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(16));
  if (!bytes) throw new Error("Secure randomness is unavailable for daily task normalization.");
  return `daily_${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function createUndoToken(): string {
  if (globalThis.crypto?.randomUUID) return `dnu_${globalThis.crypto.randomUUID().replace(/-/gu, "")}`;
  const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(16));
  if (!bytes) throw new Error("Secure randomness is unavailable for normalization undo.");
  return `dnu_${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function normalizeDate(value: Date | string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Daily plan date is invalid.");
  return `${date.getFullYear().toString().padStart(4, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

function normalizeUndoTtl(value: number | undefined): number {
  return Number.isFinite(value) && Number(value) >= 1_000
    ? Math.min(Number(value), 60 * 60 * 1_000)
    : DEFAULT_UNDO_TTL_MS;
}

function sameSource(left: DailyPlanNormalizationPreview["source"], right: DailyPlanNormalizationPreview["source"]): boolean {
  if (left.kind !== right.kind) return false;
  return left.kind === "fixed-document"
    ? left.path === (right.kind === "fixed-document" ? right.path : "")
    : (left.dailyRoot ?? "Daily") === (right.kind === "daily-note" ? right.dailyRoot ?? "Daily" : "");
}

export function dailyPlanNormalizationContentRevision(markdown: string): string {
  return `dnr_${shortHash(markdown)}`;
}
