import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DailyPlanNormalizationService,
  isDisplayableDailyDraftTask
} from "./normalization-service";
import { DailyPlanService, type DailyPlanStorage } from "./plan-service";

describe("zero-disturbance Daily editing", () => {
  it("keeps preview and refresh read-only while the author continues a numbered child list", async () => {
    const path = "Daily/2026-08-11.md";
    const original = "## ToDo\n\n- [ ] 其他\n  1. \n";
    const storage = new MemoryStorage(path, original);
    const service = new DailyPlanNormalizationService(storage, {
      source: { kind: "daily-note", dailyRoot: "Daily", dateFormat: "YYYY-MM-DD" }
    });

    const preview = await service.preview("2026-08-11");
    expect(preview.edits.some((edit) => edit.kind === "missing-block-id")).toBe(false);
    expect(storage.files.get(path)).toBe(original);
    expect(storage.writes).toBe(0);
  });

  it("projects numbered children of a checkbox category without writing to the Daily note", async () => {
    const path = "Daily/2026-08-12.md";
    const original = [
      "# 2026-08-12",
      "",
      "## 今日计划",
      "- [ ] 项目",
      "  1. 你",
      "  2. s",
      "  3. d",
      "  4. [[第三十三周]]",
      "",
      "## ToDo"
    ].join("\n");
    const storage = new MemoryStorage(path, original);
    const service = new DailyPlanNormalizationService(storage, {
      source: { kind: "daily-note", dailyRoot: "Daily", dateFormat: "YYYY-MM-DD" },
      planHeading: "今日计划",
      todoHeading: "ToDo"
    });

    const preview = await service.preview("2026-08-12");
    const displayable = preview.edits.filter((edit) => isDisplayableDailyDraftTask(
      edit,
      preview.tasks.find((task) => task.line === edit.line)
    ));

    expect(preview.groups.map((group) => group.text)).toEqual(["项目"]);
    expect(displayable.map((edit) => edit.taskText)).toEqual(["项目", "你", "s", "d", "[[第三十三周]]"]);
    expect(displayable.map((edit) => edit.kind)).toEqual([
      "missing-block-id",
      "plain-leaf",
      "plain-leaf",
      "plain-leaf",
      "plain-leaf"
    ]);
    expect(storage.files.get(path)).toBe(original);
    expect(storage.writes).toBe(0);
  });

  it("recognizes a free-form Daily checkbox and its numbered linked child without requiring a ToDo heading", async () => {
    const path = "sync/Todo_and_tosolve/20260812.md";
    const original = [
      "# 2026-08-12",
      "",
      "- [ ] 创作",
      "  1. [[小说-请确认你是本人]]"
    ].join("\n");
    const storage = new MemoryStorage(path, original);
    const service = new DailyPlanNormalizationService(storage, {
      source: { kind: "daily-note", dailyRoot: "sync/Todo_and_tosolve", dateFormat: "YYYYMMDD" }
    });

    const preview = await service.preview("2026-08-12");
    const displayable = preview.edits.filter((edit) => isDisplayableDailyDraftTask(
      edit,
      preview.tasks.find((task) => task.line === edit.line)
    ));

    expect(preview.groups.map((group) => group.text)).toEqual(["创作"]);
    expect(displayable.map((edit) => edit.taskText)).toEqual(["创作", "[[小说-请确认你是本人]]"]);
    expect(storage.files.get(path)).toBe(original);
    expect(storage.writes).toBe(0);
  });

  it("adds an explicitly created task to the author's populated plan section without adding ToDo", async () => {
    const path = "Daily/2026-08-12.md";
    const original = [
      "# 2026-08-12",
      "",
      "## 今日计划",
      "- [ ] 项目",
      "  1. 你"
    ].join("\n");
    const storage = new MemoryStorage(path, original);
    const service = new DailyPlanService(storage, {
      source: { kind: "daily-note", dailyRoot: "Daily", dateFormat: "YYYY-MM-DD" },
      planHeading: "今日计划",
      todoHeading: "ToDo",
      createId: () => "daily_explicit000000000000000000000001"
    });

    await service.create({ text: "明确确认的新任务", date: "2026-08-12" });
    const written = storage.files.get(path) ?? "";

    expect(written).toContain("明确确认的新任务");
    expect(written).not.toContain("## ToDo");
    expect(written).toContain("  1. 你");
  });

  it("adds created and migrated tasks to a free-form checklist without adding ToDo", async () => {
    const path = "sync/Todo_and_tosolve/20260813.md";
    const original = [
      "# 2026-08-13",
      "",
      "- [ ] 项目",
      "  1. [[obsidian-待办清单]]",
      "- [ ] 创作",
      "  1. [[小说-请确认你是本人]]",
      "",
      "## 随记",
      "今天的正文"
    ].join("\n");
    const storage = new MemoryStorage(path, original);
    const service = new DailyPlanService(storage, {
      source: {
        kind: "daily-note",
        dailyRoot: "sync/Todo_and_tosolve",
        dateFormat: "YYYYMMDD"
      },
      planHeading: "今日计划",
      todoHeading: "ToDo",
      createId: () => "daily_11111111111111111111111111111111"
    });

    await service.create({ text: "新建的任务", date: "2026-08-13" });
    await service.create({
      id: "daily_22222222222222222222222222222222",
      text: "迁入的任务",
      date: "2026-08-13"
    });
    const written = storage.files.get(path) ?? "";
    const hierarchy = await service.readHierarchy("2026-08-13");

    expect(written).not.toContain("## ToDo");
    expect(written.indexOf("新建的任务")).toBeLessThan(written.indexOf("## 随记"));
    expect(written.indexOf("迁入的任务")).toBeLessThan(written.indexOf("## 随记"));
    expect(hierarchy.tasks.map((task) => task.text)).toEqual([
      "项目",
      "[[obsidian-待办清单]]",
      "创作",
      "[[小说-请确认你是本人]]",
      "新建的任务",
      "迁入的任务"
    ]);
  });

  it("can prepend migrated work to the planning surface without crossing the date heading", async () => {
    const path = "sync/Todo_and_tosolve/20260814.md";
    const original = [
      "---",
      "created: 2026-08-14",
      "---",
      "# 2026-08-14",
      "",
      "- [ ] 今天原有任务 ^daily_existing0000000000000000000000",
      "",
      "## 随记",
      "正文"
    ].join("\n");
    const storage = new MemoryStorage(path, original);
    const service = new DailyPlanService(storage, {
      source: {
        kind: "daily-note",
        dailyRoot: "sync/Todo_and_tosolve",
        dateFormat: "YYYYMMDD"
      }
    });

    await service.createWithResult({
      id: "daily_carried00000000000000000000000",
      text: "迁入并置顶",
      date: "2026-08-14"
    }, undefined, { placement: "prepend" });

    const written = storage.files.get(path) ?? "";
    expect(written.indexOf("created: 2026-08-14")).toBeLessThan(written.indexOf("迁入并置顶"));
    expect(written.indexOf("# 2026-08-14")).toBeLessThan(written.indexOf("迁入并置顶"));
    expect(written.indexOf("迁入并置顶")).toBeLessThan(written.indexOf("今天原有任务"));
    expect(written.indexOf("迁入并置顶")).toBeLessThan(written.indexOf("## 随记"));
  });

  it("prepends into an empty trailing ToDo section whose blank lines are trimmed before insertion", async () => {
    const path = "Daily/2026-08-14.md";
    const original = [
      "# 2026-08-14",
      "",
      "## ToDo",
      "",
      "",
      ""
    ].join("\n");
    const storage = new MemoryStorage(path, original);
    const service = new DailyPlanService(storage, {
      source: { kind: "daily-note", dailyRoot: "Daily", dateFormat: "YYYY-MM-DD" },
      todoHeading: "ToDo"
    });

    await expect(service.createWithResult({
      id: "daily_carried_trailing_blank_lines_000000",
      text: "Carried into empty section",
      date: "2026-08-14"
    }, undefined, { placement: "prepend" })).resolves.toMatchObject({ created: true });

    const written = storage.files.get(path) ?? "";
    expect(written.indexOf("## ToDo")).toBeLessThan(written.indexOf("Carried into empty section"));
    expect((await service.list("2026-08-14")).map((item) => item.text))
      .toContain("Carried into empty section");
  });

  it("writes into an empty explicit ToDo instead of beside an isolated journal checkbox", async () => {
    const path = "Daily/2026-08-13.md";
    const original = [
      "# 2026-08-13",
      "",
      "## Journal",
      "- [ ] Personal reminder ^daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "",
      "## ToDo"
    ].join("\n");
    const storage = new MemoryStorage(path, original);
    const service = new DailyPlanService(storage, {
      source: { kind: "daily-note", dailyRoot: "Daily", dateFormat: "YYYY-MM-DD" },
      todoHeading: "ToDo",
      createId: () => "daily_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    });

    await service.create({ text: "Managed task", date: "2026-08-13" });
    const written = storage.files.get(path) ?? "";

    expect(written.indexOf("Managed task")).toBeGreaterThan(written.indexOf("## ToDo"));
    expect((await service.list("2026-08-13")).map((item) => item.text)).toEqual(["Managed task"]);
  });

  it("does not call the normalizer from dashboard or Vault refresh paths", () => {
    const source = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
    expect(source).not.toContain("normalizeMissingDailyCheckboxIds");
    const refreshStart = source.indexOf("async refreshDailyDashboard");
    const refresh = source.slice(
      refreshStart,
      source.indexOf("\n  private ", refreshStart)
    );
    expect(refresh).not.toContain("normalizeTask(");
    expect(refresh).not.toContain("normalizePlan(");
    expect(source).toContain("isDisplayableDailyDraftTask(edit, task)");
    expect(source).toContain("this.findDailyItem(id, date) ?? this.projectedDailyDraftItem(id, date)");
    expect(source).toContain("if (item.provisional) return this.dailyTimingSnapshotForItem(item)");
    expect(source).toContain('if (!item && id.startsWith("draft_"))');
    expect(source).not.toContain("${preview.expectedRevision}|${edit.before}");
  });

  it("renders timing from one dashboard snapshot and tolerates a deleted draft", () => {
    const dashboard = readFileSync(new URL("../ui/DailyDashboardPanel.svelte", import.meta.url), "utf8");
    const focus = readFileSync(new URL("../ui/TodayFloatingView.svelte", import.meta.url), "utf8");

    expect(dashboard).toContain("!item.timing && !item.provisional");
    expect(dashboard).toContain("await dailyApi!.getItemTiming!");
    expect(focus).toContain("item.timing ?? dailyApi.getItemTiming");
  });

  it("renders editor actions as hover overlays instead of layout rows", () => {
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    expect(styles).toContain(".towrite-daily-line-controls");
    expect(styles).toContain("position: absolute");
    expect(styles).toContain("opacity: 0");
  });
});

class MemoryStorage implements DailyPlanStorage {
  readonly files = new Map<string, string>();
  writes = 0;

  constructor(path: string, content: string) {
    this.files.set(path, content);
  }

  async readText(path: string): Promise<string | undefined> {
    return this.files.get(path);
  }

  async writeText(path: string, content: string): Promise<void> {
    this.writes += 1;
    this.files.set(path, content);
  }
}
