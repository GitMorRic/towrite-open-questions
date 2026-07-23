import type { DeviceFeedPage } from "./external/device-feed";
import type { OpenQuestionLane } from "./core/types";
import type { PushCandidateType, PushFeedbackAction } from "./push/types";

export type DeviceActionKind = "navigate" | "open-source" | "respond" | "capture" | "feedback" | "complete";
export type DeviceActionIntent = "respond" | "capture" | "open" | "next" | "prev" | "later" | "skipped" | "useful" | "answered" | "opened" | "opened-no-write" | "complete";

export interface DeviceCompletionGuard {
  cardId: string;
  stateVersion: number;
  playlistRevision: string;
}

export type DeviceCompletionConflict =
  | "card-changed"
  | "state-changed"
  | "playlist-changed";

export type DeviceCompletionGuardMatch =
  | { matches: true }
  | { matches: false; conflict: DeviceCompletionConflict };

export interface DeviceSourceRef {
  vaultName?: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  blockId?: string;
  page?: number;
}

export interface DeviceInteractionAction {
  id: string;
  label: string;
  kind: DeviceActionKind;
  enabled: boolean;
  page?: DeviceFeedPage;
  cursor?: string;
  sourceFile?: string;
  questionId?: string;
  candidateId?: string;
  candidateType?: PushCandidateType;
  deliveryId?: string;
  sourceRef?: DeviceSourceRef;
  feedbackAction?: PushFeedbackAction;
  url?: string;
  uri?: string;
  obsidianUri?: string;
  qrText?: string;
  completionGuard?: DeviceCompletionGuard;
}

export interface DeviceButtonMapping {
  button: string;
  action: DeviceActionIntent;
  label: string;
}

export interface DeviceEventInput {
  schemaVersion?: number;
  eventId: string;
  targetId: string;
  deviceId?: string;
  deliveryId?: string;
  candidateId?: string;
  candidateType?: PushCandidateType;
  button?: string;
  action?: DeviceActionIntent;
  occurredAt?: string;
  note?: string;
  /**
   * Required together for `complete`. They bind the mutation to the card that
   * was actually rendered, the authoritative selected state, and the exact
   * local paging snapshot. Navigation events intentionally remain compatible
   * with older firmware and do not require this guard.
   */
  cardId?: string;
  stateVersion?: number;
  playlistRevision?: string;
}

export type GuardedDeviceCompletionEvent = Omit<
  DeviceEventInput,
  "action" | "cardId" | "stateVersion" | "playlistRevision"
> & DeviceCompletionGuard & {
  action: "complete";
};

export interface DeviceEventResult {
  ok: true;
  eventId: string;
  duplicate: boolean;
  action: DeviceActionIntent;
  targetId: string;
  candidateId?: string;
  candidateType?: PushCandidateType;
  deliveryId?: string;
  openUrl?: string;
  obsidianUri?: string;
  feedUrl?: string;
  displayMessage: string;
  cardId?: string;
  stateVersion?: number;
  playlistRevision?: string;
}

export const DEFAULT_DEVICE_BUTTON_MAPPINGS: DeviceButtonMapping[] = [
  { button: "center", action: "respond", label: "回答当前卡片" },
  { button: "center-long", action: "capture", label: "快速记录" },
  { button: "center-double", action: "open", label: "打开原笔记" },
  { button: "left", action: "prev", label: "上一条" },
  { button: "right", action: "next", label: "下一条" },
  { button: "right-long", action: "later", label: "稍后" }
];

export function normalizeDeviceButtonMappings(value: unknown): DeviceButtonMapping[] {
  const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_DEVICE_BUTTON_MAPPINGS;
  const seen = new Set<string>();
  const output: DeviceButtonMapping[] = [];
  for (const item of source) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const button = normalizeShort(record.button, 80);
    const action = normalizeDeviceIntent(record.action);
    if (!button || !action || seen.has(button)) {
      continue;
    }
    seen.add(button);
    output.push({
      button,
      action,
      label: normalizeShort(record.label, 100) || defaultButtonLabel(button, action)
    });
  }
  return output.length > 0 ? output : DEFAULT_DEVICE_BUTTON_MAPPINGS;
}

export function resolveButtonIntent(button: string | undefined, mappings: DeviceButtonMapping[]): DeviceActionIntent | undefined {
  const normalized = normalizeShort(button, 80);
  if (!normalized) {
    return undefined;
  }
  return mappings.find((mapping) => mapping.button === normalized)?.action;
}

