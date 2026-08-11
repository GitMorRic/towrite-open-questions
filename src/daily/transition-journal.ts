import type {
  DailyAnalyticsBreakdown,
  DailyAnalyticsDay,
  DailyJournalDaySnapshot,
  DailyJournalMonthSnapshot,
  DailyTaskTransitionEvent
} from "./types";

export interface DailyTransitionEventLog {
  readJsonl(): Promise<string>;
  appendJsonl(value: string): Promise<void>;
}

/** Readable, append-only and idempotent local work-journal ledger. */
export class DailyTransitionJournal {
  private readonly events = new Map<string, DailyTaskTransitionEvent>();
  private tail: Promise<void> = Promise.resolve();

  private constructor(private readonly log: DailyTransitionEventLog) {}

  static async load(log: DailyTransitionEventLog): Promise<DailyTransitionJournal> {
    const journal = new DailyTransitionJournal(log);
    const text = await log.readJsonl();
    for (const line of text.split(/\r?\n/u)) {
      if (!line.trim()) continue;
      const event = normalizeEvent(JSON.parse(line) as unknown);
      journal.events.set(event.eventId, event);
    }
    return journal;
  }

  list(): DailyTaskTransitionEvent[] {
    return [...this.events.values()].sort((left, right) => left.at.localeCompare(right.at));
  }

  append(event: DailyTaskTransitionEvent): Promise<boolean> {
    return this.withLock(async () => {
      const normalized = normalizeEvent(event);
      if (this.events.has(normalized.eventId)) return false;
      await this.log.appendJsonl(`${JSON.stringify(normalized)}\n`);
      this.events.set(normalized.eventId, normalized);
      return true;
    });
  }

  day(date: string, analytics: DailyAnalyticsDay): DailyJournalDaySnapshot {
    const transitions = this.list().filter((event) => event.localDate === date);
    const migratedIn = transitions.filter((event) => event.kind === "migrate" && event.destinationDate === date).length;
    const migratedOut = transitions.filter((event) => event.kind === "migrate" && event.sourceDate === date).length;
    const returned = transitions.filter((event) => event.kind === "return").length;
    const abandoned = transitions.filter((event) => event.kind === "abandon").length;
    return {
      schemaVersion: 1,
      date,
      generatedAt: new Date().toISOString(),
      planned: analytics.planned,
      completed: analytics.completed,
      completionRate: analytics.completionRate,
      ...(analytics.firstStartedAt ? { firstStartedAt: analytics.firstStartedAt } : {}),
      ...(analytics.lastCompletedAt ? { lastCompletedAt: analytics.lastCompletedAt } : {}),
      activeMs: analytics.activeMs,
      pausedMs: analytics.pausedMs,
      interruptions: analytics.interruptions,
      unfinished: Math.max(0, analytics.planned - analytics.completed),
      migratedIn,
      migratedOut,
      returned,
      abandoned,
      byCategory: [],
      transitions
    };
  }

  month(month: string, analyticsDays: DailyAnalyticsDay[], byCategory: DailyAnalyticsBreakdown[]): DailyJournalMonthSnapshot {
    const days = analyticsDays.map((day) => ({ ...this.day(day.date, day), byCategory: [] }));
    const sum = <K extends keyof DailyJournalDaySnapshot>(key: K): number =>
      days.reduce((total, day) => total + (typeof day[key] === "number" ? day[key] : 0), 0);
    const planned = sum("planned");
    const completed = sum("completed");
    return {
      schemaVersion: 1,
      month,
      generatedAt: new Date().toISOString(),
      days,
      totals: {
        schemaVersion: 1,
        planned,
        completed,
        completionRate: planned > 0 ? completed / planned : 0,
        activeMs: sum("activeMs"),
        pausedMs: sum("pausedMs"),
        interruptions: sum("interruptions"),
        unfinished: sum("unfinished"),
        migratedIn: sum("migratedIn"),
        migratedOut: sum("migratedOut"),
        returned: sum("returned"),
        abandoned: sum("abandoned")
      },
      byCategory
    };
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release: (() => void) | undefined;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
    }
  }
}

function normalizeEvent(value: unknown): DailyTaskTransitionEvent {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || typeof value.eventId !== "string"
    || typeof value.taskId !== "string"
    || typeof value.kind !== "string"
    || !["schedule", "start", "pause", "resume", "complete", "reopen", "migrate", "return", "abandon"].includes(value.kind)
    || typeof value.at !== "string"
    || typeof value.localDate !== "string"
    || typeof value.title !== "string") {
    throw new Error("Daily transition event is invalid.");
  }
  return {
    schemaVersion: 1,
    eventId: value.eventId,
    taskId: value.taskId,
    kind: value.kind as DailyTaskTransitionEvent["kind"],
    at: value.at,
    localDate: value.localDate,
    title: value.title.slice(0, 240),
    ...(typeof value.sourceDate === "string" ? { sourceDate: value.sourceDate } : {}),
    ...(typeof value.destinationDate === "string" ? { destinationDate: value.destinationDate } : {}),
    ...(typeof value.category === "string" ? { category: value.category.slice(0, 120) } : {}),
    ...(typeof value.project === "string" ? { project: value.project.slice(0, 120) } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
