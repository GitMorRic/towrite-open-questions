import { describe, expect, it } from "vitest";
import { DailyPlanConflictError, DailyPlanService, type DailyPlanStorage } from "./plan-service";
import { buildDailySummary } from "./summary";

describe("DailyPlanService", () => {
  it("creates a Tasks-compatible daily item with a stable block id", async () => {
    const storage = new MemoryDailyStorage();
    const service = new DailyPlanService(storage, {
      createId: () => "daily_test123",
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });

    const item = await service.create({
      text: "补充 [[关于创作]]",
      kind: "edit_note",
      devicePolicy: "scheduled",
      scheduledFor: "2026-07-23T09:30",
      tags: ["writing"]
    });

    expect(item).toMatchObject({
      id: "daily_test123",
      date: "2026-07-23",
      text: "补充 [[关于创作]]",
      kind: "edit_note",
      devicePolicy: "scheduled",
      scheduledFor: "2026-07-23T09:30",
      linkedNotes: ["关于创作"],
      status: "todo"
    });
    expect(storage.files.get("Daily/2026-07-23.md")).toContain(
      "- [ ] 补充 [[关于创作]] ⏳ 2026-07-23 📅 2026-07-23"
    );
    expect(storage.files.get("Daily/2026-07-23.md")).toContain("^daily_test123");
    expect(await service.create({
      id: "daily_test123",
      text: "补充 [[关于创作]]",
      kind: "edit_note",
      devicePolicy: "scheduled",
      scheduledFor: "2026-07-23T09:30",
      tags: ["writing"]
    })).toMatchObject({ id: item.id });
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
    expect(completed).toMatchObject({ status: "done", completionDate: "2026-07-23" });
    expect(completed.rawLine).toContain("- [x]");
    expect(completed.rawLine).toContain("✅ 2026-07-23");
    expect(completedEdited).toMatchObject({ status: "done", completionDate: "2026-07-23", devicePolicy: "manual" });
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
    expect(completed).toMatchObject({ status: "done", priority: "highest", line: 5, endLine: 5 });
    expect(written).toContain("- [x] 补充 [[关于创作]] 🔺");
    expect(written).not.toContain("\n  [towrite-kind:: edit_note]");
    expect(written).not.toContain("\n  ^daily_multiline1");
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
    expect(storage.files.get(normal.sourcePath)).toContain("Medium 🔼");
  });

  it("completes the frozen source-day task after the local calendar crosses midnight", async () => {
    const storage = new MemoryDailyStorage();
    let now = new Date("2026-07-23T23:59:00+08:00");
    const service = new DailyPlanService(storage, {
      createId: () => "daily_crossmidnight",
      now: () => now
    });
    const item = await service.create({ text: "睡前仍显示在墨水屏上的任务" });

    now = new Date("2026-07-24T00:01:00+08:00");
    expect(await service.get(item.id)).toBeUndefined();
    const completed = await service.complete(item.id, item.revision, item.date);

    expect(completed).toMatchObject({
      id: item.id,
      date: "2026-07-23",
      status: "done",
      completionDate: "2026-07-24"
    });
    expect(storage.files.get("Daily/2026-07-23.md")).toContain("✅ 2026-07-24");
    expect(storage.files.has("Daily/2026-07-24.md")).toBe(false);
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
