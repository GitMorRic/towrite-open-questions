import { describe, expect, it } from "vitest";
import type { OpenQuestion } from "../core/types";
import { ToWriteExternalApiServer } from "./server";

const question: OpenQuestion = {
  id: "oq_one",
  title: "Old title",
  lane: "think",
  status: "open",
  kind: "research",
  tags: [],
  color: "amber",
  question: "Old body",
  source: {
    file: "note.md",
    headingPath: [],
    lineStart: 0,
    lineEnd: 0,
    rule: "selection"
  }
};

describe("external server", () => {
  it("patches question title and body", async () => {
    let patch: { title?: string; question?: string; reminderAt?: string; reminderNote?: string } | undefined;
    const server = makeServer({
      updateQuestionFields: async (_id, nextPatch) => {
        patch = nextPatch;
        return {
          ...question,
          ...nextPatch
        };
      }
    });

    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("PATCH", "/api/v1/questions/oq_one", {
        title: "New title",
        body: "New body",
        reminderAt: "2026-06-30T10:00:00.000Z",
        reminderNote: "Ping me later"
      }), response);

    expect(response.statusCode).toBe(200);
    expect(patch).toEqual({
      title: "New title",
      question: "New body",
      reminderAt: "2026-06-30T10:00:00.000Z",
      reminderNote: "Ping me later"
    });
    expect(JSON.parse(response.body).data[0]).toMatchObject({
      title: "New title",
      question: "New body"
    });
  });

  it("creates device captures with authorization", async () => {
    let captureBody: unknown;
    const server = makeServer({
      createDeviceCapture: async (request) => {
        captureBody = request;
        return {
          filePath: "00-Raw/Device Inbox.md",
          title: request.title || "Quick idea",
          tags: request.tags,
          targetKind: request.target?.kind ?? "inboxFile",
          createdAt: "2026-06-30T00:00:00.000Z",
          openUri: "obsidian://open?vault=Vault&file=00-Raw%2FDevice%20Inbox.md"
        };
      }
    });

    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/captures", {
        title: "Phone idea",
        text: "Dictated from phone",
        tags: "capture, phone",
        target: { kind: "folderPath", folderPath: "01-Sparks" },
        clientId: "mobile"
      }), response);

    expect(response.statusCode).toBe(201);
    expect(captureBody).toEqual({
      title: "Phone idea",
      text: "Dictated from phone",
      tags: ["capture", "phone"],
      target: { kind: "folderPath", folderPath: "01-Sparks" },
      clientId: "mobile"
    });
    expect(JSON.parse(response.body).data).toMatchObject({
      filePath: "00-Raw/Device Inbox.md",
      targetKind: "folderPath"
    });
  });

  it("does not allow query-token writes for captures", async () => {
    const server = makeServer();
    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/captures?token=secret", {
        text: "Should fail"
      }, { authorization: undefined }), response);

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: "Unauthorized." });
  });

  it("allows Quote0 restricted token to load input context and write notes", async () => {
    let appended: unknown;
    const server = makeServer({
      getRestrictedAccessToken: () => "quote0-token",
      appendQuestionNote: async (id, text, clientId) => {
        appended = { id, text, clientId };
        return question;
      }
    });

    const contextResponse = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/device-input-context?token=quote0-token&questionId=oq_one", {}, {
        authorization: undefined
      }), contextResponse);

    expect(contextResponse.statusCode).toBe(200);
    expect(JSON.parse(contextResponse.body).question).toMatchObject({ id: "oq_one" });

    const writeResponse = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/questions/oq_one/notes", {
        text: "Answered from NFC",
        clientId: "quote0"
      }, { authorization: "Bearer quote0-token" }), writeResponse);

    expect(writeResponse.statusCode).toBe(200);
    expect(appended).toEqual({
      id: "oq_one",
      text: "Answered from NFC",
      clientId: "quote0"
    });
  });

  it("rejects Quote0 restricted token for full deck reads", async () => {
    const server = makeServer({
      getRestrictedAccessToken: () => "quote0-token"
    });
    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/deck?token=quote0-token", {}, {
        authorization: undefined
      }), response);

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: "Unauthorized." });
  });

  it("serves push feed with full API authorization", async () => {
    const server = makeServer({
      getPushFeed: (targetId) => ({
        schemaVersion: 1,
        generatedAt: "2026-07-07T00:00:00.000Z",
        target: {
          id: targetId || "local-web",
          name: "Local web",
          type: "local-web",
          profile: "mobile-eink",
          width: 390,
          height: 844,
          inches: 6.1,
          capabilities: ["pull"]
        },
        privacy: {
          level: "local-coarse",
          preciseLocationIncluded: false
        },
        context: {
          timeBucket: "morning",
          placeLabel: "desk"
        },
        decision: {
          candidateId: "oq_one",
          candidateType: "question",
          score: 42,
          reason: "active note",
          quiet: false
        },
        display: {
          title: "Old title",
          message: "Old body",
          signature: "Think"
        }
      })
    });

    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/push/feed?targetId=phone", {}), response);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      target: { id: "phone" },
      privacy: { preciseLocationIncluded: false },
      decision: { candidateId: "oq_one" }
    });
  });

  it("records push feedback and context anchors", async () => {
    const calls: unknown[] = [];
    const server = makeServer({
      recordPushFeedback: async (input) => {
        calls.push(input);
      },
      recordContextAnchor: async (input) => {
        calls.push(input);
      }
    });

    const feedbackResponse = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/push/feedback", {
        targetId: "phone",
        candidateId: "oq_one",
        candidateType: "question",
        action: "opened-no-write",
        clientId: "mobile"
      }), feedbackResponse);

    const anchorResponse = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/context/anchors", {
        targetId: "phone",
        placeLabel: "desk",
        mode: "writing",
        preciseLocation: { latitude: 31.2, longitude: 121.5 }
      }), anchorResponse);

    expect(feedbackResponse.statusCode).toBe(200);
    expect(anchorResponse.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        targetId: "phone",
        candidateId: "oq_one",
        candidateType: "question",
        action: "opened-no-write",
        note: undefined,
        clientId: "mobile"
      },
      {
        source: "device",
        targetId: "phone",
        deviceId: undefined,
        placeLabel: "desk",
        mode: "writing",
        activeFile: undefined,
        networkLabel: undefined,
        preciseLocation: { latitude: 31.2, longitude: 121.5, accuracy: undefined },
        ttlSeconds: undefined
      }
    ]);
  });

  it("rejects restricted tokens for push feed reads", async () => {
    const server = makeServer({
      getRestrictedAccessToken: () => "quote0-token",
      getPushFeed: () => {
        throw new Error("should not be called");
      }
    });
    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/push/feed?token=quote0-token", {}, {
        authorization: undefined
      }), response);

    expect(response.statusCode).toBe(401);
  });
});

