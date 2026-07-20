import type { CaptureBridgeSettings } from "./types";
import { CAPTURE_BRIDGE_PROTOCOL_VERSION } from "./types";
import { CaptureBridgeCoordinator, CaptureBridgeRequestError } from "./coordinator";
import { CaptureConflictError, CaptureUndoTokenError } from "../capture";

declare function require(moduleId: "http"): NodeHttpModule;

interface NodeHttpModule {
  createServer(listener: (request: HttpRequest, response: HttpResponse) => void): HttpServer;
}

interface HttpServer {
  listen(port: number, host: string, callback: () => void): HttpServer;
  close(callback?: () => void): void;
  on(event: "error", listener: (error: Error) => void): HttpServer;
}

interface HttpRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  on(event: "data", listener: (chunk: Uint8Array | string) => void): void;
  on(event: "end", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
}

interface HttpResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  writeHead(statusCode: number, headers: Record<string, string>): void;
  end(chunk?: string): void;
}

export interface CaptureBridgeServerOptions {
  pluginVersion: string;
  getSettings(): CaptureBridgeSettings;
  coordinator: CaptureBridgeCoordinator;
}

export class CaptureBridgeServer {
  private server?: HttpServer;

  constructor(private readonly options: CaptureBridgeServerOptions) {}

  isRunning(): boolean {
    return Boolean(this.server);
  }

  async start(): Promise<void> {
    const settings = this.options.getSettings();
    if (!settings.enabled || settings.flow !== "local_capture" || this.server) return;
    if (settings.bindHost !== "127.0.0.1") {
      throw new CaptureBridgeRequestError(400, "Capture bridge must bind to 127.0.0.1.");
    }
    if (settings.callbackToken.length < 40) {
      throw new CaptureBridgeRequestError(400, "Capture bridge callback token is missing or too short.");
    }
    const server = require("http").createServer((request, response) => {
      void this.handleRequest(request, response);
    });
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      server.on("error", (error) => {
        if (!settled) {
          settled = true;
          this.server = undefined;
          reject(error);
        }
      });
      server.listen(settings.port, settings.bindHost, () => {
        settled = true;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.options.coordinator.clear();
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private async handleRequest(request: HttpRequest, response: HttpResponse): Promise<void> {
    response.setHeader("cache-control", "no-store");
    response.setHeader("content-type", "application/json; charset=utf-8");
    try {
      if (!isLoopback(request.socket?.remoteAddress)) {
        throw new CaptureBridgeRequestError(403, "Capture bridge accepts loopback callers only.");
      }
      if (!this.isAuthorized(request)) {
        throw new CaptureBridgeRequestError(401, "Unauthorized Capture bridge callback.");
      }
      const method = (request.method ?? "GET").toUpperCase();
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (method === "GET" && url.pathname === "/api/v1/integrations/capture/v1/capabilities") {
        this.writeJson(response, 200, {
          protocolVersion: CAPTURE_BRIDGE_PROTOCOL_VERSION,
          pluginVersion: this.options.pluginVersion,
          handoffs: true,
          conflictDetection: true,
          undo: true,
          textCapture: true
        });
        return;
      }

      let match = /^\/api\/v1\/integrations\/capture\/v1\/taps\/(tap_[A-Za-z0-9_-]{22})\/handoffs$/u.exec(url.pathname);
      if (method === "POST" && match?.[1]) {
        this.writeJson(response, 201, await this.options.coordinator.createHandoff(match[1]));
        return;
      }

      match = /^\/api\/v1\/integrations\/capture\/v1\/handoffs\/(hnd_[A-Za-z0-9_-]{22})$/u.exec(url.pathname);
      if (method === "GET" && match?.[1]) {
        this.writeJson(response, 200, this.options.coordinator.getHandoff(match[1]));
        return;
      }
      if (method === "POST" && match?.[1] && url.pathname.endsWith("/commit")) {
        // Kept for defensive clarity; the explicit commit route below owns matching.
        throw new CaptureBridgeRequestError(404, "Capture bridge route was not found.");
      }

      match = /^\/api\/v1\/integrations\/capture\/v1\/handoffs\/(hnd_[A-Za-z0-9_-]{22})\/commit$/u.exec(url.pathname);
      if (method === "POST" && match?.[1]) {
        this.writeJson(response, 200, await this.options.coordinator.commit(match[1], await readJson(request)));
        return;
      }

      const undoMatch = /^\/api\/v1\/integrations\/capture\/v1\/captures\/([A-Za-z0-9._:-]{1,128})\/undo$/u.exec(url.pathname);
      if (method === "POST" && undoMatch?.[1]) {
        const body = await readJson<{ undoToken?: unknown }>(request);
        if (typeof body.undoToken !== "string" || !body.undoToken) {
          throw new CaptureBridgeRequestError(400, "Undo token is required.");
        }
        this.writeJson(response, 200, await this.options.coordinator.undo(undoMatch[1], body.undoToken));
        return;
      }
      throw new CaptureBridgeRequestError(404, "Capture bridge route was not found.");
    } catch (error) {
      const status = error instanceof CaptureBridgeRequestError
        ? error.statusCode
        : error instanceof CaptureConflictError
          ? 409
          : error instanceof CaptureUndoTokenError
            ? 400
            : 500;
      this.writeJson(response, status, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private isAuthorized(request: HttpRequest): boolean {
    const header = request.headers.authorization;
    const authorization = Array.isArray(header) ? header[0] : header;
    return authorization === `Bearer ${this.options.getSettings().callbackToken}`;
  }

  private writeJson(response: HttpResponse, statusCode: number, value: unknown): void {
    response.statusCode = statusCode;
    response.end(JSON.stringify(value));
  }
}

function isLoopback(value: string | undefined): boolean {
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
}

async function readJson<T = any>(request: HttpRequest): Promise<T> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  await new Promise<void>((resolve, reject) => {
    request.on("data", (chunk) => {
      const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
      total += bytes.byteLength;
      if (total > 1_000_000) {
        reject(new CaptureBridgeRequestError(413, "Capture bridge request is too large."));
        return;
      }
      chunks.push(bytes);
    });
    request.on("end", resolve);
    request.on("error", reject);
  });
  try {
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(merged) || "{}") as T;
  } catch {
    throw new CaptureBridgeRequestError(400, "Capture bridge request body must be valid JSON.");
  }
}
