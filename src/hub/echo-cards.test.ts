import { describe, expect, it } from "vitest";
import type { EchoCard } from "./echo-cards";
import {
  ECHO_CARD_HARD_LIMITS,
  ECHO_CARD_MAX_COUNT,
  ECHO_CARD_REFERENCE_PRESETS,
  clonePreset,
  composeEchoCardDisplay,
  createEmptyEchoCard,
  createEchoCardId,
  echoCardActionLabels,
  echoCardLocalId,
  echoCardWeightedUnits,
  isEchoCardId,
  normalizeEchoCards,
  parseEchoCardLocalId,
  validateEchoCardLayout
} from "./echo-cards";

describe("Echo card model", () => {
  it("exports immutable localized references without activating them as settings", () => {
    expect(ECHO_CARD_REFERENCE_PRESETS.map((preset) => preset.presetId)).toEqual([
      "memory",
      "place",
      "unfinished",
      "insight",
      "character",
      "world_l0",
      "world_l1",
      "world_l2"
    ]);
    expect(ECHO_CARD_REFERENCE_PRESETS.every((preset) => preset.locale === "zh-CN")).toBe(true);
    expect(Object.isFrozen(ECHO_CARD_REFERENCE_PRESETS)).toBe(true);
    expect(Object.isFrozen(ECHO_CARD_REFERENCE_PRESETS[0])).toBe(true);
    expect(Object.isFrozen(ECHO_CARD_REFERENCE_PRESETS[0].actions)).toBe(true);
    expect(ECHO_CARD_REFERENCE_PRESETS.find((preset) => preset.presetId === "place")?.contentType).toBe("excerpt");
    expect(ECHO_CARD_REFERENCE_PRESETS.find((preset) => preset.presetId === "insight")?.contentType).toBe("excerpt");
    expect(ECHO_CARD_REFERENCE_PRESETS.filter((preset) => preset.presetId.startsWith("world_"))
      .every((preset) => preset.contentType === "note_continue")).toBe(true);
    expect(ECHO_CARD_REFERENCE_PRESETS.every((preset) => validateEchoCardLayout(preset).fits)).toBe(true);
  });

  it("clones a reference into an independent saved-paging draft without enabling Agent", () => {
    const cloned = clonePreset("character", {
      id: validId(1),
      now: "2026-07-23T01:02:03.000Z"
    });
    expect(cloned).toMatchObject({
      id: validId(1),
      contentType: "character_letter",
      disclosure: "ai_perspective",
      inLibrary: true,
      agentEligible: false,
      rotationEligible: true,
      createdAt: "2026-07-23T01:02:03.000Z",
      updatedAt: "2026-07-23T01:02:03.000Z"
    });
    expect(cloned.actions).not.toBe(ECHO_CARD_REFERENCE_PRESETS[4].actions);
    cloned.actions[0] = "open";
    expect(ECHO_CARD_REFERENCE_PRESETS[4].actions[0]).toBe("respond");
  });

  it("creates 128-bit base64url IDs and round-trips local IDs", () => {
    const crypto = {
      getRandomValues<T extends ArrayBufferView | null>(array: T): T {
        if (array instanceof Uint8Array) array.fill(0xff);
        return array;
      }
    } as Pick<Crypto, "getRandomValues">;
    const id = createEchoCardId(crypto);
    expect(id).toBe("echo______________________w");
    expect(isEchoCardId(id)).toBe(true);
    expect(parseEchoCardLocalId(echoCardLocalId(id))).toBe(id);
    expect(parseEchoCardLocalId(`question:${id}`)).toBeUndefined();
    expect(() => echoCardLocalId("echo_short")).toThrow("Invalid Echo card ID");
  });

  it("creates a blank draft without silently enabling any delivery mode", () => {
    const draft = createEmptyEchoCard({ id: validId(9), now: "2026-07-23T04:00:00Z" });
    expect(draft).toMatchObject({
      id: validId(9),
      name: "未命名卡片",
      contentType: "blank_capture",
      typeLabel: "快速记录",
      content: "",
      actions: ["capture", "later"],
      inLibrary: false,
      agentEligible: false,
      rotationEligible: false,
      createdAt: "2026-07-23T04:00:00.000Z"
    });
  });

  it("preserves an intentionally empty list, user order and first duplicate while limiting to 50", () => {
    expect(normalizeEchoCards([])).toEqual([]);
    const input = [card(2), card(1), card(2), ...Array.from({ length: 60 }, (_, index) => card(index + 10))];
    const result = normalizeEchoCards(input);
    expect(result).toHaveLength(ECHO_CARD_MAX_COUNT);
    expect(result.slice(0, 3).map((item) => item.id)).toEqual([validId(2), validId(1), validId(10)]);
  });

  it("rejects malformed stable IDs and unsupported Hub enum values", () => {
    expect(normalizeEchoCards([
      card(1, { id: "echo_too-short" }),
      card(2, { contentType: "invented_type" as EchoCard["contentType"] }),
      card(3)
    ]).map((item) => item.id)).toEqual([validId(3)]);
  });

  it("deep-clones, strips controls, applies hard limits and keeps at most three known actions", () => {
    const input = card(4, {
      name: "  Card\u0000\n name  ",
      content: `${"海".repeat(ECHO_CARD_HARD_LIMITS.content + 10)}\u0007`,
      actions: ["open", "open", "respond", "invalid" as EchoCard["actions"][number], "later", "skip"],
      schedule: { enabled: true, weekdays: [5, 1, 5], localTime: "15:30", durationMinutes: 2 }
    });
    const normalized = normalizeEchoCards([input])[0];
    expect(normalized.name).toBe("Card name");
    expect(Array.from(normalized.content)).toHaveLength(ECHO_CARD_HARD_LIMITS.content);
    expect(normalized.content).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/u);
    expect(normalized.actions).toEqual(["open", "respond", "later"]);
    expect(normalized.schedule).toEqual({ enabled: true, weekdays: [1, 5], localTime: "15:30", durationMinutes: 5 });
    expect(normalized.schedule).not.toBe(input.schedule);
    input.schedule!.weekdays.push(6);
    expect(normalized.schedule?.weekdays).toEqual([1, 5]);
  });

  it("keeps persisted cards opt-in when old or malformed booleans are supplied", () => {
    const normalized = normalizeEchoCards([{
      ...card(5),
      inLibrary: "yes",
      agentEligible: 1,
      rotationEligible: null
    }])[0];
    expect(normalized).toMatchObject({ inLibrary: false, agentEligible: false, rotationEligible: false });
  });
});

