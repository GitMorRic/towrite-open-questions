import { describe, expect, it, vi } from "vitest";
import {
  CAPTURE_BRIDGE_PROTOCOL_VERSION,
  CaptureBridgeCoordinator,
  LocalTapSelectionService,
  generateCaptureTapId,
  type CaptureBridgeCommitAdapter,
  type CaptureBridgeCommitRequest,
  type TapSelectionSnapshot
} from ".";
import type { CaptureTargetCandidate } from "../capture";

describe("CaptureBridgeCoordinator", () => {
  it.each([
    ["existingNote", "append", "Notes/Existing.md"],
    ["folder", "create", "01-Sparks"],
    ["inbox", "append", "00-Raw/Inbox.md"]
  ] as const)("freezes a %s %s target without accepting a phone path", async (kind, action, path) => {
    const tapId = generateCaptureTapId();
    const adapter = commitAdapter();
    const coordinator = coordinatorFor(candidate(kind, action, path), tapId, adapter);
    const handoff = await coordinator.createHandoff(tapId);
    expect(handoff).toMatchObject({
      protocolVersion: CAPTURE_BRIDGE_PROTOCOL_VERSION,
      tapId,
      target: { kind, action, displayPath: path },
      allowedFields: ["body", "title", "tags"]
    });
    expect(JSON.stringify(handoff)).not.toContain("callbackToken");

    const request: CaptureBridgeCommitRequest = {
      protocolVersion: CAPTURE_BRIDGE_PROTOCOL_VERSION,
      captureId: handoff.captureId,
      idempotencyKey: "mobile-submit-1",
      body: "Written from the phone",
      title: "Phone title",
      tags: ["phone"]
    };
    const first = await coordinator.commit(handoff.handoffId, request);
    const retry = await coordinator.commit(handoff.handoffId, request);
    expect(first).toMatchObject({ path, action });
    expect(retry.idempotent).toBe(true);
    expect(adapter.commit).toHaveBeenCalledTimes(1);
    await expect(coordinator.commit(handoff.handoffId, { ...request, idempotencyKey: "different-key" }))
      .rejects.toThrow(/already committed/iu);
  });

  it("expires handoffs, revokes unknown taps, and validates undo tokens", async () => {
    let now = new Date("2026-07-20T01:00:00.000Z");
    const tapId = generateCaptureTapId();
    const adapter = commitAdapter();
    const selection = selectionFor(candidate("inbox", "append", "00-Raw/Inbox.md"));
    const coordinator = new CaptureBridgeCoordinator({
      selection,
      commitAdapter: adapter,
      isTapAllowed: (value) => value === tapId,
      handoffTtlSeconds: () => 60,
      now: () => now
    });
    await expect(coordinator.createHandoff(generateCaptureTapId())).rejects.toMatchObject({ statusCode: 404 });
    const uncommitted = await coordinator.createHandoff(tapId);
    const handoff = await coordinator.createHandoff(tapId);
    const commitRequest = {
      protocolVersion: CAPTURE_BRIDGE_PROTOCOL_VERSION,
      captureId: handoff.captureId,
      idempotencyKey: "mobile-submit-2",
      body: "answer"
    } as const;
    const committed = await coordinator.commit(handoff.handoffId, commitRequest);
    await expect(coordinator.undo(committed.captureId, "wrong-token")).rejects.toMatchObject({ statusCode: 400 });
    await expect(coordinator.undo(committed.captureId, committed.undoToken!)).resolves.toEqual({
      captureId: committed.captureId,
      undone: true
    });

    now = new Date("2026-07-20T01:02:00.000Z");
    await expect(() => coordinator.getHandoff(uncommitted.handoffId)).toThrow(/expired/iu);
    await expect(coordinator.commit(handoff.handoffId, commitRequest)).resolves.toMatchObject({
      captureId: committed.captureId,
      idempotent: true
    });
    expect(adapter.commit).toHaveBeenCalledTimes(1);

    now = new Date("2026-07-20T02:02:00.000Z");
    await expect(() => coordinator.getHandoff(handoff.handoffId)).toThrow(/expired/iu);
  });
});

function coordinatorFor(target: CaptureTargetCandidate, tapId: string, adapter: CaptureBridgeCommitAdapter) {
  return new CaptureBridgeCoordinator({
    selection: selectionFor(target),
    commitAdapter: adapter,
    isTapAllowed: (value) => value === tapId,
    handoffTtlSeconds: () => 300
  });
}

function selectionFor(target: CaptureTargetCandidate): LocalTapSelectionService {
  return new LocalTapSelectionService({
    getFallbackLocalId: () => "local",
    createSnapshot: async (): Promise<TapSelectionSnapshot> => ({
      protocolVersion: CAPTURE_BRIDGE_PROTOCOL_VERSION,
      snapshotId: "snp_test",
      source: "local",
      localId: "local",
      createdAt: "2026-07-20T01:00:00.000Z",
      contentType: "blank_capture",
      title: "Quick capture",
      prompt: "Write one thought",
      allowedActions: ["capture"],
      intent: "new",
      candidate: target
    })
  });
}

function candidate(
  kind: CaptureTargetCandidate["kind"],
  action: CaptureTargetCandidate["action"],
  path: string
): CaptureTargetCandidate {
  return {
    schemaVersion: 1,
    id: `target-${kind}`,
    kind,
    action,
    path,
    reason: "test",
    confidence: "strong",
    score: 1,
    targetRevision: action === "create" ? "folder-test" : "content-test",
    heading: action === "append" ? "Captures" : undefined
  };
}

function commitAdapter(): CaptureBridgeCommitAdapter & { commit: ReturnType<typeof vi.fn> } {
  return {
    commit: vi.fn(async (snapshot: TapSelectionSnapshot, request) => ({
      schemaVersion: 1 as const,
      captureId: request.captureId,
      candidateId: snapshot.candidate.id,
      finalPath: snapshot.candidate.path,
      action: snapshot.candidate.action,
      createdAt: "2026-07-20T01:00:01.000Z",
      openUri: "obsidian://open?vault=Vault",
      undoToken: "undo-test",
      idempotent: false,
      targetRevision: "after"
    })),
    undo: vi.fn(async () => ({ undone: true }))
  };
}
