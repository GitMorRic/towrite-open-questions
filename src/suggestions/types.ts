import type { OpenQuestionPriority } from "../core/types";
import type { HabitEvidence, HabitRule } from "../learning/types";

export type ProactiveSuggestionSource =
  | "due-reminder"
  | "active-question"
  | "confirmed-habit"
  | "habit-candidate";

export type ProactiveSuggestionAction =
  | "open-source"
  | "snooze"
  | "later"
  | "dismiss"
  | "accept"
  | "edit"
  | "view-evidence"
  | "start-capture";

export interface ProactiveSuggestion {
  id: string;
  source: ProactiveSuggestionSource;
  priority: number;
  title: string;
  detail?: string;
  triggerReason: string;
  allowedActions: ProactiveSuggestionAction[];
  generatedAt: string;
  questionId?: string;
  questionPriority?: OpenQuestionPriority;
  habitId?: string;
  sourceFile?: string;
  reminderAt?: string;
  workflowStageId?: string;
  articleTypeId?: string;
  habitRule?: HabitRule;
  evidence?: HabitEvidence;
  /** Due reminders opt in individually; the default is false. */
  allowDuringQuietHours?: boolean;
}

export interface SuggestionNotificationSettings {
  enabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  dailyHabitLimit: number;
  /** Minutes east of UTC. */
  timezoneOffsetMinutes: number;
}

export const DEFAULT_SUGGESTION_NOTIFICATION_SETTINGS: SuggestionNotificationSettings = {
  enabled: false,
  quietHoursStart: "23:00",
  quietHoursEnd: "08:00",
  dailyHabitLimit: 3,
  timezoneOffsetMinutes: 0
};

export interface SuggestionNotificationEvent {
  suggestionId: string;
  source: ProactiveSuggestionSource;
  notifiedAt: string;
  habitId?: string;
}

export type NotificationIneligibilityReason =
  | "notifications-disabled"
  | "source-not-allowed"
  | "quiet-hours"
  | "daily-habit-limit"
  | "already-notified-today";

export type NotificationEligibility =
  | { eligible: true }
  | { eligible: false; reason: NotificationIneligibilityReason };
