import type { HubDeviceEventClientLike } from "./client";
import type {
  HubDeviceEventAcknowledgement,
  HubDeviceEventAckStatus,
  HubPendingDeviceEvent
} from "./types";

export interface HubDeviceEventApplyResult {
  status: HubDeviceEventAckStatus;
  /** New local task revision, if the transition changed Markdown. */
  resultRevision?: string;
  /** New timer-ledger revision, if the transition changed task timing. */
  timingRevision?: string;
  message?: string;
}

export interface HubDeviceEventWritebackOptions {
  client: HubDeviceEventClientLike;
  getReceiverId(): string;
  /**
   * Applies an immutable event locally. Implementations must be idempotent by
   * eventId because a process restart can happen after apply and before ACK.
   */
  apply(event: HubPendingDeviceEvent): Promise<HubDeviceEventApplyResult>;
  onError?(error: unknown, eventId?: string): void;
}

export interface HubDeviceEventWritebackItemResult {
  eventId: string;
  status: HubDeviceEventAckStatus | "failed";
  acknowledged: boolean;
  duplicate?: boolean;
  resultRevision?: string;
  timingRevision?: string;
  error?: string;
}

export interface HubDeviceEventWritebackResult {
  pending: number;
  acknowledged: number;
  applied: number;
  conflicts: number;
  ignored: number;
  failed: number;
  items: HubDeviceEventWritebackItemResult[];
}

/**
 * Sequentially applies device events and acknowledges only terminal local
 * outcomes. Pull, apply, and ACK failures leave the server event pending.
 */
export class HubDeviceEventWritebackService {
  private activeRun: Promise<HubDeviceEventWritebackResult> | undefined;
  private readonly awaitingAck = new Map<string, HubDeviceEventApplyResult>();

  constructor(private readonly options: HubDeviceEventWritebackOptions) {}

  processPending(limit = 50, waitSeconds = 0): Promise<HubDeviceEventWritebackResult> {
    if (this.activeRun) {
      return this.activeRun;
    }
    this.activeRun = this.run(
      Math.max(1, Math.min(200, Math.floor(limit))),
      Math.max(0, Math.min(25, Math.floor(waitSeconds)))
    ).finally(() => {
      this.activeRun = undefined;
    });
    return this.activeRun;
  }

  private async run(limit: number, waitSeconds: number): Promise<HubDeviceEventWritebackResult> {
    const receiverId = this.options.getReceiverId().trim();
    if (!receiverId) {
      return emptyResult();
    }

    let pending: HubPendingDeviceEvent[];
    try {
      pending = await this.options.client.getPendingDeviceEvents(receiverId, limit, waitSeconds);
    } catch (error) {
      this.options.onError?.(error);
      throw error;
    }
    const pendingIds = new Set(pending.map((event) => event.eventId));
    for (const eventId of this.awaitingAck.keys()) {
      // Covers the ambiguous case where the ACK reached the Hub but its HTTP
      // response was lost. The absent event is already terminal server-side.
      if (!pendingIds.has(eventId)) {
        this.awaitingAck.delete(eventId);
      }
    }

    const items: HubDeviceEventWritebackItemResult[] = [];
    for (const event of pending) {
      items.push(await this.processItem(receiverId, event));
    }
    return summarize(pending.length, items);
  }

  private async processItem(
    receiverId: string,
    event: HubPendingDeviceEvent
  ): Promise<HubDeviceEventWritebackItemResult> {
    let outcome = this.awaitingAck.get(event.eventId);
    try {
      if (!outcome) {
        outcome = normalizeApplyResult(await this.options.apply(event));
        this.awaitingAck.set(event.eventId, outcome);
      }
      const acknowledgement: HubDeviceEventAcknowledgement = {
        status: outcome.status,
        resultRevision: outcome.resultRevision,
        timingRevision: outcome.timingRevision,
        message: outcome.message
      };
      const receipt = await this.options.client.acknowledgeDeviceEvent(
        receiverId,
        event.eventId,
        acknowledgement
      );
      this.awaitingAck.delete(event.eventId);
      return {
        eventId: event.eventId,
        status: outcome.status,
        acknowledged: receipt.acknowledged,
        duplicate: receipt.duplicate,
        resultRevision: outcome.resultRevision,
        timingRevision: outcome.timingRevision
      };
    } catch (error) {
      this.options.onError?.(error, event.eventId);
      return {
        eventId: event.eventId,
        status: "failed",
        acknowledged: false,
        resultRevision: outcome?.resultRevision,
        timingRevision: outcome?.timingRevision,
        error: errorMessage(error)
      };
    }
  }
}

function normalizeApplyResult(result: HubDeviceEventApplyResult): HubDeviceEventApplyResult {
  if (result.status !== "applied" && result.status !== "conflict" && result.status !== "ignored") {
    throw new Error("Device event apply returned an invalid status.");
  }
  const resultRevision = result.resultRevision?.trim();
  if (resultRevision && !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/u.test(resultRevision)) {
    throw new Error("Device event apply returned an invalid result revision.");
  }
  const message = result.message?.trim().slice(0, 120);
  const timingRevision = result.timingRevision?.trim();
  if (timingRevision && !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/u.test(timingRevision)) {
    throw new Error("Device event apply returned an invalid timing revision.");
  }
  return { status: result.status, resultRevision, timingRevision, message };
}

function summarize(
  pending: number,
  items: HubDeviceEventWritebackItemResult[]
): HubDeviceEventWritebackResult {
  return {
    pending,
    acknowledged: items.filter((item) => item.acknowledged).length,
    applied: items.filter((item) => item.status === "applied").length,
    conflicts: items.filter((item) => item.status === "conflict").length,
    ignored: items.filter((item) => item.status === "ignored").length,
    failed: items.filter((item) => item.status === "failed").length,
    items
  };
}

function emptyResult(): HubDeviceEventWritebackResult {
  return {
    pending: 0,
    acknowledged: 0,
    applied: 0,
    conflicts: 0,
    ignored: 0,
    failed: 0,
    items: []
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
