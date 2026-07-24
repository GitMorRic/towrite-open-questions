import { describe, expect, it } from "vitest";
import { JsonDailyTimerTransitionJournal } from "./task-timer-journal";
import { DAILY_TIMER_SCHEMA_VERSION, type DailyTimerTransitionJournalEntry } from "./task-timer-types";

describe("JsonDailyTimerTransitionJournal", () => {
  it("persists a content-free readable transaction and removes it after reconciliation", async () => {
    let text = "";
    const journal = new JsonDailyTimerTransitionJournal({
      readText: async () => text,
      writeText: async (value) => {
        text = value;
      }
    });
    const entry: DailyTimerTransitionJournalEntry = {
      schemaVersion: DAILY_TIMER_SCHEMA_VERSION,
      transactionId: "txn_test",
      createdAt: "2026-07-24T08:00:00+08:00",
      updatedAt: "2026-07-24T08:00:00+08:00",
      phase: "prepared",
      expectedMarkdownRevisions: {
        "daily_test\u00002026-07-24": "task_revision\u0000lineage_revision"
      },
      expectedAfterMarkdownRevisions: {
        "daily_test\u00002026-07-24": "predicted_task_revision\u0000lineage_revision"
      },
      appliedMarkdownRevisions: {
        "daily_test\u00002026-07-24": "after_task_revision\u0000lineage_revision"
      },
      events: [{
        schemaVersion: DAILY_TIMER_SCHEMA_VERSION,
        eventId: "evt_test",
        taskId: "daily_test",
        sessionId: "ses_test",
        kind: "start",
        at: "2026-07-24T08:00:00+08:00",
        source: "obsidian"
      }]
    };

    await journal.put(entry);
    expect(await journal.list()).toEqual([entry]);
    expect(text).not.toContain("task body");
    expect(text).not.toContain(".md");

    await journal.remove("txn_test");
    expect(await journal.list()).toEqual([]);
  });
});
