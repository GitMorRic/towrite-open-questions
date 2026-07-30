import { describe, expect, it } from "vitest";
import type { DailyPlanItem } from "../daily/types";
import {
  parseTodayEmbedOptions,
  selectTodayEmbedItems,
  todayEmbedMarkdown
} from "./today-embed-state";

describe("today embed state", () => {
  it("parses a small, bounded configuration", () => {
    expect(parseTodayEmbedOptions("mode: compact\nlimit: 99\nshow-completed: yes")).toEqual({
      mode: "compact",
      limit: 6,
      showCompleted: true
    });
    expect(parseTodayEmbedOptions("mode: compact")).toMatchObject({ mode: "compact", limit: 1 });
  });

  it("puts the active task first and hides completed work by default", () => {
    const options = parseTodayEmbedOptions("limit: 2");
    expect(selectTodayEmbedItems([
      item("first", "todo"),
      item("active", "in-progress"),
      item("done", "done")
    ], options).map((entry) => entry.id)).toEqual(["active", "first"]);
  });

  it("produces the canonical block inserted by the command", () => {
    expect(todayEmbedMarkdown()).toContain("```towrite-today");
    expect(todayEmbedMarkdown()).toContain("limit: 3");
  });
});

function item(id: string, status: DailyPlanItem["status"]): DailyPlanItem {
  return {
    schemaVersion: 1,
    id,
    blockId: id,
    text: id,
    kind: "task",
    status,
    date: "2026-07-30",
    sourcePath: "Daily/2026-07-30.md",
    rawLine: `- [ ] ${id}`,
    line: 1,
    done: status === "done",
    scheduledDate: "2026-07-30",
    dueDate: "",
    linkedNotes: [],
    revision: {
      value: `rev_${id}`,
      sourcePath: "Daily/2026-07-30.md",
      blockId: id
    },
    devicePolicy: "manual",
    tags: []
  };
}
