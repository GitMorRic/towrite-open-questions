import { describe, expect, it } from "vitest";
import type { OpenQuestion } from "../core/types";
import type { TaskPoolItem } from "../daily/task-pool-types";
import type { InboxItem } from "../inbox/types";
import type { WorkflowFileSummary } from "../workflow";
import { parseDailyPlanHierarchy } from "../daily/hierarchy";
import {
  WorkPoolService,
  buildWorkPoolItems,
  filterWorkPoolItems,
  groupWorkPoolItems,
  groupWorkPoolItemsBy
} from "./service";

describe("WorkPoolService", () => {
  it("projects unnormalized Daily leaf rows into the Work Pool without copying their group checkbox", () => {
    const date = "2026-08-05";
    const sourcePath = `sync/Todo_and_tosolve/${date.replaceAll("-", "")}.md`;
    const hierarchy = parseDailyPlanHierarchy([
      `# ${date}`,
      "## 今日计划",
      "- [ ] 项目",
      "  1. [[创作辅助工具电子屏幕硬件-软硬件系统设计]]",
      "  2. [[obsidian-待办清单]]",
      "## ToDo"
    ].join("\n"), sourcePath, date, { planHeading: "今日计划" });

    const items = buildWorkPoolItems({
      tasks: [],
      questions: [],
      inboxItems: [],
      workflowFiles: [workflow("obsidian-待办清单.md", "raw")],
      dailyPlan: {
        date,
        sourcePath,
        revision: hierarchy.revision,
        tasks: hierarchy.tasks
      }
    });
    const daily = items.filter((item) => item.dailyDate === date);

    expect(daily).toHaveLength(2);
    expect(daily.map((item) => item.title)).not.toContain("项目");
    expect(daily.every((item) => item.dailyProvisional)).toBe(true);
    expect(daily.map((item) => item.classification.projectLabel)).toEqual(["项目", "项目"]);
    expect(daily.find((item) => item.title.includes("obsidian"))?.notePath)
      .toBe("obsidian-待办清单.md");
  });

  it("deduplicates Inbox and Workflow notes and groups their tasks and questions", () => {
    const items = buildWorkPoolItems({
      tasks: [
        task("a", "补充实验", "[[Projects/Echo#^task_a]]"),
        task("b", "独立任务")
      ],
      questions: [question("q1", "write", "Projects/Echo.md")],
      inboxItems: [inbox("Projects/Echo.md")],
      workflowFiles: [workflow("Projects/Echo.md", "processing")]
    });

    expect(items.filter((item) => item.kind === "note")).toHaveLength(1);
    const groups = groupWorkPoolItems(items);
    const echo = groups.find((group) => group.notePath === "Projects/Echo.md")!;
    expect(echo.note).toMatchObject({ inbox: true, stageId: "processing" });
    expect(echo.children.map((item) => item.id).sort()).toEqual([
      "question:q1",
      `task:task_${"a".repeat(32)}`
    ].sort());
    expect(echo.children).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "question:q1", stageId: "processing", inbox: true }),
      expect.objectContaining({ id: `task:task_${"a".repeat(32)}`, stageId: "processing", inbox: true })
    ]));
    expect(groups.find((group) => group.id === "standalone")?.children).toHaveLength(1);
  });

  it("applies source, stage, status, search, and active/history filters", () => {
    const service = new WorkPoolService();
    const input = {
      tasks: [
        task("a", "活跃任务", undefined, "pool"),
        task("b", "已完成任务", undefined, "done")
      ],
      questions: [
        question("q1", "think", "Ideas/Spark.md", "open"),
        question("q2", "write", "Ideas/Spark.md", "resolved")
      ],
      inboxItems: [] as InboxItem[],
      workflowFiles: [
        workflow("Ideas/Spark.md", "sparks"),
        workflow("Archive/Done.md", "archive")
      ]
    };

    expect(service.build(input).items.every((item) => item.active)).toBe(true);
    expect(service.build(input, { source: "tothink" }).items.map((item) => item.id)).toEqual(["question:q1"]);
    expect(service.build(input, { source: "note", stageId: "sparks" }).items.map((item) => item.id)).toEqual(["note:Ideas/Spark.md"]);
    expect(service.build(input, { history: "history", status: "resolved" }).items.map((item) => item.id)).toEqual(["question:q2"]);
    expect(filterWorkPoolItems(buildWorkPoolItems(input), { search: "已完成" })).toHaveLength(0);
    expect(filterWorkPoolItems(buildWorkPoolItems(input), { history: "all", search: "已完成" })).toHaveLength(1);
  });

  it("filters explicitly for work without a stage or article type", () => {
    const items = buildWorkPoolItems({
      tasks: [task("plain", "Plain task")],
      questions: [],
      inboxItems: [],
      workflowFiles: [workflow("Ideas/Spark.md", "sparks")]
    });
    expect(filterWorkPoolItems(items, { stageId: "__unclassified__" })
      .every((item) => !item.stageId)).toBe(true);
    expect(filterWorkPoolItems(items, { typeId: "__unclassified__" })
      .every((item) => !item.typeId)).toBe(true);
  });

  it("associates a task with source before target and falls back to an independent group", () => {
    const linked = task("c", "继续源笔记", "[[Sources/Origin#^task_c]]");
    linked.target = "[[Targets/Destination]]";
    const items = buildWorkPoolItems({
      tasks: [linked, task("d", "没有链接")],
      questions: [],
      inboxItems: [],
      workflowFiles: []
    });
    expect(items.find((item) => item.id === `task:${linked.taskId}`)?.notePath)
      .toBe("Sources/Origin.md");
    expect(groupWorkPoolItems(items).find((group) => group.id === "standalone")?.taskCount)
      .toBe(1);
  });

  it("prefers an explicit task project and otherwise inherits note frontmatter", () => {
    const explicit = task("a", "Explicit project", "[[Projects/Echo#^task_a]]");
    explicit.project = "Exoskeleton";
    const inherited = task("b", "Inherited project", "[[Projects/Echo#^task_b]]");
    const note = workflow("Projects/Echo.md", "processing");
    note.frontmatter = { project: "Echo" };
    note.tags = ["project/tag-fallback"];

    const items = buildWorkPoolItems({
      tasks: [explicit, inherited],
      questions: [question("q-project", "think", "Projects/Echo.md")],
      inboxItems: [],
      workflowFiles: [note],
      classification: {
        projectFrontmatterKeys: ["project", "projects"],
        projectTagPrefixes: ["project/"],
        projectRules: [{ id: "folder", label: "Folder fallback", folderPrefixes: ["Projects"], tags: [] }]
      }
    });

    expect(items.find((item) => item.id === `task:${explicit.taskId}`)?.classification)
      .toMatchObject({ projectLabel: "Exoskeleton", projectSource: "task", inheritedFromNote: false });
    expect(items.find((item) => item.id === `task:${inherited.taskId}`)?.classification)
      .toMatchObject({ projectLabel: "Echo", projectSource: "note-frontmatter", inheritedFromNote: true });
    expect(items.find((item) => item.id === "question:q-project")?.classification)
      .toMatchObject({ projectLabel: "Echo", projectSource: "note-frontmatter", inheritedFromNote: true });
  });

  it("projects child-note tasks beneath their parent project task without copying Markdown", () => {
    const child = task("c", "磁铁布局和位置对元器件的影响", "[[Projects/Layout#^task_c]]");
    const relation = {
      parentTaskId: `task_${"p".repeat(32)}`,
      parentTaskTitle: "布局",
      parentSourcePath: "Projects/创作辅助工具电子屏幕硬件-软硬件系统设计.md",
      childNotePath: "Projects/Layout.md",
      revision: "ntr_parent"
    };

    const items = buildWorkPoolItems({
      tasks: [child],
      questions: [],
      inboxItems: [],
      workflowFiles: [workflow("Projects/Layout.md", "raw")],
      taskRelations: [relation]
    });
    const projected = items.find((item) => item.id === `task:${child.taskId}`)!;

    expect(projected.classification).toMatchObject({
      projectLabel: "创作辅助工具电子屏幕硬件-软硬件系统设计",
      subprojectLabel: "布局"
    });
    expect(projected.parentRelations).toEqual([relation]);
    const grouped = groupWorkPoolItemsBy(items, "project", "subproject");
    expect(grouped[0].children.some((group) => group.title === "布局")).toBe(true);
  });

  it("builds saved-view style two-level groups without duplicating work", () => {
    const echo = workflow("Projects/Echo.md", "sparks");
    echo.frontmatter = { project: "Echo" };
    const taskItem = task("a", "Draft", "[[Projects/Echo#^task_a]]");
    const items = buildWorkPoolItems({
      tasks: [taskItem],
      questions: [question("q-group", "write", "Projects/Echo.md")],
      inboxItems: [],
      workflowFiles: [echo]
    });
    const groups = groupWorkPoolItemsBy(items, "project", "note");

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: "echo", title: "Echo", counts: { total: 3 } });
    expect(groups[0].children).toHaveLength(1);
    expect(groups[0].children[0].counts.total).toBe(3);
    expect(groups[0].children[0].items.map((item) => item.id)).toHaveLength(3);
  });

  it("hides individual items and excludes source files or folders without mutating input", () => {
    const sourceTask = task("a", "Legacy task", "[[Archive/Old/Legacy#^task_a]]");
    const visibleTask = task("b", "Current task", "[[Projects/Echo#^task_b]]");
    const service = new WorkPoolService();
    const snapshot = service.build({
      tasks: [sourceTask, visibleTask],
      questions: [question("q-hidden", "think", "Projects/Echo.md")],
      inboxItems: [],
      workflowFiles: [],
      visibility: {
        hiddenItemIds: ["question:q-hidden"],
        excludedSourcePaths: ["Archive/Old"]
      }
    }, { history: "all" });

    expect(snapshot.items.map((item) => item.id)).toEqual([`task:${visibleTask.taskId}`]);
    expect(snapshot.counts.tasks).toBe(1);
    expect(sourceTask.state).toBe("pool");
  });

  it("uses a task-source allowlist while keeping standalone pool tasks and exclusions", () => {
    const allowed = task("a", "Allowed", "[[Projects/Active/Note#^task_a]]");
    const legacy = task("b", "Legacy", "[[Archive/Legacy#^task_b]]");
    const excluded = task("c", "Excluded", "[[Projects/Active/Private#^task_c]]");
    const standalone = task("d", "Standalone");
    const snapshot = new WorkPoolService().build({
      tasks: [allowed, legacy, excluded, standalone],
      questions: [],
      inboxItems: [],
      workflowFiles: [],
      visibility: {
        enforceTaskSourceAllowlist: true,
        includedTaskSourcePaths: ["Projects/Active"],
        excludedSourcePaths: ["Projects/Active/Private.md"]
      }
    }, { history: "all" });

    expect(snapshot.items.map((item) => item.title).sort()).toEqual(["Allowed", "Standalone"]);
  });
});

