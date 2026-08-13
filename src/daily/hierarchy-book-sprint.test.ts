import { describe, expect, it } from "vitest";
import { parseDailyPlanHierarchy } from "./hierarchy";

describe("daily linked project subtasks", () => {
  it("treats a checkbox below a numbered note link as a normal task and inherits the note target", () => {
    const markdown = [
      "# 2026-08-12",
      "## 今日计划",
      "- [ ] 项目",
      "  1. [[书客松]]",
      "     - [ ] 确定参赛主题 ^daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "     - [ ] 完成报名 ^daily_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    ].join("\n");

    const hierarchy = parseDailyPlanHierarchy(
      markdown,
      "Daily/2026-08-12.md",
      "2026-08-12",
      { planHeading: "今日计划", todoHeading: "ToDo" }
    );
    const theme = hierarchy.tasks.find((task) => task.text === "确定参赛主题");
    const registration = hierarchy.tasks.find((task) => task.text === "完成报名");

    expect(hierarchy.groups.map((group) => group.text)).toContain("[[书客松]]");
    expect(theme).toMatchObject({
      parentTaskLine: 3,
      targetResolution: {
        source: "ancestor-link",
        target: { linkText: "书客松" },
        displayLabel: "书客松"
      }
    });
    expect(registration?.targetResolution).toMatchObject({
      source: "ancestor-link",
      target: { linkText: "书客松" }
    });
  });
});
