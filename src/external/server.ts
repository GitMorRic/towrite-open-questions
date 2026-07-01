import type { ArticleSummary, OpenQuestion, OpenQuestionStatus, QuestionStatusOption } from "../core/types";
import { normalizeExternalApiBindHost, type ToWriteDeviceCaptureSettings, type ToWriteExternalApiSettings } from "../core/settings";
import type { WorkflowIndexPayload, WorkflowSummaryPayload } from "../workflow";
import { workflowQueryFromUrl, type WorkflowQuery } from "../workflow";
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
  getStatusOptions(): QuestionStatusOption[];
  updateQuestionStatus(id: string, status: OpenQuestionStatus, note?: string, clientId?: string): Promise<OpenQuestion | undefined>;
  appendQuestionNote(id: string, text: string, clientId?: string): Promise<OpenQuestion | undefined>;
  updateQuestionFields(id: string, patch: QuestionFieldPatch): Promise<OpenQuestion | undefined>;
  createDeviceCapture(request: DeviceCaptureRequest): Promise<DeviceCaptureResult>;
  subscribe(listener: () => void): () => void;
}

export interface DeviceCaptureTarget {
  kind: "inboxFile" | "folderPath" | "stageId";
  inboxFile?: string;
  folderPath?: string;
  stageId?: string;
}

export interface DeviceCaptureRequest {
  title?: string;
  text: string;
  tags: string[];
  target?: DeviceCaptureTarget;
  clientId?: string;
}

export interface DeviceCaptureResult {
  filePath: string;
  title: string;
  tags: string[];
  targetKind: DeviceCaptureTarget["kind"];
  createdAt: string;
  openUri: string;
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

      if (!this.isAuthorized(request, url, method !== "GET")) {
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
        : new ExternalApiError(500, error instanceof Error ? error.message : String(error));
      this.writeJson(response, apiError.statusCode, {
        error: apiError.message
      });
    }
  }

  private handleGet(request: HttpRequest, response: HttpResponse, url: URL): void {
    const vaultName = this.options.getVaultName();

    if (url.pathname === "/api/v1/questions") {
      const questions = this.options.getQuestions(queryFromUrl(url));
      this.writeJson(response, 200, buildQuestionsPayload(vaultName, questions));
      return;
    }

    if (url.pathname === "/api/v1/articles") {
      this.writeJson(response, 200, buildArticlesPayload(vaultName, this.options.getArticleSummaries()));
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
      const updated = await this.options.appendQuestionNote(id, text, clientId);
      if (!updated) {
        throw new ExternalApiError(404, "Question not found.");
      }
      this.writeJson(response, 200, buildQuestionsPayload(this.options.getVaultName(), [updated]));
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
        target: readCaptureTarget(body),
        clientId: readOptionalText(body, "clientId")
      };
      const result = await this.options.createDeviceCapture(capture);
      this.writeJson(response, 201, {
        data: result
      });
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

  private broadcastUpdate(): void {
    const snapshot = this.currentSnapshot();
    for (const client of this.sseClients) {
      this.writeSse(client, "update", snapshot);
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

  private buildDeviceInputContext(url: URL) {
    const questionId = url.searchParams.get("questionId")?.trim();
    const question = questionId
      ? this.options.getQuestions().find((item) => item.id === questionId)
      : undefined;
    const capture = this.options.getDeviceCaptureSettings();
    const workflow = this.options.getWorkflowSummary();
    return {
      schemaVersion: 1,
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
        source: question.source.page
          ? `${question.source.file} P${question.source.page}`
          : `${question.source.file}:${question.source.lineStart + 1}`
      } : undefined
    };
  }

  private writeSse(response: HttpResponse, event: string, payload: unknown): void {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  private isAuthorized(request: HttpRequest, url: URL, isWrite: boolean): boolean {
    const settings = this.options.getSettings();
    const token = settings.token.trim();
    const authorization = headerValue(request, "authorization");
    if (authorization === `Bearer ${token}`) {
      return true;
    }
    return !isWrite && settings.allowQueryTokenForRead && url.searchParams.get("token") === token;
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

function splitListText(value: string): string[] {
  return value
    .split(/[，,、;；\s]+/u)
    .map((item) => item.replace(/^#+/u, "").trim())
    .filter(Boolean);
}

function readCaptureTarget(body: Record<string, unknown>): DeviceCaptureTarget | undefined {
  const value = body.target;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
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
  return undefined;
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
