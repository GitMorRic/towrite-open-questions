import { shortHash } from "../core/hash";
import { parseDailyPlanHierarchy, type DailyPlanHierarchyParseOptions } from "./hierarchy";
import { isPureDailyNoteLinkText, resolveDailyTarget } from "./target-resolver";
import {
  DailyPlanConflictError,
  DailyPlanService,
  type DailyPlanServiceOptions,
  type DailyPlanStorage
} from "./plan-service";
import type {
  DailyPlanNormalizationEdit,
  DailyPlanEnrichmentPatch,
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

export function shouldAutomaticallyNormalizeDailyEdit(
  edit: DailyPlanNormalizationEdit,
  sourcePath: string
): boolean {
  return edit.kind === "missing-block-id"
    || (
      edit.kind === "plain-leaf"
      && isPureDailyNoteLinkText(edit.taskText, { sourcePath })
    );
}

/**
 * A checkbox is observed while the author is still typing. Do not append a
 * stable block id inside an unfinished link: doing so changes the link query
 * and can make Obsidian's native link suggester accept corrupted Markdown.
 */
export function hasIncompleteDailyTaskLinkSyntax(value: string): boolean {
  return hasUnclosedPair(value, "[[", "]]")
    || hasUnclosedPair(value, "【【", "】】")
    || /\[[^\]\r\n]+\]\([^)\r\n]*$/u.test(value);
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
      planHeading: this.options.planHeading,
      targetExists: this.options.targetExists,
      createId: this.createId
    });
  }

  async normalize(preview: DailyPlanNormalizationPreview): Promise<DailyPlanNormalizationResult> {
    return this.normalizeScoped(preview);
  }

  /**
   * Normalizes one newly authored task while leaving every other pending line
   * untouched. This powers the editor's "track only" and progressive
   * properties actions without turning a quick checkbox into a bulk rewrite.
   */
  async normalizeTask(
    preview: DailyPlanNormalizationPreview,
    line: number
  ): Promise<DailyPlanNormalizationResult> {
    return this.adoptTask(preview, line);
  }

  /**
   * Adopts one quick Markdown task and writes only the optional properties the
   * author explicitly selected. ID + properties share one document CAS and
   * one Vault write, so a successful result can never leave a half-enriched
   * task behind.
   */
  async adoptTask(
    preview: DailyPlanNormalizationPreview,
    line: number,
    patch: DailyPlanEnrichmentPatch = {}
  ): Promise<DailyPlanNormalizationResult> {
    const selected = preview.edits.filter((edit) => edit.line === line);
    if (selected.length !== 1) {
      throw new DailyPlanConflictError(
        "not-found",
        `The Daily normalization candidate at line ${line} is missing or ambiguous.`
      );
    }
    return this.normalizeScoped({
      ...preview,
      edits: selected,
      changed: true,
      diff: formatCompactDiff(selected)
    }, false, patch);
  }

  private async normalizeScoped(
    preview: DailyPlanNormalizationPreview,
    requireAll = true,
    enrichment?: DailyPlanEnrichmentPatch
  ): Promise<DailyPlanNormalizationResult> {
    const sourcePath = this.plan.pathForDate(preview.date);
    if (sourcePath !== preview.sourcePath || !sameSource(this.plan.planSource, preview.source)) {
      throw new DailyPlanConflictError("invalid-document", "The normalization preview belongs to another plan source.");
    }
    return this.withPathLock(sourcePath, async () => {
      const current = await this.storage.readText(sourcePath) ?? "";
      const parsed = parseDailyPlanHierarchy(current, sourcePath, preview.date, {
        source: this.plan.planSource,
        todoHeading: this.options.todoHeading,
        planHeading: this.options.planHeading,
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
      assertCanonicalNormalizationEdits(preview, parsed.tasks, lines, requireAll);
      for (const edit of [...preview.edits].sort((left, right) => right.line - left.line)) {
        if (lines[edit.line - 1] !== edit.before) {
          throw new DailyPlanConflictError(
            "revision-changed",
            `Daily plan line ${edit.line} changed after preview.`
          );
        }
        lines[edit.line - 1] = edit.after;
      }
      if (enrichment && preview.edits.length === 1) {
        applyEnrichmentPatch(
          lines,
          parsed.tasks.find((task) => task.line === preview.edits[0].line),
          enrichment,
          sourcePath
        );
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
        planHeading: this.options.planHeading,
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
        planHeading: this.options.planHeading,
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
    if (hasIncompleteDailyTaskLinkSyntax(task.rawLine)) continue;
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
  lines: readonly string[],
  requireAll = true
): void {
  const required = tasks.filter((task) =>
    task.normalizationRequired && !hasIncompleteDailyTaskLinkSyntax(task.rawLine)
  );
  if (requireAll && preview.edits.length !== required.length) {
    throw new DailyPlanConflictError(
      "invalid-document",
      "Normalization edits must exactly match the tasks in the current plan."
    );
  }
  if (!requireAll && preview.edits.length !== 1) {
    throw new DailyPlanConflictError(
      "invalid-document",
      "A scoped normalization must contain exactly one current task edit."
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

function hasUnclosedPair(value: string, open: string, close: string): boolean {
  let offset = 0;
  while (offset < value.length) {
    const start = value.indexOf(open, offset);
    if (start < 0) return false;
    const end = value.indexOf(close, start + open.length);
    if (end < 0) return true;
    offset = end + close.length;
  }
  return false;
}

function applyEnrichmentPatch(
  lines: string[],
  task: DailyPlanNormalizationPreview["tasks"][number] | undefined,
  patch: DailyPlanEnrichmentPatch,
  sourcePath: string
): void {
  if (!task) {
    throw new DailyPlanConflictError(
      "invalid-document",
      "The selected quick task is no longer part of the current plan."
    );
  }
  const start = task.line - 1;
  const originalLength = Math.max(1, task.endLine - task.line + 1);
  const block = lines.slice(start, start + originalLength);
  if (!block.length) {
    throw new DailyPlanConflictError("invalid-document", "The selected quick task has no source block.");
  }
  const indent = `${/^[ \t]*/u.exec(block[0])?.[0] ?? ""}  `;
  const requested: Array<{
    key: "category" | "due" | "estimate" | "target" | "next";
    value: string | null | undefined;
  }> = [
    { key: "category", value: optionalOwnedText(patch.category, 120) },
    { key: "due", value: normalizedEnrichmentDate(patch.dueDate) },
    { key: "estimate", value: normalizedEnrichmentEstimate(patch.estimateMinutes) },
    { key: "target", value: normalizedEnrichmentTarget(patch.target, sourcePath) },
    { key: "next", value: optionalOwnedText(patch.nextStep, 1_000) }
  ];

  const additions: string[] = [];
  for (const field of requested) {
    if (field.value === undefined) continue;
    const matcher = new RegExp(`^[ \\t]*\\[towrite-${field.key}::[\\s\\S]*\\][ \\t]*$`, "u");
    const matches = block
      .map((line, index) => matcher.test(line) ? index : -1)
      .filter((index) => index >= 1);
    if (field.value === null) {
      for (const index of matches.sort((left, right) => right - left)) block.splice(index, 1);
      continue;
    }
    const formatted = `${indent}[towrite-${field.key}:: ${field.value}]`;
    if (matches.length) {
      block[matches[0]] = formatted;
      for (const index of matches.slice(1).sort((left, right) => right - left)) block.splice(index, 1);
    } else {
      additions.push(formatted);
    }
  }
  if (additions.length) {
    let insertAt = 1;
    while (insertAt < block.length && /^\s*\[towrite-[a-z-]+::/iu.test(block[insertAt])) insertAt += 1;
    block.splice(insertAt, 0, ...additions);
  }
  lines.splice(start, originalLength, ...block);
}

function optionalOwnedText(
  value: string | null | undefined,
  maxLength: number
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value)
    .replace(/[\r\n\]]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
  return normalized || null;
}

function normalizedEnrichmentDate(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
    throw new Error("Daily task due date must use YYYY-MM-DD.");
  }
  const parsed = new Date(`${normalized}T12:00:00`);
  const roundTrip = Number.isFinite(parsed.getTime())
    ? `${parsed.getFullYear().toString().padStart(4, "0")}-${(parsed.getMonth() + 1).toString().padStart(2, "0")}-${parsed.getDate().toString().padStart(2, "0")}`
    : "";
  if (roundTrip !== normalized) throw new Error("Daily task due date is invalid.");
  return normalized;
}

function normalizedEnrichmentEstimate(value: number | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (!Number.isInteger(value) || value < 1 || value > 1_440) {
    throw new Error("Daily task estimate must be an integer between 1 and 1440 minutes.");
  }
  return `${value}m`;
}

function normalizedEnrichmentTarget(value: string | null | undefined, sourcePath: string): string | null | undefined {
  if (value === undefined || value === null || !value.trim()) return value === undefined ? undefined : null;
  const normalized = value.replace(/[\r\n]+/gu, " ").trim();
  const resolved = resolveDailyTarget({
    sourcePath,
    taskText: "",
    explicitTarget: normalized
  });
  if (resolved.source !== "explicit" || (!resolved.target && !resolved.webTarget)) {
    throw new Error("Daily task target must be a safe Obsidian note or explicit HTTPS URL.");
  }
  return normalized;
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
