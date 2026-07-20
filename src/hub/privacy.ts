import { HUB_PROTOCOL_VERSION, type HubCandidate, type HubCandidateBatch, type HubContentAction, type HubContentType } from "./types";
import type { CaptureTargetAction, CaptureTargetKind } from "../capture";

const MAX_HUB_CANDIDATES = 20;
const OPAQUE_REF_BYTES = 16;

/**
 * Connector-local input. Paths and note contents may be used solely as HMAC
 * inputs; only the explicitly constructed `display` object can cross the wire.
 */
export interface LocalHubCandidate {
  localId: string;
  type: HubContentType;
  display: {
    title?: string;
    body?: string;
    prompt?: string;
  };
  sourceLocalId?: string;
  writeTargetLocalId?: string;
  /** Connector-only write contract; it is never included in the Hub candidate payload. */
  writeTargetKind?: CaptureTargetKind;
  writeTargetAction?: CaptureTargetAction;
  writeTargetHeading?: string;
  writeTargetStageId?: string;
  allowedActions: HubContentAction[];
  reasonCode: string;
  score: number;
  expiresAt?: string;
  privacy?: {
    private?: boolean;
    noAi?: boolean;
    excluded?: boolean;
  };
}

export interface PrivateCandidateBatchOptions {
  referenceSecret: string | Uint8Array;
  batchId?: string;
  generatedAt?: string;
  deviceId?: string;
  autoSelect?: boolean;
  policyVersion?: string;
  modelVersion?: string;
  crypto?: Crypto;
}

export async function buildPrivateCandidateBatch(
  candidates: readonly LocalHubCandidate[],
  options: PrivateCandidateBatchOptions
): Promise<HubCandidateBatch> {
  const crypto = options.crypto ?? requireCrypto();
  const secret = typeof options.referenceSecret === "string"
    ? new TextEncoder().encode(options.referenceSecret)
    : options.referenceSecret;
  if (secret.byteLength < 16) {
    throw new Error("Device Hub reference secret must contain at least 16 bytes.");
  }

  const eligible = candidates
    .filter((candidate) => !candidate.privacy?.excluded)
    .filter((candidate) => !candidate.privacy?.private)
    .filter((candidate) => !candidate.privacy?.noAi)
    .slice(0, MAX_HUB_CANDIDATES);

  const safeCandidates = await Promise.all(eligible.map(async (candidate) => sanitizeCandidate(candidate, secret, crypto)));
  return {
    protocolVersion: HUB_PROTOCOL_VERSION,
    batchId: options.batchId ?? `hbatch_${randomOpaqueId(crypto)}`,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    deviceId: options.deviceId,
    autoSelect: options.autoSelect,
    policyVersion: options.policyVersion,
    modelVersion: options.modelVersion,
    candidates: safeCandidates
  };
}

export async function createOpaqueHubRef(
  kind: "candidate" | "source" | "target",
  localIdentifier: string,
  referenceSecret: string | Uint8Array,
  crypto: Crypto = requireCrypto()
): Promise<string> {
  const secret = typeof referenceSecret === "string"
    ? new TextEncoder().encode(referenceSecret)
    : referenceSecret;
  if (secret.byteLength < 16) {
    throw new Error("Device Hub reference secret must contain at least 16 bytes.");
  }
  const key = await crypto.subtle.importKey("raw", copyToArrayBuffer(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${kind}\0${localIdentifier}`)));
  return `${kind === "candidate" ? "hc" : kind === "source" ? "hs" : "ht"}_${encodeBase64Url(digest.slice(0, OPAQUE_REF_BYTES))}`;
}

async function sanitizeCandidate(candidate: LocalHubCandidate, secret: Uint8Array, crypto: Crypto): Promise<HubCandidate> {
  if (!candidate.localId.trim()) {
    throw new Error("A Device Hub candidate needs a local identifier.");
  }
  const display = {
    title: cleanDisplayText(candidate.display.title, 160),
    body: cleanDisplayText(candidate.display.body, 1200),
    prompt: cleanDisplayText(candidate.display.prompt, 400)
  };
  if (!display.title && !display.body && !display.prompt) {
    throw new Error("A Device Hub candidate needs explicitly approved display content.");
  }
  const candidateRef = await createOpaqueHubRef("candidate", candidate.localId, secret, crypto);
  const sourceRef = candidate.sourceLocalId
    ? await createOpaqueHubRef("source", candidate.sourceLocalId, secret, crypto)
    : undefined;
  const writeTargetRef = candidate.writeTargetLocalId
    ? await createOpaqueHubRef("target", candidate.writeTargetLocalId, secret, crypto)
    : undefined;
  return {
    candidateRef,
    type: candidate.type,
    display,
    sourceRef,
    writeTargetRef,
    allowedActions: [...new Set(candidate.allowedActions)].slice(0, 6),
    sensitivity: candidate.privacy?.private ? "private" : "normal",
    reasonCode: normalizeReasonCode(candidate.reasonCode),
    score: Number.isFinite(candidate.score) ? candidate.score : 0,
    expiresAt: normalizeIsoDate(candidate.expiresAt)
  };
}

function cleanDisplayText(value: string | undefined, limit: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "").trim();
  return cleaned ? cleaned.slice(0, limit) : undefined;
}

function normalizeReasonCode(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 64);
  return normalized || "local_recommendation";
}

function normalizeIsoDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function randomOpaqueId(crypto: Crypto): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

function requireCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is unavailable; Device Hub privacy references cannot be generated.");
  }
  return globalThis.crypto;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

export { MAX_HUB_CANDIDATES };
