import { shortHash } from "../core/hash";
import {
  DAILY_SCHEMA_VERSION,
  type DailyDevicePolicy,
  type DailyPlanCreateInput,
  type DailyPlanItem,
  type DailyPlanItemKind,
  type DailyPlanPriority,
  type DailyPlanStatus,
  type DailyPlanUpdate,
  type DailySummary,
  type DailyTaskRevision
} from "./types";

export interface DailyPlanStorage {
  readText(path: string): Promise<string | undefined>;
  writeText(path: string, content: string): Promise<void>;
}

export interface DailyPlanServiceOptions {
  dailyRoot?: string;
  todoHeading?: string;
  summaryHeading?: string;
  now?: () => Date;
  createId?: () => string;
  onChanged?: (path: string) => void | Promise<void>;
}

export class DailyPlanConflictError extends Error {
  constructor(
    public readonly code: "not-found" | "revision-changed" | "id-reused",
    message: string
  ) {
    super(message);
    this.name = "DailyPlanConflictError";
  }
}

const TASK_RE = /^(?<indent>\s*)-\s+\[(?<mark>[^\]]*)\]\s+(?<body>.*)$/u;
const BLOCK_RE = /\s+\^(?<id>[A-Za-z0-9_-]+)\s*$/u;
const STANDALONE_BLOCK_RE = /^(?<indent>\s+)\^(?<id>[A-Za-z0-9_-]+)\s*$/u;
const FIELD_RE = /\s*\[towrite-(?<key>kind|device|at)::\s*(?<value>[^\]]*)\]/giu;
const PRIORITY_RE = /(?:^|\s)(?<emoji>🔺|⏫|🔼|🔽|⏬)(?=\s|$)/gu;
const DATE_RE = {
  scheduled: /\s+⏳\s+(\d{4}-\d{2}-\d{2})/u,
  due: /\s+📅\s+(\d{4}-\d{2}-\d{2})/u,
  completion: /\s+✅\s+(\d{4}-\d{2}-\d{2})/u
} as const;
const TAG_RE = /(?<!\S)#([\p{L}\p{N}_/-]+)/gu;
const LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/gu;

