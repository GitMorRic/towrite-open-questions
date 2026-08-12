import { describe, expect, it } from "vitest";
import {
  DAILY_SUMMARY_END_MARKER,
  DAILY_SUMMARY_START_MARKER,
  DailyPlanConflictError,
  DailyPlanService,
  parseDailyPlanDocumentWithDiagnostics,
  type DailyPlanStorage
} from "./plan-service";

describe("DailyPlanService v2", () => {
  it("uses the Daily Notes date format supplied by Obsidian", () => {
    const service = new DailyPlanService(new MemoryDailyStorage(), {
      source: { kind: "daily-note", dailyRoot: "sync/Todo_and_tosolve", dateFormat: "YYYYMMDD" }
    });
    expect(service.pathForDate("2026-08-05")).toBe("sync/Todo_and_tosolve/20260805.md");
  });

  it("does not create an empty Markdown scaffold when clearing an absent theme", async () => {
    const storage = new MemoryDailyStorage();
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-27T08:00:00+08:00")
    });

    const document = await service.updateMetadata(
      { theme: null },
      undefined,
      "2026-07-27"
    );

    expect(document.items).toEqual([]);
    expect(storage.files.has("Daily/2026-07-27.md")).toBe(false);
  });

  it("supports a fixed planning document with isolated date sections", async () => {
    const storage = new MemoryDailyStorage();
    const service = new DailyPlanService(storage, {
      source: { kind: "fixed-document", path: "Planning/Daily Plans.md" },
      createId: sequence("daily_today01", "daily_tomorrow01"),
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });

    await service.create({ text: "Today", date: "2026-07-23" });
    await service.create({ text: "Tomorrow", date: "2026-07-24" });
    await service.updateMetadata({ theme: "Ship Echo" }, undefined, "2026-07-24");

    expect(service.pathForDate("2026-07-23")).toBe("Planning/Daily Plans.md");
    expect((await service.read("2026-07-23")).items.map((item) => item.text)).toEqual(["Today"]);
    expect(await service.read("2026-07-24")).toMatchObject({
      metadata: { theme: "Ship Echo" },
      items: [{ text: "Tomorrow" }]
    });
    const markdown = storage.files.get("Planning/Daily Plans.md")!;
    expect(markdown).toContain("## 2026-07-23\n\n### ToDo");
    expect(markdown).toContain("## 2026-07-24");
    expect(markdown).toContain("### 今日计划");
    expect(markdown).toContain("[towrite-theme:: Ship Echo]");
  });

  it("diagnoses a block id reused across fixed-document date sections and refuses writes", async () => {
    const path = "Planning/Daily Plans.md";
    const markdown = [
      "## 2026-07-23",
      "",
      "### ToDo",
      "",
      "- [ ] Today ^daily_crossdate",
      "",
      "## 2026-07-24",
      "",
      "### ToDo",
      "",
      "- [ ] Tomorrow ^daily_crossdate"
    ].join("\n");
    const storage = new MemoryDailyStorage();
    storage.files.set(path, markdown);
    const service = new DailyPlanService(storage, {
      source: { kind: "fixed-document", path },
      createId: () => "daily_safe_new",
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });

    const today = await service.read("2026-07-23");
    const tomorrow = await service.read("2026-07-24");
    expect(today.diagnostics.filter((entry) => entry.code === "duplicate-block-id")).toHaveLength(2);
    expect(tomorrow.diagnostics.filter((entry) => entry.code === "duplicate-block-id")).toHaveLength(2);
    await expect(service.create({ date: "2026-07-23", text: "Must not write" }))
      .rejects.toMatchObject({ code: "invalid-document" });
    expect(storage.files.get(path)).toBe(markdown);
  });

  it("includes the date in fixed-document task revisions", () => {
    const markdown = [
      "## 2026-07-23",
      "### ToDo",
      "- [ ] Same text ^daily_date_revision",
      "## 2026-07-24",
      "### ToDo",
      "- [ ] Same text ^daily_date_revision"
    ].join("\n");
    const source = { kind: "fixed-document", path: "Planning/Daily Plans.md" } as const;
    const first = parseDailyPlanDocumentWithDiagnostics(
      markdown,
      source.path,
      "2026-07-23",
      "ToDo",
      { source }
    ).items[0];
    const second = parseDailyPlanDocumentWithDiagnostics(
      markdown,
      source.path,
      "2026-07-24",
      "ToDo",
      { source }
    ).items[0];

    expect(first.revision.value).not.toBe(second.revision.value);
  });

  it.each([
    { kind: "fixed-document" as const, path: "C:/Planning/Daily Plans.md" },
    { kind: "fixed-document" as const, path: "../Planning/Daily Plans.md" },
    { kind: "fixed-document" as const, path: "Planning/CON.md" },
    { kind: "fixed-document" as const, path: "Planning/Bad\u0001Name.md" }
  ])("rejects unsafe fixed planning paths: $path", (source) => {
    expect(() => new DailyPlanService(new MemoryDailyStorage(), { source })).toThrow(/path is invalid/iu);
  });

  it("parses v2 task metadata and preserves unknown indented content when updating", async () => {
    const storage = new MemoryDailyStorage();
    storage.files.set("Daily/2026-07-23.md", [
      "# 2026-07-23",
      "",
      "## 今日计划",
      "",
      "[towrite-theme:: 推进 Echo MVP]",
      "",
      "## ToDo",
      "",
      "- [ ] 写出 [[Echo MVP]] 实验方案 🔺 ⏳ 2026-07-23 📅 2026-07-23",
      "  [towrite-kind:: edit_note] [towrite-device:: rotation]",
      "  [towrite-primary:: true] [towrite-minimum:: true]",
      "  [towrite-goal:: 验证常驻屏幕] [towrite-next:: 列出指标]",
      "  [towrite-estimate:: 15m]",
      "  [towrite-target:: [[Echo MVP]]]",
      "  用户写的说明不能丢",
      "  - 嵌套资料",
      "    - [ ] 子清单也不能丢",
      "  ^daily_metadata01"
    ].join("\n"));
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });

    const document = await service.read();
    expect(document).toMatchObject({
      schemaVersion: 2,
      metadata: {
        theme: "推进 Echo MVP",
        primaryId: "daily_metadata01",
        minimumId: "daily_metadata01"
      }
    });
    const item = document.items[0];
    expect(item).toMatchObject({
      primary: true,
      minimum: true,
      goal: "验证常驻屏幕",
      nextStep: "列出指标",
      estimateMinutes: 15,
      target: "[[Echo MVP]]",
      linkedNotes: ["Echo MVP"]
    });

    const updated = await service.update(item.id, item.revision, {
      nextStep: "写出成功阈值",
      estimateMinutes: 20
    });
    expect(updated).toMatchObject({ nextStep: "写出成功阈值", estimateMinutes: 20 });
    const written = storage.files.get(item.sourcePath)!;
    expect(written).toContain("用户写的说明不能丢");
    expect(written).toContain("  - 嵌套资料\n    - [ ] 子清单也不能丢");
    expect(written).toContain("[towrite-next:: 写出成功阈值]");
    expect(written).toContain("[towrite-estimate:: 20m]");
  });

  it("collects note links from indented Daily task content", async () => {
    const storage = new MemoryDailyStorage();
    storage.files.set("Daily/2026-07-23.md", [
      "## ToDo",
      "",
      "- [ ] Project",
      "  1. [[Project overview]]",
      "  2. [[Obsidian task list]]",
      "  ^daily_linkednotes01"
    ].join("\n"));
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });

    expect((await service.read()).items[0]?.linkedNotes).toEqual([
      "Project overview",
      "Obsidian task list"
    ]);
  });

  it("reports missing, multiple, and duplicate block ids and refuses mutation", async () => {
    const markdown = [
      "# 2026-07-23",
      "## ToDo",
      "- [ ] Missing",
      "- [ ] Multiple ^daily_multi01",
      "  ^daily_multi02",
      "- [ ] Duplicate ^daily_same01",
      "- [ ] Duplicate again ^daily_same01"
    ].join("\n");
    const parsed = parseDailyPlanDocumentWithDiagnostics(
      markdown,
      "Daily/2026-07-23.md",
      "2026-07-23"
    );
    expect(parsed.diagnostics.map((entry) => entry.code)).toEqual([
      "missing-block-id",
      "multiple-block-ids",
      "duplicate-block-id",
      "duplicate-block-id"
    ]);

    const storage = new MemoryDailyStorage();
    storage.files.set("Daily/2026-07-23.md", markdown);
    const service = new DailyPlanService(storage, {
      createId: () => "daily_newitem01",
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });
    await expect(service.create({ text: "Must not write" }))
      .rejects.toMatchObject({ code: "invalid-document" });
    expect(storage.files.get("Daily/2026-07-23.md")).toBe(markdown);
  });

  it("lets a stable task change state while a sibling checkbox is still awaiting an id", async () => {
    const path = "Daily/2026-07-23.md";
    const storage = new MemoryDailyStorage();
    storage.files.set(path, [
      "# 2026-07-23",
      "## ToDo",
      "- [ ] Ready task ^daily_ready01",
      "- [ ] Newly typed task"
    ].join("\n"));
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });

    const ready = await service.get("daily_ready01", "2026-07-23");
    expect(ready).toBeDefined();
    await service.start("daily_ready01", ready!.revision, "2026-07-23");

    expect(storage.files.get(path)).toContain("- [/] Ready task");
    expect(storage.files.get(path)).toContain("^daily_ready01");
    expect(storage.files.get(path)).toContain("- [ ] Newly typed task");
  });

  it("does not mistake or remove a nested child task block id", async () => {
    const markdown = [
      "# 2026-07-23",
      "## ToDo",
      "- [ ] Parent task",
      "  - [ ] Nested child",
      "    ^daily_child001",
      "  ^daily_parent01"
    ].join("\n");
    const parsed = parseDailyPlanDocumentWithDiagnostics(
      markdown,
      "Daily/2026-07-23.md",
      "2026-07-23"
    );

    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      id: "daily_parent01",
      endLine: 6
    });
    expect(parsed.items[0].rawBlock).toContain("^daily_child001");

    const storage = new MemoryDailyStorage();
    storage.files.set("Daily/2026-07-23.md", markdown);
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });
    await service.update(parsed.items[0].id, parsed.items[0].revision, { goal: "Keep nesting" });
    expect(storage.files.get("Daily/2026-07-23.md")).toContain("^daily_child001");
  });

  it("starts exactly one task atomically without writing runtime timing into Markdown", async () => {
    const storage = new MemoryDailyStorage();
    storage.files.set("Daily/2026-07-23.md", [
      "# 2026-07-23",
      "## ToDo",
      "- [/] Old current 📅 2026-07-23 [towrite-kind:: task] ^daily_current01",
      "- [ ] Start me 📅 2026-07-23 [towrite-kind:: task] ^daily_current02"
    ].join("\n"));
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-23T09:15:00+08:00")
    });
    const target = (await service.list())[1];

    const started = await service.start(target.id, target.revision);
    expect(started).toMatchObject({
      status: "in-progress"
    });
    expect(started.startedAt).toBeUndefined();
    const items = await service.list();
    expect(items.map((item) => item.status)).toEqual(["todo", "in-progress"]);
    const written = storage.files.get(target.sourcePath)!;
    expect(written.match(/- \[\/\]/gu)).toHaveLength(1);
    expect(written).not.toContain("[towrite-started::");

    const idempotent = await service.start(started.id, started.revision);
    expect(idempotent.revision.value).toBe(started.revision.value);
  });

  it("reads and preserves a legacy started field without creating or changing it", async () => {
    const path = "Daily/2026-07-23.md";
    const legacyStarted = "2026-07-22T23:15:00.000Z";
    const markdown = [
      "# 2026-07-23",
      "## ToDo",
      "- [ ] Legacy timing",
      `  [towrite-started:: ${legacyStarted}]`,
      "  User note that ToWrite does not own",
      "  ^daily_legacy_started"
    ].join("\n");
    const storage = new MemoryDailyStorage();
    storage.files.set(path, markdown);
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-23T09:15:00+08:00")
    });
    const target = (await service.list("2026-07-23"))[0];

    expect(target.startedAt).toBe(legacyStarted);
    const started = await service.start(target.id, target.revision, target.date);
    const updated = await service.update(started.id, started.revision, {
      startedAt: "2026-07-23T01:15:00.000Z"
    }, started.date);

    const written = storage.files.get(path)!;
    expect(updated.startedAt).toBe(legacyStarted);
    expect(written).toContain(`[towrite-started:: ${legacyStarted}]`);
    expect(written).toContain("User note that ToWrite does not own");
    expect(written).not.toContain("2026-07-23T01:15:00.000Z");
  });

  it("keeps primary and minimum selections unique through plugin updates", async () => {
    const storage = new MemoryDailyStorage();
    const service = new DailyPlanService(storage, {
      createId: sequence("daily_unique001", "daily_unique002"),
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });
    await service.create({ text: "First", primary: true, minimum: true });
    const second = await service.create({ text: "Second" });

    await service.update(second.id, second.revision, { primary: true, minimum: true });
    const document = await service.read();
    expect(document.metadata).toMatchObject({
      primaryId: "daily_unique002",
      minimumId: "daily_unique002"
    });
    expect(document.items.map((item) => [item.primary, item.minimum])).toEqual([
      [false, false],
      [true, true]
    ]);
    expect(document.diagnostics).toEqual([]);
  });

  it("moves complete logical blocks while preserving their unknown content", async () => {
    const storage = new MemoryDailyStorage();
    storage.files.set("Daily/2026-07-23.md", [
      "# 2026-07-23",
      "## ToDo",
      "- [ ] First ^daily_move001",
      "  first note",
      "- [ ] Second ^daily_move002",
      "  second note"
    ].join("\n"));
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-23T08:00:00+08:00")
    });
    const second = (await service.list())[1];

    const moved = await service.move(second.id, second.revision, "up");
    expect(moved.line).toBe(3);
    expect((await service.list()).map((item) => item.text)).toEqual(["Second", "First"]);
    const written = storage.files.get(second.sourcePath)!;
    expect(written.indexOf("Second")).toBeLessThan(written.indexOf("First"));
    expect(written.indexOf("second note")).toBeLessThan(written.indexOf("First"));
  });

  it("persists the complete Dashboard edit lifecycle back to Markdown with CAS protection", async () => {
    const path = "Daily/2026-07-23.md";
    const storage = new MemoryDailyStorage();
    storage.files.set(path, [
      "# 2026-07-23",
      "",
      "## ToDo",
      "",
      "- [/] Existing current task",
      "  This hand-written context must survive every Dashboard operation.",
      "  [custom-field:: keep-me]",
      "  ^daily_existing_dashboard",
      "",
      "## Notes",
      "",
      "A hand-written note outside the task list must also survive."
    ].join("\n"));
    const options = {
      createId: () => "daily_dashboard_contract",
      now: () => new Date("2026-07-23T08:00:00+08:00")
    };
    const service = new DailyPlanService(storage, options);
    const reread = async () => (
      new DailyPlanService(storage, options).read("2026-07-23")
    );
    const expectHandWrittenContent = (): void => {
      const markdown = storage.files.get(path)!;
      expect(markdown).toContain("This hand-written context must survive every Dashboard operation.");
      expect(markdown).toContain("[custom-field:: keep-me]");
      expect(markdown).toContain("A hand-written note outside the task list must also survive.");
    };

    const created = await service.create({
      date: "2026-07-23",
      text: "Draft the launch note",
      category: "Writing and publishing",
      goal: "Make the note ready for review",
      nextStep: "Outline the three main sections",
      target: "[[Launch Plan]]",
      dueDate: "2026-07-30",
      priority: "high",
      tags: ["launch", "writing"]
    });
    const staleCreateRevision = created.revision;
    let persisted = await reread();
    expect(persisted.items.find((item) => item.id === created.id)).toMatchObject({
      text: "Draft the launch note",
      category: "Writing and publishing",
      goal: "Make the note ready for review",
      nextStep: "Outline the three main sections",
      target: "[[Launch Plan]]",
      dueDate: "2026-07-30",
      dueDateExplicit: true,
      priority: "high",
      tags: ["launch", "writing"]
    });
    expect(storage.files.get(path)).toContain("[towrite-category:: Writing and publishing]");
    expect(storage.files.get(path)).toContain("[towrite-goal:: Make the note ready for review]");
    expect(storage.files.get(path)).toContain("[towrite-next:: Outline the three main sections]");
    expect(storage.files.get(path)).toContain("[towrite-target:: [[Launch Plan]]]");
    expect(storage.files.get(path)).toContain("[towrite-due:: 2026-07-30]");
    expect(storage.files.get(path)).toContain("#launch #writing");
    expectHandWrittenContent();

    const updated = await service.update(created.id, created.revision, {
      text: "Revise the launch note",
      category: "Project",
      goal: "Approve the final outline",
      nextStep: "Review the opening paragraph",
      target: "[[Launch Review]]",
      dueDate: "2026-07-31",
      priority: "highest",
      tags: ["launch", "review"]
    }, "2026-07-23");
    persisted = await reread();
    expect(persisted.items.find((item) => item.id === created.id)).toMatchObject({
      text: "Revise the launch note",
      category: "Project",
      goal: "Approve the final outline",
      nextStep: "Review the opening paragraph",
      target: "[[Launch Review]]",
      dueDate: "2026-07-31",
      priority: "highest",
      tags: ["launch", "review"]
    });
    expect(storage.files.get(path)).not.toContain("[[Launch Plan]]");
    expect(storage.files.get(path)).not.toContain("#writing");
    expectHandWrittenContent();

    const markdownBeforeStaleWrite = storage.files.get(path);
    await expect(service.update(created.id, staleCreateRevision, {
      text: "A stale Dashboard must not overwrite the note"
    }, "2026-07-23")).rejects.toMatchObject({ code: "revision-changed" });
    expect(storage.files.get(path)).toBe(markdownBeforeStaleWrite);

    const moved = await service.move(updated.id, updated.revision, "up", "2026-07-23");
    persisted = await reread();
    expect(persisted.items.map((item) => item.id)).toEqual([
      "daily_dashboard_contract",
      "daily_existing_dashboard"
    ]);
    expect(moved.line).toBeLessThan(
      persisted.items.find((item) => item.id === "daily_existing_dashboard")!.line
    );
    expectHandWrittenContent();

    const started = await service.start(moved.id, moved.revision, "2026-07-23");
    persisted = await reread();
    expect(persisted.items.map((item) => [item.id, item.status])).toEqual([
      ["daily_dashboard_contract", "in-progress"],
      ["daily_existing_dashboard", "todo"]
    ]);
    expect(storage.files.get(path)!.match(/- \[\/\]/gu)).toHaveLength(1);
    expectHandWrittenContent();

    const completed = await service.complete(started.id, started.revision, "2026-07-23");
    persisted = await reread();
    expect(persisted.items.find((item) => item.id === completed.id)?.status).toBe("done");
    expect(storage.files.get(path)).toContain("- [x] Revise the launch note");
    expectHandWrittenContent();

    await service.reopen(completed.id, completed.revision, "2026-07-23");
    persisted = await reread();
    expect(persisted.items.find((item) => item.id === completed.id)?.status).toBe("todo");
    expect(storage.files.get(path)).toContain("- [ ] Revise the launch note");
    expect(storage.files.get(path)).not.toContain("- [x] Revise the launch note");
    expectHandWrittenContent();
  });

  it("writes only the managed summary marker block and preserves hand-written review", async () => {
    const storage = new MemoryDailyStorage();
    storage.files.set("Daily/2026-07-23.md", [
      "# 2026-07-23",
      "## ToDo",
      "",
      "## 今日总结",
      "",
      "这段手写复盘必须保留。"
    ].join("\n"));
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-23T20:00:00+08:00")
    });
    const summary = {
      date: "2026-07-23",
      markdown: "## 今日总结\n\n规则生成的第一版"
    };

    expect(await service.writeSummary(summary)).toMatchObject({ changed: true });
    let written = storage.files.get("Daily/2026-07-23.md")!;
    expect(written).toContain("这段手写复盘必须保留。");
    expect(written).toContain(`${DAILY_SUMMARY_START_MARKER}\n规则生成的第一版\n${DAILY_SUMMARY_END_MARKER}`);
    expect(await service.writeSummary(summary)).toMatchObject({ changed: false });

    written = written.replace("规则生成的第一版", "旧内容");
    storage.files.set("Daily/2026-07-23.md", written);
    await service.writeSummary({ ...summary, markdown: "## 今日总结\n\n新内容" });
    const replaced = storage.files.get("Daily/2026-07-23.md")!;
    expect(replaced).toContain("这段手写复盘必须保留。");
    expect(replaced).not.toContain("旧内容");
    expect(replaced).toContain("新内容");
  });

  it("refuses malformed summary marker pairs instead of overwriting user text", async () => {
    const storage = new MemoryDailyStorage();
    const original = [
      "# 2026-07-23",
      "## ToDo",
      "## 今日总结",
      DAILY_SUMMARY_START_MARKER,
      "unfinished"
    ].join("\n");
    storage.files.set("Daily/2026-07-23.md", original);
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-23T20:00:00+08:00")
    });

    await expect(service.writeSummary({
      date: "2026-07-23",
      markdown: "## 今日总结\n\nDo not write"
    })).rejects.toBeInstanceOf(DailyPlanConflictError);
    expect(storage.files.get("Daily/2026-07-23.md")).toBe(original);
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

function sequence(...values: string[]): () => string {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1];
}
