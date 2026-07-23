import { describe, expect, it } from "vitest";
import {
  adaptDailyPlanItemForDevice,
  adaptDailySummaryForDevice
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
});
