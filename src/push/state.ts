import type { PushContextAnchor, PushDeliveryEvent, PushFeedbackAction, PushRuntimeState } from "./types";

const MAX_ANCHORS = 100;
const MAX_EVENTS = 500;
const ANCHOR_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;
const EVENT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 45;

export interface PushFeedbackInput {
  targetId: string;
  candidateId: string;
  candidateType?: PushDeliveryEvent["candidateType"];
  action: PushFeedbackAction;
  note?: string;
  clientId?: string;
  at?: string;
}

export interface PushAnchorInput {
  source?: PushContextAnchor["source"];
  targetId?: string;
  deviceId?: string;
  placeLabel?: string;
  mode?: string;
  activeFile?: string;
  networkLabel?: string;
  preciseLocation?: PushContextAnchor["preciseLocation"];
  capturedAt?: string;
  ttlSeconds?: number;
}

export class PushContextStore {
  constructor(private readonly state: PushRuntimeState) {}

  getState(): PushRuntimeState {
    return this.state;
  }

  getCurrentContext(now = new Date()): PushContextAnchor | undefined {
    const nowMs = now.getTime();
    return this.state.anchors
      .filter((anchor) => !anchor.expiresAt || Date.parse(anchor.expiresAt) > nowMs)
      .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0];
  }

  recordAnchor(input: PushAnchorInput, allowPreciseLocation: boolean, fallbackActiveFile?: string | null): PushContextAnchor {
    const capturedAt = normalizeIso(input.capturedAt) || new Date().toISOString();
    const ttlSeconds = clampInteger(input.ttlSeconds, 60, 60 * 60 * 24, 60 * 60 * 6);
    const anchor: PushContextAnchor = {
      id: `pctx_${randomFragment()}`,
      source: input.source ?? "device",
      targetId: normalizeShort(input.targetId, 80),
      deviceId: normalizeShort(input.deviceId, 120),
      placeLabel: normalizeLabel(input.placeLabel),
      mode: normalizeLabel(input.mode),
      activeFile: normalizePath(input.activeFile || fallbackActiveFile || ""),
      networkLabel: normalizeLabel(input.networkLabel),
      preciseLocation: allowPreciseLocation ? normalizePreciseLocation(input.preciseLocation) : undefined,
      capturedAt,
      expiresAt: new Date(Date.parse(capturedAt) + ttlSeconds * 1000).toISOString()
    };

    this.state.anchors.push(anchor);
    this.purge();
    return anchor;
  }

  recordSent(event: Omit<PushDeliveryEvent, "id" | "sentAt"> & { sentAt?: string }): PushDeliveryEvent {
    const sentAt = normalizeIso(event.sentAt) || new Date().toISOString();
    const existing = this.findRecentEvent(event.targetId, event.candidateId);
    if (existing && !existing.sentAt) {
      existing.sentAt = sentAt;
      existing.decisionReason = event.decisionReason;
      existing.score = event.score;
      this.purge();
      return existing;
    }

    const saved: PushDeliveryEvent = {
      ...event,
      id: `pdel_${randomFragment()}`,
      sentAt
    };
    this.state.events.push(saved);
    this.purge();
    return saved;
  }

  recordFeedback(input: PushFeedbackInput): PushDeliveryEvent {
    const at = normalizeIso(input.at) || new Date().toISOString();
    const existing = this.findRecentEvent(input.targetId, input.candidateId);
    const event = existing ?? {
      id: `pdel_${randomFragment()}`,
      targetId: input.targetId,
      candidateId: input.candidateId,
      candidateType: input.candidateType ?? "question",
      decisionReason: "feedback",
      score: 0
    };

    event.feedback = input.action;
    event.note = normalizeShort(input.note, 500);
    event.clientId = normalizeShort(input.clientId, 80);
    if (input.action === "skipped") {
      event.skippedAt = at;
    } else if (input.action === "answered") {
      event.respondedAt = at;
    } else {
      event.openedAt = at;
    }

    if (!existing) {
      this.state.events.push(event);
    }
    this.purge();
    return event;
  }

  recentEvents(targetId: string, now = new Date()): PushDeliveryEvent[] {
    const minMs = now.getTime() - EVENT_MAX_AGE_MS;
    return this.state.events
      .filter((event) => event.targetId === targetId)
      .filter((event) => event.sentAt ? Date.parse(event.sentAt) >= minMs : true);
  }

  purge(now = new Date()): void {
    const nowMs = now.getTime();
    const minAnchorMs = nowMs - ANCHOR_MAX_AGE_MS;
    const minEventMs = nowMs - EVENT_MAX_AGE_MS;

    this.state.anchors = this.state.anchors
      .filter((anchor) => Date.parse(anchor.capturedAt) >= minAnchorMs)
      .filter((anchor) => !anchor.expiresAt || Date.parse(anchor.expiresAt) > nowMs)
      .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))
      .slice(0, MAX_ANCHORS);

    this.state.events = this.state.events
      .filter((event) => {
        const timestamp = event.sentAt || event.openedAt || event.respondedAt || event.skippedAt;
        return !timestamp || Date.parse(timestamp) >= minEventMs;
      })
      .sort((left, right) => eventTimestamp(right).localeCompare(eventTimestamp(left)))
      .slice(0, MAX_EVENTS);
  }

  private findRecentEvent(targetId: string, candidateId: string): PushDeliveryEvent | undefined {
    return this.state.events
      .filter((event) => event.targetId === targetId && event.candidateId === candidateId)
      .sort((left, right) => eventTimestamp(right).localeCompare(eventTimestamp(left)))[0];
  }
}

