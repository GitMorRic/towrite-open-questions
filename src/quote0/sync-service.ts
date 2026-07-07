import type { ArticleSummary, OpenQuestion } from "../core/types";
import type { ToWriteSettings } from "../core/settings";
import type { WorkflowIndexPayload } from "../workflow";
import { buildDeviceFeedPayload } from "../external/device-feed";
import type { PushQuote0Delivery } from "../push/engine";
import { quote0TextApiAdapter } from "../push/adapters";
import { PushCandidateSource } from "../push/candidates";
import { formatPushFeed } from "../push/formatter";
import type { PushCandidate, PushDecision, PushDisplayCard, PushTargetSettings } from "../push/types";
import { Quote0Client, type Quote0CanvasPayload, type Quote0ClientLike, type Quote0Device, type Quote0DeviceStatus, type Quote0ImagePayload, type Quote0TextPayload } from "./client";
import { buildQuote0InputUrl, formatQuote0DeviceFeed, type Quote0SourceContext } from "./formatter";
import { buildQuote0DashboardCanvasPayload } from "./canvas-renderer";
import { buildQuote0DashboardImagePayload } from "./image-renderer";

export interface Quote0SyncServiceOptions {
  getSettings(): ToWriteSettings;
  getVaultName(): string;
  getQuestions(): OpenQuestion[];
  getArticleSummaries(): ArticleSummary[];
  getWorkflowPayload(): WorkflowIndexPayload;
  getPushQuote0Delivery?(): PushQuote0Delivery;
  renderQuote0DashboardImage?(display: PushDisplayCard, workflow: WorkflowIndexPayload): string;
  saveSettings(): Promise<void>;
}

export interface Quote0SyncResult {
  questionId: string;
  total: number;
  nextCursor: number;
  message: string;
  nfcLink?: string;
  contentApi?: "text" | "image" | "canvas";
}

export interface Quote0SyncPreview extends Quote0SyncResult {
  payload: Quote0TextPayload;
  imagePayload?: Quote0ImagePayload;
  canvasPayload?: Quote0CanvasPayload;
  candidateType?: string;
  display?: PushDisplayCard;
}

interface PreparedQuote0Content extends Quote0SyncPreview {
  markSent?: () => Promise<void>;
  advanceCursor: boolean;
  contentApi: "text" | "image" | "canvas";
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
      const prepared = this.prepareNextContent(settings);
      const response = prepared.canvasPayload
        ? await this.client.sendCanvasContent(quote0.deviceId, prepared.canvasPayload)
        : prepared.imagePayload
        ? await this.client.sendImageContent(quote0.deviceId, prepared.imagePayload)
        : await this.client.sendTextContent(quote0.deviceId, prepared.payload);
      await prepared.markSent?.();

      if (prepared.advanceCursor) {
        quote0.cursor = prepared.nextCursor;
      }
      quote0.lastSyncedQuestionId = prepared.questionId;
      quote0.lastSyncedAt = new Date().toISOString();
      quote0.lastError = "";
      await this.options.saveSettings();

