import { describe, expect, it } from "vitest";
import {
  NoteTaskService,
  parseNoteTasks,
  type NoteTaskStorage
} from "./note-task-service";

const firstId = `task_${"a".repeat(32)}`;
const secondId = `task_${"b".repeat(32)}`;

function memoryStorage(initial: Record<string, string>): NoteTaskStorage & {
  values: Map<string, string>;
  writes: number;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    writes: 0,
    async readText(path) {
      return values.get(path);
    },
    async writeText(path, content) {
      this.writes += 1;
      values.set(path, content);
    }
  };
}

describe("ordinary note task recognition", () => {
  it("indexes linked child documents below a tracked project task without copying child task text", () => {
    const document = parseNoteTasks([
      `- [ ] 布局 ^${firstId}`,
      `  [towrite-pool-ref:: ${firstId}]`,
      "  1. [[墨水屏项目与方案汇总]]",
      "  2. [Layout](创作辅助工具电子屏幕-Layout和布局.md)",
      `- [ ] 另一个项目 ^${secondId}`,
      "  1. [[不应归到布局]]"
    ].join("\n"), "Projects/创作辅助工具电子屏幕硬件.md");

    expect(document.relations).toMatchObject([
      {
        parentTaskId: firstId,
        parentTaskText: "布局",
        childLinkText: "墨水屏项目与方案汇总",
        line: 3
      },
      {
        parentTaskId: firstId,
        parentTaskText: "布局",
        childLinkText: "创作辅助工具电子屏幕-Layout和布局.md",
        line: 4
      },
      {
        parentTaskId: secondId,
        parentTaskText: "另一个项目",
        childLinkText: "不应归到布局",
        line: 6
      }
    ]);
  });

  it("recognizes non-empty checkboxes anywhere in an ordinary Markdown note", () => {
    const document = parseNoteTasks(
      [
        "# index",
        "",
        "- [ ] 这是一个待办",
        "- [ ]",
        "",
        "普通正文"
      ].join("\n"),
      "Quick Notes/index.md",
      () => firstId
    );

    expect(document.candidates).toHaveLength(1);
    expect(document.candidates[0]).toMatchObject({
      sourcePath: "Quick Notes/index.md",
      line: 3,
      taskText: "这是一个待办",
      proposedTaskId: firstId
    });
    expect(document.tasks).toHaveLength(0);
  });

  it("exposes unfinished, in-progress, and completed candidate states for automatic filtering", () => {
    const generatedIds = [firstId, secondId, `task_${"c".repeat(32)}`];
    const document = parseNoteTasks(
      [
        "- [ ] 尚未开始",
        "- [/] 正在处理",
        "- [x] 已经完成"
      ].join("\n"),
      "Quick Notes/statuses.md",
      () => generatedIds.shift()!
    );

    expect(document.candidates.map(({ taskText, status }) => ({ taskText, status }))).toEqual([
      { taskText: "尚未开始", status: "todo" },
      { taskText: "正在处理", status: "in-progress" },
      { taskText: "已经完成", status: "done" }
    ]);
  });

  it("ignores frontmatter, fenced examples, empty tasks, and ordinary bullets", () => {
    const document = parseNoteTasks(
      [
        "---",
        "sample: '- [ ] frontmatter example'",
        "---",
        "",
        "```md",
        "- [ ] fenced example",
        "```",
        "- [ ]",
        "- ordinary bullet",
        "- [ ] real task"
      ].join("\n"),
      "Notes/examples.md",
      () => firstId
    );

    expect(document.candidates.map((candidate) => candidate.taskText)).toEqual(["real task"]);
  });

  it("tracks one task without adding optional metadata", async () => {
    const path = "Quick Notes/index.md";
    const storage = memoryStorage({ [path]: "# index\n\n- [ ] 这是一个待办\n- [ ]\n" });
    const service = new NoteTaskService(storage, () => firstId);
    const candidate = (await service.inspect(path)).candidates[0];

    const task = await service.adopt(candidate);

    expect(storage.values.get(path)).toBe(`# index\n\n- [ ] 这是一个待办 ^${firstId}\n- [ ]\n`);
    expect(task.taskId).toBe(firstId);
    expect(task.text).toBe("这是一个待办");
    expect(task.ownedMetadataLines).toEqual([]);
  });

  it("stores and preserves the hidden Task Pool reference separately from task text", async () => {
    const path = "Quick Notes/index.md";
    const storage = memoryStorage({ [path]: "- [ ] 统一登记\n" });
    const service = new NoteTaskService(storage, () => firstId);
    const candidate = (await service.inspect(path)).candidates[0];

    const task = await service.adopt(candidate, { poolTaskRef: secondId });

    expect(task.poolTaskRef).toBe(secondId);
    expect(storage.values.get(path)).toBe([
      `- [ ] 统一登记 ^${firstId}`,
      `  [towrite-pool-ref:: ${secondId}]`,
      ""
    ].join("\n"));
    const updated = await service.update(task, { category: "项目" });
    expect(updated.poolTaskRef).toBe(secondId);
  });

  it("uses the atomic storage transaction when the Vault adapter provides it", async () => {
    const path = "Quick Notes/index.md";
    const storage = memoryStorage({ [path]: "- [ ] 原子收编\n" });
    let processCalls = 0;
    storage.processText = async (target, update) => {
      processCalls += 1;
      const next = update(storage.values.get(target)!);
      storage.values.set(target, next);
      return next;
    };
    const service = new NoteTaskService(storage, () => firstId);
    const candidate = (await service.inspect(path)).candidates[0];

    await service.adopt(candidate);

    expect(processCalls).toBe(1);
    expect(storage.writes).toBe(0);
    expect(storage.values.get(path)).toBe(`- [ ] 原子收编 ^${firstId}\n`);
  });

  it("registers several unfinished checkboxes in one atomic document transaction", async () => {
    const path = "Quick Notes/batch.md";
    const original = [
      "# 待办",
      "",
      "- [ ] 第一件事",
      "- [/] 第二件事",
      "- [x] 历史完成项",
      ""
    ].join("\n");
    const storage = memoryStorage({ [path]: original });
    let processCalls = 0;
    storage.processText = async (target, update) => {
      processCalls += 1;
      const next = update(storage.values.get(target)!);
      storage.values.set(target, next);
      return next;
    };
    const generatedIds = [firstId, secondId, `task_${"c".repeat(32)}`];
    const service = new NoteTaskService(
      storage,
      () => generatedIds.shift() ?? `task_${"d".repeat(32)}`
    );
    const document = await service.inspect(path);
    const unfinished = document.candidates.filter((candidate) => candidate.status !== "done");

    const registered = await service.adoptMany(
      unfinished.map((candidate) => ({ candidate }))
    );

    expect(processCalls).toBe(1);
    expect(storage.writes).toBe(0);
    expect(registered).toMatchObject([
      {
        taskId: firstId,
        poolTaskRef: firstId,
        status: "todo",
        text: "第一件事"
      },
      {
        taskId: secondId,
        poolTaskRef: secondId,
        status: "in-progress",
        text: "第二件事"
      }
    ]);
    expect(storage.values.get(path)).toBe([
      "# 待办",
      "",
      `- [ ] 第一件事 ^${firstId}`,
      `  [towrite-pool-ref:: ${firstId}]`,
      `- [/] 第二件事 ^${secondId}`,
      `  [towrite-pool-ref:: ${secondId}]`,
      "- [x] 历史完成项",
      ""
    ].join("\n"));
  });

  it("defensively refuses to auto-register a completed checkbox", async () => {
    const path = "Quick Notes/completed.md";
    const original = "- [x] 已经完成\n";
    const storage = memoryStorage({ [path]: original });
    const service = new NoteTaskService(storage, () => firstId);
    const completed = (await service.inspect(path)).candidates[0];

    await expect(service.adoptMany([{ candidate: completed }])).rejects.toMatchObject({
      code: "invalid-document"
    });
    expect(storage.values.get(path)).toBe(original);
    expect(storage.writes).toBe(0);
  });

  it("atomically adds only selected properties and preserves nested user prose", async () => {
    const path = "Notes/project.md";
    const storage = memoryStorage({
      [path]: [
        "- [ ] 完成发布说明",
        "  这是用户自己的备注",
        "  - 子列表",
        ""
      ].join("\n")
    });
    const service = new NoteTaskService(storage, () => firstId);
    const candidate = (await service.inspect(path)).candidates[0];

    await service.adopt(candidate, {
      category: "写作和发布",
      dueDate: "2026-07-30",
      estimateMinutes: 25,
      target: "[[Echo 发布计划]]"
    });

    expect(storage.values.get(path)).toBe([
      `- [ ] 完成发布说明 ^${firstId}`,
      "  [towrite-category:: 写作和发布]",
      "  [towrite-target:: [[Echo 发布计划]]]",
      "  [towrite-due:: 2026-07-30]",
      "  [towrite-estimate:: 25m]",
      "  这是用户自己的备注",
      "  - 子列表",
      ""
    ].join("\n"));
  });

  it("rejects stale candidate snapshots without overwriting the note", async () => {
    const path = "Notes/project.md";
    const storage = memoryStorage({ [path]: "- [ ] 初始内容\n" });
    const service = new NoteTaskService(storage, () => firstId);
    const candidate = (await service.inspect(path)).candidates[0];
    storage.values.set(path, "- [ ] 用户已经修改\n");

    await expect(service.adopt(candidate)).rejects.toMatchObject({
      code: "revision-changed"
    });
    expect(storage.writes).toBe(0);
    expect(storage.values.get(path)).toBe("- [ ] 用户已经修改\n");
  });

  it("updates tracked properties while preserving unknown text", async () => {
    const path = "Notes/project.md";
    const storage = memoryStorage({
      [path]: [
        `- [ ] 发布说明 ^${firstId}`,
        "  [towrite-category:: 写作]",
        "  不能丢失的备注",
        ""
      ].join("\n")
    });
    const service = new NoteTaskService(storage, () => secondId);
    const item = (await service.inspect(path)).tasks[0];

    const updated = await service.update(item, {
      category: "写作和发布",
      dueDate: "2026-07-31",
      nextStep: "先列出三个要点"
    });

    expect(updated.category).toBe("写作和发布");
    expect(updated.dueDate).toBe("2026-07-31");
    expect(storage.values.get(path)).toBe([
      `- [ ] 发布说明 ^${firstId}`,
      "  [towrite-category:: 写作和发布]",
      "  [towrite-due:: 2026-07-31]",
      "  [towrite-next:: 先列出三个要点]",
      "  不能丢失的备注",
      ""
    ].join("\n"));
  });

  it("never treats a nested task's metadata as parent properties", async () => {
    const path = "Notes/nested.md";
    const storage = memoryStorage({
      [path]: [
        `- [ ] 父任务 ^${firstId}`,
        "  [towrite-category:: 项目]",
        `  - [ ] 子任务 ^${secondId}`,
        "    [towrite-category:: 写作]",
        ""
      ].join("\n")
    });
    const service = new NoteTaskService(storage, () => `task_${"c".repeat(32)}`);
    const parent = (await service.inspect(path)).tasks.find((task) => task.taskId === firstId)!;

    await service.update(parent, { category: "其他" });

    expect(storage.values.get(path)).toContain("  [towrite-category:: 其他]");
    expect(storage.values.get(path)).toContain("    [towrite-category:: 写作]");
  });

  it("stores planning timestamps separately from the task title", async () => {
    const path = "Notes/timed.md";
    const storage = memoryStorage({ [path]: "- [ ] 定时任务\n" });
    const service = new NoteTaskService(storage, () => firstId);
    const candidate = (await service.inspect(path)).candidates[0];

    const item = await service.adopt(candidate, {
      plannedStartAt: "2026-07-29T09:00",
      expectedFinishAt: "2026-07-29T10:30",
      deadlineAt: "2026-07-30T18:00"
    });

    expect(item).toMatchObject({
      plannedStartAt: "2026-07-29T09:00",
      expectedFinishAt: "2026-07-29T10:30",
      deadlineAt: "2026-07-30T18:00"
    });
    expect(storage.values.get(path)).toContain("  [towrite-planned-start:: 2026-07-29T09:00]");
    expect(storage.values.get(path)).toContain("  [towrite-expected-finish:: 2026-07-29T10:30]");
    expect(storage.values.get(path)).toContain("  [towrite-deadline:: 2026-07-30T18:00]");
    expect(storage.values.get(path)?.split("\n")[0]).toBe(`- [ ] 定时任务 ^${firstId}`);
  });

  it("rejects an expected finish before the planned start", async () => {
    const path = "Notes/timed.md";
    const storage = memoryStorage({ [path]: "- [ ] 定时任务\n" });
    const service = new NoteTaskService(storage, () => firstId);
    const candidate = (await service.inspect(path)).candidates[0];

    await expect(service.adopt(candidate, {
      plannedStartAt: "2026-07-29T10:00",
      expectedFinishAt: "2026-07-29T09:00"
    })).rejects.toThrow("Expected finish");
    expect(storage.writes).toBe(0);
  });

  it("updates the checkbox status without touching the task title or metadata", async () => {
    const path = "Notes/timed.md";
    const storage = memoryStorage({
      [path]: `- [ ] 定时任务 ^${firstId}\n  [towrite-category:: 项目]\n`
    });
    const service = new NoteTaskService(storage, () => secondId);
    const item = (await service.inspect(path)).tasks[0];

    const completed = await service.setStatus(item, "done");

    expect(completed.status).toBe("done");
    expect(storage.values.get(path)).toBe(
      `- [x] 定时任务 ^${firstId}\n  [towrite-category:: 项目]\n`
    );
  });

  it("refuses to erase invalid or duplicate hand-edited timing metadata", async () => {
    const path = "Notes/invalid-timing.md";
    const original = [
      `- [ ] 定时任务 ^${firstId}`,
      "  [towrite-planned-start:: 明天上午]",
      "  [towrite-deadline:: 2026-07-30T18:00]",
      "  [towrite-deadline:: 2026-07-31T18:00]",
      ""
    ].join("\n");
    const storage = memoryStorage({ [path]: original });
    const service = new NoteTaskService(storage, () => secondId);
    const item = (await service.inspect(path)).tasks[0];

    expect(item.invalidOwnedMetadataLines).toEqual([2, 4]);
    await expect(service.update(item, { category: "项目" })).rejects.toThrow(
      "invalid or duplicated"
    );
    expect(storage.values.get(path)).toBe(original);
    expect(storage.writes).toBe(0);
  });

  it("canonicalizes a legacy date-only deadline into the single precise DDL field", async () => {
    const path = "Notes/legacy-due.md";
    const storage = memoryStorage({
      [path]: `- [ ] 定时任务 ^${firstId}\n  [towrite-due:: 2026-07-30]\n`
    });
    const service = new NoteTaskService(storage, () => secondId);
    const item = (await service.inspect(path)).tasks[0];

    const updated = await service.update(item, {
      dueDate: null,
      deadlineAt: "2026-07-30T23:59"
    });

    expect(updated.dueDate).toBeUndefined();
    expect(updated.deadlineAt).toBe("2026-07-30T23:59");
    expect(storage.values.get(path)).not.toContain("[towrite-due::");
    expect(storage.values.get(path)).toContain("[towrite-deadline:: 2026-07-30T23:59]");
  });
});
