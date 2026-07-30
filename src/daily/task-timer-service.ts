import {
  DAILY_TIMER_SCHEMA_VERSION,
  type DailyTaskTimingReviewReason,
  type DailyTaskTimingSnapshot,
  type DailyTimerArchive,
  type DailyTimerCalendar,
  type DailyTimerCorrectionOptions,
  type DailyTimerEvent,
  type DailyTimerEventKind,
  type DailyTimerEventLog,
  type DailyTimerEventSource,
  type DailyTimerJournalPhase,
  type DailyTimerReconcileResult,
  type DailyTimerServiceOptions,
  type DailyTimerTransition,
  type DailyTimerTransitionAdapter,
  type DailyTimerTransitionJournal,
  type DailyTimerTransitionJournalEntry,
  type DailyTimerTransitionOptions
} from "./task-timer-types";
import { contentHash128 } from "../core/hash";

const DEFAULT_MAX_OPEN_SESSION_MS = 4 * 60 * 60 * 1_000;
const ABSOLUTE_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/u;

interface TaskAccumulator {
  taskId: string;
  status: DailyTaskTimingSnapshot["status"];
  activeMs: number;
  dailyActiveMs: Record<string, number>;
  interruptionCount: number;
  firstStartedAt?: string;
  lastTransitionAt?: string;
  completedAt?: string;
  activeSince?: string;
  activeSessionId?: string;
  reviewReasons: Set<DailyTaskTimingReviewReason>;
}

interface Reduction {
  tasks: Map<string, TaskAccumulator>;
  activeTaskId?: string;
}

export class DailyTimerValidationError extends Error {}
export class DailyTimerTransitionError extends Error {}
export class DailyTimerIdempotencyConflictError extends Error {}

export class DailyTaskTimerService {
  private events: DailyTimerEvent[] = [];
  private readonly now: () => Date;
  private readonly createId: NonNullable<DailyTimerServiceOptions["createId"]>;
  private readonly calendar: DailyTimerCalendar;
  private readonly maxOpenSessionMs: number;

  constructor(events: readonly DailyTimerEvent[] = [], options: DailyTimerServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? defaultCreateId;
    this.calendar = options.calendar ?? localTimerCalendar;
    this.maxOpenSessionMs = Math.max(1, options.maxOpenSessionMs ?? DEFAULT_MAX_OPEN_SESSION_MS);
    this.appendEvents(events);
  }

  getEvents(): DailyTimerEvent[] {
    return this.events.map(cloneEvent);
  }

  appendEvents(incoming: readonly DailyTimerEvent[]): { accepted: DailyTimerEvent[]; duplicateEventIds: string[] } {
    const accepted: DailyTimerEvent[] = [];
    const duplicateEventIds: string[] = [];
    const byId = new Map(this.events.map((event) => [event.eventId, event]));

    for (const value of incoming) {
      const event = normalizeAndValidateEvent(value);
      const existing = byId.get(event.eventId);
      if (existing) {
        if (!eventsEqual(existing, event)) {
          throw new DailyTimerIdempotencyConflictError(
            `Timer event ID ${event.eventId} was reused with different content.`
          );
        }
        duplicateEventIds.push(event.eventId);
        continue;
      }
      if (event.kind === "correct") {
        const target = byId.get(event.targetEventId!);
        if (!target) {
          throw new DailyTimerValidationError(`Correction target ${event.targetEventId} does not exist.`);
        }
        if (target.kind === "correct") {
          throw new DailyTimerValidationError("Correction events cannot target another correction.");
        }
        if (target.taskId !== event.taskId) {
          throw new DailyTimerValidationError("Correction event taskId must match its target.");
        }
      }
      byId.set(event.eventId, event);
      this.events.push(event);
      accepted.push(cloneEvent(event));
    }

    return { accepted, duplicateEventIds };
  }

  start(taskId: string, options: DailyTimerTransitionOptions = {}): DailyTimerTransition {
    const replay = this.replayIfPresent(taskId, "start", options);
    if (replay) return replay;
    const snapshot = this.getSnapshot(taskId, undefined, options.at);
    if (snapshot.status === "running") {
      return this.repeatOrReject(taskId, "start", options);
    }
    if (snapshot.status === "paused" || snapshot.status === "completed") {
      throw new DailyTimerTransitionError(`Task ${taskId} must be resumed or reopened instead of started.`);
    }
    return this.activate(taskId, "start", options);
  }

  pause(taskId: string, options: DailyTimerTransitionOptions = {}): DailyTimerTransition {
    return this.simpleTransition(taskId, "pause", options, ["running"], false);
  }

  resume(taskId: string, options: DailyTimerTransitionOptions = {}): DailyTimerTransition {
    const replay = this.replayIfPresent(taskId, "resume", options);
    if (replay) return replay;
    const snapshot = this.getSnapshot(taskId, undefined, options.at);
    if (snapshot.status === "running") {
      return this.repeatOrReject(taskId, "resume", options);
    }
    if (snapshot.status !== "paused") {
      throw new DailyTimerTransitionError(`Task ${taskId} is not paused.`);
    }
    return this.activate(taskId, "resume", options);
  }

