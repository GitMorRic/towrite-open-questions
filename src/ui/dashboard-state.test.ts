import { describe, expect, it } from "vitest";
import type {
  ArticleSummary,
  OpenQuestion,
  QuestionStatusOption
} from "../core/types";
import type { WorkflowIndexPayload } from "../workflow";
import {
  buildWorkflowMatrix,
  buildWorkflowStatusColumns
} from "./dashboard-state";

describe("Dashboard Workflow status matrix", () => {
  it("keeps configured and custom statuses in separate columns", () => {
    const statuses: QuestionStatusOption[] = [
      { id: "open", label: "Open" },
      { id: "blocked", label: "Blocked" },
      { id: "paused", label: "Paused" },
      { id: "resolved", label: "Resolved" },
      { id: "ignored", label: "Ignored" }
    ];
    const questions = [
      question("open", "think"),
      question("blocked", "write"),
      question("paused", "think"),
      question("resolved", "write"),
      question("ignored", "think"),
      question("waiting-review", "write")
    ];
    const columns = buildWorkflowStatusColumns(statuses, questions);
    expect(columns.map((column) => column.id)).toEqual([
      "open",
      "blocked",
      "paused",
      "resolved",
      "ignored",
      "waiting-review"
    ]);

    const [row] = buildWorkflowMatrix(workflow, summaries, questions, columns);
    expect(row.statuses).toMatchObject({
      open: 1,
      blocked: 1,
      paused: 1,
      resolved: 1,
      ignored: 1,
      "waiting-review": 1
    });
    expect(row.think).toBe(2);
    expect(row.write).toBe(2);
  });

  it("retains an unclassified row even when its only question is ignored", () => {
    const ignored = question("ignored", "think", "Loose.md");
    const columns = buildWorkflowStatusColumns([{ id: "ignored", label: "Ignored" }], [ignored]);
    const rows = buildWorkflowMatrix(workflow, summaries, [ignored], columns);
    expect(rows.at(-1)).toMatchObject({
      id: "__unclassified__",
      statuses: { ignored: 1 },
      think: 0,
      write: 0
    });
  });
});

function question(
  status: string,
  lane: "think" | "write",
  file = "Project.md"
): OpenQuestion {
  return {
    id: `${status}-${lane}-${file}`,
    lane,
    status,
    kind: "other",
    tags: [],
    color: "slate",
    title: status,
    question: status,
    source: {
      file,
      headingPath: [],
      lineStart: 0,
      lineEnd: 0,
      rule: "selection"
    },
    updatedAt: "2026-07-23T00:00:00.000Z"
  };
}

const workflow: WorkflowIndexPayload = {
  schemaVersion: 1,
  generatedAt: "2026-07-23T00:00:00.000Z",
  vaultName: "Vault",
  enabled: true,
  counts: { stages: 1, uniqueFiles: 1 },
  files: [{
    filePath: "Project.md",
    title: "Project",
    description: "",
    tags: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
    ageDays: 0,
    stale: false,
    stageId: "draft",
    stageTitle: "Draft",
    stageColor: "slate",
    openQuestionCount: 4,
    thinkCount: 2,
    writeCount: 2,
    nextAction: "",
    openUri: "obsidian://open"
  }],
  stages: [{
    id: "draft",
    title: "Draft",
    description: "",
    color: "slate",
    limit: 20,
    staleAfterDays: 30,
    count: 1,
    staleCount: 0,
    files: []
  }]
};

const summaries: ArticleSummary[] = [{
  filePath: "Project.md",
  title: "Project",
  open: 4,
  candidate: 0,
  resolved: 1,
  ignored: 1,
  think: 2,
  write: 2,
  needsWork: true,
  stageId: "draft",
  stageTitle: "Draft",
  topIssues: []
}];
