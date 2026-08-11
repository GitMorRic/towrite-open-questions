import { describe, expect, it } from "vitest";
import type { DailyPlanItem } from "./types";
import { expandDailyMigrationSelections, unfinishedDailyLeafItems } from "./migration";

function item(
  id: string,
  parentTaskId?: string,
  status: DailyPlanItem["status"] = "todo"
): DailyPlanItem {
  return {
    schemaVersion: 1,
    id,
    blockId: id,
    date: "2026-08-10",
    text: id,
    kind: "task",
    status,
    done: status === "done",
    sourcePath: "Daily/2026-08-10.md",
    line: 1,
    rawLine: `- [ ] ${id}`,
    revision: { value: `rev-${id}`, sourcePath: "Daily/2026-08-10.md", blockId: id },
    parentTaskId,
    scheduledDate: "2026-08-10",
    dueDate: "2026-08-10",
    devicePolicy: "none",
    tags: [],
    linkedNotes: []
  };
}

describe("Daily migration hierarchy", () => {
  const items = [
    item("project"),
    item("design", "project"),
    item("hardware", "project"),
    item("pcb", "hardware"),
    item("done-child", "hardware", "done"),
    item("standalone")
  ];

  it("offers only unfinished leaves in the migration preview", () => {
    expect(unfinishedDailyLeafItems(items).map((entry) => entry.id))
      .toEqual(["design", "pcb", "standalone"]);
  });

  it("expands a selected parent into unfinished leaf descendants", () => {
    expect(expandDailyMigrationSelections(items, new Set(["project"])).map((entry) => entry.id))
      .toEqual(["design", "pcb"]);
  });

  it("deduplicates overlapping parent and child selections", () => {
    expect(expandDailyMigrationSelections(items, new Set(["project", "hardware", "pcb"]))
      .map((entry) => entry.id)).toEqual(["design", "pcb"]);
  });
});
