import { describe, expect, it, vi } from "vitest";
import type { HubDeviceEventClientLike } from "./client";
import {
  HubDeviceEventWritebackService,
  type HubDeviceEventApplyResult
} from "./device-event-writeback";
import type {
  HubDeviceEventAcknowledgement,
  HubDeviceEventAckReceipt,
  HubPendingDeviceEvent
} from "./types";

describe("HubDeviceEventWritebackService", () => {
  it("applies events in server order and ACKs all terminal outcomes", async () => {
    const client = new FakeDeviceEventClient([
      event("evt_00000000000000000000000000000001", "complete"),
      event("evt_00000000000000000000000000000002", "later"),
      event("evt_00000000000000000000000000000003", "skip")
    ]);
    const order: string[] = [];
    const outcomes: HubDeviceEventApplyResult[] = [
      { status: "applied", resultRevision: "rev_local_one" },
      { status: "ignored" },
      { status: "conflict", resultRevision: "rev_current_three" }
    ];
    const apply = vi.fn(async (item: HubPendingDeviceEvent) => {
      order.push(`apply:${item.eventId}`);
      return outcomes.shift()!;
    });
    client.onAck = (eventId) => order.push(`ack:${eventId}`);
    const service = createService(client, apply);

    await expect(service.processPending()).resolves.toMatchObject({
      pending: 3,
      acknowledged: 3,
      applied: 1,
      ignored: 1,
      conflicts: 1,
      failed: 0
    });
    expect(order).toEqual([
      "apply:evt_00000000000000000000000000000001",
      "ack:evt_00000000000000000000000000000001",
      "apply:evt_00000000000000000000000000000002",
      "ack:evt_00000000000000000000000000000002",
      "apply:evt_00000000000000000000000000000003",
      "ack:evt_00000000000000000000000000000003"
    ]);
    expect(client.acknowledgements).toEqual([
      expect.objectContaining({ eventId: "evt_00000000000000000000000000000001", status: "applied", resultRevision: "rev_local_one" }),
      expect.objectContaining({ eventId: "evt_00000000000000000000000000000002", status: "ignored" }),
      expect.objectContaining({ eventId: "evt_00000000000000000000000000000003", status: "conflict", resultRevision: "rev_current_three" })
    ]);
  });

  it("keeps a failed local apply pending and retries it on the next poll", async () => {
    const item = event("evt_00000000000000000000000000000001", "complete");
    const client = new FakeDeviceEventClient([item]);
    let calls = 0;
    const apply = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("local task temporarily unavailable");
      }
      return { status: "applied" as const, resultRevision: "rev_after_retry" };
    });
    const service = createService(client, apply);

    await expect(service.processPending()).resolves.toMatchObject({ failed: 1, acknowledged: 0 });
    expect(client.acknowledgements).toEqual([]);
    await expect(service.processPending()).resolves.toMatchObject({ failed: 0, acknowledged: 1, applied: 1 });
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("does not reapply an event when only its ACK failed", async () => {
    const item = event("evt_00000000000000000000000000000001", "complete");
    const client = new FakeDeviceEventClient([item], 1);
    const apply = vi.fn(async () => ({ status: "applied" as const, resultRevision: "rev_once" }));
    const service = createService(client, apply);

    await expect(service.processPending()).resolves.toMatchObject({ failed: 1, acknowledged: 0 });
    await expect(service.processPending()).resolves.toMatchObject({ failed: 0, acknowledged: 1, applied: 1 });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(client.ackAttempts).toBe(2);
    expect(client.acknowledgements).toEqual([
      expect.objectContaining({ status: "applied", resultRevision: "rev_once" })
    ]);
  });

  it("coalesces concurrent polls and does nothing without a receiver", async () => {
    const client = new FakeDeviceEventClient([event("evt_00000000000000000000000000000001", "complete")]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const apply = vi.fn(async () => {
      await gate;
      return { status: "ignored" as const };
    });
    const service = createService(client, apply);

    const first = service.processPending();
    const second = service.processPending();
    release();
    await expect(first).resolves.toMatchObject({ ignored: 1 });
    await expect(second).resolves.toMatchObject({ ignored: 1 });
    expect(client.pullCalls).toBe(1);

    const disabled = new HubDeviceEventWritebackService({
      client,
      getReceiverId: () => " ",
      apply
    });
    await expect(disabled.processPending()).resolves.toMatchObject({ pending: 0, acknowledged: 0 });
    expect(client.pullCalls).toBe(1);
  });

  it("leaves events pending when the pull itself fails", async () => {
    const client = new FakeDeviceEventClient([]);
    client.pullError = new Error("Hub offline");
    const onError = vi.fn();
    const apply = vi.fn();
    const service = new HubDeviceEventWritebackService({
      client,
      getReceiverId: () => "recv_opaque",
      apply,
      onError
    });

    await expect(service.processPending()).rejects.toThrow("Hub offline");
    expect(apply).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(client.acknowledgements).toEqual([]);
  });

  it("ACKs pause/resume transitions with both task and timing revisions", async () => {
    const client = new FakeDeviceEventClient([
      event("evt_00000000000000000000000000000011", "pause_task"),
      event("evt_00000000000000000000000000000012", "resume_task")
    ]);
    const apply = vi.fn(async (item: HubPendingDeviceEvent): Promise<HubDeviceEventApplyResult> => (
      item.action === "pause_task"
        ? {
            status: "applied",
            resultRevision: "task_revision_paused",
            timingRevision: "timer_revision_paused"
          }
        : {
            status: "conflict",
            resultRevision: "task_revision_current",
            timingRevision: "timer_revision_current",
            message: "The displayed task timing changed."
          }
    ));
    const service = createService(client, apply);

    await expect(service.processPending()).resolves.toMatchObject({
      pending: 2,
      acknowledged: 2,
      applied: 1,
      conflicts: 1,
      items: [
        {
          eventId: "evt_00000000000000000000000000000011",
          status: "applied",
          resultRevision: "task_revision_paused",
          timingRevision: "timer_revision_paused"
        },
        {
          eventId: "evt_00000000000000000000000000000012",
          status: "conflict",
          resultRevision: "task_revision_current",
          timingRevision: "timer_revision_current"
        }
      ]
    });
    expect(apply.mock.calls.map(([item]) => item.action)).toEqual(["pause_task", "resume_task"]);
    expect(client.acknowledgements).toEqual([
      expect.objectContaining({
        eventId: "evt_00000000000000000000000000000011",
        status: "applied",
        resultRevision: "task_revision_paused",
        timingRevision: "timer_revision_paused"
      }),
      expect.objectContaining({
        eventId: "evt_00000000000000000000000000000012",
        status: "conflict",
        resultRevision: "task_revision_current",
        timingRevision: "timer_revision_current",
        message: "The displayed task timing changed."
      })
    ]);
  });

  it("does not ACK a malformed timing revision and retries the local apply", async () => {
    const client = new FakeDeviceEventClient([
      event("evt_00000000000000000000000000000013", "pause_task")
    ]);
    const apply = vi.fn(async () => ({
      status: "applied" as const,
      resultRevision: "task_revision_valid",
      timingRevision: "Daily/2026-07-24.md"
    }));
    const service = createService(client, apply);

    await expect(service.processPending()).resolves.toMatchObject({
      pending: 1,
      acknowledged: 0,
      failed: 1
    });
    await expect(service.processPending()).resolves.toMatchObject({
      pending: 1,
      acknowledged: 0,
      failed: 1
    });
    expect(apply).toHaveBeenCalledTimes(2);
    expect(client.acknowledgements).toEqual([]);
  });
});

