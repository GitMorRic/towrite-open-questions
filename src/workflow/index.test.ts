import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import type { ArticleTypesSettings, WorkflowStagesSettings } from "../core/settings";
import type { OpenQuestion } from "../core/types";
import {
  buildWorkflowPayload,
  descriptionForWorkflowDocument,
  matchWorkflowStage,
  nextActionForWorkflowDocument,
  titleForWorkflowDocument,
  WorkflowIndex,
  type WorkflowSourceDocument
} from "./index";

const generatedAt = "2026-06-29T00:00:00.000Z";

const settings: WorkflowStagesSettings = {
  enabled: true,
  stages: [
    {
      id: "sparks",
      title: "Sparks",
      description: "Ideas to develop",
      color: "amber",
      folderPrefixes: ["MindFlow/01-Sparks"],
      tags: ["spark"],
      limit: 10,
      staleAfterDays: 7
    },
    {
      id: "processing",
      title: "Processing",
      description: "Needs progress",
      color: "sky",
      folderPrefixes: ["Techbench/02-Processing"],
      tags: ["processing"],
      limit: 2,
      staleAfterDays: 10
    }
  ]
};

const articleTypes: ArticleTypesSettings = {
  enabled: true,
  parseHierarchicalTags: true,
  types: [
    {
      id: "mindflow",
      title: "MindFlow",
      color: "mint",
      folderPrefixes: ["ByteDance/MindFlow"],
      tags: ["mindflow"]
    }
  ]
};

const documents: WorkflowSourceDocument[] = [
  {
    filePath: "MindFlow/01-Sparks/AI 手册.md",
    basename: "AI 手册",
    content: "---\ntags: spark\n---\n# AI 手册\n\n这是第一段描述，说明为什么值得继续写。\n\n#tag",
    tags: ["spark", "tag"],
    headings: [{ heading: "AI 手册", level: 1 }],
    frontmatter: { tags: "spark", next: "补一个采访例子" },
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z"
  },
  {
    filePath: "Techbench/02-Processing/eink.md",
    basename: "eink",
    content: "# 墨水屏\n\n需要确认 WebPush 服务。",
    tags: ["processing", "hardware"],
    headings: [{ heading: "墨水屏", level: 1 }],
    frontmatter: {},
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z"
  },
  {
    filePath: "Techbench/02-Processing/agent.md",
    basename: "agent",
    content: "没有标题的正文第一段。",
    tags: ["processing"],
    headings: [],
    frontmatter: { title: "Agent Watch", description: "frontmatter 描述优先" },
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z"
  }
];

const questions: OpenQuestion[] = [
  {
    id: "oq_eink",
    lane: "think",
    status: "open",
    kind: "todo",
    tags: [],
    color: "amber",
    title: "查 e-paper 刷新策略",
    question: "查 e-paper 刷新策略",
    source: {
      file: "Techbench/02-Processing/eink.md",
      headingPath: ["墨水屏"],
      lineStart: 2,
      lineEnd: 2,
      rule: "selection"
    }
  },
  {
    id: "oq_done",
    lane: "write",
    status: "resolved",
    kind: "todo",
    tags: [],
    color: "sky",
    question: "已完成",
    source: {
      file: "Techbench/02-Processing/eink.md",
      headingPath: ["墨水屏"],
      lineStart: 3,
      lineEnd: 3,
      rule: "selection"
    }
  }
];