function makeServer(overrides: Partial<ConstructorParameters<typeof ToWriteExternalApiServer>[0]> = {}): ToWriteExternalApiServer {
  return new ToWriteExternalApiServer({
    pluginVersion: "0.1.0",
    getSettings: () => ({
      enabled: true,
      bindHost: "127.0.0.1",
      port: 48321,
      token: "secret",
      allowQueryTokenForRead: true,
      publicBaseUrl: ""
    }),
    getVaultName: () => "Vault",
    getQuestions: () => [question],
    getArticleSummaries: () => [],
    getWorkflowPayload: () => ({
      schemaVersion: 1,
      generatedAt: "2026-06-29T00:00:00.000Z",
      vaultName: "Vault",
      enabled: false,
      counts: { stages: 0, uniqueFiles: 0 },
      stages: []
    }),
    getWorkflowSummary: () => ({
      enabled: false,
      stageCount: 0,
      uniqueFiles: 0,
      stages: []
    }),
    getDeviceCaptureSettings: () => ({
      enabled: true,
      inboxFile: "00-Raw/Device Inbox.md",
      targetFolders: ["01-Sparks"],
      defaultTags: ["capture", "device"]
    }),
    getStatusOptions: () => [{ id: "open", label: "Open" }],
    updateQuestionStatus: async () => question,
    appendQuestionNote: async () => question,
    updateQuestionFields: async (_id, patch) => ({ ...question, ...patch }),
    createDeviceCapture: async (request) => ({
      filePath: "00-Raw/Device Inbox.md",
      title: request.title || "Quick idea",
      tags: request.tags,
      targetKind: request.target?.kind ?? "inboxFile",
      createdAt: "2026-06-30T00:00:00.000Z",
      openUri: "obsidian://open?vault=Vault&file=00-Raw%2FDevice%20Inbox.md"
    }),
    subscribe: () => () => undefined,
    ...overrides
  });
}

class FakeRequest {
  readonly headers: Record<string, string | undefined> = {
    authorization: "Bearer secret",
    host: "127.0.0.1:48321"
  };
  private readonly body: string;

  constructor(
    readonly method: string,
    readonly url: string,
    body: Record<string, unknown>,
    headers: Record<string, string | undefined> = {}
  ) {
    this.body = JSON.stringify(body);
    Object.assign(this.headers, headers);
  }

  on(event: "data" | "end" | "error", listener: (chunk?: Uint8Array | string | Error) => void): void {
    if (event === "data") {
      queueMicrotask(() => listener(this.body));
    }
    if (event === "end") {
      queueMicrotask(() => listener());
    }
  }
}

class FakeResponse {
  statusCode = 0;
  readonly headers: Record<string, string> = {};
  body = "";

  setHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  writeHead(statusCode: number, headers: Record<string, string>): void {
    this.statusCode = statusCode;
    Object.assign(this.headers, headers);
  }

  write(chunk: string): void {
    this.body += chunk;
  }

  end(chunk = ""): void {
    this.body += chunk;
  }

  on(): void {
    // Test response never emits close.
  }
}
