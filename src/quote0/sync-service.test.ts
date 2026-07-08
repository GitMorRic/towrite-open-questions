import { describe, expect, it } from "vitest";
import { DEFAULT_QUOTE0_SETTINGS, DEFAULT_SETTINGS, type ToWriteSettings } from "../core/settings";
import type { ArticleSummary, OpenQuestion } from "../core/types";
import type { PushQuote0Delivery } from "../push/engine";
import type { PushDisplayCard } from "../push/types";
import type { WorkflowIndexPayload } from "../workflow";
import type { Quote0CanvasPayload, Quote0ClientLike, Quote0Device, Quote0DeviceSettingsPatch, Quote0DeviceStatus, Quote0ImagePayload, Quote0TextPayload } from "./client";
import { Quote0SyncService } from "./sync-service";

describe("Quote0SyncService", () => {
  it("pushes cards in order and advances the cursor only after success", async () => {
    const settings = makeSettings();
    const client = new FakeQuote0Client();
    const service = makeService(settings, client);

    const first = await service.syncNext();
    const second = await service.syncNext();

    expect(first).toMatchObject({ questionId: "oq_newer", total: 2, nextCursor: 1 });
    expect(second).toMatchObject({ questionId: "oq_older", total: 2, nextCursor: 0 });
    expect(settings.quote0.cursor).toBe(0);
    expect(client.sent.map((item) => item.payload.title)).toEqual([
      "Newer question",
      "Older question"
    ]);
  });

  it("keeps the cursor on failed sends", async () => {
    const settings = makeSettings();
    const client = new FakeQuote0Client();
    client.failNext = true;
    const service = makeService(settings, client);

    await expect(service.syncNext()).rejects.toThrow("network down");

    expect(settings.quote0.cursor).toBe(0);
    expect(settings.quote0.lastError).toBe("network down");
  });

  it("previews the next payload without sending or advancing cursor", () => {
    const settings = makeSettings();
    const client = new FakeQuote0Client();
    const service = makeService(settings, client);

    const preview = service.previewNext();

    expect(preview).toMatchObject({
      questionId: "oq_newer",
      total: 2,
      nextCursor: 1,
      candidateType: "question"
    });
    expect(preview.payload.title).toBe("Newer question");
    expect(client.sent).toHaveLength(0);
    expect(settings.quote0.cursor).toBe(0);
  });

  it("previews the dashboard payload separately before sending", () => {
    const settings = makeSettings();
    settings.quote0.dashboardApi = "canvas";
    const client = new FakeQuote0Client();
    const service = makeService(settings, client);

    const preview = service.previewDashboardContent();

    expect(preview).toMatchObject({
      candidateType: "home-summary"
    });
    expect(preview.canvasPayload?.data).toMatchObject({
      title: "ToWrite",
      layoutProfile: "wide-low",
      screenWidth: 296,
      screenHeight: 128,
      think: "1",
      write: "1"
    });
    expect(client.sent).toHaveLength(0);
    expect(client.canvases).toHaveLength(0);
    expect(settings.quote0.cursor).toBe(0);
  });

  it("sends a non-sensitive test card without changing cursor", async () => {
    const settings = makeSettings();
    settings.quote0.cursor = 1;
    const client = new FakeQuote0Client();
    const service = makeService(settings, client);

    await service.sendTestCard();

    expect(settings.quote0.cursor).toBe(1);
    expect(client.sent[0].payload).toMatchObject({
      title: "ToWrite Quote0 test",
      taskAlias: "ToWrite Open Questions"
    });
    expect(client.sent[0].payload.message).not.toContain("Newer question");
  });

  it("sends the dashboard home page through Image API", async () => {
    const settings = makeSettings();
    settings.quote0.dashboardApi = "image";
    settings.quote0.imageTaskKey = "image_task_1";
    const client = new FakeQuote0Client();
    const service = makeService(settings, client, () => "data:image/png;base64,dashboard");

    const message = await service.sendDashboardContent();

    expect(message).toBe("image ok");
    expect(client.sent).toHaveLength(0);
    expect(client.images[0]).toMatchObject({
      deviceId: "ABCD1234",
      payload: {
        image: "data:image/png;base64,dashboard",
        ditherType: "NONE",
        border: 0,
        taskKey: "image_task_1"
      }
    });
    expect(client.images[0].payload.taskAlias).toBeUndefined();
    expect(settings.quote0.lastSyncedQuestionId).toContain("home:");
  });

  it("sends the dashboard home page through Canvas API", async () => {
    const settings = makeSettings();
    settings.quote0.dashboardApi = "canvas";
    settings.quote0.canvasTaskAlias = "ToWrite Canvas";
    const client = new FakeQuote0Client();
    const service = makeService(settings, client);

    const message = await service.sendDashboardContent();

    expect(message).toBe("canvas ok");
    expect(client.sent).toHaveLength(0);
    expect(client.images).toHaveLength(0);
    expect(client.canvases[0]).toMatchObject({
      deviceId: "ABCD1234",
      payload: {
        taskAlias: "ToWrite Canvas",
        border: 0
      }
    });
    expect(client.canvases[0].payload.data).toMatchObject({
      title: "ToWrite",
      layoutProfile: "wide-low",
      screenWidth: 296,
      screenHeight: 128,
      think: "1",
      write: "1"
    });
    expect(client.canvases[0].payload.link).toBe("http://192.168.1.20:48321/device/input?token=q0_test");
    expect(client.canvases[0].payload.layoutFull?.tw).toBe("p-[4px]");
    expect(client.canvases[0].payload.windowData.default[0].type).toBe("div");
    expect(JSON.stringify(client.canvases[0].payload.windowData)).not.toContain("inputData");
    expect(JSON.stringify(client.canvases[0].payload.windowData)).toContain("\"height\":\"16px\"");
  });

  it("uses Canvas API when the push engine rotates to the dashboard", async () => {
    const settings = makeSettings();
    settings.push.enabled = true;
    settings.quote0.dashboardApi = "canvas";
    const client = new FakeQuote0Client();
    let marked = false;
    const service = makeService(settings, client, undefined, {
      candidateId: "home:2026-07-07",
      candidateType: "home-summary",
      display: homeDisplay,
      payload: {
        refreshNow: true,
        title: "ToWrite Overview",
        message: "OPEN 2",
        signature: "Workflow off"
      },
      message: "Push candidate home:2026-07-07",
      markSent: async () => {
        marked = true;
      }
    });

    const result = await service.syncNext();

    expect(result.contentApi).toBe("canvas");
    expect(marked).toBe(true);
    expect(client.sent).toHaveLength(0);
    expect(client.canvases).toHaveLength(1);
    expect(client.switches).toHaveLength(0);
  });

  it("keeps a complete text dashboard fallback", async () => {
    const settings = makeSettings();
    const client = new FakeQuote0Client();
    const service = makeService(settings, client, undefined, {
      candidateId: "home:2026-07-07",
      candidateType: "home-summary",
      display: homeDisplay,
      payload: {
        refreshNow: true,
        title: "ToWrite Overview",
        message: "OPEN 2 · DUE 0\nTHINK 1 · WRITE 1\nARTICLES 0 · WORKFLOW 0\nSTALE 0 · STAGES 0",
        signature: "Workflow off"
      },
      message: "Push candidate home:2026-07-07",
      markSent: async () => undefined
    });

    const result = await service.syncNext();

    expect(result.contentApi).toBe("text");
    expect(client.sent[0].payload.message).toContain("OPEN 2");
    expect(client.sent[0].payload.message).toContain("WORKFLOW 0");
    expect(client.sent[0].payload.message).toContain("STAGES 0");
  });

  it("omits taskAlias during updates when taskKey is configured", async () => {
    const settings = makeSettings();
    settings.quote0.taskKey = "text_task_1";
    const client = new FakeQuote0Client();
    const service = makeService(settings, client);

    await service.sendTestCard();

    expect(client.sent[0].payload).toMatchObject({
      title: "ToWrite Quote0 test",
      taskKey: "text_task_1"
    });
    expect(client.sent[0].payload.taskAlias).toBeUndefined();
  });

  it("can force the device to switch to the next content", async () => {
    const settings = makeSettings();
    const client = new FakeQuote0Client();
    const service = makeService(settings, client);

    const message = await service.switchToNextContent();

    expect(message).toBe("switched");
    expect(client.switches).toEqual(["ABCD1234"]);
    expect(settings.quote0.lastError).toBe("");
  });
});

