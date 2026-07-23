import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceHubConnector } from "./connector";
import type { HubClientLike } from "./client";
import type {
  HubCandidateBatch,
  HubContentSelection,
  HubContextObservation,
  HubDeviceState,
  HubSelectionFeedback,
  HubSelectionRequest
} from "./types";

afterEach(() => {
  vi.useRealTimers();
});

describe("DeviceHubConnector", () => {
  it("keeps editor activity constant-time and performs no synchronous I/O", async () => {
    vi.useFakeTimers();
    const client = fakeClient();
    const connector = new DeviceHubConnector({
      client,
      getSettings: configuredSettings,
      getCandidates: () => [],
      activityDebounceMs: 500
    });

    connector.recordEditPresence();
    connector.recordEditPresence();
    connector.recordEditPresence();
    expect(client.observations).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(499);
    expect(client.observations).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(client.observations).toHaveLength(1);
    expect(client.observations[0]).toHaveLength(1);
    expect(client.observations[0][0]).not.toHaveProperty("path");
    expect(client.observations[0][0]).not.toHaveProperty("body");
    connector.dispose();
  });

  it("uploads only the privacy-approved opaque batch and refreshes state", async () => {
    const client = fakeClient();
    const connector = new DeviceHubConnector({
      client,
      getSettings: configuredSettings,
      getCandidates: () => [
        {
          localId: "Projects/visible.md",
          type: "note_continue",
          display: { title: "Visible" },
          sourceLocalId: "Projects/visible.md",
          writeTargetLocalId: "Projects/visible.md",
          allowedActions: ["open", "capture"],
          reasonCode: "local",
          score: 0.7
        },
        {
          localId: "Private/secret.md",
          type: "excerpt",
          display: { title: "Must not leave" },
          allowedActions: ["open"],
          reasonCode: "private",
          score: 1,
          privacy: { private: true }
        }
      ]
    });

    const state = await connector.sync();
    expect(state?.deviceId).toBe("dev_0123456789abcdef0123456789abcdef");
    expect(client.batches).toHaveLength(1);
    expect(client.batches[0].candidates).toHaveLength(1);
    expect(client.batches[0].candidates[0].candidateRef).toMatch(/^hc_/u);
    expect(JSON.stringify(client.batches[0])).not.toContain("Projects/visible.md");
    expect(JSON.stringify(client.batches[0])).not.toContain("Must not leave");
  });

  it("allows Backend order and explanations but rejects invented IDs and target mutations", async () => {
    const client = fakeClient();
    const connector = new DeviceHubConnector({
      client,
      getSettings: configuredSettings,
      getCandidates: () => [
        {
          localId: "note-a",
          type: "note_continue",
          display: { title: "A" },
          writeTargetLocalId: "Folder/A.md",
          allowedActions: ["respond"],
          reasonCode: "local-a",
          score: 0.8,
          policyBasis: "general"
        },
        {
          localId: "note-b",
          type: "quote",
          display: { title: "B" },
          allowedActions: ["open"],
          reasonCode: "local-b",
          score: 0.6
        }
      ],
      enhanceCandidates: async (local) => [
        {
          ...local[1]!,
          display: { title: "Backend must not replace display", body: "injected" },
          writeTargetRef: "target_injected",
          policyBasis: "due",
          urgency: 1,
          reasonCode: "whitelist explanation",
          score: 12
        },
        {
          ...local[0]!,
          candidateRef: "hc_invented_outside_whitelist"
        }
      ]
    });

    await connector.sync();

    const uploaded = client.batches[0].candidates;
    expect(uploaded.map((candidate) => candidate.display.title)).toEqual(["B", "A"]);
    expect(uploaded[0].reasonCode).toBe("whitelist explanation");
    expect(uploaded[0].score).toBe(1);
    expect(uploaded[0].display.body).toBeUndefined();
    expect(uploaded[0].writeTargetRef).toBeUndefined();
    expect(uploaded[0].policyBasis).toBe("general");
    expect(uploaded[0].urgency).toBe(0);
    expect(uploaded.some((candidate) => candidate.candidateRef === "hc_invented_outside_whitelist")).toBe(false);
  });

  it("uploads and manually selects an explicit local card without AI or batch auto-selection", async () => {
    const client = fakeClient();
    const enhanceCandidates = vi.fn();
    const connector = new DeviceHubConnector({
      client,
      getSettings: configuredSettings,
      getCandidates: () => [{
        localId: "question-selection",
        type: "question_prompt",
        display: { title: "Selection card" },
        sourceLocalId: "note.md:question-selection",
        writeTargetLocalId: "note.md",
        allowedActions: ["open", "respond"],
        reasonCode: "unresolved_question",
        score: 0.82
      }],
      enhanceCandidates
    });

    const state = await connector.selectLocalCandidate("question-selection");

    expect(enhanceCandidates).not.toHaveBeenCalled();
    expect(client.batches).toHaveLength(1);
    expect(client.batches[0].autoSelect).toBe(false);
    expect(client.selections).toHaveLength(1);
    expect(client.selections[0]).toMatchObject({
      candidateRef: client.batches[0].candidates[0].candidateRef,
      reason: "manual",
      score: 0.82,
      requestVibration: true
    });
    expect(state.selected?.selectedContentId).toBe("cnt_manual");
  });

  it("refuses direct selection when local privacy filtering removes the card", async () => {
    const client = fakeClient();
    const connector = new DeviceHubConnector({
      client,
      getSettings: configuredSettings,
      getCandidates: () => [{
        localId: "private-question",
        type: "question_prompt",
        display: { title: "Private" },
        allowedActions: ["respond"],
        reasonCode: "private",
        score: 1,
        privacy: { private: true }
      }]
    });

    await expect(connector.selectLocalCandidate("private-question"))
      .rejects.toThrow("removed by the local Device Hub privacy policy");
    expect(client.batches).toHaveLength(0);
    expect(client.selections).toHaveLength(0);
  });

  it("serializes a manual selection after an in-flight Agent rerank", async () => {
    const client = fakeClient();
    let release: ((value: readonly import("./types").HubCandidate[]) => void) | undefined;
    const rerank = new Promise<readonly import("./types").HubCandidate[]>((resolve) => {
      release = resolve;
    });
    const localCandidates = [{
      localId: "question-selection",
      type: "question_prompt" as const,
      display: { title: "Selection card" },
      allowedActions: ["open" as const],
      reasonCode: "local",
      score: 0.8
    }];
    const connector = new DeviceHubConnector({
      client,
      getSettings: configuredSettings,
      getCandidates: () => localCandidates,
      enhanceCandidates: () => rerank
    });

    const sync = connector.sync();
    await Promise.resolve();
    const manual = connector.selectLocalCandidate("question-selection");
    expect(client.selections).toHaveLength(0);
    release?.(client.batches[0]?.candidates ?? []);
    await sync;
    await manual;

    expect(client.batches).toHaveLength(2);
    expect(client.batches[1].autoSelect).toBe(false);
    expect(client.selections.at(-1)?.reason).toBe("manual");
  });
});

