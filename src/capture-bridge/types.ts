import type { CaptureCommitResult, CaptureIntent, CaptureTargetCandidate } from "../capture";
import type { HubContentAction, HubContentType, HubDeviceCard } from "../hub";

export const CAPTURE_BRIDGE_PROTOCOL_V1 = "towrite-capture-bridge/v1" as const;
export const CAPTURE_BRIDGE_PROTOCOL_V2 = "towrite-capture-bridge/v2" as const;
/** Kept for source compatibility with existing Capture v1 clients. */
export const CAPTURE_BRIDGE_PROTOCOL_VERSION = CAPTURE_BRIDGE_PROTOCOL_V1;
export const CAPTURE_BRIDGE_LATEST_PROTOCOL_VERSION = CAPTURE_BRIDGE_PROTOCOL_V2;
export type CaptureBridgeProtocolVersion =
  | typeof CAPTURE_BRIDGE_PROTOCOL_V1
  | typeof CAPTURE_BRIDGE_PROTOCOL_V2;
export type CaptureBridgeOperation = "capture" | "complete" | "later";

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
  voiceCapture?: boolean;
  assetUpload?: boolean;
  taskComplete?: boolean;
  availableOperations?: CaptureBridgeOperation[];
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

export interface CapturePluginIntegrationApiV2 extends CapturePluginIntegrationApiV1 {
  getCapabilities(): CaptureBridgeCapabilities | Promise<CaptureBridgeCapabilities>;
}

export interface CapturePluginWithTowriteBridge {
  getTowriteIntegrationApi(version: "1" | "2"):
    | CapturePluginIntegrationApiV1
    | CapturePluginIntegrationApiV2
    | undefined;
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
    dailyItemId?: string;
    dailyTaskRevision?: string;
    /** Local calendar date containing the Daily task; required for taps that cross midnight. */
    dailyDate?: string;
    /** Vault-relative Daily Markdown source, kept internal and never exposed to the phone. */
    dailySourcePath?: string;
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
  availableOperations?: CaptureBridgeOperation[];
}

export interface CaptureBridgeCommitRequest {
  protocolVersion: CaptureBridgeProtocolVersion;
  captureId: string;
  idempotencyKey: string;
  body: string;
  title?: string;
  tags?: string[];
  operation?: CaptureBridgeOperation;
  /** Opaque, single-use assets already staged by the trusted Capture Backend. */
  assetRefs?: string[];
}

export interface CaptureBridgeAssetUploadRequest {
  idempotencyKey: string;
  fileName: string;
  mimeType: string;
  base64: string;
}

export interface CaptureBridgeStagedAsset {
  assetRef: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface CaptureBridgeCommitResult {
  captureId: string;
  path: string;
  action: CaptureTargetCandidate["action"];
  openUri?: string;
  undoToken?: string;
  committedAt: string;
  idempotent?: boolean;
  operation?: CaptureBridgeOperation;
  completed?: boolean;
  snoozedUntil?: string;
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
  commit(
    snapshot: TapSelectionSnapshot,
    request: CaptureBridgeCommitRequest,
    assets?: readonly CaptureBridgeStagedAsset[]
  ): Promise<CaptureCommitResult>;
  complete?(
    snapshot: TapSelectionSnapshot,
    request: CaptureBridgeCommitRequest
  ): Promise<{
    path: string;
    completedAt: string;
    idempotent?: boolean;
  }>;
  later?(
    snapshot: TapSelectionSnapshot,
    request: CaptureBridgeCommitRequest
  ): Promise<{
    path: string;
    snoozedUntil: string;
    idempotent?: boolean;
  }>;
  undo(captureId: string, undoToken: string): Promise<{ undone: boolean }>;
}
