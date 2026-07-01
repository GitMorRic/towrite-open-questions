import { describe, expect, it } from "vitest";
import type { ArticleSummary, OpenQuestion } from "../core/types";
import { buildDeckPayload, buildExternalEinkPayload, buildRssFeed } from "./payloads";

const questions: OpenQuestion[] = [
  {
    id: "oq_one",
    title: "Voltage evidence",
    lane: "think",
    status: "open",
    kind: "research",
    tags: ["ws2812"],
    color: "amber",
    question: "Need measured voltage drop data.",
    note: "Check the lab notebook.",
    notes: [
      {
        id: "oqn_one",
        kind: "text",
        text: "Phone idea: compare 5V injection points.",
        source: "api",
        clientId: "phone",
        createdAt: "2026-06-28T08:00:00.000Z"
      }
    ],
    source: {
      file: "hardware/ws2812.md",
      headingPath: ["Power"],
      lineStart: 4,
      lineEnd: 4,
      rule: "selection"
    },
    updatedAt: "2026-06-28T08:01:00.000Z"
  },
  {
    id: "oq_pdf",
    title: "PDF evidence",
    lane: "think",
    status: "open",
    kind: "evidence",
    tags: ["pdf"],
    color: "amber",
    question: "PDF selected body.",
    source: {
      file: "datasheets/led.pdf",
      headingPath: ["led"],
      lineStart: 0,
      lineEnd: 0,
      page: 7,
      pdfAnchor: {
        pageNumber: 7,
        selectedText: "Original PDF text.",
        rects: [
          {
            pageNumber: 7,
            left: 0.1,
            top: 0.2,
            width: 0.3,
            height: 0.04
          }
        ]
      },
      rule: "selection"
    },
    updatedAt: "2026-06-28T08:01:00.000Z"
  },
  {
    id: "oq_done",
    lane: "write",
    status: "resolved",
    kind: "todo",
    tags: [],
    color: "sky",
    question: "Already handled.",
    source: {
      file: "done.md",
      headingPath: [],
      lineStart: 0,
      lineEnd: 0,
      rule: "double-question"
    }
  }
];

const articles: ArticleSummary[] = [
  {
    filePath: "hardware/ws2812.md",
    title: "ws2812",
    open: 1,
    candidate: 0,
    resolved: 0,
    ignored: 0,
    think: 1,
    write: 0,
    needsWork: true,
    topIssues: [questions[0]]
  }
];

describe("external payloads", () => {
  it("builds compact deck cards with latest notes", () => {
    const payload = buildDeckPayload("Test Vault", questions, 20, "2026-06-28T08:02:00.000Z");

    expect(payload.data.cards).toHaveLength(2);
    expect(payload.data.cards[0]).toMatchObject({
      id: "oq_one",
      body: "Need measured voltage drop data.",
      question: "Need measured voltage drop data.",
      latestNote: "Phone idea: compare 5V injection points.",
      sourceFile: "hardware/ws2812.md",
      sourceLine: 5
    });
    expect(payload.data.cards[1]).toMatchObject({
      id: "oq_pdf",
      body: "PDF selected body.",
      sourcePage: 7,
      sourceSelectedText: "Original PDF text.",
      sourceRects: [
        {
          pageNumber: 7,
          left: 0.1,
          top: 0.2,
          width: 0.3,
          height: 0.04
        }
      ]
    });
  });

  it("builds an eink payload with the requested limit", () => {
    const payload = buildExternalEinkPayload("Test Vault", questions, articles, 1, "2026-06-28T08:02:00.000Z");

    expect(payload.focus).toHaveLength(1);
    expect(payload.summary.open).toBe(2);
  });

  it("escapes RSS output and does not echo query tokens", () => {
    const rss = buildRssFeed(
      "Test Vault",
      questions,
      "http://127.0.0.1:48321/api/v1/rss.xml?token=secret",
      "2026-06-28T08:02:00.000Z"
    );

    expect(rss).toContain("Voltage evidence");
    expect(rss).toContain("Phone idea: compare 5V injection points.");
    expect(rss).not.toContain("token=secret");
  });
});