      return {
        questionId: prepared.questionId,
        total: prepared.total,
        nextCursor: prepared.nextCursor,
        message: response.message || prepared.message || "Quote0 content updated.",
        nfcLink: prepared.nfcLink,
        contentApi: prepared.contentApi
      };
    } catch (error) {
      quote0.lastError = sanitizeError(error);
      await this.options.saveSettings();
      throw error;
    } finally {
      this.syncing = false;
    }
  }

  previewNext(): Quote0SyncPreview {
    return toPreview(this.prepareNextContent(this.options.getSettings()));
  }

  previewDashboardContent(): Quote0SyncPreview {
    return toPreview(this.prepareDashboardContent(this.options.getSettings()));
  }

  async sendDashboardContent(): Promise<string> {
    if (this.syncing) {
      throw new Error("Quote0 sync is already running.");
    }
    if (!this.canSync()) {
      throw new Error("Quote0 dashboard needs enabled settings, an API key, and a device ID.");
    }

    this.syncing = true;
    const settings = this.options.getSettings();
    const quote0 = settings.quote0;
    try {
      const prepared = this.prepareDashboardContent(settings);
      const response = prepared.canvasPayload
        ? await this.client.sendCanvasContent(quote0.deviceId, prepared.canvasPayload)
        : prepared.imagePayload
        ? await this.client.sendImageContent(quote0.deviceId, prepared.imagePayload)
        : await this.client.sendTextContent(quote0.deviceId, prepared.payload);
      quote0.lastSyncedQuestionId = prepared.questionId;
      quote0.lastSyncedAt = new Date().toISOString();
      quote0.lastError = "";
      await this.options.saveSettings();
      return response.message || "Quote0 dashboard sent.";
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

  private prepareNextContent(settings: ToWriteSettings): PreparedQuote0Content {
    const quote0 = settings.quote0;
    if (settings.push.enabled && this.options.getPushQuote0Delivery) {
      const delivery = this.options.getPushQuote0Delivery();
      if (!delivery.candidateId) {
        throw new Error(delivery.message || "No push candidate is ready for Quote0.");
      }
      return this.withDashboardImagePayload(settings, {
        questionId: delivery.candidateId,
        total: 1,
        nextCursor: quote0.cursor,
        message: delivery.message || "Quote0 content updated.",
        nfcLink: delivery.nfcLink,
        payload: delivery.payload,
        display: delivery.display,
        candidateType: delivery.candidateType,
        markSent: delivery.markSent,
        advanceCursor: false,
        contentApi: "text"
      });
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
    return {
      questionId: formatted.questionId,
      total: feed.navigation.total,
      nextCursor: feed.navigation.hasNext ? parseCursor(feed.navigation.nextCursor) : 0,
      message: "Quote0 content updated.",
      nfcLink: formatted.nfcLink,
      payload: formatted.payload,
      candidateType: "question",
      advanceCursor: true,
      contentApi: "text"
    };
  }

  private prepareDashboardContent(settings: ToWriteSettings): PreparedQuote0Content {
    const generatedAt = new Date().toISOString();
    const candidates = new PushCandidateSource().build({
      vaultName: this.options.getVaultName(),
      questions: this.options.getQuestions(),
      articles: this.options.getArticleSummaries(),
      workflowPayload: this.options.getWorkflowPayload(),
      publicBaseUrl: settings.externalApi.publicBaseUrl || "",
      token: settings.quote0.nfcToken,
      now: generatedAt
    });
    const candidate = candidates.find((item): item is PushCandidate => item.type === "home-summary");
    if (!candidate) {
      throw new Error("No Quote0 dashboard candidate is ready.");
    }
    const decision: PushDecision = {
      target: quote0PushTarget(settings),
      candidate,
      score: 1,
      reason: "manual dashboard image",
      quiet: false,
      generatedAt
    };
    const feed = formatPushFeed(decision, {
      privacy: settings.push.privacy,
      context: {
        timeBucket: timeBucket(new Date()),
        placeLabel: undefined,
        mode: "dashboard",
        activeFile: undefined
      }
    });
    const result = quote0TextApiAdapter(feed, settings.quote0.taskKey, settings.quote0.taskAlias);
    return this.withDashboardImagePayload(settings, {
      questionId: result.candidateId,
      total: 1,
      nextCursor: settings.quote0.cursor,
      message: result.message,
      nfcLink: result.nfcLink,
      payload: result.payload,
      display: result.display,
      candidateType: result.candidateType,
      advanceCursor: false,
      contentApi: "text"
    }, true);
  }

  private withDashboardImagePayload(settings: ToWriteSettings, prepared: PreparedQuote0Content, force = false): PreparedQuote0Content {
    if (!prepared.display || prepared.display.variant !== "home-summary") {
      return prepared;
    }
    if (!force && settings.quote0.dashboardApi === "text") {
      return prepared;
    }
    if (settings.quote0.dashboardApi === "canvas") {
      return {
        ...prepared,
        contentApi: "canvas",
        canvasPayload: buildQuote0DashboardCanvasPayload(prepared.display, this.options.getWorkflowPayload(), {
          link: prepared.nfcLink || prepared.display.link || buildQuote0InputUrl(settings.externalApi.publicBaseUrl || "", settings.quote0.nfcToken),
          taskAlias: settings.quote0.canvasTaskAlias,
          border: settings.quote0.canvasBorder
        })
      };
    }
    if (settings.quote0.dashboardApi !== "image") {
      return prepared;
    }
    return {
      ...prepared,
      contentApi: "image",
      imagePayload: buildQuote0DashboardImagePayload(prepared.display, this.options.getWorkflowPayload(), {
        link: prepared.nfcLink || prepared.display.link || buildQuote0InputUrl(settings.externalApi.publicBaseUrl || "", settings.quote0.nfcToken),
        taskKey: settings.quote0.imageTaskKey,
        taskAlias: settings.quote0.imageTaskAlias,
        border: settings.quote0.imageBorder,
        ditherType: settings.quote0.imageDitherType,
        renderPng: this.options.renderQuote0DashboardImage
      })
    };
  }
}

function toPreview(prepared: PreparedQuote0Content): Quote0SyncPreview {
  return {
    questionId: prepared.questionId,
    total: prepared.total,
    nextCursor: prepared.nextCursor,
    message: prepared.message,
    nfcLink: prepared.nfcLink,
    payload: prepared.payload,
    imagePayload: prepared.imagePayload,
    canvasPayload: prepared.canvasPayload,
    candidateType: prepared.candidateType,
    display: prepared.display,
    contentApi: prepared.contentApi
  };
}

function quote0PushTarget(settings: ToWriteSettings): PushTargetSettings {
  const target = settings.push.targets.find((item) => item.id === "quote0");
  if (target) {
    return target;
  }
  return {
    id: "quote0",
    name: "quote0",
    type: "quote0",
    enabled: settings.quote0.enabled,
    profile: "eink-bw",
    width: 264,
    height: 176,
    inches: 2.7,
    defaultPage: "home",
    defaultLane: settings.quote0.lane,
    refreshSeconds: settings.quote0.refreshSeconds,
    quietHoursStart: "",
    quietHoursEnd: "",
    token: settings.quote0.nfcToken,
    capabilities: ["push", "nfc", "text-api", "image-api", "canvas-api"]
  };
}

function timeBucket(now: Date): string {
  const hour = now.getHours();
  if (hour < 6) return "night";
  if (hour < 11) return "morning";
  if (hour < 14) return "noon";
  if (hour < 18) return "afternoon";
  if (hour < 23) return "evening";
  return "night";
}

function withTaskFields(payload: Quote0TextPayload, taskKey: string, taskAlias: string): Quote0TextPayload {
  const key = taskKey.trim();
  const alias = taskAlias.trim();
  return {
    ...payload,
    taskKey: key || undefined,
    taskAlias: key ? undefined : alias || undefined
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
