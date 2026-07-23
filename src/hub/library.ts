import type {
  OpenQuestion,
  OpenQuestionLane,
  OpenQuestionPriority,
  QuestionDeliveryPolicy,
  QuestionDeviceSchedule
} from "../core/types";
import type { HubDeviceState } from "./types";

export type HubSelectionMode = "manual" | "agent" | "rotation" | "schedule";

export interface DeviceLibraryEntry {
  id: string;
  title: string;
  lane: OpenQuestionLane;
  priority?: OpenQuestionPriority;
  createdAt?: string;
  membership: "auto" | "included" | "excluded";
  inLibrary: boolean;
  eligible: boolean;
  exclusionReason?: "inactive" | "not-selected" | "privacy" | "unsupported-source";
  agentEligible: boolean;
  rotationEligible: boolean;
  schedule?: Required<Pick<QuestionDeviceSchedule, "enabled" | "weekdays" | "localTime" | "durationMinutes">>;
}

export interface DeviceLibrarySnapshot {
  mode: HubSelectionMode;
  entries: DeviceLibraryEntry[];
  eligibleCount: number;
  excludedCount: number;
  uploadedCount: number;
  rotationIntervalMinutes: number;
  manualHoldUntil?: string;
}

export interface BuildDeviceLibraryOptions {
  mode: HubSelectionMode;
  autoAddSelections: boolean;
  rotationIntervalMinutes: number;
  manualHoldUntil?: string;
  isPrivacyAllowed?(question: OpenQuestion): boolean;
}

export interface ScheduledLibraryChoice {
  entry: DeviceLibraryEntry;
  occurrenceId: string;
  startsAt: Date;
}

const INACTIVE_STATUSES = new Set(["candidate", "resolved", "ignored"]);
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function buildDeviceLibrary(
  questions: readonly OpenQuestion[],
  options: BuildDeviceLibraryOptions
): DeviceLibrarySnapshot {
  const entries = questions.map((question) => deviceLibraryEntry(question, options));
  entries.sort((left, right) => {
    const created = String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? ""));
    return created || left.id.localeCompare(right.id);
  });
  const eligibleCount = entries.filter((entry) => entry.inLibrary && entry.eligible).length;
  return {
    mode: options.mode,
    entries,
    eligibleCount,
    excludedCount: entries.filter((entry) => entry.inLibrary && !entry.eligible).length,
    uploadedCount: Math.min(20, eligibleCount),
    rotationIntervalMinutes: options.rotationIntervalMinutes,
    manualHoldUntil: normalizeIso(options.manualHoldUntil)
  };
}

export function deviceLibraryEntry(
  question: OpenQuestion,
  options: Pick<BuildDeviceLibraryOptions, "autoAddSelections" | "isPrivacyAllowed">
): DeviceLibraryEntry {
  const policy = normalizeQuestionDeliveryPolicy(question.deliveryPolicy);
  const membership = policy.membership ?? "auto";
  const active = !INACTIVE_STATUSES.has(question.status);
  const automaticallyIncluded = options.autoAddSelections && question.source.rule === "selection";
  const inLibrary = active && membership !== "excluded" && (membership === "included" || automaticallyIncluded);
  const supported = question.source.file.toLowerCase().endsWith(".md");
  const privacyAllowed = options.isPrivacyAllowed?.(question) !== false;
  const eligible = inLibrary && supported && privacyAllowed;
  let exclusionReason: DeviceLibraryEntry["exclusionReason"];
  if (!active) exclusionReason = "inactive";
  else if (!inLibrary) exclusionReason = "not-selected";
  else if (!supported) exclusionReason = "unsupported-source";
  else if (!privacyAllowed) exclusionReason = "privacy";

  return {
    id: question.id,
    title: question.title || question.question || "Untitled",
    lane: question.lane,
    priority: question.priority,
    createdAt: question.createdAt,
    membership,
    inLibrary,
    eligible,
    exclusionReason,
    agentEligible: policy.agentEligible !== false,
    rotationEligible: policy.rotationEligible !== false,
    schedule: normalizeQuestionDeviceSchedule(policy.schedule)
  };
}

export function normalizeQuestionDeliveryPolicy(value: unknown): QuestionDeliveryPolicy {
  const raw = value && typeof value === "object" ? value as Partial<QuestionDeliveryPolicy> : {};
  const membership = raw.membership === "included" || raw.membership === "excluded" || raw.membership === "auto"
    ? raw.membership
    : "auto";
  return {
    membership,
    agentEligible: raw.agentEligible !== false,
    rotationEligible: raw.rotationEligible !== false,
    schedule: normalizeQuestionDeviceSchedule(raw.schedule),
    allowDuringQuietHours: raw.allowDuringQuietHours === true
  };
}