class FakeDeviceEventClient implements HubDeviceEventClientLike {
  acknowledgements: Array<HubDeviceEventAcknowledgement & { eventId: string }> = [];
  ackAttempts = 0;
  pullCalls = 0;
  pullError: Error | undefined;
  onAck: ((eventId: string) => void) | undefined;

  constructor(
    private readonly items: HubPendingDeviceEvent[],
    private ackFailuresRemaining = 0
  ) {}

  async getPendingDeviceEvents(): Promise<HubPendingDeviceEvent[]> {
    this.pullCalls += 1;
    if (this.pullError) {
      throw this.pullError;
    }
    const acknowledged = new Set(this.acknowledgements.map((item) => item.eventId));
    return this.items.filter((item) => !acknowledged.has(item.eventId));
  }

  async acknowledgeDeviceEvent(
    _receiverId: string,
    eventId: string,
    acknowledgement: HubDeviceEventAcknowledgement
  ): Promise<HubDeviceEventAckReceipt> {
    this.ackAttempts += 1;
    if (this.ackFailuresRemaining > 0) {
      this.ackFailuresRemaining -= 1;
      throw new Error("temporary ACK outage");
    }
    this.onAck?.(eventId);
    this.acknowledgements.push({ eventId, ...acknowledgement });
    return {
      protocolVersion: "1",
      eventId,
      acknowledged: true,
      duplicate: false,
      status: acknowledgement.status
    };
  }
}

function createService(
  client: HubDeviceEventClientLike,
  apply: (event: HubPendingDeviceEvent) => Promise<HubDeviceEventApplyResult>
) {
  return new HubDeviceEventWritebackService({
    client,
    getReceiverId: () => "recv_opaque",
    apply
  });
}

function event(eventId: string, action: HubPendingDeviceEvent["action"]): HubPendingDeviceEvent {
  return {
    eventId,
    action,
    deviceId: "dev_0123456789abcdef0123456789abcdef",
    selectionId: "sel_0123456789abcdef0123456789abcdef",
    stateVersion: 9,
    contentId: "cnt_0123456789abcdef0123456789abcdef",
    revisionId: "rev_0123456789abcdef0123456789abcdef",
    contentType: "daily_plan_item",
    candidateRef: "hc_opaque",
    sourceRef: "hs_opaque",
    writeTargetRef: "ht_opaque",
    createdAt: "2026-07-23T00:00:00.000Z"
  };
}
