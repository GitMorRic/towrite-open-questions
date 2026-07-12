import { habitFingerprint, inferHabitPatterns, normalizeTimeWindow } from "./inference";
import { buildSessionSummaries, clampTimezoneOffset, SESSION_IDLE_MS } from "./sessions";
import type {
  ActivityEvent,
  CaptureEntryPoint,
  CaptureRouteSelection,
  CaptureTargetKind,
  HabitCandidate,
  HabitCandidateStatus,
  HabitEvidence,
  HabitLearningExportBundle,
  HabitLearningState,
  HabitRule,
  NewActivityEvent,
  QuestionActivityAction,
  SessionSummary,
  SuggestionFeedbackAction
} from "./types";
import { HABIT_LEARNING_SCHEMA_VERSION } from "./types";

export const RAW_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const PENDING_PRESENTATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export const DISMISSED_SUPPRESSION_MS = 90 * 24 * 60 * 60 * 1000;

export class HabitLearningService {
  private state: HabitLearningState;

  constructor(initial?: Partial<HabitLearningState> | unknown) {
    this.state = normalizeHabitLearningState(initial);
  }

  /**
   * Stores only the allow-listed structural fields from ActivityEvent. Unknown
   * properties (including accidental body/selection/clipboard fields) are
   * discarded at this boundary.
   */
  recordEvent(input: NewActivityEvent, now = new Date()): ActivityEvent | undefined {
    if (this.state.collectionPaused) {
      return undefined;
    }
    const event = normalizeActivityEvent(input);
    if (!event) {
      throw new Error("Invalid activity event");
    }
    const existing = this.state.events.find((item) => item.id === event.id);
    if (existing) {
      return clone(existing);
    }
    if (event.kind === "edit-presence") {
      const currentPeriod = [...this.state.events]
        .reverse()
        .find((item) => item.kind === "edit-presence"
          && item.filePath === event.filePath
          && item.articleTypeId === event.articleTypeId
          && item.workflowStageId === event.workflowStageId);
      if (currentPeriod?.kind === "edit-presence") {
        const currentEndMs = Date.parse(currentPeriod.lastActiveAt ?? currentPeriod.at);
        const nextStartMs = Date.parse(event.at);
        if (nextStartMs >= currentEndMs && nextStartMs - currentEndMs < SESSION_IDLE_MS) {
          const nextEnd = event.lastActiveAt ?? event.at;
          currentPeriod.lastActiveAt = Date.parse(nextEnd) > currentEndMs ? nextEnd : currentPeriod.lastActiveAt;
          this.purge(now);
          return clone(currentPeriod);
        }
      }
    }
    this.state.events.push(event);
    this.purge(now);
    return clone(event);
  }

  setCollectionPaused(paused: boolean): void {
    this.state.collectionPaused = paused;
  }

  isCollectionPaused(): boolean {
    return this.state.collectionPaused;
  }

