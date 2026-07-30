import { describe, expect, it } from "vitest";
import {
  initialTaskPropertyDisclosureState,
  initialNoteTaskDeadline,
  noteTaskPropertyPatch,
  noteTaskSchedulePatch,
  propertyPatch
} from "./daily-task-properties";

describe("Daily progressive task properties", () => {
  it("keeps every property optional and clears blank values explicitly", () => {
    expect(propertyPatch({
      category: " ",
      target: "",
      dueDate: "",
      estimateMinutes: "",
      nextStep: ""
    })).toEqual({
      category: null,
      target: null,
      dueDate: null,
      estimateMinutes: null,
      nextStep: null
    });
  });

  it("normalizes the compact property card into a Daily patch", () => {
    expect(propertyPatch({
      category: " 写作和发布 ",
      target: " [[Echo 发布计划]] ",
      dueDate: "2026-07-30",
      estimateMinutes: "25",
      nextStep: " 写出第一段 "
    })).toEqual({
      category: "写作和发布",
      target: "[[Echo 发布计划]]",
      dueDate: "2026-07-30",
      estimateMinutes: 25,
      nextStep: "写出第一段"
    });
  });

  it("rejects invalid estimates and dates before touching Markdown", () => {
    const base = {
      category: "",
      target: "",
      dueDate: "",
      estimateMinutes: "",
      nextStep: ""
    };
    expect(() => propertyPatch({ ...base, estimateMinutes: "1.5" })).toThrow(/整数/u);
    expect(() => propertyPatch({ ...base, estimateMinutes: "0" })).toThrow(/1–1440/u);
    expect(() => propertyPatch({ ...base, dueDate: "07/30/2026" })).toThrow(/YYYY-MM-DD/u);
  });

  it("keeps planned start, expected finish, and DDL distinct", () => {
    expect(noteTaskSchedulePatch({
      plannedStartAt: "2026-07-29T09:00",
      expectedFinishAt: "2026-07-29T10:30",
      deadlineAt: "2026-07-30T18:00"
    })).toEqual({
      plannedStartAt: "2026-07-29T09:00",
      expectedFinishAt: "2026-07-29T10:30",
      deadlineAt: "2026-07-30T18:00"
    });
  });

  it("rejects invalid or reversed planned time windows", () => {
    expect(() => noteTaskSchedulePatch({
      plannedStartAt: "2026-07-29T10:00",
      expectedFinishAt: "2026-07-29T09:00",
      deadlineAt: ""
    })).toThrow(/不能早于/u);
    expect(() => noteTaskSchedulePatch({
      plannedStartAt: "tomorrow",
      expectedFinishAt: "",
      deadlineAt: ""
    })).toThrow(/完整的日期与时间/u);
  });

  it("uses one precise DDL for ordinary-note tasks and migrates the removed date field", () => {
    expect(initialNoteTaskDeadline(undefined, "2026-07-30")).toBe("2026-07-30T23:59");
    expect(initialNoteTaskDeadline("2026-07-30T18:00", "2026-07-31"))
      .toBe("2026-07-30T18:00");
    expect(noteTaskPropertyPatch({
      category: "项目",
      target: "",
      dueDate: "2026-07-30",
      estimateMinutes: "15",
      nextStep: ""
    })).toMatchObject({
      category: "项目",
      dueDate: null,
      estimateMinutes: 15
    });
  });

  it("opens only optional sections that already contain user data or active timing", () => {
    expect(initialTaskPropertyDisclosureState({})).toEqual({
      targetOpen: false,
      nextStepOpen: false,
      scheduleOpen: false
    });
    expect(initialTaskPropertyDisclosureState({
      target: "[[Echo]]",
      nextStep: "列三个指标",
      deadlineAt: "2026-07-30T18:00"
    })).toEqual({
      targetOpen: true,
      nextStepOpen: true,
      scheduleOpen: true
    });
    expect(initialTaskPropertyDisclosureState({
      timingStatus: "running"
    }).scheduleOpen).toBe(true);
    expect(initialTaskPropertyDisclosureState({
      timingStatus: "not-started"
    }).scheduleOpen).toBe(false);
  });
});
