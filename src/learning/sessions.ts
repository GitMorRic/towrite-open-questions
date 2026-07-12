import type { ActivityEvent, SessionSummary, ThreeHourTimeWindow } from "./types";

export const SESSION_IDLE_MS = 5 * 60 * 1000;

interface MutableSession {
  first: ActivityEvent;
  last: ActivityEvent;
  lastActiveAt: string;
  hadEdit: boolean;
  articleTypeIds: string[];
  workflowStageIds: string[];
}

/**
 * Groups coarse file/edit presence events. A gap of five minutes or more starts
 * a new session. Question, capture, and suggestion events never count as edit
 * activity and therefore cannot create a valid editing session on their own.
 */
export function buildSessionSummaries(events: readonly ActivityEvent[]): SessionSummary[] {
  const activity = events
    .filter((event) => event.kind === "file-switched" || event.kind === "edit-presence")
    .filter((event) => Number.isFinite(Date.parse(event.at)))
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at) || left.id.localeCompare(right.id));

  const sessions: MutableSession[] = [];
  let current: MutableSession | undefined;

  for (const event of activity) {
    const previousMs = current ? Date.parse(current.lastActiveAt) : 0;
    const eventMs = Date.parse(event.at);
    if (!current || eventMs - previousMs >= SESSION_IDLE_MS) {
      current = {
        first: event,
        last: event,
        lastActiveAt: activityEndAt(event),
        hadEdit: event.kind === "edit-presence",
        articleTypeIds: event.articleTypeId ? [event.articleTypeId] : [],
        workflowStageIds: event.workflowStageId ? [event.workflowStageId] : []
      };
      sessions.push(current);
      continue;
    }

    current.last = event;
    if (Date.parse(activityEndAt(event)) > Date.parse(current.lastActiveAt)) {
      current.lastActiveAt = activityEndAt(event);
    }
    current.hadEdit ||= event.kind === "edit-presence";
    if (event.articleTypeId) {
      current.articleTypeIds.push(event.articleTypeId);
    }
    if (event.workflowStageId) {
      current.workflowStageIds.push(event.workflowStageId);
    }
  }

  return sessions.map((session) => {
    const startedAt = new Date(Date.parse(session.first.at)).toISOString();
    const endedAt = new Date(Date.parse(session.lastActiveAt)).toISOString();
    const offset = clampTimezoneOffset(session.first.timezoneOffsetMinutes);
    return {
      id: `session_${stableHash(`${session.first.id}|${session.last.id}`)}`,
      startedAt,
      endedAt,
      activeDurationMs: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)),
      hadEdit: session.hadEdit,
      localDate: localDateFor(startedAt, offset),
      timeWindow: threeHourWindowFor(startedAt, offset),
      timezoneOffsetMinutes: offset,
      articleTypeId: mostFrequent(session.articleTypeIds),
      workflowStageId: mostFrequent(session.workflowStageIds)
    };
  });
}

function activityEndAt(event: ActivityEvent): string {
  if (event.kind !== "edit-presence" || !event.lastActiveAt) {
    return event.at;
  }
  const startedMs = Date.parse(event.at);
  const lastActiveMs = Date.parse(event.lastActiveAt);
  return Number.isFinite(lastActiveMs) && lastActiveMs >= startedMs ? event.lastActiveAt : event.at;
}

export function threeHourWindowFor(at: string | Date, timezoneOffsetMinutes = 0): ThreeHourTimeWindow {
  const date = typeof at === "string" ? new Date(at) : at;
  const shifted = new Date(date.getTime() + clampTimezoneOffset(timezoneOffsetMinutes) * 60_000);
  const startHour = Math.floor(shifted.getUTCHours() / 3) * 3;
  return { startHour, endHour: startHour + 3 };
}

export function localDateFor(at: string | Date, timezoneOffsetMinutes = 0): string {
  const date = typeof at === "string" ? new Date(at) : at;
  const shifted = new Date(date.getTime() + clampTimezoneOffset(timezoneOffsetMinutes) * 60_000);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0")
  ].join("-");
}

export function formatTimeWindow(window: ThreeHourTimeWindow): string {
  return `${String(window.startHour).padStart(2, "0")}:00–${String(window.endHour).padStart(2, "0")}:00`;
}

export function timeWindowKey(window: ThreeHourTimeWindow): string {
  return `${window.startHour}-${window.endHour}`;
}

export function isInTimeWindow(at: string | Date, window: ThreeHourTimeWindow, timezoneOffsetMinutes = 0): boolean {
  const date = typeof at === "string" ? new Date(at) : at;
  const shifted = new Date(date.getTime() + clampTimezoneOffset(timezoneOffsetMinutes) * 60_000);
  const hour = shifted.getUTCHours();
  return hour >= window.startHour && hour < window.endHour;
}

export function clampTimezoneOffset(value: number): number {
  return Number.isFinite(value) ? Math.max(-840, Math.min(840, Math.round(value))) : 0;
}

function mostFrequent(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