  complete(taskId: string, options: DailyTimerTransitionOptions = {}): DailyTimerTransition {
    const snapshot = this.getSnapshot(taskId, undefined, options.at);
    if (snapshot.status === "completed") {
      return this.repeatOrReject(taskId, "complete", options);
    }
    return this.simpleTransition(taskId, "complete", options, ["running", "paused"], true);
  }

  /**
   * User-facing completion of a task that was never started. The strict
   * `complete()` transition remains unchanged: this composes a real start and
   * complete at the same instant, in one caller journal transaction. The
   * resulting session is auditable and contributes exactly zero active time.
   */
  startAndComplete(
    taskId: string,
    options: DailyTimerTransitionOptions = {}
  ): DailyTimerTransition {
    const replay = this.replayIfPresent(taskId, "complete", options);
    if (replay) return replay;
    const at = normalizeTimestamp(options.at ?? this.now());
    const eventId = normalizedIdentifier(options.eventId ?? this.createId("evt"), "eventId");
    const snapshot = this.getSnapshot(taskId, undefined, at);
    if (snapshot.status !== "not-started") {
      throw new DailyTimerTransitionError(
        `Task ${taskId} can only use startAndComplete while not-started.`
      );
    }
    const sessionId = normalizedIdentifier(options.sessionId ?? this.createId("ses"), "sessionId");
    const started = this.start(taskId, {
      ...options,
      at,
      eventId: `${eventId}:start`,
      sessionId
    });
    const completed = this.complete(taskId, {
      ...options,
      at,
      eventId,
      sessionId
    });
    return transitionResult(
      eventId,
      [...started.events, ...completed.events],
      unique([...started.affectedTaskIds, ...completed.affectedTaskIds]),
      false
    );
  }

  reopen(taskId: string, options: DailyTimerTransitionOptions = {}): DailyTimerTransition {
    return this.simpleTransition(taskId, "reopen", options, ["completed"], true);
  }

  reset(taskId: string, options: DailyTimerTransitionOptions = {}): DailyTimerTransition {
    return this.simpleTransition(taskId, "reset", options, [
      "not-started",
      "running",
      "paused",
      "completed"
    ], true);
  }

  clearTask(taskId: string, options: DailyTimerTransitionOptions = {}): DailyTimerTransition {
    return this.reset(taskId, options);
  }

  correct(targetEventId: string, options: DailyTimerCorrectionOptions): DailyTimerTransition {
    const target = this.events.find((event) => event.eventId === targetEventId);
    if (!target) throw new DailyTimerTransitionError(`Unknown timer event ${targetEventId}.`);
    if (target.kind === "correct") throw new DailyTimerTransitionError("Correction events cannot be corrected.");
    if (!options.replacementAt && !options.invalidateTarget) {
      throw new DailyTimerTransitionError("A correction must replace the timestamp or invalidate the target.");
    }
    const at = normalizeTimestamp(options.at ?? this.now());
    const eventId = normalizedIdentifier(options.eventId ?? this.createId("evt"), "eventId");
    const existing = this.events.find((event) => event.eventId === eventId);
    if (existing) {
      const result = this.idempotentTransition(existing, target.taskId, "correct", options);
      if (
        existing.targetEventId !== targetEventId
        || existing.replacementAt !== (
          options.replacementAt ? normalizeTimestamp(options.replacementAt) : undefined
        )
        || Boolean(existing.invalidateTarget) !== Boolean(options.invalidateTarget)
        || existing.reason !== normalizedReason(options.reason)
      ) {
        throw new DailyTimerIdempotencyConflictError(
          `Timer event ID ${existing.eventId} was reused with a different correction.`
        );
      }
      return result;
    }
    const event: DailyTimerEvent = {
      schemaVersion: DAILY_TIMER_SCHEMA_VERSION,
      eventId,
      taskId: target.taskId,
      sessionId: normalizedIdentifier(options.sessionId ?? target.sessionId, "sessionId"),
      kind: "correct",
      at,
      source: options.source ?? "obsidian",
      targetEventId,
      replacementAt: options.replacementAt ? normalizeTimestamp(options.replacementAt) : undefined,
      invalidateTarget: options.invalidateTarget || undefined,
      reason: normalizedReason(options.reason)
    };
    this.appendEvents([event]);
    return transitionResult(eventId, [event], [target.taskId], false);
  }

  getSnapshot(
    taskId: string,
    estimateMinutes?: number,
    asOf: Date | string = this.now()
  ): DailyTaskTimingSnapshot {
    taskId = normalizedIdentifier(taskId, "taskId");
    const asOfIso = normalizeTimestamp(asOf);
    const asOfMs = Date.parse(asOfIso);
    const reduction = this.reduce(asOfMs);
    const accumulator = reduction.tasks.get(taskId) ?? emptyAccumulator(taskId);
    return this.publicSnapshot(accumulator, estimateMinutes, asOfMs);
  }

  getSnapshots(
    estimates: Readonly<Record<string, number | undefined>> = {},
    asOf: Date | string = this.now()
  ): DailyTaskTimingSnapshot[] {
    const at = normalizeTimestamp(asOf);
    const atMs = Date.parse(at);
    const reduction = this.reduce(atMs);
    return [...reduction.tasks.values()]
      .map((task) => this.publicSnapshot(task, estimates[task.taskId], atMs))
      .sort((left, right) => left.taskId.localeCompare(right.taskId));
  }

