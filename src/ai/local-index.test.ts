import { describe, expect, it } from "vitest";
import { LocalKnowledgeIndex, tokenize, type LocalKnowledgeDocument } from "./local-index";
import type { OpenQuestion } from "../core/types";

const documents: LocalKnowledgeDocument[] = [
  {
    file: "hardware/ws2812-voltage.md",
    title: "WS2812 voltage drop notes",
    headings: ["Power", "Measurements"],
    tags: ["ws2812", "led", "voltage"],
    frontmatter: { status: "reference" },
    content: "Measured voltage drop across a 16 LED WS2812 ring at full white current."
  },
  {
    file: "writing/essay-outline.md",
    title: "Essay outline",
    headings: ["Draft"],
    tags: ["writing"],
    content: "This note is about article structure and narrative flow."
  }
];

describe("LocalKnowledgeIndex", () => {
  it("recalls related notes from title, tags, headings, and body text", () => {
    const index = new LocalKnowledgeIndex();
    index.replaceDocuments(documents);

    const results = index.query(makeQuestion("inbox/current.md", "Need WS2812 voltage drop measurements for a 16 LED ring."), 5);

    expect(results[0]).toMatchObject({
      file: "hardware/ws2812-voltage.md",
      title: "WS2812 voltage drop notes"
    });
    expect(results[0]?.snippet).toContain("16 LED WS2812");
  });

  it("does not recommend the source note back to itself", () => {
    const index = new LocalKnowledgeIndex();
    index.replaceDocuments(documents);

    const results = index.query(makeQuestion("hardware/ws2812-voltage.md", "WS2812 voltage drop"), 5);

    expect(results.map((item) => item.file)).not.toContain("hardware/ws2812-voltage.md");
  });

  it("tokenizes latin words and Chinese bigrams", () => {
    const tokens = tokenize("\u9700\u8981\u8865\u5145 WS2812 \u538b\u964d\u5b9e\u6d4b");

    expect(tokens).toContain("ws2812");
    expect(tokens).toContain("\u538b\u964d");
    expect(tokens).toContain("\u5b9e\u6d4b");
  });
});

function makeQuestion(file: string, question: string): OpenQuestion {
  return {
    id: "oq_test",
    lane: "think",
    status: "open",
    kind: "research",
    tags: [],
    color: "amber",
    question,
    source: {
      file,
      headingPath: ["Power"],
      lineStart: 1,
      lineEnd: 1,
      rule: "selection"
    }
  };
}