export function normalizeQuestionDeviceSchedule(value: unknown): DeviceLibraryEntry["schedule"] | undefined {
  const raw = value && typeof value === "object" ? value as Partial<QuestionDeviceSchedule> : undefined;
  if (!raw) return undefined;
  const localTime = /^([01]\d|2[0-3]):[0-5]\d$/u.test(String(raw.localTime ?? ""))
    ? String(raw.localTime)
    : "";
  if (!localTime) return undefined;
  const weekdays = Array.isArray(raw.weekdays)
    ? Array.from(new Set(raw.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))).sort()
    : ALL_WEEKDAYS;
  return {
    enabled: raw.enabled !== false,
    weekdays: weekdays.length > 0 ? weekdays : ALL_WEEKDAYS,
    localTime,
    durationMinutes: clampInteger(raw.durationMinutes, 5, 24 * 60, 30)
  };
}

/** Selects an active schedule occurrence, including windows that cross midnight. */
export function scheduledLibraryChoice(
  entries: readonly DeviceLibraryEntry[],
  now: Date,
  consumedOccurrenceIds: string | readonly string[] = ""
): ScheduledLibraryChoice | undefined {
  const consumed = new Set(typeof consumedOccurrenceIds === "string"
    ? [consumedOccurrenceIds].filter(Boolean)
    : consumedOccurrenceIds);
  const matches: ScheduledLibraryChoice[] = [];
  for (const entry of entries) {
    if (!entry.inLibrary || !entry.eligible || !entry.schedule?.enabled) continue;
    const occurrence = activeScheduleOccurrence(entry, now);
    if (occurrence && !consumed.has(occurrence.occurrenceId)) {
      matches.push(occurrence);
    }
  }
  return matches.sort((left, right) => (
    priorityRank(right.entry.priority) - priorityRank(left.entry.priority)
    || right.startsAt.getTime() - left.startsAt.getTime()
    || left.entry.id.localeCompare(right.entry.id)
  ))[0];
}

export function rotationPool(entries: readonly DeviceLibraryEntry[]): DeviceLibraryEntry[] {
  return entries.filter((entry) => entry.inLibrary && entry.eligible && entry.rotationEligible);
}

export function rotationChoice(entries: readonly DeviceLibraryEntry[], cursor: number): DeviceLibraryEntry | undefined {
  const pool = rotationPool(entries);
  if (pool.length === 0) return undefined;
  const index = ((Math.trunc(cursor) % pool.length) + pool.length) % pool.length;
  return pool[index];
}

export function nextRotationCursor(entries: readonly DeviceLibraryEntry[], selectedId: string): number {
  const pool = rotationPool(entries);
  if (pool.length === 0) return 0;
  const index = pool.findIndex((entry) => entry.id === selectedId);
  return index < 0 ? 0 : (index + 1) % pool.length;
}

export function isManualHoldActive(until: string | undefined, now: Date): boolean {
  const timestamp = Date.parse(until ?? "");
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

/** Rotation never advances on poll/upload; it requires the exact display ACK and dwell time. */
export function canAdvanceRotation(
  state: HubDeviceState,
  lastRotationContentId: string,
  intervalMinutes: number,
  now: Date
): boolean {
  if (!lastRotationContentId) return true;
  const displayed = state.displayed;
  if (!displayed || displayed.contentId !== lastRotationContentId) return false;
  if (state.selected && (
    displayed.selectionId !== state.selected.selectionId
    || displayed.contentId !== state.selected.selectedContentId
    || displayed.stateVersion !== state.selected.stateVersion
  )) return false;
  const displayedAt = Date.parse(displayed.displayedAt);
  return Number.isFinite(displayedAt)
    && now.getTime() - displayedAt >= Math.max(1, intervalMinutes) * 60_000;
}

function activeScheduleOccurrence(entry: DeviceLibraryEntry, now: Date): ScheduledLibraryChoice | undefined {
  const schedule = entry.schedule;
  if (!schedule) return undefined;
  for (const dayOffset of [0, -1]) {
    const startsAt = new Date(now);
    startsAt.setDate(now.getDate() + dayOffset);
    const [hours, minutes] = schedule.localTime.split(":").map(Number);
    startsAt.setHours(hours, minutes, 0, 0);
    if (!schedule.weekdays.includes(startsAt.getDay())) continue;
    const endsAt = new Date(startsAt.getTime() + schedule.durationMinutes * 60_000);
    if (now.getTime() < startsAt.getTime() || now.getTime() >= endsAt.getTime()) continue;
    const dateKey = `${startsAt.getFullYear()}-${pad2(startsAt.getMonth() + 1)}-${pad2(startsAt.getDate())}`;
    return {
      entry,
      occurrenceId: `${entry.id}:${dateKey}:${schedule.localTime}`,
      startsAt
    };
  }
  return undefined;
}

function priorityRank(priority: OpenQuestionPriority | undefined): number {
  if (priority === "P1") return 3;
  if (priority === "P2") return 2;
  if (priority === "P3") return 1;
  return 0;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeIso(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : undefined;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