  getActiveTaskId(asOf: Date | string = this.now()): string | undefined {
    return this.reduce(Date.parse(normalizeTimestamp(asOf))).activeTaskId;
  }

  exportJsonl(): string {
    return eventsToJsonl(this.events);
  }

  exportArchive(at: Date | string = this.now()): DailyTimerArchive {
    return {
      schemaVersion: DAILY_TIMER_SCHEMA_VERSION,
      createdAt: normalizeTimestamp(at),
      eventCount: this.events.length,
      jsonl: this.exportJsonl()
    };
  }

  private activate(
    taskId: string,
    kind: "start" | "resume",
    options: DailyTimerTransitionOptions
  ): DailyTimerTransition {
    taskId = normalizedIdentifier(taskId, "taskId");
    const at = normalizeTimestamp(options.at ?? this.now());
    const eventId = normalizedIdentifier(options.eventId ?? this.createId("evt"), "eventId");
    const existing = this.events.find((event) => event.eventId === eventId);
    if (existing) return this.idempotentTransition(existing, taskId, kind, options);
    const reduction = this.reduce(Date.parse(at));
    const events: DailyTimerEvent[] = [];
    const activeTaskId = reduction.activeTaskId;
    if (activeTaskId && activeTaskId !== taskId) {
      const active = reduction.tasks.get(activeTaskId);
      if (active?.activeSessionId) {
        events.push({
          schemaVersion: DAILY_TIMER_SCHEMA_VERSION,
          eventId: `${eventId}:auto-pause:${activeTaskId}`,
          taskId: activeTaskId,
          sessionId: active.activeSessionId,
          kind: "pause",
          at,
          source: options.source ?? "obsidian",
          automatic: true,
          relatedTaskId: taskId
        });
      }
    }
    const event: DailyTimerEvent = {
      schemaVersion: DAILY_TIMER_SCHEMA_VERSION,
      eventId,
      taskId,
      sessionId: normalizedIdentifier(options.sessionId ?? this.createId("ses"), "sessionId"),
      kind,
      at,
      source: options.source ?? "obsidian"
    };
    events.push(event);
    this.appendEvents(events);
    return transitionResult(eventId, events, unique(events.map((item) => item.taskId)), false);
  }

  private simpleTransition(
    taskId: string,
    kind: Exclude<DailyTimerEventKind, "start" | "resume" | "correct">,
    options: DailyTimerTransitionOptions,
    allowedStatuses: DailyTaskTimingSnapshot["status"][],
    allowFreshSession: boolean
  ): DailyTimerTransition {
    taskId = normalizedIdentifier(taskId, "taskId");
    const at = normalizeTimestamp(options.at ?? this.now());
    const eventId = normalizedIdentifier(options.eventId ?? this.createId("evt"), "eventId");
    const existing = this.events.find((event) => event.eventId === eventId);
    if (existing) return this.idempotentTransition(existing, taskId, kind, options);
    const snapshot = this.getSnapshot(taskId, undefined, at);
    if (!allowedStatuses.includes(snapshot.status)) {
      throw new DailyTimerTransitionError(`Task ${taskId} cannot ${kind} while ${snapshot.status}.`);
    }
    const sessionId = options.sessionId
      ?? snapshot.activeSessionId
      ?? latestSessionId(this.events, taskId)
      ?? (allowFreshSession ? this.createId("ses") : undefined);
    if (!sessionId) throw new DailyTimerTransitionError(`Task ${taskId} has no active timer session.`);
    const event: DailyTimerEvent = {
      schemaVersion: DAILY_TIMER_SCHEMA_VERSION,
      eventId,
      taskId,
      sessionId: normalizedIdentifier(sessionId, "sessionId"),
      kind,
      at,
      source: options.source ?? "obsidian"
    };
    this.appendEvents([event]);
    return transitionResult(eventId, [event], [taskId], false);
  }

  private repeatOrReject(
    taskId: string,
    expectedKind: DailyTimerEventKind,
    options: DailyTimerTransitionOptions
  ): DailyTimerTransition {
    if (!options.eventId) {
      throw new DailyTimerTransitionError(`Task ${taskId} is already in the requested state.`);
    }
    const existing = this.events.find((event) => event.eventId === options.eventId);
    if (!existing) throw new DailyTimerTransitionError(`Task ${taskId} is already in the requested state.`);
    return this.idempotentTransition(existing, taskId, expectedKind, options);
  }

  private idempotentTransition(
    existing: DailyTimerEvent,
    taskId: string,
    expectedKind: DailyTimerEventKind,
    options: DailyTimerTransitionOptions
  ): DailyTimerTransition {
    if (existing.taskId !== taskId || existing.kind !== expectedKind) {
      throw new DailyTimerIdempotencyConflictError(
        `Timer event ID ${existing.eventId} does not describe ${expectedKind} for ${taskId}.`
      );
    }
    if (
      (options.at !== undefined && existing.at !== normalizeTimestamp(options.at))
      || (options.sessionId !== undefined && existing.sessionId !== options.sessionId.trim())
      || existing.source !== (options.source ?? "obsidian")
    ) {
      throw new DailyTimerIdempotencyConflictError(
        `Timer event ID ${existing.eventId} was reused with different command data.`
      );
    }
    return transitionResult(existing.eventId, [], [taskId], true);
  }

