import { CAPTURE_SCHEMA_VERSION, type CaptureDraft } from "../capture";
import { generateCaptureHandoffId, generateCaptureId, isCaptureHandoffId, isCaptureTapId } from "./ids";
import { LocalTapSelectionService } from "./selection";
import {
  CAPTURE_BRIDGE_PROTOCOL_VERSION,
  type CaptureBridgeCommitAdapter,
  type CaptureBridgeCommitRequest,
  type CaptureBridgeCommitResult,
  type CaptureBridgeHandoffResponse,
  type TapSelectionSnapshot
} from "./types";

interface CaptureBridgeHandoff {
  response: CaptureBridgeHandoffResponse;
  snapshot: TapSelectionSnapshot;
  commits: Map<string, CaptureBridgeCommitResult>;
  committed?: CaptureBridgeCommitResult;
  retainedUntil?: number;
}

export interface CaptureBridgeCoordinatorOptions {
  selection: LocalTapSelectionService;
  commitAdapter: CaptureBridgeCommitAdapter;
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

  async createHandoff(tapId: string): Promise<CaptureBridgeHandoffResponse> {
    this.cleanup();
    if (!isCaptureTapId(tapId) || !this.options.isTapAllowed(tapId)) {
      throw new CaptureBridgeRequestError(404, "Tap address is unavailable or revoked.");
    }
    const snapshot = await this.options.selection.resolve();
    const handoffId = generateCaptureHandoffId();
    const captureId = generateCaptureId();
    const expiresAt = new Date(this.now().getTime() + clampTtl(this.options.handoffTtlSeconds()) * 1_000).toISOString();
    const response: CaptureBridgeHandoffResponse = {
      protocolVersion: CAPTURE_BRIDGE_PROTOCOL_VERSION,
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
      allowedFields: ["body", "title", "tags"]
    };
    this.handoffs.set(handoffId, { response, snapshot, commits: new Map() });
    return clone(response);
  }

  getHandoff(handoffId: string): CaptureBridgeHandoffResponse {
    return clone(this.requireHandoff(handoffId).response);
  }

  async commit(handoffId: string, request: CaptureBridgeCommitRequest): Promise<CaptureBridgeCommitResult> {
    const handoff = this.requireHandoff(handoffId);
    validateCommitRequest(request, handoff.response.captureId);
    const previous = handoff.commits.get(request.idempotencyKey);
    if (previous) {
      return { ...clone(previous), idempotent: true };
    }
    if (handoff.committed) {
      throw new CaptureBridgeRequestError(409, "This handoff was already committed with another idempotency key.");
    }

    const committed = await this.options.commitAdapter.commit(handoff.snapshot, request);
    const result: CaptureBridgeCommitResult = {
      captureId: committed.captureId,
      path: committed.finalPath,
      action: committed.action,
      openUri: committed.openUri,
      undoToken: committed.undoToken,
      committedAt: committed.createdAt,
      idempotent: committed.idempotent
    };
    handoff.committed = clone(result);
    handoff.commits.set(request.idempotencyKey, clone(result));
    handoff.retainedUntil = this.now().getTime() + 60 * 60_000;
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

function validateCommitRequest(request: CaptureBridgeCommitRequest, expectedCaptureId: string): void {
  if (request.protocolVersion !== CAPTURE_BRIDGE_PROTOCOL_VERSION) {
    throw new CaptureBridgeRequestError(400, "Unsupported Capture bridge protocol version.");
  }
  if (request.captureId !== expectedCaptureId) {
    throw new CaptureBridgeRequestError(409, "Capture ID does not match this handoff.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(request.idempotencyKey)) {
    throw new CaptureBridgeRequestError(400, "A valid idempotency key is required.");
  }
  if (typeof request.body !== "string" || !request.body.trim() || request.body.length > 200_000) {
    throw new CaptureBridgeRequestError(400, "Capture body is required and must be at most 200,000 characters.");
  }
  if (request.title !== undefined && (typeof request.title !== "string" || request.title.length > 500)) {
    throw new CaptureBridgeRequestError(400, "Capture title must be a string of at most 500 characters.");
  }
  if (request.tags !== undefined && (!Array.isArray(request.tags) || request.tags.length > 50 || request.tags.some((tag) => typeof tag !== "string"))) {
    throw new CaptureBridgeRequestError(400, "Capture tags must contain at most 50 strings.");
  }
}

function normalizeTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? [])
    .map((tag) => String(tag).replace(/^#+/u, "").trim().toLowerCase().replace(/\s+/gu, "-").slice(0, 80))
    .filter(Boolean))];
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
