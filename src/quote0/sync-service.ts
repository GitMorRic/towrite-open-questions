import type { ArticleSummary, OpenQuestion } from "../core/types";
import type { ToWriteSettings } from "../core/settings";
import type { WorkflowIndexPayload } from "../workflow";
import { buildDeviceFeedPayload } from "../external/device-feed";
import type { PushQuote0Delivery } from "../push/engine";
import { Quote0Client, type Quote0ClientLike, type Quote0Device, type Quote0DeviceStatus, type Quote0TextPayload } from "./client";
import { buildQuote0InputUrl, formatQuote0DeviceFeed, type Quote0SourceContext } from "./formatter";

export interface Quote0SyncServiceOptions {
  getSettings(): ToWriteSettings;
  getVaultName(): string;
  getQuestions(): OpenQuestion[];
  getArticleSummaries(): ArticleSummary[];
  getWorkflowPayload(): WorkflowIndexPayload;
  getPushQuote0Delivery?(): PushQuote0Delivery;
  saveSettings(): Promise<void>;
}

export interface Quote0SyncResult {
  questionId: string;
  total: number;
  nextCursor: number;
  message: string;
  nfcLink?: string;
}

export class Quote0SyncService {
  private readonly client: Quote0ClientLike;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private syncing = false;

  constructor(
    private readonly options: Quote0SyncServiceOptions,
    client?: Quote0ClientLike
  ) {
    this.client = client ?? new Quote0Client(() => this.options.getSettings().quote0);
  }

