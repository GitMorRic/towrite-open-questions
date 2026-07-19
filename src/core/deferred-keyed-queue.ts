export interface DeferredKeyedQueueOptions {
  delayMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  onError?: (error: unknown) => void;
}

/**
 * Constant-time producer path for high-frequency editor signals. A key keeps
 * only its latest value; all async persistence and networking starts after the
 * debounce timer fires.
 */
export class DeferredKeyedQueue<T> {
  private readonly pending = new Map<string, T>();
  private readonly setTimer: NonNullable<DeferredKeyedQueueOptions["setTimer"]>;
  private readonly clearTimer: NonNullable<DeferredKeyedQueueOptions["clearTimer"]>;
  private readonly delayMs: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;

  constructor(
    private readonly consume: (values: readonly T[]) => void | Promise<void>,
    private readonly options: DeferredKeyedQueueOptions = {}
  ) {
    this.delayMs = Math.max(0, Math.floor(options.delayMs ?? 1_000));
    this.setTimer = options.setTimer ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimer ?? ((timer) => globalThis.clearTimeout(timer));
  }

  enqueue(key: string, value: T): void {
    this.pending.set(key, value);
    if (this.timer !== undefined) {
      return;
    }
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      void this.flush();
    }, this.delayMs);
  }

  async flush(): Promise<void> {
    if (this.running) {
      return this.running;
    }
    if (this.timer !== undefined) {
      this.clearTimer(this.timer);
      this.timer = undefined;
    }
    const values = [...this.pending.values()];
    this.pending.clear();
    if (values.length === 0) {
      return;
    }
    this.running = Promise.resolve(this.consume(values))
      .catch((error: unknown) => {
        this.options.onError?.(error);
      })
      .finally(() => {
        this.running = undefined;
        if (this.pending.size > 0 && this.timer === undefined) {
          this.timer = this.setTimer(() => {
            this.timer = undefined;
            void this.flush();
          }, this.delayMs);
        }
      });
    return this.running;
  }

  dispose(): void {
    if (this.timer !== undefined) {
      this.clearTimer(this.timer);
      this.timer = undefined;
    }
    this.pending.clear();
  }
}
