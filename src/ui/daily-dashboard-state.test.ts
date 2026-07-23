import { describe, expect, it } from "vitest";
import type { DailyDashboardSnapshot } from "./daily-dashboard-types";
import {
  dailySnapshotFingerprint,
  isDailySummaryCurrent
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
});

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
