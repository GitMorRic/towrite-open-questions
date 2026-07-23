import { describe, expect, it } from "vitest";
import { resolveLocalEinkConnectionStatus } from "./device-status";

const NOW = Date.parse("2026-07-23T08:00:00.000Z");

function base(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    bindHost: "127.0.0.1",
    port: 48_321,
    refreshSeconds: 5,
    targetId: "desk-eink",
    targetName: "Desk display",
    targetTokenConfigured: true,
    masterTokenConfigured: true,
    nowMs: NOW,
    runtime: { running: true },
    ...overrides
  };
}

describe("local e-ink connection status", () => {
  it("distinguishes a disabled API from a failed listener", () => {
    expect(resolveLocalEinkConnectionStatus(base({ enabled: false })).state).toBe("disabled");
    expect(resolveLocalEinkConnectionStatus(base({ runtime: { running: false } })).state).toBe("stopped");
  });

  it("surfaces a listener startup failure instead of calling it merely stopped", () => {
    const failed = resolveLocalEinkConnectionStatus(base({
      runtime: {
        running: false,
        stoppedAt: "2026-07-23T07:59:59.000Z",
        lastErrorAt: "2026-07-23T07:59:59.000Z",
        lastErrorStatus: 500,
        lastError: "External API failed to start."
      }
    }));
    const deliberatelyStopped = resolveLocalEinkConnectionStatus(base({
      runtime: {
        running: false,
        lastErrorAt: "2026-07-23T07:58:00.000Z",
        stoppedAt: "2026-07-23T07:59:59.000Z"
      }
    }));
    expect(failed.state).toBe("error");
    expect(deliberatelyStopped.state).toBe("stopped");
  });

  it("waits for the first authenticated ESP32 poll", () => {
    const status = resolveLocalEinkConnectionStatus(base());
    expect(status.state).toBe("waiting");
    expect(status.online).toBe(false);
  });

  it("does not reuse a poll recorded before the current server start", () => {
    const status = resolveLocalEinkConnectionStatus(base({
      runtime: {
        running: true,
        startedAt: "2026-07-23T07:59:55.000Z",
        lastPollAt: "2026-07-23T07:59:50.000Z"
      }
    }));
    expect(status.state).toBe("waiting");
    expect(status.lastPollAt).toBeUndefined();
  });

  it("uses three refresh intervals with a fifteen second minimum", () => {
    const recent = resolveLocalEinkConnectionStatus(base({
      runtime: { running: true, lastPollAt: "2026-07-23T07:59:46.000Z" }
    }));
    const stale = resolveLocalEinkConnectionStatus(base({
      runtime: { running: true, lastPollAt: "2026-07-23T07:59:44.000Z" }
    }));
    expect(recent.state).toBe("online");
    expect(recent.onlineWindowSeconds).toBe(15);
    expect(stale.state).toBe("stale");
  });

  it("shows the newest device-route error until a later successful poll", () => {
    const failed = resolveLocalEinkConnectionStatus(base({
      runtime: {
        running: true,
        lastPollAt: "2026-07-23T07:58:00.000Z",
        lastErrorAt: "2026-07-23T07:59:00.000Z",
        lastErrorStatus: 401,
        lastError: "The device token is not bound to this target."
      }
    }));
    const recovered = resolveLocalEinkConnectionStatus(base({
      runtime: {
        running: true,
        lastErrorAt: "2026-07-23T07:59:00.000Z",
        lastPollAt: "2026-07-23T07:59:58.000Z"
      }
    }));
    expect(failed.state).toBe("error");
    expect(failed.lastErrorStatus).toBe(401);
    expect(recovered.state).toBe("online");
  });

  it("copies only bounded diagnostic metadata", () => {
    const status = resolveLocalEinkConnectionStatus(base({
      runtime: {
        running: true,
        lastPollAt: "not-a-date",
        lastTargetId: `target-${"x".repeat(300)}`,
        lastServedTitle: "Card title",
        successfulPolls: 3
      }
    }));
    expect(status.lastPollAt).toBeUndefined();
    expect(status.lastTargetId?.length).toBe(120);
    expect(status.lastServedTitle).toBe("Card title");
    expect(status.successfulPolls).toBe(3);
  });
});
