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
    expect(markdown).toContain("## 2026-07-23\n\n### 今日计划");
    expect(markdown).toContain("## 2026-07-24\n\n### 今日计划");
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

  it("starts exactly one task atomically and records the current start time", async () => {
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
      status: "in-progress",
      startedAt: "2026-07-23T01:15:00.000Z"
    });
    const items = await service.list();
    expect(items.map((item) => item.status)).toEqual(["todo", "in-progress"]);
    expect(storage.files.get(target.sourcePath)?.match(/- \[\/\]/gu)).toHaveLength(1);

    const idempotent = await service.start(started.id, started.revision);
    expect(idempotent.revision.value).toBe(started.revision.value);
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
