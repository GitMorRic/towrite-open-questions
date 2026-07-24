import type { DeviceFeedPage } from "./external/device-feed";
import type { OpenQuestionLane } from "./core/types";
import type { PushCandidateType, PushFeedbackAction } from "./push/types";

export type DeviceActionKind = "navigate" | "open-source" | "respond" | "capture" | "feedback" | "complete";
export type DeviceCommandAction =
  | "open_current"
  | "start_open"
  | "create_note"
  | "record_reserved"
  | "toggle_timer"
  | "pause_task"
  | "resume_task"
  | "page_prev"
  | "page_next"
  | "task_prev"
  | "task_next";
export type DeviceActionIntent =
  | "respond"
  | "capture"
  | "open"
  | "next"
  | "prev"
  | "later"
  | "skipped"
  | "useful"
  | "answered"
  | "opened"
  | "opened-no-write"
  | "complete"
  | DeviceCommandAction;

export type DevicePhysicalButton = "primary" | "left" | "right";
export type DeviceGesture = "single" | "double" | "long";

export interface DeviceDisplayedTuple {
  deviceId: string;
  selectionId: string;
  stateVersion: number;
  contentId: string;
  revisionId: string;
  cardId: string;
  playlistRevision: string;
}

/** Strict schema-v2 gesture bound to the exact card rendered by the device. */
export interface DeviceGestureEvent extends DeviceDisplayedTuple {
  schemaVersion: 2;
  eventId: string;
  targetId: string;
  button: DevicePhysicalButton;
  gesture: DeviceGesture;
  action: DeviceCommandAction | "complete";
  occurredAt?: string;
}

/** Connector result returned to firmware for one idempotent gesture event. */
export interface DeviceCommandAcknowledgement {
  eventId: string;
  status: "executed" | "waiting" | "unsupported" | "conflict";
  action: DeviceCommandAction | "complete";
  message: string;
  resultRevision?: string;
  timingRevision?: string;
}

export interface DeviceDisplayAcknowledgement extends DeviceDisplayedTuple {
  eventId: string;
  displayedAt?: string;
  renderHash?: string;
}

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
  gesture?: DeviceGesture;
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
  selectionId?: string;
  contentId?: string;
  revisionId?: string;
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
  commandStatus?: "executed" | "waiting" | "unsupported" | "conflict";
  resultRevision?: string;
  timingRevision?: string;
}

export const DEFAULT_DEVICE_BUTTON_MAPPINGS: DeviceButtonMapping[] = [
  { button: "center", action: "respond", label: "回答当前卡片" },
  { button: "center-long", action: "capture", label: "快速记录" },
  { button: "center-double", action: "open", label: "打开原笔记" },
  { button: "left", action: "prev", label: "上一条" },
  { button: "left-long", action: "toggle_timer", label: "开始 / 暂停 / 继续" },
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
  const schemaVersion = normalizeSchemaVersion(body.schemaVersion ?? body.schema_version);
  const button = normalizeShort(body.button, 80);
  const gesture = normalizeDeviceGesture(body.gesture);
  const action = schemaVersion === 2
    ? resolveDeviceGestureAction(button, gesture)
    : normalizeDeviceIntent(body.action) ?? resolveButtonIntent(button, mappings);
  if (!action) {
    throw new Error(schemaVersion === 2
      ? "Schema v2 requires a supported button and gesture."
      : "Missing action or mapped button.");
  }
  const candidateType = normalizeCandidateType(body.candidateType);
  const occurredAt = normalizeIso(body.occurredAt);
  const result: DeviceEventInput = {
    schemaVersion,
    eventId,
    targetId,
    deviceId: normalizeShort(body.deviceId, 120),
    deliveryId: normalizeShort(body.deliveryId, 160),
    candidateId: normalizeShort(body.candidateId, 160),
    candidateType,
    button,
    gesture,
    action,
    occurredAt,
    note: normalizeShort(body.note, 500)
  };
  if (schemaVersion === 2) {
    const displayed = normalizeDisplayedTuple(body);
    result.deviceId = displayed.deviceId;
    result.selectionId = displayed.selectionId;
    result.stateVersion = displayed.stateVersion;
    result.contentId = displayed.contentId;
    result.revisionId = displayed.revisionId;
    result.cardId = displayed.cardId;
    result.playlistRevision = displayed.playlistRevision;
  } else if (action === "complete") {
    const guard = normalizeCompletionGuard(body);
    result.cardId = guard.cardId;
    result.stateVersion = guard.stateVersion;
    result.playlistRevision = guard.playlistRevision;
  }
  return result;
}