  start(): void {
    this.stop();
    if (!this.canSync()) {
      return;
    }
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  restart(): void {
    this.stop();
    this.start();
  }

  async listDevices(): Promise<Quote0Device[]> {
    return this.client.listDevices();
  }

  async getDeviceStatus(deviceId?: string): Promise<Quote0DeviceStatus> {
    const id = deviceId?.trim() || this.options.getSettings().quote0.deviceId.trim();
    if (!id) {
      throw new Error("Quote0 device ID is missing.");
    }
    return this.client.getDeviceStatus(id);
  }

  async updateDeviceRefreshInterval(): Promise<void> {
    const settings = this.options.getSettings().quote0;
    const deviceId = settings.deviceId.trim();
    if (!deviceId) {
      throw new Error("Quote0 device ID is missing.");
    }
    const powerMs = Math.max(60000, Math.min(86400000, settings.refreshSeconds * 1000));
    const batteryMs = Math.max(900000, Math.min(43200000, settings.refreshSeconds * 1000));
    await this.client.updateDeviceSettings(deviceId, {
      interval: {
        powerMs: roundToMinute(powerMs),
        batteryMs: roundToMinute(batteryMs)
      }
    });
  }

  async switchToNextContent(): Promise<string> {
    const settings = this.options.getSettings().quote0;
    const deviceId = settings.deviceId.trim();
    if (!deviceId) {
      throw new Error("Quote0 device ID is missing.");
    }
    if (!settings.apiKey.trim()) {
      throw new Error("Quote0 API key is missing.");
    }

    try {
      const response = await this.client.switchToNextContent(deviceId);
      settings.lastError = "";
      await this.options.saveSettings();
      return response.message || "Quote0 content switched.";
    } catch (error) {
      settings.lastError = sanitizeError(error);
      await this.options.saveSettings();
      throw error;
    }
  }

  async syncNext(): Promise<Quote0SyncResult> {
    if (this.syncing) {
      throw new Error("Quote0 sync is already running.");
    }
    if (!this.canSync()) {
      throw new Error("Quote0 sync needs enabled settings, an API key, and a device ID.");
    }

    this.syncing = true;
    const settings = this.options.getSettings();
    const quote0 = settings.quote0;
    try {
      if (settings.push.enabled && this.options.getPushQuote0Delivery) {
        const delivery = this.options.getPushQuote0Delivery();
        if (!delivery.candidateId) {
          throw new Error(delivery.message || "No push candidate is ready for Quote0.");
        }
        const response = await this.client.sendTextContent(quote0.deviceId, delivery.payload);
        await delivery.markSent();

        quote0.lastSyncedQuestionId = delivery.candidateId;
        quote0.lastSyncedAt = new Date().toISOString();
        quote0.lastError = "";
        await this.options.saveSettings();

        return {
          questionId: delivery.candidateId,
          total: 1,
          nextCursor: quote0.cursor,
          message: response.message || delivery.message || "Quote0 content updated.",
          nfcLink: delivery.nfcLink
        };
      }

      const articles = this.options.getArticleSummaries();
      const workflowPayload = this.options.getWorkflowPayload();
      const feed = buildDeviceFeedPayload(
        this.options.getVaultName(),
        this.options.getQuestions(),
        articles,
        workflowPayload,
        {
          profile: "eink-bw",
          width: 264,
          height: 176,
          inches: 2.7,
          page: "cards",
          limit: 1,
          cursor: String(quote0.cursor),
          lane: quote0.lane || undefined,
          token: quote0.nfcToken,
          companionBaseUrl: settings.externalApi.publicBaseUrl || ""
        }
      );
      const currentCursor = parseCursor(feed.navigation.cursor);
      const formatted = formatQuote0DeviceFeed(feed, {
        nfcBaseUrl: settings.externalApi.publicBaseUrl || "",
        nfcToken: quote0.nfcToken,
        taskKey: quote0.taskKey,
        taskAlias: quote0.taskAlias,
        index: currentCursor,
        total: feed.navigation.total,
        generatedAt: feed.generatedAt,
        sourceContexts: buildSourceContexts(articles, workflowPayload)
      });
      const response = await this.client.sendTextContent(quote0.deviceId, formatted.payload);
      const nextCursor = feed.navigation.hasNext ? parseCursor(feed.navigation.nextCursor) : 0;

      quote0.cursor = nextCursor;
      quote0.lastSyncedQuestionId = formatted.questionId;
      quote0.lastSyncedAt = new Date().toISOString();
      quote0.lastError = "";
      await this.options.saveSettings();

      return {
        questionId: formatted.questionId,
        total: feed.navigation.total,
        nextCursor,
        message: response.message || "Quote0 content updated.",
        nfcLink: formatted.nfcLink
      };
    } catch (error) {
      quote0.lastError = sanitizeError(error);
      await this.options.saveSettings();
      throw error;
    } finally {
      this.syncing = false;
    }
  }

  async sendTestCard(): Promise<string> {
    if (!this.canSync()) {
      throw new Error("Quote0 test needs enabled settings, an API key, and a device ID.");
    }
    const settings = this.options.getSettings();
    const quote0 = settings.quote0;
    try {
      const response = await this.client.sendTextContent(quote0.deviceId, withTaskFields({
        refreshNow: true,
        title: "ToWrite Quote0 test",
        message: "Connection OK. NFC opens the ToWrite capture page.",
        signature: new Date().toLocaleString(),
        link: buildQuote0InputUrl(settings.externalApi.publicBaseUrl || "", quote0.nfcToken),
        styles: {
          title: { fontFamily: "ChillDuanSans", fontSize: 24, fontWeight: 700 },
          message: { fontFamily: "FusionPixel12", fontSize: 18, lineHeight: 1.2 },
          signature: { fontFamily: "ChillDuanSans", fontSize: 14 }
        }
      }, quote0.taskKey, quote0.taskAlias));

      quote0.lastSyncedQuestionId = "";
      quote0.lastSyncedAt = new Date().toISOString();
      quote0.lastError = "";
      await this.options.saveSettings();
      return response.message || "Quote0 test card sent.";
    } catch (error) {
      quote0.lastError = sanitizeError(error);
      await this.options.saveSettings();
      throw error;
    }
  }

  private canSync(): boolean {
    const settings = this.options.getSettings().quote0;
    return settings.enabled && Boolean(settings.apiKey.trim()) && Boolean(settings.deviceId.trim());
  }

  private scheduleNext(): void {
    const seconds = this.options.getSettings().quote0.refreshSeconds;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.syncNext()
        .catch(() => undefined)
        .finally(() => {
          if (this.canSync()) {
            this.scheduleNext();
          }
        });
    }, Math.max(60, seconds) * 1000);
  }
}

function withTaskFields(payload: Quote0TextPayload, taskKey: string, taskAlias: string): Quote0TextPayload {
  return {
    ...payload,
    taskKey: taskKey.trim() || undefined,
    taskAlias: taskAlias.trim() || undefined
  };
}

function parseCursor(value: string | undefined): number {
  return Math.max(0, Number.parseInt(value ?? "0", 10) || 0);
}

function roundToMinute(value: number): number {
  return Math.round(value / 60000) * 60000;
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/gu, "Bearer [redacted]").slice(0, 400);
}

function buildSourceContexts(
  articles: ArticleSummary[],
  workflowPayload: WorkflowIndexPayload
): Record<string, Quote0SourceContext> {
  const contexts: Record<string, Quote0SourceContext> = {};

  for (const article of articles) {
    contexts[article.filePath] = {
      sourceTitle: article.title || undefined
    };
  }

  for (const stage of workflowPayload.stages) {
    for (const file of stage.files) {
      contexts[file.filePath] = {
        ...contexts[file.filePath],
        sourceTitle: file.title || contexts[file.filePath]?.sourceTitle,
        workflowStageId: stage.id,
        workflowStageTitle: stage.title,
        workflowNextAction: file.nextAction || undefined,
        tags: file.tags
      };
    }
  }

  return contexts;
}
