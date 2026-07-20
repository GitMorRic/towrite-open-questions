import { describe, expect, it } from "vitest";
import type { ArticleSummary, OpenQuestion } from "../core/types";
import type { WorkflowIndexPayload } from "../workflow";
import { PushCandidateSource } from "./candidates";

describe("PushCandidateSource", () => {
  it("builds candidates from questions, workflow files, and articles", () => {
    const source = new PushCandidateSource();
    const candidates = source.build({
      vaultName: "Vault",
      questions,
      articles,
      workflowPayload: workflow,
      publicBaseUrl: "http://127.0.0.1:48321",
      token: "restricted",
      now: "2026-07-07T00:00:00.000Z"
    });

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      "home:2026-07-07",
      "oq_due",
      "workflow:MindFlow/01-Sparks/spark.md",
      "article:MindFlow/01-Sparks/spark.md"
    ]);
    expect(candidates[0]).toMatchObject({
      type: "home-summary",
      metrics: expect.arrayContaining([
        { label: "? ToThink", value: 1 },
        { label: "Articles", value: 1 }
      ])
    });
    expect(candidates[1]).toMatchObject({
      type: "question",
      workflowStageId: "sparks",
      workflowStageTitle: "Sparks",
      reminderDue: true,
      nextAction: "Draft one concrete example",
      sourceRule: "selection"
    });
    expect(candidates[1].answerUrl).toContain("/device/input?");
    expect(candidates[3]).toMatchObject({
      type: "article",
      workflowStageTitle: "Sparks",
      stale: true,
      ageDays: 3,
      articleOpen: 1
    });
  });
});

const questions: OpenQuestion[] = [
  {
    id: "oq_due",
    title: "Why does this matter?",
    lane: "think",
    status: "open",
    kind: "research",
    tags: ["spark"],
    color: "amber",
    question: "Why does this matter?",
    note: "[[MindFlow/01-Sparks/spark|spark note]]",
    reminderAt: "2026-07-06T23:00:00.000Z",
    source: {
      file: "MindFlow/01-Sparks/spark.md",
      headingPath: ["Spark"],
      lineStart: 1,
      lineEnd: 1,
      rule: "selection"
    },
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T12:00:00.000Z"
  },
  {
    id: "oq_resolved",
    lane: "write",
    status: "resolved",
    kind: "todo",
    tags: [],
    color: "sky",
    question: "Done",
    source: {
      file: "done.md",
      headingPath: [],
      lineStart: 0,
      lineEnd: 0,
      rule: "selection"
    }
  }
];

const articles: ArticleSummary[] = [
  {
    filePath: "MindFlow/01-Sparks/spark.md",
    title: "Spark",
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

const workflow: WorkflowIndexPayload = {
  schemaVersion: 1,
  generatedAt: "2026-07-07T00:00:00.000Z",
  vaultName: "Vault",
  enabled: true,
  counts: { stages: 1, uniqueFiles: 1 },
  stages: [
    {
      id: "sparks",
      title: "Sparks",
      description: "Early ideas",
      color: "amber",
      limit: 20,
      staleAfterDays: 7,
      count: 1,
      staleCount: 1,
      files: [
        {
          filePath: "MindFlow/01-Sparks/spark.md",
          title: "Spark",
          description: "A promising raw note",
          tags: ["spark"],
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-04T00:00:00.000Z",
          ageDays: 3,
          stale: true,
          openQuestionCount: 1,
          thinkCount: 1,
          writeCount: 0,
          nextAction: "Draft one concrete example",
          openUri: "obsidian://open?vault=Vault&file=MindFlow%2F01-Sparks%2Fspark.md"
        }
      ]
    }
  ]
};