  private replayIfPresent(
    taskId: string,
    expectedKind: DailyTimerEventKind,
    options: DailyTimerTransitionOptions
  ): DailyTimerTransition | undefined {
    if (!options.eventId) return undefined;
    const existing = this.events.find((event) => event.eventId === options.eventId);
    return existing ? this.idempotentTransition(existing, taskId, expectedKind, options) : undefined;
  }

  private reduce(asOfMs: number): Reduction {
    const effectiveEvents = effectiveTimerEvents(this.events);
    const tasks = new Map<string, TaskAccumulator>();
    let activeTaskId: string | undefined;

    const closeActive = (task: TaskAccumulator, endAt: string, interrupted: boolean) => {
      if (!task.activeSince) return;
      const startMs = Date.parse(task.activeSince);
      const endMs = Date.parse(endAt);
      const crossedMidnight = this.calendar.dateKey(endMs) !== this.calendar.dateKey(startMs);
      const exceededOpenLimit = endMs > startMs + this.maxOpenSessionMs;
      const effectiveEndMs = exceededOpenLimit
        ? startMs + this.maxOpenSessionMs
        : endMs;
      addInterval(task, task.activeSince, new Date(effectiveEndMs).toISOString(), this.calendar);
      if (crossedMidnight) task.reviewReasons.add("open-session-crossed-midnight");
      if (exceededOpenLimit) task.reviewReasons.add("open-session-over-4h");
      task.activeSince = undefined;
      task.activeSessionId = undefined;
      task.status = "paused";
      if (interrupted) task.interruptionCount += 1;
    };

    for (const event of effectiveEvents) {
      const eventMs = Date.parse(event.at);
      if (eventMs > asOfMs) break;
      const task = requireAccumulator(tasks, event.taskId);
      task.lastTransitionAt = event.at;

      if (event.kind === "reset") {
        if (activeTaskId === task.taskId) activeTaskId = undefined;
        tasks.set(task.taskId, emptyAccumulator(task.taskId));
        const resetTask = tasks.get(task.taskId)!;
        resetTask.lastTransitionAt = event.at;
        continue;
      }

      if (event.kind === "start" || event.kind === "resume") {
        if (activeTaskId && activeTaskId !== task.taskId) {
          const previous = tasks.get(activeTaskId);
          if (previous) closeActive(previous, event.at, true);
        }
        if (task.status === "running" && task.activeSince) {
          activeTaskId = task.taskId;
          continue;
        }
        task.status = "running";
        task.firstStartedAt ??= event.at;
        task.completedAt = undefined;
        task.activeSince = event.at;
        task.activeSessionId = event.sessionId;
        activeTaskId = task.taskId;
        continue;
      }

      if (event.kind === "pause") {
        if (task.status === "running") closeActive(task, event.at, true);
        if (activeTaskId === task.taskId) activeTaskId = undefined;
        continue;
      }

      if (event.kind === "complete") {
        if (task.status === "running") closeActive(task, event.at, false);
        task.status = "completed";
        task.completedAt = event.at;
        task.activeSince = undefined;
        task.activeSessionId = undefined;
        if (activeTaskId === task.taskId) activeTaskId = undefined;
        continue;
      }

      if (event.kind === "reopen") {
        task.status = "paused";
        task.completedAt = undefined;
        task.activeSince = undefined;
        task.activeSessionId = undefined;
      }
    }

    return { tasks, activeTaskId };
  }

  private publicSnapshot(
    source: TaskAccumulator,
    estimateMinutes: number | undefined,
    asOfMs: number
  ): DailyTaskTimingSnapshot {
    const task = cloneAccumulator(source);
    let wallEndMs: number | undefined;
    if (task.status === "running" && task.activeSince) {
      const startMs = Date.parse(task.activeSince);
      const nextMidnight = this.calendar.nextDayStart(startMs);
      const reviewEnd = Math.min(startMs + this.maxOpenSessionMs, nextMidnight);
      const effectiveEnd = Math.min(asOfMs, reviewEnd);
      if (effectiveEnd >= startMs) {
        addInterval(task, task.activeSince, new Date(effectiveEnd).toISOString(), this.calendar);
      }
      if (asOfMs > startMs + this.maxOpenSessionMs) {
        task.reviewReasons.add("open-session-over-4h");
      }
      if (this.calendar.dateKey(asOfMs) !== this.calendar.dateKey(startMs)) {
        task.reviewReasons.add("open-session-crossed-midnight");
      }
      wallEndMs = effectiveEnd;
    } else if (task.completedAt) {
      wallEndMs = Date.parse(task.completedAt);
    } else if (task.lastTransitionAt) {
      wallEndMs = Date.parse(task.lastTransitionAt);
    }
    const firstMs = task.firstStartedAt ? Date.parse(task.firstStartedAt) : undefined;
    const normalizedEstimate = normalizeEstimate(estimateMinutes);
    return {
      schemaVersion: DAILY_TIMER_SCHEMA_VERSION,
      taskId: task.taskId,
      status: task.status,
      activeMs: Math.max(0, Math.round(task.activeMs)),
      wallMs: firstMs === undefined || wallEndMs === undefined ? 0 : Math.max(0, wallEndMs - firstMs),
      interruptionCount: task.interruptionCount,
      firstStartedAt: task.firstStartedAt,
      lastTransitionAt: task.lastTransitionAt,
      completedAt: task.completedAt,
      activeSince: source.activeSince,
      activeSessionId: source.activeSessionId,
      estimateMinutes: normalizedEstimate,
      estimateDeltaMinutes: normalizedEstimate === undefined
        ? undefined
        : roundMinutes(task.activeMs) - normalizedEstimate,
      dailyActiveMs: { ...task.dailyActiveMs },
      needsReview: task.reviewReasons.size > 0,
      reviewReasons: [...task.reviewReasons].sort(),
      timingRevision: timingRevision(this.events, task.taskId)
    };
  }
}

