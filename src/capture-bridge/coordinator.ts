import { CAPTURE_SCHEMA_VERSION, type CaptureDraft } from "../capture";
import { generateCaptureHandoffId, generateCaptureId, isCaptureHandoffId, isCaptureTapId } from "./ids";
import { LocalTapSelectionService } from "./selection";
import {
  CAPTURE_BRIDGE_PROTOCOL_VERSION,
  CAPTURE_BRIDGE_PROTOCOL_V2,
  type CaptureBridgeCommitAdapter,
  type CaptureBridgeCommitRequest,
  type CaptureBridgeCommitResult,
  type CaptureBridgeAssetUploadRequest,
  type CaptureBridgeHandoffResponse,
  type CaptureBridgeStagedAsset,
  type TapSelectionSnapshot
} from "./types";

interface CaptureBridgeHandoff {
  response: CaptureBridgeHandoffResponse;
  snapshot: TapSelectionSnapshot;
  commits: Map<string, CaptureBridgeCommitResult>;
  committed?: CaptureBridgeCommitResult;
  retainedUntil?: number;
  assets: Map<string, CaptureBridgeStagedAsset>;
  assetUploads: Map<string, { fingerprint: string; assetRef: string }>;
}

export interface CaptureBridgeCoordinatorOptions {
  selection: LocalTapSelectionService;
  commitAdapter: CaptureBridgeCommitAdapter;
  createOnlySnapshot?(snapshot: TapSelectionSnapshot): Promise<TapSelectionSnapshot>;
  isTapAllowed(tapId: string): boolean;
  handoffTtlSeconds(): number;
  now?: () => Date;
}

export class CaptureBridgeCoordinator {
  private readonly handoffs = new Map<string, CaptureBridgeHandoff>();
  private readonly captureResults = new Map<string, { result: CaptureBridgeCommitResult; expiresAt: number }>();
  private readonly now: () => Date;

