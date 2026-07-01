import { describe, expect, it } from "vitest";
import { createQuestionAnchor, lineRangeForOffsets, resolveQuestionAnchor } from "./anchor";

describe("question anchors", () => {
  it("resolves exact offsets", () => {
    const source = "alpha\n需要确认这里的压降\nomega";
    const start = source.indexOf("需要");
    const anchor = createQuestionAnchor(source, start, start + "需要确认这里的压降".length);
    const resolved = resolveQuestionAnchor(source, anchor);

    expect(resolved.orphaned).toBe(false);
    expect(resolved.confidence).toBe(1);
    expect(resolved.anchor.selectedText).toBe("需要确认这里的压降");
  });

  it("uses context when selected text repeats", () => {
    const source = "第一段\n需要补一点\n\n第二段\n需要补一点\n";
    const start = source.lastIndexOf("需要补一点");
    const anchor = createQuestionAnchor(source, start, start + "需要补一点".length);
    const moved = "第一段\n需要补一点\n\n插入内容\n第二段\n需要补一点\n";
    const resolved = resolveQuestionAnchor(moved, anchor);

    expect(resolved.startOffset).toBe(moved.lastIndexOf("需要补一点"));
    expect(resolved.orphaned).toBe(false);
  });

  it("marks missing text as orphaned", () => {
    const source = "alpha\n需要补资料\nomega";
    const start = source.indexOf("需要");
    const anchor = createQuestionAnchor(source, start, start + "需要补资料".length);
    const resolved = resolveQuestionAnchor("alpha\nomega", anchor);

    expect(resolved.orphaned).toBe(true);
  });

  it("maps offsets to line ranges", () => {
    const source = "a\nb\nc";
    expect(lineRangeForOffsets(source, 2, 3)).toEqual({ lineStart: 1, lineEnd: 1 });
  });
});
