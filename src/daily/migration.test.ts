import { describe, expect, it } from "vitest";
import type { DailyPlanItem } from "./types";
import {
  analyzeDailyMigrationDuplicates,
  buildDailyMigrationPreview,
  dailyMigrationDestinationCategory,
  dailyMigrationMergeUnitKey,
  dailyMigrationSelectionKey,
  expandDailyMigrationSelections,
  planDailyMigrationDestinations,
  planDailyMigrationMergeUnits,
  orderDailyMigrationMergeUnits,
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

  it("selects a structural category as one subtree instead of rejecting or flattening its children", () => {
    const category = item("category");
    category.text = "项目";
    category.structuralCategory = true;
    category.structuralChildren = [{
      text: "Project A",
      status: "todo",
      checkbox: false,
      mergeKey: "child-project-a",
      children: []
    }];
    const child = item("category-child", category.id);

    expect(unfinishedDailyLeafItems([category, child]).map((entry) => entry.id))
      .toEqual([category.id]);
    expect(expandDailyMigrationSelections(
      [category, child],
      new Set([category.id])
    ).map((entry) => entry.id)).toEqual([category.id]);
    expect(dailyMigrationDestinationCategory(category)).toBe("项目");
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

  it("previews exact duplicate intent across dates and an existing destination", () => {
    const older = item("older");
    older.text = "继续 [[同一个项目]]";
    older.revision.date = "2026-08-10";
    const recent = item("recent");
    recent.text = "继续   [[同一个项目]]";
    recent.revision.date = "2026-08-12";
    const today = item("today");
    today.date = "2026-08-13";
    today.scheduledDate = "2026-08-13";
    today.text = "继续 [[同一个项目]]";

    const groups = analyzeDailyMigrationDuplicates([older, recent], [today]);

    expect(groups).toHaveLength(1);
    expect(groups[0].sourceItems.map((entry) => entry.id)).toEqual(["older", "recent"]);
    expect(groups[0].destinationItem?.id).toBe("today");
    expect(planDailyMigrationMergeUnits([older, recent], [today], true)).toEqual([{
      items: [older, recent],
      destinationItem: today
    }]);
  });

  it("never auto-merges same-text items with different authored context or Task Pool identity", () => {
    const first = item("first");
    first.text = "Prepare launch";
    first.dueDate = "2026-08-14";
    first.dueDateExplicit = true;
    const differentDue = item("different-due");
    differentDue.text = "Prepare launch";
    differentDue.dueDate = "2026-08-15";
    differentDue.dueDateExplicit = true;
    const poolFirst = item("pool-first");
    poolFirst.text = "Prepare launch";
    poolFirst.taskRef = "pool_task";
    const poolSecond = item("pool-second");
    poolSecond.text = "Prepare launch";
    poolSecond.taskRef = "pool_task";

    expect(analyzeDailyMigrationDuplicates([first, differentDue, poolFirst, poolSecond])).toEqual([]);
    expect(planDailyMigrationMergeUnits([first, differentDue, poolFirst, poolSecond], [], true)
      .map((unit) => unit.items.map((entry) => entry.id)))
      .toEqual([["first"], ["different-due"], ["pool-first"], ["pool-second"]]);
  });

  it("materializes the nearest historical Markdown group as the destination category", () => {
    const inherited = item("inherited-project");
    inherited.lineage = {
      groups: [
        {
          id: "group-root",
          text: "其他",
          sourcePath: inherited.sourcePath,
          line: 1,
          endLine: 8,
          depth: 0,
          links: []
        },
        {
          id: "group-project",
          text: "[[Projects/Exoskeleton|项目]]",
          sourcePath: inherited.sourcePath,
          line: 2,
          endLine: 8,
          depth: 1,
          parentGroupId: "group-root",
          links: []
        }
      ],
      revision: "lineage-project"
    };

    expect(dailyMigrationDestinationCategory(inherited)).toBe("项目");
    inherited.category = "创作";
    expect(dailyMigrationDestinationCategory(inherited)).toBe("创作");
  });

  it("uses the materialized destination category when deciding exact duplicate merges", () => {
    const project = item("project-source");
    project.text = "same visible task";
    project.lineage = {
      groups: [{
        id: "group-project",
        text: "项目",
        sourcePath: project.sourcePath,
        line: 1,
        endLine: 3,
        depth: 0,
        links: []
      }],
      revision: "lineage-project"
    };
    const creation = item("creation-source");
    creation.text = project.text;
    creation.lineage = {
      groups: [{
        id: "group-creation",
        text: "创作",
        sourcePath: creation.sourcePath,
        line: 1,
        endLine: 3,
        depth: 0,
        links: []
      }],
      revision: "lineage-creation"
    };
    const todayProject = item("today-project");
    todayProject.text = project.text;
    todayProject.category = "项目";

    expect(analyzeDailyMigrationDuplicates([project, creation])).toEqual([]);
    expect(analyzeDailyMigrationDuplicates([project], [todayProject])).toHaveLength(1);
  });

  it("keeps exact duplicates separate unless the user enables consolidation", () => {
    const first = item("first-exact");
    first.text = "same";
    const second = item("second-exact");
    second.text = "same";

    expect(planDailyMigrationMergeUnits([first, second], [], false)
      .map((unit) => unit.items.map((entry) => entry.id)))
      .toEqual([["first-exact"], ["second-exact"]]);
    expect(planDailyMigrationMergeUnits([first, second], [], true)
      .map((unit) => unit.items.map((entry) => entry.id)))
      .toEqual([["first-exact", "second-exact"]]);
  });

  it("does not consolidate unfinished carry-over into a completed destination", () => {
    const source = item("unfinished-source");
    source.text = "same";
    const completed = item("completed-today", undefined, "done");
    completed.text = "same";

    expect(analyzeDailyMigrationDuplicates([source], [completed])).toEqual([]);
    expect(planDailyMigrationMergeUnits([source], [completed], true)).toEqual([{ items: [source] }]);
  });

  it("previews the exact selected migration result with merge mode on and off", () => {
    const older = item("older-preview");
    older.text = "same selected task";
    older.revision.date = "2026-08-10";
    const recent = item("recent-preview");
    recent.text = "same selected task";
    recent.revision.date = "2026-08-12";
    const today = item("today-preview");
    today.text = "same selected task";
    today.date = "2026-08-14";

    expect(buildDailyMigrationPreview([older, recent], [today], false)).toMatchObject({
      selectedCount: 2,
      destinationCount: 2,
      createCount: 2,
      mergeIntoExistingCount: 0,
      consolidatedSourceCount: 0
    });
    expect(buildDailyMigrationPreview([older, recent], [today], true)).toMatchObject({
      selectedCount: 2,
      destinationCount: 1,
      createCount: 0,
      mergeIntoExistingCount: 1,
      consolidatedSourceCount: 2
    });
  });

  it("previews duplicate sources becoming one new top task when today has no match", () => {
    const first = item("first-new-preview");
    first.text = "one future destination";
    const second = item("second-new-preview");
    second.text = "one future destination";

    expect(buildDailyMigrationPreview([first, second], [], true)).toMatchObject({
      selectedCount: 2,
      destinationCount: 1,
      createCount: 1,
      mergeIntoExistingCount: 0,
      consolidatedSourceCount: 1
    });
  });

  it("applies a stable user-defined preview order without losing units", () => {
    const first = item("first-ordered-preview");
    const second = item("second-ordered-preview");
    const third = item("third-ordered-preview");
    const units = planDailyMigrationMergeUnits([first, second, third], [], false);
    const thirdKey = dailyMigrationMergeUnitKey(units[2]);

    const ordered = orderDailyMigrationMergeUnits(units, [thirdKey, "unknown", thirdKey]);

    expect(ordered.map((unit) => unit.items[0].id)).toEqual([
      "third-ordered-preview",
      "first-ordered-preview",
      "second-ordered-preview"
    ]);
    expect(dailyMigrationMergeUnitKey(units[0]))
      .toBe(dailyMigrationMergeUnitKey(planDailyMigrationMergeUnits([first], [], false)[0]));
  });
});
