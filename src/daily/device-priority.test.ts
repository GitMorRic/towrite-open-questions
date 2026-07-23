import { describe, expect, it } from "vitest";
import { dailyDeviceScore, dailyTaskTextForBackend } from "./device-priority";

describe("dailyDeviceScore", () => {
  it("orders explicit Daily policies without letting priority opt in disabled items", () => {
    const now = Date.parse("2026-07-23T09:00:00Z");
    const scores = {
      fixed: dailyDeviceScore({ devicePolicy: "manual", priority: "normal" }, now),
      due: dailyDeviceScore({ devicePolicy: "scheduled", scheduledFor: "2026-07-23T08:59:00Z", priority: "normal" }, now),
      scheduled: dailyDeviceScore({ devicePolicy: "scheduled", scheduledFor: "2026-07-23T10:00:00Z", priority: "normal" }, now),
      high: dailyDeviceScore({ devicePolicy: "agent", priority: "high" }, now),
      agent: dailyDeviceScore({ devicePolicy: "agent", priority: "normal" }, now),
      rotation: dailyDeviceScore({ devicePolicy: "rotation", priority: "normal" }, now),
      disabledHigh: dailyDeviceScore({ devicePolicy: "none", priority: "highest" }, now)
    };

    expect(scores.fixed).toBeGreaterThan(scores.due);
    expect(scores.due).toBeGreaterThan(scores.scheduled);
    expect(scores.scheduled).toBeGreaterThan(scores.high);
    expect(scores.high).toBeGreaterThan(scores.agent);
    expect(scores.agent).toBeGreaterThan(scores.rotation);
    expect(scores.disabledHigh).toBe(0.2);
  });

  it("preserves explicit priority metadata through Backend text rewrites", () => {
    expect(dailyTaskTextForBackend("Rewrite scene", "highest", true)).toBe("Rewrite scene 🔺");
    expect(dailyTaskTextForBackend("Rewrite scene 🔽", "high", true)).toBe("Rewrite scene ⏫");
    expect(dailyTaskTextForBackend("Review outline", "normal", true)).toBe("Review outline 🔼");
    expect(dailyTaskTextForBackend("Review outline", "normal", false)).toBe("Review outline");
  });
});