  purge(now = new Date()): number {
    const nowMs = validDateMs(now);
    const cutoff = nowMs - RAW_EVENT_RETENTION_MS;
    const before = this.state.events.length;
    this.state.events = this.state.events
      .filter((event) => Date.parse(event.at) >= cutoff)
      .sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id));
    return before - this.state.events.length;
  }

  getEvents(): ActivityEvent[] {
    return clone(this.state.events);
  }

  getSessionSummaries(now = new Date()): SessionSummary[] {
    this.purge(now);
    return buildSessionSummaries(this.state.events);
  }

  /** Detects patterns and reconciles them without ever auto-accepting one. */
  inferCandidates(now = new Date()): HabitCandidate[] {
    const nowIso = new Date(validDateMs(now)).toISOString();
    this.purge(now);
    const detected = inferHabitPatterns(buildSessionSummaries(this.state.events), this.state.events);
    const existingByFingerprint = new Map(this.state.habits.map((habit) => [habit.fingerprint, habit]));

    for (const pattern of detected) {
      const existing = existingByFingerprint.get(pattern.fingerprint);
      if (!existing) {
        const candidate: HabitCandidate = {
          id: `habit_${stableHash(pattern.fingerprint)}`,
          fingerprint: pattern.fingerprint,
          label: pattern.label,
          description: pattern.description,
          rule: pattern.rule,
          evidence: pattern.evidence,
          status: "pending",
          origin: "rules",
          createdAt: nowIso,
          updatedAt: nowIso,
          lastDetectedAt: nowIso
        };
        this.state.habits.push(candidate);
        existingByFingerprint.set(candidate.fingerprint, candidate);
        continue;
      }

      const priorStatus = existing.status;
      existing.rule = pattern.rule;
      existing.evidence = pattern.evidence;
      existing.lastDetectedAt = nowIso;
      existing.updatedAt = nowIso;
      if (!existing.copyEditedByAiAt && existing.origin !== "manual") {
        existing.label = pattern.label;
        existing.description = pattern.description;
      }

      if (priorStatus === "dismissed") {
        const suppressionExpired = !existing.suppressedUntil || Date.parse(existing.suppressedUntil) <= Date.parse(nowIso);
        const changed = materiallyChanged(existing.dismissedEvidence, pattern.evidence);
        if (suppressionExpired || changed) {
          existing.status = "pending";
          existing.lastPresentedAt = undefined;
          existing.dismissedAt = undefined;
          existing.suppressedUntil = undefined;
          existing.dismissedEvidence = undefined;
        }
      }
    }

    this.state.habits.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    return this.getCandidates();
  }

  getCandidates(status?: HabitCandidateStatus): HabitCandidate[] {
    return clone(this.state.habits.filter((habit) => !status || habit.status === status));
  }

  getAcceptedHabits(): HabitCandidate[] {
    return this.getCandidates("accepted");
  }

  getPresentablePendingCandidates(now = new Date()): HabitCandidate[] {
    const nowMs = validDateMs(now);
    return clone(this.state.habits.filter((habit) => {
      if (habit.status !== "pending") {
        return false;
      }
      if (!habit.lastPresentedAt) {
        return true;
      }
      return nowMs - Date.parse(habit.lastPresentedAt) >= PENDING_PRESENTATION_INTERVAL_MS;
    }));
  }

  markCandidatePresented(id: string, now = new Date()): HabitCandidate {
    const candidate = this.requireCandidate(id);
    if (candidate.status !== "pending") {
      throw new Error("Only pending habit candidates can be presented");
    }
    candidate.lastPresentedAt = new Date(validDateMs(now)).toISOString();
    candidate.updatedAt = candidate.lastPresentedAt;
    return clone(candidate);
  }

  acceptCandidate(id: string, now = new Date()): HabitCandidate {
    const candidate = this.requireCandidate(id);
    const at = new Date(validDateMs(now)).toISOString();
    candidate.status = "accepted";
    candidate.acceptedAt = at;
    candidate.updatedAt = at;
    candidate.dismissedAt = undefined;
    candidate.suppressedUntil = undefined;
    candidate.dismissedEvidence = undefined;
    return clone(candidate);
  }

  dismissCandidate(id: string, now = new Date()): HabitCandidate {
    const candidate = this.requireCandidate(id);
    const nowMs = validDateMs(now);
    const at = new Date(nowMs).toISOString();
    candidate.status = "dismissed";
    candidate.acceptedAt = undefined;
    candidate.dismissedAt = at;
    candidate.suppressedUntil = new Date(nowMs + DISMISSED_SUPPRESSION_MS).toISOString();
    candidate.dismissedEvidence = clone(candidate.evidence);
    candidate.updatedAt = at;
    return clone(candidate);
  }

  /** AI may improve copy, but this method intentionally cannot alter status or rule. */
  rewriteCandidateCopy(
    id: string,
    copy: { label?: string; description?: string },
    now = new Date(),
    editedByAi = true
  ): HabitCandidate {
    const candidate = this.requireCandidate(id);
    candidate.label = normalizeText(copy.label, 160) || candidate.label;
    candidate.description = normalizeText(copy.description, 800) || candidate.description;
    candidate.updatedAt = new Date(validDateMs(now)).toISOString();
    candidate.copyEditedByAiAt = editedByAi ? candidate.updatedAt : undefined;
    return clone(candidate);
  }

  exportBundle(now = new Date()): HabitLearningExportBundle {
    const generatedAt = new Date(validDateMs(now)).toISOString();
    this.purge(now);
    const orderedEvents = [...this.state.events]
      .sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id));
    const pending = this.state.habits.filter((habit) => habit.status === "pending");
    const accepted = this.state.habits.filter((habit) => habit.status === "accepted");
    const dismissed = this.state.habits.filter((habit) => habit.status === "dismissed");
    return {
      schemaVersion: HABIT_LEARNING_SCHEMA_VERSION,
      generatedAt,
      files: {
        events: "learning/events.jsonl",
        habits: "learning/habits.json"
      },
      eventsJsonl: orderedEvents.map((event) => JSON.stringify(event)).join("\n"),
      habitsJson: JSON.stringify({
        schemaVersion: HABIT_LEARNING_SCHEMA_VERSION,
        generatedAt,
        collectionPaused: this.state.collectionPaused,
        candidates: pending,
        accepted,
        dismissed
      }, null, 2)
    };
  }

  /** Removes the full learning truth; there is no secondary hidden store. */
  clearLearningData(options: { preservePause?: boolean; preserveManualHabits?: boolean } = {}): void {
    const paused = options.preservePause === false ? false : this.state.collectionPaused;
    this.state = {
      schemaVersion: HABIT_LEARNING_SCHEMA_VERSION,
      collectionPaused: paused,
      events: [],
      habits: options.preserveManualHabits
        ? this.state.habits.filter((habit) => habit.origin === "manual")
        : []
    };
  }

  getState(): HabitLearningState {
    return clone(this.state);
  }

  private requireCandidate(id: string): HabitCandidate {
    const candidate = this.state.habits.find((item) => item.id === id);
    if (!candidate) {
      throw new Error(`Unknown habit candidate: ${id}`);
    }
    return candidate;
  }
}

