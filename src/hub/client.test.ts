import { afterEach, describe, expect, it, vi } from "vitest";
import { HubApiError, HubClient } from "./client";
import { HUB_PROTOCOL_VERSION, type HubCandidateBatch } from "./types";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HubClient", () => {
  it("uses an Authorization header, snake-case wire contract, and never a query token", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => jsonResponse({
      protocol_version: "1",
      batch_id: "hbatch_test",
      accepted: 1,
      rejected: 0
    }));
    const client = createClient(fetcher);

    await client.submitCandidateBatch("rcv_one", candidateBatch());

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hub.example.com/v1/hub/receivers/rcv_one/candidate-batches");
    expect(url).not.toContain("token");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer connector-secret");
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("error");
    expect(init.referrerPolicy).toBe("no-referrer");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ protocol_version: "1", batch_id: "hbatch_test" });
    expect(JSON.stringify(body)).toContain("candidate_ref");
    expect(JSON.stringify(body)).not.toContain("candidateRef");
  });

  it("supports capabilities, context, manual selection, state, and feedback", async () => {
    const responses: unknown[] = [
      {
        protocol_version: "1",
        candidate_batches: true,
        context_observations: true,
        manual_selection: true,
        device_state: true,
        feedback: true,
        long_polling: true,
        encrypted_capture: true,
        max_candidates: 20
      },
      {},
      selectionWire(),
      {
        protocol_version: "1",
        device_id: "dev_test",
        selected: selectionWire(),
        displayed: {
          selection_id: "sel_test",
          content_id: "cnt_test",
          revision_id: "rev_test",
          state_version: 4,
          displayed_at: "2026-07-19T00:01:00Z",
          render_hash: "sha256:test"
        },
        online: true,
        last_seen_at: "2026-07-19T00:01:01Z"
      },
      { protocol_version: "1", event_id: "evt_test", idempotent: false }
    ];
    const fetcher = vi.fn(async () => jsonResponse(responses.shift()));
    const client = createClient(fetcher);

    await expect(client.getCapabilities()).resolves.toMatchObject({ longPolling: true, maxCandidates: 20 });
    await expect(client.submitContextObservations([{
      observationId: "obs_test",
      source: "manual",
      state: "outdoors",
      confidence: 2,
      observedAt: "2026-07-19T00:00:00Z",
      expiresAt: "2026-07-19T00:05:00Z",
      placeLabel: "forest"
    }])).resolves.toBeUndefined();
    await expect(client.selectDeviceContent("dev_test", {
      candidateRef: "hc_test",
      reason: "manual",
      idempotencyKey: "idem_test"
    })).resolves.toMatchObject({
      selectionId: "sel_test",
      selectedContentId: "cnt_test",
      stateVersion: 4
    });
    await expect(client.getDeviceState("dev_test")).resolves.toMatchObject({
      deviceId: "dev_test",
      selected: { selectionId: "sel_test" },
      displayed: { contentId: "cnt_test", stateVersion: 4 },
      online: true
    });
    await expect(client.submitFeedback("sel_test", {
      action: "answered",
      eventId: "evt_test",
      at: "2026-07-19T00:02:00Z",
      noteWritten: true
    })).resolves.toEqual({ protocolVersion: "1", eventId: "evt_test", idempotent: false });

    const contextBody = JSON.parse(String((fetcher.mock.calls[1] as unknown as [unknown, RequestInit])[1].body)) as {
      observations: Array<{ confidence: number }>;
    };
    expect(contextBody.observations[0].confidence).toBe(1);
  });

  it("rejects unsafe base URLs, oversized candidate batches, and HTTP errors", async () => {
    const unsafe = new HubClient(() => ({
      baseUrl: "https://secret:password@hub.example.com?token=bad",
      token: "secret"
    }), { fetch: vi.fn() });
    await expect(unsafe.getCapabilities()).rejects.toThrow(/must not contain credentials/iu);

    const insecurePublic = new HubClient(() => ({
      baseUrl: "http://hub.example.com",
      token: "secret"
    }), { fetch: vi.fn() });
    await expect(insecurePublic.getCapabilities()).rejects.toThrow(/must use HTTPS/iu);

    const originWithPath = new HubClient(() => ({
      baseUrl: "https://hub.example.com/api",
      token: "secret"
    }), { fetch: vi.fn() });
    await expect(originWithPath.getCapabilities()).rejects.toThrow(/canonical origin/iu);

    const localDevelopment = new HubClient(() => ({
      baseUrl: "http://127.0.0.1:8080",
      token: "secret"
    }), { fetch: vi.fn(async () => jsonResponse({ protocol_version: "1" })) });
    await expect(localDevelopment.getCapabilities()).resolves.toMatchObject({ protocolVersion: "1" });

    const client = createClient(vi.fn(async () => jsonResponse({ detail: "forbidden" }, 403)));
    await expect(client.submitCandidateBatch("rcv", {
      ...candidateBatch(),
      candidates: Array.from({ length: 21 }, () => candidateBatch().candidates[0])
    })).rejects.toThrow(/limited to 20/iu);
    await expect(client.getCapabilities()).rejects.toEqual(expect.objectContaining<Partial<HubApiError>>({
      status: 403,
      message: expect.stringContaining("forbidden")
    }));
  });

  it("pulls encrypted captures and ACKs without sending a Vault path", async () => {
    const responses: unknown[] = [{
      items: [{
        capture_id: "cap_queue_one",
        device_id: "dev_test",
        status: "remote_queued",
        ciphertext: "ciphertext_base64url",
        encryption: {
          version: 1,
          algorithm: "ECDH-P256+HKDF-SHA256+A256GCM",
          ephemeral_public_key: { kty: "EC", crv: "P-256", x: "x", y: "y" },
          salt: "salt",
          nonce: "nonce",
          additional_data: "aad",
          hub: {
            selection_id: "sel_test",
            content_id: "cnt_test",
            write_target_ref: "ht_opaque",
            target_revision: "rev_test"
          }
        },
        size_bytes: 128,
        created_at: "2026-07-19T00:00:00Z",
        expires_at: "2026-08-18T00:00:00Z"
      }]
    }, {
      capture_id: "cap_queue_one",
      status: "written_to_vault"
    }];
    const fetcher = vi.fn(async () => jsonResponse(responses.shift()));
    const client = createClient(fetcher);

    await expect(client.getPendingCaptures("recv_test", 5)).resolves.toEqual([
      expect.objectContaining({
        captureId: "cap_queue_one",
        ciphertext: "ciphertext_base64url",
        encryption: expect.objectContaining({
          nonce: "nonce",
          hub: expect.objectContaining({ writeTargetRef: "ht_opaque" })
        })
      })
    ]);
    await expect(client.acknowledgeCapture("cap_queue_one")).resolves.toEqual({
      captureId: "cap_queue_one",
      status: "written_to_vault"
    });

    const [pendingUrl] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const [ackUrl, ackInit] = fetcher.mock.calls[1] as unknown as [string, RequestInit];
    expect(pendingUrl).toBe("https://hub.example.com/v1/receivers/recv_test/captures/pending?limit=5");
    expect(ackUrl).toBe("https://hub.example.com/v1/captures/cap_queue_one/ack");
    expect(String(ackInit.body)).toBe("{}");
    expect(String(ackInit.body)).not.toContain("path");
    expect(ackUrl).not.toContain("Projects");
  });
});

function createClient(fetcher: typeof fetch | ReturnType<typeof vi.fn>) {
  return new HubClient(() => ({
    baseUrl: "https://hub.example.com/",
    token: "connector-secret",
    timeoutMs: 2_000
  }), { fetch: fetcher as typeof fetch });
}

function candidateBatch(): HubCandidateBatch {
  return {
    protocolVersion: HUB_PROTOCOL_VERSION,
    batchId: "hbatch_test",
    generatedAt: "2026-07-19T00:00:00Z",
    candidates: [{
      candidateRef: "hc_test",
      type: "note_continue",
      display: { title: "Continue" },
      sourceRef: "hs_test",
      writeTargetRef: "ht_test",
      allowedActions: ["respond"],
      sensitivity: "normal",
      reasonCode: "stale_note",
      score: 0.8
    }]
  };
}

function selectionWire() {
  return {
    protocol_version: "1",
    selection_id: "sel_test",
    delivery_id: "dlv_test",
    device_id: "dev_test",
    selected_content_id: "cnt_test",
    selected_revision_id: "rev_test",
    state_version: 4,
    selected_at: "2026-07-19T00:00:00Z",
    reason: "manual"
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
