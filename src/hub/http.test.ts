import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { needsDesktopTransport, requestHub } from "./http";

const servers: Server[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("Device Hub HTTP transport", () => {
  it("uses a header-only desktop request and never follows redirects", async () => {
    let redirectedHits = 0;
    let seenAuthorization = "";
    let seenBody = "";
    const { server, baseUrl } = await listen((request, response) => {
      if (request.url === "/redirect") {
        response.writeHead(302, { location: "/must-not-open" });
        response.end();
        return;
      }
      if (request.url === "/must-not-open") {
        redirectedHits += 1;
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{}");
        return;
      }
      seenAuthorization = String(request.headers.authorization ?? "");
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        seenBody += chunk;
      });
      request.on("end", () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ challenge_id: "chal_test" }));
      });
    });
    servers.push(server);

    const redirect = await requestHub(`${baseUrl}/redirect`, {
      method: "POST",
      headers: { authorization: "Bearer header-only-secret" },
      body: "{}",
      redirect: "error"
    });
    expect(redirect.status).toBe(302);
    expect(redirectedHits).toBe(0);

    const response = await requestHub(`${baseUrl}/auth`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: "Bearer header-only-secret"
      },
      body: JSON.stringify({ email: "writer@github" }),
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer"
    });
    await expect(response.json()).resolves.toEqual({ challenge_id: "chal_test" });
    expect(seenAuthorization).toBe("Bearer header-only-secret");
    expect(seenBody).toBe(JSON.stringify({ email: "writer@github" }));
    expect(`${baseUrl}/auth`).not.toContain("header-only-secret");
  });

  it("destroys the underlying request when the caller aborts", async () => {
    let markStarted!: () => void;
    let markClosed!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const closed = new Promise<void>((resolve) => {
      markClosed = resolve;
    });
    const { server, baseUrl } = await listen((request, _response) => {
      markStarted();
      request.once("close", markClosed);
    });
    servers.push(server);

    const controller = new AbortController();
    const pending = requestHub(`${baseUrl}/slow`, {
      method: "GET",
      signal: controller.signal
    });
    await started;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await closed;
  });

  it("keeps injected/public fetch transports and classifies private origins", async () => {
    const fetcher = vi.fn(async () => new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    await requestHub("https://hub.example.com/v1/hub/capabilities", { method: "GET" }, fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(needsDesktopTransport("https://hub.example.com/v1")).toBe(false);
    expect(needsDesktopTransport("https://node.tailnet.ts.net:10000/v1")).toBe(true);
    expect(needsDesktopTransport("http://127.0.0.1:8080/health")).toBe(true);
  });
});

type RequestHandler = (request: IncomingMessage, response: ServerResponse) => void;

async function listen(handler: RequestHandler): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}
