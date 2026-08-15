import { describe, expect, it } from "vitest";
import {
  DailyPlanConflictError,
  DailyPlanService,
  predictDailyPlanItemStatusRevision,
  type DailyPlanStorage
} from "./plan-service";
import { buildDailySummary } from "./summary";

describe("DailyPlanService", () => {
  const poolRevision = `tpr_${"a".repeat(32)}`;

  it("predicts the exact full logical-block revision for crash-safe status writes", async () => {
    const storage = new MemoryDailyStorage();
    const service = new DailyPlanService(storage, {
      createId: () => "daily_revision_test",
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });
    const created = await service.create({ text: "Keep handwritten context" });
    const path = "Daily/2026-07-23.md";
    storage.files.set(
      path,
      storage.files.get(path)!.replace(
        " ^daily_revision_test",
        " ^daily_revision_test\n  Handwritten explanation must remain"
      )
    );
    const current = (await service.list("2026-07-23"))[0];
    const predicted = predictDailyPlanItemStatusRevision(current, "done");
    const completed = await service.complete(current.id, current.revision, current.date);

    expect(completed.revision.value).toBe(predicted.value);
    expect(storage.files.get(path)).toContain("Handwritten explanation must remain");
    expect(created.id).toBe(current.id);
  });

  it("creates a clean daily item with readable metadata and a stable block id", async () => {
    const storage = new MemoryDailyStorage();
    const service = new DailyPlanService(storage, {
      createId: () => "daily_test123",
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });

    const creation = await service.createWithResult({
      text: "补充 [[关于创作]]",
      kind: "edit_note",
      category: "写作与发布",
      taskRef: "task_pool_writing01",
      taskPoolRevision: poolRevision,
      workKind: "question",
      workRef: "question-local-1",
      workRevision: `wq_${"b".repeat(32)}`,
      devicePolicy: "scheduled",
      scheduledDate: "2026-07-23",
      scheduledFor: "2026-07-23T09:30",
      dueDate: "2026-07-24",
      tags: ["writing"]
    });
    const item = creation.item;

    expect(creation.created).toBe(true);
    expect(item).toMatchObject({
      id: "daily_test123",
      date: "2026-07-23",
      text: "补充 [[关于创作]]",
      kind: "edit_note",
      category: "写作与发布",
      taskRef: "task_pool_writing01",
      taskPoolRevision: poolRevision,
      workKind: "question",
      workRef: "question-local-1",
      workRevision: `wq_${"b".repeat(32)}`,
      devicePolicy: "scheduled",
      scheduledDate: "2026-07-23",
      scheduledFor: "2026-07-23T09:30",
      dueDate: "2026-07-24",
      linkedNotes: ["关于创作"],
      status: "todo"
    });
    const written = storage.files.get("Daily/2026-07-23.md")!;
    expect(written).toContain("- [ ] 补充 [[关于创作]] #writing");
    expect(written).not.toContain("⏳");
    expect(written).not.toContain("📅");
    expect(written).toContain("[towrite-category:: 写作与发布]");
    expect(written).toContain("[towrite-task-ref:: task_pool_writing01]");
    expect(written).toContain(`[towrite-pool-revision:: ${poolRevision}]`);
    expect(written).toContain("[towrite-work-kind:: question]");
    expect(written).toContain("[towrite-work-ref:: question-local-1]");
    expect(written).toContain(`[towrite-work-revision:: wq_${"b".repeat(32)}]`);
    expect(written).toContain("[towrite-scheduled:: 2026-07-23]");
    expect(written).toContain("[towrite-due:: 2026-07-24]");
    expect(written).toContain("^daily_test123");
    expect(await service.createWithResult({
      id: "daily_test123",
      text: "补充 [[关于创作]]",
      kind: "edit_note",
      category: "写作与发布",
      taskRef: "task_pool_writing01",
      taskPoolRevision: poolRevision,
      workKind: "question",
      workRef: "question-local-1",
      workRevision: `wq_${"b".repeat(32)}`,
      devicePolicy: "scheduled",
      scheduledDate: "2026-07-23",
      scheduledFor: "2026-07-23T09:30",
      dueDate: "2026-07-24",
      tags: ["writing"]
    })).toMatchObject({ item: { id: item.id }, created: false });
    await expect(service.createWithResult({
      id: "daily_test123",
      text: "同一稳定标识但内容不同"
    })).rejects.toMatchObject({ code: "id-reused" });
    expect(item.revision.date).toBe("2026-07-23");
  });

  it("normalizes safe Markdown targets into metadata-safe wikilinks", async () => {
    const storage = new MemoryDailyStorage();
    const service = new DailyPlanService(storage, {
      createId: () => "daily_markdown_target",
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });
    const item = await service.create({
      text: "打开项目",
      target: "[创作辅助工具](项目/创作辅助工具.md)"
    });
    expect(item.target).toBe("[[项目/创作辅助工具|创作辅助工具]]");
    expect(storage.files.get(item.sourcePath)).toContain(
      "[towrite-target:: [[项目/创作辅助工具|创作辅助工具]]]"
    );
  });

  it("round-trips a local named desktop action without exposing its target", async () => {
    const storage = new MemoryDailyStorage();
    const service = new DailyPlanService(storage, {
      createId: () => "daily_named_action",
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });
    const created = await service.create({
      text: "继续写作",
      desktopActionId: "writing-focus"
    });
    expect(created.desktopActionId).toBe("writing-focus");
    expect(created.targetResolution).toMatchObject({ source: "action", actionId: "writing-focus" });
    expect(storage.files.get(created.sourcePath)).toContain("[towrite-action:: writing-focus]");
    expect(storage.files.get(created.sourcePath)).not.toContain("vscode://");

    const updated = await service.update(created.id, created.revision, { desktopActionId: null });
    expect(updated.desktopActionId).toBeUndefined();
    expect(storage.files.get(updated.sourcePath)).not.toContain("[towrite-action::");
  });

  it("can opt into legacy Tasks-compatible date output while retaining clean parsing", async () => {
    const storage = new MemoryDailyStorage();
    const service = new DailyPlanService(storage, {
      createId: () => "daily_tasks_compat",
      now: () => new Date("2026-07-23T08:00:00+08:00"),
      tasksCompatibilityOutput: true
    });

    const item = await service.create({
      text: "Tasks compatibility",
      scheduledDate: "2026-07-23",
      dueDate: "2026-07-24"
    });
    const written = storage.files.get(item.sourcePath)!;
    expect(written).toContain("- [ ] Tasks compatibility ⏳ 2026-07-23 📅 2026-07-24");
    expect(written).not.toContain("[towrite-scheduled::");
    expect(written).not.toContain("[towrite-due::");
    expect(item).toMatchObject({
      scheduledDate: "2026-07-23",
      scheduledDateExplicit: true,
      dueDate: "2026-07-24",
      dueDateExplicit: true
    });
  });

  it("updates and completes only the expected task revision", async () => {
    const storage = new MemoryDailyStorage();
    const service = new DailyPlanService(storage, {
      createId: () => "daily_revision1",
      now: () => new Date("2026-07-23T08:00:00")
    });
    const created = await service.create({ text: "整理提纲" });
    const updated = await service.update(created.id, created.revision, {
      text: "整理第二章提纲",
      status: "in-progress",
      devicePolicy: "rotation"
    });
    const completed = await service.complete(updated.id, updated.revision);
    const completedEdited = await service.update(completed.id, completed.revision, { devicePolicy: "manual" });
    const reopened = await service.reopen(completedEdited.id, completedEdited.revision);

    expect(updated).toMatchObject({ text: "整理第二章提纲", status: "in-progress", devicePolicy: "rotation" });
    expect(completed).toMatchObject({ status: "done", completionDate: undefined });
    expect(completed.rawLine).toContain("- [x]");
    expect(completed.rawLine).not.toContain("✅");
    expect(completedEdited).toMatchObject({ status: "done", completionDate: undefined, devicePolicy: "manual" });
    expect(reopened).toMatchObject({ status: "todo", completionDate: undefined });
    expect(reopened.rawLine).not.toContain("✅");
    await expect(service.update(created.id, created.revision, { text: "过期修改" }))
      .rejects.toMatchObject({ code: "revision-changed" });
  });

  it("detects a Markdown edit made after preview and preserves it", async () => {
    const storage = new MemoryDailyStorage();
    const service = new DailyPlanService(storage, {
      createId: () => "daily_conflict1",
      now: () => new Date("2026-07-23T08:00:00")
    });
    const item = await service.create({ text: "原任务" });
    storage.files.set(item.sourcePath, storage.files.get(item.sourcePath)!.replace("原任务", "用户手改"));

    await expect(service.complete(item.id, item.revision)).rejects.toBeInstanceOf(DailyPlanConflictError);
    expect(storage.files.get(item.sourcePath)).toContain("用户手改");
    expect(storage.files.get(item.sourcePath)).not.toContain("- [x]");
  });

  it("parses and safely replaces the canonical multiline task block", async () => {
    const storage = new MemoryDailyStorage();
    storage.files.set("Daily/2026-07-23.md", [
      "# 2026-07-23",
      "",
      "## ToDo",
      "",
      "- [ ] 补充 [[关于创作]] 🔺 ⏳ 2026-07-23 📅 2026-07-24",
      "  [towrite-kind:: edit_note] [towrite-device:: scheduled] [towrite-at:: 2026-07-23T09:30]",
      "  ^daily_multiline1",
      "这行与任务无关，必须保留。",
      "- [ ] 另一项 [towrite-kind:: task] [towrite-device:: none] ^daily_other1",
      "",
      "## Notes",
      "正文"
    ].join("\n"));
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-23T08:00:00")
    });

    const item = (await service.list("2026-07-23"))[0];
    expect(item).toMatchObject({
      id: "daily_multiline1",
      text: "补充 [[关于创作]]",
      kind: "edit_note",
      devicePolicy: "scheduled",
      priority: "highest",
      scheduledFor: "2026-07-23T09:30",
      dueDate: "2026-07-24",
      line: 5,
      endLine: 7
    });
    expect(item.rawBlock).toContain("[towrite-kind:: edit_note]");
    expect(item.rawBlock).toContain("^daily_multiline1");

    const completed = await service.complete(item.id, item.revision, "2026-07-23");
    const written = storage.files.get(item.sourcePath)!;
    expect(completed).toMatchObject({ status: "done", priority: "highest", line: 5, endLine: 8 });
    expect(written).toContain("- [x] 补充 [[关于创作]] 🔺");
    expect(written).not.toContain("⏳");
    expect(written).not.toContain("📅");
    expect(written).toContain("[towrite-scheduled:: 2026-07-23]");
    expect(written).toContain("[towrite-due:: 2026-07-24]");
    expect(written).toContain("\n  %% [towrite-kind:: edit_note]");
    expect(written).toContain("^daily_multiline1");
    expect(written).toContain("这行与任务无关，必须保留。");
    expect(written).toContain("^daily_other1");
    expect(written).toContain("## Notes\n正文");
  });

  it("includes continuation metadata in revision conflicts", async () => {
    const storage = new MemoryDailyStorage();
    storage.files.set("Daily/2026-07-23.md", [
      "# 2026-07-23",
      "## ToDo",
      "- [ ] 原任务 📅 2026-07-23",
      "  [towrite-kind:: task] [towrite-device:: rotation]",
      "  ^daily_blockrev1"
    ].join("\n"));
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-23T08:00:00")
    });
    const item = (await service.list("2026-07-23"))[0];
    storage.files.set(item.sourcePath, storage.files.get(item.sourcePath)!.replace(
      "[towrite-device:: rotation]",
      "[towrite-device:: agent]"
    ));

    await expect(service.complete(item.id, item.revision, item.date))
      .rejects.toMatchObject({ code: "revision-changed" });
    expect(storage.files.get(item.sourcePath)).toContain("[towrite-device:: agent]");
  });

  it("removes an exact task subtree under CAS and preserves siblings and unrelated prose", async () => {
    const path = "Daily/2026-07-23.md";
    const markdown = [
      "# 2026-07-23",
      "## ToDo",
      "- [ ] Parent task",
      "  [towrite-category:: 项目]",
      "  - [ ] Child task",
      "    ^daily_remove_child",
      "  ^daily_remove_parent",
      "- [ ] Keep sibling",
      "  Keep this explanation",
      "  ^daily_remove_keep",
      "",
      "## Notes",
      "Unrelated prose must stay."
    ].join("\n");
    const storage = new MemoryDailyStorage();
    storage.files.set(path, markdown);
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });
    const parent = (await service.list())[0];

    const removed = await service.remove(parent.id, parent.revision);
    expect(removed.id).toBe("daily_remove_parent");
    const written = storage.files.get(path)!;
    expect(written).not.toContain("Parent task");
    expect(written).not.toContain("Child task");
    expect(written).not.toContain("^daily_remove_child");
    expect(written).toContain("- [ ] Keep sibling");
    expect(written).toContain("Keep this explanation");
    expect(written).toContain("## Notes\nUnrelated prose must stay.");
    expect((await service.list()).map((item) => item.id)).toEqual(["daily_remove_keep"]);
  });

  it("refuses to remove a task after its full logical block changed", async () => {
    const path = "Daily/2026-07-23.md";
    const storage = new MemoryDailyStorage();
    storage.files.set(path, [
      "# 2026-07-23",
      "## ToDo",
      "- [ ] Keep on conflict",
      "  [towrite-category:: 项目]",
      "  ^daily_remove_conflict"
    ].join("\n"));
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });
    const item = (await service.list())[0];
    storage.files.set(path, storage.files.get(path)!.replace("项目", "写作与发布"));

    await expect(service.remove(item.id, item.revision))
      .rejects.toMatchObject({ code: "revision-changed" });
    expect(storage.files.get(path)).toContain("Keep on conflict");
    expect(storage.files.get(path)).toContain("[towrite-category:: 写作与发布]");
  });

  it("maps and retains Obsidian Tasks priority emoji", async () => {
    const storage = new MemoryDailyStorage();
    storage.files.set("Daily/2026-07-23.md", [
      "# 2026-07-23",
      "## ToDo",
      "- [ ] Highest 🔺 ^daily_priority_highest",
      "- [ ] High ⏫ ^daily_priority_high",
      "- [ ] Medium 🔼 ^daily_priority_normal",
      "- [ ] Low 🔽 ^daily_priority_low",
      "- [ ] Lowest ⏬ ^daily_priority_lowest"
    ].join("\n"));
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-23T08:00:00")
    });
    const items = await service.list("2026-07-23");

    expect(items.map((item) => item.priority)).toEqual(["highest", "high", "normal", "low", "lowest"]);
    const normal = items[2];
    await service.update(normal.id, normal.revision, { devicePolicy: "agent" }, normal.date);
    expect(storage.files.get(normal.sourcePath)).toContain("Medium");
    expect(storage.files.get(normal.sourcePath)).not.toContain("Medium 🔼");
  });

  it("completes the frozen source-day task after the local calendar crosses midnight", async () => {
    const storage = new MemoryDailyStorage();
    // Use the runner's local calendar rather than assuming Asia/Shanghai.
    // DailyPlanService intentionally follows the user's local day.
    let now = new Date(2026, 6, 23, 23, 59);
    const service = new DailyPlanService(storage, {
      createId: () => "daily_crossmidnight",
      now: () => now
    });
    const item = await service.create({ text: "睡前仍显示在墨水屏上的任务" });

    now = new Date(2026, 6, 24, 0, 1);
    expect(await service.get(item.id)).toBeUndefined();
    const completed = await service.complete(item.id, item.revision, item.date);

    expect(completed).toMatchObject({
      id: item.id,
      date: "2026-07-23",
      status: "done",
      completionDate: undefined
    });
    expect(storage.files.get("Daily/2026-07-23.md")).not.toContain("✅ 2026-07-24");
    expect(storage.files.has("Daily/2026-07-24.md")).toBe(false);
  });

  it("replaces a migrated task with an audit marker that no longer counts as active work", async () => {
    const storage = new MemoryDailyStorage();
    const service = new DailyPlanService(storage, {
      createId: () => "daily_migration_source",
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });
    const item = await service.create({ text: "Move this commitment" });

    const migration = await service.recordMigration(item.id, item.revision, {
      date: "2026-07-24",
      taskId: "daily_migration_destination",
      migrationId: "mig_test_1",
      migratedAt: "2026-07-23T20:00:00+08:00"
    }, item.date);

    expect(migration).toMatchObject({
      taskId: item.id,
      fromDate: "2026-07-23",
      toDate: "2026-07-24",
      destinationTaskId: "daily_migration_destination"
    });
    expect(await service.list(item.date)).toEqual([]);
    expect(storage.files.get(item.sourcePath)).toContain(
      "towrite:daily-task-migrated from=daily_migration_source to=daily_migration_destination"
    );
    expect(storage.files.get(item.sourcePath)).not.toContain("- [ ] Move this commitment");
  });

  it("migrates a uniquely-addressable leaf even when an unrelated sibling has multiple block ids", async () => {
    const storage = new MemoryDailyStorage();
    const path = "Daily/2026-07-23.md";
    storage.files.set(path, [
      "# 2026-07-23",
      "## ToDo",
      "- [ ] Safe migration source ^daily_safe_source",
      "- [ ] Unrelated malformed task ^daily_broken_one",
      "  ^daily_broken_two"
    ].join("\n"));
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });
    const source = await service.get("daily_safe_source", "2026-07-23");
    expect(source).toBeDefined();
    await expect(service.validateMigrationSource(
      source!.id,
      source!.revision,
      source!.date
    )).resolves.toMatchObject({ id: "daily_safe_source" });

    await expect(service.recordMigration(source!.id, source!.revision, {
      date: "2026-07-24",
      taskId: "daily_safe_destination",
      migrationId: "mig_safe_source",
      migratedAt: "2026-07-23T20:00:00+08:00"
    }, source!.date)).resolves.toMatchObject({ destinationTaskId: "daily_safe_destination" });

    const written = storage.files.get(path) ?? "";
    expect(written).toContain("towrite:daily-task-migrated from=daily_safe_source");
    expect(written).toContain("- [ ] Unrelated malformed task ^daily_broken_one");
    expect(written).toContain("  ^daily_broken_two");
  });

  it("rejects migration preflight when the selected block id itself is reused", async () => {
    const storage = new MemoryDailyStorage();
    const path = "Daily/2026-07-23.md";
    storage.files.set(path, [
      "# 2026-07-23",
      "## ToDo",
      "- [ ] First copy ^daily_reused_source",
      "- [ ] Second copy ^daily_reused_source"
    ].join("\n"));
    const service = new DailyPlanService(storage);
    const source = (await service.list("2026-07-23"))[0];

    await expect(service.validateMigrationSource(
      source.id,
      source.revision,
      source.date
    )).rejects.toMatchObject({ code: "invalid-document" });
    expect(storage.files.get(path)).toContain("- [ ] First copy ^daily_reused_source");
    expect(storage.files.get(path)).toContain("- [ ] Second copy ^daily_reused_source");
  });

  it("moves a checkbox category with numbered and checkbox children as one subtree", async () => {
    const storage = new MemoryDailyStorage();
    storage.files.set("Daily/2026-07-22.md", [
      "# 2026-07-22",
      "## 今日计划",
      "- [ ] 项目 ^daily_category_source",
      "  1. [[Project A]]",
      "  - [ ] 子任务 ^daily_category_child"
    ].join("\n"));
    const service = new DailyPlanService(storage);
    const source = (await service.list("2026-07-22"))[0];

    expect(source).toMatchObject({
      structuralCategory: true,
      structuralChildren: [
        { text: "[[Project A]]" },
        { text: "子任务" }
      ]
    });
    await expect(service.validateMigrationSubtreeSource(
      source.id,
      source.revision,
      source.date
    )).resolves.toMatchObject({ id: source.id, structuralCategory: true });

    const creation = await service.createMigrationSubtreeWithResult(
      source.id,
      source.revision,
      source.date,
      {
        id: "daily_category_destination",
        date: "2026-07-23",
        text: source.text,
        category: "项目"
      },
      undefined,
      { placement: "prepend", mergeExactChildren: true }
    );
    expect(creation.item).toMatchObject({
      structuralCategory: true,
      category: "项目",
      structuralChildren: [
        { text: "[[Project A]]" },
        { text: "子任务" }
      ]
    });
    await service.recordMigration(source.id, source.revision, {
      date: "2026-07-23",
      taskId: creation.item.id,
      migrationId: "mig_category_tree",
      includeSubtree: true
    }, source.date);

    const sourceMarkdown = storage.files.get("Daily/2026-07-22.md") ?? "";
    const destinationMarkdown = storage.files.get("Daily/2026-07-23.md") ?? "";
    expect(sourceMarkdown).toContain("towrite:daily-task-migrated from=daily_category_source");
    expect(sourceMarkdown).not.toContain("Project A");
    expect(destinationMarkdown).toContain("- [ ] 项目");
    expect(destinationMarkdown).toContain("  1. [[Project A]]");
    expect(destinationMarkdown).toContain("  - [ ] 子任务 ^daily_category_child");
  });

  it("keeps the authored type tree when it was written under a later custom heading", async () => {
    const storage = new MemoryDailyStorage();
    storage.files.set("Daily/2026-07-22.md", [
      "# 2026-07-22",
      "## ToDo",
      "- [ ] 已有任务 ^daily_existing_task",
      "",
      "## 随记",
      "- [ ] 项目 ^daily_late_category",
      "  1. [[创作辅助工具电子屏幕-Layout和布局]]",
      "     - [ ] 调整 FPC 端子间距 ^daily_late_child",
      "     - 留螺丝孔"
    ].join("\n"));
    const service = new DailyPlanService(storage);
    const source = (await service.list("2026-07-22"))
      .find((item) => item.id === "daily_late_category");

    expect(source).toMatchObject({
      text: "项目",
      structuralCategory: true,
      structuralChildren: [
        { text: "调整 FPC 端子间距" },
        { text: "留螺丝孔" }
      ]
    });

    const creation = await service.createMigrationSubtreeWithResult(
      source!.id,
      source!.revision,
      source!.date,
      {
        id: "daily_late_category_destination",
        date: "2026-07-23",
        text: source!.text,
        category: "项目"
      },
      undefined,
      { placement: "prepend", mergeExactChildren: true }
    );
    await service.recordMigration(source!.id, source!.revision, {
      date: "2026-07-23",
      taskId: creation.item.id,
      migrationId: "mig_late_category",
      includeSubtree: true
    }, source!.date);

    const destination = storage.files.get("Daily/2026-07-23.md") ?? "";
    expect(destination).toContain("- [ ] 项目");
    expect(destination).toContain("  1. [[创作辅助工具电子屏幕-Layout和布局]]");
    expect(destination).toContain("     - [ ] 调整 FPC 端子间距 ^daily_late_child");
    expect(destination).toContain("     - 留螺丝孔");
  });

  it("merges exact category children and remaps a conflicting nonduplicate child id", async () => {
    const storage = new MemoryDailyStorage();
    storage.files.set("Daily/2026-07-21.md", [
      "# 2026-07-21",
      "## 今日计划",
      "- [ ] 项目 ^daily_category_older",
      "  - [ ] 相同子任务 ^daily_reused_child",
      "  - [ ] 旧来源独有 ^daily_unique_child"
    ].join("\n"));
    storage.files.set("Daily/2026-07-22.md", [
      "# 2026-07-22",
      "## 今日计划",
      "- [ ] 项目 ^daily_category_recent",
      "  - [ ] 相同子任务 ^daily_reused_child",
      "  - [ ] 新来源不同内容 ^daily_unique_child"
    ].join("\n"));
    const service = new DailyPlanService(storage);
    const older = (await service.list("2026-07-21"))[0];
    const recent = (await service.list("2026-07-22"))[0];
    const destination = (await service.createMigrationSubtreeWithResult(
      older.id,
      older.revision,
      older.date,
      {
        id: "daily_category_today",
        date: "2026-07-23",
        text: "项目",
        category: "项目"
      },
      undefined,
      { placement: "prepend", mergeExactChildren: true }
    )).item;

    const merged = await service.mergeMigrationSubtreeChildren(
      recent.id,
      recent.revision,
      recent.date,
      destination.id,
      destination.revision,
      destination.date,
      { mergeExactChildren: true }
    );
    const markdown = storage.files.get("Daily/2026-07-23.md") ?? "";

    expect((markdown.match(/相同子任务/gu) ?? [])).toHaveLength(1);
    expect(markdown).toContain("旧来源独有 ^daily_unique_child");
    expect(markdown).toContain("新来源不同内容 ^daily_");
    expect((markdown.match(/\^daily_unique_child(?=\s|$)/gmu) ?? [])).toHaveLength(1);
    expect(merged.structuralChildren).toHaveLength(3);
  });

  it("writes the deterministic summary idempotently without disturbing ToDo", async () => {
    const storage = new MemoryDailyStorage();
    const service = new DailyPlanService(storage, {
      createId: () => "daily_summary1",
      now: () => new Date("2026-07-23T08:00:00")
    });
    const item = await service.create({ text: "写一段" });
    const summary = buildDailySummary("2026-07-23", [item], {
      date: "2026-07-23",
      positiveWritingUnits: 120,
      netWritingUnits: 100,
      notesCreated: 1,
      notesModified: 1,
      tasksCompleted: 0,
      questionsResolved: 0,
      capturesCommitted: 0,
      cardsSelected: 0,
      cardsDisplayed: 0,
      trackingComplete: true
    }, new Date("2026-07-23T20:00:00"));

    expect(await service.writeSummary(summary)).toEqual({ path: "Daily/2026-07-23.md", changed: true });
    expect(await service.writeSummary(summary)).toEqual({ path: "Daily/2026-07-23.md", changed: false });
    expect(storage.files.get(item.sourcePath)).toContain("^daily_summary1");
    expect(storage.files.get(item.sourcePath)).toContain("## 今日总结");
  });
});

class MemoryDailyStorage implements DailyPlanStorage {
  readonly files = new Map<string, string>();

  async readText(path: string): Promise<string | undefined> {
    return this.files.get(path);
  }

  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
}
