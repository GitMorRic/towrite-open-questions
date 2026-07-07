import { describe, expect, it } from "vitest";
import { PushContextStore, normalizePushRuntimeState } from "./state";

describe("PushContextStore", () => {
  it("stores only coarse anchors unless precise location is allowed", () => {
    const state = normalizePushRuntimeState();
    const store = new PushContextStore(state);

    store.recordAnchor({
      placeLabel: "desk",
      mode: "writing",
      preciseLocation: { latitude: 31.2, longitude: 121.5, accuracy: 20 },
      capturedAt: "2026-07-07T10:00:00.000Z"
    }, false);

    expect(state.anchors[0]).toMatchObject({
      placeLabel: "desk",
      mode: "writing",
      preciseLocation: undefined
    });

    store.recordAnchor({
      placeLabel: "library",
      preciseLocation: { latitude: 31.2, longitude: 121.5, accuracy: 20 },
      capturedAt: "2026-07-07T11:00:00.000Z"
    }, true);

    expect(state.anchors[0].preciseLocation).toEqual({
      latitude: 31.2,
      longitude: 121.5,
      accuracy: 20
    });
  });

  it("records feedback timestamps for learning loops", () => {
    const state = normalizePushRuntimeState();
    const store = new PushContextStore(state);
    const event = store.recordFeedback({
      targetId: "local-web",
      candidateId: "oq_one",
      action: "opened-no-write",
      clientId: "phone",
      at: "2026-07-07T11:00:00.000Z"
    });

    expect(event).toMatchObject({
      targetId: "local-web",
      candidateId: "oq_one",
      feedback: "opened-no-write",
      openedAt: "2026-07-07T11:00:00.000Z",
      clientId: "phone"
    });
  });
});

