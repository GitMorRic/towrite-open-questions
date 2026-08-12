import { describe, expect, it } from "vitest";
import { projectDailyTaskAggregates } from "./aggregate";
import type { DailyPlanItem } from "./types";

describe("daily aggregate tasks", () => {
  it("keeps a checkbox parent as a task and completes it transitively", () => {
    const items = projectDailyTaskAggregates([
      item("parent", 3, "todo"),
      item("child-a", 4, "done", { parentTaskLine: 3 }),
      item("child-b", 5, "todo", { parentTaskLine: 3 })
    ]);
    expect(items[0]).toMatchObject({
      status: "todo",
      done: false,
      aggregate: { total: 2, done: 1, complete: false, dailyTasks: 2 }
    });

    const complete = projectDailyTaskAggregates([
      item("parent", 3, "todo"),
      item("child-a", 4, "done", { parentTaskLine: 3 }),
      item("child-b", 5, "done", { parentTaskLine: 3 })
    ]);
    expect(complete[0]).toMatchObject({
      status: "todo",
      done: true,
      aggregate: { total: 2, done: 2, complete: true, explicitlyComplete: false }
    });
  });

  it("counts linked-note tasks and allows an explicit parent completion", () => {
    const [parent] = projectDailyTaskAggregates(
      [item("parent", 3, "done")],
      [{ sourcePath: "Daily/2026-08-12.md", line: 3, tasks: [{ status: "todo" }, { status: "done" }] }]
    );
    expect(parent).toMatchObject({
      done: true,
      aggregate: { total: 2, done: 1, complete: false, explicitlyComplete: true, linkedTasks: 2 }
    });
  });

  it("rolls nested aggregate completion up to the root", () => {
    const items = projectDailyTaskAggregates([
      item("root", 2, "todo"),
      item("project", 3, "todo", { parentTaskLine: 2 }),
      item("leaf", 4, "done", { parentTaskLine: 3 })
    ]);
    expect(items.find((item) => item.id === "project")?.done).toBe(true);
    expect(items.find((item) => item.id === "root")?.done).toBe(true);
  });
});

function item(
  id: string,
  line: number,
  status: DailyPlanItem["status"],
  patch: Partial<DailyPlanItem> = {}
): DailyPlanItem {
  return {
    schemaVersion: 1,
    id,
    blockId: id,
    date: "2026-08-12",
    text: id,
    kind: "task",
    status,
    done: status === "done",
    sourcePath: "Daily/2026-08-12.md",
    line,
    rawLine: `- [ ] ${id}`,
    revision: { value: `rev-${id}`, sourcePath: "Daily/2026-08-12.md", blockId: id },
    scheduledDate: "2026-08-12",
    dueDate: "2026-08-12",
    devicePolicy: "none",
    tags: [],
    linkedNotes: [],
    ...patch
  };
}
