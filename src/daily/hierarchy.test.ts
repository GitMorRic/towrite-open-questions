import { describe, expect, it } from "vitest";
import { parseDailyPlanHierarchy } from "./hierarchy";
import {
  createDailyPlanNormalizationPreview,
  DailyPlanNormalizationService,
  shouldAutomaticallyNormalizeDailyEdit
} from "./normalization-service";
import { collectDailyLinkedNoteReferences } from "./linked-note-references";
import { DailyPlanConflictError, DailyPlanService, type DailyPlanStorage } from "./plan-service";
import {
  createDailyLineage,
  parseDailyMarkdownTargets,
  resolveDailyTarget
} from "./target-resolver";
import type { DailyPlanGroup } from "./types";

const DATE = "2026-07-24";
const PATH = `Daily/${DATE}.md`;

describe("daily hierarchy and inherited targets", () => {
  it("supports checkbox categories, numbered note leaves, and nested linked-note tasks together", () => {
    const markdown = [
      `# ${DATE}`,
      "## Plan",
      "- [ ] Projects",
      "  1. [Obsidian tasks](obsidian-tasks.md)",
      "  2. [[Book sprint]]",
      "- [ ] Other",
      "  1. [Exoskeleton](exoskeleton.md)",
      "     - [ ] [[Research notes]] ^daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "## ToDo"
    ].join("\n");
    const hierarchy = parseDailyPlanHierarchy(markdown, PATH, DATE, {
      todoHeading: "ToDo",
      planHeading: "Plan"
    });

    expect(hierarchy.groups.map((group) => group.text)).toEqual([
      "Projects",
      "Other",
      "[Exoskeleton](exoskeleton.md)"
    ]);
    expect(hierarchy.tasks.map((task) => task.text)).toEqual([
      "Projects",
      "[Obsidian tasks](obsidian-tasks.md)",
      "[[Book sprint]]",
      "Other",
      "[[Research notes]]"
    ]);
    expect(hierarchy.tasks.at(-1)?.targetResolution.displayLabel).toBe("Research notes");

    const references = collectDailyLinkedNoteReferences(hierarchy);
    expect(references.map((reference) => reference.target.linkText)).toEqual([
      "Daily/exoskeleton.md",
      "Daily/obsidian-tasks.md",
      "Book sprint",
      "Research notes"
    ]);
    expect(references.find((reference) => reference.target.linkText === "Daily/exoskeleton.md")?.line).toBe(7);
  });

  it("auto-normalizes only pure local note-link leaves and preserves numbered markers", () => {
    const markdown = [
      `# ${DATE}`,
      "## Plan",
      "- [ ] Projects",
      "  1. [Obsidian tasks](obsidian-tasks.md)",
      "  2. Continue [[Book sprint]] tomorrow",
      "## ToDo"
    ].join("\n");
    let nextId = 10;
    const preview = createDailyPlanNormalizationPreview(markdown, PATH, DATE, {
      todoHeading: "ToDo",
      planHeading: "Plan",
      createId: () => `daily_${(nextId++).toString(16).padStart(32, "b")}`
    });
    const pure = preview.edits.find((edit) => edit.line === 4);
    const prose = preview.edits.find((edit) => edit.line === 5);

    expect(pure?.after).toMatch(/^  1\. \[ \] \[Obsidian tasks\]/u);
    expect(pure && shouldAutomaticallyNormalizeDailyEdit(pure, PATH)).toBe(true);
    expect(prose && shouldAutomaticallyNormalizeDailyEdit(prose, PATH)).toBe(false);
  });

  it("falls back to the editable plan heading and treats checkbox containers as groups", () => {
    const markdown = [
      `# ${DATE}`,
      "## 今日计划",
      "- [ ] 项目",
      "  1. [[创作辅助工具电子屏幕硬件-软硬件系统设计]]",
      "  2. [[obsidian-待办清单]]",
      "  3.",
      "- [ ] 待记录和搞懂",
      "  1. [[触屏墨水屏,手写墨水屏,屏幕的大小与方案]]",
      "## ToDo"
    ].join("\n");

    const hierarchy = parseDailyPlanHierarchy(markdown, PATH, DATE, {
      todoHeading: "ToDo",
      planHeading: "今日计划"
    });

    expect(hierarchy.groups.map((group) => group.text)).toEqual(["项目", "待记录和搞懂"]);
    expect(hierarchy.tasks.map((task) => task.text)).toEqual([
      "项目",
      "[[创作辅助工具电子屏幕硬件-软硬件系统设计]]",
      "[[obsidian-待办清单]]",
      "待记录和搞懂",
      "[[触屏墨水屏,手写墨水屏,屏幕的大小与方案]]"
    ]);
    expect(hierarchy.tasks.map((task) => task.lineage.groups.at(-1)?.text))
      .toEqual([undefined, "项目", "项目", undefined, "待记录和搞懂"]);
  });

  it("adopts a free-form Daily Note checklist when no managed heading exists", async () => {
    const markdown = [
      "# 20260810",
      "从模板的演变，可以看到有些东西在发生着",
      "- [ ] 待办",
      "  1. [[一个待办]]",
      "- [ ] 项目",
      "  1. [obsidian-待办清单](obsidian-待办清单.md)",
      "  2. [书客松](书客松.md)",
      "- [ ] 创作",
      "  1. [[请确认你是本人]]",
      "- [ ] 稍后阅读和记录",
      "  1. [[结构丝印]]",
      "  2. [[供应商8D报告]]",
      "  3. [[海外剧本范例]]",
      "  4. [[封样资料要求]]",
      "- [ ] 其他",
      "  1. [膝关节外骨骼设计](膝关节外骨骼设计.md)",
      "  2."
    ].join("\n");
    const sourcePath = "sync/Todo_and_tosolve/20260810.md";
    const hierarchy = parseDailyPlanHierarchy(markdown, sourcePath, "2026-08-10", {
      source: {
        kind: "daily-note",
        dailyRoot: "sync/Todo_and_tosolve",
        dateFormat: "YYYYMMDD"
      }
    });

    expect(hierarchy.groups.map((group) => group.text)).toEqual([
      "待办",
      "项目",
      "创作",
      "稍后阅读和记录",
      "其他"
    ]);
    expect(hierarchy.tasks.map((task) => task.text)).toEqual([
      "待办",
      "[[一个待办]]",
      "项目",
      "[obsidian-待办清单](obsidian-待办清单.md)",
      "[书客松](书客松.md)",
      "创作",
      "[[请确认你是本人]]",
      "稍后阅读和记录",
      "[[结构丝印]]",
      "[[供应商8D报告]]",
      "[[海外剧本范例]]",
      "[[封样资料要求]]",
      "其他",
      "[膝关节外骨骼设计](膝关节外骨骼设计.md)"
    ]);

    const storage = new MemoryStorage();
    storage.files.set(sourcePath, markdown);
    let nextId = 1;
    const options = {
      source: {
        kind: "daily-note" as const,
        dailyRoot: "sync/Todo_and_tosolve",
        dateFormat: "YYYYMMDD"
      },
      createId: () => `daily_${(nextId++).toString(16).padStart(32, "0")}`,
      now: () => new Date("2026-08-10T16:36:00+08:00")
    };
    const normalizer = new DailyPlanNormalizationService(storage, options);
    for (;;) {
      const preview = await normalizer.preview("2026-08-10");
      const edit = preview.edits[0];
      if (!edit) break;
      await normalizer.normalizeTask(preview, edit.line);
    }
    const service = new DailyPlanService(storage, options);
    const items = await service.list("2026-08-10");

    expect(items).toHaveLength(13);
    expect(items.map((item) => item.text)).toEqual(hierarchy.tasks
      .map((task) => task.text)
      .filter((text) => text !== "其他"));
    expect(items.map((item) => item.groupId)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^group_/u)
    ]));
    expect(storage.files.get(sourcePath)).toContain("1. [ ] [[一个待办]] ^daily_");
    expect(storage.files.get(sourcePath)).toContain("- [ ] 待办");
  });

  it("ignores ordinary outlines outside checkbox trees in a free-form Daily Note", () => {
    const markdown = [
      "# 20260810",
      "1. [[XbotPark-肆意创作]]",
      "   - Project",
      "   - 产品",
      "1. [[外骨骼]]",
      "   - 修改模型",
      "   - 积累",
      "2. [[family]]",
      "3. [[Coding Project]]",
      "1. LINUX DO",
      "2. Reddit",
      "- [ ] 项目",
      "  1. [[obsidian-待办清单]]",
      "  2. [[书客松]]",
      "- [ ] 独立待办"
    ].join("\n");

    const hierarchy = parseDailyPlanHierarchy(
      markdown,
      "sync/Todo_and_tosolve/20260810.md",
      "2026-08-10",
      {
        source: {
          kind: "daily-note",
          dailyRoot: "sync/Todo_and_tosolve",
          dateFormat: "YYYYMMDD"
        }
      }
    );

    expect(hierarchy.groups.map((group) => group.text)).toEqual(["项目"]);
    expect(hierarchy.tasks.map((task) => task.text)).toEqual([
      "项目",
      "[[obsidian-待办清单]]",
      "[[书客松]]",
      "独立待办"
    ]);
    expect(hierarchy.tasks.some((task) => task.text.includes("XbotPark"))).toBe(false);
    expect(hierarchy.tasks.some((task) => task.text === "LINUX DO")).toBe(false);
  });

  it("recovers free-form project trees beside a populated canonical ToDo section", async () => {
    const sourcePath = "sync/Todo_and_tosolve/20260813.md";
    const markdown = [
      "# 20260813",
      "1. [[普通索引，不是任务]]",
      "- [ ] 项目 ^daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "  1. [ ] [[obsidian-待办清单]] ^daily_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "- [ ] Standalone legacy task ^daily_abababababababababababababababab",
      "",
      "## 随记",
      "今天的正文",
      "- [ ] 随记里的孤立提醒 ^daily_ffffffffffffffffffffffffffffffff",
      "",
      "## ToDo",
      "- [ ] [[小说-请确认你是本人]] ^daily_cccccccccccccccccccccccccccccccc"
    ].join("\n");
    const options = {
      source: {
        kind: "daily-note" as const,
        dailyRoot: "sync/Todo_and_tosolve",
        dateFormat: "YYYYMMDD"
      }
    };
    const hierarchy = parseDailyPlanHierarchy(markdown, sourcePath, "2026-08-13", options);

    expect(hierarchy.groups.map((group) => group.text)).toEqual(["项目"]);
    expect(hierarchy.tasks.map((task) => task.text)).toEqual([
      "项目",
      "[[obsidian-待办清单]]",
      "Standalone legacy task",
      "[[小说-请确认你是本人]]"
    ]);
    expect(new Set(hierarchy.tasks.map((task) => task.line)).size).toBe(hierarchy.tasks.length);
    expect(hierarchy.tasks.some((task) => task.text.includes("普通索引"))).toBe(false);
    expect(hierarchy.tasks.some((task) => task.text.includes("孤立提醒"))).toBe(false);

    const storage = new MemoryStorage();
    storage.files.set(sourcePath, markdown);
    const items = await new DailyPlanService(storage, options).list("2026-08-13");
    expect(items.map((item) => item.text)).toEqual([
      "项目",
      "[[obsidian-待办清单]]",
      "Standalone legacy task",
      "[[小说-请确认你是本人]]"
    ]);
  });

  it("recognizes a checkbox project tree under a later custom Daily heading", () => {
    const markdown = [
      `# ${DATE}`,
      "## ToDo",
      "- [ ] Canonical task ^daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "",
      "## 随记",
      "这里仍然可以写普通正文。",
      "- [ ] 项目 ^daily_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "  1. [[创作辅助工具电子屏幕-Layout和布局]]",
      "     - 调整 FPC 端子间距",
      "     - 留螺丝孔",
      "- [ ] 同区段独立任务 ^daily_cccccccccccccccccccccccccccccccc"
    ].join("\n");

    const hierarchy = parseDailyPlanHierarchy(markdown, PATH, DATE);

    expect(hierarchy.groups.map((group) => group.text)).toEqual([
      "项目",
      "[[创作辅助工具电子屏幕-Layout和布局]]"
    ]);
    expect(hierarchy.tasks.map((task) => task.text)).toEqual([
      "Canonical task",
      "项目",
      "调整 FPC 端子间距",
      "留螺丝孔",
      "同区段独立任务"
    ]);
    expect(hierarchy.tasks.find((task) => task.text === "调整 FPC 端子间距")?.lineage.groups
      .map((group) => group.text)).toEqual([
        "项目",
        "[[创作辅助工具电子屏幕-Layout和布局]]"
      ]);
  });

  it("opts standalone checkboxes under a custom heading in with one hidden section marker", () => {
    const markdown = [
      `# ${DATE}`,
      "## ToDo",
      "- [ ] Canonical task ^daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "",
      "## 自定义安排",
      "%% [towrite-daily-section:: true] %%",
      "- [ ] 第一项 ^daily_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "- [ ] 第二项 ^daily_cccccccccccccccccccccccccccccccc",
      "",
      "## Journal",
      "- [ ] 不应识别 ^daily_dddddddddddddddddddddddddddddddd"
    ].join("\n");

    const hierarchy = parseDailyPlanHierarchy(markdown, PATH, DATE);

    expect(hierarchy.tasks.map((task) => task.text)).toEqual([
      "Canonical task",
      "第一项",
      "第二项"
    ]);
  });

  it("keeps an explicit canonical ToDo isolated from unrelated checkboxes", () => {
    const markdown = [
      `# ${DATE}`,
      "- [ ] Journal reminder ^daily_dddddddddddddddddddddddddddddddd",
      "1. [[Ordinary reading index]]",
      "",
      "## ToDo",
      "- [ ] Canonical task ^daily_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    ].join("\n");
    const hierarchy = parseDailyPlanHierarchy(markdown, PATH, DATE);

    expect(hierarchy.tasks.map((task) => task.text)).toEqual(["Canonical task"]);
  });

  it("lets an empty explicit ToDo own the plan instead of an isolated journal reminder", () => {
    const markdown = [
      `# ${DATE}`,
      "## Journal",
      "- [ ] Personal reminder ^daily_dddddddddddddddddddddddddddddddd",
      "",
      "## ToDo"
    ].join("\n");
    const hierarchy = parseDailyPlanHierarchy(markdown, PATH, DATE);

    expect(hierarchy.tasks).toEqual([]);
  });

  it("does not infer a Daily plan from a checkbox inside a Journal section", () => {
    const markdown = [
      `# ${DATE}`,
      "## Journal",
      "- [ ] Personal reminder ^daily_dddddddddddddddddddddddddddddddd"
    ].join("\n");
    const hierarchy = parseDailyPlanHierarchy(markdown, PATH, DATE);

    expect(hierarchy.tasks).toEqual([]);
  });

  it("keeps configured plan projects visible after a canonical task is added", () => {
    const markdown = [
      `# ${DATE}`,
      "## 今日计划",
      "- [ ] 项目 ^daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "  1. [ ] [[obsidian-待办清单]] ^daily_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "",
      "## ToDo",
      "- [ ] 迁入任务 ^daily_cccccccccccccccccccccccccccccccc"
    ].join("\n");
    const hierarchy = parseDailyPlanHierarchy(markdown, PATH, DATE, {
      planHeading: "今日计划",
      todoHeading: "ToDo"
    });

    expect(hierarchy.tasks.map((task) => task.text)).toEqual([
      "项目",
      "[[obsidian-待办清单]]",
      "迁入任务"
    ]);
    const changed = parseDailyPlanHierarchy(
      markdown.replace("obsidian-待办清单", "obsidian-任务清单"),
      PATH,
      DATE,
      { planHeading: "今日计划", todoHeading: "ToDo" }
    );
    expect(changed.revision).not.toBe(hierarchy.revision);
  });

  it("reads normalized tasks from the plan-heading fallback through DailyPlanService", async () => {
    const storage = new MemoryStorage();
    storage.files.set(PATH, [
      `# ${DATE}`,
      "## 今日计划",
      "- [ ] 项目",
      "  - [ ] [[obsidian-待办清单]] ^daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "## ToDo"
    ].join("\n"));
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-24T10:00:00+08:00"),
      planHeading: "今日计划",
      todoHeading: "ToDo"
    });

    expect(await service.list(DATE)).toEqual([
      expect.objectContaining({
        id: "daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        text: "[[obsidian-待办清单]]",
        groupId: expect.stringMatching(/^group_/u)
      })
    ]);
  });

  it("parses the user's nested checklist, keeps categories out of tasks, and resolves inherited targets", () => {
    const hierarchy = parseDailyPlanHierarchy(userSample(), PATH, DATE);

    expect(hierarchy.groups.map((group) => group.text)).toEqual([
      "[创作辅助工具电子屏幕硬件-软硬件系统设计](创作辅助工具电子屏幕硬件-软硬件系统设计.md)",
      "[墨水屏-书架，翻书效果与书籍导入工具](墨水屏-书架，翻书效果与书籍导入工具.md)",
      "待记录和发布",
      "待搞懂和记录"
    ]);
    expect(hierarchy.tasks).toHaveLength(13);
    expect(hierarchy.tasks.some((task) => task.text === "待搞懂和记录")).toBe(false);

    const structure = hierarchy.tasks.find((task) => task.text === "记录结构问题")!;
    expect(structure.targetResolution).toMatchObject({
      source: "ancestor-link",
      target: {
        path: "Daily/创作辅助工具电子屏幕硬件-软硬件系统设计.md"
      }
    });

    const shelf = hierarchy.tasks.find((task) => task.text.includes("列一下自己想看的书"))!;
    expect(shelf.targetResolution).toMatchObject({
      source: "task-link",
      target: { linkText: "我的书架" }
    });
    const imported = hierarchy.tasks.find((task) => task.text === "测试从阅星瞳导入书籍")!;
    expect(imported.targetResolution).toMatchObject({
      source: "ancestor-link",
      target: { path: "Daily/墨水屏-书架，翻书效果与书籍导入工具.md" }
    });

    const serotonin = hierarchy.tasks.find((task) => task.text === "[[血清素]]")!;
    expect(serotonin.targetResolution).toMatchObject({
      source: "task-link",
      target: { linkText: "血清素" }
    });
    expect(hierarchy.tasks.find((task) => task.text.includes("装配成完全体"))?.status).toBe("done");
    expect(hierarchy.tasks.find((task) => task.text.includes("同时会看几种类型"))?.rawBlock)
      .toContain("还有，每本书在主页上");
  });

  it("treats every checkbox as a task, including nested checkbox children", () => {
    const markdown = [
      `# ${DATE}`,
      "## ToDo",
      "- [ ] Parent [[Parent]] ^daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "  - [ ] Child [[Child]] ^daily_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "    [towrite-category:: 写作与发布] [towrite-task-ref:: task_pool_child01]",
      "    Child explanation"
    ].join("\n");
    const hierarchy = parseDailyPlanHierarchy(markdown, PATH, DATE);

    expect(hierarchy.tasks.map((task) => task.text)).toEqual([
      "Parent [[Parent]]",
      "Child [[Child]]"
    ]);
    expect(hierarchy.tasks[1].rawBlock).toContain("Child explanation");
    expect(hierarchy.tasks[0]).toMatchObject({ depth: 0, parentTaskId: undefined });
    expect(hierarchy.tasks[1]).toMatchObject({
      depth: 1,
      parentTaskId: "daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      category: "写作与发布",
      taskRef: "task_pool_child01"
    });
  });

  it("enriches DailyPlanService items and exposes nested normalized checkbox tasks", async () => {
    const storage = new MemoryStorage();
    storage.files.set(PATH, [
      `# ${DATE}`,
      "## ToDo",
      "1. [[Project]]",
      "   - [ ] Parent task ^daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "     - [ ] Child task [[Child]] ^daily_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    ].join("\n"));
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-24T10:00:00+08:00")
    });

    const items = await service.list(DATE);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      text: "Parent task",
      depth: 1,
      parentTaskId: undefined,
      groupId: expect.stringMatching(/^group_/u),
      lineageRevision: expect.stringMatching(/^dlr_/u),
      targetResolution: {
        source: "ancestor-link",
        target: { linkText: "Project" }
      }
    });
    expect(items[1]).toMatchObject({
      text: "Child task [[Child]]",
      depth: 2,
      parentTaskId: "daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      targetResolution: {
        source: "task-link",
        target: { linkText: "Child" }
      }
    });
    expect((await service.readHierarchy(DATE)).tasks).toHaveLength(2);
  });

  it("updates a parent task without consuming or rewriting its nested checkbox child", async () => {
    const storage = new MemoryStorage();
    storage.files.set(PATH, [
      `# ${DATE}`,
      "## ToDo",
      "- [ ] Parent task",
      "  - [ ] Child task [[Child]]",
      "    Child prose",
      "    ^daily_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "  ^daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    ].join("\n"));
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-24T10:00:00+08:00")
    });
    const parent = (await service.list(DATE))[0];

    await service.update(parent.id, parent.revision, { nextStep: "Only change parent" }, DATE);
    const written = storage.files.get(PATH)!;
    expect(written).toContain("- [ ] Child task [[Child]]");
    expect(written).toContain("    Child prose");
    expect(written.match(/\^daily_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/gu)).toHaveLength(1);
    expect(written.match(/\^daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/gu)).toHaveLength(1);
    expect((await service.list(DATE)).map((item) => item.text)).toEqual([
      "Parent task",
      "Child task [[Child]]"
    ]);
  });

  it("moves only adjacent sibling tasks in the same nearest category", async () => {
    const storage = new MemoryStorage();
    storage.files.set(PATH, [
      `# ${DATE}`,
      "## ToDo",
      "1. [[Project A]]",
      "   - [ ] First",
      "     first note",
      "     ^daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "   - [ ] Second",
      "     second note",
      "     ^daily_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "2. [[Project B]]",
      "   - [ ] Third ^daily_cccccccccccccccccccccccccccccccc"
    ].join("\n"));
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-24T10:00:00+08:00")
    });
    const original = await service.list(DATE);
    const second = original.find((item) => item.text === "Second")!;

    const moved = await service.move(second.id, second.revision, "up", DATE);
    expect(moved.groupId).toBe(second.groupId);
    expect((await service.list(DATE)).map((item) => item.text)).toEqual([
      "Second",
      "First",
      "Third"
    ]);
    const afterMove = storage.files.get(PATH)!;
    expect(afterMove.indexOf("second note")).toBeLessThan(afterMove.indexOf("First"));

    const firstGroup = (await service.list(DATE)).filter((item) => item.groupId === second.groupId);
    const lastInFirstGroup = firstGroup[firstGroup.length - 1];
    await service.move(lastInFirstGroup.id, lastInFirstGroup.revision, "down", DATE);
    expect(storage.files.get(PATH)).toBe(afterMove);
  });

  it("moves a parent task with its child subtree and never duplicates detached owned lines", async () => {
    const storage = new MemoryStorage();
    storage.files.set(PATH, [
      `# ${DATE}`,
      "## ToDo",
      "- [ ] Parent A",
      "  Parent note",
      "  - [ ] Child A",
      "    Child note",
      "    ^daily_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "  ^daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "- [ ] Parent B",
      "  ^daily_cccccccccccccccccccccccccccccccc"
    ].join("\n"));
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-24T10:00:00+08:00")
    });
    const parent = (await service.list(DATE)).find((item) => item.text === "Parent A")!;

    await service.move(parent.id, parent.revision, "down", DATE);
    const written = storage.files.get(PATH)!;
    expect(written.indexOf("Parent B")).toBeLessThan(written.indexOf("Parent A"));
    expect(written.indexOf("Parent A")).toBeLessThan(written.indexOf("Child A"));
    expect(written.match(/\^daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/gu)).toHaveLength(1);
    expect(written.match(/\^daily_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/gu)).toHaveLength(1);
    expect(written.match(/\^daily_cccccccccccccccccccccccccccccccc/gu)).toHaveLength(1);
    expect(written.match(/Parent note/gu)).toHaveLength(1);
    expect(written.match(/Child note/gu)).toHaveLength(1);

    const child = (await service.list(DATE)).find((item) => item.text === "Child A")!;
    const beforeRejectedMove = storage.files.get(PATH)!;
    await service.move(child.id, child.revision, "down", DATE);
    expect(storage.files.get(PATH)).toBe(beforeRejectedMove);
  });

  it("keeps the user's normalized category layout intact while reordering within one group", async () => {
    const storage = new MemoryStorage();
    storage.files.set(PATH, userSample());
    const normalizer = new DailyPlanNormalizationService(storage, {
      createId: idSequence(),
      now: () => new Date("2026-07-24T10:00:00+08:00")
    });
    await normalizer.normalize(await normalizer.preview(DATE));
    const service = new DailyPlanService(storage, {
      now: () => new Date("2026-07-24T10:00:00+08:00")
    });
    const before = await service.read(DATE);
    const groupTexts = (await service.readHierarchy(DATE)).groups.map((group) => group.text);
    const firstGroupId = before.items[0].groupId;
    const firstGroup = before.items.filter((item) => item.groupId === firstGroupId);

    await service.move(firstGroup[0].id, firstGroup[0].revision, "down", DATE);
    const after = await service.read(DATE);
    expect(after.items.filter((item) => item.groupId === firstGroupId).slice(0, 2).map((item) => item.id))
      .toEqual([firstGroup[1].id, firstGroup[0].id]);
    expect((await service.readHierarchy(DATE)).groups.map((group) => group.text)).toEqual(groupTexts);

    const lastInGroup = after.items.filter((item) => item.groupId === firstGroupId).at(-1)!;
    const beforeBoundaryMove = storage.files.get(PATH)!;
    await service.move(lastInGroup.id, lastInGroup.revision, "down", DATE);
    expect(storage.files.get(PATH)).toBe(beforeBoundaryMove);
    for (const item of await service.list(DATE)) {
      expect(storage.files.get(PATH)!.match(new RegExp(`\\^${item.blockId}(?=\\s|$)`, "gu")))
        .toHaveLength(1);
    }
  });

  it("changes lineage revision when an ancestor category target changes", () => {
    const first = parseDailyPlanHierarchy([
      `# ${DATE}`,
      "## ToDo",
      "1. [Project A](Project A.md)",
      "   - [ ] Work ^daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    ].join("\n"), PATH, DATE).tasks[0];
    const second = parseDailyPlanHierarchy([
      `# ${DATE}`,
      "## ToDo",
      "1. [Project B](Project B.md)",
      "   - [ ] Work ^daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    ].join("\n"), PATH, DATE).tasks[0];

    expect(first.lineageRevision).not.toBe(second.lineageRevision);
    expect(first.targetResolution.target?.path).toBe("Daily/Project A.md");
    expect(second.targetResolution.target?.path).toBe("Daily/Project B.md");
  });

  it("diagnoses missing local targets when a vault checker is supplied", () => {
    const hierarchy = parseDailyPlanHierarchy([
      `# ${DATE}`,
      "## ToDo",
      "- Missing notes",
      "  - [[不存在]]"
    ].join("\n"), PATH, DATE, {
      targetExists: (target) => target.linkText !== "不存在"
    });
    expect(hierarchy.diagnostics).toContainEqual(expect.objectContaining({
      code: "broken-target",
      severity: "warning",
      target: "[[不存在]]"
    }));
  });
});

describe("daily target resolver", () => {
  it("resolves same-note heading and block links against the planning source", () => {
    expect(parseDailyMarkdownTargets(
      "[[#Today focus]] and [[#^daily_same_note]]",
      { sourcePath: PATH }
    )).toEqual([
      expect.objectContaining({
        path: PATH,
        heading: "Today focus"
      }),
      expect.objectContaining({
        path: PATH,
        blockId: "daily_same_note"
      })
    ]);
  });

  const group: DailyPlanGroup = {
    id: "group_parent",
    text: "[Parent](父级, 分类.md)",
    sourcePath: PATH,
    line: 3,
    endLine: 5,
    depth: 0,
    links: parseDailyMarkdownTargets("[Parent](父级, 分类.md)", { sourcePath: PATH })
  };
  const lineage = createDailyLineage([group], PATH, DATE);

  it("uses explicit target, own link, ancestor link, task block, then Dashboard", () => {
    expect(resolveDailyTarget({
      sourcePath: PATH,
      taskText: "[[Own]]",
      explicitTarget: "[[Explicit#Heading]]",
      blockId: "daily_a",
      lineage
    })).toMatchObject({ source: "explicit", target: { linkText: "Explicit", heading: "Heading" } });
    expect(resolveDailyTarget({
      sourcePath: PATH,
      taskText: "[[Own]]",
      blockId: "daily_a",
      lineage
    })).toMatchObject({ source: "task-link", target: { linkText: "Own" } });
    expect(resolveDailyTarget({
      sourcePath: PATH,
      taskText: "No own link",
      blockId: "daily_a",
      lineage
    })).toMatchObject({ source: "ancestor-link", target: { path: "Daily/父级, 分类.md" } });
    expect(resolveDailyTarget({
      sourcePath: PATH,
      taskText: "No link",
      blockId: "daily_a"
    })).toMatchObject({ source: "task-block", sourcePath: PATH, blockId: "daily_a" });
    expect(resolveDailyTarget({
      sourcePath: PATH,
      taskText: "No link"
    })).toMatchObject({ source: "dashboard" });
  });

  it("supports CJK relative Markdown paths and ignores external, attachment, absolute and traversal links", () => {
    expect(parseDailyMarkdownTargets(
      "[文档](../项目/创作辅助工具，第二版.md) [[我的书架#^shelf]]",
      { sourcePath: "Daily/Plans/Today.md" }
    )).toEqual([
      expect.objectContaining({ kind: "markdown", path: "Daily/项目/创作辅助工具，第二版.md" }),
      expect.objectContaining({ kind: "wikilink", linkText: "我的书架", blockId: "shelf" })
    ]);
    expect(parseDailyMarkdownTargets([
      "[web](https://example.com/x.md)",
      "![asset](assets/x.md)",
      "![[embedded note]]",
      "[[assets/photo.png]]",
      "[[reference.pdf|PDF]]",
      "[absolute](C:/Secret.md)",
      "[escape](../../../Secret.md)"
    ].join(" "), { sourcePath: PATH })).toEqual([]);
  });

  it("rejects attachment and unsafe explicit towrite targets instead of opening them as notes", () => {
    for (const explicitTarget of [
      "reference.pdf",
      "assets/image.png",
      "[[reference.pdf]]",
      "[[assets/image.png#preview]]",
      "../../../Secret.md"
    ]) {
      expect(resolveDailyTarget({
        sourcePath: PATH,
        taskText: "No task link",
        rawBlock: `- [ ] No task link\n  [towrite-target:: ${explicitTarget}]\n  ^daily_attachment`,
        blockId: "daily_attachment"
      })).toMatchObject({
        source: "task-block",
        sourcePath: PATH,
        blockId: "daily_attachment"
      });
    }
  });

  it("accepts only an explicit credential-free HTTPS target as a web destination", () => {
    expect(resolveDailyTarget({
      sourcePath: PATH,
      taskText: "Read the saved article",
      rawBlock: "- [ ] Read the saved article\n  [towrite-target:: https://example.com/articles/echo#part-2]\n  ^daily_web",
      blockId: "daily_web"
    })).toMatchObject({
      source: "explicit",
      webTarget: {
        kind: "web",
        url: "https://example.com/articles/echo#part-2",
        label: "example.com/articles/echo"
      }
    });

    for (const unsafe of [
      "http://example.com/article",
      "https://user:secret@example.com/article",
      "javascript:alert(1)",
      "file:///C:/Secret.md"
    ]) {
      expect(resolveDailyTarget({
        sourcePath: PATH,
        taskText: "No task link",
        rawBlock: `- [ ] No task link\n  [towrite-target:: ${unsafe}]\n  ^daily_unsafe_web`,
        blockId: "daily_unsafe_web"
      })).toMatchObject({
        source: "task-block",
        blockId: "daily_unsafe_web"
      });
    }
  });
});

describe("daily plan normalization", () => {
  it("waits for an authored note link to close before adding a stable id", () => {
    const unfinished = createDailyPlanNormalizationPreview([
      `# ${DATE}`,
      "## ToDo",
      "- [ ] Project",
      "  1. [[obsidian"
    ].join("\n"), PATH, DATE, { createId: idSequence() });

    expect(unfinished.edits).toEqual([]);
    expect(unfinished.diff).not.toContain("[[obsidian ^daily_");

    const finished = createDailyPlanNormalizationPreview([
      `# ${DATE}`,
      "## ToDo",
      "- [ ] Project",
      "  1. [[obsidian]]"
    ].join("\n"), PATH, DATE, { createId: idSequence() });

    expect(finished.edits.map((edit) => edit.line)).toEqual([3, 4]);
    expect(finished.edits.find((edit) => edit.line === 4)?.after)
      .toContain("[[obsidian]] ^daily_");
  });

  it("previews minimal line edits, preserves groups and prose, and does not add metadata or completion dates", () => {
    const preview = createDailyPlanNormalizationPreview(userSample(), PATH, DATE, {
      createId: idSequence()
    });

    expect(preview.groups).toHaveLength(4);
    expect(preview.edits).toHaveLength(13);
    expect(preview.diff).toContain("@@ line");
    const legacy = preview.edits.find((edit) => edit.taskText.includes("装配成完全体"));
    expect(legacy?.after)
      .toMatch(/- \[x\] ~~装配成完全体/u);
    expect(legacy?.legacyTimingSuggestion).toEqual({
      estimateMinutes: 10,
      observedTimes: ["13:54", "13:57"],
      confidence: "low"
    });
    expect(preview.edits.every((edit) => !edit.after.includes("✅"))).toBe(true);
    expect(preview.edits.every((edit) => !edit.after.includes("[towrite-kind::"))).toBe(true);
    expect(preview.edits.find((edit) => edit.taskText.includes("同时会看几种类型"))?.after)
      .toContain("同时会看几种类型");
    expect(preview.edits.some((edit) => edit.before.startsWith("1."))).toBe(false);
  });

  it("normalizes with plan CAS and safely undoes only an unchanged result", async () => {
    const storage = new MemoryStorage();
    const original = [
      `# ${DATE}`,
      "## ToDo",
      "1. [[Project]]",
      "   - First leaf",
      "     Keep this explanation",
      "   - [ ] Existing checkbox"
    ].join("\n");
    storage.files.set(PATH, original);
    const service = new DailyPlanNormalizationService(storage, {
      createId: idSequence(),
      now: () => new Date("2026-07-24T10:00:00+08:00")
    });
    const preview = await service.preview(DATE);
    const result = await service.normalize(preview);
    const normalized = storage.files.get(PATH)!;

    expect(normalized).toContain("1. [[Project]]");
    expect(normalized).toContain("   - [ ] First leaf ^daily_");
    expect(normalized).toContain("     Keep this explanation");
    expect(normalized).toContain("   - [ ] Existing checkbox ^daily_");
    expect(result.undoToken).toMatch(/^dnu_[a-f0-9]{32}$/u);

    await service.undo(result.undoToken!);
    expect(storage.files.get(PATH)).toBe(original);
  });

  it("normalizes only the selected quick task and leaves other drafts untouched", async () => {
    const storage = new MemoryStorage();
    storage.files.set(PATH, [
      `# ${DATE}`,
      "## ToDo",
      "- [ ] First quick task",
      "- [ ] Second quick task"
    ].join("\n"));
    const service = new DailyPlanNormalizationService(storage, {
      createId: idSequence(),
      now: () => new Date("2026-07-24T10:00:00+08:00")
    });

    const preview = await service.preview(DATE);
    expect(preview.edits).toHaveLength(2);
    const result = await service.normalizeTask(preview, preview.edits[0].line);
    const written = storage.files.get(PATH)!;

    expect(written).toContain("- [ ] First quick task ^daily_00000000000000000000000000000001");
    expect(written).toContain("- [ ] Second quick task");
    expect(written).not.toContain("Second quick task ^daily_");
    expect(result.preview.edits).toHaveLength(1);
    expect(result.preview.edits[0].taskText).toBe("Second quick task");
  });

  it("adopts one quick task with selected properties in the same revision-safe write", async () => {
    const storage = new MemoryStorage();
    storage.files.set(PATH, [
      `# ${DATE}`,
      "## ToDo",
      "- [ ] 写出 [[Echo 发布计划]]",
      "  用户自己的说明",
      "- [ ] 另一条待办"
    ].join("\n"));
    const service = new DailyPlanNormalizationService(storage, {
      createId: idSequence()
    });
    const preview = await service.preview(DATE);

    await service.adoptTask(preview, preview.edits[0].line, {
      category: "写作和发布",
      dueDate: "2026-07-30",
      estimateMinutes: 25,
      nextStep: "先写出第一段",
      target: "[[Echo 发布计划]]"
    });
    const written = storage.files.get(PATH)!;

    expect(written).toContain("- [ ] 写出 [[Echo 发布计划]] ^daily_00000000000000000000000000000001");
    expect(written).toContain("  [towrite-category:: 写作和发布]");
    expect(written).toContain("  [towrite-due:: 2026-07-30]");
    expect(written).toContain("  [towrite-estimate:: 25m]");
    expect(written).toContain("  [towrite-next:: 先写出第一段]");
    expect(written).toContain("  [towrite-target:: [[Echo 发布计划]]]");
    expect(written).toContain("  用户自己的说明");
    expect(written).toContain("- [ ] 另一条待办");
    expect(written).not.toContain("另一条待办 ^daily_");

    const item = (await new DailyPlanService(storage).list(DATE))[0];
    expect(item).toMatchObject({
      category: "写作和发布",
      dueDate: "2026-07-30",
      dueDateExplicit: true,
      estimateMinutes: 25,
      nextStep: "先写出第一段",
      target: "[[Echo 发布计划]]"
    });
  });

  it("track-only preserves optional fields the author already wrote", async () => {
    const storage = new MemoryStorage();
    storage.files.set(PATH, [
      `# ${DATE}`,
      "## ToDo",
      "- [ ] Handwritten quick task",
      "  [towrite-category:: Personal]",
      "  Keep this note"
    ].join("\n"));
    const service = new DailyPlanNormalizationService(storage, {
      createId: idSequence()
    });

    const preview = await service.preview(DATE);
    await service.normalizeTask(preview, preview.edits[0].line);
    const written = storage.files.get(PATH)!;
    expect(written).toContain("[towrite-category:: Personal]");
    expect(written).toContain("Keep this note");
    expect(written).not.toContain("[towrite-kind::");
  });

  it("rejects invalid enrichment before writing an adopted task", async () => {
    const storage = new MemoryStorage();
    const original = `# ${DATE}\n## ToDo\n- [ ] Unsafe target`;
    storage.files.set(PATH, original);
    const service = new DailyPlanNormalizationService(storage, {
      createId: idSequence()
    });
    const preview = await service.preview(DATE);

    await expect(service.adoptTask(preview, preview.edits[0].line, {
      target: "javascript:alert(1)"
    })).rejects.toThrow(/safe Obsidian note/u);
    expect(storage.files.get(PATH)).toBe(original);
  });

  it("rejects a stale scoped quick-task normalization without touching Markdown", async () => {
    const storage = new MemoryStorage();
    storage.files.set(PATH, `# ${DATE}\n## ToDo\n- [ ] Quick task`);
    const service = new DailyPlanNormalizationService(storage, {
      createId: idSequence()
    });
    const preview = await service.preview(DATE);
    storage.files.set(PATH, `# ${DATE}\n## ToDo\n- [ ] Quick task changed`);

    await expect(service.normalizeTask(preview, preview.edits[0].line))
      .rejects.toMatchObject({ code: "revision-changed" });
    expect(storage.files.get(PATH)).toContain("Quick task changed");
    expect(storage.files.get(PATH)).not.toContain("^daily_");
  });

  it("rejects stale previews and refuses unsafe undo after user changes", async () => {
    const storage = new MemoryStorage();
    storage.files.set(PATH, `# ${DATE}\n## ToDo\n- Leaf`);
    const service = new DailyPlanNormalizationService(storage, {
      createId: idSequence(),
      now: () => new Date("2026-07-24T10:00:00+08:00")
    });

    const stale = await service.preview(DATE);
    storage.files.set(PATH, `${storage.files.get(PATH)}\nUser edit`);
    await expect(service.normalize(stale)).rejects.toBeInstanceOf(DailyPlanConflictError);

    storage.files.set(PATH, `# ${DATE}\n## ToDo\n- Leaf`);
    const current = await service.preview(DATE);
    const result = await service.normalize(current);
    storage.files.set(PATH, `${storage.files.get(PATH)}\nUser edit after normalize`);
    await expect(service.undo(result.undoToken!)).rejects.toMatchObject({ code: "revision-changed" });
  });

  it("rejects a forged normalization edit even when the document revision is current", async () => {
    const storage = new MemoryStorage();
    storage.files.set(PATH, `# ${DATE}\n## ToDo\n- Safe leaf`);
    const service = new DailyPlanNormalizationService(storage, {
      createId: idSequence()
    });
    const preview = await service.preview(DATE);
    const forged = {
      ...preview,
      diagnostics: [],
      edits: preview.edits.map((edit) => ({
        ...edit,
        after: "- [ ] Replaced by an API caller ^daily_ffffffffffffffffffffffffffffffff"
      }))
    };

    await expect(service.normalize(forged)).rejects.toMatchObject({ code: "invalid-document" });
    expect(storage.files.get(PATH)).toBe(`# ${DATE}\n## ToDo\n- Safe leaf`);
  });

  it("replaces an invalid short block id with the proposed 128-bit id", async () => {
    const storage = new MemoryStorage();
    storage.files.set(PATH, `# ${DATE}\n## ToDo\n- [ ] Task with invalid id ^short`);
    const service = new DailyPlanNormalizationService(storage, {
      createId: () => "daily_1234567890abcdef1234567890abcdef"
    });

    const preview = await service.preview(DATE);
    expect(preview.edits).toEqual([
      expect.objectContaining({
        kind: "missing-block-id",
        before: "- [ ] Task with invalid id ^short",
        after: "- [ ] Task with invalid id ^daily_1234567890abcdef1234567890abcdef"
      })
    ]);
    await service.normalize(preview);
    expect(storage.files.get(PATH)).toContain("^daily_1234567890abcdef1234567890abcdef");
    expect((await new DailyPlanService(storage).list(DATE))).toHaveLength(1);
  });

  it("keeps an invalid standalone Obsidian block as user text while adding a valid task id", async () => {
    const storage = new MemoryStorage();
    storage.files.set(PATH, `# ${DATE}\n## ToDo\n- [ ] Task\n  ^tiny`);
    const service = new DailyPlanNormalizationService(storage, {
      createId: () => "daily_abcdef1234567890abcdef1234567890"
    });

    await service.normalize(await service.preview(DATE));
    const written = storage.files.get(PATH)!;
    expect(written).toContain("- [ ] Task ^daily_abcdef1234567890abcdef1234567890");
    expect(written).toContain("  ^tiny");
    expect((await new DailyPlanService(storage).list(DATE))).toHaveLength(1);
  });

  it("keeps the source document's CRLF convention during normalization", async () => {
    const storage = new MemoryStorage();
    storage.files.set(PATH, `# ${DATE}\r\n## ToDo\r\n- Leaf\r\n\r\nHandwritten footer`);
    const service = new DailyPlanNormalizationService(storage, {
      createId: () => "daily_11111111111111111111111111111111"
    });

    await service.normalize(await service.preview(DATE));
    const written = storage.files.get(PATH)!;
    expect(written).toContain(`- [ ] Leaf ^daily_11111111111111111111111111111111\r\n\r\nHandwritten footer`);
    expect(written.replaceAll("\r\n", "")).not.toContain("\n");
  });
});

class MemoryStorage implements DailyPlanStorage {
  readonly files = new Map<string, string>();
  async readText(path: string): Promise<string | undefined> {
    return this.files.get(path);
  }
  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
}

function idSequence(): () => string {
  let index = 0;
  return () => `daily_${(++index).toString(16).padStart(32, "0")}`;
}

function userSample(): string {
  return [
    `# ${DATE}`,
    "",
    "## ToDo",
    "",
    "1. [创作辅助工具电子屏幕硬件-软硬件系统设计](创作辅助工具电子屏幕硬件-软硬件系统设计.md)",
    "   - 记录结构问题",
    "   - 修改模型，发打印",
    "   - ~~装配成完全体，10min，13：54，继续，13：57，差不多了~~",
    "   - 设计obsidian上电子待办的方案",
    "   - 实现按下按键，打开对应笔记的功能",
    "2. [墨水屏-书架，翻书效果与书籍导入工具](墨水屏-书架，翻书效果与书籍导入工具.md)",
    "   - 测试从阅星瞳导入书籍",
    "   - 列一下自己想看的书，正在读的书，还有已经读完的书[[我的书架]]",
    "   - 同时会看几种类型的书怎么办，能不能在同一层做类似竖着的那种分类",
    "     还有，每本书在主页上，能不能显示一个阅读进度，以及这个阅读进度能不能跟我的阅读器设备同步",
    "   - 把自己准备看的书和待看的书加入书架，看看导入效果",
    "3. 待记录和发布",
    "   - [[有必要做一个模块的样机以及做硬件总会遇到很多要改的问题，有时候想直接做下一版了]]",
    "4. 待搞懂和记录",
    "   - [[血清素]]",
    "   - [[皮质醇]]",
    "   - [[浏览器的窗口可以预览各种手机尺寸以及响应式布局]]"
  ].join("\n");
}

describe("named desktop action targets", () => {
  it("gives an explicit local action priority over note and web targets", () => {
    expect(resolveDailyTarget({
      sourcePath: PATH,
      taskText: "[[Fallback note]]",
      rawBlock: [
        "- [ ] Continue writing [[Fallback note]]",
        "  [towrite-action:: writing-focus]",
        "  [towrite-target:: https://example.com/fallback]",
        "  ^daily_action"
      ].join("\n"),
      blockId: "daily_action"
    })).toMatchObject({
      source: "action",
      actionId: "writing-focus",
      displayLabel: "writing-focus"
    });
  });

  it("fails closed for a malformed action id", () => {
    expect(resolveDailyTarget({
      sourcePath: PATH,
      taskText: "[[Fallback note]]",
      rawBlock: "- [ ] Continue writing\n  [towrite-action:: ../../shell]"
    })).toMatchObject({ source: "action", actionId: undefined });
  });
});
