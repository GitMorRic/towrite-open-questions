import "./styles.css";
import {
  Component,
  MarkdownView,
  MarkdownRenderer,
  Notice,
  Platform,
  Plugin,
  TAbstractFile,
  TFile,
  TFolder,
  debounce,
  type Editor
} from "obsidian";
import { createQuestionAnchor, lineRangeForOffsets } from "./core/anchor";
import { makeQuestionId } from "./core/hash";
import {
  DEFAULT_SETTINGS,
  DEFAULT_STATUS_OPTIONS,
  DEFAULT_WORKFLOW_STAGES,
  normalizeExternalApiBindHost,
  normalizeExternalApiPublicBaseUrl,
  normalizeDeviceProfiles,
  normalizePushSettings,
  normalizeQuote0Settings,
  normalizeReminderPresets,
  type ToWriteSavedData,
  type ToWriteSettings,
  type WorkflowStageSettings
} from "./core/settings";
import { OpenQuestionStore } from "./core/store";
import type {
  ArticleSummary,
  OpenQuestion,
  OpenQuestionAi,
  OpenQuestionColor,
  OpenQuestionLane,
  OpenQuestionNote,
  OpenQuestionQuery,
  OpenQuestionStatus,
  StoredQuestionState
} from "./core/types";
import { LocalKnowledgeIndex } from "./ai/local-index";
import { OpenAiCompatibleProvider } from "./ai/openai-provider";
import { AiQuestionService } from "./ai/service";
import { QuestionExporter } from "./export/exporter";
import { ToWriteExternalApiServer, type DeviceCaptureRequest, type DeviceCaptureResult } from "./external/server";
import { PushEngine } from "./push/engine";
import { normalizePushRuntimeState, type PushAnchorInput, type PushFeedbackInput } from "./push/state";
import type { PushFeedPayload, PushRuntimeState } from "./push/types";
import { Quote0SyncService, type Quote0SyncPreview, type Quote0SyncResult } from "./quote0/sync-service";
import type { Quote0Device, Quote0DeviceStatus } from "./quote0/client";
import { WorkflowIndex } from "./workflow";
import { createQuestionDecorations } from "./obsidian/decorations";
import { OpenQuestionIndexer } from "./obsidian/indexer";
import { jumpToQuestion as jumpToQuestionInWorkspace } from "./obsidian/jump";
import { AddQuestionModal } from "./obsidian/modal";
import { PdfQuestionLayer, pdfAnchorFromCurrentSelection } from "./obsidian/pdf-layer";
import { SelectionQuestionToolbar } from "./obsidian/selection-toolbar";
import { ToWriteSettingTab } from "./obsidian/settings-tab";
import { QuestionSidecarRepository } from "./obsidian/sidecar";
import {
  TOWRITE_DASHBOARD_VIEW,
  TOWRITE_SIDEBAR_VIEW,
  ToWriteDashboardItemView,
  ToWriteSidebarItemView
} from "./obsidian/views";
import type { ActiveLineRange, LinkSuggestion, ToWriteUiApi } from "./ui/api";

export default class ToWritePlugin extends Plugin {
  settings: ToWriteSettings = { ...DEFAULT_SETTINGS };
  private store!: OpenQuestionStore;
  private indexer!: OpenQuestionIndexer;
  private sidecars!: QuestionSidecarRepository;
  private exporter!: QuestionExporter;
  private workflowIndex!: WorkflowIndex;
  private localKnowledgeIndex!: LocalKnowledgeIndex;
  private aiService!: AiQuestionService;
  private externalApiServer!: ToWriteExternalApiServer;
  private pushEngine!: PushEngine;
  private quote0SyncService!: Quote0SyncService;
  private uiApi!: ToWriteUiApi;
  private selectionToolbar?: SelectionQuestionToolbar;
  private pdfQuestionLayer?: PdfQuestionLayer;
  private backgroundRefreshTimer = 0;
  private backgroundRefreshRunning = false;
  private backgroundRefreshQueued = false;

