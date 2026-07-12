import type { ArticleSummary, OpenQuestion, OpenQuestionStatus, QuestionStatusOption } from "../core/types";
import { enrichArticleSummariesWithWorkflow } from "../core/articles";
import { normalizeExternalApiBindHost, type ToWriteDeviceCaptureSettings, type ToWriteExternalApiSettings } from "../core/settings";
import type { PushAnchorInput, PushFeedbackInput } from "../push/state";
import type { PushFeedPayload, PushTargetSettings } from "../push/types";
import type { WorkflowIndexPayload, WorkflowSummaryPayload } from "../workflow";
import { workflowQueryFromUrl, type WorkflowQuery } from "../workflow";
import {
  CaptureConflictError,
  CaptureUndoTokenError,
  type CaptureDraft,
  type CaptureTargetAction,
  type CaptureTargetCandidate,
  type CaptureUndoResult
} from "../capture";
import {
  buildDeviceGoUrl,
  buildDeviceInputUrl,
  deliveryIdFor,
  feedbackActionForIntent,
  normalizeDeviceButtonMappings,
  normalizeDeviceEventInput,
  sourceRefToObsidianUri,
  type DeviceActionIntent,
  type DeviceEventInput,
  type DeviceEventResult,
  type DeviceSourceRef
} from "../device-interactions";
import { buildDashboardHtml } from "./dashboard";
import { buildDeviceInputPageHtml } from "./device-input-page";
import { buildDevicePageHtml } from "./device-page";
import { buildDeviceIconSvg, buildDeviceManifest, buildDeviceServiceWorker } from "./device-pwa";
import { buildDeviceFeedPayload, deviceFeedQueryFromUrl } from "./device-feed";
import {
  buildArticlesPayload,
  buildDeckPayload,
  buildExternalEinkPayload,
  buildQuestionsPayload,
  buildRssFeed,
  buildSseSnapshot,
  parseLimit,
  queryFromUrl
} from "./payloads";

interface ExternalApiServerOptions {
  pluginVersion: string;
  getSettings(): ToWriteExternalApiSettings;
  getVaultName(): string;
  getQuestions(query?: ReturnType<typeof queryFromUrl>): OpenQuestion[];
  getArticleSummaries(): ArticleSummary[];
  getWorkflowPayload(query?: WorkflowQuery): WorkflowIndexPayload;
  getWorkflowSummary(): WorkflowSummaryPayload;
  getDeviceCaptureSettings(): ToWriteDeviceCaptureSettings;
  getRestrictedAccessToken?(): string;
  getRestrictedAccessTokens?(): string[];
  getPushTargets?(): PushTargetSettings[];
  getPushFeed?(targetId?: string): PushFeedPayload;
  recordPushFeedback?(input: PushFeedbackInput): Promise<void>;
  recordContextAnchor?(input: PushAnchorInput): Promise<void>;
  getStatusOptions(): QuestionStatusOption[];
  updateQuestionStatus(id: string, status: OpenQuestionStatus, note?: string, clientId?: string): Promise<OpenQuestion | undefined>;
  appendQuestionNote(id: string, text: string, clientId?: string, metadata?: DeviceWritebackMetadata): Promise<OpenQuestion | undefined>;
  updateQuestionFields(id: string, patch: QuestionFieldPatch): Promise<OpenQuestion | undefined>;
  recommendCapture?(draft: CaptureDraft): Promise<CaptureTargetCandidate[]>;
  createDeviceCapture(request: DeviceCaptureRequest): Promise<DeviceCaptureResult>;
  undoCapture?(captureId: string, undoToken: string): Promise<CaptureUndoResult>;
  subscribe(listener: () => void): () => void;
}

export interface DeviceCaptureTarget {
  kind: "inboxFile" | "folderPath" | "stageId" | "existingNote";
  inboxFile?: string;
  folderPath?: string;
  stageId?: string;
  filePath?: string;
  heading?: string;
}

export interface DeviceCaptureRequest {
  title?: string;
  text: string;
  tags: string[];
  captureId?: string;
  candidateId?: string;
  action?: CaptureTargetAction;
  targetRevision?: string;
  target?: DeviceCaptureTarget;
  clientId?: string;
  metadata?: DeviceWritebackMetadata;
}

export interface DeviceCaptureResult {
  filePath: string;
  title: string;
  tags: string[];
  targetKind: DeviceCaptureTarget["kind"];
  createdAt: string;
  openUri: string;
  captureId?: string;
  candidateId?: string;
  action?: CaptureTargetAction;
  undoToken?: string;
  targetRevision?: string;
  idempotent?: boolean;
}

export interface DeviceWritebackMetadata {
  source_device?: string;
  target_id?: string;
  candidate_id?: string;
  delivery_id?: string;
  source_file?: string;
  source_line?: string;
  source_end_line?: string;
  source_block_id?: string;
  source_page?: string;
  place_label?: string;
  input_mode?: string;
  created_at?: string;
}

interface DeviceHandoff {
  id: string;
  expiresAt: string;
  targetId?: string;
  intent: DeviceActionIntent;
  questionId?: string;
  candidateId?: string;
  deliveryId?: string;
  sourceRef?: DeviceSourceRef;
}

interface QuestionFieldPatch {
  title?: string;
  question?: string;
  reminderAt?: string;
  reminderNote?: string;
  reminderSource?: string;
  reminderDismissedAt?: string;
}

declare function require(moduleId: "http"): NodeHttpModule;

interface NodeHttpModule {
  createServer(listener: (request: HttpRequest, response: HttpResponse) => void): HttpServer;
}

