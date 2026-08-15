import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  dailyTaskTrailingIdRange,
  getDailyTaskControlUpdateStrategy,
  isOwnedDailyMetadataLine,
  summarizeDailyProperties
} from "./daily-task-controls";

describe("Daily editor task controls", () => {
  it("does not inject proactive new-task actions while the user is typing", () => {
    const source = readFileSync(new URL("./daily-task-controls.ts", import.meta.url), "utf8");
    expect(source).not.toContain("class DailyTaskEnrichmentWidget");
    expect(source).not.toContain("towrite-daily-enrichment-content");
    expect(source).not.toContain('disclosureToggle.textContent = "···"');
  });

  it("keeps linked-note opening explicit beside the stronger disclosure control", () => {
    const source = readFileSync(new URL("./daily-task-controls.ts", import.meta.url), "utf8");
    expect(source).toContain('iconActionButton(doc, "↗", "打开关联文档"');
    expect(source).toContain("onOpenPending(edit: DailyPlanNormalizationEdit)");
    expect(source).toContain("hasNavigableTarget(this.item.targetResolution)");
  });

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
    expect(isOwnedDailyMetadataLine("  <!-- [towrite-kind:: task] [towrite-device:: none] -->")).toBe(true);
    expect(isOwnedDailyMetadataLine("  <!-- [towrite-action:: note-focus] -->")).toBe(true);
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

  it("conceals the inline stable Daily id without swallowing task text", () => {
    expect(dailyTaskTrailingIdRange(
      "- [ ] 这是一个待办 ^daily_1234567890abcdef1234567890abcdef"
    )).toEqual({ from: 12, to: 52 });
    expect(dailyTaskTrailingIdRange("- [ ] 普通内容")).toBeUndefined();
  });

  it("folds technical lines before the asynchronous Daily item cache is consulted", () => {
    const source = readFileSync(new URL("./daily-task-controls.ts", import.meta.url), "utf8");
    const technicalScan = source.indexOf("for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1)");
    const itemControls = source.indexOf("for (const { item, timing } of items)");
    expect(technicalScan).toBeGreaterThan(-1);
    expect(itemControls).toBeGreaterThan(technicalScan);
  });

  it("offers yesterday migration inside today's Daily note", () => {
    const source = readFileSync(new URL("./daily-task-controls.ts", import.meta.url), "utf8");
    expect(source).toContain("DailyPreviousMigrationWidget");
    expect(source).toContain("towrite-daily-previous-migration");
    expect(source).toContain("onOpenPreviousMigration");
  });

  it("provides block widgets through a StateField instead of a ViewPlugin", () => {
    const source = readFileSync(new URL("./daily-task-controls.ts", import.meta.url), "utf8");
    expect(source).toContain("StateField.define");
    expect(source).toContain("EditorView.decorations.from");
    expect(source).not.toContain("ViewPlugin.fromClass");
  });
});