function configuredSettings() {
  return {
    enabled: true,
    receiverId: "recv_0123456789abcdef0123456789abcdef",
    deviceId: "dev_0123456789abcdef0123456789abcdef",
    referenceSecret: "0123456789abcdef0123456789abcdef",
    autoSelect: true,
    manualSelectionVibration: true
  };
}

function fakeClient(): HubClientLike & {
  batches: HubCandidateBatch[];
  observations: HubContextObservation[][];
  selections: HubSelectionRequest[];
} {
  const state: HubDeviceState = {
    protocolVersion: "1",
    deviceId: "dev_0123456789abcdef0123456789abcdef",
    online: false
  };
  const batches: HubCandidateBatch[] = [];
  const observations: HubContextObservation[][] = [];
  const selections: HubSelectionRequest[] = [];
  return {
    batches,
    observations,
    selections,
    async getCapabilities() {
      return {
        protocolVersion: "1",
        candidateBatches: true,
        contextObservations: true,
        manualSelection: true,
        deviceState: true,
        feedback: true,
        maxCandidates: 20
      };
    },
    async submitCandidateBatch(_receiverId: string, batch: HubCandidateBatch) {
      batches.push(batch);
      return { protocolVersion: "1", batchId: batch.batchId, accepted: batch.candidates.length, rejected: 0 };
    },
    async submitContextObservations(items: readonly HubContextObservation[]) {
      observations.push(items.map((item) => ({ ...item })));
    },
    async selectDeviceContent(deviceId: string, request: HubSelectionRequest): Promise<HubContentSelection> {
      selections.push({ ...request });
      const selection: HubContentSelection = {
        protocolVersion: "1",
        selectionId: "sel_manual",
        deliveryId: "dlv_manual",
        deviceId,
        selectedContentId: "cnt_manual",
        selectedRevisionId: "rev_manual",
        stateVersion: 1,
        selectedAt: "2026-07-20T00:00:00.000Z",
        reason: request.reason,
        score: request.score
      };
      state.selected = selection;
      return selection;
    },
    async getDeviceState() {
      return state;
    },
    async submitFeedback(_selectionId: string, feedback: HubSelectionFeedback) {
      return { protocolVersion: "1", eventId: feedback.eventId, idempotent: false };
    }
  };
}
