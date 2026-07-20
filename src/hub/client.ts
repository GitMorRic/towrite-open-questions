import {
  HUB_PROTOCOL_VERSION,
  type HubCandidateBatch,
  type HubCandidateReceipt,
  type HubCapabilities,
  type HubCaptureAckReceipt,
  type HubContentSelection,
  type HubContextObservation,
  type HubDeviceCard,
  type HubDeviceState,
  type HubDisplayedState,
  type HubFeedbackReceipt,
  type HubPendingCapture,
  type HubPendingCaptureEncryption,
  type HubSelectionFeedback,
  type HubSelectionRequest
} from "./types";
import { requestHub } from "./http";

export interface HubClientSettings {
  baseUrl: string;
  /** Connector/user bearer token. It is sent only in an Authorization header. */
  token: string;
  timeoutMs?: number;
}

export interface HubClientOptions {
  fetch?: typeof fetch;
}

export class HubApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "HubApiError";
  }
}

export interface HubClientLike {
  getCapabilities(): Promise<HubCapabilities>;
  submitCandidateBatch(receiverId: string, batch: HubCandidateBatch): Promise<HubCandidateReceipt>;
  submitContextObservations(observations: readonly HubContextObservation[]): Promise<void>;
  selectDeviceContent(deviceId: string, request: HubSelectionRequest): Promise<HubContentSelection>;
  getDeviceState(deviceId: string): Promise<HubDeviceState>;
  submitFeedback(selectionId: string, feedback: HubSelectionFeedback): Promise<HubFeedbackReceipt>;
}

export interface HubCaptureClientLike {
  getPendingCaptures(receiverId: string, limit?: number): Promise<HubPendingCapture[]>;
  acknowledgeCapture(captureId: string): Promise<HubCaptureAckReceipt>;
}

export class HubClient implements HubClientLike, HubCaptureClientLike {
  private readonly fetcher?: typeof fetch;

  constructor(
    private readonly getSettings: () => HubClientSettings,
    options: HubClientOptions = {}
  ) {
    this.fetcher = options.fetch;
  }

  async getCapabilities(): Promise<HubCapabilities> {
    return normalizeCapabilities(await this.requestJson("/v1/hub/capabilities", { method: "GET" }));
  }

