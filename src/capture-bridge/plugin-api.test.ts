import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { CapturePluginBridgeClient } from "./plugin-api";
import { CAPTURE_BRIDGE_PROTOCOL_VERSION, type CaptureBridgeConnectorConfig } from "./types";

function appWithPlugin(plugin: unknown): App {
  return {
    plugins: {
      getPlugin: vi.fn(() => plugin)
    }
  } as unknown as App;
}

describe("CapturePluginBridgeClient", () => {
  it("reports an actionable compatibility error for Capture 0.5.81-style plugins", async () => {
    const client = new CapturePluginBridgeClient(appWithPlugin({ manifest: { version: "0.5.81" } }));

    await expect(client.detect(true)).resolves.toMatchObject({
      running: true,
      pluginDetected: true,
      compatible: false,
      registered: false,
      error: "Installed Capture plugin does not support towrite-capture-bridge/v1."
    });
  });

  it("registers the versioned connector without reading Capture plugin storage", async () => {
    const configureConnector = vi.fn<(config: CaptureBridgeConnectorConfig) => Promise<void>>(async () => undefined);
    const client = new CapturePluginBridgeClient(appWithPlugin({
      getTowriteIntegrationApi: vi.fn((version: string) => version === "1" ? {
        getCapabilities: async () => ({
          protocolVersion: CAPTURE_BRIDGE_PROTOCOL_VERSION,
          handoffs: true,
          conflictDetection: true,
          undo: true,
          textCapture: true,
          tailscaleServeTrusted: true
        }),
        configureConnector,
        openPrefilledCapture: vi.fn(),
        removeConnector: vi.fn()
      } : undefined)
    }));
    const config: CaptureBridgeConnectorConfig = {
      connectorId: "towrite-open-questions",
      callbackBaseUrl: "http://127.0.0.1:48322",
      callbackToken: "a".repeat(43),
      tapIds: ["tap_0123456789abcdefghijkl"],
      ownerLogin: "GitMorRic@github",
      registeredAt: "2026-07-20T00:00:00.000Z"
    };

    await expect(client.register(config)).resolves.toMatchObject({
      compatible: true,
      registered: true
    });
    expect(configureConnector).toHaveBeenCalledTimes(1);
    expect(configureConnector).toHaveBeenCalledWith(config);
  });
});
