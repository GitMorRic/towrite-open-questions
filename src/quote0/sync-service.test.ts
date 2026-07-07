import { describe, expect, it } from "vitest";
import { DEFAULT_QUOTE0_SETTINGS, DEFAULT_SETTINGS, type ToWriteSettings } from "../core/settings";
import type { ArticleSummary, OpenQuestion } from "../core/types";
import type { WorkflowIndexPayload } from "../workflow";
import type { Quote0ClientLike, Quote0Device, Quote0DeviceSettingsPatch, Quote0DeviceStatus, Quote0TextPayload } from "./client";
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

function makeService(settings: ToWriteSettings, client: Quote0ClientLike): Quote0SyncService {
  return new Quote0SyncService({
    getSettings: () => settings,
    getVaultName: () => "Vault",
    getQuestions: () => questions,
    getArticleSummaries: () => articles,
    getWorkflowPayload: () => workflow,
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

class FakeQuote0Client implements Quote0ClientLike {
  sent: Array<{ deviceId: string; payload: Quote0TextPayload }> = [];
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

  async switchToNextContent(deviceId: string): Promise<{ message: string }> {
    this.switches.push(deviceId);
    return { message: "switched" };
  }

  async updateDeviceSettings(_deviceId: string, _patch: Quote0DeviceSettingsPatch): Promise<unknown> {
    return {};
  }
}
