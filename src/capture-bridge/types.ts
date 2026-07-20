import type { CaptureCommitResult, CaptureIntent, CaptureTargetCandidate } from "../capture";
import type { HubContentAction, HubContentType, HubDeviceCard } from "../hub";

export const CAPTURE_BRIDGE_PROTOCOL_VERSION = "towrite-capture-bridge/v1" as const;
export type CaptureBridgeProtocolVersion = typeof CAPTURE_BRIDGE_PROTOCOL_VERSION;

export type CaptureBridgeFlow = "local_capture" | "hub_e2ee";

export interface CaptureBridgeSettings {
  enabled: boolean;
  flow: CaptureBridgeFlow;
  bindHost: "127.0.0.1";
  port: number;
  /** Dedicated callback credential. It is never shared with the External API or put in a URL. */
  callbackToken: string;
  captureBaseUrl: string;
  tapId: string;
  ownerLogin: string;
  handoffTtlSeconds: number;
  lastRegisteredAt: string;
  lastError: string;
}

export interface CaptureBridgeConnectorConfig {
  connectorId: string;
  callbackBaseUrl: string;
  callbackToken: string;
  tapIds: string[];
  ownerLogin: string;
  registeredAt: string;
}

export interface CaptureBridgeCapabilities {
  protocolVersion: CaptureBridgeProtocolVersion;
  handoffs: boolean;
  conflictDetection: boolean;
  undo: boolean;
  textCapture: boolean;
  pluginVersion?: string;
  backendOnline?: boolean;
  /** Safe canonical origin reported by the Capture plugin; never includes a token or path. */
  captureBaseUrl?: string;
  /** Trusted Tailscale Serve identity reported by the Capture plugin. */
  ownerLogin?: string;
  tailscaleServeTrusted?: boolean;
}

export interface CapturePluginIntegrationApiV1 {
  getCapabilities(): CaptureBridgeCapabilities | Promise<CaptureBridgeCapabilities>;
  configureConnector(config: CaptureBridgeConnectorConfig): void | Promise<void>;
  openPrefilledCapture(input: { tapId?: string; handoffId?: string }): void | Promise<void>;
  removeConnector(connectorId: string): void | Promise<void>;
}

export interface CapturePluginWithTowriteBridge {
  getTowriteIntegrationApi(version: "1"): CapturePluginIntegrationApiV1 | undefined;
}

export type TapSelectionSource = "displayed" | "selected" | "local";

export interface TapSelectionReference {
  source: TapSelectionSource;
  contentId?: string;
  localId?: string;
  card?: HubDeviceCard;
}

export interface TapSelectionSnapshot {
  protocolVersion: CaptureBridgeProtocolVersion;
  snapshotId: string;
  source: TapSelectionSource;
  sourceContentId?: string;
  localId?: string;
  createdAt: string;
  contentType: HubContentType;
  title: string;
  prompt: string;
  /** Only content already approved for device display may appear here. */
  body?: string;
  allowedActions: HubContentAction[];
  intent: CaptureIntent;
  /** Internal only. The phone cannot replace this candidate or its revision. */
  candidate: CaptureTargetCandidate;
  sourceContext?: {
    file?: string;
    questionId?: string;
  };
}

export interface CaptureBridgeHandoffResponse {
  protocolVersion: CaptureBridgeProtocolVersion;
  handoffId: string;
  tapId: string;
  captureId: string;
  expiresAt: string;
  context: {
    contentType: HubContentType;
    title: string;
    prompt: string;
    body?: string;
  };
  target: {
    kind: CaptureTargetCandidate["kind"];
    action: CaptureTargetCandidate["action"];
    displayPath: string;
    heading?: string;
  };
  allowedFields: ["body", "title", "tags"];
}

export interface CaptureBridgeCommitRequest {
  protocolVersion: CaptureBridgeProtocolVersion;
  captureId: string;
  idempotencyKey: string;
  body: string;
  title?: string;
  tags?: string[];
}

export interface CaptureBridgeCommitResult {
  captureId: string;
  path: string;
  action: CaptureTargetCandidate["action"];
  openUri?: string;
  undoToken?: string;
  committedAt: string;
  idempotent?: boolean;
}

export interface CaptureBridgeUndoRequest {
  undoToken: string;
}

export interface CaptureBridgeRuntimeStatus {
  running: boolean;
  pluginDetected: boolean;
  compatible: boolean;
  registered: boolean;
  capabilities?: CaptureBridgeCapabilities;
  error?: string;
}

export interface CaptureBridgeCommitAdapter {
  commit(snapshot: TapSelectionSnapshot, request: CaptureBridgeCommitRequest): Promise<CaptureCommitResult>;
  undo(captureId: string, undoToken: string): Promise<{ undone: boolean }>;
}
