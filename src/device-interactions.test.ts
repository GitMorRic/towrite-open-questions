import { describe, expect, expectTypeOf, it } from "vitest";
import {
  DEFAULT_DEVICE_BUTTON_MAPPINGS,
  buildDeviceGoUrl,
  buildDeviceInputUrl,
  compareDeviceCompletionGuard,
  completionGuardForDeviceEvent,
  isDeviceGestureEvent,
  isGuardedDeviceCompletionEvent,
  normalizeDeviceDisplayAcknowledgement,
  normalizeDeviceEventInput,
  shouldStartDailyOverviewForAction,
  type DeviceCommandAcknowledgement,
  type DeviceEventInput
} from "./device-interactions";

describe("device interaction protocol", () => {
  it("keeps local and Hub overview-open semantics identical", () => {
    expect(shouldStartDailyOverviewForAction("open_current")).toBe(true);
    expect(shouldStartDailyOverviewForAction("start_open")).toBe(true);
    expect(shouldStartDailyOverviewForAction("create_note")).toBe(false);
  });

  it("accepts a complete event only with the exact display guard", () => {
    const event = normalizeDeviceEventInput({
      schemaVersion: 2,
      eventId: "evt_0123456789abcdef0123456789abcdef",
      targetId: "target-ink",
      deviceId: "dev_0123456789abcdef0123456789abcdef",
      selectionId: "sel_0123456789abcdef0123456789abcdef",
      contentId: "cnt_0123456789abcdef0123456789abcdef",
      revisionId: "rev_0123456789abcdef0123456789abcdef",
      button: "right",
      gesture: "long",
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

  it.each([
    ["primary", "single", "open_current"],
    ["primary", "double", "create_note"],
    ["primary", "long", "record_reserved"],
    ["left", "single", "page_prev"],
    ["left", "double", "task_prev"],
    ["left", "long", "toggle_timer"],
    ["right", "single", "page_next"],
    ["right", "double", "task_next"],
    ["right", "long", "complete"]
  ])("maps schema-v2 %s %s without trusting an action supplied by firmware", (button, gesture, action) => {
    const event = normalizeDeviceEventInput({
      schemaVersion: 2,
      eventId: `evt_${button}_${gesture}`,
      targetId: "target-ink",
      deviceId: "dev_0123456789abcdef0123456789abcdef",
      selectionId: "sel_0123456789abcdef0123456789abcdef",
      contentId: "cnt_0123456789abcdef0123456789abcdef",
      revisionId: "rev_0123456789abcdef0123456789abcdef",
      button,
      gesture,
      action: "later",
      cardId: "daily-plan:daily_abc",
      stateVersion: 7,
      playlistRevision: "einkrev_0123abcd"
    }, DEFAULT_DEVICE_BUTTON_MAPPINGS);
    expect(event.action).toBe(action);
    expect(isDeviceGestureEvent(event)).toBe(true);
    if (isDeviceGestureEvent(event)) {
      expectTypeOf(event.schemaVersion).toEqualTypeOf<2 | 3>();
      expectTypeOf(event.button).toEqualTypeOf<"primary" | "left" | "right">();
    }
  });

  it.each([
    ["primary", "single", "open_current"],
    ["primary", "double", "create_note"],
    ["primary", "long", "record_reserved"],
    ["left", "single", "page_next"],
    ["left", "double", "page_prev"],
    ["left", "long", "toggle_timer"],
    ["right", "single", "item_next"],
    ["right", "double", "item_prev"],
    ["right", "long", "complete"]
  ])("maps schema-v3 %s %s to page, item, or confirm roles", (button, gesture, action) => {
    const event = normalizeDeviceEventInput({
      schemaVersion: 3,
      eventId: `evt_v3_${button}_${gesture}`,
      targetId: "target-ink",
      deviceId: "dev_0123456789abcdef0123456789abcdef",
      selectionId: "sel_0123456789abcdef0123456789abcdef",
      contentId: "cnt_0123456789abcdef0123456789abcdef",
      revisionId: "rev_0123456789abcdef0123456789abcdef",
      button,
      gesture,
      action: "later",
      cardId: "daily-plan:daily_abc",
      stateVersion: 7,
      playlistRevision: "einkrev_0123abcd"
    }, DEFAULT_DEVICE_BUTTON_MAPPINGS);
    expect(event.action).toBe(action);
    expect(isDeviceGestureEvent(event)).toBe(true);
  });

  it("does not narrow an incomplete v2 event and exposes the command acknowledgement contract", () => {
    const incomplete: DeviceEventInput = {
      schemaVersion: 2,
      eventId: "evt_incomplete",
      targetId: "desk",
      button: "primary",
      gesture: "single",
      action: "open_current"
    };
    expect(isDeviceGestureEvent(incomplete)).toBe(false);

    const acknowledgement: DeviceCommandAcknowledgement = {
      eventId: "evt_complete",
      status: "executed",
      action: "open_current",
      message: "Opened",
      resultRevision: "dtr_after"
    };
    expect(acknowledgement).toMatchObject({
      status: "executed",
      action: "open_current",
      resultRevision: "dtr_after"
    });
  });

  it("normalizes an explicit display acknowledgement tuple", () => {
    expect(normalizeDeviceDisplayAcknowledgement({
      event_id: "evt_ack_1",
      device_id: "dev_0123456789abcdef0123456789abcdef",
      selection_id: "sel_0123456789abcdef0123456789abcdef",
      state_version: 7,
      content_id: "cnt_0123456789abcdef0123456789abcdef",
      revision_id: "rev_0123456789abcdef0123456789abcdef",
      card_id: "daily-plan:daily_abc",
      playlist_revision: "einkrev_0123abcd",
      displayed_at: "2026-07-24T08:00:00+08:00",
      battery_percent: 76.4
    })).toMatchObject({
      eventId: "evt_ack_1",
      cardId: "daily-plan:daily_abc",
      stateVersion: 7,
      displayedAt: "2026-07-24T00:00:00.000Z",
      batteryPercent: 76
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
