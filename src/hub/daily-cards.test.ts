import { describe, expect, it } from "vitest";
import {
  adaptDailyPlanItemForDevice,
  adaptDailySummaryForDevice,
  buildDailyDeckSnapshot
} from "./daily-cards";

describe("Daily device card adapters", () => {
  it("builds an open plan item with a local conflict revision and complete action", () => {
    const adapted = adaptDailyPlanItemForDevice({
      id: "daily_abc",
      kind: "edit_note",
      status: "open",
      devicePolicy: "scheduled",
      taskRevision: "taskrev_123",
      display: {
        title: "今日计划",
        body: "补充关于创作",
        prompt: "10:30 提醒"
      },
      availableAt: "2026-07-23T10:30:00.000Z"
    });

    expect(adapted).toMatchObject({
      localId: "daily-plan:daily_abc",
      taskRevision: "taskrev_123",
      pagingItem: {
        id: "daily_abc",
        contentType: "daily_plan_item",
        devicePolicy: "scheduled",
        status: "open"
      },
      candidate: {
        localId: "daily-plan:daily_abc",
        type: "daily_plan_item",
        allowedActions: ["capture", "complete", "later"],
        reasonCode: "daily_scheduled",
        score: 0.95,
        availableAt: "2026-07-23T10:30:00.000Z",
        writeTargetLocalId: "daily_abc"
      }
    });
  });

  it("keeps finished and disabled tasks out of candidate delivery", () => {
    for (const patch of [
      { status: "done", devicePolicy: "rotation" as const },
      { status: "skipped", devicePolicy: "agent" as const },
      { status: "open", devicePolicy: "none" as const }
    ]) {
      const adapted = adaptDailyPlanItemForDevice({
        id: `daily_${patch.status}_${patch.devicePolicy}`,
        kind: "task",
        taskRevision: "taskrev_123",
        display: { body: "Task" },
        ...patch
      });
      expect(adapted.candidate).toBeUndefined();
    }
  });

  it("adapts a Daily summary without exposing a complete action", () => {
    const adapted = adaptDailySummaryForDevice({
      id: "2026-07-23",
      devicePolicy: "rotation",
      display: {
        title: "今日总结",
        body: "完成 3 项 · 新增 420 字"
      },
      allowedActions: ["complete"]
    });

    expect(adapted.localId).toBe("daily-summary:2026-07-23");
    expect(adapted.candidate).toMatchObject({
      type: "daily_summary",
      allowedActions: ["open", "capture", "later"],
      reasonCode: "daily_summary_rotation"
    });
  });

  it("keeps Daily summaries out of delivery until a policy explicitly allows them", () => {
    const disabled = adaptDailySummaryForDevice({
      id: "2026-07-23",
      devicePolicy: "none",
      display: { body: "今天完成了 2 项" }
    });
    const manual = adaptDailySummaryForDevice({
      id: "2026-07-23",
      devicePolicy: "manual",
      display: { body: "今天完成了 2 项" }
    });

    expect(disabled.candidate).toBeUndefined();
    expect(manual.candidate).toMatchObject({
      localId: "daily-summary:2026-07-23",
      type: "daily_summary",
      score: 1
    });
  });

  it("requires stable local identifiers and task revisions", () => {
    expect(() => adaptDailyPlanItemForDevice({
      id: "",
      kind: "task",
      status: "open",
      devicePolicy: "manual",
      taskRevision: "taskrev",
      display: { body: "Task" }
    })).toThrow(/stable identifier/u);
    expect(() => adaptDailyPlanItemForDevice({
      id: "daily_ok",
      kind: "task",
      status: "open",
      devicePolicy: "manual",
      taskRevision: "",
      display: { body: "Task" }
    })).toThrow(/revision/u);
  });

  it("builds overview, every task page, and reminder inbox in stable order", () => {
    const deck = buildDailyDeckSnapshot({
      date: "2026-07-24",
      theme: "推进 Echo MVP",
      items: [
        task("daily_first", "写出 MVP 实验方案", {
          primary: true,
          projectId: "echo",
          projectLabel: "Echo",
          projectColor: "#7c6ee6",
          goal: "判断常驻屏幕是否有效",
          nextStep: "列出 A/B 指标",
          estimateMinutes: 15
        }),
        task("daily_current", "完成问题帖初稿", {
          status: "in-progress",
          projectId: "echo",
          projectLabel: "Echo",
          nextStep: "先写三个小标题",
          startedAt: "2026-07-24T01:00:00.000Z"
        }),
        task("daily_next", "联系 2 位测试用户", { minimum: true }),
        task("daily_later", "整理访谈记录"),
        task("daily_done", "准备设备", {
          status: "done",
          projectId: "hardware",
          projectLabel: "硬件"
        })
      ],
      inboxItems: [{
        id: "reminder_1",
        source: "rule",
        title: "也许现在适合整理访谈",
        reason: "下午的已确认习惯"
      }],
      batteryPercent: 76
    });

    expect(deck.currentItemId).toBe("daily_current");
    expect(deck.overview).toMatchObject({
      page: "daily_overview",
      localId: "daily-overview:2026-07-24",
      cardId: "daily-overview:2026-07-24",
      theme: "推进 Echo MVP",
      current: {
        id: "daily_current",
        text: "完成问题帖初稿",
        nextStep: "先写三个小标题"
      },
      progress: { done: 1, total: 5 },
      batteryPercent: 76
    });
    expect(deck.overview.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "echo", label: "Echo", done: 0, total: 2 }),
      expect.objectContaining({ id: "hardware", label: "硬件", done: 1, total: 1 })
    ]));
    expect(deck.overview.upcoming.map((item) => item.id)).toEqual([
      "daily_first",
      "daily_next"
    ]);
    expect(deck.planItems).toHaveLength(5);
    expect(deck.activePlanItem?.item.id).toBe("daily_current");
    expect(deck.planItems[1]).toMatchObject({
      page: "daily_plan_item",
      localId: "daily-plan:daily_current",
      cardId: "daily-plan:daily_current",
      position: 2,
      total: 5,
      item: {
        id: "daily_current",
        taskRevision: "rev_daily_current",
        startedAt: "2026-07-24T01:00:00.000Z"
      }
    });
    expect(deck.result.completed.map((item) => item.id)).toEqual(["daily_done"]);
    expect(deck.result.localId).toBe("daily-result:2026-07-24");
    expect(deck.result.remaining.map((item) => item.id)).toEqual([
      "daily_first",
      "daily_current",
      "daily_next",
      "daily_later"
    ]);
    expect(deck.pageOrder).toEqual([
      "daily_overview",
      "daily_plan_item",
      "daily_inbox"
    ]);
    expect(deck.activeInboxItem).toMatchObject({
      page: "daily_inbox",
      position: 1,
      total: 1,
      item: { id: "reminder_1", source: "rule", aiGenerated: false }
    });
    expect(deck.cards.map((card) => card.page)).toEqual([
      "daily_overview",
      "daily_plan_item",
      "daily_plan_item",
      "daily_plan_item",
      "daily_plan_item",
      "daily_plan_item",
      "daily_inbox"
    ]);
  });

  it("falls back from primary to the first unfinished item and counts all tasks", () => {
    const primary = buildDailyDeckSnapshot({
      date: "2026-07-24",
      items: [
        task("daily_done", "Done", { status: "done", primary: true }),
        task("daily_normal", "Normal"),
        task("daily_primary", "Primary", { primary: true })
      ]
    });
    const first = buildDailyDeckSnapshot({
      date: "2026-07-24",
      items: [
        task("daily_done", "Done", { status: "done" }),
        task("daily_normal", "Normal"),
        task("daily_other", "Other")
      ]
    });

    expect(primary.currentItemId).toBe("daily_primary");
    expect(first.currentItemId).toBe("daily_normal");
    expect(first.overview.progress).toEqual({ done: 1, total: 3 });
    expect(first.overview.upcoming.map((item) => item.id)).toEqual(["daily_other"]);
  });

  it("normalizes optional display metadata and rejects malformed deck identity", () => {
    const deck = buildDailyDeckSnapshot({
      date: "2026-07-24",
      theme: "  Echo   MVP  ",
      items: [task("daily_clean", "  Write   now  ", {
        estimateMinutes: 12.6,
        startedAt: "not-a-date"
      })]
    });

    expect(deck.theme).toBe("Echo MVP");
    expect(deck.planItems[0].item).toMatchObject({
      text: "Write now",
      estimateMinutes: 13,
      startedAt: undefined
    });
    expect(() => buildDailyDeckSnapshot({
      date: "07/24/2026",
      items: []
    })).toThrow(/YYYY-MM-DD/u);
    expect(() => buildDailyDeckSnapshot({
      date: "2026-07-24",
      items: [task("", "Missing id")]
    })).toThrow(/stable identifier/u);
    expect(() => buildDailyDeckSnapshot({
      date: "2026-07-24",
      items: [
        task("daily_same", "First"),
        task("daily_same", "Second")
      ]
    })).toThrow(/unique/u);
  });
});

function task(
  id: string,
  text: string,
  patch: Partial<Parameters<typeof buildDailyDeckSnapshot>[0]["items"][number]> = {}
): Parameters<typeof buildDailyDeckSnapshot>[0]["items"][number] {
  return {
    id,
    text,
    kind: "task",
    status: "todo",
    taskRevision: `rev_${id || "missing"}`,
    ...patch
  };
}
