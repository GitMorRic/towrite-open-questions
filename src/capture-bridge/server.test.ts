import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import {
  CAPTURE_BRIDGE_PROTOCOL_VERSION,
  CaptureBridgeCoordinator,
  CaptureBridgeServer,
  CapturePluginBridgeClient,
  LocalTapSelectionService,
  generateCaptureBridgeToken,
  generateCaptureTapId,
  type CaptureBridgeSettings,
  type TapSelectionSnapshot
} from ".";

describe("CaptureBridgeServer", () => {
  it("requires both loopback transport and the dedicated Bearer token", async () => {
    const { server, token } = makeServer();
    const unauthorized = new FakeResponse();
    await invoke(server, new FakeRequest("GET", "/api/v1/integrations/capture/v1/capabilities", "", "127.0.0.1"), unauthorized);
    expect(unauthorized.statusCode).toBe(401);

    const remote = new FakeResponse();
    await invoke(server, new FakeRequest("GET", "/api/v1/integrations/capture/v1/capabilities", "", "100.64.0.2", token), remote);
    expect(remote.statusCode).toBe(403);

    const allowed = new FakeResponse();
    await invoke(server, new FakeRequest("GET", "/api/v1/integrations/capture/v1/capabilities", "", "::ffff:127.0.0.1", token), allowed);
    expect(allowed.statusCode).toBe(200);
    expect(JSON.parse(allowed.body)).toMatchObject({ protocolVersion: CAPTURE_BRIDGE_PROTOCOL_VERSION, handoffs: true });
  });

  it("returns 404 for unknown routes and 413 before parsing oversized JSON", async () => {
    const { server, token } = makeServer();
    const unknown = new FakeResponse();
    await invoke(server, new FakeRequest("GET", "/not-a-route", "", "127.0.0.1", token), unknown);
    expect(unknown.statusCode).toBe(404);

    const oversized = new FakeResponse();
    const handoffId = `hnd_${"a".repeat(22)}`;
    await invoke(server, new FakeRequest(
      "POST",
      `/api/v1/integrations/capture/v1/handoffs/${handoffId}/commit`,
      "x".repeat(1_000_001),
      "127.0.0.1",
      token
    ), oversized);
    expect(oversized.statusCode).toBe(413);
  });
});

describe("CapturePluginBridgeClient", () => {
  it("detects old plugins and registers only the V1 capability contract", async () => {
    const oldClient = new CapturePluginBridgeClient({
      plugins: { getPlugin: () => ({}) }
    } as unknown as App);
    await expect(oldClient.detect(true)).resolves.toMatchObject({ pluginDetected: true, compatible: false });

    const configureConnector = vi.fn(async () => undefined);
    const plugin = {
      getTowriteIntegrationApi: () => ({
        getCapabilities: () => ({
          protocolVersion: CAPTURE_BRIDGE_PROTOCOL_VERSION,
          handoffs: true,
          conflictDetection: true,
          undo: true,
          textCapture: true,
          captureBaseUrl: "https://desktop.example.ts.net:8790",
          ownerLogin: "owner@github",
          tailscaleServeTrusted: true
        }),
        configureConnector,
        openPrefilledCapture: vi.fn(),
        removeConnector: vi.fn()
      })
    };
    const client = new CapturePluginBridgeClient({
      plugins: { getPlugin: () => plugin }
    } as unknown as App);
    const config = {
      connectorId: "towrite-open-questions",
      callbackBaseUrl: "http://127.0.0.1:48322",
      callbackToken: generateCaptureBridgeToken(),
      tapIds: [generateCaptureTapId()],
      ownerLogin: "owner@github",
      registeredAt: "2026-07-20T01:00:00.000Z"
    };
    await expect(client.register(config)).resolves.toMatchObject({ compatible: true, registered: true });
    expect(configureConnector).toHaveBeenCalledWith(config);
  });
});

function makeServer(): { server: CaptureBridgeServer; token: string } {
  const token = generateCaptureBridgeToken();
  const tapId = generateCaptureTapId();
  const selection = new LocalTapSelectionService({
    getFallbackLocalId: () => "local",
    createSnapshot: async (): Promise<TapSelectionSnapshot> => ({
      protocolVersion: CAPTURE_BRIDGE_PROTOCOL_VERSION,
      snapshotId: "snp_server",
      source: "local",
      localId: "local",
      createdAt: "2026-07-20T01:00:00.000Z",
      contentType: "blank_capture",
      title: "Capture",
      prompt: "Write",
      allowedActions: ["capture"],
      intent: "new",
      candidate: {
        schemaVersion: 1,
        id: "target-inbox",
        kind: "inbox",
        action: "append",
        path: "00-Raw/Inbox.md",
        reason: "test",
        confidence: "strong",
        score: 1,
        targetRevision: "missing"
      }
    })
  });
  const coordinator = new CaptureBridgeCoordinator({
    selection,
    isTapAllowed: (value) => value === tapId,
    handoffTtlSeconds: () => 300,
    commitAdapter: {
      commit: vi.fn(),
      undo: vi.fn()
    }
  });
  const settings: CaptureBridgeSettings = {
    enabled: true,
    flow: "local_capture",
    bindHost: "127.0.0.1",
    port: 48322,
    callbackToken: token,
    captureBaseUrl: "https://desktop.example.ts.net:8790",
    tapId,
    ownerLogin: "owner@github",
    handoffTtlSeconds: 300,
    lastRegisteredAt: "",
    lastError: ""
  };
  return {
    token,
    server: new CaptureBridgeServer({ pluginVersion: "test", getSettings: () => settings, coordinator })
  };
}

async function invoke(server: CaptureBridgeServer, request: FakeRequest, response: FakeResponse): Promise<void> {
  await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
    .handleRequest(request, response);
}

class FakeRequest {
  readonly headers: Record<string, string>;
  readonly socket: { remoteAddress: string };

  constructor(
    readonly method: string,
    readonly url: string,
    private readonly body: string,
    remoteAddress: string,
    token = ""
  ) {
    this.headers = token ? { authorization: `Bearer ${token}` } : {};
    this.socket = { remoteAddress };
  }

  on(event: "data" | "end" | "error", listener: ((chunk: Uint8Array | string) => void) | (() => void)): void {
    if (event === "data" && this.body) (listener as (chunk: string) => void)(this.body);
    if (event === "end") (listener as () => void)();
  }
}

class FakeResponse {
  statusCode = 0;
  body = "";
  readonly headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  writeHead(statusCode: number, headers: Record<string, string>): void {
    this.statusCode = statusCode;
    for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
  }

  end(chunk = ""): void {
    this.body += chunk;
  }
}
