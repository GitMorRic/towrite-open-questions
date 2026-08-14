import { describe, expect, it } from "vitest";
import type { DailyPlanGroup } from "../daily/types";
import type { DailyDashboardSnapshot } from "./daily-dashboard-types";
import {
  dailyDateForPlanningDay,
  dailyDueDateForShortcut,
  dailyCategories,
  dailyGroupLabel,
  dailyItemCategory,
  dailyItemDepth,
  filterDailyItemsByCategory,
  buildDailyCalendar,
  dailySnapshotFingerprint,
  filterAvailableTaskPoolItems,
  groupDailyItems,
  groupDailyMigrationPreviewUnits,
  groupPreviousDailyItems,
  isDailySummaryCurrent,
  selectDailyOverview
} from "./daily-dashboard-state";

describe("Daily dashboard summary basis", () => {
  it("is stable for equivalent snapshots and changes with task or activity data", () => {
    const first = snapshot();
    const clone = structuredClone(first);
    expect(dailySnapshotFingerprint(clone)).toBe(dailySnapshotFingerprint(first));

    clone.plan.items[0].text = "Changed task";
    expect(dailySnapshotFingerprint(clone)).not.toBe(dailySnapshotFingerprint(first));

    const activityChanged = structuredClone(first);
    activityChanged.activity.netWritingUnits += 1;
    expect(dailySnapshotFingerprint(activityChanged)).not.toBe(dailySnapshotFingerprint(first));
  });

  it("rejects a summary after date, metrics, or snapshot revision changes", () => {
    const basis = snapshot();
    const fingerprint = dailySnapshotFingerprint(basis);
    expect(isDailySummaryCurrent(basis.summary, fingerprint, basis)).toBe(true);

    const nextDate = structuredClone(basis);
    nextDate.date = "2026-07-24";
    nextDate.summary.date = "2026-07-24";
    expect(isDailySummaryCurrent(basis.summary, fingerprint, nextDate)).toBe(false);

    const nextRevision = structuredClone(basis);
    nextRevision.plan.items[0].revision.value = "rev_2";
    expect(isDailySummaryCurrent(basis.summary, fingerprint, nextRevision)).toBe(false);

    const wrongMetrics = structuredClone(basis.summary);
    wrongMetrics.metrics.completed += 1;
    expect(isDailySummaryCurrent(wrongMetrics, fingerprint, basis)).toBe(false);
  });

  it("uses the local calendar for today and tomorrow", () => {
    const lateLocalTime = new Date(2026, 6, 23, 23, 58);
    expect(dailyDateForPlanningDay("today", lateLocalTime)).toBe("2026-07-23");
    expect(dailyDateForPlanningDay("tomorrow", lateLocalTime)).toBe("2026-07-24");
  });

  it("offers only unassigned pool tasks and filters by text, category, project, or target", () => {
    const base = {
      schemaVersion: 1 as const,
      sourcePath: "Planning/Task Pool.md",
      line: 1,
      endLine: 1,
      rawLine: "",
      rawBlock: "",
      revision: {
        value: "tpr_test",
        sourcePath: "Planning/Task Pool.md",
        taskId: ""
      },
      unknownLines: []
    };
    const pool = [
      {
        ...base,
        id: `task_${"a".repeat(32)}`,
        taskId: `task_${"a".repeat(32)}`,
        text: "写发布说明",
        category: "写作",
        state: "pool" as const
      },
      {
        ...base,
        id: `task_${"b".repeat(32)}`,
        taskId: `task_${"b".repeat(32)}`,
        text: "继续 Echo",
        project: "创作工具",
        state: "returned" as const
      },
      {
        ...base,
        id: `task_${"c".repeat(32)}`,
        taskId: `task_${"c".repeat(32)}`,
        text: "已经安排",
        state: "planned" as const
      }
    ];

    expect(filterAvailableTaskPoolItems(pool).map((item) => item.text))
      .toEqual(["写发布说明", "继续 Echo"]);
    expect(filterAvailableTaskPoolItems(pool, "写作").map((item) => item.text))
      .toEqual(["写发布说明"]);
    expect(filterAvailableTaskPoolItems(pool, "创作工具").map((item) => item.text))
      .toEqual(["继续 Echo"]);
  });

  it("keeps one current task and only two upcoming tasks while counting all", () => {
    const basis = snapshot();
    basis.plan.items = [
      item("daily_first", "todo", { primary: true }),
      item("daily_running", "in-progress"),
      item("daily_next", "todo"),
      item("daily_later", "todo"),
      item("daily_done", "done")
    ];

    const overview = selectDailyOverview(basis.plan.items);
    expect(overview.current?.id).toBe("daily_running");
    expect(overview.upcoming.map((candidate) => candidate.id)).toEqual([
      "daily_first",
      "daily_next"
    ]);
    expect(overview.done).toBe(1);
    expect(overview.total).toBe(5);
  });

  it("uses the primary item, then Markdown order, when nothing is running", () => {
    const primary = selectDailyOverview([
      item("daily_first", "todo"),
      item("daily_primary", "todo", { primary: true })
    ]);
    const first = selectDailyOverview([
      item("daily_first", "todo"),
      item("daily_second", "todo")
    ]);

    expect(primary.current?.id).toBe("daily_primary");
    expect(first.current?.id).toBe("daily_first");
  });

  it("derives categories and depth while allowing explicit presentation fields", () => {
    const grouped = item("grouped", "todo", {
      lineage: {
        groups: [{
          id: "group_a",
          text: "[[Project Note|项目]]",
          sourcePath: "Daily/2026-07-23.md",
          line: 1,
          endLine: 2,
          depth: 0,
          links: []
        }],
        revision: "lineage_1"
      }
    });
    const explicit = {
      ...item("explicit", "todo"),
      category: "写作与发布",
      depth: 2
    };

    expect(dailyItemCategory(grouped)).toBe("项目");
    expect(dailyItemCategory(explicit)).toBe("写作与发布");
    expect(dailyItemDepth(explicit)).toBe(2);
    expect(dailyCategories([grouped, explicit])).toEqual(["项目", "写作与发布"]);
    expect(filterDailyItemsByCategory([grouped, explicit], "项目")).toEqual([grouped]);
  });

  it("projects explicit categories and Markdown lineage without losing source row order", () => {
    const projectGroup = group("group_project", "[[Project Note|Project]]", 2, 12, 0);
    const launchGroup = group("group_launch", "[[Launch Plan|Launch]]", 4, 10, 1, "group_project");
    const fullMarkdownOrder = [
      item("explicit", "todo", {
        category: "Editorial",
        lineage: {
          groups: [projectGroup, launchGroup],
          revision: "lineage_explicit"
        }
      }),
      item("launch_first", "todo", {
        lineage: {
          groups: [projectGroup, launchGroup],
          revision: "lineage_launch_first"
        }
      }),
      item("project_task", "todo", {
        lineage: {
          groups: [projectGroup],
          revision: "lineage_project"
        }
      }),
      item("launch_second", "todo", {
        lineage: {
          groups: [projectGroup, launchGroup],
          revision: "lineage_launch_second"
        }
      }),
      item("ungrouped", "todo")
    ];

    expect(dailyGroupLabel(projectGroup)).toBe("Project");
    expect(dailyGroupLabel(launchGroup)).toBe("Launch");

    const projected = groupDailyItems(
      fullMarkdownOrder,
      { groups: [projectGroup, launchGroup] },
      fullMarkdownOrder
    );
    expect(projected.map((bucket) => [bucket.key, bucket.label, bucket.path])).toEqual([
      ["category:Editorial", "Editorial", "Project / Launch"],
      ["group_launch", "Launch", "Project / Launch"],
      ["group_project", "Project", undefined],
      ["__ungrouped", dailyItemCategory(fullMarkdownOrder[4]), undefined]
    ]);
    expect(projected.map((bucket) =>
      bucket.items.map(({ item: projectedItem, index }) => [projectedItem.id, index])
    )).toEqual([
      [["explicit", 0]],
      [["launch_first", 1], ["launch_second", 3]],
      [["project_task", 2]],
      [["ungrouped", 4]]
    ]);

    const filtered = filterDailyItemsByCategory(fullMarkdownOrder, "Launch");
    const filteredProjection = groupDailyItems(
      filtered,
      { groups: [projectGroup, launchGroup] },
      fullMarkdownOrder
    );
    expect(filtered.map((candidate) => candidate.id)).toEqual([
      "launch_first",
      "launch_second"
    ]);
    expect(filteredProjection).toHaveLength(1);
    expect(filteredProjection[0].items.map(({ item: projectedItem, index }) => [
      projectedItem.id,
      index
    ])).toEqual([
      ["launch_first", 1],
      ["launch_second", 3]
    ]);
  });

  it("provides local date shortcuts and a stable calendar projection", () => {
    const monday = new Date(2026, 6, 27, 9, 30);
    expect(dailyDueDateForShortcut("today", monday)).toBe("2026-07-27");
    expect(dailyDueDateForShortcut("tomorrow", monday)).toBe("2026-07-28");
    expect(dailyDueDateForShortcut("friday", monday)).toBe("2026-07-31");
    expect(dailyDueDateForShortcut("next-week", monday)).toBe("2026-08-03");
    expect(dailyDueDateForShortcut("clear", monday)).toBe("");

    const due = item("due", "todo", { dueDate: "2026-07-30" });
    const fallback = item("fallback", "todo", { dueDate: "" });
    expect(buildDailyCalendar([fallback, due], "2026-07-27").map((entry) => [
      entry.date,
      entry.items.map((candidate) => candidate.id)
    ])).toEqual([
      ["2026-07-27", ["fallback"]],
      ["2026-07-30", ["due"]]
    ]);
  });

  it("groups earlier unfinished work by date and authored project", () => {
    const projectGroup = group("group_project", "Project Alpha", 1, 8, 0);
    const editorial = item("editorial", "todo", {
      date: "2026-08-10",
      revision: { value: "rev_editorial", sourcePath: "Daily/2026-08-10.md", blockId: "editorial", date: "2026-08-10" },
      category: "Writing"
    });
    const inherited = item("inherited", "todo", {
      date: "2026-08-10",
      revision: { value: "rev_inherited", sourcePath: "Daily/2026-08-10.md", blockId: "inherited", date: "2026-08-10" },
      lineage: { groups: [projectGroup], revision: "lineage_inherited" }
    });
    const recent = item("recent", "todo", {
      date: "2026-08-11",
      revision: { value: "rev_recent", sourcePath: "Daily/2026-08-11.md", blockId: "recent", date: "2026-08-11" },
      category: "Project Beta"
    });

    const grouped = groupPreviousDailyItems([editorial, inherited, recent]);
    expect(grouped.map(({ date, count }) => [date, count])).toEqual([
      ["2026-08-11", 1],
      ["2026-08-10", 2]
    ]);
    expect(grouped[1].projects.map(({ label, items }) => [label, items.map(({ id }) => id)])).toEqual([
      ["Writing", ["editorial"]],
      ["Project Alpha", ["inherited"]]
    ]);
  });

  it("projects migration results into the same category tree as the final Today list", () => {
    const projectGroup = group("group_project", "项目", 1, 8, 0);
    const selectedProject = item("project_source", "todo", {
      date: "2026-08-10",
      revision: { value: "rev_project", sourcePath: "Daily/2026-08-10.md", blockId: "project_source", date: "2026-08-10" },
      lineage: { groups: [projectGroup], revision: "lineage_project" }
    });
    const selectedCreation = item("creation_source", "todo", {
      date: "2026-08-09",
      revision: { value: "rev_creation", sourcePath: "Daily/2026-08-09.md", blockId: "creation_source", date: "2026-08-09" },
      category: "创作"
    });
    const todayCreation = item("creation_today", "todo", {
      date: "2026-08-14",
      revision: { value: "rev_today", sourcePath: "Daily/2026-08-14.md", blockId: "creation_today", date: "2026-08-14" },
      category: "创作"
    });

    const grouped = groupDailyMigrationPreviewUnits([
      { items: [selectedProject] },
      { items: [selectedCreation] },
      { items: [item("duplicate_source", "todo")], destinationItem: todayCreation }
    ]);

    expect(grouped.map(({ key, label, units }) => [
      key,
      label,
      units.map((unit) => (unit.destinationItem ?? unit.items[0]).id)
    ])).toEqual([
      ["group_project", "项目", ["project_source"]],
      ["category:创作", "创作", ["creation_source", "creation_today"]]
    ]);
  });
});