function makeService(
  settings: ToWriteSettings,
  client: Quote0ClientLike,
  renderQuote0DashboardImage?: () => string,
  pushDelivery?: PushQuote0Delivery
): Quote0SyncService {
  return new Quote0SyncService({
    getSettings: () => settings,
    getVaultName: () => "Vault",
    getQuestions: () => questions,
    getArticleSummaries: () => articles,
    getWorkflowPayload: () => workflow,
    getPushQuote0Delivery: pushDelivery ? () => pushDelivery : undefined,
    renderQuote0DashboardImage,
    saveSettings: async () => undefined
  }, client);
}

function makeSettings(): ToWriteSettings {
  return {
    ...DEFAULT_SETTINGS,
    externalApi: {
      ...DEFAULT_SETTINGS.externalApi,
      publicBaseUrl: "http://192.168.1.20:48321"
    },
    quote0: {
      ...DEFAULT_QUOTE0_SETTINGS,
      enabled: true,
      apiKey: "dot_app_test",
      deviceId: "ABCD1234",
      nfcToken: "q0_test",
      lane: "",
      taskAlias: "ToWrite Open Questions"
    }
  };
}

const questions: OpenQuestion[] = [
  {
    id: "oq_newer",
    title: "Newer question",
    lane: "think",
    status: "open",
    kind: "research",
    tags: [],
    color: "amber",
    question: "Newest open item.",
    source: {
      file: "newer.md",
      headingPath: [],
      lineStart: 0,
      lineEnd: 0,
      rule: "selection"
    },
    updatedAt: "2026-07-02T00:00:00.000Z"
  },
  {
    id: "oq_older",
    title: "Older question",
    lane: "write",
    status: "open",
    kind: "todo",
    tags: [],
    color: "sky",
    question: "Older open item.",
    source: {
      file: "older.md",
      headingPath: [],
      lineStart: 0,
      lineEnd: 0,
      rule: "selection"
    },
    updatedAt: "2026-07-01T00:00:00.000Z"
  }
];

