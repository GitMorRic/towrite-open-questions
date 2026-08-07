import { describe, expect, it } from "vitest";
import {
  matchMarkdownTaskInput,
  normalizeTaskSuggestionQuery,
  rankMarkdownTaskInputSuggestions,
  type MarkdownTaskInputSuggestion
} from "./task-input-suggest-core";

const items: MarkdownTaskInputSuggestion[] = [
  {
    id: "note:obsidian",
    kind: "note",
    label: "obsidian-待办清单",
    detail: "笔记 · Projects/obsidian-待办清单.md",
    replacement: "[[obsidian-待办清单]]",
    searchText: "obsidian-待办清单 Projects/obsidian-待办清单.md"
  },
  {
    id: "task:publish",
    kind: "task",
    label: "写出 Echo 发布说明",
    detail: "工作池待办",
    replacement: "写出 Echo 发布说明",
    searchText: "写出 Echo 发布说明 Echo"
  }
];

describe("Markdown task input suggestions", () => {
  it("matches a partial note title such as ob", () => {
    expect(rankMarkdownTaskInputSuggestions(items, "ob")[0]?.replacement)
      .toBe("[[obsidian-待办清单]]");
  });

  it("matches existing Work Pool task text", () => {
    expect(rankMarkdownTaskInputSuggestions(items, "Echo")[0]?.label)
      .toBe("写出 Echo 发布说明");
  });

  it("normalizes an unfinished wikilink query", () => {
    expect(normalizeTaskSuggestionQuery("[[Ob")).toBe("ob");
  });

  it("triggers only for an open Markdown checkbox", () => {
    expect(matchMarkdownTaskInput("- [ ] ob")).toEqual({ startCh: 6, query: "ob" });
    expect(matchMarkdownTaskInput("- [x] ob")).toBeUndefined();
    expect(matchMarkdownTaskInput("ordinary ob")).toBeUndefined();
  });
});