  async onload(): Promise<void> {
    await this.loadPluginData();

    this.store = new OpenQuestionStore(this.savedQuestionStates);
    this.indexer = new OpenQuestionIndexer(this.app, this.store, () => this.settings);
    this.sidecars = new QuestionSidecarRepository(this.app, () => this.settings);
    this.workflowIndex = new WorkflowIndex(
      this.app,
      () => this.settings.workflowStages,
      () => this.settings.exportDirectory,
      () => this.store.getAllQuestions()
    );
    this.exporter = new QuestionExporter(this.app, this.store, () => this.settings, () => this.workflowIndex.getPayload());
    this.localKnowledgeIndex = new LocalKnowledgeIndex();
    this.aiService = new AiQuestionService({
      app: this.app,
      store: this.store,
      localIndex: this.localKnowledgeIndex,
      provider: new OpenAiCompatibleProvider(() => this.settings.ai),
      getSettings: () => this.settings,
      onQuestionUpdated: async () => {
        await this.savePluginData();
        if (this.settings.autoExport) {
          await this.exportNow(false);
        }
        this.store.notify();
      }
    });
    this.externalApiServer = new ToWriteExternalApiServer({
      pluginVersion: this.manifest.version,
      getSettings: () => this.settings.externalApi,
      getVaultName: () => this.app.vault.getName(),
      getQuestions: (query = {}) => this.store.query(query),
      getArticleSummaries: () => this.store.getArticleSummaries(),
      getWorkflowPayload: (query = {}) => this.workflowIndex.getPayload(query),
      getWorkflowSummary: () => this.workflowIndex.getSummary(),
      getDeviceCaptureSettings: () => this.settings.deviceCapture,
      getRestrictedAccessToken: () => this.settings.quote0.enabled ? this.settings.quote0.nfcToken : "",
      getPushFeed: (targetId) => this.getPushFeed(targetId),
      recordPushFeedback: (input) => this.recordPushFeedback(input),
      recordContextAnchor: (input) => this.recordContextAnchor(input),
      getStatusOptions: () => this.settings.statusOptions,
      updateQuestionStatus: (id, status, note, clientId) => this.updateQuestionStatusFromExternal(id, status, note, clientId),
      appendQuestionNote: (id, text, clientId) => this.appendQuestionNoteFromExternal(id, text, clientId),
      updateQuestionFields: (id, patch) => this.updateQuestionFieldsFromExternal(id, patch),
      createDeviceCapture: (request) => this.createDeviceCaptureFromExternal(request),
      subscribe: (listener) => this.subscribe(listener)
    });
    this.pushEngine = new PushEngine({
      getSettings: () => this.settings,
      getVaultName: () => this.app.vault.getName(),
      getQuestions: () => this.store.query(),
      getArticleSummaries: () => this.store.getArticleSummaries(),
      getWorkflowPayload: () => this.workflowIndex.getPayload({ limit: 50, compact: true }),
      getActiveFile: () => this.getActiveFile(),
      getState: () => this.pushState,
      saveState: () => this.savePluginData()
    });
    this.quote0SyncService = new Quote0SyncService({
      getSettings: () => this.settings,
      getVaultName: () => this.app.vault.getName(),
      getQuestions: () => this.store.query(),
      getArticleSummaries: () => this.store.getArticleSummaries(),
      getWorkflowPayload: () => this.workflowIndex.getPayload({ limit: 50, compact: true }),
      getPushQuote0Delivery: () => this.pushEngine.prepareQuote0Delivery("quote0"),
      saveSettings: () => this.savePluginData()
    });
    this.uiApi = this.createUiApi();
    this.selectionToolbar = new SelectionQuestionToolbar({
      onCreate: (lane, color) => {
        void this.createQuestionFromSelection(lane, color);
      }
    });
    this.pdfQuestionLayer = new PdfQuestionLayer({
      app: this.app,
      component: this,
      getQuestions: (filePath) => this.store.query({ filePath }),
      subscribe: (listener) => this.subscribe(listener)
    });
    this.pdfQuestionLayer.register();

    this.registerView(
      TOWRITE_SIDEBAR_VIEW,
      (leaf) => new ToWriteSidebarItemView(leaf, this.uiApi)
    );
    this.registerView(
      TOWRITE_DASHBOARD_VIEW,
      (leaf) => new ToWriteDashboardItemView(leaf, this.uiApi)
    );

    this.addRibbonIcon("circle-help", "Open ToWrite questions", () => {
      void this.activateSidebar();
    });

    this.addCommand({
      id: "open-towrite-sidebar",
      name: "Open questions sidebar",
      callback: () => {
        void this.activateSidebar();
      }
    });

    this.addCommand({
      id: "open-towrite-dashboard",
      name: "Open question dashboard",
      callback: () => {
        void this.activateDashboard();
      }
    });

    this.addCommand({
      id: "refresh-open-question-index",
      name: "Refresh open question index",
      callback: () => {
        void this.refreshIndex();
      }
    });

    this.addCommand({
      id: "export-open-question-json",
      name: "Export open question JSON",
      callback: () => {
        void this.exportNow(true);
      }
    });

    this.addCommand({
      id: "add-open-question-from-selection",
      name: "Add ToThink from selection",
      editorCallback: (editor, view) => {
        const file = view.file;
        if (!file) {
          new Notice("ToWrite needs an active Markdown file.");
          return;
        }
        void this.createQuestionFromEditor(editor, file, "think");
      }
    });

    this.addCommand({
      id: "add-towrite-from-selection",
      name: "Add ToWrite from selection",
      editorCallback: (editor, view) => {
        const file = view.file;
        if (!file) {
          new Notice("ToWrite needs an active Markdown file.");
          return;
        }
        void this.createQuestionFromEditor(editor, file, "write");
      }
    });

    if (this.settings.enableEditorDecorations) {
      this.registerEditorExtension(
        createQuestionDecorations({
          getActiveFileQuestions: () => {
            const activePath = this.getActiveFile();
            if (!activePath) {
              return [];
            }
            return this.store.query({ filePath: activePath }).filter((question) => question.status !== "ignored");
          },
          getActiveFileSuggestions: () => {
            const activePath = this.getActiveFile();
            return activePath ? this.store.getSuggestions(activePath) : [];
          },
          getCompactEditorDecorations: () => this.settings.compactEditorDecorations,
          onAcceptSuggestion: (id) => {
            void this.acceptSuggestion(id);
          },
          onIgnoreSuggestion: (id) => {
            void this.ignoreSuggestion(id);
          }
        })
      );
    }

    this.addSettingTab(new ToWriteSettingTab(this.app, this));
    this.registerEvents();
    void this.configureExternalApiServer(false);
    this.configureQuote0Sync();

    this.app.workspace.onLayoutReady(() => {
      void this.refreshIndex();
      if (this.settings.autoOpenSidebar) {
        window.setTimeout(() => {
          void this.activateSidebar();
        }, 250);
      }
    });
  }

  onunload(): void {
    if (this.backgroundRefreshTimer) {
      window.clearTimeout(this.backgroundRefreshTimer);
      this.backgroundRefreshTimer = 0;
    }
    void this.externalApiServer?.stop();
    this.quote0SyncService?.stop();
    this.selectionToolbar?.destroy();
  }

  queryQuestions(query: OpenQuestionQuery = {}): OpenQuestion[] {
    return this.store.query(query);
  }

  getArticleSummary(filePath: string): ArticleSummary | undefined {
    return this.store.getArticleSummary(filePath);
  }

  async jumpToQuestion(id: string): Promise<void> {
    const question = this.store.getQuestion(id);
    if (!question) {
      new Notice("ToWrite question not found.");
      return;
    }
    await jumpToQuestionInWorkspace(this.app, question);
  }

