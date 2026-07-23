import type { OpenQuestion } from "../core/types";
import type { HubDeviceState } from "./types";
import { describe, expect, it } from "vitest";
import {
  buildDeviceLibrary,
  canAdvanceRotation,
  canManuallySendDeviceLibraryEntry,
  isManualHoldActive,
  nextRotationCursor,
  rotationChoice,
  scheduledLibraryChoice
} from "./library";

describe("Device content library", () => {
  it("automatically includes active selection cards without copying their body", () => {
    const snapshot = buildDeviceLibrary([question("one")], options());
    expect(snapshot.eligibleCount).toBe(1);
    expect(snapshot.entries[0]).toMatchObject({ id: "one", membership: "auto", inLibrary: true, eligible: true });
    expect(snapshot.entries[0]).not.toHaveProperty("body");
  });

  it("keeps an explicit exclusion out after rebuilding and drops inactive cards", () => {
    const excluded = question("excluded", { deliveryPolicy: { membership: "excluded" } });
    const resolved = question("resolved", { status: "resolved" });
    const snapshot = buildDeviceLibrary([excluded, resolved], options());
    expect(snapshot.eligibleCount).toBe(0);
    expect(snapshot.entries.map((entry) => entry.exclusionReason)).toEqual(["not-selected", "inactive"]);
  });

  it("keeps privacy-filtered and unsupported sources visible but ineligible", () => {
    const privateCard = question("private");
    const pdf = question("pdf", { source: { ...question("pdf").source, file: "paper.pdf" } });
    const snapshot = buildDeviceLibrary([privateCard, pdf], {
      ...options(),
      isPrivacyAllowed: (item) => item.id !== "private"
    });
    expect(snapshot.eligibleCount).toBe(0);
    expect(snapshot.excludedCount).toBe(2);
  });

  it("allows an explicit send before library inclusion without bypassing policy exclusions", () => {
    const notSelected = buildDeviceLibrary([question("manual")], {
      ...options(),
      autoAddSelections: false
    }).entries[0];
    const included = buildDeviceLibrary([question("included", {
      deliveryPolicy: { membership: "included" }
    })], options()).entries[0];

    expect(notSelected.exclusionReason).toBe("not-selected");
    expect(canManuallySendDeviceLibraryEntry(notSelected)).toBe(true);
    expect(canManuallySendDeviceLibraryEntry(included)).toBe(true);
    expect(canManuallySendDeviceLibraryEntry({ ...notSelected, exclusionReason: "privacy" })).toBe(false);
    expect(canManuallySendDeviceLibraryEntry({ ...notSelected, exclusionReason: "unsupported-source" })).toBe(false);
    expect(canManuallySendDeviceLibraryEntry({ ...notSelected, exclusionReason: "inactive" })).toBe(false);
    expect(canManuallySendDeviceLibraryEntry(undefined)).toBe(false);
  });

  it("rotates in stable order and advances to the entry after the acknowledged one", () => {
    const snapshot = buildDeviceLibrary([
      question("b", { createdAt: "2026-01-02T00:00:00.000Z" }),
      question("a", { createdAt: "2026-01-01T00:00:00.000Z" })
    ], options());
    expect(rotationChoice(snapshot.entries, 0)?.id).toBe("a");
    expect(nextRotationCursor(snapshot.entries, "a")).toBe(1);
    expect(rotationChoice(snapshot.entries, 1)?.id).toBe("b");
  });

  it("matches daily schedule windows that cross midnight and de-duplicates occurrences", () => {
    const scheduled = question("night", {
      deliveryPolicy: {
        membership: "included",
        schedule: { enabled: true, weekdays: [0], localTime: "23:50", durationMinutes: 30 }
      }
    });
    const snapshot = buildDeviceLibrary([scheduled], options("schedule"));
    const now = new Date(2026, 6, 20, 0, 5, 0); // Monday, inside Sunday's window.
    const choice = scheduledLibraryChoice(snapshot.entries, now);
    expect(choice?.entry.id).toBe("night");
    expect(scheduledLibraryChoice(snapshot.entries, now, choice?.occurrenceId)).toBeUndefined();
  });

  it("does not cycle through already consumed overlapping schedule occurrences", () => {
    const schedule = { enabled: true, weekdays: [1], localTime: "10:00", durationMinutes: 30 };
    const snapshot = buildDeviceLibrary([
      question("first", { deliveryPolicy: { membership: "included", schedule } }),
      question("second", { deliveryPolicy: { membership: "included", schedule } })
    ], options("schedule"));
    const now = new Date(2026, 6, 20, 10, 5, 0);
    const first = scheduledLibraryChoice(snapshot.entries, now);
    const second = scheduledLibraryChoice(snapshot.entries, now, [first!.occurrenceId]);
    expect(second?.entry.id).not.toBe(first?.entry.id);
    expect(scheduledLibraryChoice(snapshot.entries, now, [first!.occurrenceId, second!.occurrenceId])).toBeUndefined();
  });

  it("treats a future manual hold as active", () => {
    expect(isManualHoldActive("2026-07-20T10:01:00.000Z", new Date("2026-07-20T10:00:00.000Z"))).toBe(true);
    expect(isManualHoldActive("2026-07-20T09:59:00.000Z", new Date("2026-07-20T10:00:00.000Z"))).toBe(false);
  });

  it("advances rotation only after the exact displayed ACK and dwell interval", () => {
    const now = new Date("2026-07-20T10:31:00.000Z");
    const state: HubDeviceState = {
      protocolVersion: "1",
      deviceId: "dev_test",
      online: true,
      selected: {
        protocolVersion: "1",
        selectionId: "sel_a",
        deliveryId: "dlv_a",
        deviceId: "dev_test",
        selectedContentId: "cnt_a",
        selectedRevisionId: "rev_a",
        stateVersion: 4,
        selectedAt: "2026-07-20T09:55:00.000Z",
        reason: "policy"
      }
    };
    expect(canAdvanceRotation(state, "cnt_a", 30, now)).toBe(false);
    state.displayed = {
      selectionId: "sel_a",
      contentId: "cnt_a",
      revisionId: "rev_a",
      stateVersion: 4,
      displayedAt: "2026-07-20T10:02:00.000Z"
    };
    expect(canAdvanceRotation(state, "cnt_a", 30, now)).toBe(false);
    state.displayed.displayedAt = "2026-07-20T10:01:00.000Z";
    expect(canAdvanceRotation(state, "cnt_a", 30, now)).toBe(true);
    state.displayed.selectionId = "sel_old";
    expect(canAdvanceRotation(state, "cnt_a", 30, now)).toBe(false);
  });
});

function options(mode: "manual" | "agent" | "rotation" | "schedule" = "agent") {
  return {
    mode,
    autoAddSelections: true,
    rotationIntervalMinutes: 30
  } as const;
}

function question(id: string, patch: Partial<OpenQuestion> = {}): OpenQuestion {
  return {
    id,
    lane: "think",
    status: "open",
    kind: "other",
    tags: [],
    color: "amber",
    question: `Question ${id}`,
    title: `Title ${id}`,
    source: {
      file: `${id}.md`,
      headingPath: [],
      lineStart: 0,
      lineEnd: 0,
      rule: "selection"
    },
    ...patch
  };
}
