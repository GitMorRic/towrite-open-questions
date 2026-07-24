export const DAILY_TIMER_SCHEMA_VERSION = 1 as const;

export type DailyTimerEventKind =
  | "start"
  | "pause"
  | "resume"
  | "complete"
  | "reopen"
  | "correct"
  | "reset";

export type DailyTimerEventSource = "obsidian" | "device" | "nfc" | "backend";

export interface DailyTimerEvent {
  schemaVersion: typeof DAILY_TIMER_SCHEMA_VERSION;
  eventId: string;
  taskId: string;
  sessionId: string;
  kind: DailyTimerEventKind;
  /** Absolute ISO-8601 timestamp ending in Z or an explicit numeric offset. */
  at: string;
  source: DailyTimerEventSource;
  /** Set on the pause emitted when another task becomes active. */
  automatic?: boolean;
  relatedTaskId?: string;
  /** Correction events never mutate their target; they supersede it during replay. */
  targetEventId?: string;
  replacementAt?: string;
  invalidateTarget?: boolean;
  reason?: string;
}

export type DailyTaskTimingStatus = "not-started" | "running" | "paused" | "completed";

export type DailyTaskTimingReviewReason =
  | "open-session-over-4h"
  | "open-session-crossed-midnight"
  | "invalid-event-order";

export interface DailyTaskTimingSnapshot {
  schemaVersion: typeof DAILY_TIMER_SCHEMA_VERSION;
  taskId: string;
  status: DailyTaskTimingStatus;
  activeMs: number;
  wallMs: number;
  interruptionCount: number;
  firstStartedAt?: string;
  lastTransitionAt?: string;
  completedAt?: string;
  activeSince?: string;
  activeSessionId?: string;
  estimateMinutes?: number;
  estimateDeltaMinutes?: number;
  dailyActiveMs: Record<string, number>;
  needsReview: boolean;
  reviewReasons: DailyTaskTimingReviewReason[];
  timingRevision: string;
}

export interface DailyTimerTransition {
  commandEventId: string;
  events: DailyTimerEvent[];
  affectedTaskIds: string[];
  idempotent: boolean;
}

export interface DailyTimerTransitionOptions {
  eventId?: string;
  sessionId?: string;
  at?: Date | string;
  source?: DailyTimerEventSource;
}

export interface DailyTimerCorrectionOptions extends DailyTimerTransitionOptions {
  replacementAt?: Date | string;
  invalidateTarget?: boolean;
  reason: string;
}

export interface DailyTimerCalendar {
  dateKey(epochMs: number): string;
  nextDayStart(epochMs: number): number;
}

export interface DailyTimerServiceOptions {
  now?: () => Date;
  createId?: (prefix: "evt" | "ses" | "txn") => string;
  calendar?: DailyTimerCalendar;
  maxOpenSessionMs?: number;
}

export interface DailyTimerArchive {
  schemaVersion: typeof DAILY_TIMER_SCHEMA_VERSION;
  createdAt: string;
  eventCount: number;
  jsonl: string;
}

/**
 * Backend-agnostic storage boundary. Normal use is append-only. `clear` is
 * reserved for the explicit archive-and-clear administration operation.
 */
export interface DailyTimerEventLog {
  readJsonl(): Promise<string>;
  appendJsonl(jsonl: string): Promise<void>;
  archive(name: string, jsonl: string): Promise<void>;
  clear(): Promise<void>;
}

export type DailyTimerJournalPhase =
  | "prepared"
  | "markdown-applied"
  | "ledger-applied"
  | "conflict";

export interface DailyTimerTransitionJournalEntry {
  schemaVersion: typeof DAILY_TIMER_SCHEMA_VERSION;
  transactionId: string;
  createdAt: string;
  updatedAt: string;
  phase: DailyTimerJournalPhase;
  expectedMarkdownRevisions: Record<string, string>;
  /**
   * Deterministic full logical-block revisions persisted before applying
   * Markdown. Recovery must never infer success from checkbox status alone.
   */
  expectedAfterMarkdownRevisions?: Record<string, string>;
  /**
   * Exact opaque task + lineage revisions observed immediately after the
   * Markdown mutation. This lets crash recovery distinguish the intended
   * after-state from an unrelated edit that happens to use the same checkbox
   * status. It intentionally contains no task text or Vault path.
   */
  appliedMarkdownRevisions?: Record<string, string>;
  events: DailyTimerEvent[];
  error?: string;
}

export interface DailyTimerTransitionJournal {
  list(): Promise<DailyTimerTransitionJournalEntry[]>;
  put(entry: DailyTimerTransitionJournalEntry): Promise<void>;
  remove(transactionId: string): Promise<void>;
}

export type DailyTimerMarkdownInspection = "before" | "after" | "conflict";

/**
 * Integration boundary used to coordinate Markdown CAS and the timer ledger.
 * Implementations must make `appendTimerEvents` idempotent by event ID.
 */
export interface DailyTimerTransitionAdapter {
  /**
   * Predicts exact opaque revisions for the intended full logical blocks.
   * The coordinator persists them while still in `prepared`, before writing.
   */
  predictMarkdownRevisions?(
    entry: DailyTimerTransitionJournalEntry
  ): Promise<Record<string, string>>;
  inspectMarkdown(entry: DailyTimerTransitionJournalEntry): Promise<DailyTimerMarkdownInspection>;
  applyMarkdown(entry: DailyTimerTransitionJournalEntry): Promise<void>;
  /**
   * Captures exact opaque revisions after `applyMarkdown`. Older adapters may
   * omit this; their legacy journal entries retain status-only recovery.
   */
  captureMarkdownRevisions?(
    entry: DailyTimerTransitionJournalEntry
  ): Promise<Record<string, string>>;
  hasTimerEvents(eventIds: string[]): Promise<boolean>;
  appendTimerEvents(events: DailyTimerEvent[]): Promise<void>;
}

export interface DailyTimerReconcileResult {
  transactionId: string;
  status: "committed" | "conflict";
}
