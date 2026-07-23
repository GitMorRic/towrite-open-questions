import { describe, expect, it } from "vitest";
import {
  DailyActivityService,
  DailyPlanService,
  type DailyPlanStorage
} from "../daily";
import { ToWriteExternalApiServer } from "./server";

const TODAY = "2026-07-23";
const NOW = new Date("2026-07-23T08:00:00");

describe("External Daily API", () => {
  it("serves the Today snapshot and deterministic summary", async () => {
    const { server } = dailyServer();

    const today = await invoke(server, "GET", "/api/v1/daily/today");
    const summary = await invoke(server, "GET", "/api/v1/daily/summary");

    expect(today.statusCode).toBe(200);
    expect(today.json().data).toMatchObject({
      date: TODAY,
      plan: { total: 0, todo: 0, inProgress: 0, done: 0 },
      activity: { date: TODAY, positiveWritingUnits: 0 }
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().data).toMatchObject({
      date: TODAY,
      metrics: { planned: 0, completed: 0, remaining: 0 }
    });
  });

  it("creates, patches, completes, and writes back a summary through the versioned contract", async () => {
    const { server, storage } = dailyServer();

    const createdResponse = await invoke(server, "POST", "/api/v1/daily/items", {
      id: "daily_api123",
      date: TODAY,
      text: "补充 [[关于创作]]",
      kind: "edit_note",
      devicePolicy: "scheduled",
      priority: "high",
      scheduledFor: "2026-07-23T09:30",
      dueDate: TODAY,
      tags: ["writing"]
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json().data;
    expect(created).toMatchObject({
      id: "daily_api123",
      kind: "edit_note",
      devicePolicy: "scheduled",
      priority: "high",
      status: "todo"
    });

    const patchedResponse = await invoke(server, "PATCH", `/api/v1/daily/items/${created.id}`, {
      revision: created.revision,
      text: "补充第二章 [[关于创作]]",
      devicePolicy: "rotation",
      priority: "lowest",
      scheduledFor: null,
      status: "in-progress",
      tags: ["writing", "today"]
    });
    expect(patchedResponse.statusCode).toBe(200);
    const patched = patchedResponse.json().data;
    expect(patched).toMatchObject({
      text: "补充第二章 [[关于创作]]",
      devicePolicy: "rotation",
      priority: "lowest",
      status: "in-progress",
      tags: ["writing", "today"]
    });
    expect(patched).not.toHaveProperty("scheduledFor");

    const completedResponse = await invoke(server, "POST", `/api/v1/daily/items/${patched.id}/complete`, {
      revision: patched.revision,
      eventId: "complete_transition_1"
    });
    expect(completedResponse.statusCode).toBe(200);
    expect(completedResponse.json().data).toMatchObject({
      id: "daily_api123",
      status: "done",
      completionDate: TODAY
    });

    const today = await invoke(server, "GET", "/api/v1/daily/today");
    expect(today.json().data).toMatchObject({
      plan: { total: 1, done: 1 },
      activity: { tasksCompleted: 1 }
    });

    const writeBack = await invoke(server, "POST", "/api/v1/daily/summary/write-back", {
      date: TODAY,
      markdown: "## 今日总结\n\n- API 写回成功"
    });
    expect(writeBack.statusCode).toBe(200);
    expect(writeBack.json().data).toEqual({
      path: `Daily/${TODAY}.md`,
      changed: true
    });
    expect(storage.files.get(`Daily/${TODAY}.md`)).toContain("API 写回成功");
    expect(storage.files.get(`Daily/${TODAY}.md`)).toContain("^daily_api123");
  });

  it("reads and patches plan-v2 metadata and starts exactly one task", async () => {
    const { server } = dailyServer();
    const first = (await invoke(server, "POST", "/api/v1/daily/items", {
      id: "daily_focus123",
      date: TODAY,
      text: "Write experiment",
      kind: "edit_note",
      primary: true,
      minimum: true,
      goal: "Decide whether the screen helps",
      nextStep: "List the A/B metrics",
      estimateMinutes: 15,
      target: "[[Echo MVP]]"
    })).json().data;
    const second = (await invoke(server, "POST", "/api/v1/daily/items", {
      id: "daily_other123",
      date: TODAY,
      text: "Contact users"
    })).json().data;

    const plan = await invoke(server, "GET", `/api/v1/daily/plans/${TODAY}`);
    expect(plan.statusCode).toBe(200);
    expect(plan.json().data).toMatchObject({
      schemaVersion: 2,
      metadata: {
        primaryId: "daily_focus123",
        minimumId: "daily_focus123"
      }
    });
    expect(plan.json().data.items.find((item: { id: string }) => item.id === "daily_focus123")).toMatchObject({
      goal: "Decide whether the screen helps",
      nextStep: "List the A/B metrics",
      estimateMinutes: 15,
      target: "[[Echo MVP]]"
    });

    const themed = await invoke(server, "PATCH", `/api/v1/daily/plans/${TODAY}`, {
      revision: plan.json().data.revision,
      theme: "推进 Echo MVP"
    });
    expect(themed.statusCode).toBe(200);
    expect(themed.json().data.metadata.theme).toBe("推进 Echo MVP");

    const startFirst = await invoke(server, "POST", `/api/v1/daily/items/${first.id}/start`, {
      revision: first.revision,
      date: TODAY
    });
    expect(startFirst.statusCode).toBe(200);
    expect(startFirst.json().data.status).toBe("in-progress");
    const afterFirst = await invoke(server, "GET", `/api/v1/daily/plans/${TODAY}`);
    const currentSecond = afterFirst.json().data.items.find((item: { id: string }) => item.id === second.id);
    const startSecond = await invoke(server, "POST", `/api/v1/daily/items/${second.id}/start`, {
      revision: currentSecond.revision,
      date: TODAY
    });
    expect(startSecond.statusCode).toBe(200);
    const finalPlan = await invoke(server, "GET", `/api/v1/daily/plans/${TODAY}`);
    expect(finalPlan.json().data.items.filter((item: { status: string }) => item.status === "in-progress"))
      .toHaveLength(1);
    expect(finalPlan.json().data.items.find((item: { id: string }) => item.id === first.id).status).toBe("todo");
  });

  it("maps stale Markdown task revisions to HTTP 409 without overwriting the note", async () => {
    const { server, storage } = dailyServer();
    const createdResponse = await invoke(server, "POST", "/api/v1/daily/items", {
      id: "daily_conflict123",
      date: TODAY,
      text: "原始任务"
    });
    const created = createdResponse.json().data;
    const path = `Daily/${TODAY}.md`;
    storage.files.set(path, storage.files.get(path)!.replace("原始任务", "用户在 Obsidian 手动修改"));

    const response = await invoke(server, "POST", `/api/v1/daily/items/${created.id}/complete`, {
      revision: created.revision,
      eventId: "stale_transition"
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain("changed");
    expect(storage.files.get(path)).toContain("用户在 Obsidian 手动修改");
    expect(storage.files.get(path)).not.toContain("- [x]");
  });

  it("requires Bearer authorization and a task revision for writes", async () => {
    const { server } = dailyServer();
    const unauthorized = await invoke(server, "GET", "/api/v1/daily/today", {}, {
      authorization: undefined
    });
    expect(unauthorized.statusCode).toBe(401);

    const created = (await invoke(server, "POST", "/api/v1/daily/items", {
      id: "daily_auth123",
      date: TODAY,
      text: "需要修订"
    })).json().data;
    const missingRevision = await invoke(server, "PATCH", `/api/v1/daily/items/${created.id}`, {
      text: "不能盲写"
    });
    expect(missingRevision.statusCode).toBe(400);
    expect(missingRevision.json().error).toContain("revision");
  });

  it("routes an item PATCH to the supplied tomorrow date", async () => {
    const { server, plan } = dailyServer();
    const tomorrow = "2026-07-24";
    const created = (await invoke(server, "POST", "/api/v1/daily/items", {
      id: "daily_tomorrow_patch",
      date: tomorrow,
      text: "Tomorrow original"
    })).json().data;

    const response = await invoke(server, "PATCH", `/api/v1/daily/items/${created.id}`, {
      date: tomorrow,
      revision: created.revision,
      text: "Tomorrow edited"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      date: tomorrow,
      text: "Tomorrow edited"
    });
    await expect(plan.get(created.id, TODAY)).resolves.toBeUndefined();
    await expect(plan.get(created.id, tomorrow)).resolves.toMatchObject({ text: "Tomorrow edited" });
  });

  it("patches primary and minimum plan selections with the plan CAS revision", async () => {
    const { server } = dailyServer();
    const first = (await invoke(server, "POST", "/api/v1/daily/items", {
      id: "daily_meta_first",
      date: TODAY,
      text: "First"
    })).json().data;
    const second = (await invoke(server, "POST", "/api/v1/daily/items", {
      id: "daily_meta_second",
      date: TODAY,
      text: "Second"
    })).json().data;
    const plan = (await invoke(server, "GET", `/api/v1/daily/plans/${TODAY}`)).json().data;

    const response = await invoke(server, "PATCH", `/api/v1/daily/plans/${TODAY}`, {
      revision: plan.revision,
      primaryId: second.id,
      minimumId: first.id
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.metadata).toMatchObject({
      primaryId: second.id,
      minimumId: first.id
    });
  });
});

describe("External Daily device completion", () => {
  it("rejects stale displayed card, selected state, and playlist revisions before mutating a task", async () => {
    const completed: string[] = [];
    const current = {
      cardId: "daily-plan:daily_guard123",
      stateVersion: 7,
      playlistRevision: "einkrev_current"
    };
    const server = makeServer({
      getDeviceCompletionGuard: () => current,
      completeDeviceCard: async (event) => {
        completed.push(event.eventId);
      }
    });
    const cases = [
      {
        eventId: "stale-card",
        cardId: "daily-plan:daily_other",
        stateVersion: current.stateVersion,
        playlistRevision: current.playlistRevision,
        conflict: "card-changed"
      },
      {
        eventId: "stale-state",
        cardId: current.cardId,
        stateVersion: current.stateVersion - 1,
        playlistRevision: current.playlistRevision,
        conflict: "state-changed"
      },
      {
        eventId: "stale-playlist",
        cardId: current.cardId,
        stateVersion: current.stateVersion,
        playlistRevision: "einkrev_previous",
        conflict: "playlist-changed"
      }
    ];

    for (const testCase of cases) {
      const response = await invoke(server, "POST", "/api/v1/device/events", {
        eventId: testCase.eventId,
        targetId: "desk",
        action: "complete",
        cardId: testCase.cardId,
        stateVersion: testCase.stateVersion,
        playlistRevision: testCase.playlistRevision
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toContain(testCase.conflict);
    }
    expect(completed).toEqual([]);
  });

  it("rejects completion when the Markdown task revision changed after the card was rendered", async () => {
    const storage = new MemoryDailyStorage();
    const plan = new DailyPlanService(storage, {
      now: () => NOW,
      createId: () => "daily_revision123"
    });
    const item = await plan.create({
      id: "daily_revision123",
      date: TODAY,
      text: "Rendered task"
    }, NOW);
    const renderedRevision = item.revision;
    const path = `Daily/${TODAY}.md`;
    storage.files.set(path, storage.files.get(path)!.replace("Rendered task", "Changed in Obsidian"));
    const current = {
      cardId: `daily-plan:${item.id}`,
      stateVersion: 8,
      playlistRevision: "einkrev_rendered"
    };
    const server = makeServer({
      getDeviceCompletionGuard: () => current,
      completeDeviceCard: async () => {
        await plan.complete(item.id, renderedRevision, TODAY);
      }
    });

    const response = await invoke(server, "POST", "/api/v1/device/events", {
      eventId: "revision-changed-complete",
      targetId: "desk",
      action: "complete",
      ...current
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain("changed");
    expect(storage.files.get(path)).toContain("Changed in Obsidian");
    expect(storage.files.get(path)).not.toContain("- [x]");
  });

  it("applies one matching completion once and returns the cached result for a repeated event id", async () => {
    let completions = 0;
    const current = {
      cardId: "daily-plan:daily_idempotent123",
      stateVersion: 9,
      playlistRevision: "einkrev_idempotent"
    };
    const server = makeServer({
      getDeviceCompletionGuard: () => current,
      completeDeviceCard: async () => {
        completions += 1;
      }
    });
    const event = {
      eventId: "complete-idempotent-event",
      targetId: "desk",
      action: "complete",
      ...current
    };

    const first = await invoke(server, "POST", "/api/v1/device/events", event);
    const duplicate = await invoke(server, "POST", "/api/v1/device/events", event);

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      ok: true,
      duplicate: false,
      action: "complete",
      ...current
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({
      duplicate: true,
      eventId: event.eventId,
      ...current
    });
    expect(completions).toBe(1);
  });
});

function dailyServer(): {
  server: ToWriteExternalApiServer;
  storage: MemoryDailyStorage;
  plan: DailyPlanService;
  activity: DailyActivityService;
} {
  const storage = new MemoryDailyStorage();
  const plan = new DailyPlanService(storage, {
    now: () => NOW,
    createId: () => "daily_generated123"
  });
  const activity = new DailyActivityService(undefined, {
    now: () => NOW,
    createId: () => "daily_event_generated",
    language: "zh"
  });
  const getDailySnapshot = async () => activity.getSnapshot(TODAY, await plan.list(TODAY));
  const server = makeServer({
    getDailySnapshot,
    getDailyPlan: (date) => plan.read(date),
    updateDailyPlanMetadata: (date, revision, patch) => plan.updateMetadata(patch, revision, date),
    createDailyItem: (input) => plan.create(input, NOW),
    updateDailyItem: (id, revision, patch, date) => plan.update(id, revision, patch, date ?? TODAY),
    startDailyItem: (id, revision, date) => plan.start(id, revision, date ?? TODAY),
    completeDailyItem: async (id, revision, eventId) => {
      const item = await plan.complete(id, revision, TODAY);
      activity.recordTaskCompleted(item.id, NOW, eventId);
      return item;
    },
    writeDailySummary: (summary) => plan.writeSummary(summary, summary.date)
  });
  return { server, storage, plan, activity };
}

function makeServer(
  overrides: Partial<ConstructorParameters<typeof ToWriteExternalApiServer>[0]> = {}
): ToWriteExternalApiServer {
  return new ToWriteExternalApiServer({
    pluginVersion: "0.3.0-test",
    getSettings: () => ({
      enabled: true,
      bindHost: "127.0.0.1",
      port: 48321,
      token: "secret",
      allowQueryTokenForRead: false,
      publicBaseUrl: ""
    }),
    getVaultName: () => "Vault",
    getQuestions: () => [],
    getArticleSummaries: () => [],
    getWorkflowPayload: () => ({
      schemaVersion: 1,
      generatedAt: NOW.toISOString(),
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
      targetFolders: [],
      defaultTags: [],
      appendHeading: "Captures",
      localRecommendations: true,
      includeFolders: [],
      excludeFolders: [],
      excludeTags: [],
      excludeFrontmatter: []
    }),
    getStatusOptions: () => [{ id: "open", label: "Open" }],
    updateQuestionStatus: async () => undefined,
    appendQuestionNote: async () => undefined,
    updateQuestionFields: async () => undefined,
    createDeviceCapture: async (request) => ({
      filePath: "Inbox.md",
      title: request.title ?? "Capture",
      tags: request.tags,
      targetKind: "inboxFile",
      createdAt: NOW.toISOString(),
      openUri: "obsidian://open?vault=Vault&file=Inbox.md"
    }),
    subscribe: () => () => undefined,
    ...overrides
  });
}

async function invoke(
  server: ToWriteExternalApiServer,
  method: string,
  url: string,
  body: Record<string, unknown> = {},
  headers: Record<string, string | undefined> = {}
): Promise<FakeResponse> {
  const response = new FakeResponse();
  await (server as unknown as {
    handleRequest(request: FakeRequest, response: FakeResponse): Promise<void>;
  }).handleRequest(new FakeRequest(method, url, body, headers), response);
  return response;
}

class MemoryDailyStorage implements DailyPlanStorage {
  readonly files = new Map<string, string>();

  async readText(path: string): Promise<string | undefined> {
    return this.files.get(path);
  }

  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
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
    headers: Record<string, string | undefined>
  ) {
    this.body = JSON.stringify(body);
    Object.assign(this.headers, headers);
  }

  on(event: "data" | "end" | "error", listener: (chunk?: Uint8Array | string | Error) => void): void {
    if (event === "data") queueMicrotask(() => listener(this.body));
    if (event === "end") queueMicrotask(() => listener());
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
    // Fake response never closes early.
  }

  json(): any {
    return JSON.parse(this.body);
  }
}