interface HttpServer {
  listen(port: number, host: string, callback: () => void): HttpServer;
  close(callback?: () => void): void;
  on(event: "error", listener: (error: NodeError) => void): HttpServer;
}

interface NodeError extends Error {
  code?: string;
}

interface HttpRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: "data", listener: (chunk: Uint8Array | string) => void): void;
  on(event: "end", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
}

interface HttpResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  writeHead(statusCode: number, headers: Record<string, string>): void;
  write(chunk: string): void;
  end(chunk?: string): void;
  on(event: "close", listener: () => void): void;
}

export class ExternalApiError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

export class ToWriteExternalApiServer {
  private server?: HttpServer;
  private unsubscribe?: () => void;
  private readonly sseClients = new Set<HttpResponse>();
  private readonly pushSseClients = new Map<HttpResponse, string | undefined>();
  private readonly handoffs = new Map<string, DeviceHandoff>();
  private readonly deviceEventResults = new Map<string, DeviceEventResult>();

  constructor(private readonly options: ExternalApiServerOptions) {}

  async start(): Promise<void> {
    const settings = this.options.getSettings();
    if (!settings.enabled || this.server) {
      return;
    }

    const token = settings.token.trim();
    const bindHost = normalizeExternalApiBindHost(settings.bindHost);
    if (!token) {
      throw new ExternalApiError(400, "External API token is missing.");
    }

    const server = require("http").createServer((request, response) => {
      void this.handleRequest(request, response);
    });
    this.server = server;
    this.unsubscribe = this.options.subscribe(() => {
      this.broadcastUpdate();
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      server.on("error", (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
      server.listen(settings.port, bindHost, () => {
        settled = true;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;

    for (const client of this.sseClients) {
      client.end();
    }
    this.sseClients.clear();
    for (const client of this.pushSseClients.keys()) {
      client.end();
    }
    this.pushSseClients.clear();

    const server = this.server;
    this.server = undefined;
    if (!server) {
      return;
    }

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private async handleRequest(request: HttpRequest, response: HttpResponse): Promise<void> {
    const method = (request.method ?? "GET").toUpperCase();
    const url = new URL(request.url ?? "/", `http://${hostHeader(request)}`);
    setCorsHeaders(response);

    if (method === "OPTIONS") {
      response.writeHead(204, {});
      response.end();
      return;
    }

    try {
      if (method === "GET" && url.pathname === "/health") {
        this.writeJson(response, 200, {
          ok: true,
          plugin: "towrite-open-questions",
          version: this.options.pluginVersion,
          schemaVersion: 1
        });
        return;
      }

      if (method === "GET" && url.pathname === "/device.webmanifest") {
        this.writeText(response, 200, "application/manifest+json; charset=utf-8", buildDeviceManifest());
        return;
      }

      if (method === "GET" && url.pathname === "/device-sw.js") {
        this.writeText(response, 200, "text/javascript; charset=utf-8", buildDeviceServiceWorker());
        return;
      }

      if (method === "GET" && url.pathname === "/device-icon.svg") {
        this.writeText(response, 200, "image/svg+xml; charset=utf-8", buildDeviceIconSvg());
        return;
      }

      if (!this.isAuthorized(request, url, method)) {
        throw new ExternalApiError(401, "Unauthorized.");
      }

      if (method === "GET") {
        this.handleGet(request, response, url);
        return;
      }

      if (method === "POST") {
        await this.handlePost(request, response, url);
        return;
      }

      if (method === "PATCH") {
        await this.handlePatch(request, response, url);
        return;
      }

      throw new ExternalApiError(405, "Method not allowed.");
    } catch (error) {
      const apiError = error instanceof ExternalApiError
        ? error
        : error instanceof CaptureConflictError
          ? new ExternalApiError(409, error.message)
          : error instanceof CaptureUndoTokenError
            ? new ExternalApiError(400, error.message)
        : new ExternalApiError(500, error instanceof Error ? error.message : String(error));
      this.writeJson(response, apiError.statusCode, {
        error: apiError.message
      });
    }
  }

  private handleGet(request: HttpRequest, response: HttpResponse, url: URL): void {
    const vaultName = this.options.getVaultName();

    if (url.pathname === "/device/go") {
      const result = this.resolveDeviceAction(request, url);
      const redirectUrl = result.action === "open"
        ? result.obsidianUri || result.openUrl
        : result.openUrl || result.obsidianUri;
      if (!redirectUrl) {
        throw new ExternalApiError(404, "No device action is available.");
      }
      response.writeHead(302, { location: redirectUrl });
      response.end();
      return;
    }

    if (url.pathname === "/api/v1/questions") {
      const questions = this.options.getQuestions(queryFromUrl(url));
      this.writeJson(response, 200, buildQuestionsPayload(vaultName, questions));
      return;
    }

    if (url.pathname === "/api/v1/articles") {
      const workflowPayload = this.options.getWorkflowPayload({ limit: 200, compact: true });
      this.writeJson(response, 200, buildArticlesPayload(
        vaultName,
        enrichArticleSummariesWithWorkflow(this.options.getArticleSummaries(), workflowPayload, workflowPayload.generatedAt)
      ));
      return;
    }

    if (url.pathname === "/api/v1/workflows") {
      this.writeJson(response, 200, this.options.getWorkflowPayload(workflowQueryFromUrl(url)));
      return;
    }

    if (url.pathname === "/api/v1/device-feed") {
      const settings = this.options.getSettings();
      const query = deviceFeedQueryFromUrl(url);
      query.token = settings.token.trim();
      query.companionBaseUrl = settings.publicBaseUrl || "";
      this.writeJson(response, 200, buildDeviceFeedPayload(
        vaultName,
        this.options.getQuestions(),
        this.options.getArticleSummaries(),
        this.options.getWorkflowPayload({
          stage: url.searchParams.get("stage")?.trim() || undefined,
          limit: 50,
          compact: true
        }),
        query
      ));
      return;
    }

    if (url.pathname === "/api/v1/device-input-context") {
      this.writeJson(response, 200, this.buildDeviceInputContext(url));
      return;
    }

    if (url.pathname === "/api/v1/push/feed") {
      this.writeJson(response, 200, this.buildPushFeed(url));
      return;
    }

    if (url.pathname === "/api/v1/eink") {
      const limit = parseLimit(url.searchParams.get("limit"), 12);
      const questions = this.options.getQuestions(queryFromUrl(url));
      this.writeJson(response, 200, buildExternalEinkPayload(vaultName, questions, this.options.getArticleSummaries(), limit));
      return;
    }

    if (url.pathname === "/api/v1/deck") {
      const limit = parseLimit(url.searchParams.get("limit"), 20);
      const questions = this.options.getQuestions(queryFromUrl(url));
      this.writeJson(response, 200, buildDeckPayload(vaultName, questions, limit));
      return;
    }

    if (url.pathname === "/dashboard" || url.pathname === "/api/v1/dashboard") {
      this.writeText(response, 200, "text/html; charset=utf-8", buildDashboardHtml());
      return;
    }

    if (url.pathname === "/device") {
      this.writeText(response, 200, "text/html; charset=utf-8", buildDevicePageHtml());
      return;
    }

    if (url.pathname === "/device/input") {
      this.writeText(response, 200, "text/html; charset=utf-8", buildDeviceInputPageHtml());
      return;
    }

    if (url.pathname === "/api/v1/rss.xml") {
      const selfUrl = `http://${hostHeader(request)}${url.pathname}`;
      this.writeText(response, 200, "application/rss+xml; charset=utf-8", buildRssFeed(vaultName, this.options.getQuestions(queryFromUrl(url)), selfUrl));
      return;
    }

    if (url.pathname === "/api/v1/events") {
      this.startSse(response);
      return;
    }

    if (url.pathname === "/api/v1/push/events") {
      this.startPushSse(response, url.searchParams.get("targetId")?.trim() || undefined);
      return;
    }

    throw new ExternalApiError(404, "Not found.");
  }

  private async handlePost(request: HttpRequest, response: HttpResponse, url: URL): Promise<void> {
    const statusMatch = /^\/api\/v1\/questions\/([^/]+)\/status$/u.exec(url.pathname);
    if (statusMatch) {
      const id = decodeURIComponent(statusMatch[1]);
      const body = await readJsonBody(request);
      const status = readString(body, "status");
      if (!status) {
        throw new ExternalApiError(400, "Missing status.");
      }
      if (!this.options.getStatusOptions().some((option) => option.id === status)) {
        throw new ExternalApiError(400, `Unknown status: ${status}`);
      }
      const note = readOptionalText(body, "note");
      const clientId = readOptionalText(body, "clientId");
      const updated = await this.options.updateQuestionStatus(id, status, note, clientId);
      if (!updated) {
        throw new ExternalApiError(404, "Question not found.");
      }
      this.writeJson(response, 200, buildQuestionsPayload(this.options.getVaultName(), [updated]));
      return;
    }

    const notesMatch = /^\/api\/v1\/questions\/([^/]+)\/notes$/u.exec(url.pathname);
    if (notesMatch) {
      const id = decodeURIComponent(notesMatch[1]);
      const body = await readJsonBody(request);
      const text = readOptionalText(body, "text");
      if (!text) {
        throw new ExternalApiError(400, "Missing note text.");
      }
      const clientId = readOptionalText(body, "clientId");
      const updated = await this.options.appendQuestionNote(id, text, clientId, readWritebackMetadata(body));
      if (!updated) {
        throw new ExternalApiError(404, "Question not found.");
      }
      this.writeJson(response, 200, buildQuestionsPayload(this.options.getVaultName(), [updated]));
      return;
    }

    if (url.pathname === "/api/v1/capture/recommendations") {
      if (!this.options.getDeviceCaptureSettings().enabled) {
        throw new ExternalApiError(403, "Device capture is disabled.");
      }
      if (!this.options.recommendCapture) {
        throw new ExternalApiError(501, "Capture recommendations are not available.");
      }
      const body = await readJsonBody(request);
      const draft = readCaptureDraft(body);
      const candidates = await this.options.recommendCapture(draft);
      this.writeJson(response, 200, {
        schemaVersion: 1,
        draftId: draft.id,
        candidates
      });
      return;
    }

    const undoCaptureMatch = /^\/api\/v1\/captures\/([^/]+)\/undo$/u.exec(url.pathname);
    if (undoCaptureMatch) {
      if (!this.options.undoCapture) {
        throw new ExternalApiError(501, "Capture undo is not available.");
      }
      const body = await readJsonBody(request);
      const undoToken = readOptionalText(body, "undoToken");
      if (!undoToken) {
        throw new ExternalApiError(400, "Missing undoToken.");
      }
      const captureId = decodeURIComponent(undoCaptureMatch[1]);
      const result = await this.options.undoCapture(captureId, undoToken);
      if (result.captureId !== captureId) {
        throw new ExternalApiError(409, "Undo token does not match capture id.");
      }
      this.writeJson(response, 200, { data: result });
      return;
    }

    if (url.pathname === "/api/v1/captures") {
      if (!this.options.getDeviceCaptureSettings().enabled) {
        throw new ExternalApiError(403, "Device capture is disabled.");
      }
      const body = await readJsonBody(request);
      const text = readOptionalText(body, "text");
      if (!text) {
        throw new ExternalApiError(400, "Missing capture text.");
      }
      const capture: DeviceCaptureRequest = {
        title: readOptionalText(body, "title"),
        text,
        tags: readStringList(body, "tags"),
        captureId: readOptionalText(body, "captureId"),
        candidateId: readOptionalText(body, "candidateId"),
        action: readCaptureAction(body.action),
        targetRevision: readOptionalText(body, "targetRevision"),
        target: readCaptureTarget(body),
        clientId: readOptionalText(body, "clientId"),
        metadata: readWritebackMetadata(body)
      };
      const result = await this.options.createDeviceCapture(capture);
      this.writeJson(response, 201, {
        data: result
      });
      return;
    }

    if (url.pathname === "/api/v1/device/events") {
      const body = await readJsonBody(request);
      const event = this.readDeviceEvent(body);
      const cached = this.deviceEventResults.get(event.eventId);
      if (cached) {
        this.writeJson(response, 200, { ...cached, duplicate: true });
        return;
      }
      const result = this.resolveDeviceAction(request, url, event);
      await this.recordDeviceEventFeedback(event, result);
      this.rememberDeviceEventResult(result);
      this.writeJson(response, 200, result);
      return;
    }

    if (url.pathname === "/api/v1/device/handoffs") {
      const body = await readJsonBody(request);
      const handoff = this.createDeviceHandoff(body);
      this.writeJson(response, 201, {
        id: handoff.id,
        expiresAt: handoff.expiresAt,
        url: buildDeviceGoUrl(this.baseUrlForRequest(request), { handoff: handoff.id })
      });
      return;
    }

    if (url.pathname === "/api/v1/push/feedback") {
      if (!this.options.recordPushFeedback) {
        throw new ExternalApiError(404, "Push feedback is not available.");
      }
      const body = await readJsonBody(request);
      const targetId = readString(body, "targetId");
      const candidateId = readString(body, "candidateId");
      const action = readPushFeedbackAction(body);
      if (!targetId || !candidateId || !action) {
        throw new ExternalApiError(400, "Missing targetId, candidateId, or action.");
      }
      await this.options.recordPushFeedback({
        targetId,
        candidateId,
        candidateType: readPushCandidateType(body),
        action,
        note: readOptionalText(body, "note"),
        clientId: readOptionalText(body, "clientId")
      });
      this.writeJson(response, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/v1/context/anchors") {
      if (!this.options.recordContextAnchor) {
        throw new ExternalApiError(404, "Context anchors are not available.");
      }
      const body = await readJsonBody(request);
      const targetId = readOptionalText(body, "targetId");
      const source = readOptionalText(body, "source");
      await this.options.recordContextAnchor({
        source: source === "manual" || source === "device" || source === "system" || source === "ai" ? source : "device",
        targetId,
        deviceId: readOptionalText(body, "deviceId"),
        placeLabel: readOptionalText(body, "placeLabel"),
        mode: readOptionalText(body, "mode"),
        activeFile: readOptionalText(body, "activeFile"),
        networkLabel: readOptionalText(body, "networkLabel"),
        preciseLocation: readPreciseLocation(body),
        ttlSeconds: readPositiveInteger(body, "ttlSeconds")
      });
      this.writeJson(response, 200, { ok: true });
      return;
    }

    throw new ExternalApiError(404, "Not found.");
  }

  private async handlePatch(request: HttpRequest, response: HttpResponse, url: URL): Promise<void> {
    const questionMatch = /^\/api\/v1\/questions\/([^/]+)$/u.exec(url.pathname);
    if (!questionMatch) {
      throw new ExternalApiError(404, "Not found.");
    }

    const id = decodeURIComponent(questionMatch[1]);
    const body = await readJsonBody(request);
    const title = readPatchString(body, "title", 160);
    const questionField = readPatchString(body, "question", 4000);
    const question = questionField.present ? questionField : readPatchString(body, "body", 4000);
    const reminderAt = readPatchString(body, "reminderAt", 64);
    const reminderNote = readPatchString(body, "reminderNote", 500);
    const reminderSource = readPatchString(body, "reminderSource", 32);
    const reminderDismissedAt = readPatchString(body, "reminderDismissedAt", 64);
    if (!title.present && !question.present && !reminderAt.present && !reminderNote.present && !reminderSource.present && !reminderDismissedAt.present) {
      throw new ExternalApiError(400, "Missing title, body, or reminder field.");
    }

    const patch: QuestionFieldPatch = {};
    if (title.present) {
      patch.title = title.value;
    }
    if (question.present) {
      patch.question = question.value;
    }
    if (reminderAt.present) {
      patch.reminderAt = reminderAt.value;
    }
    if (reminderNote.present) {
      patch.reminderNote = reminderNote.value;
    }
    if (reminderSource.present) {
      patch.reminderSource = reminderSource.value;
    }
    if (reminderDismissedAt.present) {
      patch.reminderDismissedAt = reminderDismissedAt.value;
    }
    const updated = await this.options.updateQuestionFields(id, patch);
    if (!updated) {
      throw new ExternalApiError(404, "Question not found.");
    }
    this.writeJson(response, 200, buildQuestionsPayload(this.options.getVaultName(), [updated]));
  }

  private startSse(response: HttpResponse): void {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    });
    this.sseClients.add(response);
    response.on("close", () => {
      this.sseClients.delete(response);
    });
    this.writeSse(response, "snapshot", this.currentSnapshot());
  }

  private startPushSse(response: HttpResponse, targetId?: string): void {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    });
    this.pushSseClients.set(response, targetId);
    response.on("close", () => {
      this.pushSseClients.delete(response);
    });
    this.writeSse(response, "snapshot", this.buildPushFeedForTarget(targetId));
  }

  private broadcastUpdate(): void {
    const snapshot = this.currentSnapshot();
    for (const client of this.sseClients) {
      this.writeSse(client, "update", snapshot);
    }
    for (const [client, targetId] of this.pushSseClients.entries()) {
      this.writeSse(client, "update", this.buildPushFeedForTarget(targetId));
    }
  }

  private currentSnapshot() {
    return buildSseSnapshot(
      this.options.getVaultName(),
      this.options.getQuestions(),
      this.options.getArticleSummaries(),
      this.options.getWorkflowSummary()
    );
  }

  private resolveDeviceAction(request: HttpRequest, url: URL, event?: DeviceEventInput): DeviceEventResult {
    const handoff = this.resolveDeviceHandoff(url.searchParams.get("handoff"));
    const targetId = event?.targetId || handoff?.targetId || url.searchParams.get("targetId")?.trim() || "quote0";
    const intent = event?.action || handoff?.intent || readDeviceIntent(url.searchParams.get("intent")) || "respond";
    const feed = this.options.getPushFeed?.(targetId);
    const candidate = feed?.candidate;
    const candidateId = event?.candidateId || handoff?.candidateId || url.searchParams.get("candidateId")?.trim() || feed?.decision.candidateId;
    const candidateType = event?.candidateType || feed?.decision.candidateType;
    const deliveryId = event?.deliveryId || handoff?.deliveryId || url.searchParams.get("deliveryId")?.trim() || feed?.decision.deliveryId || deliveryIdFor(targetId, candidateId, new Date().toISOString());
    const questionId = handoff?.questionId || candidate?.questionId || (candidateType === "question" ? candidateId : undefined);
    const sourceRef = handoff?.sourceRef || candidate?.sourceRef || sourceRefFromUrl(url, this.options.getVaultName());
    const token = this.deviceTokenForRequest(request, url, targetId);
    const baseUrl = this.baseUrlForRequest(request);
    const openUrl = this.openUrlForIntent(intent, baseUrl, token, {
      questionId,
      targetId,
      candidateId,
      deliveryId,
      sourceRef
    });
    const obsidianUri = candidate?.openUri || sourceRefToObsidianUri(sourceRef, this.options.getVaultName());
    const feedUrl = `${baseUrl}/api/v1/push/feed?targetId=${encodeURIComponent(targetId)}`;

    return {
      ok: true,
      eventId: event?.eventId || handoff?.id || `go_${Date.now().toString(36)}`,
      duplicate: false,
      action: intent,
      targetId,
      candidateId,
      candidateType,
      deliveryId,
      openUrl: intent === "open" ? obsidianUri || openUrl : openUrl,
      obsidianUri,
      feedUrl,
      displayMessage: displayMessageForDeviceIntent(intent)
    };
  }

  private openUrlForIntent(intent: DeviceActionIntent, baseUrl: string, token: string | undefined, options: {
    questionId?: string;
    targetId: string;
    candidateId?: string;
    deliveryId?: string;
    sourceRef?: DeviceSourceRef;
  }): string | undefined {
    if (intent === "open") {
      return sourceRefToObsidianUri(options.sourceRef, this.options.getVaultName());
    }
    if (intent === "next" || intent === "prev" || intent === "later" || intent === "skipped") {
      return buildDeviceGoUrl(baseUrl, {
        token,
        targetId: options.targetId,
        intent: "respond",
        candidateId: options.candidateId,
        deliveryId: options.deliveryId
      });
    }
    return buildDeviceInputUrl(baseUrl, {
      token,
      questionId: intent === "capture" ? undefined : options.questionId,
      targetId: options.targetId,
      candidateId: options.candidateId,
      deliveryId: options.deliveryId,
      intent,
      sourceRef: options.sourceRef
    });
  }

  private readDeviceEvent(body: Record<string, unknown>): DeviceEventInput {
    const targetId = readString(body, "targetId");
    const target = this.options.getPushTargets?.().find((item) => item.id === targetId);
    try {
      return normalizeDeviceEventInput(body, normalizeDeviceButtonMappings(target?.buttonMappings));
    } catch (error) {
      throw new ExternalApiError(400, error instanceof Error ? error.message : String(error));
    }
  }

  private async recordDeviceEventFeedback(event: DeviceEventInput, result: DeviceEventResult): Promise<void> {
    const action = feedbackActionForIntent(result.action);
    const candidateId = result.candidateId || event.candidateId;
    if (!action || !candidateId || !this.options.recordPushFeedback) {
      return;
    }
    await this.options.recordPushFeedback({
      targetId: result.targetId,
      candidateId,
      candidateType: result.candidateType || event.candidateType,
      action,
      note: event.note,
      clientId: event.deviceId || "device-event",
      at: event.occurredAt
    });
  }

  private rememberDeviceEventResult(result: DeviceEventResult): void {
    this.deviceEventResults.set(result.eventId, result);
    if (this.deviceEventResults.size <= 300) {
      return;
    }
    const firstKey = this.deviceEventResults.keys().next().value as string | undefined;
    if (firstKey) {
      this.deviceEventResults.delete(firstKey);
    }
  }

  private createDeviceHandoff(body: Record<string, unknown>): DeviceHandoff {
    const ttlSeconds = Math.max(30, Math.min(readPositiveInteger(body, "ttlSeconds") ?? 300, 60 * 30));
    const intent = readDeviceIntent(readString(body, "intent")) || "respond";
    const targetId = readString(body, "targetId");
    const candidateId = readString(body, "candidateId");
    const id = `dho_${randomFragment()}`;
    const handoff: DeviceHandoff = {
      id,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      targetId,
      intent,
      questionId: readString(body, "questionId"),
      candidateId,
      deliveryId: readString(body, "deliveryId") || deliveryIdFor(targetId || "device", candidateId, new Date().toISOString()),
      sourceRef: readSourceRefBody(body)
    };
    this.handoffs.set(id, handoff);
    this.purgeHandoffs();
    return handoff;
  }

  private resolveDeviceHandoff(id: string | null): DeviceHandoff | undefined {
    if (!id) {
      return undefined;
    }
    this.purgeHandoffs();
    return this.handoffs.get(id) ?? undefined;
  }

  private purgeHandoffs(): void {
    const now = Date.now();
    for (const [id, handoff] of this.handoffs.entries()) {
      if (Date.parse(handoff.expiresAt) <= now) {
        this.handoffs.delete(id);
      }
    }
  }

  private buildDeviceInputContext(url: URL) {
    const questionId = url.searchParams.get("questionId")?.trim();
    const question = questionId
      ? this.options.getQuestions().find((item) => item.id === questionId)
      : undefined;
    const capture = this.options.getDeviceCaptureSettings();
    const workflow = this.options.getWorkflowSummary();
    const questionSourceRef = question ? {
      vaultName: this.options.getVaultName(),
      filePath: question.source.file,
      lineStart: question.source.lineStart + 1,
      lineEnd: question.source.lineEnd + 1,
      blockId: question.source.blockId,
      page: question.source.page
    } : undefined;
    const sourceRef = sourceRefFromUrl(url, this.options.getVaultName()) || questionSourceRef;
    return {
      schemaVersion: 1,
      interaction: {
        targetId: url.searchParams.get("targetId")?.trim() || undefined,
        candidateId: url.searchParams.get("candidateId")?.trim() || questionId || undefined,
        deliveryId: url.searchParams.get("deliveryId")?.trim() || undefined,
        intent: readDeviceIntent(url.searchParams.get("intent")) || (questionId ? "respond" : "capture"),
        sourceRef,
        obsidianUri: sourceRefToObsidianUri(sourceRef, this.options.getVaultName())
      },
      capture: {
        enabled: capture.enabled,
        inboxFile: capture.inboxFile,
        defaultTags: capture.defaultTags,
        targets: [
          {
            label: `Inbox: ${capture.inboxFile}`,
            value: { kind: "inboxFile", inboxFile: capture.inboxFile }
          },
          ...capture.targetFolders.map((folderPath) => ({
            label: `Folder: ${folderPath}`,
            value: { kind: "folderPath", folderPath }
          })),
          ...workflow.stages.map((stage) => ({
            label: `Stage: ${stage.title}`,
            value: { kind: "stageId", stageId: stage.id }
          }))
        ]
      },
      question: question ? {
        id: question.id,
        title: question.title || question.question,
        lane: question.lane,
        status: question.status,
        kind: question.kind,
        sourceFile: question.source.file,
        sourceLine: question.source.lineStart + 1,
        sourceEndLine: question.source.lineEnd + 1,
        sourceBlockId: question.source.blockId,
        sourcePage: question.source.page,
        source: question.source.page
          ? `${question.source.file} P${question.source.page}`
          : `${question.source.file}:${question.source.lineStart + 1}`
      } : undefined
    };
  }

  private buildPushFeed(url: URL): PushFeedPayload {
    return this.buildPushFeedForTarget(url.searchParams.get("targetId")?.trim() || undefined);
  }

  private buildPushFeedForTarget(targetId?: string): PushFeedPayload {
    if (!this.options.getPushFeed) {
      throw new ExternalApiError(404, "Push feed is not available.");
    }
    return this.options.getPushFeed(targetId);
  }

  private baseUrlForRequest(request: HttpRequest): string {
    return this.options.getSettings().publicBaseUrl.trim().replace(/\/+$/u, "") || `http://${hostHeader(request)}`;
  }

  private deviceTokenForRequest(request: HttpRequest, url: URL, targetId: string): string | undefined {
    const authorization = headerValue(request, "authorization");
    const bearer = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    if (bearer && this.restrictedTokens().includes(bearer)) {
      return bearer;
    }
    const queryToken = url.searchParams.get("token")?.trim();
    if (queryToken && this.restrictedTokens().includes(queryToken)) {
      return queryToken;
    }
    const settings = this.options.getSettings();
    const targetToken = this.options.getPushTargets?.().find((target) => target.id === targetId)?.token?.trim();
    if (targetToken) {
      return targetToken;
    }
    const quote0Token = this.options.getRestrictedAccessToken?.()?.trim();
    if (targetId === "quote0" && quote0Token) {
      return quote0Token;
    }
    return settings.token.trim();
  }

  private writeSse(response: HttpResponse, event: string, payload: unknown): void {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  private isAuthorized(request: HttpRequest, url: URL, method: string): boolean {
    const settings = this.options.getSettings();
    const token = settings.token.trim();
    const authorization = headerValue(request, "authorization");
    if (authorization === `Bearer ${token}`) {
      return true;
    }
    if (method === "GET" && settings.allowQueryTokenForRead && url.searchParams.get("token") === token) {
      return true;
    }
    if (method === "GET" && url.pathname === "/device/go" && this.resolveDeviceHandoff(url.searchParams.get("handoff"))) {
      return true;
    }
    const restrictedTokens = this.restrictedTokens();
    if (restrictedTokens.length === 0 || !this.isRestrictedRoute(method, url.pathname)) {
      return false;
    }
    const bearer = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    if (bearer && restrictedTokens.includes(bearer)) {
      return true;
    }
    const queryToken = url.searchParams.get("token")?.trim();
    return method === "GET" && Boolean(queryToken && restrictedTokens.includes(queryToken));
  }

  private restrictedTokens(): string[] {
    const values = [
      this.options.getRestrictedAccessToken?.(),
      ...(this.options.getRestrictedAccessTokens?.() ?? [])
    ];
    const seen = new Set<string>();
    const output: string[] = [];
    for (const value of values) {
      const token = value?.trim();
      if (!token || seen.has(token)) {
        continue;
      }
      seen.add(token);
      output.push(token);
    }
    return output;
  }

  private isRestrictedRoute(method: string, pathname: string): boolean {
    if (method === "GET") {
      return pathname === "/device/input" || pathname === "/device/go" || pathname === "/api/v1/device-input-context";
    }
    if (method === "POST") {
      return pathname === "/api/v1/captures"
        || pathname === "/api/v1/capture/recommendations"
        || /^\/api\/v1\/captures\/[^/]+\/undo$/u.test(pathname)
        || pathname === "/api/v1/device/events"
        || pathname === "/api/v1/device/handoffs"
        || pathname === "/api/v1/push/feedback"
        || /^\/api\/v1\/questions\/[^/]+\/notes$/u.test(pathname);
    }
    return false;
  }

  private writeJson(response: HttpResponse, status: number, payload: unknown): void {
    this.writeText(response, status, "application/json; charset=utf-8", JSON.stringify(payload));
  }

  private writeText(response: HttpResponse, status: number, contentType: string, payload: string): void {
    response.statusCode = status;
    response.setHeader("content-type", contentType);
    response.end(payload);
  }
}

function setCorsHeaders(response: HttpResponse): void {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,PATCH,OPTIONS");
  response.setHeader("access-control-allow-headers", "authorization,content-type");
}

function hostHeader(request: HttpRequest): string {
  return headerValue(request, "host") ?? "127.0.0.1";
}

function headerValue(request: HttpRequest, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()] ?? request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readJsonBody(request: HttpRequest): Promise<Record<string, unknown>> {
  const body = await readBody(request);
  if (!body.trim()) {
    return {};
  }
  const parsed = JSON.parse(body) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ExternalApiError(400, "Body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function readBody(request: HttpRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder();
    let body = "";
    request.on("data", (chunk) => {
      body += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      if (body.length > 1024 * 1024) {
        reject(new ExternalApiError(413, "Request body is too large."));
      }
    });
    request.on("end", () => {
      body += decoder.decode();
      resolve(body);
    });
    request.on("error", reject);
  });
}

function readString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalText(body: Record<string, unknown>, key: string): string | undefined {
  const value = readString(body, key);
  return value ? value.slice(0, 4000) : undefined;
}

function readStringList(body: Record<string, unknown>, key: string): string[] {
  const value = body[key];
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .flatMap(splitListText)
      .slice(0, 20);
  }
  if (typeof value === "string") {
    return splitListText(value).slice(0, 20);
  }
  return [];
}

function readWritebackMetadata(body: Record<string, unknown>): DeviceWritebackMetadata | undefined {
  const raw = body.metadata;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const metadata: DeviceWritebackMetadata = {
    source_device: readMetadataString(record, "source_device"),
    target_id: readMetadataString(record, "target_id"),
    candidate_id: readMetadataString(record, "candidate_id"),
    delivery_id: readMetadataString(record, "delivery_id"),
    source_file: readMetadataString(record, "source_file"),
    source_line: readMetadataString(record, "source_line"),
    source_end_line: readMetadataString(record, "source_end_line"),
    source_block_id: readMetadataString(record, "source_block_id"),
    source_page: readMetadataString(record, "source_page"),
    place_label: readMetadataString(record, "place_label"),
    input_mode: readMetadataString(record, "input_mode"),
    created_at: normalizeMetadataIso(record.created_at)
  };
  return Object.values(metadata).some(Boolean) ? metadata : undefined;
}

function readMetadataString(record: Record<string, unknown>, key: keyof DeviceWritebackMetadata): string | undefined {
  return readLooseString(record, key);
}

function readLooseString(record: Record<string, unknown>, key: string, maxLength = 240): string | undefined {
  const value = record[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function normalizeMetadataIso(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function splitListText(value: string): string[] {
  return value
    .split(/[，,、;；\s]+/u)
    .map((item) => item.replace(/^#+/u, "").trim())
    .filter(Boolean);
}

function readCaptureDraft(body: Record<string, unknown>): CaptureDraft {
  const nested = body.draft;
  const record = nested && typeof nested === "object" && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : body;
  if (record.schemaVersion !== undefined && record.schemaVersion !== 1) {
    throw new ExternalApiError(400, `Unsupported capture schema version: ${String(record.schemaVersion)}.`);
  }
  const captureBody = readOptionalText(record, "body") ?? readOptionalText(record, "text");
  if (!captureBody) {
    throw new ExternalApiError(400, "Missing capture body.");
  }
  const rawSource = record.source;
  const source = rawSource && typeof rawSource === "object" && !Array.isArray(rawSource)
    ? rawSource as Record<string, unknown>
    : undefined;
  const rawIntent = readOptionalText(record, "intent");
  return {
    schemaVersion: 1,
    id: readOptionalText(record, "id") ?? readOptionalText(record, "captureId") ?? `capture_${randomFragment()}`,
    intent: rawIntent === "selection" || rawIntent === "answer" ? rawIntent : "new",
    body: captureBody,
    title: readOptionalText(record, "title"),
    tags: readStringList(record, "tags"),
    links: readStringList(record, "links"),
    source: source ? {
      file: readOptionalText(source, "file"),
      headingPath: readStringList(source, "headingPath"),
      questionId: readOptionalText(source, "questionId"),
      entryPoint: readOptionalText(source, "entryPoint") ?? "external-api",
      articleTypeId: readOptionalText(source, "articleTypeId"),
      workflowStageId: readOptionalText(source, "workflowStageId")
    } : undefined,
    createdAt: normalizeMetadataIso(record.createdAt)
  };
}

function readCaptureAction(value: unknown): CaptureTargetAction | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value === "append" || value === "create") {
    return value;
  }
  throw new ExternalApiError(400, "Capture action must be 'append' or 'create'.");
}

function readCaptureTarget(body: Record<string, unknown>): DeviceCaptureTarget | undefined {
  const value = body.target;
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ExternalApiError(400, "Capture target must be an object.");
  }
  const target = value as Record<string, unknown>;
  const kind = typeof target.kind === "string" ? target.kind : "";
  if (kind === "inboxFile") {
    return {
      kind,
      inboxFile: typeof target.inboxFile === "string" ? target.inboxFile.trim().slice(0, 240) : undefined
    };
  }
  if (kind === "folderPath") {
    return {
      kind,
      folderPath: typeof target.folderPath === "string" ? target.folderPath.trim().slice(0, 240) : undefined
    };
  }
  if (kind === "stageId") {
    return {
      kind,
      stageId: typeof target.stageId === "string" ? target.stageId.trim().slice(0, 120) : undefined
    };
  }
  if (kind === "existingNote") {
    const filePath = typeof target.filePath === "string" ? target.filePath.trim().slice(0, 240) : "";
    if (!filePath) {
      throw new ExternalApiError(400, "Existing-note capture target requires filePath.");
    }
    return {
      kind,
      filePath,
      heading: typeof target.heading === "string" ? target.heading.trim().replace(/^#+\s*/u, "").slice(0, 120) : undefined
    };
  }
  throw new ExternalApiError(400, `Unknown capture target kind: ${kind || "(missing)"}.`);
}

function readSourceRefBody(body: Record<string, unknown>): DeviceSourceRef | undefined {
  const raw = body.sourceRef;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    return compactSourceRef({
      vaultName: readLooseString(record, "vaultName"),
      filePath: readLooseString(record, "filePath"),
      lineStart: readNumber(record.lineStart),
      lineEnd: readNumber(record.lineEnd),
      blockId: readLooseString(record, "blockId"),
      page: readNumber(record.page)
    });
  }
  return compactSourceRef({
    filePath: readString(body, "sourceFile"),
    lineStart: readNumber(body.sourceLine),
    lineEnd: readNumber(body.sourceEndLine),
    blockId: readString(body, "sourceBlockId"),
    page: readNumber(body.sourcePage)
  });
}

function sourceRefFromUrl(url: URL, vaultName?: string): DeviceSourceRef | undefined {
  return compactSourceRef({
    vaultName,
    filePath: url.searchParams.get("sourceFile")?.trim() || undefined,
    lineStart: readNumber(url.searchParams.get("sourceLine")),
    lineEnd: readNumber(url.searchParams.get("sourceEndLine")),
    blockId: url.searchParams.get("sourceBlockId")?.trim() || undefined,
    page: readNumber(url.searchParams.get("sourcePage"))
  });
}

function compactSourceRef(sourceRef: DeviceSourceRef): DeviceSourceRef | undefined {
  return sourceRef.filePath || sourceRef.blockId || sourceRef.page !== undefined
    ? sourceRef
    : undefined;
}

function readNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : undefined;
}

function readDeviceIntent(value: string | null | undefined): DeviceActionIntent | undefined {
  return value === "respond" || value === "capture" || value === "open" || value === "next" || value === "prev"
    || value === "later" || value === "skipped" || value === "useful" || value === "answered" || value === "opened" || value === "opened-no-write"
    ? value
    : undefined;
}

function displayMessageForDeviceIntent(intent: DeviceActionIntent): string {
  if (intent === "capture") return "Open quick capture";
  if (intent === "open") return "Open source note";
  if (intent === "next") return "Refresh next content";
  if (intent === "prev") return "Refresh previous content";
  if (intent === "later") return "Marked for later";
  if (intent === "skipped") return "Skipped current card";
  if (intent === "answered") return "Marked answered";
  return "Open phone input";
}

function randomFragment(): string {
  return globalThis.crypto?.randomUUID?.().replace(/-/gu, "") ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function readPushFeedbackAction(body: Record<string, unknown>): PushFeedbackInput["action"] | undefined {
  const action = readString(body, "action");
  return action === "useful" || action === "skipped" || action === "later" || action === "answered" || action === "opened-no-write" || action === "opened"
    ? action
    : undefined;
}

function readPushCandidateType(body: Record<string, unknown>): PushFeedbackInput["candidateType"] {
  const type = readString(body, "candidateType");
  return type === "home-summary" || type === "workflow-file" || type === "article" ? type : "question";
}

function readPreciseLocation(body: Record<string, unknown>): PushAnchorInput["preciseLocation"] {
  const value = body.preciseLocation;
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
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : undefined
  };
}

function readPositiveInteger(body: Record<string, unknown>, key: string): number | undefined {
  const value = Number(body[key]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function readPatchString(body: Record<string, unknown>, key: string, maxLength: number): { present: boolean; value?: string } {
  if (!Object.prototype.hasOwnProperty.call(body, key)) {
    return { present: false };
  }
  const value = body[key];
  if (value === null) {
    return { present: true, value: undefined };
  }
  if (typeof value !== "string") {
    throw new ExternalApiError(400, `${key} must be a string.`);
  }
  const trimmed = value.trim();
  return {
    present: true,
    value: trimmed ? trimmed.slice(0, maxLength) : undefined
  };
}
