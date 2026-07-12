import { shortHash } from "../core/hash";
import type { ToWriteSettings } from "../core/settings";
import type { HabitLearningState } from "./types";

/** Keeps enabled legacy manual Push rules explicit and confirmed during upgrade. */
export function migrateManualPushHabits(
  state: HabitLearningState | undefined,
  settings: Pick<ToWriteSettings, "language" | "learning" | "push">,
  migrateSavedPushHabits: boolean,
  now = new Date()
): HabitLearningState | undefined {
  if (!migrateSavedPushHabits) {
    return state;
  }
  const migrated: HabitLearningState = state ? {
    ...state,
    events: [...state.events],
    habits: [...state.habits]
  } : {
    schemaVersion: 1,
    collectionPaused: !settings.learning.enabled,
    events: [],
    habits: []
  };
  const existingIds = new Set(migrated.habits.map((habit) => habit.id));
  const timestamp = now.toISOString();
  for (const rule of settings.push.habits) {
    if (!rule.enabled) {
      continue;
    }
    const stageIds: Array<string | undefined> = rule.stageIds.length > 0 ? rule.stageIds : [undefined];
    for (const stageId of stageIds) {
      const id = `habit_manual_push_${shortHash(`${rule.id}:${stageId ?? "all"}`)}`;
      if (existingIds.has(id)) {
        continue;
      }
      const label = stageId && rule.stageIds.length > 1 ? `${rule.label} · ${stageId}` : rule.label;
      migrated.habits.push({
        id,
        fingerprint: `manual-push:${rule.id}:${stageId ?? "all"}`,
        label,
        description: settings.language === "zh"
          ? `从旧版 Push 手工规则“${rule.label}”迁移；保持为已确认规则。`
          : `Migrated from the legacy manual Push rule “${rule.label}” and kept confirmed.`,
        rule: {
          kind: "time-stage",
          timeWindow: {
            startHour: hourFromPushTime(rule.timeStart, 0),
            endHour: hourFromPushTime(rule.timeEnd, 24)
          },
          workflowStageId: stageId
        },
        evidence: {
          sampleSize: 1,
          matchingSamples: 1,
          distinctDays: 1,
          ratio: 1,
          firstSeenAt: timestamp,
          lastSeenAt: timestamp
        },
        status: "accepted",
        origin: "manual",
        createdAt: timestamp,
        updatedAt: timestamp,
        lastDetectedAt: timestamp,
        acceptedAt: timestamp
      });
      existingIds.add(id);
    }
  }
  return migrated;
}

function hourFromPushTime(value: string, fallback: number): number {
  const match = /^(\d{1,2})(?::\d{2})?$/u.exec(value.trim());
  if (!match) {
    return fallback;
  }
  const hour = Number(match[1]);
  return Number.isFinite(hour) ? Math.min(24, Math.max(0, hour)) : fallback;
}