export function normalizeHabitLearningState(input?: Partial<HabitLearningState> | unknown): HabitLearningState {
  const record = asRecord(input);
  const events = Array.isArray(record?.events)
    ? record.events.map(normalizeActivityEvent).filter((event): event is ActivityEvent => Boolean(event))
    : [];
  const habits = Array.isArray(record?.habits)
    ? record.habits.map(normalizeHabitCandidate).filter((habit): habit is HabitCandidate => Boolean(habit))
    : [];
  return {
    schemaVersion: HABIT_LEARNING_SCHEMA_VERSION,
    collectionPaused: record?.collectionPaused === true,
    events: dedupeById(events).sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id)),
    habits: dedupeHabits(habits)
  };
}

export function normalizeActivityEvent(input: unknown): ActivityEvent | undefined {
  const record = asRecord(input);
  if (!record) {
    return undefined;
  }
  const kind = normalizeText(record.kind, 40);
  const at = normalizeIso(record.at);
  if (!kind || !at) {
    return undefined;
  }
  const base = {
    id: normalizeText(record.id, 160) || `activity_${stableHash(`${kind}|${at}|${Math.random()}`)}`,
    at,
    timezoneOffsetMinutes: clampTimezoneOffset(Number(record.timezoneOffsetMinutes)),
    articleTypeId: normalizeIdentifier(record.articleTypeId),
    workflowStageId: normalizeIdentifier(record.workflowStageId)
  };

  if (kind === "file-switched" || kind === "edit-presence") {
    const filePath = normalizePath(record.filePath);
    if (!filePath) {
      return undefined;
    }
    if (kind === "edit-presence") {
      const lastActiveAt = normalizeIso(record.lastActiveAt);
      return {
        ...base,
        kind,
        filePath,
        lastActiveAt: lastActiveAt && Date.parse(lastActiveAt) >= Date.parse(at) ? lastActiveAt : undefined
      };
    }
    return { ...base, kind, filePath };
  }
  if (kind === "capture-route") {
    const selectedTargetId = normalizeText(record.selectedTargetId, 240);
    const selectedTargetKind = normalizeCaptureTargetKind(record.selectedTargetKind);
    const entryPoint = normalizeText(record.entryPoint, 80) as CaptureEntryPoint | undefined;
    const selection = normalizeRouteSelection(record.selection);
    if (!selectedTargetId || !selectedTargetKind || !entryPoint || !selection) {
      return undefined;
    }
    return {
      ...base,
      kind,
      captureId: normalizeText(record.captureId, 160),
      entryPoint,
      suggestedTargetId: normalizeText(record.suggestedTargetId, 240),
      selectedTargetId,
      selectedTargetKind,
      selection,
      sourceFilePath: normalizePath(record.sourceFilePath)
    };
  }
  if (kind === "question-action") {
    const questionId = normalizeText(record.questionId, 160);
    const action = normalizeQuestionAction(record.action);
    if (!questionId || !action) {
      return undefined;
    }
    return {
      ...base,
      kind,
      questionId,
      action,
      sourceFilePath: normalizePath(record.sourceFilePath)
    };
  }
  if (kind === "suggestion-feedback") {
    const suggestionId = normalizeText(record.suggestionId, 160);
    const action = normalizeSuggestionAction(record.action);
    if (!suggestionId || !action) {
      return undefined;
    }
    return {
      ...base,
      kind,
      suggestionId,
      action,
      habitId: normalizeText(record.habitId, 160)
    };
  }
  return undefined;
}