  async submitCandidateBatch(receiverId: string, batch: HubCandidateBatch): Promise<HubCandidateReceipt> {
    assertIdentifier(receiverId, "receiver ID");
    if (batch.candidates.length > 20) {
      throw new Error("Device Hub candidate batches are limited to 20 candidates.");
    }
    const response = await this.requestJson(`/v1/hub/receivers/${encodeURIComponent(receiverId)}/candidate-batches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(candidateBatchToWire(batch))
    });
    const record = asRecord(response, "candidate batch receipt");
    return {
      protocolVersion: readString(record, "protocol_version", "protocolVersion") || HUB_PROTOCOL_VERSION,
      batchId: readString(record, "batch_id", "batchId") || batch.batchId,
      accepted: readNonNegativeInteger(record, "accepted"),
      rejected: readNonNegativeInteger(record, "rejected")
    };
  }

  async submitContextObservations(observations: readonly HubContextObservation[]): Promise<void> {
    if (observations.length === 0) {
      return;
    }
    if (observations.length > 100) {
      throw new Error("A Device Hub context batch is limited to 100 observations.");
    }
    await this.requestJson("/v1/hub/context/observations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        protocol_version: HUB_PROTOCOL_VERSION,
        observations: observations.map(contextObservationToWire)
      })
    });
  }

  async selectDeviceContent(deviceId: string, request: HubSelectionRequest): Promise<HubContentSelection> {
    assertIdentifier(deviceId, "device ID");
    if (!request.contentId && !request.candidateRef) {
      throw new Error("A manual Device Hub selection needs a content ID or candidate reference.");
    }
    const response = await this.requestJson(`/v1/hub/devices/${encodeURIComponent(deviceId)}/selections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(selectionRequestToWire(request))
    });
    return normalizeSelection(response);
  }

  async getDeviceState(deviceId: string): Promise<HubDeviceState> {
    assertIdentifier(deviceId, "device ID");
    return normalizeDeviceState(await this.requestJson(`/v1/hub/devices/${encodeURIComponent(deviceId)}/state`, {
      method: "GET"
    }));
  }

  async submitFeedback(selectionId: string, feedback: HubSelectionFeedback): Promise<HubFeedbackReceipt> {
    assertIdentifier(selectionId, "selection ID");
    const response = asRecord(await this.requestJson(`/v1/hub/selections/${encodeURIComponent(selectionId)}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        protocol_version: HUB_PROTOCOL_VERSION,
        action: feedback.action,
        event_id: feedback.eventId,
        at: feedback.at,
        note_written: feedback.noteWritten
      })
    }), "feedback receipt");
    return {
      protocolVersion: readString(response, "protocol_version", "protocolVersion") || HUB_PROTOCOL_VERSION,
      eventId: readString(response, "event_id", "eventId") || feedback.eventId,
      idempotent: response.idempotent === true
    };
  }

  async getPendingCaptures(receiverId: string, limit = 20): Promise<HubPendingCapture[]> {
    assertIdentifier(receiverId, "receiver ID");
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const response = asRecord(await this.requestJson(
      `/v1/receivers/${encodeURIComponent(receiverId)}/captures/pending?limit=${safeLimit}`,
      { method: "GET" }
    ), "pending capture list");
    if (!Array.isArray(response.items)) {
      throw new Error("Device Hub response is missing pending capture items.");
    }
    return response.items.map(normalizePendingCapture);
  }

  async acknowledgeCapture(captureId: string): Promise<HubCaptureAckReceipt> {
    assertIdentifier(captureId, "capture ID");
    const response = asRecord(await this.requestJson(`/v1/captures/${encodeURIComponent(captureId)}/ack`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // The existing ACK model defaults its optional path to empty. Omitting the
      // field entirely guarantees that no local Vault path crosses the wire.
      body: JSON.stringify({})
    }), "capture acknowledgement");
    const status = readRequiredString(response, "status");
    if (status !== "written_to_vault") {
      throw new Error("Device Hub returned an invalid capture acknowledgement status.");
    }
    return {
      captureId: readRequiredString(response, "capture_id", "captureId"),
      status
    };
  }

  private async requestJson(path: string, init: RequestInit): Promise<unknown> {
    const settings = this.getSettings();
    const baseUrl = normalizeBaseUrl(settings.baseUrl);
    const token = settings.token.trim();
    if (!token) {
      throw new Error("Device Hub connector token is missing.");
    }
    const controller = new AbortController();
    const timeoutMs = Math.max(250, Math.min(120_000, settings.timeoutMs ?? 8_000));
    const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await requestHub(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        headers: {
          accept: "application/json",
          ...headersToRecord(init.headers),
          authorization: `Bearer ${token}`
        }
      }, this.fetcher);
      if (!response.ok) {
        throw new HubApiError(response.status, await readErrorMessage(response));
      }
      if (response.status === 204) {
        return {};
      }
      const contentType = response.headers?.get?.("content-type") ?? "application/json";
      if (!contentType.toLowerCase().includes("json")) {
        throw new HubApiError(response.status, "Device Hub returned a non-JSON response.");
      }
      return await response.json() as unknown;
    } catch (error) {
      if (error instanceof HubApiError) {
        throw error;
      }
      if (isAbortError(error)) {
        throw new Error(`Device Hub timed out after ${timeoutMs}ms.`);
      }
      throw error;
    } finally {
      globalThis.clearTimeout(timer);
    }
  }
}

function candidateBatchToWire(batch: HubCandidateBatch): Record<string, unknown> {
  return {
    protocol_version: batch.protocolVersion,
    batch_id: batch.batchId,
    generated_at: batch.generatedAt,
    device_id: batch.deviceId,
    auto_select: batch.autoSelect,
    policy_version: batch.policyVersion,
    model_version: batch.modelVersion,
    candidates: batch.candidates.map((candidate) => ({
      candidate_ref: candidate.candidateRef,
      type: candidate.type,
      display: candidate.display,
      source_ref: candidate.sourceRef,
      write_target_ref: candidate.writeTargetRef,
      allowed_actions: candidate.allowedActions,
      sensitivity: candidate.sensitivity,
      reason_code: candidate.reasonCode,
      score: candidate.score,
      expires_at: candidate.expiresAt
    }))
  };
}

function contextObservationToWire(observation: HubContextObservation): Record<string, unknown> {
  return {
    observation_id: observation.observationId,
    source: observation.source,
    state: observation.state,
    confidence: clamp(observation.confidence, 0, 1),
    observed_at: observation.observedAt,
    expires_at: observation.expiresAt,
    place_label: observation.placeLabel,
    receiver_id: observation.receiverId,
    device_id: observation.deviceId
  };
}

function selectionRequestToWire(request: HubSelectionRequest): Record<string, unknown> {
  return {
    protocol_version: HUB_PROTOCOL_VERSION,
    content_id: request.contentId,
    candidate_ref: request.candidateRef,
    revision_id: request.revisionId,
    reason: request.reason,
    score: request.score,
    context: request.context ? {
      state: request.context.state,
      confidence: clamp(request.context.confidence, 0, 1),
      observed_at: request.context.observedAt,
      expires_at: request.context.expiresAt,
      evidence: request.context.evidence.map((item) => ({
        observation_id: item.observationId,
        source: item.source,
        state: item.state,
        confidence: clamp(item.confidence, 0, 1)
      }))
    } : undefined,
    request_vibration: request.requestVibration,
    expires_at: request.expiresAt,
    idempotency_key: request.idempotencyKey
  };
}

function normalizeCapabilities(value: unknown): HubCapabilities {
  const record = asRecord(value, "capabilities");
  return {
    protocolVersion: readString(record, "protocol_version", "protocolVersion"),
    candidateBatches: readBoolean(record, "candidate_batches", "candidateBatches"),
    contextObservations: readBoolean(record, "context_observations", "contextObservations"),
    manualSelection: readBoolean(record, "manual_selection", "manualSelection"),
    deviceState: readBoolean(record, "device_state", "deviceState"),
    feedback: readBoolean(record, "feedback"),
    longPolling: readOptionalBoolean(record, "long_polling", "longPolling"),
    encryptedCapture: readOptionalBoolean(record, "encrypted_capture", "encryptedCapture"),
    maxCandidates: readNonNegativeInteger(record, "max_candidates", "maxCandidates") || 20
  };
}

function normalizeSelection(value: unknown): HubContentSelection {
  const record = asRecord(value, "selection");
  return {
    protocolVersion: readString(record, "protocol_version", "protocolVersion") || HUB_PROTOCOL_VERSION,
    selectionId: readRequiredString(record, "selection_id", "selectionId"),
    deliveryId: readRequiredString(record, "delivery_id", "deliveryId"),
    deviceId: readRequiredString(record, "device_id", "deviceId"),
    selectedContentId: readRequiredString(record, "selected_content_id", "selectedContentId"),
    selectedRevisionId: readRequiredString(record, "selected_revision_id", "selectedRevisionId"),
    stateVersion: readNonNegativeInteger(record, "state_version", "stateVersion"),
    selectedAt: readRequiredString(record, "selected_at", "selectedAt"),
    reason: readString(record, "reason"),
    score: readOptionalNumber(record, "score"),
    expiresAt: readOptionalString(record, "expires_at", "expiresAt"),
    card: record.card ? normalizeDeviceCard(record.card) : undefined
  };
}

function normalizeDeviceState(value: unknown): HubDeviceState {
  const record = asRecord(value, "device state");
  const selectedValue = record.selected;
  const displayedValue = record.displayed;
  return {
    protocolVersion: readString(record, "protocol_version", "protocolVersion") || HUB_PROTOCOL_VERSION,
    deviceId: readRequiredString(record, "device_id", "deviceId"),
    selected: selectedValue ? normalizeSelection(selectedValue) : undefined,
    displayed: displayedValue ? normalizeDisplayedState(displayedValue) : undefined,
    online: record.online === true,
    lastSeenAt: readOptionalString(record, "last_seen_at", "lastSeenAt"),
    inSync: readOptionalBoolean(record, "in_sync", "inSync"),
    tapUrl: record.tap && typeof record.tap === "object"
      ? readOptionalString(record.tap as Record<string, unknown>, "url")
      : readOptionalString(record, "tap_url", "tapUrl")
  };
}

function normalizeDisplayedState(value: unknown): HubDisplayedState {
  const record = asRecord(value, "displayed state");
  return {
    selectionId: readRequiredString(record, "selection_id", "selectionId"),
    contentId: readRequiredString(record, "content_id", "contentId"),
    revisionId: readRequiredString(record, "revision_id", "revisionId"),
    stateVersion: readNonNegativeInteger(record, "state_version", "stateVersion"),
    displayedAt: readRequiredString(record, "displayed_at", "displayedAt"),
    renderHash: readOptionalString(record, "render_hash", "renderHash"),
    card: record.card ? normalizeDeviceCard(record.card) : undefined
  };
}

function normalizePendingCapture(value: unknown): HubPendingCapture {
  const record = asRecord(value, "pending capture");
  const status = readRequiredString(record, "status");
  if (status !== "remote_queued") {
    throw new Error("Device Hub returned a non-pending capture in the pending queue.");
  }
  const encryption = normalizePendingCaptureEncryption(record.encryption);
  return {
    captureId: readRequiredString(record, "capture_id", "captureId"),
    deviceId: readOptionalString(record, "device_id", "deviceId"),
    status,
    ciphertext: readRequiredString(record, "ciphertext"),
    encryption,
    sizeBytes: readNonNegativeInteger(record, "size_bytes", "sizeBytes"),
    createdAt: readRequiredString(record, "created_at", "createdAt"),
    expiresAt: readOptionalString(record, "expires_at", "expiresAt")
  };
}

function normalizePendingCaptureEncryption(value: unknown): HubPendingCaptureEncryption {
  const record = asRecord(value, "pending capture encryption metadata");
  const ephemeral = record.ephemeral_public_key ?? record.ephemeralPublicKey;
  const hubValue = record.hub;
  const hub = hubValue && typeof hubValue === "object" && !Array.isArray(hubValue)
    ? hubValue as Record<string, unknown>
    : undefined;
  return {
    version: typeof record.version === "number" && Number.isFinite(record.version) ? Math.floor(record.version) : undefined,
    algorithm: readOptionalString(record, "algorithm"),
    ephemeralPublicKey: ephemeral && typeof ephemeral === "object" && !Array.isArray(ephemeral)
      ? ephemeral as JsonWebKey
      : undefined,
    salt: readOptionalString(record, "salt"),
    nonce: readOptionalString(record, "nonce", "iv"),
    additionalData: readOptionalString(record, "additional_data", "additionalData"),
    hub: hub ? {
      selectionId: readOptionalString(hub, "selection_id", "selectionId"),
      contentId: readOptionalString(hub, "content_id", "contentId"),
      intent: readOptionalString(hub, "intent"),
      writeTargetRef: readOptionalString(hub, "write_target_ref", "writeTargetRef"),
      targetRevision: readOptionalString(hub, "target_revision", "targetRevision")
    } : undefined
  };
}

function normalizeDeviceCard(value: unknown): HubDeviceCard {
  const record = asRecord(value, "device card");
  const actions = Array.isArray(record.actions)
    ? record.actions.filter((action): action is HubDeviceCard["actions"][number] => typeof action === "string")
    : [];
  return {
    contentId: readRequiredString(record, "content_id", "contentId"),
    revisionId: readRequiredString(record, "revision_id", "revisionId"),
    contentType: readRequiredString(record, "content_type", "contentType") as HubDeviceCard["contentType"],
    title: readOptionalString(record, "title"),
    body: readOptionalString(record, "body"),
    prompt: readOptionalString(record, "prompt"),
    actions,
    reason: readOptionalString(record, "reason"),
    contentHash: readOptionalString(record, "content_hash", "contentHash"),
    expiresAt: readOptionalString(record, "expires_at", "expiresAt")
  };
}

function normalizeBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Device Hub URL must be a valid HTTPS origin.");
  }
  const hostname = parsed.hostname.toLowerCase();
  const localDevelopment = hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname === "127.0.0.1"
    || hostname === "[::1]";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && localDevelopment)) {
    throw new Error("Device Hub URL must use HTTPS (HTTP is allowed only for localhost development).");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Device Hub URL must not contain credentials, query parameters, or a fragment.");
  }
  if (parsed.pathname !== "/") {
    throw new Error("Device Hub URL must be a canonical origin without an API path.");
  }
  return parsed.origin;
}

function assertIdentifier(value: string, label: string): void {
  if (!value.trim() || value.length > 160 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`Invalid Device Hub ${label}.`);
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `Device Hub returned HTTP ${response.status}.`;
  try {
    const value = await response.json() as unknown;
    if (value && typeof value === "object") {
      const detail = (value as Record<string, unknown>).detail ?? (value as Record<string, unknown>).message;
      if (typeof detail === "string" && detail.trim()) {
        return `${fallback} ${detail.trim().slice(0, 240)}`;
      }
    }
  } catch {
    // Error bodies are optional and must never hide the status code.
  }
  return fallback;
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }
  const result: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Device Hub returned an invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string {
  return readOptionalString(record, ...keys) ?? "";
}

function readRequiredString(record: Record<string, unknown>, ...keys: string[]): string {
  const value = readOptionalString(record, ...keys);
  if (!value) {
    throw new Error(`Device Hub response is missing ${keys[0]}.`);
  }
  return value;
}

function readOptionalString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readBoolean(record: Record<string, unknown>, ...keys: string[]): boolean {
  return readOptionalBoolean(record, ...keys) === true;
}

function readOptionalBoolean(record: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    if (typeof record[key] === "boolean") {
      return record[key] as boolean;
    }
  }
  return undefined;
}

function readNonNegativeInteger(record: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
  }
  return 0;
}

function readOptionalNumber(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function isAbortError(error: unknown): boolean {
  return Boolean(error) && typeof error === "object" && (error as { name?: unknown }).name === "AbortError";
}