export function isDeviceGestureEvent(event: DeviceEventInput): event is DeviceGestureEvent {
  return event.schemaVersion === 2
    && Boolean(event.eventId)
    && Boolean(event.targetId)
    && (event.button === "primary" || event.button === "left" || event.button === "right")
    && (event.gesture === "single" || event.gesture === "double" || event.gesture === "long")
    && (event.action === "complete"
      || event.action === "open_current"
      || event.action === "start_open"
      || event.action === "create_note"
      || event.action === "record_reserved"
      || event.action === "toggle_timer"
      || event.action === "pause_task"
      || event.action === "resume_task"
      || event.action === "page_prev"
      || event.action === "page_next"
      || event.action === "task_prev"
      || event.action === "task_next")
    && Boolean(event.deviceId)
    && Boolean(event.selectionId)
    && Number.isSafeInteger(event.stateVersion)
    && (event.stateVersion ?? 0) > 0
    && Boolean(event.contentId)
    && Boolean(event.revisionId)
    && Boolean(event.cardId)
    && Boolean(event.playlistRevision);
}

export function normalizeDeviceDisplayAcknowledgement(
  body: Record<string, unknown>
): DeviceDisplayAcknowledgement {
  const eventId = normalizeOpaqueIdentifier(body.eventId ?? body.event_id, 160);
  if (!eventId) {
    throw new Error("Display acknowledgement requires eventId.");
  }
  const displayed = normalizeDisplayedTuple(body);
  return {
    eventId,
    ...displayed,
    displayedAt: normalizeIso(body.displayedAt ?? body.displayed_at),
    renderHash: normalizeHash(body.renderHash ?? body.render_hash)
  };
}

export function resolveDeviceGestureAction(
  button: string | undefined,
  gesture: DeviceGesture | undefined
): DeviceActionIntent | undefined {
  if (button === "primary") {
    if (gesture === "single") return "open_current";
    if (gesture === "double") return "create_note";
    if (gesture === "long") return "record_reserved";
  }
  if (button === "left") {
    if (gesture === "single") return "page_prev";
    if (gesture === "double") return "task_prev";
    if (gesture === "long") return "toggle_timer";
  }
  if (button === "right") {
    if (gesture === "single") return "page_next";
    if (gesture === "double") return "task_next";
    if (gesture === "long") return "complete";
  }
  return undefined;
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
    || value === "complete" || value === "open_current" || value === "start_open"
    || value === "create_note" || value === "record_reserved"
    || value === "toggle_timer" || value === "pause_task" || value === "resume_task"
    || value === "page_prev" || value === "page_next"
    || value === "task_prev" || value === "task_next"
    ? value
    : undefined;
}

function normalizeDeviceGesture(value: unknown): DeviceGesture | undefined {
  return value === "single" || value === "double" || value === "long"
    ? value
    : undefined;
}

function normalizeDisplayedTuple(body: Record<string, unknown>): DeviceDisplayedTuple {
  const deviceId = normalizeOpaqueIdentifier(body.deviceId ?? body.device_id, 160);
  const selectionId = normalizeOpaqueIdentifier(body.selectionId ?? body.selection_id, 200);
  const contentId = normalizeOpaqueIdentifier(body.contentId ?? body.content_id, 200);
  const revisionId = normalizeOpaqueIdentifier(body.revisionId ?? body.revision_id, 200);
  const cardId = normalizeOpaqueIdentifier(body.cardId ?? body.card_id, 200);
  const playlistRevision = normalizeOpaqueIdentifier(
    body.playlistRevision ?? body.playlist_revision,
    160
  );
  const stateVersion = normalizePositiveInteger(body.stateVersion ?? body.state_version);
  if (!deviceId || !selectionId || !contentId || !revisionId || !cardId
    || !playlistRevision || stateVersion === undefined) {
    throw new Error(
      "Schema v2 requires deviceId, selectionId, stateVersion, contentId, revisionId, cardId, and playlistRevision."
    );
  }
  return {
    deviceId,
    selectionId,
    stateVersion,
    contentId,
    revisionId,
    cardId,
    playlistRevision
  };
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

function normalizeHash(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/u.test(normalized) ? normalized : undefined;
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
