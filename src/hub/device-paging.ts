import type { EchoCard } from "./echo-cards";
import { echoCardLocalId } from "./echo-cards";
import type { DeviceLibraryEntry } from "./library";

export type DevicePagingAvailability = (localId: string) => boolean;
export type DevicePagingSourceType = "echo" | "question";

export interface DevicePagingPosition {
  localId?: string;
  sourceType?: DevicePagingSourceType;
  pageIndex?: number;
  pageNumber?: number;
  totalPages: number;
  inQueue: boolean;
}

/**
 * Builds the stable page order used by a device's "next" action.
 *
 * Echo cards are settings-backed saved cards, so their input order is the
 * user's configured order. They intentionally precede annotation entries.
 */
export function buildDevicePagingPool(
  echoCards: readonly EchoCard[],
  libraryEntries: readonly DeviceLibraryEntry[],
  isAvailable: DevicePagingAvailability = () => true
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const append = (localId: string): void => {
    if (!localId || seen.has(localId) || !isAvailable(localId)) return;
    seen.add(localId);
    result.push(localId);
  };

  for (const card of echoCards) {
    if (!card.inLibrary || !card.rotationEligible) continue;
    append(echoCardLocalId(card));
  }
  for (const entry of libraryEntries) {
    if (!entry.inLibrary || !entry.eligible || !entry.rotationEligible) continue;
    append(entry.id);
  }
  return result;
}

/** Returns the item after current and wraps the last item back to the first. */
export function nextDevicePagingItem(
  pool: readonly string[],
  currentId?: string
): string | undefined {
  if (pool.length === 0) return undefined;
  const currentIndex = currentId ? pool.indexOf(currentId) : -1;
  return currentIndex < 0 ? pool[0] : pool[(currentIndex + 1) % pool.length];
}

/**
 * Resolves a display position against the stable, unrotated paging pool.
 *
 * `pageIndex` is zero-based for protocol consumers while `pageNumber` is
 * one-based for UI copy. A manually previewed card may have a source type
 * without belonging to the paging queue.
 */
export function devicePagingPosition(
  pool: readonly string[],
  currentId?: string
): DevicePagingPosition {
  const localId = currentId?.trim() || undefined;
  const pageIndex = localId ? pool.indexOf(localId) : -1;
  const inQueue = pageIndex >= 0;
  return {
    localId,
    sourceType: localId
      ? (localId.startsWith("echo-card:") ? "echo" : "question")
      : undefined,
    pageIndex: inQueue ? pageIndex : undefined,
    pageNumber: inQueue ? pageIndex + 1 : undefined,
    totalPages: pool.length,
    inQueue
  };
}

/**
 * Rotates the stable queue so the explicitly preferred item is first. If it
 * is absent, the current item is used as the fallback anchor. Rotation keeps
 * the circular order intact, so cursor and server-side paging agree.
 */
export function prioritizeDevicePagingPool(
  pool: readonly string[],
  preferredId?: string,
  currentId?: string
): string[] {
  const promotedId = [preferredId, currentId]
    .find((candidate): candidate is string => Boolean(candidate && pool.includes(candidate)));
  if (!promotedId || pool[0] === promotedId) return [...pool];
  const start = pool.indexOf(promotedId);
  return [...pool.slice(start), ...pool.slice(0, start)];
}
