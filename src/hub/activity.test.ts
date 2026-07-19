import { afterEach, describe, expect, it, vi } from "vitest";
import { DebouncedActivityReporter, DebouncedHubConnector, HubActivityAccumulator } from "./activity";

afterEach(() => {
  vi.useRealTimers();
});

describe("Device Hub activity batching", () => {
  it("stores one content-free edit-presence window instead of keystroke events", () => {
    const accumulator = new HubActivityAccumulator();
    accumulator.recordEditPresence({ receiverId: "rcv_test", workflowStageId: "draft" }, new Date("2026-07-19T08:00:00Z"));
    accumulator.recordEditPresence({ receiverId: "rcv_test" }, new Date("2026-07-19T08:00:03Z"));

    expect(accumulator.peek()).toEqual({
      startedAt: "2026-07-19T08:00:00.000Z",
      lastActiveAt: "2026-07-19T08:00:03.000Z",
      hadEdit: true,
      receiverId: "rcv_test",
      workflowStageId: "draft"
    });
    expect(JSON.stringify(accumulator.peek())).not.toMatch(/path|body|selection|key|network|location/iu);
  });

  it("does no transport I/O in the editor event call stack and coalesces changes", async () => {
    vi.useFakeTimers();
    const sender = vi.fn(async () => undefined);
    let time = Date.parse("2026-07-19T08:00:00Z");
    const reporter = new DebouncedActivityReporter(sender, {
      debounceMs: 500,
      now: () => new Date(time),
      createId: () => "obs_test"
    });

    reporter.recordEditPresence({ receiverId: "rcv_test" });
    await vi.advanceTimersByTimeAsync(300);
    time += 300;
    reporter.recordEditPresence({ receiverId: "rcv_test" });

    expect(sender).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(499);
    expect(sender).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender).toHaveBeenCalledWith([expect.objectContaining({
      observationId: "obs_test",
      source: "obsidian_activity",
      state: "desk_focus",
      observedAt: "2026-07-19T08:00:00.300Z",
      receiverId: "rcv_test"
    })]);
  });

  it("retains a failed batch for delayed retry", async () => {
    vi.useFakeTimers();
    const sender = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    const errors: unknown[] = [];
    const connector = new DebouncedHubConnector(sender, {
      debounceMs: 10,
      retryDelayMs: 20,
      onError: (error) => errors.push(error)
    });
    connector.enqueue("event");

    await vi.advanceTimersByTimeAsync(10);
    expect(connector.pendingCount()).toBe(1);
    expect(errors).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(20);
    expect(sender).toHaveBeenCalledTimes(2);
    expect(connector.pendingCount()).toBe(0);
  });
});