  constructor(private readonly options: CaptureBridgeCoordinatorOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async createHandoff(
    tapId: string,
    protocolVersion: CaptureBridgeHandoffResponse["protocolVersion"] = CAPTURE_BRIDGE_PROTOCOL_VERSION,
    createOnly = false
  ): Promise<CaptureBridgeHandoffResponse> {
    this.cleanup();
    if (!isCaptureTapId(tapId) || !this.options.isTapAllowed(tapId)) {
      throw new CaptureBridgeRequestError(404, "Tap address is unavailable or revoked.");
    }
    let snapshot = await this.options.selection.resolve();
    if (createOnly) {
      if (protocolVersion !== CAPTURE_BRIDGE_PROTOCOL_V2 || !this.options.createOnlySnapshot) {
        throw new CaptureBridgeRequestError(409, "Create-only Capture requires bridge v2 support.");
      }
      snapshot = await this.options.createOnlySnapshot(snapshot);
      if (snapshot.candidate.action !== "create") {
        throw new CaptureBridgeRequestError(409, "Create-only Capture did not resolve to an authorized create target.");
      }
    }
    const handoffId = generateCaptureHandoffId();
    const captureId = generateCaptureId();
    const expiresAt = new Date(this.now().getTime() + clampTtl(this.options.handoffTtlSeconds()) * 1_000).toISOString();
    const response: CaptureBridgeHandoffResponse = {
      protocolVersion,
      handoffId,
      tapId,
      captureId,
      expiresAt,
      context: {
        contentType: snapshot.contentType,
        title: snapshot.title,
        prompt: snapshot.prompt,
        ...(snapshot.body ? { body: snapshot.body } : {})
      },
      target: {
        kind: snapshot.candidate.kind,
        action: snapshot.candidate.action,
        displayPath: snapshot.candidate.path,
        ...(snapshot.candidate.heading ? { heading: snapshot.candidate.heading } : {})
      },
      allowedFields: ["body", "title", "tags"],
      ...(protocolVersion === CAPTURE_BRIDGE_PROTOCOL_V2
        ? {
            availableOperations: createOnly
              ? ["capture" as const]
              : [
                  "capture" as const,
                  ...(snapshot.sourceContext?.dailyItemId ? ["complete" as const, "later" as const] : [])
                ],
            ...(createOnly ? { createOnly: true } : {})
          }
        : {})
    };
    this.handoffs.set(handoffId, {
      response,
      snapshot,
      commits: new Map(),
      assets: new Map(),
      assetUploads: new Map()
    });
    return clone(response);
  }

  getHandoff(handoffId: string): CaptureBridgeHandoffResponse {
    return clone(this.requireHandoff(handoffId).response);
  }

  stageAsset(
    handoffId: string,
    request: CaptureBridgeAssetUploadRequest
  ): { assetRef: string; idempotent: boolean } {
    const handoff = this.requireHandoff(handoffId);
    if (handoff.response.protocolVersion !== CAPTURE_BRIDGE_PROTOCOL_V2) {
      throw new CaptureBridgeRequestError(409, "Asset upload requires Capture bridge v2.");
    }
    const normalized = validateAssetUploadRequest(request);
    const fingerprint = `${normalized.fileName}\u0000${normalized.mimeType}\u0000${normalized.base64.length}\u0000${normalized.base64.slice(0, 96)}`;
    const previous = handoff.assetUploads.get(normalized.idempotencyKey);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new CaptureBridgeRequestError(409, "The asset idempotency key was already used with different data.");
      }
      return { assetRef: previous.assetRef, idempotent: true };
    }
    if (handoff.assets.size >= 8) {
      throw new CaptureBridgeRequestError(413, "A Capture handoff accepts at most 8 assets.");
    }
    const bytes = decodeBase64(normalized.base64);
    const totalBytes = [...handoff.assets.values()].reduce((sum, asset) => sum + asset.bytes.byteLength, 0);
    if (bytes.byteLength === 0 || bytes.byteLength > 25_000_000 || totalBytes + bytes.byteLength > 25_000_000) {
      throw new CaptureBridgeRequestError(413, "Capture assets must be non-empty and at most 25 MB per handoff.");
    }
    const assetRef = generateAssetRef();
    handoff.assets.set(assetRef, {
      assetRef,
      fileName: normalized.fileName,
      mimeType: normalized.mimeType,
      bytes
    });
    handoff.assetUploads.set(normalized.idempotencyKey, { fingerprint, assetRef });
    return { assetRef, idempotent: false };
  }

  async commit(handoffId: string, request: CaptureBridgeCommitRequest): Promise<CaptureBridgeCommitResult> {
    const handoff = this.requireHandoff(handoffId);
    validateCommitRequest(request, handoff.response.captureId, handoff.response.protocolVersion);
    const previous = handoff.commits.get(request.idempotencyKey);
    if (previous) {
      return { ...clone(previous), idempotent: true };
    }
    if (handoff.committed) {
      throw new CaptureBridgeRequestError(409, "This handoff was already committed with another idempotency key.");
    }

    const operation = request.operation ?? "capture";
    if (handoff.response.createOnly && operation !== "capture") {
      throw new CaptureBridgeRequestError(
        409,
        "A create-only handoff accepts only the capture operation."
      );
    }
    if (operation === "complete") {
      if (!handoff.response.availableOperations?.includes("complete") || !this.options.commitAdapter.complete) {
        throw new CaptureBridgeRequestError(409, "This handoff cannot complete the displayed item.");
      }
      const completed = await this.options.commitAdapter.complete(handoff.snapshot, request);
      const result: CaptureBridgeCommitResult = {
        captureId: request.captureId,
        path: completed.path,
        action: handoff.snapshot.candidate.action,
        committedAt: completed.completedAt,
        idempotent: completed.idempotent,
        operation,
        completed: true
      };
      return this.rememberCommit(handoff, request.idempotencyKey, result);
    }
    if (operation === "later") {
      if (!handoff.response.availableOperations?.includes("later") || !this.options.commitAdapter.later) {
        throw new CaptureBridgeRequestError(409, "This handoff cannot snooze the displayed item.");
      }
      const snoozed = await this.options.commitAdapter.later(handoff.snapshot, request);
      const result: CaptureBridgeCommitResult = {
        captureId: request.captureId,
        path: snoozed.path,
        action: handoff.snapshot.candidate.action,
        committedAt: this.now().toISOString(),
        idempotent: snoozed.idempotent,
        operation,
        snoozedUntil: snoozed.snoozedUntil
      };
      return this.rememberCommit(handoff, request.idempotencyKey, result);
    }

    const assets = (request.assetRefs ?? []).map((assetRef) => {
      const asset = handoff.assets.get(assetRef);
      if (!asset) {
        throw new CaptureBridgeRequestError(409, "A staged Capture asset is missing or belongs to another handoff.");
      }
      return asset;
    });
    const committed = await this.options.commitAdapter.commit(handoff.snapshot, request, assets);
    const result: CaptureBridgeCommitResult = {
      captureId: committed.captureId,
      path: committed.finalPath,
      action: committed.action,
      openUri: committed.openUri,
      undoToken: committed.undoToken,
      committedAt: committed.createdAt,
      idempotent: committed.idempotent,
      operation
    };
    return this.rememberCommit(handoff, request.idempotencyKey, result);
  }

  private rememberCommit(
    handoff: CaptureBridgeHandoff,
    idempotencyKey: string,
    result: CaptureBridgeCommitResult
  ): CaptureBridgeCommitResult {
    handoff.committed = clone(result);
    handoff.commits.set(idempotencyKey, clone(result));
    handoff.retainedUntil = this.now().getTime() + 60 * 60_000;
    handoff.assets.clear();
    handoff.assetUploads.clear();
    this.captureResults.set(result.captureId, {
      result: clone(result),
      expiresAt: this.now().getTime() + 60 * 60_000
    });
    this.trimCaptureResults();
    return result;
  }

  async undo(captureId: string, undoToken: string): Promise<{ captureId: string; undone: boolean }> {
    this.cleanup();
    const stored = this.captureResults.get(captureId);
    const result = stored?.result;
    if (!result?.undoToken || result.undoToken !== undoToken) {
      throw new CaptureBridgeRequestError(400, "Undo token does not match a committed local Capture handoff.");
    }
    const undone = await this.options.commitAdapter.undo(captureId, undoToken);
    return { captureId, undone: undone.undone };
  }

  clear(): void {
    this.handoffs.clear();
    this.captureResults.clear();
  }

  private requireHandoff(handoffId: string): CaptureBridgeHandoff {
    this.cleanup();
    if (!isCaptureHandoffId(handoffId)) {
      throw new CaptureBridgeRequestError(404, "Capture handoff was not found.");
    }
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) {
      throw new CaptureBridgeRequestError(404, "Capture handoff was not found or expired.");
    }
    return handoff;
  }

  private cleanup(): void {
    const now = this.now().getTime();
    for (const [id, handoff] of this.handoffs) {
      const expiresAt = handoff.committed
        ? handoff.retainedUntil ?? Date.parse(handoff.response.expiresAt)
        : Date.parse(handoff.response.expiresAt);
      if (expiresAt <= now) {
        this.handoffs.delete(id);
      }
    }
    for (const [captureId, stored] of this.captureResults) {
      if (stored.expiresAt <= now) this.captureResults.delete(captureId);
    }
  }

  private trimCaptureResults(): void {
    while (this.captureResults.size > 500) {
      const oldest = this.captureResults.keys().next().value as string | undefined;
      if (!oldest) break;
      this.captureResults.delete(oldest);
    }
  }
}

