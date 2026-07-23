import { shortHash } from "../core/hash";
import { buildDailySummary } from "./summary";
import {
  DAILY_SCHEMA_VERSION,
  type DailyActivityAggregate,
  type DailyActivityEvent,
  type DailyActivityExportBundle,
  type DailyActivityState,
  type DailyDashboardSnapshot,
  type DailyDocumentMeasurementRequest,
  type DailyFileMeasurementBaseline,
  type DailyPlanItem
} from "./types";

export const DAILY_RAW_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface DailyActivityServiceOptions {
  now?: () => Date;
  debounceMs?: number;
  /** Raw content-free event retention. Daily aggregates are not removed. */
  retentionDays?: number;
  language?: "zh" | "en";
  createId?: () => string;
  onChanged?: (state: DailyActivityState) => void | Promise<void>;
  onError?: (error: unknown) => void;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

interface PendingMeasurement extends DailyDocumentMeasurementRequest {
  at: Date;
  reason: "created" | "modified";
}

/**
 * Privacy-safe daily counters. The editor-facing scheduling method only
 * replaces one in-memory entry and arms a timer; content reads start after the
 * trailing debounce boundary or an explicit flush.
 */
export class DailyActivityService {
  private state: DailyActivityState;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly debounceMs: number;
  private readonly retentionMs: number;
  private readonly setTimer: NonNullable<DailyActivityServiceOptions["setTimer"]>;
  private readonly clearTimer: NonNullable<DailyActivityServiceOptions["clearTimer"]>;
  private readonly pending = new Map<string, PendingMeasurement>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private disposed = false;

  constructor(initial?: Partial<DailyActivityState> | unknown, private readonly options: DailyActivityServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? createActivityId;
    this.debounceMs = clampInteger(options.debounceMs ?? 1_500, 0, 60_000);
    this.retentionMs = clampInteger(options.retentionDays ?? 30, 1, 365) * 24 * 60 * 60 * 1000;
    this.setTimer = options.setTimer ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimer ?? ((timer) => globalThis.clearTimeout(timer));
    this.state = normalizeDailyActivityState(initial, this.now());
  }

  scheduleDocumentMeasurement(request: DailyDocumentMeasurementRequest): void {
    if (this.disposed || this.state.collectionPaused) return;
    const path = normalizePath(request.filePath);
    if (!path) return;
    const current = this.pending.get(path);
    this.pending.set(path, {
      ...request,
      filePath: path,
      at: validDate(request.at ?? this.now()),
      reason: current?.reason === "created" || request.reason === "created" ? "created" : "modified"
    });
    this.arm();
  }

  /** Drop a deleted file's numeric baseline; no Vault read is performed. */
  removeDocumentBaseline(filePath: string): boolean {
    const path = normalizePath(filePath);
    if (!path) return false;
    this.pending.delete(path);
    const fileKey = fileKeyForPath(path);
    if (!this.state.fileBaselines[fileKey]) return false;
    delete this.state.fileBaselines[fileKey];
    this.notify();
    return true;
  }

  /**
   * Preserve a baseline across a Vault rename so the next measurement records
   * only the actual text delta. Long-term aggregates retain opaque keys only.
   */
  renameDocumentBaseline(fromPath: string, toPath: string): boolean {
    const from = normalizePath(fromPath);
    const to = normalizePath(toPath);
    if (!from || !to || from === to) return false;
    this.pending.delete(from);
    const fromKey = fileKeyForPath(from);
    const toKey = fileKeyForPath(to);
    const baseline = this.state.fileBaselines[fromKey];
    if (!baseline) return false;
    if (fromKey === toKey) return true;
    this.state.fileBaselines[toKey] = { ...baseline, fileKey: toKey };
    delete this.state.fileBaselines[fromKey];
    for (const aggregate of Object.values(this.state.aggregates)) {
      const keys = aggregate.modifiedFileKeys ?? [];
      if (!keys.includes(fromKey)) continue;
      aggregate.modifiedFileKeys = [...new Set(keys.map((key) => key === fromKey ? toKey : key))];
      aggregate.notesModified = aggregate.modifiedFileKeys.length;
    }
    this.notify();
    return true;
  }

  async flushMeasurements(): Promise<void> {
    if (this.timer !== undefined) {
      this.clearTimer(this.timer);
      this.timer = undefined;
    }
    if (this.running) {
      await this.running;
      if (this.pending.size) await this.flushMeasurements();
      return;
    }
    const batch = [...this.pending.values()];
    this.pending.clear();
    if (!batch.length) return;
    this.running = this.consumeMeasurements(batch)
      .catch((error: unknown) => this.options.onError?.(error))
      .finally(() => { this.running = undefined; });
    await this.running;
    if (this.pending.size && !this.disposed) this.arm();
  }

  recordTaskCompleted(taskId: string, at = this.now(), eventId?: string): DailyActivityEvent | undefined {
    return this.recordNamedEvent("task-completed", "taskId", taskId, at, eventId);
  }

  recordQuestionResolved(questionId: string, at = this.now(), eventId?: string): DailyActivityEvent | undefined {
    return this.recordNamedEvent("question-resolved", "questionId", questionId, at, eventId);
  }

  recordCaptureCommitted(captureId: string, at = this.now(), eventId?: string): DailyActivityEvent | undefined {
    return this.recordNamedEvent("capture-committed", "captureId", captureId, at, eventId);
  }

  recordCardSelected(cardId: string, at = this.now(), eventId?: string): DailyActivityEvent | undefined {
    return this.recordNamedEvent("card-selected", "cardId", cardId, at, eventId);
  }

  recordCardDisplayed(cardId: string, at = this.now(), eventId?: string): DailyActivityEvent | undefined {
    return this.recordNamedEvent("card-displayed", "cardId", cardId, at, eventId);
  }

  recordEvent(event: DailyActivityEvent, now = this.now()): DailyActivityEvent | undefined {
    if (this.state.collectionPaused) return undefined;
    const normalized = normalizeEvent(event);
    if (!normalized) throw new Error("Invalid daily activity event.");
    const existing = this.state.events.find((item) => item.id === normalized.id);
    if (existing) return clone(existing);
    this.state.events.push(normalized);
    this.applyToAggregate(normalized);
    this.purge(now);
    this.notify();
    return clone(normalized);
  }

  setCollectionPaused(paused: boolean): void {
    this.state.collectionPaused = paused;
    if (paused) {
      this.pending.clear();
      if (this.timer !== undefined) this.clearTimer(this.timer);
      this.timer = undefined;
    }
    this.notify();
  }

  isCollectionPaused(): boolean {
    return this.state.collectionPaused;
  }

  getAggregate(value: Date | string = this.now()): DailyActivityAggregate {
    const date = dateKey(value);
    const aggregate = this.state.aggregates[date] ?? emptyAggregate(date, this.state.trackingStartedAt);
    return publicAggregate(aggregate);
  }

  getSnapshot(value: Date | string, items: readonly DailyPlanItem[]): DailyDashboardSnapshot {
    const date = dateKey(value);
    const activity = this.getAggregate(date);
    const copiedItems = clone(items.filter((item) => item.date === date));
    return {
      schemaVersion: DAILY_SCHEMA_VERSION,
      date,
      plan: {
        items: copiedItems,
        total: copiedItems.length,
        todo: copiedItems.filter((item) => item.status === "todo").length,
        inProgress: copiedItems.filter((item) => item.status === "in-progress").length,
        done: copiedItems.filter((item) => item.done).length
      },
      activity,
      summary: buildDailySummary(date, copiedItems, activity, this.now(), this.options.language),
      trackingStartedAt: this.state.trackingStartedAt
    };
  }

  purge(now = this.now()): number {
    const cutoff = validDate(now).getTime() - this.retentionMs;
    const before = this.state.events.length;
    this.state.events = this.state.events
      .filter((event) => Date.parse(event.at) >= cutoff)
      .sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id));
    return before - this.state.events.length;
  }

  exportBundle(now = this.now()): DailyActivityExportBundle {
    this.purge(now);
    const generatedAt = validDate(now).toISOString();
    return {
      schemaVersion: DAILY_SCHEMA_VERSION,
      generatedAt,
      files: {
        events: "daily/activity-events.jsonl",
        aggregates: "daily/activity.json"
      },
      eventsJsonl: this.state.events.map((event) => JSON.stringify(event)).join("\n"),
      aggregatesJson: JSON.stringify({
        schemaVersion: DAILY_SCHEMA_VERSION,
        generatedAt,
        collectionPaused: this.state.collectionPaused,
        trackingStartedAt: this.state.trackingStartedAt,
        days: Object.fromEntries(Object.entries(this.state.aggregates).map(([date, aggregate]) => [date, publicAggregate(aggregate)]))
      }, null, 2)
    };
  }

  clearActivityData(options: { preservePause?: boolean; now?: Date } = {}): void {
    const now = validDate(options.now ?? this.now()).toISOString();
    const paused = options.preservePause === false ? false : this.state.collectionPaused;
    this.pending.clear();
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
    this.state = {
      schemaVersion: DAILY_SCHEMA_VERSION,
      collectionPaused: paused,
      trackingStartedAt: now,
      events: [],
      aggregates: {},
      fileBaselines: {}
    };
    this.notify();
  }

  getState(): DailyActivityState {
    return clone(this.state);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
    this.pending.clear();
  }

  private async consumeMeasurements(batch: readonly PendingMeasurement[]): Promise<void> {
    for (const measurement of batch) {
      try {
        const content = await measurement.readContent();
        if (typeof content !== "string" || this.state.collectionPaused) continue;
        this.applyMeasurement(measurement, countVisibleWritingUnits(content));
      } catch (error) {
        this.options.onError?.(error);
      }
    }
  }

  private applyMeasurement(measurement: PendingMeasurement, units: number): void {
    const at = validDate(measurement.at);
    const fileKey = fileKeyForPath(measurement.filePath);
    const baseline = this.state.fileBaselines[fileKey];
    const localDate = localDateAt(at);
    if (measurement.reason === "created") {
      this.recordFileEvent("note-created", fileKey, at);
    } else {
      this.recordFileEvent("note-modified", fileKey, at);
    }
    const netUnits = baseline ? units - baseline.units : measurement.reason === "created" ? units : 0;
    const positiveUnits = Math.max(0, netUnits);
    if (positiveUnits || netUnits) {
      this.recordEvent({
        ...eventBase(this.createId(), "writing-measured", at),
        kind: "writing-measured",
        localDate,
        fileKey,
        positiveUnits,
        netUnits
      });
    }
    this.state.fileBaselines[fileKey] = {
      fileKey,
      units,
      measuredAt: at.toISOString()
    };
    if (!baseline && measurement.reason !== "created") {
      const aggregate = this.requireAggregate(localDate);
      aggregate.trackingComplete = false;
    }
    this.notify();
  }

  private recordFileEvent(kind: "note-created" | "note-modified", fileKey: string, at: Date): void {
    const date = localDateAt(at);
    this.recordEvent({
      ...eventBase(`${kind}_${fileKey}_${date}`, kind, at),
      kind,
      fileKey
    });
  }

  private recordNamedEvent(
    kind: "task-completed" | "question-resolved" | "capture-committed" | "card-selected" | "card-displayed",
    key: "taskId" | "questionId" | "captureId" | "cardId",
    value: string,
    at: Date,
    eventId?: string
  ): DailyActivityEvent | undefined {
    const normalized = normalizeName(value);
    if (!normalized) throw new Error(`Daily ${key} is empty.`);
    const date = validDate(at);
    const localDate = localDateAt(date);
    if (kind === "task-completed") {
      const existing = this.state.events.find((item) => item.kind === "task-completed"
        && item.taskId === normalized
        && item.localDate === localDate);
      if (existing) return clone(existing);
    }
    const defaultId = kind === "card-selected" || kind === "card-displayed"
      ? this.createId()
      : `${kind}_${shortHash(`${normalized}|${localDate}`)}`;
    const event = {
      ...eventBase(eventId ?? defaultId, kind, date),
      kind,
      [key]: normalized
    } as DailyActivityEvent;
    return this.recordEvent(event, date);
  }

  private applyToAggregate(event: DailyActivityEvent): void {
    const aggregate = this.requireAggregate(event.localDate);
    if (event.kind === "writing-measured") {
      aggregate.positiveWritingUnits += event.positiveUnits;
      aggregate.netWritingUnits += event.netUnits;
    } else if (event.kind === "note-created") {
      aggregate.notesCreated += 1;
    } else if (event.kind === "note-modified") {
      const keys = aggregate.modifiedFileKeys ?? [];
      if (!keys.includes(event.fileKey)) keys.push(event.fileKey);
      aggregate.modifiedFileKeys = keys;
      aggregate.notesModified = keys.length;
    } else if (event.kind === "task-completed") {
      aggregate.tasksCompleted += 1;
    } else if (event.kind === "question-resolved") {
      aggregate.questionsResolved += 1;
    } else if (event.kind === "capture-committed") {
      aggregate.capturesCommitted += 1;
    } else if (event.kind === "card-selected") {
      aggregate.cardsSelected += 1;
    } else if (event.kind === "card-displayed") {
      aggregate.cardsDisplayed += 1;
    }
  }

  private requireAggregate(date: string): DailyActivityAggregate & { modifiedFileKeys?: string[] } {
    return this.state.aggregates[date] ??= emptyAggregate(date, this.state.trackingStartedAt);
  }

  private arm(): void {
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      void this.flushMeasurements();
    }, this.debounceMs);
  }

  private notify(): void {
    if (!this.options.onChanged) return;
    void Promise.resolve(this.options.onChanged(this.getState())).catch((error: unknown) => this.options.onError?.(error));
  }
}

