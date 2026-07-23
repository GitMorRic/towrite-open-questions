export type LocalEinkConnectionState =
  | "disabled"
  | "stopped"
  | "waiting"
  | "online"
  | "stale"
  | "error";

export interface LocalEinkRuntimeSnapshot {
  running: boolean;
  startedAt?: string;
  stoppedAt?: string;
  lastPollAt?: string;
  lastTargetId?: string;
  lastServedCardId?: string;
  lastServedTitle?: string;
  lastPlaylistRevision?: string;
  lastEventAt?: string;
  lastEventAction?: string;
  lastErrorAt?: string;
  lastErrorStatus?: number;
  lastError?: string;
  successfulPolls?: number;
}

export interface LocalEinkConnectionStatus extends LocalEinkRuntimeSnapshot {
  enabled: boolean;
  state: LocalEinkConnectionState;
  online: boolean;
  bindHost: string;
  port: number;
  expectedTargetId?: string;
  expectedTargetName?: string;
  targetTokenConfigured: boolean;
  masterTokenConfigured: boolean;
  refreshSeconds: number;
  onlineWindowSeconds: number;
}

export interface SmallScreenConnectionStatus {
  overall: "online" | "waiting" | "offline" | "disabled";
  local: LocalEinkConnectionStatus;
  hub: {
    enabled: boolean;
    configured: boolean;
    online: boolean;
    inSync: boolean;
    selectedContentId?: string;
    displayedContentId?: string;
    lastSyncedAt?: string;
    lastError?: string;
  };
  current: {
    localId?: string;
    title?: string;
    contentType?: string;
  };
  hasConfiguredRoute: boolean;
  deliveryReady: boolean;
}

export interface ResolveLocalEinkStatusInput {
  enabled: boolean;
  bindHost: string;
  port: number;
  refreshSeconds: number;
  targetId?: string;
  targetName?: string;
  targetTokenConfigured: boolean;
  masterTokenConfigured: boolean;
  runtime?: Partial<LocalEinkRuntimeSnapshot>;
  nowMs?: number;
}

/**
 * Classifies the local ESP32 pull connection without persisting a heartbeat.
 * A screen stays online for three configured refresh intervals (minimum 15s)
 * so a single delayed poll does not make the status badge flicker.
 */
export function resolveLocalEinkConnectionStatus(
  input: ResolveLocalEinkStatusInput
): LocalEinkConnectionStatus {
  const refreshSeconds = clampInteger(input.refreshSeconds, 5, 86_400, 60);
  const onlineWindowSeconds = Math.max(15, refreshSeconds * 3);
  const running = input.runtime?.running === true;
  const startedAt = validIso(input.runtime?.startedAt);
  const stoppedAt = validIso(input.runtime?.stoppedAt);
  const rawLastPollAt = validIso(input.runtime?.lastPollAt);
  const lastErrorAt = validIso(input.runtime?.lastErrorAt);
  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const startedMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const stoppedMs = stoppedAt ? Date.parse(stoppedAt) : Number.NaN;
  const rawLastPollMs = rawLastPollAt ? Date.parse(rawLastPollAt) : Number.NaN;
  const lastErrorMs = lastErrorAt ? Date.parse(lastErrorAt) : Number.NaN;
  const pollBelongsToCurrentRun = Number.isFinite(rawLastPollMs)
    && (!Number.isFinite(startedMs) || rawLastPollMs >= startedMs);
  const lastPollAt = pollBelongsToCurrentRun ? rawLastPollAt : undefined;
  const lastPollMs = pollBelongsToCurrentRun ? rawLastPollMs : Number.NaN;
  const stoppedByStartupFailure = !running
    && Number.isFinite(lastErrorMs)
    && (!Number.isFinite(stoppedMs) || lastErrorMs >= stoppedMs);

  let state: LocalEinkConnectionState;
  if (!input.enabled) {
    state = "disabled";
  } else if (stoppedByStartupFailure) {
    state = "error";
  } else if (!running) {
    state = "stopped";
  } else if (Number.isFinite(lastErrorMs) && (!Number.isFinite(lastPollMs) || lastErrorMs > lastPollMs)) {
    state = "error";
  } else if (!Number.isFinite(lastPollMs)) {
    state = "waiting";
  } else if (Math.max(0, nowMs - lastPollMs) <= onlineWindowSeconds * 1_000) {
    state = "online";
  } else {
    state = "stale";
  }

  return {
    running,
    startedAt,
    stoppedAt,
    lastPollAt,
    lastTargetId: cleanText(input.runtime?.lastTargetId, 120),
    lastServedCardId: cleanText(input.runtime?.lastServedCardId, 200),
    lastServedTitle: cleanText(input.runtime?.lastServedTitle, 200),
    lastPlaylistRevision: cleanText(input.runtime?.lastPlaylistRevision, 200),
    lastEventAt: validIso(input.runtime?.lastEventAt),
    lastEventAction: cleanText(input.runtime?.lastEventAction, 80),
    lastErrorAt,
    lastErrorStatus: Number.isInteger(input.runtime?.lastErrorStatus)
      ? Number(input.runtime?.lastErrorStatus)
      : undefined,
    lastError: cleanText(input.runtime?.lastError, 500),
    successfulPolls: Math.max(0, Math.floor(Number(input.runtime?.successfulPolls) || 0)),
    enabled: input.enabled,
    state,
    online: state === "online",
    bindHost: input.bindHost,
    port: clampInteger(input.port, 1_024, 65_535, 48_321),
    expectedTargetId: cleanText(input.targetId, 120),
    expectedTargetName: cleanText(input.targetName, 120),
    targetTokenConfigured: input.targetTokenConfigured,
    masterTokenConfigured: input.masterTokenConfigured,
    refreshSeconds,
    onlineWindowSeconds
  };
}

function validIso(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    return undefined;
  }
  return value.trim();
}

function cleanText(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, limit) : undefined;
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(parsed)));
}