export class InMemoryDailyTimerEventLog implements DailyTimerEventLog {
  private jsonl = "";
  readonly archives = new Map<string, string>();

  constructor(initialJsonl = "") {
    this.jsonl = initialJsonl;
  }

  async readJsonl(): Promise<string> {
    return this.jsonl;
  }

  async appendJsonl(jsonl: string): Promise<void> {
    if (!jsonl) return;
    if (this.jsonl && !this.jsonl.endsWith("\n")) this.jsonl += "\n";
    this.jsonl += jsonl.endsWith("\n") ? jsonl : `${jsonl}\n`;
  }

  async archive(name: string, jsonl: string): Promise<void> {
    this.archives.set(name, jsonl);
  }

  async clear(): Promise<void> {
    this.jsonl = "";
  }
}

export class PersistentDailyTaskTimer {
  private transitionTail: Promise<void> = Promise.resolve();

  private constructor(
    private service: DailyTaskTimerService,
    private readonly log: DailyTimerEventLog,
    private readonly options: DailyTimerServiceOptions
  ) {}

  static async load(
    log: DailyTimerEventLog,
    options: DailyTimerServiceOptions = {}
  ): Promise<PersistentDailyTaskTimer> {
    const events = parseDailyTimerJsonl(await log.readJsonl());
    return new PersistentDailyTaskTimer(new DailyTaskTimerService(events, options), log, options);
  }

  get core(): DailyTaskTimerService {
    return this.service;
  }

  async transition(
    operation: (draft: DailyTaskTimerService) => DailyTimerTransition
  ): Promise<DailyTimerTransition> {
    return this.withTransitionLock(async () => {
      const draft = new DailyTaskTimerService(this.service.getEvents(), this.options);
      const result = operation(draft);
      if (!result.idempotent && result.events.length > 0) {
        await this.log.appendJsonl(eventsToJsonl(result.events));
        this.service = draft;
      }
      return result;
    });
  }

  async appendEvents(events: readonly DailyTimerEvent[]): Promise<{ accepted: DailyTimerEvent[]; duplicateEventIds: string[] }> {
    return this.withTransitionLock(async () => {
      const draft = new DailyTaskTimerService(this.service.getEvents(), this.options);
      const result = draft.appendEvents(events);
      if (result.accepted.length > 0) {
        await this.log.appendJsonl(eventsToJsonl(result.accepted));
        this.service = draft;
      }
      return result;
    });
  }

  async archive(name = `task-timer-events-${Date.now()}.jsonl`): Promise<DailyTimerArchive> {
    const archive = this.service.exportArchive();
    await this.log.archive(name, archive.jsonl);
    return archive;
  }

  async archiveAndClear(
    confirmation: "CLEAR",
    name = `task-timer-events-${Date.now()}.jsonl`
  ): Promise<DailyTimerArchive> {
    if (confirmation !== "CLEAR") throw new DailyTimerTransitionError("Clearing the timer ledger requires confirmation.");
    const archive = await this.archive(name);
    await this.log.clear();
    this.service = new DailyTaskTimerService([], this.options);
    return archive;
  }

  exportJsonl(): string {
    return this.service.exportJsonl();
  }

  private async withTransitionLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.transitionTail;
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.transitionTail = previous.then(() => current);
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
    }
  }
}

export class InMemoryDailyTimerTransitionJournal implements DailyTimerTransitionJournal {
  private readonly entries = new Map<string, DailyTimerTransitionJournalEntry>();

  async list(): Promise<DailyTimerTransitionJournalEntry[]> {
    return [...this.entries.values()].map(cloneJournalEntry);
  }

  async put(entry: DailyTimerTransitionJournalEntry): Promise<void> {
    this.entries.set(entry.transactionId, cloneJournalEntry(entry));
  }

  async remove(transactionId: string): Promise<void> {
    this.entries.delete(transactionId);
  }
}

export class DailyTimerTransitionCoordinator {
  constructor(
    private readonly journal: DailyTimerTransitionJournal,
    private readonly adapter: DailyTimerTransitionAdapter,
    private readonly options: Pick<DailyTimerServiceOptions, "now" | "createId"> = {}
  ) {}

