import { describe, expect, it } from "vitest";
import type { EchoCard } from "./echo-cards";
import type { DeviceLibraryEntry } from "./library";
import {
  buildDevicePagingPool,
  nextDevicePagingItem,
  prioritizeDevicePagingPool
} from "./device-paging";

describe("device paging", () => {
  it("places saved rotation Echo cards before eligible annotations in stable input order", () => {
    const pool = buildDevicePagingPool([
      echoCard(1),
      echoCard(2, { rotationEligible: false }),
      echoCard(3),
      echoCard(4, { inLibrary: false })
    ], [
      entry("question-b"),
      entry("question-hidden", { eligible: false }),
      entry("question-a")
    ]);

    expect(pool).toEqual([
      `echo-card:${echoId(1)}`,
      `echo-card:${echoId(3)}`,
      "question-b",
      "question-a"
    ]);
  });

  it("applies availability filtering and de-duplicates local IDs", () => {
    const first = echoCard(1);
    const pool = buildDevicePagingPool(
      [first, { ...first }],
      [entry("question-a"), entry("question-a"), entry("question-offline")],
      (localId) => localId !== "question-offline"
    );

    expect(pool).toEqual([`echo-card:${first.id}`, "question-a"]);
  });

  it("selects the item after current and wraps the final item", () => {
    const pool = ["echo-card:a", "question-a", "question-b"];
    expect(nextDevicePagingItem(pool, "echo-card:a")).toBe("question-a");
    expect(nextDevicePagingItem(pool, "question-b")).toBe("echo-card:a");
    expect(nextDevicePagingItem(pool, "missing")).toBe("echo-card:a");
    expect(nextDevicePagingItem([], "missing")).toBeUndefined();
  });

  it("rotates to preferred, otherwise current, without mutating or injecting IDs", () => {
    const pool = ["echo-card:a", "question-a", "question-b"];
    expect(prioritizeDevicePagingPool(pool, "question-b", "question-a")).toEqual([
      "question-b",
      "echo-card:a",
      "question-a"
    ]);
    expect(prioritizeDevicePagingPool(pool, "missing", "question-a")).toEqual([
      "question-a",
      "question-b",
      "echo-card:a"
    ]);
    expect(prioritizeDevicePagingPool(pool, "missing", "also-missing")).toEqual(pool);
    expect(pool).toEqual(["echo-card:a", "question-a", "question-b"]);
  });
});

function echoId(index: number): string {
  return `echo_${index.toString(36).padStart(22, "a")}`;
}

function echoCard(index: number, patch: Partial<EchoCard> = {}): EchoCard {
  return {
    id: echoId(index),
    name: `Card ${index}`,
    inLibrary: true,
    contentType: "excerpt",
    typeLabel: "Echo",
    subject: "",
    context: "",
    content: `Content ${index}`,
    whyNow: "",
    sourceLabel: "",
    disclosure: "none",
    actions: ["open"],
    agentEligible: false,
    rotationEligible: true,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
    ...patch
  };
}

function entry(id: string, patch: Partial<DeviceLibraryEntry> = {}): DeviceLibraryEntry {
  return {
    id,
    title: id,
    lane: "think",
    membership: "included",
    inLibrary: true,
    eligible: true,
    agentEligible: true,
    rotationEligible: true,
    ...patch
  };
}
