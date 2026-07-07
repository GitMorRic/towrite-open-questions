import { describe, expect, it } from "vitest";
import type { ArticleSummary, OpenQuestion } from "../core/types";
import type { WorkflowIndexPayload } from "../workflow";
import { buildDeviceFeedPayload, deviceFeedQueryFromUrl } from "./device-feed";

const generatedAt = "2026-06-29T08:00:00.000Z";

const questions: OpenQuestion[] = [
  {
    id: "oq_think",
    title: "Check display refresh",
    lane: "think",
    status: "open",
    kind: "research",
    tags: ["eink"],
    color: "amber",
    question: "?? Check whether partial refresh leaves ghosting ^oq_old",
    note: "Compare three refresh modes.",
    source: {
      file: "Techbench/02-Processing/eink.md",
      headingPath: ["Eink"],
      lineStart: 8,
      lineEnd: 8,
      rule: "double-question"
    },
    reminderAt: "2026-06-29T07:30:00.000Z",
    updatedAt: "2026-06-29T07:00:00.000Z"
  },
  {
    id: "oq_write",
    title: "Draft protocol section",
    lane: "write",
    status: "open",
    kind: "todo",
    tags: ["protocol"],
    color: "sky",
    question: "Write the device-feed protocol notes.",
    source: {
      file: "MindFlow/01-Sparks/protocol.md",
      headingPath: ["Protocol"],
      lineStart: 3,
      lineEnd: 3,
      rule: "selection"
    },
    reminderAt: "2026-06-29T09:00:00.000Z",
    reminderNote: "Review before lunch.",
    updatedAt: "2026-06-29T06:00:00.000Z"
  },
  {
    id: "oq_candidate",
    lane: "think",
    status: "candidate",
    kind: "other",
    tags: [],
    color: "slate",
    question: "Maybe later.",
    source: {
      file: "Inbox.md",
      headingPath: [],
      lineStart: 0,
      lineEnd: 0,
      rule: "candidate"
    }
  },
  {
    id: "oq_done",
    lane: "write",
    status: "resolved",
    kind: "todo",
    tags: [],
    color: "sky",
    question: "Done.",
    source: {
      file: "Done.md",
      headingPath: [],
      lineStart: 0,
      lineEnd: 0,
      rule: "selection"
    }
  }
];

const articles: ArticleSummary[] = [
  {
    filePath: "Techbench/02-Processing/eink.md",
    title: "Eink",
    open: 1,
    candidate: 0,
    resolved: 0,
    ignored: 0,
    think: 1,
    write: 0,
    needsWork: true,
    oldestOpenAgeDays: 2,
    topIssues: [questions[0]]
  },
  {
    filePath: "Done.md",
    title: "Done",
    open: 0,
    candidate: 0,
    resolved: 1,
    ignored: 0,
    think: 0,
    write: 1,
    needsWork: false,
    topIssues: []
  }
];

const workflows: WorkflowIndexPayload = {
  schemaVersion: 1,
  generatedAt,
  vaultName: "Capture",
  enabled: true,
  counts: {
    stages: 2,
    uniqueFiles: 2
  },
  stages: [
    {
      id: "sparks",
      title: "Sparks",
      description: "Ideas waiting for a first pass",
      color: "amber",
      limit: 20,
      staleAfterDays: 7,
      count: 1,
      staleCount: 0,
      files: [
        {
          filePath: "MindFlow/01-Sparks/protocol.md",
          title: "Protocol idea",
          description: "Sketch a small-device protocol for low power screens.",
          tags: ["spark"],
          createdAt: "2026-06-20T00:00:00.000Z",
          updatedAt: "2026-06-29T06:00:00.000Z",
          ageDays: 0,
          stale: false,
          openQuestionCount: 1,
          thinkCount: 0,
          writeCount: 1,
          nextAction: "Draft the protocol section",
          openUri: "obsidian://open?vault=Capture&file=MindFlow%2F01-Sparks%2Fprotocol.md"
        }
      ]
    },
    {
      id: "processing",
      title: "Processing",
      description: "Needs active work",
      color: "sky",
      limit: 20,
      staleAfterDays: 10,
      count: 1,
      staleCount: 1,
      files: [
        {
          filePath: "Techbench/02-Processing/eink.md",
          title: "Eink refresh",
          description: "Study refresh strategies and phone preview behavior.",
          tags: ["processing", "eink"],
          createdAt: "2026-06-18T00:00:00.000Z",
          updatedAt: "2026-06-20T00:00:00.000Z",
          ageDays: 9,
          stale: true,
          openQuestionCount: 1,
          thinkCount: 1,
          writeCount: 0,
          nextAction: "Compare three refresh modes",
          openUri: "obsidian://open?vault=Capture&file=Techbench%2F02-Processing%2Feink.md"
        }
      ]
    }
  ]
};