  async prepare(
    events: readonly DailyTimerEvent[],
    expectedMarkdownRevisions: Readonly<Record<string, string>>,
    transactionId = this.options.createId?.("txn") ?? defaultCreateId("txn")
  ): Promise<DailyTimerTransitionJournalEntry> {
    if (events.length === 0) throw new DailyTimerTransitionError("A timer transaction requires events.");
    transactionId = normalizedIdentifier(transactionId, "transactionId");
    const normalizedEvents = normalizeTransactionEvents(events);
    const existing = (await this.journal.list()).find((entry) => entry.transactionId === transactionId);
    if (existing) {
      if (
        JSON.stringify(existing.events) !== JSON.stringify(normalizedEvents)
        || JSON.stringify(existing.expectedMarkdownRevisions) !== JSON.stringify(expectedMarkdownRevisions)
      ) {
        throw new DailyTimerIdempotencyConflictError(
          `Timer transaction ID ${transactionId} was reused with different content.`
        );
      }
      return cloneJournalEntry(existing);
    }
    const now = normalizeTimestamp(this.options.now?.() ?? new Date());
    const entry: DailyTimerTransitionJournalEntry = {
      schemaVersion: DAILY_TIMER_SCHEMA_VERSION,
      transactionId,
      createdAt: now,
      updatedAt: now,
      phase: "prepared",
      expectedMarkdownRevisions: { ...expectedMarkdownRevisions },
      events: normalizedEvents
    };
    await this.journal.put(entry);
    return cloneJournalEntry(entry);
  }

  async execute(entry: DailyTimerTransitionJournalEntry): Promise<DailyTimerReconcileResult> {
    return this.reconcileEntry(entry);
  }

  async reconcilePending(): Promise<DailyTimerReconcileResult[]> {
    const entries = await this.journal.list();
    const results: DailyTimerReconcileResult[] = [];
    for (const entry of entries) results.push(await this.reconcileEntry(entry));
    return results;
  }

  /**
   * Administrative ledger operations must call this while holding the same
   * application transition lock used by prepare/execute. Otherwise clearing
   * the JSONL log could be followed by recovery replaying an older journal.
   */
  async assertNoPendingTransactions(): Promise<void> {
    const entries = await this.journal.list();
    if (entries.length > 0) {
      throw new DailyTimerTransitionError(
        `Cannot clear the task timer ledger while ${entries.length} transaction(s) are pending reconciliation.`
      );
    }
  }

  private async reconcileEntry(input: DailyTimerTransitionJournalEntry): Promise<DailyTimerReconcileResult> {
    let entry = cloneJournalEntry(input);
    if (entry.phase === "conflict") {
      return { transactionId: entry.transactionId, status: "conflict" };
    }
    if (entry.phase === "prepared") {
      if (!entry.expectedAfterMarkdownRevisions && this.adapter.predictMarkdownRevisions) {
        entry = {
          ...entry,
          expectedAfterMarkdownRevisions: {
            ...await this.adapter.predictMarkdownRevisions(entry)
          },
          updatedAt: normalizeTimestamp(this.options.now?.() ?? new Date())
        };
        await this.journal.put(entry);
      }
      const inspection = await this.adapter.inspectMarkdown(entry);
      if (inspection === "conflict") {
        entry = await this.updatePhase(entry, "conflict", "Markdown revision conflict.");
        return { transactionId: entry.transactionId, status: "conflict" };
      }
      if (inspection === "before") await this.adapter.applyMarkdown(entry);
      const appliedMarkdownRevisions = this.adapter.captureMarkdownRevisions
        ? await this.adapter.captureMarkdownRevisions(entry)
        : entry.appliedMarkdownRevisions;
      if (entry.expectedAfterMarkdownRevisions && appliedMarkdownRevisions
        && !sameRevisionMap(entry.expectedAfterMarkdownRevisions, appliedMarkdownRevisions)) {
        entry = await this.updatePhase(
          entry,
          "conflict",
          "Markdown after-state revision did not match the prepared full-block revision.",
          appliedMarkdownRevisions
        );
        return { transactionId: entry.transactionId, status: "conflict" };
      }
      entry = await this.updatePhase(entry, "markdown-applied", undefined, appliedMarkdownRevisions);
    }
    if (entry.phase === "markdown-applied") {
      const eventIds = entry.events.map((event) => event.eventId);
      if (!await this.adapter.hasTimerEvents(eventIds)) {
        await this.adapter.appendTimerEvents(entry.events);
      }
      entry = await this.updatePhase(entry, "ledger-applied");
    }
    if (entry.phase === "ledger-applied") await this.journal.remove(entry.transactionId);
    return { transactionId: entry.transactionId, status: "committed" };
  }

  private async updatePhase(
    entry: DailyTimerTransitionJournalEntry,
    phase: DailyTimerJournalPhase,
    error?: string,
    appliedMarkdownRevisions?: Record<string, string>
  ): Promise<DailyTimerTransitionJournalEntry> {
    const updated: DailyTimerTransitionJournalEntry = {
      ...entry,
      phase,
      error,
      ...(appliedMarkdownRevisions ? { appliedMarkdownRevisions: { ...appliedMarkdownRevisions } } : {}),
      updatedAt: normalizeTimestamp(this.options.now?.() ?? new Date())
    };
    await this.journal.put(updated);
    return updated;
  }
}

export function parseDailyTimerJsonl(jsonl: string): DailyTimerEvent[] {
  const events: DailyTimerEvent[] = [];
  const lines = jsonl.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new DailyTimerValidationError(`Invalid timer JSONL at line ${index + 1}.`);
    }
    events.push(normalizeAndValidateEvent(value));
  }
  // Reuse service validation to detect duplicate IDs with divergent payloads.
  return new DailyTaskTimerService(events).getEvents();
}