export function normalizeDeviceEventInput(body: Record<string, unknown>, mappings: DeviceButtonMapping[]): DeviceEventInput {
  const eventId = normalizeShort(body.eventId, 160);
  const targetId = normalizeShort(body.targetId, 80);
  if (!eventId || !targetId) {
    throw new Error("Missing eventId or targetId.");
  }
  const action = normalizeDeviceIntent(body.action) ?? resolveButtonIntent(normalizeShort(body.button, 80), mappings);
  if (!action) {
    throw new Error("Missing action or mapped button.");
  }
  const candidateType = normalizeCandidateType(body.candidateType);
  const occurredAt = normalizeIso(body.occurredAt);
  const result: DeviceEventInput = {
    schemaVersion: normalizeSchemaVersion(body.schemaVersion),
    eventId,
    targetId,
    deviceId: normalizeShort(body.deviceId, 120),
    deliveryId: normalizeShort(body.deliveryId, 160),
    candidateId: normalizeShort(body.candidateId, 160),
    candidateType,
    button: normalizeShort(body.button, 80),
    action,
    occurredAt,
    note: normalizeShort(body.note, 500)
  };
  if (action === "complete") {
    const guard = normalizeCompletionGuard(body);
    result.cardId = guard.cardId;
    result.stateVersion = guard.stateVersion;
    result.playlistRevision = guard.playlistRevision;
  }
  return result;
}

export function isGuardedDeviceCompletionEvent(
  event: DeviceEventInput
): event is GuardedDeviceCompletionEvent {
  return event.action === "complete"
    && Boolean(event.cardId)
    && Number.isSafeInteger(event.stateVersion)
    && (event.stateVersion ?? 0) > 0
    && Boolean(event.playlistRevision);
}

export function completionGuardForDeviceEvent(
  event: DeviceEventInput
): DeviceCompletionGuard | undefined {
  if (!isGuardedDeviceCompletionEvent(event)) {
    return undefined;
  }
  return {
    cardId: event.cardId,
    stateVersion: event.stateVersion,
    playlistRevision: event.playlistRevision
  };
}

/** Exact, side-effect-free comparison used before mutating a Markdown task. */
export function compareDeviceCompletionGuard(
  received: DeviceCompletionGuard,
  current: DeviceCompletionGuard
): DeviceCompletionGuardMatch {
  if (received.cardId !== current.cardId) {
    return { matches: false, conflict: "card-changed" };
  }
  if (received.stateVersion !== current.stateVersion) {
    return { matches: false, conflict: "state-changed" };
  }
  if (received.playlistRevision !== current.playlistRevision) {
    return { matches: false, conflict: "playlist-changed" };
  }
  return { matches: true };
}

export function feedbackActionForIntent(intent: DeviceActionIntent): PushFeedbackAction | undefined {
  if (intent === "later" || intent === "skipped" || intent === "useful" || intent === "answered" || intent === "opened" || intent === "opened-no-write") {
    return intent;
  }
  if (intent === "respond" || intent === "open" || intent === "capture") {
    return "opened";
  }
  return undefined;
}

export function buildDeviceInputUrl(baseUrl: string | undefined, params: {
  token?: string;
  questionId?: string;
  targetId?: string;
  candidateId?: string;
  deliveryId?: string;
  intent?: DeviceActionIntent;
  sourceRef?: DeviceSourceRef;
}): string | undefined {
  if (params.intent === "complete") {
    return undefined;
  }
  const normalizedToken = params.token?.trim();
  if (!normalizedToken) {
    return undefined;
  }
  const search = new URLSearchParams();
  search.set("token", normalizedToken);
  appendOptional(search, "questionId", params.questionId);
  appendOptional(search, "targetId", params.targetId);
  appendOptional(search, "candidateId", params.candidateId);
  appendOptional(search, "deliveryId", params.deliveryId);
  appendOptional(search, "intent", params.intent);
  appendSourceRef(search, params.sourceRef);
  return joinBasePath(baseUrl, `/device/input?${search.toString()}`);
}