export class DailyPlanService {
  private readonly root: string;
  private readonly todoHeading: string;
  private readonly summaryHeading: string;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly storage: DailyPlanStorage,
    private readonly options: DailyPlanServiceOptions = {}
  ) {
    this.root = normalizeRoot(options.dailyRoot ?? "Daily");
    this.todoHeading = normalizeHeading(options.todoHeading ?? "ToDo");
    this.summaryHeading = normalizeHeading(options.summaryHeading ?? "今日总结");
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? createDailyId;
  }

  pathForDate(value: Date | string = this.now()): string {
    return `${this.root}/${normalizeDate(value)}.md`;
  }

  async list(value: Date | string = this.now()): Promise<DailyPlanItem[]> {
    const date = normalizeDate(value);
    const path = this.pathForDate(date);
    return parseDailyPlanDocument(await this.storage.readText(path) ?? "", path, date, this.todoHeading);
  }

  async get(id: string, value: Date | string = this.now()): Promise<DailyPlanItem | undefined> {
    return (await this.list(value)).find((item) => item.id === id);
  }

  async create(input: DailyPlanCreateInput, now = this.now()): Promise<DailyPlanItem> {
    const date = normalizeDate(input.date ?? now);
    const path = this.pathForDate(date);
    const id = normalizeBlockId(input.id) || normalizeBlockId(this.createId());
    if (!id) {
      throw new Error("Daily plan item id is invalid.");
    }
    const text = normalizeTaskText(input.text);
    const kind = normalizeKind(input.kind);
    const devicePolicy = normalizePolicy(input.devicePolicy);
    const priority = normalizePriority(input.priority);
    const dueDate = normalizeOptionalDate(input.dueDate) ?? date;
    const scheduledFor = normalizeScheduledFor(input.scheduledFor);
    const tags = normalizeTags(input.tags);
    const line = formatTaskLine({
      id,
      text,
      kind,
      devicePolicy,
      priority,
      priorityExplicit: input.priority !== undefined,
      date,
      dueDate,
      scheduledFor,
      tags
    });

    return this.withPathLock(path, async () => {
      const current = await this.storage.readText(path) ?? "";
      const existing = parseDailyPlanDocument(current, path, date, this.todoHeading).find((item) => item.id === id);
      if (existing) {
        if (existing.text === text
          && existing.kind === kind
          && existing.devicePolicy === devicePolicy
          && existing.priority === priority
          && existing.dueDate === dueDate
          && existing.scheduledFor === scheduledFor
          && sameStrings(existing.tags, tags)) {
          return existing;
        }
        throw new DailyPlanConflictError("id-reused", `Daily plan item id is already used: ${id}`);
      }
      const next = appendToSection(current, date, this.todoHeading, line);
      await this.storage.writeText(path, next);
      await this.notify(path);
      const created = parseDailyPlanDocument(next, path, date, this.todoHeading).find((item) => item.id === id);
      if (!created) {
        throw new Error("Daily plan item could not be verified after writing.");
      }
      return created;
    });
  }

  update(
    id: string,
    expectedRevision: string | DailyTaskRevision,
    patch: DailyPlanUpdate,
    value: Date | string = this.now()
  ): Promise<DailyPlanItem> {
    return this.mutate(id, expectedRevision, value, (item) => formatTaskLine({
      id: item.id,
      text: patch.text === undefined ? item.text : normalizeTaskText(patch.text),
      kind: patch.kind === undefined ? item.kind : normalizeKind(patch.kind),
      devicePolicy: patch.devicePolicy === undefined ? item.devicePolicy : normalizePolicy(patch.devicePolicy),
      priority: patch.priority === undefined ? item.priority : normalizePriority(patch.priority),
      priorityExplicit: patch.priority === undefined ? item.priorityExplicit : true,
      date: item.scheduledDate || item.date,
      dueDate: patch.dueDate === undefined ? item.dueDate : normalizeOptionalDate(patch.dueDate) ?? item.date,
      scheduledFor: patch.scheduledFor === undefined
        ? item.scheduledFor
        : patch.scheduledFor === null
          ? undefined
          : normalizeScheduledFor(patch.scheduledFor),
      tags: patch.tags === undefined ? item.tags : normalizeTags(patch.tags),
      status: patch.status ?? item.status,
      completionDate: patch.status === undefined && item.status === "done" ? item.completionDate : undefined
    }));
  }

  complete(
    id: string,
    expectedRevision: string | DailyTaskRevision,
    value: Date | string = this.now()
  ): Promise<DailyPlanItem> {
    const completedAt = normalizeDate(this.now());
    return this.mutate(id, expectedRevision, value, (item) => formatTaskLine({
      id: item.id,
      text: item.text,
      kind: item.kind,
      devicePolicy: item.devicePolicy,
      priority: item.priority,
      priorityExplicit: item.priorityExplicit,
      date: item.scheduledDate || item.date,
      dueDate: item.dueDate,
      scheduledFor: item.scheduledFor,
      tags: item.tags,
      status: "done",
      completionDate: completedAt
    }));
  }

  reopen(
    id: string,
    expectedRevision: string | DailyTaskRevision,
    value: Date | string = this.now()
  ): Promise<DailyPlanItem> {
    return this.mutate(id, expectedRevision, value, (item) => formatTaskLine({
      id: item.id,
      text: item.text,
      kind: item.kind,
      devicePolicy: item.devicePolicy,
      priority: item.priority,
      priorityExplicit: item.priorityExplicit,
      date: item.scheduledDate || item.date,
      dueDate: item.dueDate,
      scheduledFor: item.scheduledFor,
      tags: item.tags,
      status: "todo"
    }));
  }

  async writeSummary(
    summary: Pick<DailySummary, "date" | "markdown">,
    value: Date | string = summary.date
  ): Promise<{ path: string; changed: boolean }> {
    const date = normalizeDate(value);
    const path = this.pathForDate(date);
    return this.withPathLock(path, async () => {
      const current = await this.storage.readText(path) ?? initialDocument(date, this.todoHeading);
      const body = summary.markdown.replace(/^##\s+[^\r\n]+\r?\n/u, "").trim();
      const next = replaceSection(current, this.summaryHeading, body);
      if (next === current) {
        return { path, changed: false };
      }
      await this.storage.writeText(path, next);
      await this.notify(path);
      return { path, changed: true };
    });
  }

  private async mutate(
    id: string,
    expectedRevision: string | DailyTaskRevision,
    value: Date | string,
    updateLine: (item: DailyPlanItem) => string
  ): Promise<DailyPlanItem> {
    const date = normalizeDate(value);
    const path = this.pathForDate(date);
    return this.withPathLock(path, async () => {
      const current = await this.storage.readText(path);
      if (current === undefined) {
        throw new DailyPlanConflictError("not-found", `Daily plan file does not exist: ${path}`);
      }
      const item = parseDailyPlanDocument(current, path, date, this.todoHeading).find((entry) => entry.id === id);
      if (!item) {
        throw new DailyPlanConflictError("not-found", `Daily plan item does not exist: ${id}`);
      }
      const expected = typeof expectedRevision === "string" ? expectedRevision : expectedRevision.value;
      if (!expected || expected !== item.revision.value) {
        throw new DailyPlanConflictError("revision-changed", "The daily plan item changed after it was loaded.");
      }
      const lines = current.split(/\r?\n/u);
      const endLine = Math.max(item.line, item.endLine ?? item.line);
      lines.splice(item.line - 1, endLine - item.line + 1, updateLine(item));
      const next = `${lines.join("\n").replace(/\s+$/u, "")}\n`;
      await this.storage.writeText(path, next);
      await this.notify(path);
      const updated = parseDailyPlanDocument(next, path, date, this.todoHeading).find((entry) => entry.id === id);
      if (!updated) {
        throw new Error("Daily plan item could not be verified after writing.");
      }
      return updated;
    });
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
      if (this.locks.get(path) === chain) {
        this.locks.delete(path);
      }
    }
  }

  private async notify(path: string): Promise<void> {
    await this.options.onChanged?.(path);
  }
}

