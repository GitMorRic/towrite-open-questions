import { DailyTaskTimerService, DailyTimerValidationError } from "./task-timer-service";
import {
  DAILY_TIMER_SCHEMA_VERSION,
  type DailyTimerTransitionJournal,
  type DailyTimerTransitionJournalEntry
} from "./task-timer-types";

export interface JsonDailyTimerTransitionJournalStorage {
  readText(): Promise<string | undefined>;
  writeText(value: string): Promise<void>;
}

/**
 * Small readable crash journal. It contains only task IDs, opaque revisions,
 * timer events, and phases—never task text, note paths, or Capture bodies.
 */
export class JsonDailyTimerTransitionJournal implements DailyTimerTransitionJournal {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly storage: JsonDailyTimerTransitionJournalStorage) {}

  list(): Promise<DailyTimerTransitionJournalEntry[]> {
    return this.withLock(async () => this.readUnlocked());
  }

  put(entry: DailyTimerTransitionJournalEntry): Promise<void> {
    return this.withLock(async () => {
      const entries = await this.readUnlocked();
      const index = entries.findIndex((item) => item.transactionId === entry.transactionId);
      const normalized = normalizeEntry(entry);
      if (index >= 0) entries[index] = normalized;
      else entries.push(normalized);
      await this.writeUnlocked(entries);
    });
  }

  remove(transactionId: string): Promise<void> {
    return this.withLock(async () => {
      const entries = await this.readUnlocked();
      const next = entries.filter((entry) => entry.transactionId !== transactionId);
      if (next.length !== entries.length) await this.writeUnlocked(next);
    });
  }

  private async readUnlocked(): Promise<DailyTimerTransitionJournalEntry[]> {
    const text = (await this.storage.readText())?.trim();
    if (!text) return [];
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new DailyTimerValidationError("Task timer transaction journal is not valid JSON.");
    }
    const records = Array.isArray(value)
      ? value
      : isRecord(value) && Array.isArray(value.entries) ? value.entries : undefined;
    if (!records) throw new DailyTimerValidationError("Task timer transaction journal has an invalid shape.");
    return records.map((entry) => normalizeEntry(entry));
  }

  private async writeUnlocked(entries: readonly DailyTimerTransitionJournalEntry[]): Promise<void> {
    await this.storage.writeText(`${JSON.stringify({
      schemaVersion: DAILY_TIMER_SCHEMA_VERSION,
      entries
    }, null, 2)}\n`);
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release: (() => void) | undefined;
    this.tail = new Promise<void>((resolve) => {
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

function normalizeEntry(value: unknown): DailyTimerTransitionJournalEntry {
  if (!isRecord(value)
    || value.schemaVersion !== DAILY_TIMER_SCHEMA_VERSION
    || typeof value.transactionId !== "string"
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
    || !["prepared", "markdown-applied", "ledger-applied", "conflict"].includes(String(value.phase))
    || !isRecord(value.expectedMarkdownRevisions)
    || !Array.isArray(value.events)) {
    throw new DailyTimerValidationError("Task timer transaction journal entry is invalid.");
  }
  const expectedMarkdownRevisions = Object.fromEntries(
    Object.entries(value.expectedMarkdownRevisions).filter(
      (entry): entry is [string, string] => Boolean(entry[0]) && typeof entry[1] === "string"
    )
  );
  if (Object.keys(expectedMarkdownRevisions).length !== Object.keys(value.expectedMarkdownRevisions).length) {
    throw new DailyTimerValidationError("Task timer transaction revisions are invalid.");
  }
  const appliedMarkdownRevisions = value.appliedMarkdownRevisions === undefined
    ? undefined
    : normalizeRevisionMap(value.appliedMarkdownRevisions);
  const expectedAfterMarkdownRevisions = value.expectedAfterMarkdownRevisions === undefined
    ? undefined
    : normalizeRevisionMap(value.expectedAfterMarkdownRevisions);
  const events = new DailyTaskTimerService(value.events as never[]).getEvents();
  return {
    schemaVersion: DAILY_TIMER_SCHEMA_VERSION,
    transactionId: value.transactionId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    phase: value.phase as DailyTimerTransitionJournalEntry["phase"],
    expectedMarkdownRevisions,
    ...(expectedAfterMarkdownRevisions ? { expectedAfterMarkdownRevisions } : {}),
    ...(appliedMarkdownRevisions ? { appliedMarkdownRevisions } : {}),
    events,
    ...(typeof value.error === "string" ? { error: value.error } : {})
  };
}

function normalizeRevisionMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    throw new DailyTimerValidationError("Task timer applied revisions are invalid.");
  }
  const revisions = Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => Boolean(entry[0]) && typeof entry[1] === "string"
    )
  );
  if (Object.keys(revisions).length !== Object.keys(value).length) {
    throw new DailyTimerValidationError("Task timer applied revisions are invalid.");
  }
  return revisions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