function task(
  suffix: string,
  text: string,
  source?: string,
  state: TaskPoolItem["state"] = "pool"
): TaskPoolItem {
  const taskId = `task_${suffix.repeat(32)}`;
  return {
    schemaVersion: 1,
    id: taskId,
    taskId,
    text,
    state,
    sourcePath: "Planning/Task Pool.md",
    line: 1,
    endLine: 2,
    rawLine: `- [ ] ${text}`,
    rawBlock: `- [ ] ${text}\n  ^${taskId}`,
    revision: { value: `rev_${suffix}`, sourcePath: "Planning/Task Pool.md", taskId },
    source,
    unknownLines: [],
    completedAt: state === "done" ? "2026-07-30T00:00:00.000Z" : undefined
  };
}

function question(
  id: string,
  lane: "think" | "write",
  file: string,
  status: string = "open"
): OpenQuestion {
  return {
    id,
    lane,
    status,
    kind: "todo",
    tags: [],
    color: "slate",
    question: `${lane} question`,
    source: { file, headingPath: [], lineStart: 1, lineEnd: 1, rule: "selection" }
  };
}

function inbox(filePath: string): InboxItem {
  return {
    id: `inbox:${filePath}`,
    kind: "vault-note",
    source: "vault-folder",
    matchedBy: "folder",
    status: "pending",
    title: "Echo",
    filePath,
    sourceRoot: "Projects",
    project: "Echo",
    folder: "Projects",
    tags: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z"
  };
}

function workflow(filePath: string, stageId: string): WorkflowFileSummary {
  return {
    filePath,
    title: filePath.split("/").pop()!.replace(/\.md$/u, ""),
    description: "",
    tags: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    ageDays: 0,
    stale: false,
    stageId,
    stageTitle: stageId,
    openQuestionCount: 0,
    thinkCount: 0,
    writeCount: 0,
    nextAction: "",
    openUri: ""
  };
}