export function parseDailyPlanDocument(
  markdown: string,
  sourcePath: string,
  date: string,
  todoHeading = "ToDo"
): DailyPlanItem[] {
  const lines = markdown.split(/\r?\n/u);
  const section = findSection(lines, todoHeading);
  if (!section) return [];
  const items: DailyPlanItem[] = [];
  for (let index = section.start; index < section.end; index += 1) {
    const rawLine = lines[index];
    const match = TASK_RE.exec(rawLine);
    if (!match?.groups) continue;
    const body = match.groups.body.trim();
    let blockId = BLOCK_RE.exec(body)?.groups?.id;
    let endIndex = index;
    const continuationLines: string[] = [];
    for (let cursor = index + 1; cursor < section.end; cursor += 1) {
      const continuation = parseTaskContinuation(lines[cursor], match.groups.indent.length);
      if (!continuation) break;
      if (continuation.kind === "block") {
        if (blockId) break;
        blockId = continuation.id;
        continuationLines.push(lines[cursor]);
        endIndex = cursor;
        break;
      }
      continuationLines.push(lines[cursor]);
      endIndex = cursor;
    }
    if (!blockId) continue;
    const rawBlock = [rawLine, ...continuationLines].join("\n");
    const logicalSource = [body, ...continuationLines].join(" ");
    const fields = parseFields(logicalSource);
    const status = normalizeStatus(match.groups.mark);
    const revision: DailyTaskRevision = {
      value: `dtr_${shortHash(`${sourcePath}\n${blockId}\n${rawBlock}`)}`,
      sourcePath,
      blockId
    };
    items.push({
      schemaVersion: DAILY_SCHEMA_VERSION,
      id: blockId,
      blockId,
      date,
      text: cleanTaskText(body),
      kind: normalizeKind(fields.kind),
      status,
      done: status === "done",
      sourcePath,
      line: index + 1,
      endLine: endIndex + 1,
      rawLine,
      rawBlock,
      revision,
      scheduledDate: DATE_RE.scheduled.exec(logicalSource)?.[1] ?? date,
      dueDate: DATE_RE.due.exec(logicalSource)?.[1] ?? date,
      completionDate: DATE_RE.completion.exec(logicalSource)?.[1],
      scheduledFor: normalizeScheduledFor(fields.at),
      devicePolicy: normalizePolicy(fields.device),
      priority: parsePriority(logicalSource),
      priorityExplicit: Boolean([...logicalSource.matchAll(PRIORITY_RE)][0]),
      tags: [...logicalSource.matchAll(TAG_RE)].map((tag) => tag[1]),
      linkedNotes: [...logicalSource.matchAll(LINK_RE)].map((link) => link[1].trim()).filter(Boolean)
    });
  }
  return items;
}

interface FormattedTask {
  id: string;
  text: string;
  kind: DailyPlanItemKind;
  devicePolicy: DailyDevicePolicy;
  priority?: DailyPlanPriority;
  priorityExplicit?: boolean;
  date: string;
  dueDate: string;
  scheduledFor?: string;
  tags: string[];
  status?: DailyPlanStatus;
  completionDate?: string;
}

