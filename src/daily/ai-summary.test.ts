import { describe, expect, it } from "vitest";
import { dailyAiSummaryPlaceholderInstruction, parseConstrainedDailyAiSummary } from "./ai-summary";
import type { DailySummary } from "./types";

const factual: Pick<DailySummary, "date" | "metrics"> = {
  date: "2026-07-23",
  metrics: {
    planned: 5,
    completed: 2,
    remaining: 3,
    positiveWritingUnits: 420,
    netWritingUnits: -18,
    notesCreated: 1,
    notesModified: 4
  }
};

describe("constrained Daily AI summary", () => {
  it("hydrates only counters owned by the structured snapshot", () => {
    expect(parseConstrainedDailyAiSummary(JSON.stringify({
      headline: "今天完成 {{completed}} 项，还剩 {{remaining}} 项",
      lines: [
        "新增 {{positiveWritingUnits}} 写作单位，净增 {{netWritingUnits}}。",
        "新建 {{notesCreated}} 篇，修改 {{notesModified}} 篇。"
      ]
    }), factual)).toEqual({
      headline: "今天完成 2 项，还剩 3 项",
      lines: [
        "新增 420 写作单位，净增 -18。",
        "新建 1 篇，修改 4 篇。"
      ]
    });
  });

  it("rejects invented Arabic or Chinese numeric facts and unknown placeholders", () => {
    expect(parseConstrainedDailyAiSummary('{"headline":"今天完成 99 项","lines":[]}', factual)).toBeUndefined();
    expect(parseConstrainedDailyAiSummary('{"headline":"今天完成十项","lines":[]}', factual)).toBeUndefined();
    expect(parseConstrainedDailyAiSummary('{"headline":"You completed seven tasks","lines":[]}', factual)).toBeUndefined();
    expect(parseConstrainedDailyAiSummary('{"headline":"完成 {{streakDays}} 天连续写作","lines":[]}', factual)).toBeUndefined();
  });

  it("rejects non-JSON prose instead of guessing a factual summary", () => {
    expect(parseConstrainedDailyAiSummary("You achieved 7 things today.", factual)).toBeUndefined();
    expect(dailyAiSummaryPlaceholderInstruction()).toContain("{{completed}}");
  });
});
