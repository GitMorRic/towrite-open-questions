import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEVICE_BUTTON_MAPPINGS,
  buildDeviceGoUrl,
  buildDeviceInputUrl,
  compareDeviceCompletionGuard,
  completionGuardForDeviceEvent,
  isGuardedDeviceCompletionEvent,
  normalizeDeviceEventInput
} from "./device-interactions";

describe("device interaction protocol", () => {
  it("accepts a complete event only with the exact display guard", () => {
    const event = normalizeDeviceEventInput({
      schemaVersion: 2,
      eventId: "evt_0123456789abcdef0123456789abcdef",
      targetId: "target-ink",
      deviceId: "dev_0123456789abcdef0123456789abcdef",
      action: "complete",
      cardId: "daily-plan:daily_abc",
      stateVersion: 7,
      playlistRevision: "einkrev_0123abcd"
    }, DEFAULT_DEVICE_BUTTON_MAPPINGS);

    expect(event).toMatchObject({
      schemaVersion: 2,
      action: "complete",
      cardId: "daily-plan:daily_abc",
      stateVersion: 7,
      playlistRevision: "einkrev_0123abcd"
    });
    expect(isGuardedDeviceCompletionEvent(event)).toBe(true);
    expect(completionGuardForDeviceEvent(event)).toEqual({
      cardId: "daily-plan:daily_abc",
      stateVersion: 7,
      playlistRevision: "einkrev_0123abcd"
    });
  });

  it("accepts snake-case completion guard fields from Hub-style firmware", () => {
    const event = normalizeDeviceEventInput({
      eventId: "evt_0123456789abcdef0123456789abcdef",
      targetId: "target-ink",
      action: "complete",
      card_id: "daily-plan:daily_abc",
      state_version: 8,
      playlist_revision: "einkrev_89abcdef"
    }, []);

    expect(completionGuardForDeviceEvent(event)).toEqual({
      cardId: "daily-plan:daily_abc",
      stateVersion: 8,
      playlistRevision: "einkrev_89abcdef"
    });
  });

  it.each([
    ["cardId", { stateVersion: 1, playlistRevision: "einkrev_1" }],
    ["stateVersion", { cardId: "daily-plan:a", playlistRevision: "einkrev_1" }],
    ["playlistRevision", { cardId: "daily-plan:a", stateVersion: 1 }],
    ["positive stateVersion", { cardId: "daily-plan:a", stateVersion: 0, playlistRevision: "einkrev_1" }],
    ["opaque cardId", { cardId: "daily plan a", stateVersion: 1, playlistRevision: "einkrev_1" }]
  ])("rejects complete without a valid %s", (_name, guard) => {
    expect(() => normalizeDeviceEventInput({
      eventId: "evt_0123456789abcdef0123456789abcdef",
      targetId: "target-ink",
      action: "complete",
      ...guard
    }, DEFAULT_DEVICE_BUTTON_MAPPINGS)).toThrow(/Complete requires/u);
  });

  it("preserves legacy mapped next/prev events without completion fields", () => {
    const next = normalizeDeviceEventInput({
      schemaVersion: 1,
      eventId: "legacy-next-1",
      targetId: "target-ink",
      button: "right"
    }, DEFAULT_DEVICE_BUTTON_MAPPINGS);
    const previous = normalizeDeviceEventInput({
      eventId: "legacy-prev-1",
      targetId: "target-ink",
      button: "left"
    }, DEFAULT_DEVICE_BUTTON_MAPPINGS);

    expect(next).toMatchObject({ action: "next", schemaVersion: 1 });
    expect(previous).toMatchObject({ action: "prev" });
    expect(completionGuardForDeviceEvent(next)).toBeUndefined();
    expect(next).not.toHaveProperty("cardId");
  });

  it("never serializes complete into a token-bearing GET URL", () => {
    expect(buildDeviceInputUrl("https://device.example", {
      token: "long-lived-token",
      targetId: "target-ink",
      intent: "complete"
    })).toBeUndefined();
    expect(buildDeviceGoUrl("https://device.example", {
      token: "long-lived-token",
      targetId: "target-ink",
      intent: "complete"
    })).toBeUndefined();
  });

  it("compares every completion guard dimension before a task mutation", () => {
    const current = {
      cardId: "daily-plan:a",
      stateVersion: 9,
      playlistRevision: "einkrev_current"
    };
    expect(compareDeviceCompletionGuard(current, current)).toEqual({ matches: true });
    expect(compareDeviceCompletionGuard({ ...current, cardId: "daily-plan:b" }, current))
      .toEqual({ matches: false, conflict: "card-changed" });
    expect(compareDeviceCompletionGuard({ ...current, stateVersion: 8 }, current))
      .toEqual({ matches: false, conflict: "state-changed" });
    expect(compareDeviceCompletionGuard({ ...current, playlistRevision: "einkrev_old" }, current))
      .toEqual({ matches: false, conflict: "playlist-changed" });
  });
});
