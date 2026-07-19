import {
  CAPTURE_SCHEMA_VERSION,
  CaptureConflictError,
  type CaptureCommitResult,
  type CaptureDraft,
  type CapturePreview,
  type CaptureTargetCandidate
} from "../capture";
import type { HubCaptureClientLike } from "./client";
import { decryptHubCapture, ENVELOPE_ALGORITHM } from "./crypto";
import type {
  HubCaptureEncryptionEnvelope,
  HubCapturePlaintext,
  HubPendingCapture
} from "./types";

export interface HubCaptureCommitter {
  preview(draft: CaptureDraft, candidate: CaptureTargetCandidate): Promise<CapturePreview>;
  commit(request: {
    draft: CaptureDraft;
    candidate: CaptureTargetCandidate;
    targetRevision?: string;
  }): Promise<CaptureCommitResult>;
}

export interface HubCaptureWritebackOptions {
  client: HubCaptureClientLike;
  captureService: HubCaptureCommitter;
  getReceiverId(): string;
  getPrivateKey(): JsonWebKey | undefined;
  /**
   * Resolves only a connector-generated opaque ref. Implementations must build
   * the returned candidate from current local configuration, never from a path
   * or action supplied by the Hub.
   */
  resolveTarget(writeTargetRef: string): Promise<CaptureTargetCandidate | undefined>;
  onCommitted?(result: CaptureCommitResult): void | Promise<void>;
  onError?(error: unknown, queueCaptureId: string): void;
}

export type HubCaptureWritebackStatus = "acknowledged" | "conflict" | "failed";

export interface HubCaptureWritebackItemResult {
  queueCaptureId: string;
  status: HubCaptureWritebackStatus;
  captureId?: string;
  idempotent?: boolean;
  error?: string;
}

export interface HubCaptureWritebackResult {
  pending: number;
  acknowledged: number;
  conflicts: number;
  failed: number;
  items: HubCaptureWritebackItemResult[];
}

/**
 * Pulls E2EE PWA answers in the background and delegates every Vault mutation
 * to CaptureService. ACK happens only after a verified commit; therefore an ACK
 * failure is safely retried using CaptureService's durable capture markers.
 */
export class HubCaptureWritebackService {
  private activeRun: Promise<HubCaptureWritebackResult> | undefined;

  constructor(private readonly options: HubCaptureWritebackOptions) {}

  processPending(limit = 20): Promise<HubCaptureWritebackResult> {
    if (this.activeRun) {
      return this.activeRun;
    }
    this.activeRun = this.run(Math.max(1, Math.min(100, Math.floor(limit)))).finally(() => {
      this.activeRun = undefined;
    });
    return this.activeRun;
  }

  private async run(limit: number): Promise<HubCaptureWritebackResult> {
    const receiverId = this.options.getReceiverId().trim();
    const privateKey = this.options.getPrivateKey();
    if (!receiverId || !privateKey) {
      return emptyResult();
    }

    const pending = await this.options.client.getPendingCaptures(receiverId, limit);
    const items: HubCaptureWritebackItemResult[] = [];
    for (const item of pending) {
      items.push(await this.processItem(item, privateKey));
    }
    return {
      pending: pending.length,
      acknowledged: items.filter((item) => item.status === "acknowledged").length,
      conflicts: items.filter((item) => item.status === "conflict").length,
      failed: items.filter((item) => item.status === "failed").length,
      items
    };
  }

  private async processItem(item: HubPendingCapture, privateKey: JsonWebKey): Promise<HubCaptureWritebackItemResult> {
    try {
      const payload = await decryptHubCapture(envelopeFromPending(item), privateKey);
      assertFrozenContext(payload, item);
      if (payload.intent === "open") {
        throw new Error("An open-only Device Hub action cannot mutate the Vault.");
      }

      // Only the authenticated plaintext may select an opaque target. Relay
      // metadata is checked for consistency but is never treated as a local path.
      const targetRef = payload.writeTargetRef?.trim() ?? "";
      const candidate = await this.options.resolveTarget(targetRef);
      if (!candidate) {
        throw new Error(targetRef
          ? "The Device Hub write target is no longer in the local target catalog."
          : "No local Inbox target is configured for this Device Hub capture.");
      }
      const draft = draftFromPlaintext(payload);
      const preview = await this.options.captureService.preview(draft, candidate);
      const result = await this.options.captureService.commit({
        draft,
        candidate,
        // The local preview revision, not Hub target_revision metadata, is the
        // authority for the final atomic conflict check.
        targetRevision: preview.targetRevision
      });

      // Deliberately sends no Vault path. The Hub only needs terminal status.
      await this.options.client.acknowledgeCapture(item.captureId);
      await this.options.onCommitted?.(result);
      return {
        queueCaptureId: item.captureId,
        status: "acknowledged",
        captureId: result.captureId,
        idempotent: result.idempotent
      };
    } catch (error) {
      this.options.onError?.(error, item.captureId);
      return {
        queueCaptureId: item.captureId,
        status: error instanceof CaptureConflictError ? "conflict" : "failed",
        error: errorMessage(error)
      };
    }
  }
}

function envelopeFromPending(item: HubPendingCapture): HubCaptureEncryptionEnvelope {
  const metadata = item.encryption;
  if (!metadata.ephemeralPublicKey || !metadata.salt || !metadata.nonce) {
    throw new Error("Device Hub capture encryption metadata is incomplete.");
  }
  if (metadata.version !== undefined && metadata.version !== 1) {
    throw new Error("Unsupported Device Hub capture encryption version.");
  }
  if (metadata.algorithm && metadata.algorithm !== ENVELOPE_ALGORITHM) {
    throw new Error("Unsupported Device Hub capture encryption algorithm.");
  }
  return {
    version: 1,
    algorithm: ENVELOPE_ALGORITHM,
    ephemeralPublicKey: metadata.ephemeralPublicKey,
    salt: metadata.salt,
    iv: metadata.nonce,
    ciphertext: item.ciphertext,
    additionalData: metadata.additionalData
  };
}

function assertFrozenContext(payload: HubCapturePlaintext, item: HubPendingCapture): void {
  const frozen = item.encryption.hub;
  if (!frozen) {
    return;
  }
  if (frozen.selectionId && frozen.selectionId !== payload.selectionId) {
    throw new Error("Encrypted capture does not match the frozen Device Hub selection.");
  }
  if (frozen.contentId && frozen.contentId !== payload.contentId) {
    throw new Error("Encrypted capture does not match the frozen Device Hub content.");
  }
  if (frozen.writeTargetRef && frozen.writeTargetRef !== payload.writeTargetRef) {
    throw new Error("Encrypted capture does not match the frozen Device Hub write target.");
  }
  if (frozen.targetRevision && payload.targetRevision && frozen.targetRevision !== payload.targetRevision) {
    throw new Error("Encrypted capture does not match the frozen Device Hub target revision.");
  }
  if (frozen.intent && (frozen.intent === "respond" || frozen.intent === "capture") && frozen.intent !== payload.intent) {
    throw new Error("Encrypted capture does not match the frozen Device Hub intent.");
  }
}

function draftFromPlaintext(payload: HubCapturePlaintext): CaptureDraft {
  return {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    id: payload.captureId,
    intent: payload.intent === "respond" ? "answer" : "new",
    body: payload.body,
    tags: [],
    links: [],
    source: { entryPoint: "device-hub" },
    createdAt: payload.createdAt
  };
}

function emptyResult(): HubCaptureWritebackResult {
  return { pending: 0, acknowledged: 0, conflicts: 0, failed: 0, items: [] };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
