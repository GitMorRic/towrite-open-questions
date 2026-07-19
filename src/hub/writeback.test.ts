import { describe, expect, it, vi } from "vitest";
import {
  CAPTURE_SCHEMA_VERSION,
  CaptureConflictError,
  type CaptureCommitRequest,
  type CaptureCommitResult,
  type CaptureDraft,
  type CaptureTargetCandidate
} from "../capture";
import type { HubCaptureClientLike } from "./client";
import { encryptHubCapture, generateHubCaptureKeyPair } from "./crypto";
import type { HubCaptureEncryptionEnvelope, HubCapturePlaintext, HubPendingCapture } from "./types";
import { HubCaptureWritebackService, type HubCaptureCommitter } from "./writeback";

describe("HubCaptureWritebackService", () => {
  it("decrypts locally, resolves only an opaque target, commits with the local preview revision, and ACKs", async () => {
    const keys = await generateHubCaptureKeyPair();
    const pending = await encryptedPending(keys.publicKey);
    const client = new FakeCaptureClient([pending]);
    const committer = new FakeCommitter();
    const resolveTarget = vi.fn(async (ref: string) => ref === "ht_opaque_target" ? localCandidate() : undefined);
    const service = createService(client, committer, keys.privateKey, resolveTarget);

    const result = await service.processPending();

    expect(result).toMatchObject({ pending: 1, acknowledged: 1, conflicts: 0, failed: 0 });
    expect(resolveTarget).toHaveBeenCalledWith("ht_opaque_target");
    expect(committer.requests[0]).toMatchObject({ targetRevision: "local-preview-revision" });
    expect(committer.requests[0]?.draft).toMatchObject({
      id: "cap_encrypted_answer",
      intent: "answer",
      body: "The private answer stays inside the encrypted envelope."
    });
    expect(client.acknowledged).toEqual(["cap_queue_one"]);
    expect(JSON.stringify(client.acknowledged)).not.toContain("Projects/Private Draft.md");
  });

  it("retries idempotently when the Vault commit succeeded but the first ACK failed", async () => {
    const keys = await generateHubCaptureKeyPair();
    const pending = await encryptedPending(keys.publicKey);
    const client = new FakeCaptureClient([pending], 1);
    const committer = new FakeCommitter();
    const service = createService(client, committer, keys.privateKey, async () => localCandidate());

    await expect(service.processPending()).resolves.toMatchObject({ failed: 1, acknowledged: 0 });
    await expect(service.processPending()).resolves.toMatchObject({ failed: 0, acknowledged: 1 });

    expect(committer.requests).toHaveLength(2);
    expect(committer.results.map((result) => result.idempotent)).toEqual([false, true]);
    expect(client.acknowledged).toEqual(["cap_queue_one"]);
  });

  it("keeps a conflicting capture queued and never ACKs it", async () => {
    const keys = await generateHubCaptureKeyPair();
    const pending = await encryptedPending(keys.publicKey);
    const client = new FakeCaptureClient([pending]);
    const committer = new FakeCommitter();
    committer.conflict = true;
    const service = createService(client, committer, keys.privateKey, async () => localCandidate());

    const result = await service.processPending();

    expect(result).toMatchObject({ conflicts: 1, acknowledged: 0, failed: 0 });
    expect(client.acknowledged).toEqual([]);
  });

  it("rejects a Hub-rerouted opaque target before any Vault write", async () => {
    const keys = await generateHubCaptureKeyPair();
    const pending = await encryptedPending(keys.publicKey, {
      hubWriteTargetRef: "ht_different_target"
    });
    const client = new FakeCaptureClient([pending]);
    const committer = new FakeCommitter();
    const resolveTarget = vi.fn(async () => localCandidate());
    const service = createService(client, committer, keys.privateKey, resolveTarget);

    const result = await service.processPending();

    expect(result).toMatchObject({ failed: 1, acknowledged: 0 });
    expect(resolveTarget).not.toHaveBeenCalled();
    expect(committer.requests).toEqual([]);
  });
});

class FakeCaptureClient implements HubCaptureClientLike {
  acknowledged: string[] = [];

  constructor(
    private readonly pending: HubPendingCapture[],
    private ackFailuresRemaining = 0
  ) {}

