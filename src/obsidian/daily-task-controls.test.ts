import { describe, expect, it } from "vitest";
import {
  getDailyTaskControlUpdateStrategy,
  isOwnedDailyMetadataLine,
  summarizeDailyProperties
} from "./daily-task-controls";

describe("Daily editor task controls", () => {
  it("maps cached widgets during typing instead of rebuilding the Daily plan", () => {
    expect(getDailyTaskControlUpdateStrategy({
      docChanged: true,
      reconfigured: false,
      refreshRequested: false,
      selectionChanged: false
    })).toBe("map");
  });

  it("rebuilds only after an explicit cache refresh or editor reconfiguration", () => {
    expect(getDailyTaskControlUpdateStrategy({
      docChanged: false,
      reconfigured: false,
      refreshRequested: true,
      selectionChanged: false
    })).toBe("rebuild");
    expect(getDailyTaskControlUpdateStrategy({
      docChanged: false,
      reconfigured: true,
      refreshRequested: false,
      selectionChanged: false
    })).toBe("rebuild");
  });

  it("rebuilds presentation-only folds when the cursor enters metadata", () => {
    expect(getDailyTaskControlUpdateStrategy({
      docChanged: false,
      reconfigured: false,
      refreshRequested: false,
      selectionChanged: true
    })).toBe("rebuild");
  });

  it("folds only exact ToWrite-owned continuation lines", () => {
    expect(isOwnedDailyMetadataLine("  [towrite-kind:: task] [towrite-device:: none]")).toBe(true);
    expect(isOwnedDailyMetadataLine("  [towrite-target:: [[Echo 发布计划]]]")).toBe(true);
    expect(isOwnedDailyMetadataLine("  ^daily_1234567890abcdef1234567890abcdef")).toBe(true);
    expect(isOwnedDailyMetadataLine("  用户自己的说明")).toBe(false);
    expect(isOwnedDailyMetadataLine("  [towrite-custom:: keep this]")).toBe(false);
    expect(isOwnedDailyMetadataLine("- [ ] Task ^daily_1234567890abcdef1234567890abcdef")).toBe(false);
  });

  it("summarizes optional properties without exposing technical ids", () => {
    expect(summarizeDailyProperties({
      category: "写作和发布",
      dueDate: "2026-07-30",
      dueDateExplicit: true,
      estimateMinutes: 25,
      target: "[[Echo 发布计划]]",
      nextStep: "写第一段"
    })).toBe("写作和发布 · 2026-07-30 · 25m");
    expect(summarizeDailyProperties({
      dueDate: "2026-07-29",
      dueDateExplicit: false
    })).toBe("");
  });
});
