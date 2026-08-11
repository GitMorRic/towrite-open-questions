import { describe, expect, it } from "vitest";
import { DailyTransitionJournal } from "./transition-journal";
import type { DailyAnalyticsDay } from "./types";

describe("DailyTransitionJournal", () => {
  it("appends idempotently and aggregates migration, return and abandon transitions", async () => {
    let jsonl = "";
    const journal = await DailyTransitionJournal.load({
      readJsonl: async () => jsonl,
      appendJsonl: async (value) => { jsonl += value; }
    });
    const base = {
      schemaVersion: 1 as const,
      eventId: "jrn_one",
      taskId: "daily_one",
      kind: "migrate" as const,
      at: "2026-08-11T09:00:00.000Z",
      localDate: "2026-08-11",
      sourceDate: "2026-08-10",
      destinationDate: "2026-08-11",
      title: "Write the release notes",
      category: "Writing"
    };
    expect(await journal.append(base)).toBe(true);
    expect(await journal.append(base)).toBe(false);
    await journal.append({ ...base, eventId: "jrn_return", kind: "return" });
    await journal.append({ ...base, eventId: "jrn_abandon", kind: "abandon" });

    const day = journal.day("2026-08-11", analyticsDay());
    expect(day.migratedIn).toBe(1);
    expect(day.migratedOut).toBe(0);
    expect(day.returned).toBe(1);
    expect(day.abandoned).toBe(1);
    expect(day.transitions).toHaveLength(3);
    expect(jsonl.trim().split("\n")).toHaveLength(3);
  });

  it("builds a natural-month summary without double-counting events", async () => {
    const journal = await DailyTransitionJournal.load({
      readJsonl: async () => "",
      appendJsonl: async () => undefined
    });
    await journal.append({
      schemaVersion: 1,
      eventId: "jrn_complete",
      taskId: "daily_one",
      kind: "complete",
      at: "2026-08-11T09:00:00.000Z",
      localDate: "2026-08-11",
      title: "One"
    });
    const month = journal.month("2026-08", [analyticsDay()], []);
    expect(month.totals.planned).toBe(3);
    expect(month.totals.completed).toBe(2);
    expect(month.totals.completionRate).toBeCloseTo(2 / 3);
    expect(month.days[0].transitions).toHaveLength(1);
  });
});

function analyticsDay(): DailyAnalyticsDay {
  return {
    date: "2026-08-11",
    planned: 3,
    completed: 2,
    completionRate: 2 / 3,
    activeMs: 30 * 60_000,
    wallMs: 45 * 60_000,
    pausedMs: 15 * 60_000,
    interruptions: 1,
    positiveWritingUnits: 0,
    netWritingUnits: 0,
    notesCreated: 0,
    notesModified: 0,
    trackingComplete: true,
    needsReview: false
  };
}
