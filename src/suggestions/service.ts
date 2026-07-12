import type { OpenQuestion } from "../core/types";
import { PENDING_PRESENTATION_INTERVAL_MS } from "../learning/habit-learning";
import { formatTimeWindow, isInTimeWindow, localDateFor } from "../learning/sessions";
import type { HabitCandidate } from "../learning/types";
import type {
  NotificationEligibility,
  ProactiveSuggestion,
  SuggestionNotificationEvent,
  SuggestionNotificationSettings
} from "./types";
import { DEFAULT_SUGGESTION_NOTIFICATION_SETTINGS } from "./types";

export interface SuggestionServiceInput {
  questions: readonly OpenQuestion[];
  habits: readonly HabitCandidate[];
  activeFile?: string | null;
  now?: Date;
  timezoneOffsetMinutes?: number;
  /** A due reminder must be explicitly listed to notify during quiet hours. */
  allowQuietHoursQuestionIds?: readonly string[];
}

export class SuggestionService {
  build(input: SuggestionServiceInput): ProactiveSuggestion[] {
    const now = input.now ?? new Date();
    const nowMs = validDateMs(now);
    const generatedAt = new Date(nowMs).toISOString();
    const offset = normalizeOffset(input.timezoneOffsetMinutes);
    const quietOverrides = new Set(input.allowQuietHoursQuestionIds ?? []);
    const suggestions: ProactiveSuggestion[] = [];
    const includedQuestionIds = new Set<string>();

    for (const question of input.questions.filter(isUnresolvedQuestion).filter((item) => isDue(item, nowMs))) {
      suggestions.push({
        id: `due:${question.id}`,
        source: "due-reminder",
        priority: 100 + questionPriorityBoost(question),
        title: question.title || question.question,
        detail: question.reminderNote || question.question,
        triggerReason: "Reminder is due",
        allowedActions: ["open-source", "snooze", "dismiss"],
        generatedAt,
        questionId: question.id,
        questionPriority: question.priority,
        sourceFile: question.source.file,
        reminderAt: question.reminderAt,
        allowDuringQuietHours: quietOverrides.has(question.id)
      });
      includedQuestionIds.add(question.id);
    }

    const activeFile = normalizePath(input.activeFile);
    if (activeFile) {
      for (const question of input.questions.filter(isUnresolvedQuestion)) {
        if (includedQuestionIds.has(question.id) || normalizePath(question.source.file) !== activeFile) {
          continue;
        }
        suggestions.push({
          id: `active:${question.id}`,
          source: "active-question",
          priority: 45 + questionPriorityBoost(question),
          title: question.title || question.question,
          detail: question.question,
          triggerReason: "Unresolved item in the active note",
          allowedActions: ["open-source", "later"],
          generatedAt,
          questionId: question.id,
          questionPriority: question.priority,
          sourceFile: question.source.file
        });
        includedQuestionIds.add(question.id);
      }
    }

    const localDate = localDateFor(now, offset);
    for (const habit of input.habits) {
      if (habit.status === "accepted" && habit.rule.kind === "time-stage"
        && isInTimeWindow(now, habit.rule.timeWindow, offset)) {
        const subject = habit.rule.workflowStageId
          ? `stage ${habit.rule.workflowStageId}`
          : `article type ${habit.rule.articleTypeId}`;
        suggestions.push({
          id: `habit:${habit.id}:${localDate}`,
          source: "confirmed-habit",
          priority: 65,
          title: habit.label,
          detail: habit.description,
          triggerReason: `Confirmed habit for ${subject} at ${formatTimeWindow(habit.rule.timeWindow)}`,
          allowedActions: ["open-source", "later", "dismiss", "view-evidence"],
          generatedAt,
          habitId: habit.id,
          workflowStageId: habit.rule.workflowStageId,
          articleTypeId: habit.rule.articleTypeId,
          habitRule: habit.rule,
          evidence: habit.evidence
        });
        continue;
      }

      if (habit.status === "pending" && isPendingPresentable(habit, nowMs)) {
        suggestions.push({
          id: `habit-candidate:${habit.id}`,
          source: "habit-candidate",
          priority: 35,
          title: habit.label,
          detail: habit.description,
          triggerReason: "Habit candidate awaiting confirmation",
          allowedActions: ["accept", "edit", "dismiss", "later", "view-evidence"],
          generatedAt,
          habitId: habit.id,
          workflowStageId: habit.rule.kind === "time-stage" ? habit.rule.workflowStageId : habit.rule.context.workflowStageId,
          articleTypeId: habit.rule.kind === "time-stage" ? habit.rule.articleTypeId : habit.rule.context.articleTypeId,
          habitRule: habit.rule,
          evidence: habit.evidence
        });
      }
    }

    return suggestions.sort((left, right) => right.priority - left.priority
      || (left.reminderAt ?? "").localeCompare(right.reminderAt ?? "")
      || left.id.localeCompare(right.id));
  }

