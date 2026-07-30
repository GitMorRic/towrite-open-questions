import { describe, expect, it } from "vitest";
import { navigationTargetForQuestion } from "./question-target";

describe("question navigation targets", () => {
  it("orders stable block, contextual text, and line fallbacks", () => {
    const target = navigationTargetForQuestion({
      title: "Why does this matter?",
      source: {
        file: "Projects/Echo.md",
        headingPath: ["Design"],
        lineStart: 20,
        lineEnd: 22,
        blockId: "question_echo",
        rule: "task-question"
      },
      anchor: {
        startOffset: 100,
        endOffset: 110,
        selectedText: "open this",
        before: "before",
        after: "after",
        orphaned: false
      }
    });
    expect(target).toMatchObject({
      provider: "obsidian",
      filePath: "Projects/Echo.md",
      locations: [
        { kind: "block", blockId: "question_echo" },
        { kind: "text", anchor: { selectedText: "open this" } },
        { kind: "line", range: { start: 20, end: 22 } }
      ]
    });
  });

  it("represents a PDF page without exposing a generic executable URI", () => {
    expect(navigationTargetForQuestion({
      source: {
        file: "Papers/Echo.pdf",
        headingPath: [],
        lineStart: 0,
        lineEnd: 0,
        page: 7,
        rule: "selection"
      }
    })).toMatchObject({
      filePath: "Papers/Echo.pdf",
      locations: [{ kind: "pdf-page", page: 7 }]
    });
  });
});
