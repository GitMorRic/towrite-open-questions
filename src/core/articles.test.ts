import { describe, expect, it } from "vitest";
import type { WorkflowIndexPayload } from "../workflow";
import type { ArticleSummary } from "./types";
import { enrichArticleSummariesWithWorkflow, mergeArticleSummariesWithWorkflow } from "./articles";

describe("enrichArticleSummariesWithWorkflow", () => {
  it("prefers workflow file metadata and preserves question age fallback", () => {
    const [article] = enrichArticleSummariesWithWorkflow([baseArticle], workflow, "2026-07-07T00:00:00.000Z");

    expect(article).toMatchObject({
      filePath: "MindFlow/02-Processing/deep-note.md",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-04T00:00:00.000Z",
      ageDays: 3,
      oldestOpenAgeDays: 8,
      stageId: "processing",
      stageTitle: "Processing",
      stale: true,
      statusLabel: "stale"
    });
  });

  it("falls back to article timing when workflow has no matching file", () => {
    const [article] = enrichArticleSummariesWithWorkflow([{
      ...baseArticle,
      filePath: "Loose.md",
      title: "Loose",
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
      oldestOpenAgeDays: undefined
    }], workflow, "2026-07-07T00:00:00.000Z");

    expect(article).toMatchObject({
      filePath: "Loose.md",
      ageDays: 5,
      oldestOpenAgeDays: 5,
      statusLabel: "blocked",
      stale: false
    });
  });

  it("adds workflow-only classified notes to display article summaries", () => {
    const articles = mergeArticleSummariesWithWorkflow([], {
      ...workflow,
      files: [
        {
          filePath: "ByteDance/MindFlow/01-Sparks/adventureX.md",
          title: "adventureX",
          description: "Raw idea note",
          tags: ["mindflow/spark"],
          createdAt: "2026-06-22T00:00:00.000Z",
          updatedAt: "2026-07-06T00:00:00.000Z",
          ageDays: 15,
          stale: false,
          typeId: "mindflow",
          typeTitle: "MindFlow",
          typeColor: "mint",
          stageId: "sparks",
          stageTitle: "Sparks",
          stageColor: "amber",
          openQuestionCount: 0,
          thinkCount: 0,
          writeCount: 0,
          nextAction: "",
          openUri: "obsidian://open?vault=Vault&file=ByteDance%2FMindFlow%2F01-Sparks%2FadventureX.md"
        }
      ]
    }, "2026-07-07T00:00:00.000Z");

    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      filePath: "ByteDance/MindFlow/01-Sparks/adventureX.md",
      typeTitle: "MindFlow",
      stageTitle: "Sparks",
      open: 0,
      needsWork: false,
      statusLabel: "clear"
    });
  });
});

const baseArticle: ArticleSummary = {
  filePath: "MindFlow/02-Processing/deep-note.md",
  title: "Deep note",
  createdAt: "2026-06-28T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
  oldestOpenAgeDays: 8,
  open: 2,
  candidate: 1,
  resolved: 4,
  ignored: 0,
  think: 1,
  write: 1,
  needsWork: true,
  topIssues: []
};

const workflow: WorkflowIndexPayload = {
  schemaVersion: 1,
  generatedAt: "2026-07-07T00:00:00.000Z",
  vaultName: "Vault",
  enabled: true,
  counts: { stages: 1, uniqueFiles: 1 },
  stages: [
    {
      id: "processing",
      title: "Processing",
      description: "Active work",
      color: "sky",
      limit: 20,
      staleAfterDays: 7,
      count: 1,
      staleCount: 1,
      files: [
        {
          filePath: "MindFlow/02-Processing/deep-note.md",
          title: "Deep note",
          description: "Needs synthesis",
          tags: ["processing"],
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-04T00:00:00.000Z",
          ageDays: 3,
          stale: true,
          openQuestionCount: 2,
          thinkCount: 1,
          writeCount: 1,
          nextAction: "Draft outline",
          openUri: "obsidian://open?vault=Vault&file=MindFlow%2F02-Processing%2Fdeep-note.md"
        }
      ]
    }
  ]
};
