/** Versioned contract shared by the ToWrite connector and Device Hub. */
export const HUB_PROTOCOL_VERSION = "1" as const;

export type HubProtocolVersion = typeof HUB_PROTOCOL_VERSION;

export type HubContentType =
  | "question_prompt"
  | "note_continue"
  | "title_only"
  | "blank_capture"
  | "excerpt"
  | "quote"
  | "on_this_day"
  | "stale_note_nudge"
  | "character_letter"
  | "human_message"
  | "wellbeing_reminder";

export type HubContentAction = "respond" | "capture" | "open" | "next" | "later" | "skip";
export type HubSensitivity = "normal" | "private";

export interface HubDisplayContent {
  /** Explicitly approved for the remote display; never inferred from a note body. */
  title?: string;
  /** Explicitly approved for the remote display; callers must provide this field intentionally. */
  body?: string;
  prompt?: string;
}

export interface HubCandidate {
  candidateRef: string;
  type: HubContentType;
  display: HubDisplayContent;
  sourceRef?: string;
  writeTargetRef?: string;
  allowedActions: HubContentAction[];
  sensitivity: HubSensitivity;
  reasonCode: string;
  score: number;
  expiresAt?: string;
}

export interface HubCandidateBatch {
  protocolVersion: HubProtocolVersion;
  batchId: string;
  generatedAt: string;
  deviceId?: string;
  autoSelect?: boolean;
  policyVersion?: string;
  modelVersion?: string;
  candidates: HubCandidate[];
}

export interface HubCandidateReceipt {
  protocolVersion: string;
  batchId: string;
  accepted: number;
  rejected: number;
}

export type HubContextState =
  | "unknown"
  | "desk_focus"
  | "desk_idle"
  | "walking"
  | "outdoors"
  | "commuting"
  | "exercising"
  | "resting"
  | "do_not_disturb";

export type HubContextSource = "time" | "obsidian_activity" | "device_online" | "manual" | "confirmed_habit";

export interface HubContextObservation {
  observationId: string;
  source: HubContextSource;
  state: HubContextState;
  confidence: number;
  observedAt: string;
  expiresAt: string;
  /** A user-defined semantic label such as `home-desk`; never an exact coordinate or network name. */
  placeLabel?: string;
  receiverId?: string;
  deviceId?: string;
}

export interface HubContextSnapshot {
  state: HubContextState;
  confidence: number;
  observedAt: string;
  expiresAt: string;
  evidence: Array<Pick<HubContextObservation, "observationId" | "source" | "state" | "confidence">>;
}

export interface HubCapabilities {
  protocolVersion: string;
  candidateBatches: boolean;
  contextObservations: boolean;
  manualSelection: boolean;
  deviceState: boolean;
  feedback: boolean;
  longPolling?: boolean;
  encryptedCapture?: boolean;
  maxCandidates: number;
}

export interface HubSelectionRequest {
  contentId?: string;
  candidateRef?: string;
  revisionId?: string;
  reason: "manual" | "policy" | "due" | "trusted_sender";
  score?: number;
  context?: HubContextSnapshot;
  requestVibration?: boolean;
  expiresAt?: string;
  idempotencyKey?: string;
}

export interface HubContentSelection {
  protocolVersion: string;
  selectionId: string;
  deliveryId: string;
  deviceId: string;
  selectedContentId: string;
  selectedRevisionId: string;
  stateVersion: number;
  selectedAt: string;
  reason: string;
  score?: number;
  expiresAt?: string;
  card?: HubDeviceCard;
}

export interface HubDeviceCard {
  contentId: string;
  revisionId: string;
  contentType: HubContentType;
  title?: string;
  body?: string;
  prompt?: string;
  actions: HubContentAction[];
  reason?: string;
  contentHash?: string;
  expiresAt?: string;
}

export interface HubDisplayedState {
  selectionId: string;
  contentId: string;
  revisionId: string;
  stateVersion: number;
  displayedAt: string;
  renderHash?: string;
  card?: HubDeviceCard;
}

export interface HubDeviceState {
  protocolVersion: string;
  deviceId: string;
  selected?: HubContentSelection;
  displayed?: HubDisplayedState;
  online: boolean;
  lastSeenAt?: string;
  inSync?: boolean;
  tapUrl?: string;
}

export type HubFeedbackAction = "useful" | "skipped" | "later" | "answered" | "opened_no_write" | "opened";

export interface HubSelectionFeedback {
  action: HubFeedbackAction;
  eventId: string;
  at: string;
  noteWritten?: boolean;
}

export interface HubFeedbackReceipt {
  protocolVersion: string;
  eventId: string;
  idempotent: boolean;
}

export interface HubCapturePlaintext {
  protocolVersion: HubProtocolVersion;
  captureId: string;
  selectionId: string;
  contentId: string;
  intent: "respond" | "capture" | "open";
  body: string;
  writeTargetRef?: string;
  targetRevision?: string;
  createdAt: string;
}

export interface HubCaptureEncryptionEnvelope {
  version: 1;
  algorithm: "ECDH-P256+HKDF-SHA256+A256GCM";
  ephemeralPublicKey: JsonWebKey;
  salt: string;
  iv: string;
  ciphertext: string;
  additionalData?: string;
}

/**
 * Relay metadata for an encrypted capture. The Hub may route the opaque
 * identifiers, but it never receives the receiver private key or a Vault path.
 */
export interface HubPendingCaptureContext {
  selectionId?: string;
  contentId?: string;
  intent?: string;
  writeTargetRef?: string;
  targetRevision?: string;
}

export interface HubPendingCaptureEncryption {
  version?: number;
  algorithm?: string;
  ephemeralPublicKey?: JsonWebKey;
  salt?: string;
  nonce?: string;
  additionalData?: string;
  hub?: HubPendingCaptureContext;
}

export interface HubPendingCapture {
  /** Queue identifier used only for pull/ack. The encrypted plaintext owns the capture id used in the Vault. */
  captureId: string;
  deviceId?: string;
  status: "remote_queued";
  ciphertext: string;
  encryption: HubPendingCaptureEncryption;
  sizeBytes: number;
  createdAt: string;
  expiresAt?: string;
}

export interface HubCaptureAckReceipt {
  captureId: string;
  status: "written_to_vault";
}