export function buildDeviceGoUrl(baseUrl: string | undefined, params: {
  token?: string;
  targetId?: string;
  intent?: DeviceActionIntent;
  candidateId?: string;
  deliveryId?: string;
  handoff?: string;
}): string | undefined {
  if (params.intent === "complete") {
    return undefined;
  }
  const search = new URLSearchParams();
  if (params.handoff) {
    search.set("handoff", params.handoff);
  } else {
    const normalizedToken = params.token?.trim();
    if (!normalizedToken) {
      return undefined;
    }
    search.set("token", normalizedToken);
  }
  appendOptional(search, "targetId", params.targetId);
  appendOptional(search, "intent", params.intent);
  appendOptional(search, "candidateId", params.candidateId);
  appendOptional(search, "deliveryId", params.deliveryId);
  return joinBasePath(baseUrl, `/device/go?${search.toString()}`);
}

export function sourceRefToObsidianUri(sourceRef: DeviceSourceRef | undefined, fallbackVault?: string): string | undefined {
  const vaultName = sourceRef?.vaultName || fallbackVault;
  const filePath = sourceRef?.filePath;
  if (!vaultName || !filePath) {
    return undefined;
  }
  const fragment = sourceRef?.blockId ? `#^${sourceRef.blockId}` : "";
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(`${filePath}${fragment}`)}`;
}

export function deliveryIdFor(targetId: string, candidateId: string | undefined, generatedAt: string): string | undefined {
  if (!candidateId) {
    return undefined;
  }
  return `del_${slug(targetId)}_${slug(candidateId)}_${slug(generatedAt.slice(0, 19))}`;
}

export function joinBasePath(baseUrl: string | undefined, path: string): string {
  const base = baseUrl?.trim().replace(/\/+$/u, "");
  return base ? `${base}${path}` : path;
}

function appendSourceRef(search: URLSearchParams, sourceRef: DeviceSourceRef | undefined): void {
  if (!sourceRef) {
    return;
  }
  appendOptional(search, "sourceFile", sourceRef.filePath);
  appendOptional(search, "sourceLine", sourceRef.lineStart !== undefined ? String(sourceRef.lineStart) : undefined);
  appendOptional(search, "sourceEndLine", sourceRef.lineEnd !== undefined ? String(sourceRef.lineEnd) : undefined);
  appendOptional(search, "sourceBlockId", sourceRef.blockId);
  appendOptional(search, "sourcePage", sourceRef.page !== undefined ? String(sourceRef.page) : undefined);
}

function appendOptional(search: URLSearchParams, key: string, value: string | undefined): void {
  const normalized = value?.trim();
  if (normalized) {
    search.set(key, normalized);
  }
}

function normalizeDeviceIntent(value: unknown): DeviceActionIntent | undefined {
  return value === "respond" || value === "capture" || value === "open" || value === "next" || value === "prev"
    || value === "later" || value === "skipped" || value === "useful" || value === "answered" || value === "opened" || value === "opened-no-write"
    || value === "complete"
    ? value
    : undefined;
}

function normalizeCompletionGuard(body: Record<string, unknown>): DeviceCompletionGuard {
  const cardId = normalizeOpaqueIdentifier(body.cardId ?? body.card_id, 200);
  const playlistRevision = normalizeOpaqueIdentifier(
    body.playlistRevision ?? body.playlist_revision,
    160
  );
  const stateVersion = normalizePositiveInteger(body.stateVersion ?? body.state_version);
  if (!cardId || !playlistRevision || stateVersion === undefined) {
    throw new Error("Complete requires cardId, stateVersion, and playlistRevision.");
  }
  return { cardId, stateVersion, playlistRevision };
}

function normalizeSchemaVersion(value: unknown): number | undefined {
  const version = Number(value);
  return version === 1 || version === 2 ? version : undefined;
}

function normalizePositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function normalizeOpaqueIdentifier(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized)) {
    return undefined;
  }
  return normalized;
}

function normalizeCandidateType(value: unknown): PushCandidateType | undefined {
  return value === "home-summary" || value === "question" || value === "workflow-file" || value === "article" ? value : undefined;
}

function normalizeIso(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function normalizeShort(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function defaultButtonLabel(button: string, action: DeviceActionIntent): string {
  return `${button}: ${action}`;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/gu, "_")
    .replace(/_+/gu, "_")
    .slice(0, 80);
}

export function laneIntentLabel(lane: OpenQuestionLane | undefined): string {
  return lane === "write" ? "回答 ToWrite" : "回答 ToThink";
}
