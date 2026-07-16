import { describe, expect, it, vi } from "vitest";
import { mapInBatches } from "./async-batch";

describe("mapInBatches", () => {
  it("preserves order, limits concurrency, and yields between batches", async () => {
    let active = 0;
    let maximumActive = 0;
    const release: Array<() => void> = [];
    const yielded = vi.fn(async () => undefined);
    const promise = mapInBatches([1, 2, 3, 4, 5], async (value) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => release.push(resolve));
      active -= 1;
      return value * 10;
    }, { batchSize: 2, yieldControl: yielded });

    await vi.waitFor(() => expect(release).toHaveLength(2));
    release.splice(0).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(release).toHaveLength(2));
    release.splice(0).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(release).toHaveLength(1));
    release.splice(0).forEach((resolve) => resolve());

    await expect(promise).resolves.toEqual([10, 20, 30, 40, 50]);
    expect(maximumActive).toBe(2);
    expect(yielded).toHaveBeenCalledTimes(2);
  });
});
