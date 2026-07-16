export interface BatchMapOptions {
  batchSize?: number;
  yieldControl?: () => Promise<void>;
}

/**
 * Limits concurrent Vault reads and yields between CPU-heavy parse batches so
 * startup indexing cannot monopolize Obsidian's renderer thread.
 */
export async function mapInBatches<T, R>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<R> | R,
  options: BatchMapOptions = {}
): Promise<R[]> {
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? 8));
  const yieldControl = options.yieldControl ?? yieldToEventLoop;
  const results: R[] = [];

  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);
    results.push(...await Promise.all(batch.map((item, offset) => mapper(item, start + offset))));
    if (start + batchSize < items.length) {
      await yieldControl();
    }
  }

  return results;
}

export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}
