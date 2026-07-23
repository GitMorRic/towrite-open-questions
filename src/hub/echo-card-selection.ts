import type { CaptureIntent } from "../capture";
import type { HubContentType } from "./types";
import { echoCardLocalId, type EchoCard } from "./echo-cards";

export type EchoCardSelectionMode = "manual" | "agent" | "rotation" | "schedule";
export type EchoCardCaptureIntent = Extract<CaptureIntent, "answer" | "new">;

export interface ScheduledEchoCardChoice {
  card: EchoCard;
  localId: string;
  occurrenceId: string;
  startsAt: Date;
}

/**
 * A display type alone never proves that an Echo card is backed by a stored
 * question. This keeps user-authored question-shaped cards on the safe generic
 * Capture path while preserving true question answers.
 */
export function echoCardCaptureIntent(
  contentType: HubContentType,
  hasBackedQuestion: boolean
): EchoCardCaptureIntent {
  return contentType === "question_prompt" && hasBackedQuestion ? "answer" : "new";
}

/**
 * Applies only library/mode switches. Callers remain responsible for layout,
 * target authorization, and privacy checks. An explicit preferred selection
 * intentionally bypasses the library and current-mode switches.
 */
export function isEchoCardEligibleForMode(
  card: Pick<EchoCard, "inLibrary" | "agentEligible" | "rotationEligible" | "schedule">,
  mode: EchoCardSelectionMode,
  preferred = false
): boolean {
  if (preferred) return true;
  if (!card.inLibrary) return false;
  if (mode === "agent") return card.agentEligible;
  if (mode === "rotation") return card.rotationEligible;
  if (mode === "schedule") return card.schedule?.enabled === true;
  return true;
}

/** Selects the first active, not-yet-consumed Echo schedule occurrence. */
export function scheduledEchoCardChoice(
  cards: readonly EchoCard[],
  now: Date,
  consumedOccurrenceIds: string | readonly string[] = ""
): ScheduledEchoCardChoice | undefined {
  const consumed = new Set(typeof consumedOccurrenceIds === "string"
    ? [consumedOccurrenceIds].filter(Boolean)
    : consumedOccurrenceIds);
  for (const card of cards) {
    if (!isEchoCardEligibleForMode(card, "schedule")) continue;
    const schedule = card.schedule;
    if (!schedule) continue;
    const clock = parseLocalClock(schedule.localTime);
    if (!clock) continue;

    for (const dayOffset of [0, -1]) {
      const startsAt = new Date(now);
      startsAt.setDate(now.getDate() + dayOffset);
      startsAt.setHours(clock.hours, clock.minutes, 0, 0);
      if (!schedule.weekdays.includes(startsAt.getDay())) continue;

      const endsAt = new Date(startsAt.getTime() + clampDuration(schedule.durationMinutes) * 60_000);
      if (now.getTime() < startsAt.getTime() || now.getTime() >= endsAt.getTime()) continue;

      const occurrenceId = `${echoCardLocalId(card)}:${localDateKey(startsAt)}:${schedule.localTime}`;
      if (consumed.has(occurrenceId)) break;
      return {
        card,
        localId: echoCardLocalId(card),
        occurrenceId,
        startsAt
      };
    }
  }
  return undefined;
}

function parseLocalClock(value: string): { hours: number; minutes: number } | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/u.exec(value);
  if (!match) return undefined;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

function clampDuration(value: number): number {
  return Number.isInteger(value) ? Math.max(5, Math.min(1_440, value)) : 30;
}

function localDateKey(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0")
  ].join("-");
}
