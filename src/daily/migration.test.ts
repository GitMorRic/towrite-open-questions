import { describe, expect, it } from "vitest";
import type { DailyPlanItem } from "./types";
import {
  dailyMigrationSelectionKey,
  expandDailyMigrationSelections,
  planDailyMigrationDestinations,
  unfinishedDailyLeafItems
} from "./migration";

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

  it("keeps reused ids distinct across historical date scopes", () => {
    const first = item("reused");
    first.revision.date = "2026-08-10";
    const second = item("reused");
    second.revision.date = "2026-08-12";

    expect(dailyMigrationSelectionKey(first)).not.toBe(dailyMigrationSelectionKey(second));
    expect(new Set([first, second].map(dailyMigrationSelectionKey)).size).toBe(2);
  });

  it("preallocates distinct destinations for same-content tasks that reuse an id", () => {
    const first = item("daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    first.text = "same task text";
    first.revision.date = "2026-08-10";
    const second = item("daily_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    second.text = "same task text";
    second.revision.date = "2026-08-12";
    second.revision.value = "rev-from-second-date";

    const planned = planDailyMigrationDestinations([first, second], [], "2026-08-13");

    expect(planned[0].destinationId).toBe(first.id);
    expect(planned[1].destinationId).toMatch(/^daily_[0-9a-f]{32}$/u);
    expect(planned[1].destinationId).not.toBe(planned[0].destinationId);
    expect(planDailyMigrationDestinations([first, second], [], "2026-08-13")
      .map((entry) => entry.destinationId))
      .toEqual(planned.map((entry) => entry.destinationId));
  });

  it("preallocates distinct destinations for different-content tasks that reuse an id", () => {
    const first = item("daily_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    first.text = "first task";
    first.revision.date = "2026-08-10";
    const second = item("daily_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    second.text = "different task";
    second.revision.date = "2026-08-12";
    second.revision.value = "rev-different-task";
    const occupied = item(first.id);

    const planned = planDailyMigrationDestinations([first, second], [occupied], "2026-08-13");

    expect(new Set(planned.map((entry) => entry.destinationId)).size).toBe(2);
    expect(planned.every((entry) => entry.destinationId !== occupied.id)).toBe(true);
    expect(planned.every((entry) => /^daily_[0-9a-f]{32}$/u.test(entry.destinationId))).toBe(true);
  });
});
