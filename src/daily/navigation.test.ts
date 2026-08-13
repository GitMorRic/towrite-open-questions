import { describe, expect, it } from "vitest";
import {
  dailyCreateOnlyTitle,
  dailyPlanCacheInvalidationForPath,
  dailyWikiLink,
  isConfiguredDailyPlanSourcePath
} from "./navigation";

describe("Daily navigation helpers", () => {
  it("refreshes rather than clears the active cache when tomorrow is deleted", () => {
    expect(dailyPlanCacheInvalidationForPath(
      "Daily/2026-07-25.md",
      "Daily/2026-07-24.md",
      "Daily/2026-07-25.md"
    )).toBe("refresh");
    expect(dailyPlanCacheInvalidationForPath(
      "Notes/Other.md",
      "Daily/2026-07-24.md",
      "Daily/2026-07-25.md"
    )).toBe("ignore");
  });

  it("matches a fixed Daily document by exact normalized Vault path", () => {
    const source = { kind: "fixed-document", path: "Planning/Daily Plans.md" } as const;
    expect(isConfiguredDailyPlanSourcePath("Planning\\Daily Plans.md", source)).toBe(true);
    expect(isConfiguredDailyPlanSourcePath("Planning/Daily Plans.md", source)).toBe(true);
    expect(isConfiguredDailyPlanSourcePath("Planning/Daily Plans/2026-08-13.md", source)).toBe(false);
    expect(isConfiguredDailyPlanSourcePath("Planning/Other.md", source)).toBe(false);
  });

  it("matches only direct ISO-date files in a configured Daily Notes root", () => {
    const source = { kind: "daily-note", dailyRoot: "Daily", dateFormat: "YYYY-MM-DD" } as const;
    expect(isConfiguredDailyPlanSourcePath("Daily/2026-08-13.md", source)).toBe(true);
    expect(isConfiguredDailyPlanSourcePath("Daily/20260813.md", source)).toBe(false);
    expect(isConfiguredDailyPlanSourcePath("Daily/2026-13-40.md", source)).toBe(false);
    expect(isConfiguredDailyPlanSourcePath("Daily/Projects/2026-08-13.md", source)).toBe(false);
    expect(isConfiguredDailyPlanSourcePath("Daily/Projects/ordinary.md", source)).toBe(false);
  });

  it("supports compact and variable-width Daily Notes date formats", () => {
    expect(isConfiguredDailyPlanSourcePath(
      "sync/Todo_and_tosolve/20260813.md",
      { kind: "daily-note", dailyRoot: "sync/Todo_and_tosolve", dateFormat: "YYYYMMDD" }
    )).toBe(true);
    expect(isConfiguredDailyPlanSourcePath(
      "Daily/26_8_3.md",
      { kind: "daily-note", dailyRoot: "Daily", dateFormat: "YY_M_D.md" }
    )).toBe(true);
    expect(isConfiguredDailyPlanSourcePath(
      "Daily/archive/20260813.md",
      { kind: "daily-note", dailyRoot: "Daily", dateFormat: "YYYYMMDD" }
    )).toBe(false);
  });

  it("keeps a question block anchor in the planning target", () => {
    expect(dailyWikiLink("Projects/Echo.md", "daily_question_01"))
      .toBe("[[Projects/Echo#^daily_question_01]]");
    expect(dailyWikiLink("Projects/Echo.md")).toBe("[[Projects/Echo]]");
  });

  it("prefills a missing create-note target from the human task text", () => {
    expect(dailyCreateOnlyTitle({
      kind: "create_note",
      text: "Draft the Echo launch note",
      linkedNotes: []
    })).toBe("Draft the Echo launch note");
  });
});