describe("Echo card display", () => {
  it("composes the existing title/body/prompt protocol and forces disclosure into the title", () => {
    const display = composeEchoCardDisplay(card(1, {
      typeLabel: "理解回响",
      subject: "林屿",
      context: "三条已知事实",
      content: "这是一种候选理解",
      whyNow: "为什么此刻出现",
      sourceLabel: "依据：3 条原文",
      disclosure: "ai_inference"
    }));
    expect(display).toEqual({
      title: "理解回响 · AI 推测 · 林屿",
      body: "三条已知事实\n\n这是一种候选理解",
      prompt: "为什么此刻出现 · 依据：3 条原文"
    });
  });

  it("uses contextual action labels while retaining existing Hub actions", () => {
    expect(echoCardActionLabels(card(1, {
      actions: ["respond", "open", "skip"],
      disclosure: "ai_perspective"
    }))).toEqual([
      { action: "respond", label: "回答" },
      { action: "open", label: "打开" },
      { action: "skip", label: "不像她" }
    ]);
    expect(echoCardActionLabels(card(2, {
      actions: ["useful", "open", "skip"],
      disclosure: "ai_simulation"
    }))[0]).toEqual({ action: "useful", label: "保留可能" });
  });

  it("uses full-width and line-break weights and reports whether a 2.7-inch layout fits", () => {
    expect(echoCardWeightedUnits("AB海\n")).toBe(12);
    const short = validateEchoCardLayout(card(1, {
      typeLabel: "记忆回响",
      subject: "林屿",
      context: "去年今天",
      content: "她讨厌等待。",
      whyNow: "现在还认同吗？",
      sourceLabel: "来自原文"
    }));
    expect(short.fits).toBe(true);
    const long = validateEchoCardLayout(card(2, {
      content: "海".repeat(121),
      actions: ["capture", "open", "later", "skip"]
    }));
    expect(long.fits).toBe(false);
    expect(long.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "content", code: "too-long" }),
      expect.objectContaining({ field: "actions", code: "too-many-actions" })
    ]));
  });

  it("flags a card with no single core message", () => {
    const validation = validateEchoCardLayout(card(3, { content: "" }));
    expect(validation.issues).toContainEqual(expect.objectContaining({ field: "content", code: "missing-core" }));
  });
});

function card(index: number, patch: Partial<EchoCard> = {}): EchoCard {
  return {
    id: validId(index),
    name: `Card ${index}`,
    inLibrary: false,
    contentType: "note_continue",
    typeLabel: "创作回响",
    subject: "项目",
    context: "一句上下文",
    content: "一条真正值得注意的内容",
    whyNow: "为什么此刻出现",
    sourceLabel: "来自用户笔记",
    disclosure: "none",
    actions: ["capture", "open", "later"],
    targetPath: "Projects/Story.md",
    agentEligible: false,
    rotationEligible: false,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
    ...patch
  };
}

function validId(index: number): string {
  return `echo_${index.toString(36).padStart(22, "a")}`;
}
