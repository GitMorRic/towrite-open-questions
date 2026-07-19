import { afterEach, describe, expect, it, vi } from "vitest";
import { DeferredKeyedQueue } from "./deferred-keyed-queue";

afterEach(() => vi.useRealTimers());

describe("DeferredKeyedQueue", () => {
  it("keeps the editor producer path synchronous and defers all async work", async () => {
    vi.useFakeTimers();
    const consume = vi.fn(async () => Promise.resolve());
    const queue = new DeferredKeyedQueue(consume, { delayMs: 900 });

    queue.enqueue("note.md", { editedAt: 1 });
    queue.enqueue("note.md", { editedAt: 2 });
    queue.enqueue("other.md", { editedAt: 3 });
    expect(consume).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(899);
    expect(consume).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledWith([{ editedAt: 2 }, { editedAt: 3 }]);
  });

  it("dispose cancels deferred persistence", async () => {
    vi.useFakeTimers();
    const consume = vi.fn();
    const queue = new DeferredKeyedQueue(consume, { delayMs: 10 });
    queue.enqueue("note.md", 1);
    queue.dispose();
    await vi.runAllTimersAsync();
    expect(consume).not.toHaveBeenCalled();
  });
});