describe("device feed", () => {
  it("builds a home screen with question, article, and workflow summaries", () => {
    const payload = buildDeviceFeedPayload("Capture", questions, articles, workflows, { page: "home", profile: "mobile-eink" }, generatedAt);

    expect(payload.summary).toMatchObject({
      think: 1,
      write: 1,
      unresolved: 2,
      candidate: 1,
      blockedArticles: 1,
      workflowFiles: 2,
      workflowStages: 2,
      remindersDue: 1,
      remindersUpcoming: 1
    });
    expect(payload.workflow.stages[1]).toMatchObject({
      id: "processing",
      count: 1,
      staleCount: 1
    });
    expect(payload.screens[0].items.some((item) => item.type === "next-actions")).toBe(true);
  });

  it("paginates cards by cursor without repeating items", () => {
    const first = buildDeviceFeedPayload(
      "Capture",
      questions,
      articles,
      workflows,
      { page: "cards", limit: 1, token: "secret", companionBaseUrl: "https://device.local" },
      generatedAt
    );
    const second = buildDeviceFeedPayload("Capture", questions, articles, workflows, { page: "cards", limit: 1, cursor: first.navigation.nextCursor }, generatedAt);

    expect(first.navigation).toMatchObject({ total: 2, hasNext: true, nextCursor: "1" });
    expect(first.screens[0].items[0]).toMatchObject({
      type: "card",
      id: "oq_think",
      body: "Check whether partial refresh leaves ghosting",
      answerUrl: "https://device.local/device/input?token=secret&questionId=oq_think"
    });
    expect(first.screens[0].peekItems?.[0]).toMatchObject({
      type: "card-preview",
      id: "oq_write",
      answerUrl: "https://device.local/device/input?token=secret&questionId=oq_write"
    });
    expect(first.screens[0].actions.map((action) => action.id)).toEqual([
      "answerCard",
      "quickCapture",
      "openSource",
      "prev",
      "next"
    ]);
    expect(second.screens[0].items[0]).toMatchObject({
      type: "card",
      id: "oq_write"
    });
  });

  it("filters workflow screens by stage and exposes file next actions", () => {
    const payload = buildDeviceFeedPayload("Capture", questions, articles, workflows, { page: "workflow", stage: "processing" }, generatedAt);

    expect(payload.navigation.total).toBe(1);
    expect(payload.screens[0].items[0]).toMatchObject({
      type: "workflow-file",
      stageId: "processing",
      title: "Eink refresh",
      nextAction: "Compare three refresh modes",
      stale: true
    });
  });

  it("filters card screens by source file and exposes source-note card actions", () => {
    const sourceCards = buildDeviceFeedPayload(
      "Capture",
      questions,
      articles,
      workflows,
      { page: "cards", sourceFile: "MindFlow/01-Sparks/protocol.md", token: "secret" },
      generatedAt
    );
    const sourceNotes = buildDeviceFeedPayload(
      "Capture",
      questions,
      articles,
      workflows,
      { page: "articles", token: "secret", companionBaseUrl: "https://device.local" },
      generatedAt
    );

    expect(sourceCards.navigation.total).toBe(1);
    expect(sourceCards.device.sourceFile).toBe("MindFlow/01-Sparks/protocol.md");
    expect(sourceCards.screens[0]).toMatchObject({
      title: "来源卡片",
      subtitle: "protocol · 1 / 1"
    });
    expect(sourceCards.screens[0].items[0]).toMatchObject({
      type: "card",
      id: "oq_write"
    });
    expect(sourceNotes.screens[0]).toMatchObject({
      title: "来源笔记"
    });
    expect(sourceNotes.screens[0].actions.find((action) => action.id === "viewCards")).toMatchObject({
      page: "cards",
      sourceFile: "Techbench/02-Processing/eink.md"
    });
    expect(sourceNotes.screens[0].items[0]).toMatchObject({
      type: "article",
      stageTitle: "Processing",
      stale: true,
      ageDays: 9,
      oldestOpenAgeDays: 2,
      cardsUrl: "https://device.local/device?token=secret&page=cards&sourceFile=Techbench%2F02-Processing%2Feink.md"
    });
  });

  it("uses compact profile truncation for tiny eink clients", () => {
    const payload = buildDeviceFeedPayload("Capture", questions, articles, workflows, { page: "cards", profile: "eink-bw" }, generatedAt);
    const card = payload.screens[0].items[0];

    expect(card).toMatchObject({ type: "card" });
    if (card.type === "card") {
      expect(card.body.length).toBeLessThanOrEqual(96);
      expect(card.openUri).toContain("obsidian://open");
    }
  });

  it("returns layout metadata and reminder fields for landscape devices", () => {
    const payload = buildDeviceFeedPayload(
      "Capture",
      questions,
      articles,
      workflows,
      { page: "cards", profile: "mobile-eink", width: 264, height: 176, inches: 2.7 },
      generatedAt
    );
    const card = payload.screens[0].items[0];

    expect(payload.device).toMatchObject({
      orientation: "landscape",
      aspectRatio: 1.5,
      inches: 2.7,
      ppi: 117.5,
      layout: "landscape-compact"
    });
    expect(card).toMatchObject({
      type: "card",
      id: "oq_think",
      reminderAt: "2026-06-29T07:30:00.000Z",
      reminderDue: true
    });
  });

  it("lets tiny physical screens override dense desktop-card pagination", () => {
    const payload = buildDeviceFeedPayload(
      "Capture",
      questions,
      articles,
      workflows,
      { page: "cards", profile: "desktop-card", width: 264, height: 176, inches: 2.7 },
      generatedAt
    );

    expect(payload.device.limit).toBe(1);
    expect(payload.screens[0].items).toHaveLength(1);
    expect(payload.screens[0].peekItems).toHaveLength(1);
    expect(payload.navigation).toMatchObject({ total: 2, hasNext: true, nextCursor: "1" });
  });

  it("parses feed query parameters from URLs", () => {
    const query = deviceFeedQueryFromUrl(new URL("http://127.0.0.1:48321/api/v1/device-feed?profile=eink-bw&page=deck&cursor=4&limit=2&lane=write&stage=sparks&sourceFile=MindFlow%2F01-Sparks%2Fprotocol.md&width=360&height=740&inches=2.7"));

    expect(query).toEqual({
      profile: "eink-bw",
      width: 360,
      height: 740,
      inches: 2.7,
      page: "cards",
      cursor: "4",
      limit: 2,
      lane: "write",
      stage: "sparks",
      sourceFile: "MindFlow/01-Sparks/protocol.md"
    });
  });
});
