import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../core/settings";
import { migrateManualPushHabits } from "./push-migration";
import { HabitLearningService } from "./habit-learning";

describe("legacy manual Push habit migration", () => {
  it("imports enabled saved rules as accepted manual habits without duplicates", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      push: {
        ...DEFAULT_SETTINGS.push,
        habits: [
          { ...DEFAULT_SETTINGS.push.habits[0], id: "legacy", label: "Legacy", stageIds: ["raw", "sparks"] },
          { ...DEFAULT_SETTINGS.push.habits[1], id: "disabled", enabled: false }
        ]
      }
    };
    const now = new Date("2026-07-12T03:00:00.000Z");
    const first = migrateManualPushHabits(undefined, settings, true, now)!;
    const second = migrateManualPushHabits(first, settings, true, now)!;

    expect(first.habits).toHaveLength(2);
    expect(first.habits.every((habit) => habit.status === "accepted" && habit.origin === "manual")).toBe(true);
    expect(first.habits.map((habit) => habit.rule.kind === "time-stage" ? habit.rule.workflowStageId : ""))
      .toEqual(["raw", "sparks"]);
    expect(second.habits).toHaveLength(2);

    const service = new HabitLearningService(second);
    service.clearLearningData({ preserveManualHabits: true });
    expect(service.getState().habits).toHaveLength(2);
    expect(service.getState().events).toEqual([]);
  });

  it("does not import built-in defaults for a fresh install", () => {
    expect(migrateManualPushHabits(undefined, DEFAULT_SETTINGS, false)).toBeUndefined();
  });
});