export function eventsToJsonl(events: readonly DailyTimerEvent[]): string {
  if (events.length === 0) return "";
  return `${events.map((event) => JSON.stringify(toCanonicalTimerRecord(
    normalizeAndValidateEvent(event)
  ))).join("\n")}\n`;
}

export function createFixedOffsetDailyTimerCalendar(offsetMinutes: number): DailyTimerCalendar {
  if (!Number.isFinite(offsetMinutes) || Math.abs(offsetMinutes) > 14 * 60) {
    throw new DailyTimerValidationError("Timer calendar offset must be within ±14 hours.");
  }
  const offsetMs = Math.round(offsetMinutes) * 60_000;
  return {
    dateKey(epochMs) {
      return new Date(epochMs + offsetMs).toISOString().slice(0, 10);
    },
    nextDayStart(epochMs) {
      const shifted = new Date(epochMs + offsetMs);
      return Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate() + 1
      ) - offsetMs;
    }
  };
}

const localTimerCalendar: DailyTimerCalendar = {
  dateKey(epochMs) {
    const date = new Date(epochMs);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  },
  nextDayStart(epochMs) {
    const date = new Date(epochMs);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  }
};

function effectiveTimerEvents(events: readonly DailyTimerEvent[]): DailyTimerEvent[] {
  const corrections = new Map<string, DailyTimerEvent>();
  for (const event of events) {
    if (event.kind === "correct" && event.targetEventId) corrections.set(event.targetEventId, event);
  }
  return events
    .map((event, sequence) => ({ event, sequence }))
    .filter(({ event }) => event.kind !== "correct")
    .flatMap(({ event, sequence }) => {
      const correction = corrections.get(event.eventId);
      if (correction?.invalidateTarget) return [];
      return [{
        event: correction?.replacementAt ? { ...event, at: correction.replacementAt } : event,
        sequence
      }];
    })
    .sort((left, right) => Date.parse(left.event.at) - Date.parse(right.event.at) || left.sequence - right.sequence)
    .map(({ event }) => event);
}

function addInterval(
  task: TaskAccumulator,
  startAt: string,
  endAt: string,
  calendar: DailyTimerCalendar
): void {
  let cursor = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (end < cursor) {
    task.reviewReasons.add("invalid-event-order");
    return;
  }
  task.activeMs += end - cursor;
  while (cursor < end) {
    const boundary = Math.min(end, calendar.nextDayStart(cursor));
    const date = calendar.dateKey(cursor);
    task.dailyActiveMs[date] = (task.dailyActiveMs[date] ?? 0) + Math.max(0, boundary - cursor);
    if (boundary <= cursor) break;
    cursor = boundary;
  }
}

function normalizeAndValidateEvent(value: unknown): DailyTimerEvent {
  if (!value || typeof value !== "object") throw new DailyTimerValidationError("Timer event must be an object.");
  const record = value as Record<string, unknown>;
  if (readTimerField(record, "schemaVersion", "schema_version") !== DAILY_TIMER_SCHEMA_VERSION) {
    throw new DailyTimerValidationError("Unsupported timer event schema version.");
  }
  const kind = record.kind;
  if (!isTimerKind(kind)) throw new DailyTimerValidationError("Invalid timer event kind.");
  const source = record.source;
  if (!isTimerSource(source)) throw new DailyTimerValidationError("Invalid timer event source.");
  const event: DailyTimerEvent = {
    schemaVersion: DAILY_TIMER_SCHEMA_VERSION,
    eventId: normalizedIdentifier(readTimerField(record, "eventId", "event_id"), "eventId"),
    taskId: normalizedIdentifier(readTimerField(record, "taskId", "task_id"), "taskId"),
    sessionId: normalizedIdentifier(readTimerField(record, "sessionId", "session_id"), "sessionId"),
    kind,
    at: normalizeTimestamp(record.at),
    source
  };
  if (record.automatic !== undefined) event.automatic = Boolean(record.automatic) || undefined;
  const relatedTaskId = readTimerField(record, "relatedTaskId", "related_task_id");
  if (relatedTaskId !== undefined && relatedTaskId !== "") {
    event.relatedTaskId = normalizedIdentifier(relatedTaskId, "relatedTaskId");
  }
  if (kind === "correct") {
    event.targetEventId = normalizedIdentifier(
      readTimerField(record, "targetEventId", "target_event_id"),
      "targetEventId"
    );
    const replacementAt = readTimerField(record, "replacementAt", "replacement_at");
    if (replacementAt !== undefined && replacementAt !== "") {
      event.replacementAt = normalizeTimestamp(replacementAt);
    }
    event.invalidateTarget = Boolean(
      readTimerField(record, "invalidateTarget", "invalidate_target")
    ) || undefined;
    event.reason = normalizedReason(record.reason);
    if (!event.replacementAt && !event.invalidateTarget) {
      throw new DailyTimerValidationError("Correction event has no effect.");
    }
  }
  return event;
}

function readTimerField(
  record: Record<string, unknown>,
  camelCase: string,
  snakeCase: string
): unknown {
  return record[camelCase] !== undefined ? record[camelCase] : record[snakeCase];
}

