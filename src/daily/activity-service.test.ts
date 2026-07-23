import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DAILY_RAW_EVENT_RETENTION_MS,
  DailyActivityService,
  countVisibleWritingUnits
} from "./activity-service";

afterEach(() => vi.useRealTimers());

describe("DailyActivityService", () => {
  it("defers content reads until typing is quiet and coalesces one file", async () => {
    vi.useFakeTimers();
    const reads: string[] = [];
    const service = new DailyActivityService(undefined, {
      debounceMs: 500,
      now: () => new Date("2026-07-23T08:00:00"),
      createId: sequenceIds()
    });
    service.scheduleDocumentMeasurement({
      filePath: "Draft.md",
      readContent: async () => { reads.push("old"); return "旧"; }
    });
    await vi.advanceTimersByTimeAsync(300);
    service.scheduleDocumentMeasurement({
      filePath: "Draft.md",
      readContent: async () => { reads.push("latest"); return "新的文字"; }
    });

    expect(reads).toEqual([]);
    await vi.advanceTimersByTimeAsync(499);
    expect(reads).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(reads).toEqual(["latest"]);
    expect(service.getAggregate("2026-07-23")).toMatchObject({
      notesModified: 1,
      positiveWritingUnits: 0,
      trackingComplete: false
    });
  });

  it("counts visible CJK characters and non-CJK words without Markdown metadata", () => {
    expect(countVisibleWritingUnits(`---
tags: [secret]
---
# 标题

你好，world again.

- [ ] [[项目|继续写作]] ⏳ 2026-07-23 📅 2026-07-23 [towrite-kind:: task] ^daily_test
`)).toBe(10);
  });

  it("tracks positive and net deltas, new notes, and distinct modified notes", async () => {
    const service = new DailyActivityService(undefined, {
      debounceMs: 0,
      now: () => new Date("2026-07-23T08:00:00"),
      createId: sequenceIds()
    });
    service.scheduleDocumentMeasurement({
      filePath: "New.md",
      reason: "created",
      readContent: async () => "你好 world"
    });
    await service.flushMeasurements();
    service.scheduleDocumentMeasurement({
      filePath: "New.md",
      readContent: async () => "你好世界 world test"
    });
    await service.flushMeasurements();
    service.scheduleDocumentMeasurement({
      filePath: "New.md",
      readContent: async () => "你好 world"
    });
    await service.flushMeasurements();

    expect(service.getAggregate("2026-07-23")).toMatchObject({
      positiveWritingUnits: 6,
      netWritingUnits: 3,
      notesCreated: 1,
      notesModified: 1
    });
  });

  it("deduplicates explicit completions, exports readable data, purges raw events, and clears truth", () => {
    const now = new Date("2026-07-23T08:00:00");
    const service = new DailyActivityService(undefined, { now: () => now, createId: sequenceIds() });
    service.recordTaskCompleted("daily_a", now, "transition_a");
    // UI, Markdown watcher, NFC, or ESP32 may carry different transport event
    // ids for the same task transition; the daily aggregate remains semantic.
    service.recordTaskCompleted("daily_a", now, "transition_from_another_surface");
    service.recordCaptureCommitted("capture_a", now);

    expect(service.getAggregate("2026-07-23")).toMatchObject({ tasksCompleted: 1, capturesCommitted: 1 });
    const bundle = service.exportBundle(now);
    expect(bundle.eventsJsonl.split("\n")).toHaveLength(2);
    expect(JSON.parse(bundle.aggregatesJson).days["2026-07-23"]).not.toHaveProperty("modifiedFileKeys");

    const removed = service.purge(new Date(now.getTime() + DAILY_RAW_EVENT_RETENTION_MS + 1));
    expect(removed).toBe(2);
    expect(service.getAggregate("2026-07-23")).toMatchObject({ tasksCompleted: 1, capturesCommitted: 1 });
    service.clearActivityData({ now });
    expect(service.getState()).toMatchObject({ events: [], aggregates: {}, fileBaselines: {} });
  });

  it("honors configured raw-event retention without deleting daily aggregates", () => {
    const started = new Date("2026-07-01T08:00:00");
    const service = new DailyActivityService(undefined, {
      now: () => started,
      retentionDays: 7,
      createId: sequenceIds()
    });
    service.recordTaskCompleted("daily_old", started, "old_event");

    expect(service.purge(new Date("2026-07-09T08:00:00"))).toBe(1);
    expect(service.getState().events).toEqual([]);
    expect(service.getAggregate("2026-07-01").tasksCompleted).toBe(1);
  });

  it("preserves numeric baselines across rename and removes them on delete", async () => {
    const service = new DailyActivityService(undefined, {
      debounceMs: 0,
      now: () => new Date("2026-07-23T08:00:00"),
      createId: sequenceIds()
    });
    service.scheduleDocumentMeasurement({
      filePath: "Draft.md",
      reason: "created",
      readContent: async () => "你好"
    });
    await service.flushMeasurements();

    expect(service.renameDocumentBaseline("Draft.md", "Archive/Draft.md")).toBe(true);
    service.scheduleDocumentMeasurement({
      filePath: "Archive/Draft.md",
      readContent: async () => "你好啊"
    });
    await service.flushMeasurements();
    expect(service.getAggregate("2026-07-23").positiveWritingUnits).toBe(3);
    expect(service.removeDocumentBaseline("Archive/Draft.md")).toBe(true);
    expect(service.removeDocumentBaseline("Archive/Draft.md")).toBe(false);
  });

  it("strips accidental content fields when normalizing persisted state", () => {
    const service = new DailyActivityService({
      trackingStartedAt: "2026-07-23T00:00:00.000Z",
      events: [{
        id: "event_1",
        kind: "task-completed",
        at: "2026-07-23T01:00:00.000Z",
        localDate: "2026-07-23",
        timezoneOffsetMinutes: 480,
        taskId: "daily_a",
        body: "SECRET",
        selection: "SECRET"
      }]
    }, { now: () => new Date("2026-07-23T08:00:00") });

    expect(JSON.stringify(service.getState())).not.toContain("SECRET");
  });
});

function sequenceIds(): () => string {
  let index = 0;
  return () => `dayevt_${++index}`;
}
