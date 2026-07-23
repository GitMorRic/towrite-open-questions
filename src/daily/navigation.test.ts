import { describe, expect, it } from "vitest";
import {
  dailyCreateOnlyTitle,
  dailyPlanCacheInvalidationForPath,
  dailyWikiLink
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