export class CaptureBridgeRequestError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "CaptureBridgeRequestError";
  }
}

export function captureDraftFromBridgeCommit(
  snapshot: TapSelectionSnapshot,
  request: CaptureBridgeCommitRequest
): CaptureDraft {
  return {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    id: request.captureId,
    intent: snapshot.intent,
    body: request.body.trim(),
    title: cleanOptional(request.title, 160),
    tags: normalizeTags(request.tags),
    links: [],
    source: {
      file: snapshot.sourceContext?.file,
      questionId: snapshot.sourceContext?.questionId,
      entryPoint: "capture-bridge"
    },
    createdAt: new Date().toISOString()
  };
}

function validateCommitRequest(
  request: CaptureBridgeCommitRequest,
  expectedCaptureId: string,
  expectedProtocol: CaptureBridgeHandoffResponse["protocolVersion"]
): void {
  if (request.protocolVersion !== expectedProtocol) {
    throw new CaptureBridgeRequestError(400, "Unsupported Capture bridge protocol version.");
  }
  if (request.captureId !== expectedCaptureId) {
    throw new CaptureBridgeRequestError(409, "Capture ID does not match this handoff.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(request.idempotencyKey)) {
    throw new CaptureBridgeRequestError(400, "A valid idempotency key is required.");
  }
  const operation = request.operation ?? "capture";
  if (operation !== "capture" && operation !== "complete" && operation !== "later") {
    throw new CaptureBridgeRequestError(400, "Unsupported Capture bridge operation.");
  }
  if (operation === "capture"
    && (typeof request.body !== "string"
      || (!request.body.trim() && !(request.assetRefs?.length))
      || request.body.length > 200_000)) {
    throw new CaptureBridgeRequestError(400, "Capture body or an audio asset is required and must fit the size limits.");
  }
  if (typeof request.body !== "string" || request.body.length > 200_000) {
    throw new CaptureBridgeRequestError(400, "Capture body must be a string of at most 200,000 characters.");
  }
  if (request.title !== undefined && (typeof request.title !== "string" || request.title.length > 500)) {
    throw new CaptureBridgeRequestError(400, "Capture title must be a string of at most 500 characters.");
  }
  if (request.tags !== undefined && (!Array.isArray(request.tags) || request.tags.length > 50 || request.tags.some((tag) => typeof tag !== "string"))) {
    throw new CaptureBridgeRequestError(400, "Capture tags must contain at most 50 strings.");
  }
  if (request.assetRefs !== undefined && (
    !Array.isArray(request.assetRefs)
    || request.assetRefs.length > 8
    || request.assetRefs.some((ref) => typeof ref !== "string" || !/^asset_[A-Za-z0-9_-]{16,96}$/u.test(ref))
  )) {
    throw new CaptureBridgeRequestError(400, "Capture asset references are invalid.");
  }
}

function normalizeTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? [])
    .map((tag) => String(tag).replace(/^#+/u, "").trim().toLowerCase().replace(/\s+/gu, "-").slice(0, 80))
    .filter(Boolean))];
}

