import type { PushFeedPayload, PushTargetSettings } from "./types";

export interface PushAdapter {
  id: string;
  supports(target: PushTargetSettings): boolean;
  deliver(feed: PushFeedPayload): Promise<void>;
}

export interface PushSchedulerOptions {
  getTargets(): PushTargetSettings[];
  getFeed(targetId: string): PushFeedPayload;
  markDelivered(targetId: string, feed: PushFeedPayload): Promise<void>;
  adapters: PushAdapter[];
}

export class PushScheduler {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private running = new Set<string>();

  constructor(private readonly options: PushSchedulerOptions) {}

  start(): void {
    this.stop();
    for (const target of this.options.getTargets().filter((item) => item.enabled)) {
      this.schedule(target);
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.running.clear();
  }

  restart(): void {
    this.stop();
    this.start();
  }

  async runTarget(targetId: string): Promise<void> {
    if (this.running.has(targetId)) {
      return;
    }
    const target = this.options.getTargets().find((item) => item.id === targetId && item.enabled);
    if (!target) {
      return;
    }
    const adapter = this.options.adapters.find((item) => item.supports(target));
    if (!adapter) {
      return;
    }

    this.running.add(targetId);
    try {
      const feed = this.options.getFeed(targetId);
      if (!feed.decision.candidateId || feed.decision.suppressedReason) {
        return;
      }
      await adapter.deliver(feed);
      await this.options.markDelivered(targetId, feed);
    } finally {
      this.running.delete(targetId);
    }
  }

  private schedule(target: PushTargetSettings): void {
    const delayMs = Math.max(15, target.refreshSeconds) * 1000;
    const timer = setTimeout(() => {
      this.timers.delete(target.id);
      void this.runTarget(target.id)
        .catch(() => undefined)
        .finally(() => {
          const next = this.options.getTargets().find((item) => item.id === target.id && item.enabled);
          if (next) {
            this.schedule(next);
          }
        });
    }, delayMs);
    this.timers.set(target.id, timer);
  }
}