export function materiallyChanged(previous: HabitEvidence | undefined, current: HabitEvidence): boolean {
  if (!previous) {
    return true;
  }
  const enoughNewSamples = current.sampleSize >= previous.sampleSize + MIN_MATERIAL_SAMPLE_GROWTH;
  const moreDays = current.distinctDays >= previous.distinctDays + MIN_MATERIAL_DAY_GROWTH;
  const strongerRatio = current.ratio >= previous.ratio + MIN_MATERIAL_RATIO_GROWTH;
  return enoughNewSamples && (moreDays || strongerRatio);
}

const MIN_MATERIAL_SAMPLE_GROWTH = 5;
const MIN_MATERIAL_DAY_GROWTH = 3;
const MIN_MATERIAL_RATIO_GROWTH = 0.1;

function normalizeHabitCandidate(input: unknown): HabitCandidate | undefined {
  const record = asRecord(input);
  const rule = normalizeHabitRule(record?.rule);
  const evidence = normalizeEvidence(record?.evidence);
  if (!record || !rule || !evidence) {
    return undefined;
  }
  const fingerprint = habitFingerprint(rule);
  const createdAt = normalizeIso(record.createdAt) || evidence.firstSeenAt;
  const updatedAt = normalizeIso(record.updatedAt) || evidence.lastSeenAt;
  const status = normalizeCandidateStatus(record.status);
  return {
    id: normalizeText(record.id, 160) || `habit_${stableHash(fingerprint)}`,
    fingerprint,
    label: normalizeText(record.label, 160) || fingerprint,
    description: normalizeText(record.description, 800) || "",
    rule,
    evidence,
    status,
    origin: record.origin === "manual" ? "manual" : "rules",
    createdAt,
    updatedAt,
    lastDetectedAt: normalizeIso(record.lastDetectedAt) || updatedAt,
    lastPresentedAt: normalizeIso(record.lastPresentedAt),
    acceptedAt: status === "accepted" ? normalizeIso(record.acceptedAt) || updatedAt : undefined,
    dismissedAt: status === "dismissed" ? normalizeIso(record.dismissedAt) || updatedAt : undefined,
    suppressedUntil: status === "dismissed" ? normalizeIso(record.suppressedUntil) : undefined,
    dismissedEvidence: status === "dismissed" ? normalizeEvidence(record.dismissedEvidence) : undefined,
    copyEditedByAiAt: normalizeIso(record.copyEditedByAiAt)
  };
}