export function countVisibleWritingUnits(markdown: string): number {
  const text = stripMarkdownForWritingUnits(markdown);
  const cjk = [...text].filter((character) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character)).length;
  const withoutCjk = [...text]
    .map((character) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character) ? " " : character)
    .join("");
  const words = withoutCjk.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  return cjk + words;
}

export function stripMarkdownForWritingUnits(markdown: string): string {
  let text = String(markdown ?? "").replace(/\r\n?/gu, "\n");
  text = text.replace(/^---\n[\s\S]*?\n---(?:\n|$)/u, "");
  text = text.replace(/<!--[\s\S]*?-->/gu, " ");
  text = text.replace(/```[^\n]*\n|```|~~~[^\n]*\n|~~~/gu, " ");
  text = text.replace(/!\[\[([^\]]+)\]\]/gu, " ");
  text = text.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/gu, (_match, target: string, label?: string) => label ?? target);
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/gu, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1");
  text = text.replace(/^\s{0,3}(?:#{1,6}|>|[-+*]\s+|\d+[.)]\s+|\[[ xX/-]\]\s*)/gmu, "");
  text = text.replace(/\[(?:towrite-[\w-]+|scheduled|due|completion|reminder)::[^\]]*\]/giu, " ");
  text = text.replace(/[⏳📅✅⏰]\s+\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2})?/gu, " ");
  text = text.replace(/\s+\^[A-Za-z0-9_-]+\s*$/gmu, "");
  text = text.replace(/[*_~`]/gu, "");
  return text.replace(/https?:\/\/\S+/gu, " ").replace(/\s+/gu, " ").trim();
}

export function normalizeDailyActivityState(input: unknown, now = new Date()): DailyActivityState {
  const record = asRecord(input);
  const trackingStartedAt = normalizeIso(record?.trackingStartedAt) ?? validDate(now).toISOString();
  const events = Array.isArray(record?.events)
    ? record.events.map(normalizeEvent).filter((event): event is DailyActivityEvent => Boolean(event))
    : [];
  const aggregates: DailyActivityState["aggregates"] = {};
  const rawAggregates = asRecord(record?.aggregates);
  for (const [date, value] of Object.entries(rawAggregates ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) continue;
    const item = asRecord(value);
    aggregates[date] = {
      date,
      positiveWritingUnits: nonNegative(item?.positiveWritingUnits),
      netWritingUnits: integer(item?.netWritingUnits),
      notesCreated: nonNegative(item?.notesCreated),
      notesModified: nonNegative(item?.notesModified),
      tasksCompleted: nonNegative(item?.tasksCompleted),
      questionsResolved: nonNegative(item?.questionsResolved),
      capturesCommitted: nonNegative(item?.capturesCommitted),
      cardsSelected: nonNegative(item?.cardsSelected),
      cardsDisplayed: nonNegative(item?.cardsDisplayed),
      trackingComplete: item?.trackingComplete === true,
      modifiedFileKeys: Array.isArray(item?.modifiedFileKeys)
        ? [...new Set(item.modifiedFileKeys.map(normalizeName).filter(Boolean) as string[])]
        : []
    };
  }
  const fileBaselines: Record<string, DailyFileMeasurementBaseline> = {};
  for (const [key, value] of Object.entries(asRecord(record?.fileBaselines) ?? {})) {
    const baseline = asRecord(value);
    const measuredAt = normalizeIso(baseline?.measuredAt);
    if (!/^file_[a-z0-9]+$/u.test(key) || !measuredAt) continue;
    fileBaselines[key] = { fileKey: key, units: nonNegative(baseline?.units), measuredAt };
  }
  return {
    schemaVersion: DAILY_SCHEMA_VERSION,
    collectionPaused: record?.collectionPaused === true,
    trackingStartedAt,
    events: dedupeEvents(events),
    aggregates,
    fileBaselines
  };
}

function normalizeEvent(value: unknown): DailyActivityEvent | undefined {
  const record = asRecord(value);
  const kind = normalizeName(record?.kind);
  const id = normalizeName(record?.id);
  const at = normalizeIso(record?.at);
  const localDate = typeof record?.localDate === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(record.localDate) ? record.localDate : undefined;
  if (!record || !kind || !id || !at || !localDate) return undefined;
  const base = {
    id,
    at,
    localDate,
    timezoneOffsetMinutes: clampInteger(Number(record.timezoneOffsetMinutes), -840, 840)
  };
  if (kind === "writing-measured") {
    const fileKey = normalizeName(record.fileKey);
    if (!fileKey) return undefined;
    return { ...base, kind, fileKey, positiveUnits: nonNegative(record.positiveUnits), netUnits: integer(record.netUnits) };
  }
  if (kind === "note-created" || kind === "note-modified") {
    const fileKey = normalizeName(record.fileKey);
    return fileKey ? { ...base, kind, fileKey } : undefined;
  }
  if (kind === "task-completed") {
    const taskId = normalizeName(record.taskId);
    return taskId ? { ...base, kind, taskId } : undefined;
  }
  if (kind === "question-resolved") {
    const questionId = normalizeName(record.questionId);
    return questionId ? { ...base, kind, questionId } : undefined;
  }
  if (kind === "capture-committed") {
    const captureId = normalizeName(record.captureId);
    return captureId ? { ...base, kind, captureId } : undefined;
  }
  if (kind === "card-selected" || kind === "card-displayed") {
    const cardId = normalizeName(record.cardId);
    return cardId ? { ...base, kind, cardId } : undefined;
  }
  return undefined;
}

function eventBase(id: string, kind: DailyActivityEvent["kind"], at: Date) {
  const value = validDate(at);
  return {
    id,
    kind,
    at: value.toISOString(),
    localDate: localDateAt(value),
    timezoneOffsetMinutes: -value.getTimezoneOffset()
  };
}

function emptyAggregate(date: string, trackingStartedAt: string): DailyActivityAggregate & { modifiedFileKeys: string[] } {
  return {
    date,
    positiveWritingUnits: 0,
    netWritingUnits: 0,
    notesCreated: 0,
    notesModified: 0,
    tasksCompleted: 0,
    questionsResolved: 0,
    capturesCommitted: 0,
    cardsSelected: 0,
    cardsDisplayed: 0,
    trackingComplete: date > localDateAt(new Date(trackingStartedAt)),
    modifiedFileKeys: []
  };
}

function publicAggregate(value: DailyActivityAggregate): DailyActivityAggregate {
  const { date, positiveWritingUnits, netWritingUnits, notesCreated, notesModified, tasksCompleted,
    questionsResolved, capturesCommitted, cardsSelected, cardsDisplayed, trackingComplete } = value;
  return { date, positiveWritingUnits, netWritingUnits, notesCreated, notesModified, tasksCompleted,
    questionsResolved, capturesCommitted, cardsSelected, cardsDisplayed, trackingComplete };
}

function dateKey(value: Date | string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)) return value;
  const parsed = value instanceof Date ? value : new Date(value);
  return localDateAt(validDate(parsed));
}

function localDateAt(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

function normalizePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "").trim();
  return result && !result.split("/").some((part) => part === "..") ? result : undefined;
}

function fileKeyForPath(path: string): string {
  return `file_${shortHash(path.toLowerCase())}`;
}

function normalizeName(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const result = String(value).trim().replace(/\s+/gu, " ").slice(0, 240);
  return result || undefined;
}

function normalizeIso(value: unknown): string | undefined {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function validDate(value: Date): Date {
  return Number.isFinite(value.getTime()) ? value : new Date();
}

function nonNegative(value: unknown): number {
  return Math.max(0, integer(value));
}

function integer(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? Math.floor(value) : min));
}

function dedupeEvents(events: DailyActivityEvent[]): DailyActivityEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => !seen.has(event.id) && Boolean(seen.add(event.id)))
    .sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id));
}

function createActivityId(): string {
  if (globalThis.crypto?.randomUUID) return `dayevt_${globalThis.crypto.randomUUID().replace(/-/gu, "")}`;
  const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(16));
  if (!bytes) throw new Error("Secure randomness is unavailable for daily activity ids.");
  return `dayevt_${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
