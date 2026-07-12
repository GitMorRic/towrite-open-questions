import { describe, expect, it } from "vitest";
import type { OpenQuestion } from "../core/types";
import type { HabitCandidate } from "../learning/types";
import { SuggestionService, checkNotificationEligibility, isWithinQuietHours } from "./service";
import type { ProactiveSuggestion, SuggestionNotificationEvent } from "./types";

describe("SuggestionService", () => {
  it("combines due reminders, active-file work, confirmed habits, and pending candidates", () => {
    const service = new SuggestionService();
    const suggestions = service.build({
      questions,
      habits: [acceptedHabit, pendingHabit, dismissedHabit],
      activeFile: "Projects/Active.md",
      now: new Date("2026-07-07T19:00:00.000Z"),
      timezoneOffsetMinutes: 0
    });

    expect(suggestions.map((suggestion) => suggestion.source)).toEqual([
      "due-reminder",
      "confirmed-habit",
      "active-question",
      "habit-candidate"
    ]);
    expect(suggestions.filter((suggestion) => suggestion.questionId === "due")).toHaveLength(1);
    expect(suggestions.find((suggestion) => suggestion.source === "confirmed-habit")).toMatchObject({
      habitId: "accepted",
      workflowStageId: "processing"
    });
    expect(suggestions.some((suggestion) => suggestion.questionId === "resolved")).toBe(false);
    expect(suggestions.some((suggestion) => suggestion.habitId === "dismissed")).toBe(false);
  });

  it("does not show a reminder dismissed after its current due time", () => {
    const suggestions = new SuggestionService().build({
      questions: [{
        ...questions[0],
        reminderDismissedAt: "2026-07-07T18:30:00.000Z"
      }],
      habits: [],
      activeFile: "",
      now: new Date("2026-07-07T19:00:00.000Z")
    });
    expect(suggestions).toEqual([]);
  });
});

describe("suggestion notification eligibility", () => {
  const due = suggestion("due-reminder", "due:one");
  const habit = suggestion("confirmed-habit", "habit:one");
  const active = suggestion("active-question", "active:one");
  const enabled = {
    enabled: true,
    quietHoursStart: "23:00",
    quietHoursEnd: "08:00",
    dailyHabitLimit: 3,
    timezoneOffsetMinutes: 0
  };

  it("is disabled by default and never notifies unconfirmed sources", () => {
    expect(checkNotificationEligibility(due, {}, [], new Date("2026-07-07T20:00:00.000Z")))
      .toEqual({ eligible: false, reason: "notifications-disabled" });
    expect(checkNotificationEligibility(active, enabled, [], new Date("2026-07-07T20:00:00.000Z")))
      .toEqual({ eligible: false, reason: "source-not-allowed" });
  });

  it("holds even due reminders in quiet hours unless that reminder opts in", () => {
    const now = new Date("2026-07-07T23:30:00.000Z");
    expect(checkNotificationEligibility(due, enabled, [], now))
      .toEqual({ eligible: false, reason: "quiet-hours" });
    expect(checkNotificationEligibility({ ...due, allowDuringQuietHours: true }, enabled, [], now))
      .toEqual({ eligible: true });
  });

  it("applies the timezone offset to overnight quiet hours", () => {
    expect(isWithinQuietHours(new Date("2026-07-07T15:30:00.000Z"), "23:00", "08:00", 480)).toBe(true);
    expect(isWithinQuietHours(new Date("2026-07-07T12:00:00.000Z"), "23:00", "08:00", 480)).toBe(false);
  });

  it("caps confirmed-habit notifications at three per local day", () => {
    const history: SuggestionNotificationEvent[] = [0, 1, 2].map((index) => ({
      suggestionId: `habit:previous-${index}`,
      source: "confirmed-habit",
      habitId: `previous-${index}`,
      notifiedAt: `2026-07-07T${10 + index}:00:00.000Z`
    }));
    expect(checkNotificationEligibility(habit, enabled, history, new Date("2026-07-07T20:00:00.000Z")))
      .toEqual({ eligible: false, reason: "daily-habit-limit" });
    expect(checkNotificationEligibility(due, enabled, history, new Date("2026-07-07T20:00:00.000Z")))
      .toEqual({ eligible: true });
  });

  it("does not notify the same suggestion twice in one day", () => {
    const history: SuggestionNotificationEvent[] = [{
      suggestionId: habit.id,
      source: "confirmed-habit",
      habitId: habit.habitId,
      notifiedAt: "2026-07-07T10:00:00.000Z"
    }];
    expect(checkNotificationEligibility(habit, enabled, history, new Date("2026-07-07T20:00:00.000Z")))
      .toEqual({ eligible: false, reason: "already-notified-today" });
  });
});

const questions: OpenQuestion[] = [
  question({
    id: "due",
    question: "Due question",
    reminderAt: "2026-07-07T18:00:00.000Z",
    priority: "P1"
  }),
  question({
    id: "active",
    question: "Active unresolved question"
  }),
  question({
    id: "other-file",
    question: "Other file question",
    source: { file: "Projects/Other.md" }
  }),
  question({
    id: "resolved",
    question: "Resolved question",
    status: "resolved"
  })
];

const acceptedHabit = habitCandidate("accepted", "accepted");
const pendingHabit = habitCandidate("pending", "pending");
const dismissedHabit = habitCandidate("dismissed", "dismissed");

function question(
  overrides: Omit<Partial<OpenQuestion>, "source"> & {
    id: string;
    question: string;
    source?: Partial<OpenQuestion["source"]>;
  }
): OpenQuestion {
  const { source, ...rest } = overrides;
  return {
    lane: "write",
    status: "open",
    kind: "todo",
    tags: [],
    color: "sky",
    source: {
      file: "Projects/Active.md",
      headingPath: [],
      lineStart: 0,
      lineEnd: 0,
      rule: "selection",
      ...(source ?? {})
    },
    ...rest
  };
}

function habitCandidate(status: HabitCandidate["status"], id: string): HabitCandidate {
  return {
    id,
    fingerprint: `time-stage|${id}`,
    label: `${id} habit`,
    description: "Pattern evidence",
    rule: {
      kind: "time-stage",
      workflowStageId: "processing",
      timeWindow: { startHour: 18, endHour: 21 }
    },
    evidence: {
      sampleSize: 5,
      matchingSamples: 4,
      distinctDays: 3,
      ratio: 0.8,
      firstSeenAt: "2026-07-01T18:00:00.000Z",
      lastSeenAt: "2026-07-03T19:00:00.000Z"
    },
    status,
    origin: "rules",
    createdAt: "2026-07-03T20:00:00.000Z",
    updatedAt: "2026-07-03T20:00:00.000Z",
    lastDetectedAt: "2026-07-03T20:00:00.000Z"
  };
}

function suggestion(source: ProactiveSuggestion["source"], id: string): ProactiveSuggestion {
  return {
    id,
    source,
    priority: 50,
    title: id,
    triggerReason: "test",
    allowedActions: [],
    generatedAt: "2026-07-07T20:00:00.000Z",
    habitId: source === "confirmed-habit" ? id : undefined
  };
}