function normalizeHabitRule(input: unknown): HabitRule | undefined {
  const record = asRecord(input);
  if (record?.kind === "time-stage") {
    const timeWindow = asRecord(record.timeWindow);
    const workflowStageId = normalizeIdentifier(record.workflowStageId);
    const articleTypeId = normalizeIdentifier(record.articleTypeId);
    if (!timeWindow || (!workflowStageId && !articleTypeId)) {
      return undefined;
    }
    return {
      kind: "time-stage",
      timeWindow: normalizeTimeWindow({
        startHour: Number(timeWindow.startHour),
        endHour: Number(timeWindow.endHour)
      }),
      workflowStageId,
      articleTypeId
    };
  }
  if (record?.kind === "routing") {
    const contextRecord = asRecord(record.context);
    const workflowStageId = normalizeIdentifier(contextRecord?.workflowStageId);
    const articleTypeId = normalizeIdentifier(contextRecord?.articleTypeId);
    const entryPoint = normalizeText(contextRecord?.entryPoint, 80) as CaptureEntryPoint | undefined;
    const targetId = normalizeText(record.targetId, 240);
    const targetKind = normalizeCaptureTargetKind(record.targetKind);
    if ((!workflowStageId && !articleTypeId && !entryPoint) || !targetId || !targetKind) {
      return undefined;
    }
    return {
      kind: "routing",
      context: { workflowStageId, articleTypeId, entryPoint },
      targetId,
      targetKind
    };
  }
  return undefined;
}

function normalizeEvidence(input: unknown): HabitEvidence | undefined {
  const record = asRecord(input);
  const firstSeenAt = normalizeIso(record?.firstSeenAt);
  const lastSeenAt = normalizeIso(record?.lastSeenAt);
  if (!record || !firstSeenAt || !lastSeenAt) {
    return undefined;
  }
  const sampleSize = clampInteger(record.sampleSize, 0, 1_000_000);
  const matchingSamples = clampInteger(record.matchingSamples, 0, sampleSize);
  const distinctDays = clampInteger(record.distinctDays, 0, 100_000);
  return {
    sampleSize,
    matchingSamples,
    distinctDays,
    ratio: Math.max(0, Math.min(1, Number(record.ratio) || 0)),
    firstSeenAt,
    lastSeenAt
  };
}

function normalizeCaptureTargetKind(value: unknown): CaptureTargetKind | undefined {
  return value === "existing-note" || value === "folder" || value === "inbox" ? value : undefined;
}

function normalizeRouteSelection(value: unknown): CaptureRouteSelection | undefined {
  return value === "accepted" || value === "reselected" || value === "inbox" || value === "undone" ? value : undefined;
}

function normalizeQuestionAction(value: unknown): QuestionActivityAction | undefined {
  return value === "opened" || value === "answered" || value === "resolved" || value === "ignored" || value === "reminded"
    ? value
    : undefined;
}

function normalizeSuggestionAction(value: unknown): SuggestionFeedbackAction | undefined {
  return value === "accepted" || value === "edited" || value === "dismissed" || value === "later" || value === "opened"
    ? value
    : undefined;
}

function normalizeCandidateStatus(value: unknown): HabitCandidateStatus {
  return value === "accepted" || value === "dismissed" ? value : "pending";
}

function normalizeIdentifier(value: unknown): string | undefined {
  return normalizeText(value, 120)?.toLowerCase().replace(/\s+/gu, "-");
}

function normalizePath(value: unknown): string | undefined {
  return normalizeText(value, 512)?.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
}

function normalizeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  const text = String(value).trim().replace(/\s+/gu, " ").slice(0, maxLength);
  return text || undefined;
}

function normalizeIso(value: unknown): string | undefined {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function validDateMs(value: Date): number {
  const timestamp = value.getTime();
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function clampInteger(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : min;
}

function dedupeById<T extends { id: string }>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) {
      return false;
    }
    seen.add(value.id);
    return true;
  });
}

function dedupeHabits(values: HabitCandidate[]): HabitCandidate[] {
  const byFingerprint = new Map<string, HabitCandidate>();
  for (const value of values) {
    const current = byFingerprint.get(value.fingerprint);
    if (!current || current.updatedAt < value.updatedAt) {
      byFingerprint.set(value.fingerprint, value);
    }
  }
  return Array.from(byFingerprint.values())
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
