import type { App } from "obsidian";
import {
  CAPTURE_BRIDGE_PROTOCOL_VERSION,
  CAPTURE_BRIDGE_PROTOCOL_V2,
  type CaptureBridgeConnectorConfig,
  type CaptureBridgeRuntimeStatus,
  type CapturePluginIntegrationApiV1,
  type CapturePluginIntegrationApiV2,
  type CapturePluginWithTowriteBridge
} from "./types";

const CAPTURE_PLUGIN_ID = "ai-capture-companion";

interface AppWithPluginManager extends App {
  plugins?: {
    getPlugin(id: string): unknown;
  };
}

export class CapturePluginBridgeClient {
  private status: CaptureBridgeRuntimeStatus = {
    running: false,
    pluginDetected: false,
    compatible: false,
    registered: false
  };

  constructor(private readonly app: App) {}

  getStatus(running: boolean): CaptureBridgeRuntimeStatus {
    return { ...this.status, running };
  }

  async detect(running: boolean): Promise<CaptureBridgeRuntimeStatus> {
    const plugin = (this.app as AppWithPluginManager).plugins?.getPlugin(CAPTURE_PLUGIN_ID) as Partial<CapturePluginWithTowriteBridge> | undefined;
    if (!plugin) {
      this.status = { running, pluginDetected: false, compatible: false, registered: false, error: "Capture plugin is not loaded." };
      return this.getStatus(running);
    }
    if (typeof plugin.getTowriteIntegrationApi !== "function") {
      this.status = {
        running,
        pluginDetected: true,
        compatible: false,
        registered: false,
        error: "Installed Capture plugin does not support towrite-capture-bridge/v1."
      };
      return this.getStatus(running);
    }
    try {
      const api = preferredApi(plugin);
      if (!api) throw new Error("Capture plugin returned no compatible integration API.");
      const capabilities = await api.getCapabilities();
      if (!isCompatibleCapabilities(capabilities)) {
        throw new Error("Capture plugin does not advertise the required handoff capabilities.");
      }
      this.status = { running, pluginDetected: true, compatible: true, registered: this.status.registered, capabilities };
    } catch (error) {
      this.status = {
        running,
        pluginDetected: true,
        compatible: false,
        registered: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
    return this.getStatus(running);
  }

  async register(config: CaptureBridgeConnectorConfig): Promise<CaptureBridgeRuntimeStatus> {
    const plugin = (this.app as AppWithPluginManager).plugins?.getPlugin(CAPTURE_PLUGIN_ID) as Partial<CapturePluginWithTowriteBridge> | undefined;
    if (!plugin) {
      this.status = { running: true, pluginDetected: false, compatible: false, registered: false, error: "Capture plugin is not loaded." };
      return this.getStatus(true);
    }
    if (typeof plugin.getTowriteIntegrationApi !== "function") {
      this.status = {
        running: true,
        pluginDetected: true,
        compatible: false,
        registered: false,
        error: "Installed Capture plugin does not support towrite-capture-bridge/v1."
      };
      return this.getStatus(true);
    }
    let api: CapturePluginIntegrationApiV1 | CapturePluginIntegrationApiV2 | undefined;
    try {
      api = preferredApi(plugin);
      if (!api) throw new Error("Capture plugin returned no compatible integration API.");
      const capabilities = await api.getCapabilities();
      if (!isCompatibleCapabilities(capabilities)) {
        throw new Error("Capture plugin does not advertise the required handoff capabilities.");
      }
      await api.configureConnector(config);
      this.status = { running: true, pluginDetected: true, compatible: true, registered: true, capabilities };
    } catch (error) {
      this.status = {
        running: true,
        pluginDetected: true,
        compatible: Boolean(api),
        registered: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
    return this.getStatus(true);
  }

  async openPrefilledCapture(input: { tapId?: string; handoffId?: string }): Promise<void> {
    const api = this.getApi();
    if (!api) throw new Error("Compatible Capture plugin is not loaded.");
    await api.openPrefilledCapture(input);
  }

  async remove(connectorId: string): Promise<void> {
    const api = this.getApi();
    if (api) await api.removeConnector(connectorId);
    this.status.registered = false;
  }

  private getApi(): CapturePluginIntegrationApiV1 | CapturePluginIntegrationApiV2 | undefined {
    const plugin = (this.app as AppWithPluginManager).plugins?.getPlugin(CAPTURE_PLUGIN_ID) as Partial<CapturePluginWithTowriteBridge> | undefined;
    return preferredApi(plugin);
  }
}

function preferredApi(
  plugin: Partial<CapturePluginWithTowriteBridge> | undefined
): CapturePluginIntegrationApiV1 | CapturePluginIntegrationApiV2 | undefined {
  if (typeof plugin?.getTowriteIntegrationApi !== "function") return undefined;
  return plugin.getTowriteIntegrationApi("2") ?? plugin.getTowriteIntegrationApi("1");
}

function isCompatibleCapabilities(
  capabilities: Awaited<ReturnType<CapturePluginIntegrationApiV1["getCapabilities"]>>
): boolean {
  return (capabilities.protocolVersion === CAPTURE_BRIDGE_PROTOCOL_V2
      || capabilities.protocolVersion === CAPTURE_BRIDGE_PROTOCOL_VERSION)
    && capabilities.handoffs
    && capabilities.conflictDetection;
}
