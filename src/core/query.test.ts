import { describe, expect, it } from "vitest";
import { buildArticleSummaries, queryQuestions } from "./query";
import type { OpenQuestion } from "./types";

const questions: OpenQuestion[] = [
  {
    id: "oq_1",
    status: "open",
    lane: "think",
    kind: "research",
    tags: [],
    color: "amber",
    question: "有没有实测？",
    source: {
      file: "inbox/ws2812.md",
      headingPath: ["压降"],
      lineStart: 10,
      lineEnd: 10,
      rule: "double-question"
    }
  },
  {
    id: "oq_2",
    status: "candidate",
    lane: "write",
    kind: "todo",
    tags: [],
    color: "sky",
    question: "这里要补图",
    source: {
      file: "drafts/display.md",
      headingPath: ["配图"],
      lineStart: 3,
      lineEnd: 3,
      rule: "selection"
    }
  },
  {
    id: "oq_3",
    status: "open",
    lane: "write",
    kind: "todo",
    tags: [],
    color: "sky",
    question: "Expand the conclusion.",
    notes: [
      {
        id: "oqn_1",
        kind: "text",
        text: "Desktop widget idea about ending with a checklist.",
        source: "api",
        clientId: "desktop",
        createdAt: "2026-06-28T08:00:00.000Z"
      }
    ],
    source: {
      file: "drafts/conclusion.md",
      headingPath: ["End"],
      lineStart: 5,
      lineEnd: 5,
      rule: "selection"
    }
  }
];

describe("queryQuestions", () => {
  it("filters by status and search", () => {
    const result = queryQuestions(questions, {
      status: ["open"],
      search: "实测"
    });

    expect(result.map((question) => question.id)).toEqual(["oq_1"]);
  });

  it("searches appended notes", () => {
    const result = queryQuestions(questions, {
      search: "widget idea"
    });

    expect(result.map((question) => question.id)).toEqual(["oq_3"]);
  });
});

describe("buildArticleSummaries", () => {
  it("summarizes file-level question counts", () => {
    const summaries = buildArticleSummaries(questions);
    const ws2812 = summaries.find((summary) => summary.filePath === "inbox/ws2812.md");

    expect(summaries).toHaveLength(3);
    expect(ws2812).toMatchObject({
      filePath: "inbox/ws2812.md",
      open: 1,
      needsWork: true
    });
  });
});