function validateAssetUploadRequest(request: CaptureBridgeAssetUploadRequest): CaptureBridgeAssetUploadRequest {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(String(request.idempotencyKey ?? ""))) {
    throw new CaptureBridgeRequestError(400, "A valid asset idempotency key is required.");
  }
  const fileName = String(request.fileName ?? "")
    .replace(/[/\\:\u0000-\u001f]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 180);
  if (!fileName) {
    throw new CaptureBridgeRequestError(400, "Asset fileName is required.");
  }
  const mimeType = String(request.mimeType ?? "").trim().toLowerCase().slice(0, 120);
  if (!/^audio\/(?:webm|mp4|mpeg|ogg|wav|x-m4a|aac)(?:;.*)?$/u.test(mimeType)) {
    throw new CaptureBridgeRequestError(415, "Only supported audio assets may be staged.");
  }
  const base64 = String(request.base64 ?? "").trim();
  if (!base64 || base64.length > 34_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(base64)) {
    throw new CaptureBridgeRequestError(400, "Asset base64 payload is invalid.");
  }
  return { idempotencyKey: request.idempotencyKey, fileName, mimeType, base64 };
}

function decodeBase64(value: string): Uint8Array {
  try {
    const decoded = globalThis.atob(value);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    throw new CaptureBridgeRequestError(400, "Asset base64 payload is invalid.");
  }
}

function generateAssetRef(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const value = globalThis.btoa(String.fromCharCode(...bytes))
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
  return `asset_${value}`;
}

function cleanOptional(value: string | undefined, max: number): string | undefined {
  const cleaned = value?.replace(/[\r\n]+/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max);
  return cleaned || undefined;
}

function clampTtl(value: number): number {
  return Number.isFinite(value) ? Math.max(60, Math.min(900, Math.floor(value))) : 300;
}

function clone<T>(value: T): T {
  return typeof globalThis.structuredClone === "function"
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}