  async getPendingCaptures(): Promise<HubPendingCapture[]> {
    return this.pending.filter((item) => !this.acknowledged.includes(item.captureId));
  }

  async acknowledgeCapture(captureId: string) {
    if (this.ackFailuresRemaining > 0) {
      this.ackFailuresRemaining -= 1;
      throw new Error("temporary ACK outage");
    }
    this.acknowledged.push(captureId);
    return { captureId, status: "written_to_vault" as const };
  }
}

class FakeCommitter implements HubCaptureCommitter {
  requests: CaptureCommitRequest[] = [];
  results: CaptureCommitResult[] = [];
  conflict = false;
  private committed = new Set<string>();

  async preview(draft: CaptureDraft, candidate: CaptureTargetCandidate) {
    return {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      captureId: draft.id,
      candidateId: candidate.id,
      action: candidate.action,
      path: candidate.path,
      targetRevision: "local-preview-revision",
      excerpt: draft.body
    };
  }

  async commit(request: CaptureCommitRequest): Promise<CaptureCommitResult> {
    this.requests.push(request);
    if (this.conflict) {
      throw new CaptureConflictError("target-changed", "The local target changed after preview.");
    }
    const idempotent = this.committed.has(request.draft.id);
    this.committed.add(request.draft.id);
    const result: CaptureCommitResult = {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      captureId: request.draft.id,
      candidateId: request.candidate.id,
      finalPath: request.candidate.path,
      action: request.candidate.action,
      createdAt: request.draft.createdAt ?? "2026-07-19T00:00:00.000Z",
      openUri: "obsidian://open?vault=local&file=redacted",
      idempotent,
      targetRevision: "local-after-revision"
    };
    this.results.push(result);
    return result;
  }
}

function createService(
  client: HubCaptureClientLike,
  committer: HubCaptureCommitter,
  privateKey: JsonWebKey,
  resolveTarget: (ref: string) => Promise<CaptureTargetCandidate | undefined>
) {
  return new HubCaptureWritebackService({
    client,
    captureService: committer,
    getReceiverId: () => "recv_opaque",
    getPrivateKey: () => privateKey,
    resolveTarget
  });
}

async function encryptedPending(
  publicKey: JsonWebKey,
  options: { hubWriteTargetRef?: string } = {}
): Promise<HubPendingCapture> {
  const payload: HubCapturePlaintext = {
    protocolVersion: "1",
    captureId: "cap_encrypted_answer",
    selectionId: "sel_frozen",
    contentId: "cnt_frozen",
    intent: "respond",
    body: "The private answer stays inside the encrypted envelope.",
    writeTargetRef: "ht_opaque_target",
    targetRevision: "rev_displayed",
    createdAt: "2026-07-19T00:00:00.000Z"
  };
  const envelope = await encryptHubCapture(payload, publicKey);
  return pendingFromEnvelope(envelope, options.hubWriteTargetRef ?? payload.writeTargetRef!);
}

function pendingFromEnvelope(envelope: HubCaptureEncryptionEnvelope, hubWriteTargetRef: string): HubPendingCapture {
  return {
    captureId: "cap_queue_one",
    status: "remote_queued",
    ciphertext: envelope.ciphertext,
    encryption: {
      version: envelope.version,
      algorithm: envelope.algorithm,
      ephemeralPublicKey: envelope.ephemeralPublicKey,
      salt: envelope.salt,
      nonce: envelope.iv,
      additionalData: envelope.additionalData,
      hub: {
        selectionId: "sel_frozen",
        contentId: "cnt_frozen",
        intent: "respond",
        writeTargetRef: hubWriteTargetRef,
        targetRevision: "rev_displayed"
      }
    },
    sizeBytes: envelope.ciphertext.length,
    createdAt: "2026-07-19T00:00:01.000Z",
    expiresAt: "2026-08-18T00:00:01.000Z"
  };
}

function localCandidate(): CaptureTargetCandidate {
  return {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    id: "hub-write:ht_opaque_target",
    kind: "existingNote",
    action: "append",
    path: "Projects/Private Draft.md",
    reason: "Resolved locally",
    confidence: "strong",
    score: 1,
    targetRevision: "local-catalog-revision",
    heading: "Captures"
  };
}
