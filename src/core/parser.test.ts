import { describe, expect, it } from "vitest";
import { parseOpenQuestionDocument, parseOpenQuestions } from "./parser";

describe("parseOpenQuestions", () => {
  it("extracts double-question rules with metadata", () => {
    const questions = parseOpenQuestions(
      "## 压降分析\n\n?? 有人实测过 16 颗 WS2812 的压降吗？ ^oq_ws2812_vdrop_001 [kind:: research] [priority:: P2] [title:: WS2812 压降] [tags:: ws2812, power] [color:: sky]\n",
      "inbox/ws2812.md"
    );

    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      id: "oq_ws2812_vdrop_001",
      status: "open",
      lane: "think",
      kind: "research",
      priority: "P2",
      title: "WS2812 压降",
      tags: ["ws2812", "power"],
      color: "sky",
      question: "有人实测过 16 颗 WS2812 的压降吗？",
      source: {
        headingPath: ["压降分析"],
        lineStart: 2
      }
    });
  });

  it("extracts Chinese double-question rules", () => {
    const questions = parseOpenQuestions(
      "？？ 这里为什么会掉帧？\n",
      "note.md"
    );

    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      lane: "think",
      question: "这里为什么会掉帧？",
      source: {
        rule: "double-question",
        lineStart: 0
      }
    });
  });

  it("extracts task questions and checked tasks as resolved", () => {
    const questions = parseOpenQuestions(
      "- [ ] [?] 找 WS2812 压降实测数据 #open-question\n- [x] [?] 已经补完公式来源\n",
      "note.md"
    );

    expect(questions.map((question) => question.status)).toEqual(["open", "resolved"]);
    expect(questions[0].kind).toBe("todo");
  });

  it("extracts question callouts", () => {
    const questions = parseOpenQuestions(
      "> [!question] 待解决：WS2812 压降实测\n> id: oq_vdrop\n> kind: experiment\n> status: open\n>\n> 有没有人实测过？\n",
      "note.md"
    );

    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      id: "oq_vdrop",
      kind: "experiment",
      question: "有没有人实测过？"
    });
  });

  it("keeps short blank-line questions as addable suggestions, not saved questions", () => {
    const parsed = parseOpenQuestionDocument(
      "灯越多，总电流越大，压降越大。\n\n分析一下这里的压降\n有没有人实测过？\n\n下一段正文。\n",
      "note.md"
    );

    expect(parsed.questions).toHaveLength(0);
    expect(parsed.suggestions).toHaveLength(1);
    expect(parsed.suggestions[0]).toMatchObject({
      lane: "think",
      color: "amber",
      source: { lineStart: 2, lineEnd: 3 }
    });
  });

  it("classifies writing continuations as ToWrite suggestions", () => {
    const parsed = parseOpenQuestionDocument(
      "这里后续还要继续写这一段\n",
      "note.md"
    );

    expect(parsed.questions).toHaveLength(0);
    expect(parsed.suggestions[0]).toMatchObject({
      lane: "write",
      color: "sky"
    });
  });

  it("does not treat ordinary dialogue questions as suggestions", () => {
    const parsed = parseOpenQuestionDocument(
      "哥哥，你还爱我吗？\n",
      "story.md"
    );

    expect(parsed.questions).toHaveLength(0);
    expect(parsed.suggestions).toHaveLength(0);
  });

  it("uses configured default colors for suggestions", () => {
    const parsed = parseOpenQuestionDocument(
      "这里后续还要继续写这一段\n",
      "note.md",
      { defaultWriteColor: "violet" }
    );

    expect(parsed.suggestions[0]).toMatchObject({
      lane: "write",
      color: "violet"
    });
  });

  it("skips code blocks, math blocks, tables, and frontmatter", () => {
    const parsed = parseOpenQuestionDocument(
      "---\ntitle: 这个要识别吗？\n---\n\n```md\n?? code?\n```\n\n$$\n有没有数学问题？\n$$\n\n| 问题？ | 值 |\n| --- | --- |\n| 有没有？ | 1 |\n\n正文有没有实测过？\n",
      "note.md"
    );

    expect(parsed.questions).toHaveLength(0);
    expect(parsed.suggestions).toHaveLength(1);
    expect(parsed.suggestions[0].question).toBe("正文有没有实测过？");
  });
});
