import { describe, expect, it } from "vitest";
import { stripQuestionRuleSyntax } from "./rule-text";

describe("question rule text cleanup", () => {
  it("strips double-question markers from display text", () => {
    expect(stripQuestionRuleSyntax("?? 你觉得怎么样 ^oq_note_123 [color:: sky]", "double-question"))
      .toBe("你觉得怎么样");
  });

  it("strips task question markers from display text", () => {
    expect(stripQuestionRuleSyntax("- [ ] [?] 继续写这一段 #open-question", "task-question"))
      .toBe("继续写这一段");
  });

  it("does not strip ordinary selection text", () => {
    expect(stripQuestionRuleSyntax("?? 这是原文的一部分", "selection"))
      .toBe("?? 这是原文的一部分");
  });
});