  async openFile(filePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      new Notice(`ToWrite could not find ${filePath}.`);
      return;
    }

    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { active: true });
  }

  async renderMarkdown(markdown: string, element: HTMLElement, sourcePath: string): Promise<void> {
    element.replaceChildren();
    const component = new Component();
    component.load();
    try {
      await MarkdownRenderer.render(this.app, markdown, element, sourcePath || this.getActiveFile() || "", component);
    } finally {
      component.unload();
    }
  }

  async openObsidianLink(linktext: string, sourcePath: string): Promise<void> {
    const target = linktext.trim();
    if (!target) {
      return;
    }

    try {
      await this.app.workspace.openLinkText(target, sourcePath || this.getActiveFile() || "", false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`ToWrite could not open [[${target}]]: ${message}`);
    }
  }

  getLinkSuggestions(query: string, sourcePath: string): LinkSuggestion[] {
    const source = sourcePath || this.getActiveFile() || "";
    const needle = query.trim().toLowerCase();
    const suggestions = this.app.vault.getMarkdownFiles().map((file) => {
      const linktext = this.app.metadataCache.fileToLinktext(file, source, true);
      const haystack = `${file.basename}\n${file.path}\n${linktext}`.toLowerCase();
      const index = needle ? haystack.indexOf(needle) : 0;
      return {
        title: file.basename,
        path: file.path,
        linktext,
        modifiedAt: file.stat.mtime,
        matchIndex: index
      };
    });

    return suggestions
      .filter((suggestion) => !needle || suggestion.matchIndex >= 0)
      .sort((a, b) => {
        if (!needle) {
          return b.modifiedAt - a.modifiedAt || a.title.localeCompare(b.title);
        }
        const aStarts = a.title.toLowerCase().startsWith(needle) || a.linktext.toLowerCase().startsWith(needle);
        const bStarts = b.title.toLowerCase().startsWith(needle) || b.linktext.toLowerCase().startsWith(needle);
        if (aStarts !== bStarts) {
          return aStarts ? -1 : 1;
        }
        return a.matchIndex - b.matchIndex || a.title.localeCompare(b.title);
      })
      .slice(0, 8)
      .map(({ title, path, linktext }) => ({ title, path, linktext }));
  }

  async refreshAi(id: string): Promise<OpenQuestionAi | undefined> {
    try {
      const result = await this.aiService.refreshQuestion(id, "manual");
      if (result?.ai.error) {
        new Notice(`ToWrite AI failed: ${result.ai.error}`);
      } else if (result) {
        new Notice("ToWrite AI refreshed.");
      }
      return result?.ai;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`ToWrite AI failed: ${message}`);
      return this.store.getQuestion(id)?.ai;
    }
  }

  async refreshIndex(): Promise<void> {
    await this.indexer.rebuildVault();
    await this.refreshSidecars({ rebuildWorkflow: false });
    if (this.shouldBuildLocalKnowledgeIndex()) {
      await this.localKnowledgeIndex.rebuild(this.app, this.settings.exportDirectory);
    }
    await this.workflowIndex.rebuild();
    if (this.settings.autoExport) {
      await this.exportNow(false, { rebuildWorkflow: false });
    }
    this.aiService.refreshMissingForActiveNote(this.getActiveFile());
    this.store.notify();
  }

  async exportNow(showNotice = true, options: { rebuildWorkflow?: boolean } = {}): Promise<void> {
    if (options.rebuildWorkflow !== false) {
      await this.workflowIndex.rebuild();
    }
    await this.exporter.exportAll();
    if (showNotice) {
      const directory = this.settings.exportDirectory.replace(/\\/gu, "/").replace(/\/+$/u, "");
      new Notice(`ToWrite JSON exported to ${directory}/index.json, articles.json, eink-compact.json, workflows.json.`);
    }
  }

  private scheduleBackgroundRefresh(delayMs = 3500): void {
    if (this.backgroundRefreshTimer) {
      window.clearTimeout(this.backgroundRefreshTimer);
    }
    this.backgroundRefreshTimer = window.setTimeout(() => {
      this.backgroundRefreshTimer = 0;
      void this.runBackgroundRefresh();
    }, delayMs);
  }

  private async runBackgroundRefresh(): Promise<void> {
    if (this.backgroundRefreshRunning) {
      this.backgroundRefreshQueued = true;
      return;
    }

    this.backgroundRefreshRunning = true;
    try {
      if (this.shouldBuildLocalKnowledgeIndex()) {
        await this.localKnowledgeIndex.rebuild(this.app, this.settings.exportDirectory);
      }
      await this.workflowIndex.rebuild();
      if (this.settings.autoExport) {
        await this.exportNow(false, { rebuildWorkflow: false });
      }
      this.aiService.refreshMissingForActiveNote(this.getActiveFile());
      this.store.notify();
    } finally {
      this.backgroundRefreshRunning = false;
      if (this.backgroundRefreshQueued) {
        this.backgroundRefreshQueued = false;
        this.scheduleBackgroundRefresh(1200);
      }
    }
  }

  private shouldBuildLocalKnowledgeIndex(): boolean {
    return this.settings.ai.enabled;
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  async savePluginData(): Promise<void> {
    const data: ToWriteSavedData = {
      settings: this.settings,
      questionStates: this.store?.serializeStates() ?? this.savedQuestionStates,
      pushState: this.pushState
    };
    await this.saveData(data);
  }

  async setCompactEditorDecorations(value: boolean): Promise<void> {
    this.settings.compactEditorDecorations = value;
    await this.savePluginData();
    this.refreshEditorDecorations();
    this.store.notify();
  }

  getActiveFile(): string | null {
    return this.app.workspace.getActiveFile()?.path ?? null;
  }

  private getActiveLineRange(): ActiveLineRange | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      return null;
    }

    const selections = view.editor.listSelections();
    if (selections.length === 0) {
      const line = view.editor.getCursor().line;
      return {
        filePath: view.file.path,
        from: line,
        to: line
      };
    }

    const lines = selections.flatMap((selection) => [selection.anchor.line, selection.head.line]);
    return {
      filePath: view.file.path,
      from: Math.min(...lines),
      to: Math.max(...lines)
    };
  }

  async configureExternalApiServer(showNotice = true): Promise<void> {
    if (!this.externalApiServer) {
      return;
    }

    if (!Platform.isDesktopApp || !this.settings.externalApi.enabled) {
      await this.externalApiServer.stop();
      if (showNotice && this.settings.externalApi.enabled && !Platform.isDesktopApp) {
        new Notice("ToWrite external API is only available in Obsidian desktop.");
      }
      return;
    }

    try {
      await this.externalApiServer.restart();
      if (showNotice) {
        new Notice(`ToWrite external API listening on ${this.settings.externalApi.bindHost}:${this.settings.externalApi.port}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`ToWrite external API failed: ${message}`);
    }
  }

  configureQuote0Sync(): void {
    this.quote0SyncService?.restart();
  }

  async listQuote0Devices(): Promise<Quote0Device[]> {
    return this.quote0SyncService.listDevices();
  }

  async getQuote0DeviceStatus(): Promise<Quote0DeviceStatus> {
    return this.quote0SyncService.getDeviceStatus();
  }

  async syncQuote0Next(): Promise<Quote0SyncResult> {
    return this.quote0SyncService.syncNext();
  }

  previewQuote0Next(): Quote0SyncPreview {
    return this.quote0SyncService.previewNext();
  }

  previewQuote0DashboardContent(): Quote0SyncPreview {
    return this.quote0SyncService.previewDashboardContent();
  }

  async sendQuote0TestCard(): Promise<string> {
    return this.quote0SyncService.sendTestCard();
  }

  async sendQuote0DashboardContent(): Promise<string> {
    return this.quote0SyncService.sendDashboardContent();
  }

  async switchQuote0ToNextContent(): Promise<string> {
    return this.quote0SyncService.switchToNextContent();
  }

  async updateQuote0DeviceRefreshInterval(): Promise<void> {
    await this.quote0SyncService.updateDeviceRefreshInterval();
  }

  getPushFeed(targetId?: string): PushFeedPayload {
    return this.pushEngine.getFeed(targetId);
  }

  async recordPushFeedback(input: PushFeedbackInput): Promise<void> {
    await this.pushEngine.recordFeedback(input);
    this.store.notify();
  }

  async recordContextAnchor(input: PushAnchorInput): Promise<void> {
    await this.pushEngine.recordAnchor(input);
    this.store.notify();
  }

  regenerateQuote0NfcToken(): string {
    const token = createQuote0NfcToken();
    this.settings.quote0.nfcToken = token;
    return token;
  }

  regenerateExternalApiToken(): string {
    const token = createExternalApiToken();
    this.settings.externalApi.token = token;
    return token;
  }

  private async updateQuestionStatusFromExternal(
    id: string,
    status: OpenQuestionStatus,
    note?: string,
    clientId?: string
  ): Promise<OpenQuestion | undefined> {
    const question = this.store.getQuestion(id);
    if (!question) {
      return undefined;
    }

    const patch: Omit<Partial<StoredQuestionState>, "id"> = { status };
    const appendedNote = createExternalQuestionNote(note, clientId);
    if (appendedNote) {
      patch.notes = [...(question.notes ?? []), appendedNote];
    }

    this.store.patchQuestion(id, patch);
    await this.savePluginData();
    if (this.settings.autoExport) {
      await this.exportNow(false);
    }
    return this.store.getQuestion(id);
  }

  private async appendQuestionNoteFromExternal(id: string, text: string, clientId?: string): Promise<OpenQuestion | undefined> {
    const question = this.store.getQuestion(id);
    if (!question) {
      return undefined;
    }
    const note = createExternalQuestionNote(text, clientId);
    if (!note) {
      return question;
    }

    this.store.patchQuestion(id, {
      notes: [...(question.notes ?? []), note]
    });
    await this.savePluginData();
    if (this.settings.autoExport) {
      await this.exportNow(false);
    }
    return this.store.getQuestion(id);
  }

  private async updateQuestionFieldsFromExternal(
    id: string,
    patch: { title?: string; question?: string; reminderAt?: string; reminderNote?: string; reminderSource?: string; reminderDismissedAt?: string }
  ): Promise<OpenQuestion | undefined> {
    const question = this.store.getQuestion(id);
    if (!question) {
      return undefined;
    }

    const hasTitle = Object.prototype.hasOwnProperty.call(patch, "title");
    const hasQuestion = Object.prototype.hasOwnProperty.call(patch, "question");
    const hasReminderAt = Object.prototype.hasOwnProperty.call(patch, "reminderAt");
    const hasReminderNote = Object.prototype.hasOwnProperty.call(patch, "reminderNote");
    const hasReminderSource = Object.prototype.hasOwnProperty.call(patch, "reminderSource");
    const hasReminderDismissedAt = Object.prototype.hasOwnProperty.call(patch, "reminderDismissedAt");
    const updated: OpenQuestion = {
      ...question,
      title: hasTitle ? patch.title : question.title,
      question: hasQuestion ? (patch.question ?? question.question) : question.question,
      reminderAt: hasReminderAt ? (patch.reminderAt ?? "") : question.reminderAt,
      reminderNote: hasReminderNote ? (patch.reminderNote ?? "") : question.reminderNote,
      reminderSource: hasReminderSource ? patch.reminderSource : question.reminderSource,
      reminderDismissedAt: hasReminderDismissedAt ? (patch.reminderDismissedAt ?? "") : question.reminderDismissedAt,
      updatedAt: new Date().toISOString()
    };

    if (this.store.isSidecarQuestion(id)) {
      await this.sidecars.upsert(updated);
      await this.refreshSidecars();
    } else {
      const statePatch: Omit<Partial<StoredQuestionState>, "id"> = {};
      if (hasTitle) {
        statePatch.title = updated.title;
      }
      if (hasQuestion) {
        statePatch.question = updated.question;
      }
      if (hasReminderAt) {
        statePatch.reminderAt = updated.reminderAt;
      }
      if (hasReminderNote) {
        statePatch.reminderNote = updated.reminderNote;
      }
      if (hasReminderSource) {
        statePatch.reminderSource = updated.reminderSource;
      }
      if (hasReminderDismissedAt) {
        statePatch.reminderDismissedAt = updated.reminderDismissedAt;
      }
      this.store.patchQuestion(id, statePatch);
    }

    await this.savePluginData();
    if (this.settings.autoExport) {
      await this.exportNow(false);
    }
    return this.store.getQuestion(id);
  }

  private async createDeviceCaptureFromExternal(request: DeviceCaptureRequest): Promise<DeviceCaptureResult> {
    const createdAt = new Date().toISOString();
    const text = request.text.trim();
    const target = this.resolveDeviceCaptureTarget(request);
    const tags = normalizeCaptureTags([
      ...this.settings.deviceCapture.defaultTags,
      ...request.tags,
      ...(target.stage ? [target.stage.id, ...target.stage.tags] : [])
    ]);
    const title = request.title?.trim() || defaultTitleFromBody(text);
    let filePath: string;

    if (target.kind === "inboxFile") {
      filePath = normalizeCaptureFilePath(target.inboxFile || this.settings.deviceCapture.inboxFile);
      await this.ensureParentFolder(filePath);
      const entry = formatInboxCaptureEntry({
        title,
        text,
        tags,
        createdAt,
        clientId: request.clientId
      });
      await this.appendToMarkdownFile(filePath, entry);
    } else {
      const folderPath = normalizeFolderPath(target.folderPath || "00-Raw");
      await this.ensureFolderPath(folderPath);
      filePath = await this.uniqueCaptureFilePath(folderPath, title, createdAt);
      const content = formatCaptureNote({
        title,
        text,
        tags,
        createdAt,
        clientId: request.clientId,
        workflowStage: target.stage
      });
      await this.app.vault.create(filePath, content);
    }

    await this.refreshIndex();
    this.store.notify();

    return {
      filePath,
      title,
      tags,
      targetKind: target.kind,
      createdAt,
      openUri: buildFileObsidianUri(this.app.vault.getName(), filePath)
    };
  }

  private resolveDeviceCaptureTarget(request: DeviceCaptureRequest): { kind: "inboxFile" | "folderPath"; inboxFile?: string; folderPath?: string; stage?: Pick<WorkflowStageSettings, "id" | "title" | "tags"> } {
    const target = request.target;
    if (!target || target.kind === "inboxFile") {
      return {
        kind: "inboxFile",
        inboxFile: target?.inboxFile || this.settings.deviceCapture.inboxFile
      };
    }
    if (target.kind === "folderPath") {
      return {
        kind: "folderPath",
        folderPath: target.folderPath || this.settings.deviceCapture.targetFolders[0] || "00-Raw"
      };
    }
    if (target.kind === "stageId") {
      const stage = this.settings.workflowStages.stages.find((item) => item.id === target.stageId);
      const folderPath = stage?.folderPrefixes[0] || this.settings.deviceCapture.targetFolders[0] || "00-Raw";
      return {
        kind: "folderPath",
        folderPath,
        stage: stage ? { id: stage.id, title: stage.title, tags: stage.tags } : undefined
      };
    }
    return {
      kind: "inboxFile",
      inboxFile: this.settings.deviceCapture.inboxFile
    };
  }

  private async appendToMarkdownFile(filePath: string, entry: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing instanceof TFile) {
      await this.app.vault.process(existing, (content) => {
        const trimmed = content.replace(/\s+$/u, "");
        return `${trimmed}${trimmed ? "\n\n" : ""}${entry}\n`;
      });
      return;
    }
    await this.app.vault.create(filePath, `${entry}\n`);
  }

  private async ensureParentFolder(filePath: string): Promise<void> {
    const folder = filePath.split("/").slice(0, -1).join("/");
    if (folder) {
      await this.ensureFolderPath(folder);
    }
  }

  private async ensureFolderPath(folderPath: string): Promise<void> {
    const normalized = normalizeFolderPath(folderPath);
    if (!normalized) {
      return;
    }
    const parts = normalized.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) {
        continue;
      }
      if (existing) {
        throw new Error(`${current} already exists and is not a folder.`);
      }
      await this.app.vault.createFolder(current);
    }
  }

  private async uniqueCaptureFilePath(folderPath: string, title: string, createdAt: string): Promise<string> {
    const date = createdAt.replace(/[-:]/gu, "").replace(/\.\d+Z$/u, "Z").slice(0, 13);
    const slug = slugifyTitle(title) || "device-capture";
    const folder = normalizeFolderPath(folderPath);
    let index = 1;
    while (true) {
      const suffix = index === 1 ? "" : `-${index}`;
      const path = `${folder}/${date}-${slug}${suffix}.md`;
      if (!this.app.vault.getAbstractFileByPath(path)) {
        return path;
      }
      index += 1;
    }
  }

  private savedQuestionStates: Record<string, StoredQuestionState> = {};
  private pushState: PushRuntimeState = normalizePushRuntimeState();

  private async loadPluginData(): Promise<void> {
    const data = (await this.loadData()) as Partial<ToWriteSavedData> | null;
    this.settings = normalizeSettings(data?.settings);
    this.savedQuestionStates = data?.questionStates ?? {};
    this.pushState = normalizePushRuntimeState(data?.pushState);
  }

  private createUiApi(): ToWriteUiApi {
    return {
      getActiveFile: () => this.getActiveFile(),
      getActiveLineRange: () => this.getActiveLineRange(),
      getQuestions: (query = {}) => {
        if (query.scope === "active-file" && !query.filePath) {
          return [];
        }
        return this.store.query(query);
      },
      getArticleSummaries: () => this.store.getArticleSummaries(),
      getStatusOptions: () => this.settings.statusOptions,
      getLanguage: () => this.settings.language,
      getGroupCurrentByHeading: () => this.settings.groupCurrentByHeading,
      getCompactEditorDecorations: () => this.settings.compactEditorDecorations,
      getReminderPresets: () => this.settings.reminderPresets,
      getDefaultColor: (lane) => this.defaultColorForLane(lane),
      renderMarkdown: (markdown, element, sourcePath) => this.renderMarkdown(markdown, element, sourcePath),
      getLinkSuggestions: (query, sourcePath) => this.getLinkSuggestions(query, sourcePath),
      jumpToQuestion: (id) => this.jumpToQuestion(id),
      openFile: (filePath) => this.openFile(filePath),
      openObsidianLink: (linktext, sourcePath) => this.openObsidianLink(linktext, sourcePath),
      updateQuestion: async (id, patch) => {
        await this.updateQuestionFromUi(id, patch);
      },
      createQuestionFromSelection: (lane, color) => this.createQuestionFromSelection(lane, color),
      acceptSuggestion: (id) => this.acceptSuggestion(id),
      editQuestion: (id) => this.editQuestion(id),
      deleteQuestion: (id) => this.deleteQuestion(id),
      pinQuestionToBlock: (id) => this.pinQuestionToBlock(id),
      refreshAi: (id) => this.refreshAi(id),
      refreshIndex: () => this.refreshIndex(),
      exportNow: () => this.exportNow(true),
      toggleCompactEditorDecorations: () => this.setCompactEditorDecorations(!this.settings.compactEditorDecorations),
      subscribe: (listener) => this.subscribe(listener)
    };
  }

  refreshEditorDecorations(): void {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) {
        return;
      }
      const cm = (view.editor as unknown as { cm?: { dispatch: (transaction?: object) => void } }).cm;
      cm?.dispatch?.({});
    });
  }

  private async activateSidebar(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(TOWRITE_SIDEBAR_VIEW)[0];
    if (existing) {
      this.app.workspace.setActiveLeaf(existing, { focus: true });
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      return;
    }

    await leaf.setViewState({ type: TOWRITE_SIDEBAR_VIEW, active: true });
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  private async activateDashboard(): Promise<void> {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: TOWRITE_DASHBOARD_VIEW, active: true });
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  private registerEvents(): void {
    const reindexFile = debounce((file: TFile) => {
      void this.indexer.indexFile(file).then(async () => {
        await this.refreshSidecars({ rebuildWorkflow: false });
        this.store.notify();
        this.scheduleBackgroundRefresh();
        return undefined;
      });
    }, 900, true);
    const notifyActiveLineChange = debounce(() => {
      this.store.notify();
    }, 120, true);

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          reindexFile(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          reindexFile(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.handleDeletedFile(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.indexer.removeFile(oldPath);
        if (file instanceof TFile && file.extension === "md") {
          reindexFile(file);
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.aiService.refreshMissingForActiveNote(this.getActiveFile());
        this.store.notify();
      })
    );

    this.registerDomEvent(activeDocument, "keyup", () => {
      notifyActiveLineChange();
    });
    this.registerDomEvent(activeDocument, "mouseup", () => {
      notifyActiveLineChange();
    });
  }

  private handleDeletedFile(file: TAbstractFile): void {
    if (file instanceof TFile && file.extension === "md") {
      this.indexer.removeFile(file.path);
      void this.localKnowledgeIndex.rebuild(this.app, this.settings.exportDirectory).then(async () => {
        await this.workflowIndex.rebuild();
        if (this.settings.autoExport) {
          await this.exportNow(false);
        }
        this.store.notify();
      });
    }
  }

  private openAddQuestionModal(
    editor: Editor,
    file: TFile
  ): void {
    void this.createQuestionFromEditor(editor, file, "think");
  }

  private async createQuestionFromSelection(lane: OpenQuestionLane, color?: OpenQuestionColor): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.file) {
      await this.createQuestionFromEditor(view.editor, view.file, lane, color);
      return;
    }

    const file = this.app.workspace.getActiveFile();
    if (file?.extension === "pdf") {
      await this.createQuestionFromPdfSelection(file, lane, color);
      return;
    }

    new Notice("Select text in a Markdown note or PDF first.");
  }

  private async createQuestionFromEditor(
    editor: Editor,
    file: TFile,
    lane: OpenQuestionLane,
    color?: OpenQuestionColor
  ): Promise<void> {
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    const lineFallback = editor.getLine(from.line);
    const hasSelection = from.line !== to.line || from.ch !== to.ch;
    const startPos = hasSelection ? from : { line: from.line, ch: 0 };
    const endPos = hasSelection ? to : { line: from.line, ch: lineFallback.length };
    const content = editor.getValue();
    const startOffset = editor.posToOffset(startPos);
    const endOffset = editor.posToOffset(endPos);
    const selectedText = content.slice(startOffset, endOffset).trim() || lineFallback.trim();
    if (!selectedText) {
      new Notice("Select text or place the cursor on a line first.");
      return;
    }
    const anchor = createQuestionAnchor(content, startOffset, endOffset);
    const lineRange = lineRangeForOffsets(content, startOffset, endOffset);
    const id = makeQuestionId(file.path, lineRange.lineStart, `${lane}:${selectedText}`);
    const now = new Date().toISOString();
    const question: OpenQuestion = {
      id,
      lane,
      status: "open",
      kind: lane === "write" ? "todo" : "other",
      tags: [],
      color: color ?? this.defaultColorForLane(lane),
      title: defaultTitleFromBody(selectedText),
      question: selectedText,
      anchorText: selectedText,
      anchor,
      source: {
        file: file.path,
        headingPath: this.headingPathForLine(file, lineRange.lineStart),
        lineStart: lineRange.lineStart,
        lineEnd: lineRange.lineEnd,
        rule: "selection"
      },
      contextSummary: selectedText.slice(0, 220),
      createdAt: now,
      updatedAt: now
    };

    await this.sidecars.upsert(question);
    await this.refreshSidecars();
    await this.savePluginData();
    if (this.settings.autoExport) {
      await this.exportNow(false);
    }
    new Notice(lane === "write" ? "ToWrite saved." : "ToThink saved.");
  }

  private async createQuestionFromPdfSelection(
    file: TFile,
    lane: OpenQuestionLane,
    color?: OpenQuestionColor
  ): Promise<void> {
    const selectedText = activeWindow.getSelection()?.toString().trim() ?? "";
    if (!selectedText) {
      new Notice("Select text in the PDF first.");
      return;
    }

    const pdfAnchor = pdfAnchorFromCurrentSelection();
    if (!pdfAnchor) {
      new Notice("ToWrite could not locate the selected PDF text. Select the text again and try once more.");
      return;
    }

    const page = pdfAnchor.pageNumber;
    const id = makeQuestionId(file.path, page, `${lane}:pdf:${selectedText}`);
    const now = new Date().toISOString();
    const question: OpenQuestion = {
      id,
      lane,
      status: "open",
      kind: lane === "write" ? "todo" : "evidence",
      tags: ["pdf"],
      color: color ?? this.defaultColorForLane(lane),
      title: defaultTitleFromBody(selectedText),
      question: selectedText,
      anchorText: selectedText,
      source: {
        file: file.path,
        headingPath: [file.basename],
        lineStart: 0,
        lineEnd: 0,
        page,
        pdfAnchor,
        rule: "selection"
      },
      contextSummary: page ? `PDF page ${page}: ${selectedText.slice(0, 200)}` : selectedText.slice(0, 220),
      createdAt: now,
      updatedAt: now
    };

    await this.sidecars.upsert(question);
    await this.refreshSidecars();
    await this.savePluginData();
    if (this.settings.autoExport) {
      await this.exportNow(false);
    }
    new Notice(lane === "write" ? "PDF ToWrite saved." : "PDF ToThink saved.");
  }

  private async acceptSuggestion(id: string): Promise<void> {
    const suggestion = this.store.getSuggestion(id);
    if (!suggestion) {
      new Notice("ToWrite suggestion not found.");
      return;
    }

    const now = new Date().toISOString();
    const question: OpenQuestion = {
      id: suggestion.id,
      lane: suggestion.lane,
      status: "open",
      kind: suggestion.kind,
      tags: suggestion.tags,
      color: suggestion.color,
      title: defaultTitleFromBody(suggestion.question),
      question: suggestion.question,
      anchorText: suggestion.anchorText,
      source: suggestion.source,
      contextSummary: suggestion.contextSummary,
      createdAt: now,
      updatedAt: now
    };

    await this.sidecars.upsert(question);
    await this.refreshSidecars();
    await this.savePluginData();
    if (this.settings.autoExport) {
      await this.exportNow(false);
    }
    this.store.notify();
    new Notice(suggestion.lane === "write" ? "Added to ToWrite." : "Added to ToThink.");
  }

  private async ignoreSuggestion(id: string): Promise<void> {
    const suggestion = this.store.getSuggestion(id);
    if (!suggestion) {
      new Notice("ToWrite suggestion not found.");
      return;
    }

    this.store.patchQuestion(id, {
      status: "ignored",
      lane: suggestion.lane,
      kind: suggestion.kind,
      tags: suggestion.tags,
      color: suggestion.color,
      question: suggestion.question,
      anchorText: suggestion.anchorText,
      createdAt: new Date().toISOString()
    });
    await this.savePluginData();
    this.store.notify();
    new Notice("ToWrite suggestion ignored.");
  }

  private async editQuestion(id: string): Promise<void> {
    const question = this.store.getQuestion(id);
    if (!question) {
      new Notice("ToWrite question not found.");
      return;
    }

    new AddQuestionModal(this.app, (result) => {
      void this.applyQuestionModalEdit(question, result).catch((error) => {
        console.error("Failed to update ToWrite question from modal", error);
        new Notice("Failed to update ToWrite question.");
      });
    }, {
      title: question.title,
      lane: question.lane,
      question: question.question,
      note: question.note,
      kind: question.kind,
      priority: question.priority,
      tags: question.tags,
      color: question.color,
      status: question.status
    }, {
      language: this.settings.language,
      mode: "edit"
    }).open();
  }

  private async applyQuestionModalEdit(question: OpenQuestion, result: {
    title?: string;
    lane: OpenQuestionLane;
    question: string;
    note?: string;
    kind: OpenQuestion["kind"];
    priority?: OpenQuestion["priority"];
    tags: string[];
    color: OpenQuestionColor;
    status: OpenQuestion["status"];
  }): Promise<void> {
    const updated: OpenQuestion = {
      ...question,
      title: result.title,
      lane: result.lane,
      question: result.question,
      note: result.note,
      kind: result.kind,
      priority: result.priority,
      tags: result.tags,
      color: result.color,
      status: result.status,
      updatedAt: new Date().toISOString()
    };

    if (question.source.rule === "selection") {
      await this.sidecars.upsert(updated);
      await this.refreshSidecars();
    } else {
      this.store.patchQuestion(question.id, {
        title: updated.title,
        lane: updated.lane,
        question: updated.question,
        note: updated.note,
        kind: updated.kind,
        priority: updated.priority,
        tags: updated.tags,
        color: updated.color,
        status: updated.status
      });
    }

    await this.savePluginData();
    if (this.settings.autoExport) {
      await this.exportNow(false);
    }
  }

  private async updateQuestionFromUi(id: string, patch: Omit<Partial<StoredQuestionState>, "id">): Promise<void> {
    const question = this.store.getQuestion(id);
    if (!question) {
      return;
    }

    if (this.store.isSidecarQuestion(id)) {
      await this.sidecars.upsert({
        ...question,
        ...patch,
        updatedAt: new Date().toISOString()
      });
      await this.refreshSidecars();
    } else {
      this.store.patchQuestion(id, patch);
    }

    await this.savePluginData();
    if (this.settings.autoExport) {
      await this.exportNow(false);
    }
  }

  private async deleteQuestion(id: string): Promise<void> {
    const question = this.store.getQuestion(id);
    if (!question) {
      new Notice("ToWrite question not found.");
      return;
    }

    if (this.store.isSidecarQuestion(id)) {
      await this.sidecars.remove(question);
      await this.refreshSidecars();
      if (question.source.rule === "candidate") {
        this.store.patchQuestion(id, { status: "ignored" });
      }
    } else {
      this.store.patchQuestion(id, { status: "ignored" });
    }

    await this.savePluginData();
    if (this.settings.autoExport) {
      await this.exportNow(false);
    }
    new Notice("Question removed.");
  }

  private async pinQuestionToBlock(id: string): Promise<void> {
    const question = this.store.getQuestion(id);
    if (!question) {
      new Notice("ToWrite question not found.");
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(question.source.file);
    if (!(file instanceof TFile)) {
      new Notice("ToWrite could not find the source note.");
      return;
    }
    if (file.extension !== "md") {
      new Notice("Block ids can only be pinned in Markdown notes.");
      return;
    }

    const blockId = question.source.blockId ?? question.id;
    await this.app.vault.process(file, (content) => {
      const lines = content.replace(/\r\n?/gu, "\n").split("\n");
      const lineIndex = Math.max(0, Math.min(question.source.lineEnd, lines.length - 1));
      if (new RegExp(`\\^${escapeRegExp(blockId)}(?:\\s|$)`, "u").test(lines[lineIndex])) {
        return content;
      }
      lines[lineIndex] = `${lines[lineIndex]} ^${blockId}`;
      return lines.join("\n");
    });

    if (question.source.rule === "selection") {
      await this.sidecars.upsert({
        ...question,
        source: {
          ...question.source,
          blockId
        }
      });
      await this.refreshSidecars();
    }

    new Notice("ToWrite source anchor pinned.");
  }

  private async refreshSidecars(options: { rebuildWorkflow?: boolean } = {}): Promise<void> {
    const questions = await this.sidecars.refreshResolvedQuestions();
    this.store.replaceAllSidecarQuestions(questions);
    if (options.rebuildWorkflow !== false) {
      await this.workflowIndex?.rebuild();
    }
  }

  private headingPathForLine(file: TFile, line: number): string[] {
    const headings = this.app.metadataCache.getFileCache(file)?.headings ?? [];
    const stack: Array<{ level: number; heading: string }> = [];

    for (const heading of headings) {
      if (heading.position.start.line > line) {
        break;
      }
      while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
        stack.pop();
      }
      stack.push({ level: heading.level, heading: heading.heading });
    }

    return stack.map((heading) => heading.heading);
  }

  private defaultColorForLane(lane: OpenQuestionLane): OpenQuestionColor {
    return lane === "write" ? this.settings.defaultWriteColor : this.settings.defaultThinkColor;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function normalizeSettings(settings?: Partial<ToWriteSettings>): ToWriteSettings {
  const candidateTriggerWords = Array.isArray(settings?.candidateTriggerWords)
    ? settings.candidateTriggerWords.map((word) => word.trim()).filter(Boolean)
    : DEFAULT_SETTINGS.candidateTriggerWords;
  const statusOptions = Array.isArray(settings?.statusOptions) && settings.statusOptions.length > 0
    ? mergeStatusOptions(settings.statusOptions)
    : DEFAULT_STATUS_OPTIONS;

  const quote0 = ensureQuote0NfcToken(normalizeQuote0Settings(settings?.quote0));
  return {
    ...DEFAULT_SETTINGS,
    ...(settings ?? {}),
    language: settings?.language === "en" ? "en" : "zh",
    compactEditorDecorations: settings?.compactEditorDecorations === true,
    candidateTriggerWords,
    statusOptions,
    defaultThinkColor: isQuestionColor(settings?.defaultThinkColor) ? settings.defaultThinkColor : DEFAULT_SETTINGS.defaultThinkColor,
    defaultWriteColor: isQuestionColor(settings?.defaultWriteColor) ? settings.defaultWriteColor : DEFAULT_SETTINGS.defaultWriteColor,
    externalApi: normalizeExternalApiSettings(settings?.externalApi),
    deviceCapture: normalizeDeviceCaptureSettings(settings?.deviceCapture),
    deviceProfiles: normalizeDeviceProfiles(settings?.deviceProfiles),
    workflowStages: normalizeWorkflowStages(settings?.workflowStages),
    reminderPresets: normalizeReminderPresets(settings?.reminderPresets),
    ai: {
      ...DEFAULT_SETTINGS.ai,
      ...(settings?.ai ?? {})
    },
    quote0,
    push: normalizePushSettings(settings?.push, quote0)
  };
}

function normalizeDeviceCaptureSettings(settings?: Partial<ToWriteSettings["deviceCapture"]>): ToWriteSettings["deviceCapture"] {
  return {
    enabled: settings?.enabled !== false,
    inboxFile: normalizeCaptureFilePath(settings?.inboxFile || DEFAULT_SETTINGS.deviceCapture.inboxFile),
    targetFolders: normalizeWorkflowList(settings?.targetFolders).length > 0
      ? normalizeWorkflowList(settings?.targetFolders)
      : DEFAULT_SETTINGS.deviceCapture.targetFolders,
    defaultTags: normalizeCaptureTags(settings?.defaultTags ?? DEFAULT_SETTINGS.deviceCapture.defaultTags)
  };
}

function normalizeWorkflowStages(settings?: Partial<ToWriteSettings["workflowStages"]>): ToWriteSettings["workflowStages"] {
  const stages = Array.isArray(settings?.stages) && settings.stages.length > 0
    ? settings.stages
    : DEFAULT_WORKFLOW_STAGES;

  return {
    enabled: settings?.enabled === true,
    stages: normalizeWorkflowStageList(stages)
  };
}

function normalizeWorkflowStageList(stages: WorkflowStageSettings[]): WorkflowStageSettings[] {
  const seen = new Set<string>();
  const output: WorkflowStageSettings[] = [];

  for (const stage of stages) {
    const id = normalizeStageId(stage.id);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    output.push({
      id,
      title: stage.title?.trim() || id,
      description: stage.description?.trim() || "",
      color: isQuestionColor(stage.color) ? stage.color : "slate",
      folderPrefixes: normalizeWorkflowList(stage.folderPrefixes),
      tags: normalizeWorkflowList(stage.tags).map((tag) => tag.replace(/^#+/u, "").toLowerCase()),
      limit: clampNumber(stage.limit, 1, 200, 20),
      staleAfterDays: clampNumber(stage.staleAfterDays, 0, 3650, 0)
    });
  }

  return output;
}

function normalizeWorkflowList(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values ?? []) {
    const normalized = String(value).trim().replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function normalizeStageId(value: string): string {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9_-]/gu, "");
}

function normalizeExternalApiSettings(settings?: Partial<ToWriteSettings["externalApi"]>): ToWriteSettings["externalApi"] {
  const port = Number(settings?.port);
  const bindHost = normalizeExternalApiBindHost(settings?.bindHost);
  return {
    ...DEFAULT_SETTINGS.externalApi,
    ...(settings ?? {}),
    bindHost,
    port: Number.isInteger(port) ? Math.max(1024, Math.min(65535, port)) : DEFAULT_SETTINGS.externalApi.port,
    token: settings?.token?.trim() || createExternalApiToken(),
    allowQueryTokenForRead: settings?.allowQueryTokenForRead !== false,
    publicBaseUrl: normalizeExternalApiPublicBaseUrl(settings?.publicBaseUrl)
  };
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function createExternalQuestionNote(text?: string, clientId?: string): OpenQuestionNote | undefined {
  const trimmed = text?.trim();
  if (!trimmed) {
    return undefined;
  }

  return {
    id: `oqn_${randomTokenFragment()}`,
    kind: "text",
    text: trimmed.slice(0, 4000),
    source: "api",
    clientId: clientId?.trim().slice(0, 80) || undefined,
    createdAt: new Date().toISOString()
  };
}

function createExternalApiToken(): string {
  return `tw_${randomTokenFragment()}_${randomTokenFragment()}`;
}

function createQuote0NfcToken(): string {
  return `q0_${randomTokenFragment()}_${randomTokenFragment()}`;
}

function ensureQuote0NfcToken(settings: ToWriteSettings["quote0"]): ToWriteSettings["quote0"] {
  if (settings.nfcToken) {
    return settings;
  }
  return {
    ...settings,
    nfcToken: createQuote0NfcToken()
  };
}

function randomTokenFragment(): string {
  return activeWindow.crypto?.randomUUID?.().replace(/-/gu, "") ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function defaultTitleFromBody(body: string): string {
  const compact = body.replace(/\s+/gu, " ").trim();
  if (compact.length <= 32) {
    return compact;
  }
  return `${compact.slice(0, 32)}...`;
}

function normalizeCaptureFilePath(value: string): string {
  const normalized = normalizeVaultPath(value || DEFAULT_SETTINGS.deviceCapture.inboxFile);
  const withExtension = normalized.toLowerCase().endsWith(".md") ? normalized : `${normalized}.md`;
  return withExtension || DEFAULT_SETTINGS.deviceCapture.inboxFile;
}

function normalizeFolderPath(value: string): string {
  return normalizeVaultPath(value).replace(/\.md$/iu, "");
}

function normalizeVaultPath(value: string): string {
  return String(value)
    .trim()
    .replace(/\\/gu, "/")
    .replace(/^\/+|\/+$/gu, "")
    .replace(/\/{2,}/gu, "/")
    .split("/")
    .map((part) => part.trim().replace(/[\\:*?"<>|]/gu, "-"))
    .filter(Boolean)
    .join("/");
}

function normalizeCaptureTags(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const tag = String(value)
      .replace(/^#+/u, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/gu, "-");
    if (!tag || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    output.push(tag);
  }
  return output.slice(0, 20);
}

function formatInboxCaptureEntry(options: {
  title: string;
  text: string;
  tags: string[];
  createdAt: string;
  clientId?: string;
}): string {
  const tagLine = options.tags.length > 0 ? `\n${options.tags.map((tag) => `#${tag}`).join(" ")}` : "";
  const clientLine = options.clientId ? `\nsource_client: ${options.clientId.trim().slice(0, 80)}` : "";
  return [
    `## ${options.title}`,
    "",
    `created: ${options.createdAt}`,
    "source: device",
    `${clientLine}${tagLine}`.trim(),
    "",
    options.text.trim()
  ].filter((part) => part !== "").join("\n");
}

function formatCaptureNote(options: {
  title: string;
  text: string;
  tags: string[];
  createdAt: string;
  clientId?: string;
  workflowStage?: Pick<WorkflowStageSettings, "id" | "title">;
}): string {
  const frontmatter = [
    "---",
    `title: ${yamlString(options.title)}`,
    "source: device",
    `created: ${options.createdAt}`,
    ...(options.clientId ? [`source_client: ${yamlString(options.clientId.trim().slice(0, 80))}`] : []),
    ...(options.workflowStage ? [
      `workflow_stage: ${yamlString(options.workflowStage.id)}`,
      `workflow_stage_title: ${yamlString(options.workflowStage.title)}`,
      `workflow_status: ${yamlString(options.workflowStage.id)}`
    ] : []),
    "tags:",
    ...(options.tags.length > 0 ? options.tags.map((tag) => `  - ${yamlString(tag)}`) : ["  - capture"]),
    "---"
  ];
  return [
    frontmatter.join("\n"),
    "",
    `# ${options.title}`,
    "",
    options.text.trim(),
    ""
  ].join("\n");
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function slugifyTitle(title: string): string {
  return Array.from(title.trim().toLowerCase())
    .map((char) => /[\p{Letter}\p{Number}]/u.test(char) ? char : "-")
    .join("")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 48);
}

function buildFileObsidianUri(vaultName: string, filePath: string): string {
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(filePath)}`;
}

function isQuestionColor(value: unknown): value is OpenQuestionColor {
  return value === "amber"
    || value === "mint"
    || value === "sky"
    || value === "rose"
    || value === "violet"
    || value === "slate";
}

function mergeStatusOptions(options: ToWriteSettings["statusOptions"]): ToWriteSettings["statusOptions"] {
  const seen = new Set<string>();
  const output: ToWriteSettings["statusOptions"] = [];

  for (const option of [...DEFAULT_STATUS_OPTIONS, ...options]) {
    const id = String(option.id).trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    output.push({
      id,
      label: option.label?.trim() || id
    });
  }

  return output;
}
