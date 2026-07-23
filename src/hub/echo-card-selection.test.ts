import { describe, expect, it } from "vitest";
import type { EchoCard } from "./echo-cards";
import {
  echoCardCaptureIntent,
  isEchoCardEligibleForMode,
  scheduledEchoCardChoice
} from "./echo-card-selection";

describe("Echo card selection", () => {
  it("answers only a real backed question prompt", () => {
    expect(echoCardCaptureIntent("question_prompt", true)).toBe("answer");
    expect(echoCardCaptureIntent("question_prompt", false)).toBe("new");
    expect(echoCardCaptureIntent("note_continue", true)).toBe("new");
    expect(echoCardCaptureIntent("blank_capture", false)).toBe("new");
  });

  it("applies library and mode switches unless the card is explicitly preferred", () => {
    const disabled = card(1, {
      inLibrary: false,
      agentEligible: false,
      rotationEligible: false,
      schedule: undefined
    });
    expect(isEchoCardEligibleForMode(disabled, "manual")).toBe(false);
    expect(isEchoCardEligibleForMode(disabled, "agent")).toBe(false);
    expect(isEchoCardEligibleForMode(disabled, "rotation")).toBe(false);
    expect(isEchoCardEligibleForMode(disabled, "schedule")).toBe(false);
    expect(isEchoCardEligibleForMode(disabled, "schedule", true)).toBe(true);

    const enabled = card(2, {
      inLibrary: true,
      agentEligible: false,
      rotationEligible: false,
      schedule: schedule("15:00")
    });
    expect(isEchoCardEligibleForMode(enabled, "manual")).toBe(true);
    expect(isEchoCardEligibleForMode(enabled, "agent")).toBe(false);
    expect(isEchoCardEligibleForMode(enabled, "rotation")).toBe(false);
    expect(isEchoCardEligibleForMode(enabled, "schedule")).toBe(true);
    expect(isEchoCardEligibleForMode(enabled, "agent", true)).toBe(true);
  });

  it("selects an active same-day occurrence with a stable id and skips a consumed one", () => {
    const first = card(3, { schedule: schedule("15:00", [4], 30) });
    const second = card(4, { schedule: schedule("15:05", [4], 30) });
    const now = new Date(2026, 6, 23, 15, 10, 0); // Thursday in local time.

    const choice = scheduledEchoCardChoice([first, second], now);
    expect(choice).toMatchObject({
      card: first,
      localId: `echo-card:${first.id}`,
      occurrenceId: `echo-card:${first.id}:2026-07-23:15:00`
    });
    expect(choice?.startsAt).toEqual(new Date(2026, 6, 23, 15, 0, 0));

    const next = scheduledEchoCardChoice([first, second], now, choice?.occurrenceId);
    expect(next?.localId).toBe(`echo-card:${second.id}`);
    expect(scheduledEchoCardChoice([first, second], now, [choice!.occurrenceId, next!.occurrenceId])).toBeUndefined();
  });

  it("attributes a cross-midnight window to the schedule's previous local day", () => {
    const overnight = card(5, { schedule: schedule("23:50", [0], 30) });
    const monday = new Date(2026, 6, 20, 0, 5, 0);

    const choice = scheduledEchoCardChoice([overnight], monday);
    expect(choice).toMatchObject({
      localId: `echo-card:${overnight.id}`,
      occurrenceId: `echo-card:${overnight.id}:2026-07-19:23:50`
    });
    expect(choice?.startsAt).toEqual(new Date(2026, 6, 19, 23, 50, 0));
    expect(scheduledEchoCardChoice([overnight], monday, choice?.occurrenceId)).toBeUndefined();
    expect(scheduledEchoCardChoice([overnight], new Date(2026, 6, 20, 0, 20, 0))).toBeUndefined();
  });
});

function schedule(localTime: string, weekdays = [0, 1, 2, 3, 4, 5, 6], durationMinutes = 30) {
  return { enabled: true, weekdays, localTime, durationMinutes };
}

function card(index: number, patch: Partial<EchoCard> = {}): EchoCard {
  return {
    id: `echo_${String(index).padStart(22, "0")}`,
    name: `Card ${index}`,
    inLibrary: true,
    contentType: "note_continue",
    typeLabel: "Echo",
    subject: "Project",
    context: "Context",
    content: "Core",
    whyNow: "Why now",
    sourceLabel: "Source",
    disclosure: "none",
    actions: ["capture", "later"],
    agentEligible: true,
    rotationEligible: true,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
    ...patch
  };
}
