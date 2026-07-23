import { describe, expect, it, vi } from "vitest";
import { LocalTapSelectionService, type TapSelectionReference, type TapSelectionSnapshot } from ".";
import type { HubDeviceState } from "../hub";

describe("LocalTapSelectionService", () => {
  it("resolves displayed before selected before local and survives restart", async () => {
    const createSnapshot = vi.fn(async (reference: TapSelectionReference) => snapshot(reference));
    const service = new LocalTapSelectionService({ createSnapshot, getFallbackLocalId: () => "fallback" });
    await service.selectLocal("local");
    expect(service.currentLocalId()).toBe("local");
    await service.rememberHubStateMappings(hubState(), {
      selectedLocalId: "selected-local",
      displayedLocalId: "displayed-local"
    });

    expect(service.currentLocalId()).toBe("selected-local");
    expect(service.currentDisplayedLocalId()).toBe("displayed-local");
    await expect(service.resolve()).resolves.toMatchObject({ source: "displayed", localId: "displayed-local" });

    const restored = new LocalTapSelectionService({
      createSnapshot,
      getFallbackLocalId: () => "fallback",
      validateSnapshot: async () => undefined
    });
    restored.restore(service.serialize());
    restored.recordHubState(hubState());
    expect(restored.currentDisplayedLocalId()).toBe("displayed-local");
    await expect(restored.resolve()).resolves.toMatchObject({ source: "displayed", localId: "displayed-local" });
  });

  it("fails closed when authenticated state has no local mapping", async () => {
    const service = new LocalTapSelectionService({
      createSnapshot: async (reference) => {
        if (!reference.localId) throw new Error("missing authenticated local mapping");
        return snapshot(reference);
      },
      getFallbackLocalId: () => "fallback"
    });
    service.recordHubState(hubState());
    await expect(service.resolve()).rejects.toThrow(/authenticated local mapping/iu);
  });

  it("revalidates persisted snapshots before returning them", async () => {
    const validateSnapshot = vi.fn(async () => {
      throw new Error("target revision changed");
    });
    const service = new LocalTapSelectionService({
      createSnapshot: async (reference) => snapshot(reference),
      getFallbackLocalId: () => "fallback",
      validateSnapshot
    });
    await service.selectLocal("local");
    await expect(service.resolve()).rejects.toThrow(/revision changed/iu);
    expect(validateSnapshot).toHaveBeenCalledTimes(1);
  });

  it("keeps a locally polled displayed card ahead of a newer desired selection", async () => {
    const createSnapshot = vi.fn(async (reference: TapSelectionReference) => snapshot(reference));
    const service = new LocalTapSelectionService({ createSnapshot, getFallbackLocalId: () => "fallback" });
    await service.selectLocal("card-a");
    await service.recordLocalDisplayed("card-a");
    await service.selectLocal("card-b");
    service.recordHubState({
      ...hubState(),
      displayed: undefined,
      selected: {
        ...hubState().selected!,
        selectedContentId: "cnt_card_b"
      }
    });

    expect(service.currentLocalId()).toBe("card-b");
    expect(service.currentDisplayedLocalId()).toBe("card-a");
    await expect(service.resolve()).resolves.toMatchObject({ source: "displayed", localId: "card-a" });

    const restored = new LocalTapSelectionService({ createSnapshot, getFallbackLocalId: () => "fallback" });
    restored.restore(service.serialize());
    await expect(restored.resolve()).resolves.toMatchObject({ localId: "card-a" });
  });

  it("does not rebuild or persist snapshots for an identical repeated Hub poll", async () => {
    const createSnapshot = vi.fn(async (reference: TapSelectionReference) => snapshot(reference));
    const onStateChanged = vi.fn();
    const service = new LocalTapSelectionService({
      createSnapshot,
      getFallbackLocalId: () => "fallback",
      onStateChanged
    });
    const state = hubState();
    const mappings = {
      selectedLocalId: "selected-local",
      displayedLocalId: "displayed-local"
    };

    await service.rememberHubStateMappings(state, mappings);
    await service.rememberHubStateMappings(structuredClone(state), { ...mappings });

    expect(createSnapshot).toHaveBeenCalledTimes(2);
    expect(onStateChanged).toHaveBeenCalledTimes(1);
    await expect(service.resolve()).resolves.toMatchObject({
      source: "displayed",
      localId: "displayed-local"
    });
  });

  it("does not resolve a selection mutation before its persistence callback completes", async () => {
    let finishPersistence: (() => void) | undefined;
    const persistenceGate = new Promise<void>((resolve) => {
      finishPersistence = resolve;
    });
    const onStateChanged = vi.fn(() => persistenceGate);
    const service = new LocalTapSelectionService({
      createSnapshot: async (reference) => snapshot(reference),
      getFallbackLocalId: () => "fallback",
      onStateChanged
    });

    let resolved = false;
    const selecting = service.selectLocal("local").then((result) => {
      resolved = true;
      return result;
    });
    await vi.waitFor(() => expect(onStateChanged).toHaveBeenCalledTimes(1));
    expect(resolved).toBe(false);

    finishPersistence?.();
    await expect(selecting).resolves.toMatchObject({ localId: "local" });
    expect(resolved).toBe(true);
  });
});

function hubState(): HubDeviceState {
  return {
    protocolVersion: "1",
    deviceId: "dev_test",
    online: true,
    selected: {
      protocolVersion: "1",
      selectionId: "sel_selected",
      deliveryId: "dlv_selected",
      deviceId: "dev_test",
      selectedContentId: "cnt_selected",
      selectedRevisionId: "rev_selected",
      stateVersion: 2,
      selectedAt: "2026-07-20T01:00:00.000Z",
      reason: "manual"
    },
    displayed: {
      selectionId: "sel_displayed",
      contentId: "cnt_displayed",
      revisionId: "rev_displayed",
      stateVersion: 1,
      displayedAt: "2026-07-20T00:59:00.000Z"
    }
  };
}

function snapshot(reference: TapSelectionReference): TapSelectionSnapshot {
  return {
    protocolVersion: "towrite-capture-bridge/v1",
    snapshotId: `snp_${reference.localId || "unknown"}`,
    source: reference.source,
    sourceContentId: reference.contentId,
    localId: reference.localId,
    createdAt: "2026-07-20T01:00:00.000Z",
    contentType: "question_prompt",
    title: reference.localId || "unknown",
    prompt: "Continue",
    allowedActions: ["respond"],
    intent: "answer",
    candidate: {
      schemaVersion: 1,
      id: `target-${reference.localId || "unknown"}`,
      kind: "existingNote",
      action: "append",
      path: "Notes/Target.md",
      reason: "test",
      confidence: "strong",
      score: 1,
      targetRevision: "content-test"
    }
  };
}
