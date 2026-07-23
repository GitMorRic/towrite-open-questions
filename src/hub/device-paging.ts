import type { EchoCard } from "./echo-cards";
import { echoCardLocalId } from "./echo-cards";
import type { DeviceLibraryEntry } from "./library";

export type DevicePagingAvailability = (localId: string) => boolean;
export type DevicePagingSourceType = "daily-plan" | "daily-summary" | "echo" | "question";
export type DevicePagingLegacySourceType = Extract<DevicePagingSourceType, "echo" | "question">;
export type DevicePagingDailySourceType = Extract<DevicePagingSourceType, "daily-plan" | "daily-summary">;
export type DailyDevicePolicy = "none" | "manual" | "scheduled" | "rotation" | "agent";
export type DailyDevicePagingContentType = "daily_plan_item" | "daily_summary";

export interface DailyDevicePagingItem {
  /** DailyPlanItem id or a stable summary id such as its local date. */
  id: string;
  contentType: DailyDevicePagingContentType;
  devicePolicy: DailyDevicePolicy;
  /** Summaries may omit status; completed or skipped plan items are excluded. */
  status?: string;
}

export const DAILY_PLAN_LOCAL_ID_PREFIX = "daily-plan:";
export const DAILY_SUMMARY_LOCAL_ID_PREFIX = "daily-summary:";

export interface DevicePagingPosition {
  localId?: string;
  /** Legacy field consumed by existing Echo/question status surfaces. */
  sourceType?: DevicePagingLegacySourceType;
  /** Daily source is separate so old discriminated unions remain compatible. */
  dailySourceType?: DevicePagingDailySourceType;
  pageIndex?: number;
  pageNumber?: number;
  totalPages: number;
  inQueue: boolean;
}

/**
 * Builds the stable page order used by a device's "next" action.
 *
 * Daily rotation items lead the queue, followed by settings-backed Echo cards
 * and then annotation entries. Explicit manual/scheduled/agent Daily items are
 * promoted by the caller when selected; they do not silently join rotation.
 */
export function buildDevicePagingPool(
  echoCards: readonly EchoCard[],
  libraryEntries: readonly DeviceLibraryEntry[],
  isAvailable: DevicePagingAvailability = () => true,
  dailyItems: readonly DailyDevicePagingItem[] = []
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const append = (localId: string): void => {
    if (!localId || seen.has(localId) || !isAvailable(localId)) return;
    seen.add(localId);
    result.push(localId);
  };

  for (const item of dailyItems) {
    if (item.devicePolicy !== "rotation" || isFinishedDailyItem(item)) continue;
    append(dailyDevicePagingLocalId(item));
  }
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
  const resolvedSourceType = localId ? devicePagingSourceType(localId) : undefined;
  const source = resolvedSourceType === "daily-plan" || resolvedSourceType === "daily-summary"
    ? { dailySourceType: resolvedSourceType }
    : { sourceType: resolvedSourceType };
  return {
    localId,
    ...source,
    pageIndex: inQueue ? pageIndex : undefined,
    pageNumber: inQueue ? pageIndex + 1 : undefined,
    totalPages: pool.length,
    inQueue
  };
}

export function dailyDevicePagingLocalId(
  item: Pick<DailyDevicePagingItem, "id" | "contentType">
): string {
  const id = item.id.trim();
  if (!id) return "";
  return `${item.contentType === "daily_summary" ? DAILY_SUMMARY_LOCAL_ID_PREFIX : DAILY_PLAN_LOCAL_ID_PREFIX}${id}`;
}

export function devicePagingSourceType(localId: string): DevicePagingSourceType {
  if (localId.startsWith(DAILY_PLAN_LOCAL_ID_PREFIX)) return "daily-plan";
  if (localId.startsWith(DAILY_SUMMARY_LOCAL_ID_PREFIX)) return "daily-summary";
  return localId.startsWith("echo-card:") ? "echo" : "question";
}

function isFinishedDailyItem(item: DailyDevicePagingItem): boolean {
  return item.contentType === "daily_plan_item"
    && (item.status === "done" || item.status === "skipped");
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