const articles: ArticleSummary[] = [];

const workflow: WorkflowIndexPayload = {
  schemaVersion: 1,
  generatedAt: "2026-07-02T00:00:00.000Z",
  vaultName: "Vault",
  enabled: false,
  counts: { stages: 0, uniqueFiles: 0 },
  stages: []
};

const homeDisplay: PushDisplayCard = {
  variant: "home-summary",
  icon: "▦",
  kicker: "Dashboard",
  title: "ToWrite Overview",
  titleText: "ToWrite Overview",
  primary: "2 open · 0 articles · 0 reminders due",
  secondaryLines: [],
  message: "2 open · 0 articles · 0 reminders due",
  metrics: [
    { label: "Open", value: 2 },
    { label: "? ToThink", value: 1 },
    { label: "✎ ToWrite", value: 1 },
    { label: "Articles", value: 0 },
    { label: "Due", value: 0 },
    { label: "Stale", value: 0 },
    { label: "Workflow", value: 0 },
    { label: "Stages", value: 0 }
  ],
  badges: ["2 open", "0 candidate", "0 workflow"],
  footer: "Workflow off",
  signature: "Dashboard · Workflow off",
  link: "http://192.168.1.20:48321/device/input?token=q0_test"
};

class FakeQuote0Client implements Quote0ClientLike {
  sent: Array<{ deviceId: string; payload: Quote0TextPayload }> = [];
  images: Array<{ deviceId: string; payload: Quote0ImagePayload }> = [];
  canvases: Array<{ deviceId: string; payload: Quote0CanvasPayload }> = [];
  switches: string[] = [];
  failNext = false;

  async listDevices(): Promise<Quote0Device[]> {
    return [];
  }

  async getDeviceStatus(): Promise<Quote0DeviceStatus> {
    return { deviceId: "ABCD1234" };
  }

  async sendTextContent(deviceId: string, payload: Quote0TextPayload): Promise<{ message: string }> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("network down");
    }
    this.sent.push({ deviceId, payload });
    return { message: "ok" };
  }

  async sendImageContent(deviceId: string, payload: Quote0ImagePayload): Promise<{ message: string }> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("network down");
    }
    this.images.push({ deviceId, payload });
    return { message: "image ok" };
  }

  async sendCanvasContent(deviceId: string, payload: Quote0CanvasPayload): Promise<{ message: string }> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("network down");
    }
    this.canvases.push({ deviceId, payload });
    return { message: "canvas ok" };
  }

  async switchToNextContent(deviceId: string): Promise<{ message: string }> {
    this.switches.push(deviceId);
    return { message: "switched" };
  }

  async updateDeviceSettings(_deviceId: string, _patch: Quote0DeviceSettingsPatch): Promise<unknown> {
    return {};
  }
}