function item(
  id: string,
  status: DailyDashboardSnapshot["plan"]["items"][number]["status"],
  patch: Partial<DailyDashboardSnapshot["plan"]["items"][number]> = {}
): DailyDashboardSnapshot["plan"]["items"][number] {
  return {
    ...snapshot().plan.items[0],
    id,
    blockId: id,
    text: id,
    status,
    done: status === "done",
    revision: {
      value: `rev_${id}`,
      sourcePath: "Daily/2026-07-23.md",
      blockId: id
    },
    ...patch
  };
}

function group(
  id: string,
  text: string,
  line: number,
  endLine: number,
  depth: number,
  parentGroupId?: string
): DailyPlanGroup {
  return {
    id,
    text,
    sourcePath: "Daily/2026-07-23.md",
    line,
    endLine,
    depth,
    parentGroupId,
    links: []
  };
}

function snapshot(): DailyDashboardSnapshot {
  return {
    schemaVersion: 1,
    date: "2026-07-23",
    plan: {
      items: [{
        schemaVersion: 1,
        id: "daily_test123",
        blockId: "daily_test123",
        date: "2026-07-23",
        text: "Continue [[Draft]]",
        kind: "edit_note",
        status: "todo",
        done: false,
        sourcePath: "Daily/2026-07-23.md",
        line: 3,
        rawLine: "- [ ] Continue [[Draft]] ^daily_test123",
        revision: {
          value: "rev_1",
          sourcePath: "Daily/2026-07-23.md",
          blockId: "daily_test123"
        },
        scheduledDate: "2026-07-23",
        dueDate: "2026-07-23",
        devicePolicy: "manual",
        priority: "normal",
        tags: ["today"],
        linkedNotes: ["Draft"]
      }],
      total: 1,
      todo: 1,
      inProgress: 0,
      done: 0
    },
    activity: {
      date: "2026-07-23",
      positiveWritingUnits: 12,
      netWritingUnits: 10,
      notesCreated: 1,
      notesModified: 2,
      tasksCompleted: 0,
      questionsResolved: 0,
      capturesCommitted: 1,
      cardsSelected: 1,
      cardsDisplayed: 1,
      trackingComplete: true
    },
    summary: {
      schemaVersion: 1,
      date: "2026-07-23",
      generatedAt: "2026-07-23T08:00:00.000Z",
      headline: "Today",
      lines: ["One task remains"],
      markdown: "## Daily Summary\n\nOne task remains",
      metrics: {
        planned: 1,
        completed: 0,
        remaining: 1,
        positiveWritingUnits: 12,
        netWritingUnits: 10,
        notesCreated: 1,
        notesModified: 2
      }
    },
    trackingStartedAt: "2026-07-23T00:00:00.000Z"
  };
}
