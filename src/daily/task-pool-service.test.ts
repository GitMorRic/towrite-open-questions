import { describe, expect, it } from "vitest";
import {
  TaskPoolConflictError,
  TaskPoolService,
  exportTaskPoolDocument,
  formatDailyTaskPoolReference,
  parseDailyTaskPoolReferences,
  parseTaskPoolMarkdown,
  reconcileDailyAssignments,
  toDailyAssignment,
  type TaskPoolStorage
} from "./task-pool-service";

const TASK_A = `task_${"a".repeat(32)}`;
const TASK_B = `task_${"b".repeat(32)}`;
const DAILY_A = `daily_${"1".repeat(32)}`;
const DAILY_B = `daily_${"2".repeat(32)}`;
const PATH = "Planning/Task Pool.md";

describe("TaskPoolService", () => {
  it("parses user-readable metadata without putting timing fields in task text", () => {
    const document = parseTaskPoolMarkdown([
      "# Task Pool",
      "",
      "## Tasks",
      "",
      "- [ ] 写出发布说明",
      "  [towrite-state:: pool]",
      "  [towrite-category:: 写作和发布]",
      "  [towrite-project:: [[Echo]]]",
      "  [towrite-target:: [[发布计划]]]",
      `  [towrite-source:: [[Quick Notes/index#^${TASK_A}]]]`,
      "  [towrite-due:: 2026-07-30]",
      "  [towrite-estimate:: 25m]",
      "  用户自己的说明",
      `  ^${TASK_A}`
    ].join("\n"), PATH);

    expect(document.diagnostics).toEqual([]);
    expect(document.items[0]).toMatchObject({
      taskId: TASK_A,
      text: "写出发布说明",
      state: "pool",
      category: "写作和发布",
      project: "[[Echo]]",
      target: "[[发布计划]]",
      source: `[[Quick Notes/index#^${TASK_A}]]`,
      dueDate: "2026-07-30",
      estimateMinutes: 25,
      unknownLines: ["  用户自己的说明"]
    });
    expect(document.items[0].rawLine).not.toContain("2026-07-30");
  });

  it("creates and updates a stable task while preserving unknown continuation text", async () => {
    const storage = new MemoryStorage();
    const service = serviceFor(storage);
    const created = await service.create({
      text: "理解 [[皮质醇]]",
      category: "记录和搞懂",
      project: "健康",
      target: "[[皮质醇]]",
      source: `[[Quick Notes/index#^${TASK_A}]]`,
      dueDate: "2026-07-31",
      estimateMinutes: 20
    });
    expect(created.taskId).toBe(TASK_A);
    expect(storage.files.get(PATH)).toContain(`[towrite-category:: 记录和搞懂]`);
    expect(storage.files.get(PATH)).toContain(`[towrite-source:: [[Quick Notes/index#^${TASK_A}]]]`);
    expect(storage.files.get(PATH)).toContain(`^${TASK_A}`);
    expect(storage.files.get(PATH)?.match(/理解 \[\[皮质醇\]\]/gu)).toHaveLength(1);

    storage.files.set(
      PATH,
      storage.files.get(PATH)!.replace(`  ^${TASK_A}`, `  手写上下文\n  ^${TASK_A}`)
    );
    const current = (await service.list())[0];
    const updated = await service.update(current.taskId, current.revision, {
      estimateMinutes: 35,
      category: "项目"
    });
    expect(updated).toMatchObject({ estimateMinutes: 35, category: "项目" });
    expect(storage.files.get(PATH)).toContain("手写上下文");
    await expect(service.update(updated.taskId, current.revision, { category: "过期" }))
      .rejects.toMatchObject({ code: "revision-changed" });
  });

  it("removes only an unassigned item for cross-document rollback", async () => {
    const storage = new MemoryStorage();
    const service = serviceFor(storage);
    const created = await service.create({ text: "等待迁移" });

    await service.removeUnassigned(created.taskId, created.revision);
    expect(await service.list()).toEqual([]);

    const next = await service.create({ text: "已经安排" });
    const planned = await service.assignToDate(next.taskId, next.revision, "2026-07-29");
    await expect(service.removeUnassigned(planned.task.taskId, planned.task.revision))
      .rejects.toMatchObject({ code: "invalid-state" });
  });

  it("assigns by task id, emits a content-free Daily ref, dedupes, and returns to the pool", async () => {
    const storage = new MemoryStorage();
    const service = serviceFor(storage);
    const created = await service.create({
      text: "正文只保存在任务池",
      category: "项目",
      target: "[[Echo MVP]]",
      dueDate: "2026-07-30",
      estimateMinutes: 15
    });
    const assigned = await service.assignToDate(created.taskId, created.revision, "2026-07-27");

    expect(assigned.task).toMatchObject({
      state: "planned",
      plannedDate: "2026-07-27",
      assignmentId: DAILY_A
    });
    expect(assigned.assignment).toEqual(expect.objectContaining({
      taskRef: TASK_A,
      date: "2026-07-27",
      category: "项目",
      target: "[[Echo MVP]]",
      dueDate: "2026-07-30",
      estimateMinutes: 15,
      assignmentId: DAILY_A
    }));
    expect(assigned.referenceMarkdown).toBe([
      `- [ ] [towrite-task-ref:: ${TASK_A}]`,
      `  ^${DAILY_A}`
    ].join("\n"));
    expect(assigned.referenceMarkdown).not.toContain("正文只保存在任务池");

    const refs = parseDailyTaskPoolReferences(assigned.referenceMarkdown, "2026-07-27");
    const reconciliation = reconcileDailyAssignments(await service.list(), [
      ...refs,
      ...refs
    ], "2026-07-27");
    expect(reconciliation).toMatchObject({
      assignedTaskIds: [TASK_A],
      duplicateTaskIds: [TASK_A],
      staleTaskIds: [],
      orphanedPlannedTaskIds: [],
      stateMismatchTaskIds: [],
      candidates: []
    });

    const returned = await service.returnToPool(
      assigned.task.taskId,
      assigned.task.revision,
      "2026-07-27"
    );
    expect(returned).toMatchObject({
      task: { state: "returned", returnedDate: "2026-07-27" },
      releasedAssignmentId: DAILY_A
    });
    expect((await service.candidates("2026-07-28")).map((item) => item.taskId)).toEqual([TASK_A]);
  });

  it("locks planned tasks to their current Daily assignment revision", async () => {
    const storage = new MemoryStorage();
    const service = serviceFor(storage);
    const created = await service.create({ text: "由 Daily 维护", category: "项目" });
    const assigned = await service.assignToDate(created.taskId, created.revision, "2026-07-27");

    await expect(service.update(assigned.task.taskId, assigned.task.revision, { category: "错误入口" }))
      .rejects.toMatchObject({ code: "invalid-state" });
    await expect(service.updateAssigned(
      assigned.task.taskId,
      assigned.task.revision,
      "2026-07-28",
      DAILY_A,
      { category: "错误日期" }
    )).rejects.toMatchObject({ code: "invalid-state" });

    const updated = await service.updateAssigned(
      assigned.task.taskId,
      assigned.task.revision,
      "2026-07-27",
      DAILY_A,
      { category: "Daily 已同步" }
    );
    expect(updated.category).toBe("Daily 已同步");
  });

  it("normalizes safe Markdown note targets without corrupting their brackets", async () => {
    const storage = new MemoryStorage();
    const service = serviceFor(storage);
    const created = await service.create({
      text: "打开目标",
      target: "[创作辅助工具](项目/创作辅助工具.md)"
    });
    expect(created.target).toBe("[[项目/创作辅助工具|创作辅助工具]]");
    expect(storage.files.get(PATH)).toContain(
      "[towrite-target:: [[项目/创作辅助工具|创作辅助工具]]]"
    );
    await expect(service.create({
      id: TASK_B,
      text: "不安全目标",
      target: "[外部](https://example.com/file.md)"
    })).rejects.toThrow(/safe Vault-relative/u);
  });

  it("uses CAS for drop and complete lifecycle transitions", async () => {
    const storage = new MemoryStorage();
    const ids = [TASK_A, TASK_B];
    const assignmentIds = [DAILY_A, DAILY_B];
    const service = new TaskPoolService(storage, {
      createTaskId: () => ids.shift()!,
      createAssignmentId: () => assignmentIds.shift()!,
      now: () => new Date("2026-07-27T09:00:00+08:00")
    });
    const first = await service.create({ text: "不再做" });
    const second = await service.create({ text: "已经完成" });
    const dropped = await service.drop(first.taskId, first.revision);
    const completed = await service.complete(second.taskId, second.revision);

    expect(dropped.task).toMatchObject({
      state: "dropped",
      droppedAt: "2026-07-27T01:00:00.000Z"
    });
    expect(completed.task).toMatchObject({
      state: "done",
      completedAt: "2026-07-27T01:00:00.000Z"
    });
    expect(completed.task.rawLine).toContain("- [x]");
    await expect(service.complete(first.taskId, dropped.task.revision))
      .rejects.toMatchObject({ code: "invalid-state" });
    await expect(service.returnToPool(second.taskId, second.revision))
      .rejects.toBeInstanceOf(TaskPoolConflictError);
  });

  it("reopens a completed pool task against the still-readable Daily assignment", async () => {
    const storage = new MemoryStorage();
    const service = serviceFor(storage);
    const created = await service.create({ text: "可以重新打开" });
    const assigned = await service.assignToDate(created.taskId, created.revision, "2026-07-27");
    const completed = await service.complete(assigned.task.taskId, assigned.task.revision);
    await expect(service.reopenForDate(
      completed.task.taskId,
      completed.task.revision,
      "2026-07-27",
      DAILY_B
    )).rejects.toMatchObject({ code: "invalid-state" });
    const reopened = await service.reopenForDate(
      completed.task.taskId,
      completed.task.revision,
      "2026-07-27",
      DAILY_A
    );

    expect(reopened.task).toMatchObject({
      state: "planned",
      plannedDate: "2026-07-27",
      assignmentId: DAILY_A,
      completedAt: undefined
    });
    const replay = await service.reopenForDate(
      reopened.task.taskId,
      reopened.task.revision,
      "2026-07-27",
      DAILY_A
    );
    expect(replay.idempotent).toBe(true);
  });

  it("reports duplicate IDs and detects stale or mismatched Daily references", () => {
    const document = parseTaskPoolMarkdown([
      "## Tasks",
      `- [ ] One ^${TASK_A}`,
      `- [ ] Two ^${TASK_A}`
    ].join("\n"), PATH);
    expect(document.diagnostics.filter((item) => item.code === "duplicate-task-id")).toHaveLength(2);

    const poolDocument = parseTaskPoolMarkdown([
      "## Tasks",
      "- [ ] One",
      "  [towrite-state:: pool]",
      `  ^${TASK_A}`
    ].join("\n"), PATH);
    const result = reconcileDailyAssignments(poolDocument.items, [
      { taskRef: TASK_A, date: "2026-07-27" },
      { taskRef: TASK_B, date: "2026-07-27" }
    ], "2026-07-27");
    expect(result.stateMismatchTaskIds).toEqual([TASK_A]);
    expect(result.staleTaskIds).toEqual([TASK_B]);
    expect(result.candidates).toEqual([]);
  });

  it("exports a readable snapshot and keeps assignment helpers pure", () => {
    const document = parseTaskPoolMarkdown([
      "## Tasks",
      "- [ ] One",
      "  [towrite-state:: planned]",
      "  [towrite-planned:: 2026-07-27]",
      `  [towrite-assignment:: ${DAILY_A}]`,
      `  ^${TASK_A}`
    ].join("\n"), PATH);
    const assignment = toDailyAssignment(document.items[0], "2026-07-27");
    expect(formatDailyTaskPoolReference(assignment)).not.toContain("One");
    expect(exportTaskPoolDocument(document, "2026-07-27T00:00:00Z")).toMatchObject({
      exportedAt: "2026-07-27T00:00:00.000Z",
      sourcePath: PATH,
      items: [{ taskId: TASK_A, text: "One", state: "planned" }]
    });
  });
});

function serviceFor(storage: MemoryStorage): TaskPoolService {
  return new TaskPoolService(storage, {
    createTaskId: () => TASK_A,
    createAssignmentId: () => DAILY_A,
    now: () => new Date("2026-07-27T08:00:00+08:00")
  });
}

class MemoryStorage implements TaskPoolStorage {
  readonly files = new Map<string, string>();

  async readText(path: string): Promise<string | undefined> {
    return this.files.get(path);
  }

  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
}
