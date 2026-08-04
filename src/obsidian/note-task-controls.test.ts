import { describe, expect, it } from "vitest";
import {
  getNoteTaskControlUpdateStrategy,
  isOwnedNoteTaskMetadataLine,
  noteTimingLabel,
  rankNoteTaskPoolMatches,
  shouldDismissTaskDisclosure,
  shouldHideTaskIdRange,
  summarizeNoteTaskProperties,
  trailingTaskIdRange,
  timingMinuteBucket
} from "./note-task-controls";
import type { TaskPoolItem } from "../daily";

function poolItem(
  suffix: string,
  text: string,
  state: TaskPoolItem["state"] = "pool",
  extra: Partial<TaskPoolItem> = {}
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
    revision: { value: `tpr_${suffix}`, sourcePath: "Planning/Task Pool.md", taskId },
    unknownLines: [],
    ...extra
  };
}

describe("ordinary note task controls", () => {
  it("never rebuilds from document typing alone", () => {
    expect(getNoteTaskControlUpdateStrategy({
      docChanged: true,
      reconfigured: false,
      refreshRequested: false
    })).toBe("map");
    expect(getNoteTaskControlUpdateStrategy({
      docChanged: false,
      reconfigured: false,
      refreshRequested: true
    })).toBe("rebuild");
    expect(getNoteTaskControlUpdateStrategy({
      docChanged: true,
      reconfigured: false,
      refreshRequested: false,
      selectionChanged: true
    })).toBe("map");
  });

  it("ranks available in-memory pool matches without suggesting bound or completed tasks", () => {
    const items = [
      poolItem("a", "写出 Echo 发布说明", "pool", { category: "写作和发布" }),
      poolItem("b", "整理 Echo 发布素材", "returned"),
      poolItem("c", "已经完成 Echo 发布", "done"),
      poolItem("d", "另一个来源任务", "pool", {
        source: `[[Notes/source#^task_${"d".repeat(32)}]]`
      }),
      poolItem("e", "购买牛奶")
    ];

    expect(rankNoteTaskPoolMatches("Echo 发布说明", items).map((item) => item.taskId))
      .toEqual([`task_${"a".repeat(32)}`, `task_${"b".repeat(32)}`]);
    expect(rankNoteTaskPoolMatches("牛", items)).toEqual([]);
  });

  it("folds only the exact owned metadata allowlist", () => {
    expect(isOwnedNoteTaskMetadataLine("  [towrite-category:: 写作]")).toBe(true);
    expect(isOwnedNoteTaskMetadataLine("  [towrite-next:: 列三个要点]")).toBe(true);
    expect(isOwnedNoteTaskMetadataLine("  [towrite-deadline:: 2026-07-30T18:00]")).toBe(true);
    expect(isOwnedNoteTaskMetadataLine(`  [towrite-pool-ref:: task_${"a".repeat(32)}]`)).toBe(true);
    expect(isOwnedNoteTaskMetadataLine("  [towrite-custom:: 用户字段]")).toBe(false);
    expect(isOwnedNoteTaskMetadataLine("正文 [towrite-category:: 写作]")).toBe(false);
  });

  it("summarizes selected properties without exposing IDs", () => {
    expect(summarizeNoteTaskProperties({
      category: "写作",
      dueDate: "2026-07-30",
      estimateMinutes: 25,
      target: "[[Echo]]",
      nextStep: "列出要点"
    })).toBe("写作 · 2026-07-30 · 25m");
  });

  it("puts the compact time plan on the task line", () => {
    expect(summarizeNoteTaskProperties({
      plannedStartAt: "2026-07-29T09:00",
      expectedFinishAt: "2026-07-29T10:30",
      deadlineAt: "2026-07-30T18:00"
    })).toBe("计划 07-29 09:00 · 预计 07-29 10:30 · DDL 07-30 18:00");
  });

  it("changes the widget identity only when the displayed active minute changes", () => {
    expect(timingMinuteBucket({ activeMs: 59_999 })).toBe(0);
    expect(timingMinuteBucket({ activeMs: 60_000 })).toBe(1);
    expect(timingMinuteBucket({ activeMs: 119_999 })).toBe(1);
  });

  it("isolates only a valid trailing technical task ID for Live Preview hiding", () => {
    const id = `task_${"a".repeat(32)}`;
    const line = `- [ ] 用户可见的待办 ^${id}  `;
    const range = trailingTaskIdRange(line);

    expect(range).toBeDefined();
    expect(line.slice(range!.from, range!.to)).toBe(` ^${id}  `);
    expect(trailingTaskIdRange(`- [ ] 正文 ^${id} 后面还有内容`)).toBeUndefined();
    expect(trailingTaskIdRange(`- [ ] 正文 ^daily_${"a".repeat(32)}`)).toBeUndefined();
    expect(trailingTaskIdRange("- [ ] 正文 ^task_short")).toBeUndefined();
  });

  it("always hides the technical ID in Live Preview and Source mode", () => {
    expect(shouldHideTaskIdRange(true)).toBe(true);
    expect(shouldHideTaskIdRange(false)).toBe(true);
  });

  it("keeps the action tray open until an outside click or Escape", () => {
    expect(shouldDismissTaskDisclosure("outside-pointer", true)).toBe(false);
    expect(shouldDismissTaskDisclosure("outside-pointer", false)).toBe(true);
    expect(shouldDismissTaskDisclosure("escape", true)).toBe(true);
  });

  it("omits idle tracking noise but keeps meaningful timing state", () => {
    expect(noteTimingLabel(
      { status: "todo" },
      { status: "not-started", activeMs: 0 }
    )).toBeUndefined();
    expect(noteTimingLabel(
      { status: "todo" },
      { status: "running", activeMs: 125_000 }
    )).toBe("2m · 进行中");
    expect(noteTimingLabel(
      { status: "todo" },
      { status: "paused", activeMs: 60_000 }
    )).toBe("1m · 已暂停");
  });
});