function formatTaskLine(item: FormattedTask): string {
  const mark = item.status === "done" ? "x" : item.status === "in-progress" ? "/" : " ";
  const completed = item.status === "done" && item.completionDate ? ` ✅ ${item.completionDate}` : "";
  const priority = item.priority !== "normal" || item.priorityExplicit
    ? priorityEmoji(item.priority)
    : "";
  const at = item.scheduledFor ? ` [towrite-at:: ${item.scheduledFor}]` : "";
  const tags = item.tags.length ? ` ${item.tags.map((tag) => `#${tag}`).join(" ")}` : "";
  return `- [${mark}] ${item.text}${priority ? ` ${priority}` : ""} ⏳ ${item.date} 📅 ${item.dueDate}${completed}`
    + ` [towrite-kind:: ${item.kind}] [towrite-device:: ${item.devicePolicy}]${at}${tags} ^${item.id}`;
}

function cleanTaskText(body: string): string {
  let text = body.replace(BLOCK_RE, "");
  text = text.replace(FIELD_RE, "");
  text = text.replace(DATE_RE.scheduled, "").replace(DATE_RE.due, "").replace(DATE_RE.completion, "");
  text = text.replace(PRIORITY_RE, " ");
  text = text.replace(TAG_RE, "");
  return text.replace(/\s{2,}/gu, " ").trim();
}

function parseFields(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of body.matchAll(FIELD_RE)) {
    if (match.groups) result[match.groups.key.toLowerCase()] = match.groups.value.trim();
  }
  return result;
}

function parseTaskContinuation(
  line: string,
  parentIndentLength: number
): { kind: "fields" } | { kind: "block"; id: string } | undefined {
  const indent = /^\s*/u.exec(line)?.[0] ?? "";
  if (indent.length <= parentIndentLength) return undefined;
  const block = STANDALONE_BLOCK_RE.exec(line);
  if (block?.groups?.id) return { kind: "block", id: block.groups.id };
  const content = line.trim();
  if (!content) return undefined;
  const fields = [...content.matchAll(FIELD_RE)];
  if (fields.length === 0 || content.replace(FIELD_RE, "").trim()) return undefined;
  return { kind: "fields" };
}

function appendToSection(markdown: string, date: string, heading: string, line: string): string {
  const current = markdown.trim() ? markdown.replace(/\s+$/u, "") : initialDocument(date, heading).trimEnd();
  const lines = current.split(/\r?\n/u);
  let section = findSection(lines, heading);
  if (!section) {
    return `${current}\n\n## ${heading}\n\n${line}\n`;
  }
  while (section.end > section.start && !lines[section.end - 1].trim()) section.end -= 1;
  lines.splice(section.end, 0, line);
  return `${lines.join("\n").replace(/\s+$/u, "")}\n`;
}

function replaceSection(markdown: string, heading: string, body: string): string {
  const lines = markdown.replace(/\s+$/u, "").split(/\r?\n/u);
  const section = findSection(lines, heading);
  const replacement = [`## ${heading}`, "", body];
  if (!section) return `${lines.join("\n")}\n\n${replacement.join("\n")}\n`;
  lines.splice(section.heading, section.end - section.heading, ...replacement);
  return `${lines.join("\n").replace(/\s+$/u, "")}\n`;
}

function findSection(lines: string[], heading: string): { heading: number; start: number; end: number } | undefined {
  const wanted = heading.trim().toLowerCase();
  const headingIndex = lines.findIndex((line) => /^##(?!#)\s+/u.test(line)
    && line.replace(/^##(?!#)\s+/u, "").trim().toLowerCase() === wanted);
  if (headingIndex < 0) return undefined;
  let end = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (/^#{1,2}\s+/u.test(lines[index])) {
      end = index;
      break;
    }
  }
  return { heading: headingIndex, start: headingIndex + 1, end };
}

function initialDocument(date: string, heading: string): string {
  return `# ${date}\n\n## ${heading}\n`;
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

function normalizeRoot(value: string): string {
  const normalized = value.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Daily note root is invalid.");
  }
  return normalized;
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

function normalizeStatus(mark: string): DailyPlanStatus {
  if (mark.trim().toLowerCase() === "x") return "done";
  if (mark.trim() === "/" || mark.trim() === "-") return "in-progress";
  return "todo";
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

function normalizeTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value).trim().replace(/^#+/u, ""))
    .filter((value) => /^[\p{L}\p{N}_/-]+$/u.test(value)))].slice(0, 32);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function createDailyId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `daily_${globalThis.crypto.randomUUID().replace(/-/gu, "")}`;
  }
  const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(16));
  if (!bytes) throw new Error("Secure randomness is unavailable for daily plan ids.");
  return `daily_${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