describe("workflow stages", () => {
  it("applies stage setting changes without recreating the index", async () => {
    let currentSettings: WorkflowStagesSettings = { enabled: false, stages: settings.stages };
    const disabledArticleTypes: ArticleTypesSettings = {
      enabled: false,
      parseHierarchicalTags: true,
      types: []
    };
    const app = {
      vault: {
        getName: () => "Capture",
        getMarkdownFiles: () => []
      }
    } as unknown as App;
    const index = new WorkflowIndex(
      app,
      () => currentSettings,
      () => disabledArticleTypes,
      () => ".obsidian-open-questions",
      () => []
    );

    await index.rebuild();
    expect(index.getPayload().stages).toHaveLength(0);

    currentSettings = { ...currentSettings, enabled: true };
    await index.rebuild();

    expect(index.getPayload().stages.map((stage) => stage.id)).toEqual(["sparks", "processing"]);
  });

  it("matches folder prefixes and tags", () => {
    expect(matchWorkflowStage(documents[0], settings.stages[0])).toBe(true);
    expect(matchWorkflowStage({ filePath: "Other/file.md", tags: ["spark"] }, settings.stages[0])).toBe(true);
    expect(matchWorkflowStage({ filePath: "Other/file.md", tags: ["mindflow/spark"] }, settings.stages[0])).toBe(true);
    expect(matchWorkflowStage(documents[0], settings.stages[1])).toBe(false);
  });

  it("classifies hierarchical tags as article type and workflow stage", () => {
    const payload = buildWorkflowPayload({
      settings,
      articleTypes,
      documents: [{
        filePath: "ByteDance/MindFlow/01-Sparks/adventureX.md",
        basename: "adventureX",
        content: "# adventureX\n\nA tagged note without open questions.",
        tags: ["mindflow/spark"],
        headings: [{ heading: "adventureX", level: 1 }],
        frontmatter: { tags: ["mindflow/spark"] },
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-28T00:00:00.000Z"
      }],
      questions: [],
      vaultName: "Capture",
      generatedAt
    });

    expect(payload.counts).toEqual({ stages: 2, uniqueFiles: 1 });
    expect(payload.stages[0]).toMatchObject({
      id: "sparks",
      count: 1
    });
    expect(payload.files?.[0]).toMatchObject({
      filePath: "ByteDance/MindFlow/01-Sparks/adventureX.md",
      typeId: "mindflow",
      typeTitle: "MindFlow",
      stageId: "sparks",
      stageTitle: "Sparks",
      openQuestionCount: 0,
      thinkCount: 0,
      writeCount: 0
    });
  });

  it("extracts title, description, and next action by priority", () => {
    expect(titleForWorkflowDocument(documents[0])).toBe("AI 手册");
    expect(titleForWorkflowDocument(documents[2])).toBe("Agent Watch");
    expect(descriptionForWorkflowDocument(documents[2])).toBe("frontmatter 描述优先");
    expect(nextActionForWorkflowDocument(documents[0], [])).toBe("补一个采访例子");
    expect(nextActionForWorkflowDocument(documents[1], questions)).toBe("查 e-paper 刷新策略");
  });

  it("builds multi-stage payloads with counts and stale flags", () => {
    const payload = buildWorkflowPayload({
      settings,
      documents,
      questions,
      vaultName: "Capture",
      generatedAt
    });

    expect(payload.counts).toEqual({ stages: 2, uniqueFiles: 3 });
    expect(payload.stages[0]).toMatchObject({
      id: "sparks",
      count: 1,
      staleCount: 1
    });
    expect(payload.stages[1].files[0]).toMatchObject({
      filePath: "Techbench/02-Processing/agent.md",
      title: "Agent Watch",
      stale: false
    });
    expect(payload.stages[1].files.find((file) => file.filePath.endsWith("eink.md"))).toMatchObject({
      openQuestionCount: 1,
      thinkCount: 1,
      writeCount: 0,
      nextAction: "查 e-paper 刷新策略"
    });
  });

  it("filters payloads by stage, search, limit, and compact mode", () => {
    const payload = buildWorkflowPayload({
      settings,
      documents,
      questions,
      vaultName: "Capture",
      generatedAt,
      query: { stage: "processing", search: "eink", limit: 1, compact: true }
    });

    expect(payload.stages).toHaveLength(1);
    expect(payload.stages[0].count).toBe(1);
    expect(payload.stages[0].files).toHaveLength(1);
    expect(payload.stages[0].files[0].filePath).toBe("Techbench/02-Processing/eink.md");
    expect(payload.stages[0].files[0].frontmatter).toBeUndefined();
  });
});