  notificationEligibility(
    suggestion: ProactiveSuggestion,
    settings: Partial<SuggestionNotificationSettings>,
    history: readonly SuggestionNotificationEvent[],
    now = new Date()
  ): NotificationEligibility {
    return checkNotificationEligibility(suggestion, settings, history, now);
  }
}

export function checkNotificationEligibility(
  suggestion: ProactiveSuggestion,
  settingsInput: Partial<SuggestionNotificationSettings>,
  history: readonly SuggestionNotificationEvent[],
  now = new Date()
): NotificationEligibility {
  const settings = normalizeNotificationSettings(settingsInput);
  if (!settings.enabled) {
    return { eligible: false, reason: "notifications-disabled" };
  }
  if (suggestion.source !== "due-reminder" && suggestion.source !== "confirmed-habit") {
    return { eligible: false, reason: "source-not-allowed" };
  }

  const nowMs = validDateMs(now);
  const today = localDateFor(new Date(nowMs), settings.timezoneOffsetMinutes);
  const alreadyNotified = history.some((event) => event.suggestionId === suggestion.id
    && notificationLocalDate(event.notifiedAt, settings.timezoneOffsetMinutes) === today);
  if (alreadyNotified) {
    return { eligible: false, reason: "already-notified-today" };
  }

  if (isWithinQuietHours(
    new Date(nowMs),
    settings.quietHoursStart,
    settings.quietHoursEnd,
    settings.timezoneOffsetMinutes
  )) {
    const dueOverride = suggestion.source === "due-reminder" && suggestion.allowDuringQuietHours === true;
    if (!dueOverride) {
      return { eligible: false, reason: "quiet-hours" };
    }
  }

  if (suggestion.source === "confirmed-habit") {
    const sentToday = history.filter((event) => event.source === "confirmed-habit")
      .filter((event) => notificationLocalDate(event.notifiedAt, settings.timezoneOffsetMinutes) === today)
      .length;
    if (sentToday >= settings.dailyHabitLimit) {
      return { eligible: false, reason: "daily-habit-limit" };
    }
  }

  return { eligible: true };
}

export function isWithinQuietHours(
  now: Date,
  start: string,
  end: string,
  timezoneOffsetMinutes = 0
): boolean {
  if (!isClockTime(start) || !isClockTime(end) || start === end) {
    return false;
  }
  const shifted = new Date(validDateMs(now) + normalizeOffset(timezoneOffsetMinutes) * 60_000);
  const current = `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}`;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function normalizeNotificationSettings(
  input: Partial<SuggestionNotificationSettings>
): SuggestionNotificationSettings {
  return {
    enabled: input.enabled === true,
    quietHoursStart: isClockTime(input.quietHoursStart) ? input.quietHoursStart : DEFAULT_SUGGESTION_NOTIFICATION_SETTINGS.quietHoursStart,
    quietHoursEnd: isClockTime(input.quietHoursEnd) ? input.quietHoursEnd : DEFAULT_SUGGESTION_NOTIFICATION_SETTINGS.quietHoursEnd,
    dailyHabitLimit: clampInteger(input.dailyHabitLimit, 0, 100, DEFAULT_SUGGESTION_NOTIFICATION_SETTINGS.dailyHabitLimit),
    timezoneOffsetMinutes: normalizeOffset(input.timezoneOffsetMinutes)
  };
}

function isPendingPresentable(habit: HabitCandidate, nowMs: number): boolean {
  if (!habit.lastPresentedAt) {
    return true;
  }
  const lastPresentedMs = Date.parse(habit.lastPresentedAt);
  return !Number.isFinite(lastPresentedMs) || nowMs - lastPresentedMs >= PENDING_PRESENTATION_INTERVAL_MS;
}

function isDue(question: OpenQuestion, nowMs: number): boolean {
  const reminderMs = Date.parse(question.reminderAt ?? "");
  if (!Number.isFinite(reminderMs) || reminderMs > nowMs) {
    return false;
  }
  const dismissedMs = Date.parse(question.reminderDismissedAt ?? "");
  return !Number.isFinite(dismissedMs) || dismissedMs < reminderMs;
}

function isUnresolvedQuestion(question: OpenQuestion): boolean {
  return question.status !== "candidate" && question.status !== "resolved" && question.status !== "ignored";
}

function questionPriorityBoost(question: OpenQuestion): number {
  return question.priority === "P1" ? 10 : question.priority === "P2" ? 5 : 0;
}

function notificationLocalDate(value: string, timezoneOffsetMinutes: number): string | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? localDateFor(new Date(timestamp), timezoneOffsetMinutes) : undefined;
}

function normalizePath(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
}

function normalizeOffset(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(-840, Math.min(840, Math.round(value ?? 0))) : 0;
}

function validDateMs(value: Date): number {
  return Number.isFinite(value.getTime()) ? value.getTime() : Date.now();
}

function isClockTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/u.test(value);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}
