import { describe, expect, it, vi } from "vitest";
import {
  CAPTURE_BRIDGE_PROTOCOL_VERSION,
  CAPTURE_BRIDGE_PROTOCOL_V2,
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

  it("supports v2 audio staging and guarded Daily completion without weakening v1", async () => {
    const tapId = generateCaptureTapId();
    const target = candidate("existingNote", "append", "Daily/2026-07-23.md");
    const commit = vi.fn(async (snapshot: TapSelectionSnapshot, request: CaptureBridgeCommitRequest, assets = []) => ({
      schemaVersion: 1 as const,
      captureId: request.captureId,
      candidateId: snapshot.candidate.id,
      finalPath: snapshot.candidate.path,
      action: snapshot.candidate.action,
      createdAt: "2026-07-23T08:00:00.000Z",
      targetRevision: "after",
      openUri: "obsidian://open?vault=Test&file=Daily",
      idempotent: false,
      assetCount: assets.length
    }));
    const complete = vi.fn(async () => ({
      path: "Daily/2026-07-23.md",
      completedAt: "2026-07-23T08:01:00.000Z"
    }));
    const selection = new LocalTapSelectionService({
      getFallbackLocalId: () => "daily-plan:daily_test",
      createSnapshot: async (): Promise<TapSelectionSnapshot> => ({
        protocolVersion: CAPTURE_BRIDGE_PROTOCOL_V2,
        snapshotId: "snp_daily",
        source: "local",
        localId: "daily-plan:daily_test",
        createdAt: "2026-07-23T08:00:00.000Z",
        contentType: "daily_plan_item",
        title: "Today's task",
        prompt: "Record or complete",
        allowedActions: ["capture", "complete", "later"],
        intent: "new",
        candidate: target,
        sourceContext: {
          file: "Daily/2026-07-23.md",
          dailyItemId: "daily_test",
          dailyTaskRevision: "rev_test"
        }
      })
    });
    const coordinator = new CaptureBridgeCoordinator({
      selection,
      commitAdapter: { commit, complete, undo: vi.fn(async () => ({ undone: true })) },
      isTapAllowed: (value) => value === tapId,
      handoffTtlSeconds: () => 300
    });

    const captureHandoff = await coordinator.createHandoff(tapId, CAPTURE_BRIDGE_PROTOCOL_V2);
    expect(captureHandoff.availableOperations).toEqual(["capture", "complete", "later"]);
    const upload = coordinator.stageAsset(captureHandoff.handoffId, {
      idempotencyKey: "audio-1",
      fileName: "voice.webm",
      mimeType: "audio/webm",
      base64: "AQID"
    });
    expect(coordinator.stageAsset(captureHandoff.handoffId, {
      idempotencyKey: "audio-1",
      fileName: "voice.webm",
      mimeType: "audio/webm",
      base64: "AQID"
    })).toEqual({ ...upload, idempotent: true });
    await coordinator.commit(captureHandoff.handoffId, {
      protocolVersion: CAPTURE_BRIDGE_PROTOCOL_V2,
      captureId: captureHandoff.captureId,
      idempotencyKey: "capture-v2",
      operation: "capture",
      body: "Voice note",
      assetRefs: [upload.assetRef]
    });
    expect(commit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [expect.objectContaining({ assetRef: upload.assetRef, mimeType: "audio/webm" })]
    );

    const completeHandoff = await coordinator.createHandoff(tapId, CAPTURE_BRIDGE_PROTOCOL_V2);
    const result = await coordinator.commit(completeHandoff.handoffId, {
      protocolVersion: CAPTURE_BRIDGE_PROTOCOL_V2,
      captureId: completeHandoff.captureId,
      idempotencyKey: "complete-v2",
      operation: "complete",
      body: ""
    });
    expect(result).toMatchObject({ operation: "complete", completed: true });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("creates a fresh create-only v2 handoff without exposing a caller-selected path", async () => {
    const tapId = generateCaptureTapId();
    const appendTarget = candidate("existingNote", "append", "Notes/Existing.md");
    const createTarget = candidate("folder", "create", "01-Sparks");
    const createOnlySnapshot = vi.fn(async (snapshot: TapSelectionSnapshot): Promise<TapSelectionSnapshot> => ({
      ...snapshot,
      snapshotId: "snp_create_only",
      contentType: "blank_capture",
      title: "New note",
      prompt: "Create a note after you submit",
      allowedActions: ["capture"],
      intent: "new",
      candidate: createTarget,
      sourceContext: {
        dailyItemId: "daily_old_context",
        dailyTaskRevision: "dtr_old_context"
      }
    }));
    const coordinator = new CaptureBridgeCoordinator({
      selection: selectionFor(appendTarget),
      commitAdapter: commitAdapter(),
      createOnlySnapshot,
      isTapAllowed: (value) => value === tapId,
      handoffTtlSeconds: () => 300
    });

    await expect(coordinator.createHandoff(
      tapId,
      CAPTURE_BRIDGE_PROTOCOL_VERSION,
      true
    )).rejects.toMatchObject({ statusCode: 409 });

    const handoff = await coordinator.createHandoff(
      tapId,
      CAPTURE_BRIDGE_PROTOCOL_V2,
      true
    );
    expect(handoff).toMatchObject({
      protocolVersion: CAPTURE_BRIDGE_PROTOCOL_V2,
      createOnly: true,
      target: {
        kind: "folder",
        action: "create",
        displayPath: "01-Sparks"
      }
    });
    expect(createOnlySnapshot).toHaveBeenCalledTimes(1);
    expect(handoff.availableOperations).toEqual(["capture"]);
    expect(JSON.stringify(handoff)).not.toContain("Notes/Existing.md");
    await expect(coordinator.commit(handoff.handoffId, {
      protocolVersion: CAPTURE_BRIDGE_PROTOCOL_V2,
      captureId: handoff.captureId,
      idempotencyKey: "create-only-complete",
      operation: "complete",
      body: ""
    })).rejects.toMatchObject({ statusCode: 409 });
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
