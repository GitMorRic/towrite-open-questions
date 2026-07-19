import type { HubContextObservation } from "./types";

export interface DebouncedHubConnectorOptions {
  debounceMs?: number;
  retryDelayMs?: number;
  maxBatchSize?: number;
  onError?: (error: unknown) => void;
}

/**
 * A transport-neutral queue. `enqueue` only mutates memory and arms a timer;
 * the supplied I/O callback can run only after the debounce boundary or an
 * explicit `flushNow()` call.
 */
export class DebouncedHubConnector<T> {
  private readonly debounceMs: number;
  private readonly retryDelayMs: number;
  private readonly maxBatchSize: number;
  private readonly onError?: (error: unknown) => void;
  private queue: T[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | undefined;
  private disposed = false;

  constructor(
    private readonly sendBatch: (items: readonly T[]) => Promise<void>,
    options: DebouncedHubConnectorOptions = {}
  ) {
    this.debounceMs = clampInteger(options.debounceMs ?? 1_500, 1, 60_000);
    this.retryDelayMs = clampInteger(options.retryDelayMs ?? 5_000, 1, 300_000);
    this.maxBatchSize = clampInteger(options.maxBatchSize ?? 20, 1, 100);
    this.onError = options.onError;
  }

  enqueue(item: T): void {
    if (this.disposed) {
      return;
    }
    this.queue.push(item);
    this.arm(this.debounceMs);
  }

  /** Move pending work to the trailing debounce boundary without adding data. */
  defer(): void {
    if (this.disposed || this.queue.length === 0 || this.inFlight) {
      return;
    }
    this.clearTimer();
    this.arm(this.debounceMs);
  }

  pendingCount(): number {
    return this.queue.length;
  }

  async flushNow(): Promise<void> {
    if (this.disposed && this.queue.length === 0) {
      return;
    }
    this.clearTimer();
    if (this.inFlight) {
      await this.inFlight;
      if (this.queue.length > 0) {
        await this.flushNow();
      }
      return;
    }
    const batch = this.queue.splice(0, this.maxBatchSize);
    if (batch.length === 0) {
      return;
    }
    this.inFlight = this.sendBatch(batch)
      .catch((error: unknown) => {
        this.queue.unshift(...batch);
        this.onError?.(error);
        if (!this.disposed) {
          this.arm(this.retryDelayMs);
        }
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    await this.inFlight;
    if (this.queue.length > 0 && !this.timer && !this.disposed) {
      this.arm(this.debounceMs);
    }
  }

  /** Stop future scheduled work. Pending items are retained for inspection. */
  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private arm(delayMs: number): void {
    if (this.timer || this.disposed) {
      return;
    }
    this.timer = globalThis.setTimeout(() => {
      this.timer = undefined;
      void this.flushNow();
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.timer) {
      globalThis.clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}

export interface HubActivityContext {
  receiverId?: string;
  articleTypeId?: string;
  workflowStageId?: string;
}

export interface HubActivityWindow extends HubActivityContext {
  startedAt: string;
  lastActiveAt: string;
  hadEdit: true;
}

/**
 * Coarse edit-presence accumulator. Deliberately accepts no file path, body,
 * selection, key, network, or location value, and never counts keystrokes.
 */
export class HubActivityAccumulator {
  private current: HubActivityWindow | undefined;

  recordEditPresence(context: HubActivityContext = {}, at = new Date()): void {
    const timestamp = at.toISOString();
    if (!this.current) {
      this.current = {
        startedAt: timestamp,
        lastActiveAt: timestamp,
        hadEdit: true,
        ...context
      };
      return;
    }
    this.current.lastActiveAt = timestamp;
    this.current.receiverId = context.receiverId ?? this.current.receiverId;
    this.current.articleTypeId = context.articleTypeId ?? this.current.articleTypeId;
    this.current.workflowStageId = context.workflowStageId ?? this.current.workflowStageId;
  }

  peek(): HubActivityWindow | undefined {
    return this.current ? { ...this.current } : undefined;
  }

  drain(): HubActivityWindow | undefined {
    const value = this.peek();
    this.current = undefined;
    return value;
  }
}

export interface DebouncedActivityReporterOptions {
  debounceMs?: number;
  ttlMs?: number;
  confidence?: number;
  now?: () => Date;
  createId?: () => string;
  onError?: (error: unknown) => void;
}

/** A one-observation reporter that coalesces an arbitrary number of editor changes. */
export class DebouncedActivityReporter {
  readonly accumulator = new HubActivityAccumulator();
  private readonly connector: DebouncedHubConnector<true>;
  private readonly ttlMs: number;
  private readonly confidence: number;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private scheduled = false;

  constructor(
    sendObservations: (observations: readonly HubContextObservation[]) => Promise<void>,
    options: DebouncedActivityReporterOptions = {}
  ) {
    this.ttlMs = clampInteger(options.ttlMs ?? 5 * 60_000, 1_000, 60 * 60_000);
    this.confidence = clampNumber(options.confidence ?? 0.8, 0, 1);
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? createObservationId;
    this.connector = new DebouncedHubConnector(async () => {
      const window = this.accumulator.peek();
      if (!window) {
        this.scheduled = false;
        return;
      }
      const observedAt = new Date(window.lastActiveAt);
      await sendObservations([{
        observationId: this.createId(),
        source: "obsidian_activity",
        state: "desk_focus",
        confidence: this.confidence,
        observedAt: observedAt.toISOString(),
        expiresAt: new Date(observedAt.getTime() + this.ttlMs).toISOString(),
        receiverId: window.receiverId
      }]);
      const latest = this.accumulator.peek();
      const changedWhileSending = latest?.lastActiveAt !== window.lastActiveAt;
      if (!changedWhileSending) {
        this.accumulator.drain();
      }
      this.scheduled = false;
      if (changedWhileSending) {
        this.scheduled = true;
        this.connector.enqueue(true);
      }
    }, {
      debounceMs: options.debounceMs,
      maxBatchSize: 1,
      onError: options.onError
    });
  }

  recordEditPresence(context: HubActivityContext = {}): void {
    this.accumulator.recordEditPresence(context, this.now());
    if (!this.scheduled) {
      this.scheduled = true;
      this.connector.enqueue(true);
    } else {
      // Continuous typing should remain an in-memory operation. Send the
      // coalesced observation only after the editor has been quiet.
      this.connector.defer();
    }
  }

  flushNow(): Promise<void> {
    return this.connector.flushNow();
  }

  dispose(): void {
    this.connector.dispose();
  }
}

function createObservationId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `obs_${globalThis.crypto.randomUUID().replace(/-/gu, "")}`;
  }
  const bytes = globalThis.crypto?.getRandomValues(new Uint8Array(16));
  if (!bytes) {
    throw new Error("Secure randomness is unavailable for Device Hub activity observations.");
  }
  return `obs_${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}