function toCanonicalTimerRecord(event: DailyTimerEvent): Record<string, unknown> {
  return {
    schema_version: event.schemaVersion,
    event_id: event.eventId,
    task_id: event.taskId,
    session_id: event.sessionId,
    kind: event.kind,
    at: event.at,
    source: event.source,
    ...(event.automatic ? { automatic: true } : {}),
    ...(event.relatedTaskId ? { related_task_id: event.relatedTaskId } : {}),
    ...(event.targetEventId ? { target_event_id: event.targetEventId } : {}),
    ...(event.replacementAt ? { replacement_at: event.replacementAt } : {}),
    ...(event.invalidateTarget ? { invalidate_target: true } : {}),
    ...(event.reason ? { reason: event.reason } : {})
  };
}

function normalizeTransactionEvents(events: readonly DailyTimerEvent[]): DailyTimerEvent[] {
  const normalized = events.map((event) => normalizeAndValidateEvent(event));
  const byId = new Map<string, DailyTimerEvent>();
  for (const event of normalized) {
    const existing = byId.get(event.eventId);
    if (existing && !eventsEqual(existing, event)) {
      throw new DailyTimerIdempotencyConflictError(
        `Timer event ID ${event.eventId} was reused with different content.`
      );
    }
    if (!existing) byId.set(event.eventId, event);
  }
  return [...byId.values()];
}

function normalizeTimestamp(value: unknown): string {
  const text = value instanceof Date ? value.toISOString() : typeof value === "string" ? value.trim() : "";
  if (!ABSOLUTE_ISO_RE.test(text) || !Number.isFinite(Date.parse(text))) {
    throw new DailyTimerValidationError("Timer timestamps must be absolute ISO-8601 values.");
  }
  return text;
}

function normalizedIdentifier(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DailyTimerValidationError(`${name} must be a non-empty string.`);
  }
  const result = value.trim();
  if (/[\r\n\u0000]/u.test(result)) throw new DailyTimerValidationError(`${name} contains invalid characters.`);
  return result;
}

function normalizedReason(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DailyTimerValidationError("A correction reason is required.");
  }
  return value.trim().slice(0, 500);
}

function isTimerKind(value: unknown): value is DailyTimerEventKind {
  return value === "start"
    || value === "pause"
    || value === "resume"
    || value === "complete"
    || value === "reopen"
    || value === "correct"
    || value === "reset";
}

function isTimerSource(value: unknown): value is DailyTimerEventSource {
  return value === "obsidian" || value === "device" || value === "nfc" || value === "backend";
}

function emptyAccumulator(taskId: string): TaskAccumulator {
  return {
    taskId,
    status: "not-started",
    activeMs: 0,
    dailyActiveMs: {},
    interruptionCount: 0,
    reviewReasons: new Set()
  };
}

function requireAccumulator(tasks: Map<string, TaskAccumulator>, taskId: string): TaskAccumulator {
  let result = tasks.get(taskId);
  if (!result) {
    result = emptyAccumulator(taskId);
    tasks.set(taskId, result);
  }
  return result;
}

function cloneAccumulator(value: TaskAccumulator): TaskAccumulator {
  return {
    ...value,
    dailyActiveMs: { ...value.dailyActiveMs },
    reviewReasons: new Set(value.reviewReasons)
  };
}

function latestSessionId(events: readonly DailyTimerEvent[], taskId: string): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].taskId === taskId) return events[index].sessionId;
  }
  return undefined;
}

function transitionResult(
  commandEventId: string,
  events: DailyTimerEvent[],
  affectedTaskIds: string[],
  idempotent: boolean
): DailyTimerTransition {
  return {
    commandEventId,
    events: events.map(cloneEvent),
    affectedTaskIds: [...affectedTaskIds],
    idempotent
  };
}

function cloneEvent(event: DailyTimerEvent): DailyTimerEvent {
  return { ...event };
}

function eventsEqual(left: DailyTimerEvent, right: DailyTimerEvent): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function normalizeEstimate(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function roundMinutes(milliseconds: number): number {
  return Math.round(milliseconds / 60_000 * 100) / 100;
}

function timingRevision(events: readonly DailyTimerEvent[], taskId: string): string {
  const targetIds = new Set(events.filter((event) => event.taskId === taskId).map((event) => event.eventId));
  const relevant = events.filter((event) =>
    event.taskId === taskId || (event.kind === "correct" && event.targetEventId && targetIds.has(event.targetEventId))
  );
  const material = relevant.map((event) => [
    event.eventId,
    event.kind,
    event.at,
    event.sessionId,
    event.targetEventId ?? "",
    event.replacementAt ?? ""
  ].join("\u0000")).join("\n");
  return `tmr_${contentHash128(material)}`;
}

function defaultCreateId(prefix: "evt" | "ses" | "txn"): string {
  const random = globalThis.crypto?.randomUUID?.().replaceAll("-", "")
    ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function cloneJournalEntry(entry: DailyTimerTransitionJournalEntry): DailyTimerTransitionJournalEntry {
  return {
    ...entry,
    expectedMarkdownRevisions: { ...entry.expectedMarkdownRevisions },
    ...(entry.expectedAfterMarkdownRevisions
      ? { expectedAfterMarkdownRevisions: { ...entry.expectedAfterMarkdownRevisions } }
      : {}),
    ...(entry.appliedMarkdownRevisions
      ? { appliedMarkdownRevisions: { ...entry.appliedMarkdownRevisions } }
      : {}),
    events: entry.events.map(cloneEvent)
  };
}

function sameRevisionMap(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>
): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every((key) => left[key] === right[key]);
}