export function normalizePushRuntimeState(value?: Partial<PushRuntimeState>): PushRuntimeState {
  return {
    anchors: Array.isArray(value?.anchors) ? value.anchors.map(normalizeAnchor).filter(Boolean) as PushContextAnchor[] : [],
    events: Array.isArray(value?.events) ? value.events.map(normalizeEvent).filter(Boolean) as PushDeliveryEvent[] : [],
    targetCursors: normalizeCursorMap(value?.targetCursors),
    displayCursors: normalizeCursorMap(value?.displayCursors)
  };
}

function normalizeAnchor(value: unknown): PushContextAnchor | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const capturedAt = normalizeIso(record.capturedAt);
  if (!capturedAt) {
    return undefined;
  }
  return {
    id: normalizeShort(record.id, 120) || `pctx_${randomFragment()}`,
    source: normalizeSource(record.source),
    targetId: normalizeShort(record.targetId, 80),
    deviceId: normalizeShort(record.deviceId, 120),
    placeLabel: normalizeLabel(record.placeLabel),
    mode: normalizeLabel(record.mode),
    activeFile: normalizePath(record.activeFile),
    networkLabel: normalizeLabel(record.networkLabel),
    preciseLocation: normalizePreciseLocation(record.preciseLocation),
    capturedAt,
    expiresAt: normalizeIso(record.expiresAt)
  };
}

function normalizeEvent(value: unknown): PushDeliveryEvent | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const targetId = normalizeShort(record.targetId, 80);
  const candidateId = normalizeShort(record.candidateId, 160);
  if (!targetId || !candidateId) {
    return undefined;
  }
  return {
    id: normalizeShort(record.id, 120) || `pdel_${randomFragment()}`,
    targetId,
    candidateId,
    candidateType: normalizeCandidateType(record.candidateType),
    decisionReason: normalizeShort(record.decisionReason, 400) || "unknown",
    score: clampNumber(record.score, -1000, 1000, 0),
    sentAt: normalizeIso(record.sentAt),
    openedAt: normalizeIso(record.openedAt),
    respondedAt: normalizeIso(record.respondedAt),
    skippedAt: normalizeIso(record.skippedAt),
    feedback: normalizeFeedback(record.feedback),
    note: normalizeShort(record.note, 500),
    clientId: normalizeShort(record.clientId, 80)
  };
}

function normalizeCursorMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const output: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const id = normalizeShort(key, 80);
    if (id) {
      output[id] = clampInteger(raw, 0, 100000, 0);
    }
  }
  return output;
}

function normalizeSource(value: unknown): PushContextAnchor["source"] {
  return value === "manual" || value === "device" || value === "system" || value === "ai" ? value : "device";
}

function normalizeCandidateType(value: unknown): PushDeliveryEvent["candidateType"] {
  return value === "home-summary" || value === "workflow-file" || value === "article" ? value : "question";
}

function normalizeFeedback(value: unknown): PushFeedbackAction | undefined {
  return value === "useful" || value === "skipped" || value === "later" || value === "answered" || value === "opened-no-write" || value === "opened"
    ? value
    : undefined;
}

function normalizePreciseLocation(value: unknown): PushContextAnchor["preciseLocation"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  const accuracy = Number(record.accuracy);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined;
  }
  return {
    latitude: Math.max(-90, Math.min(90, latitude)),
    longitude: Math.max(-180, Math.min(180, longitude)),
    accuracy: Number.isFinite(accuracy) ? Math.max(0, Math.min(100000, accuracy)) : undefined
  };
}

function normalizeLabel(value: unknown): string | undefined {
  return normalizeShort(value, 80)?.replace(/\s+/gu, " ");
}

function normalizePath(value: unknown): string | undefined {
  return normalizeShort(value, 240)?.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
}

function normalizeShort(value: unknown, maxLength: number): string | undefined {
  const text = String(value ?? "").trim().slice(0, maxLength);
  return text || undefined;
}

function normalizeIso(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  if (!text) {
    return undefined;
  }
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function eventTimestamp(event: PushDeliveryEvent): string {
  return event.respondedAt || event.skippedAt || event.openedAt || event.sentAt || "";
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function randomFragment(): string {
  return Math.random().toString(36).slice(2, 10);
}
