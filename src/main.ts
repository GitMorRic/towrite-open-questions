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
  normalizeArticleTypesSettings,
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
import type { AiConnectionResult, AiModelInfo } from "./ai/types";
import {
  EMPTY_AI_ASSISTANT_STATE,
  createAiAssistantMessage,
  normalizeAiAssistantState,
  type AiAssistantChoiceInteraction,
  type AiAssistantMode,
  type AiAssistantState
} from "./ai/chat";
import {
  ASK_USER_CHOICE_TOOL,
  BACKEND_CHOICE_INSTRUCTION,
  choiceFollowUpText,
  parseBackendInteraction,
  parseDirectInteraction
} from "./ai/interaction";
import { AiQuestionService } from "./ai/service";
import { BackendEnhancementClient } from "./backend/client";
import {
  CAPTURE_SCHEMA_VERSION,
  CaptureConflictError,
  CaptureService,
  CaptureTargetRecommender,
  captureRecommendationSettingsFromPluginSettings,
  captureServiceOptionsFromPluginSettings,
  type CaptureCommitResult,
  type CaptureDraft,
  type CaptureIntent,
  type CaptureTargetCandidate
} from "./capture";
import { QuestionExporter } from "./export/exporter";
import { ToWriteExternalApiServer, type DeviceCaptureRequest, type DeviceCaptureResult, type DeviceWritebackMetadata } from "./external/server";
import { PushEngine } from "./push/engine";
import { normalizePushRuntimeState, type PushAnchorInput, type PushFeedbackInput } from "./push/state";
import type { PushFeedPayload, PushRuntimeState } from "./push/types";
import {
  HabitLearningService,
  migrateManualPushHabits,
  type HabitCandidate,
  type HabitLearningState,
  type NewActivityEvent
} from "./learning";
import {
  SuggestionService,
  type ProactiveSuggestion,
  type ProactiveSuggestionAction,
  type SuggestionNotificationEvent
} from "./suggestions";
import { Quote0SyncService, type Quote0SyncPreview, type Quote0SyncResult } from "./quote0/sync-service";
import type { Quote0Device, Quote0DeviceStatus } from "./quote0/client";
import { WorkflowIndex } from "./workflow";
import { createQuestionDecorations } from "./obsidian/decorations";
import { OpenQuestionIndexer } from "./obsidian/indexer";
import { jumpToQuestion as jumpToQuestionInWorkspace } from "./obsidian/jump";
import { AddQuestionModal } from "./obsidian/modal";
import { CaptureModal } from "./obsidian/capture-modal";
import { AiAssistantModal } from "./obsidian/ai-assistant-modal";
import { PdfQuestionLayer, pdfAnchorFromCurrentSelection } from "./obsidian/pdf-layer";
import { SelectionQuestionToolbar } from "./obsidian/selection-toolbar";
import { ToWriteSettingTab } from "./obsidian/settings-tab";
import { QuestionSidecarRepository } from "./obsidian/sidecar";
import { writeVaultDataText } from "./obsidian/vault-data";
import {
  TOWRITE_DASHBOARD_VIEW,
  TOWRITE_SIDEBAR_VIEW,
  ToWriteDashboardItemView,
  ToWriteSidebarItemView
} from "./obsidian/views";
import type { ActiveLineRange, LinkSuggestion, ToWriteUiApi } from "./ui/api";
import type { CaptureModalSubmitRequest, CaptureModalSubmitResult } from "./ui/capture-modal-types";
import type {
  AiAssistantCatalog,
  AiAssistantContextPreview,
  AiAssistantSendRequest
} from "./ui/ai-assistant-types";

interface CaptureLaunchOptions {
  intent?: CaptureIntent;
  body?: string;
  sourceFile?: string;
  headingPath?: string[];
  selection?: string;
  questionId?: string;
  entryPoint?: string;
}

export default class ToWritePlugin extends Plugin {
  settings: ToWriteSettings = { ...DEFAULT_SETTINGS };
  private store!: OpenQuestionStore;
  private indexer!: OpenQuestionIndexer;
  private sidecars!: QuestionSidecarRepository;
  private exporter!: QuestionExporter;
  private workflowIndex!: WorkflowIndex;
  private localKnowledgeIndex!: LocalKnowledgeIndex;
  private aiService!: AiQuestionService;
  private aiProvider!: OpenAiCompatibleProvider;
  private aiAssistantState: AiAssistantState = { ...EMPTY_AI_ASSISTANT_STATE };
  private aiAssistantMode: AiAssistantMode = "direct";
  private backendClient!: BackendEnhancementClient;
  private captureService!: CaptureService;
  private captureRecommender!: CaptureTargetRecommender;
  private externalApiServer!: ToWriteExternalApiServer;
  private pushEngine!: PushEngine;
  private quote0SyncService!: Quote0SyncService;
  private learningService!: HabitLearningService;
  private suggestionService!: SuggestionService;
  private uiApi!: ToWriteUiApi;
  private selectionToolbar?: SelectionQuestionToolbar;
  private pdfQuestionLayer?: PdfQuestionLayer;
  private backgroundRefreshTimer = 0;
  private backgroundRefreshRunning = false;
  private backgroundRefreshQueued = false;
  private readonly lastLearningEditPresence = new Map<string, number>();
  private readonly captureSuggestedTargets = new Map<string, string>();
  private readonly captureCommittedCandidates = new Map<string, CaptureTargetCandidate>();
  private readonly habitBackendRequests = new Set<string>();
  private suggestionNotifications: SuggestionNotificationEvent[] = [];
  private snoozedSuggestions: Record<string, string> = {};
  private securityMigrationVersion = 0;
  private showQueryTokenMigrationNotice = false;
  private lastCaptureTargetCatalogJson = "";

  async onload(): Promise<void> {
    await this.loadPluginData();

    this.store = new OpenQuestionStore(this.savedQuestionStates);
    this.learningService = new HabitLearningService(this.savedLearningState);
    this.learningService.setCollectionPaused(!this.settings.learning.enabled);
    this.suggestionService = new SuggestionService();
    this.indexer = new OpenQuestionIndexer(this.app, this.store, () => this.settings);
    this.sidecars = new QuestionSidecarRepository(this.app, () => this.settings);
    this.workflowIndex = new WorkflowIndex(
      this.app,
      () => this.settings.workflowStages,
      () => this.settings.articleTypes,
      () => this.settings.exportDirectory,
      () => this.store.getAllQuestions()
    );
    this.exporter = new QuestionExporter(this.app, this.store, () => this.settings, () => this.workflowIndex.getPayload());
    this.localKnowledgeIndex = new LocalKnowledgeIndex();
    this.backendClient = new BackendEnhancementClient(() => this.settings.backend);
    this.captureRecommender = new CaptureTargetRecommender(
      this.app,
      this.captureRecommendationSettings(),
      this.localKnowledgeIndex
    );
    this.captureService = new CaptureService(
      this.app,
      captureServiceOptionsFromPluginSettings(this.settings, {
        onVaultChanged: (path, operation) => this.onCaptureVaultChanged(path, operation)
      })
    );
    this.aiProvider = new OpenAiCompatibleProvider(() => this.settings.ai);
    this.aiService = new AiQuestionService({
      app: this.app,
      store: this.store,
      localIndex: this.localKnowledgeIndex,
      provider: this.aiProvider,
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
      getRestrictedAccessTokens: () => this.settings.push.targets.map((target) => target.token).filter(Boolean),
      getPushTargets: () => this.settings.push.targets,
      getPushFeed: (targetId) => this.getPushFeed(targetId),
      recordPushFeedback: (input) => this.recordPushFeedback(input),
      recordContextAnchor: (input) => this.recordContextAnchor(input),
      getStatusOptions: () => this.settings.statusOptions,
      updateQuestionStatus: (id, status, note, clientId) => this.updateQuestionStatusFromExternal(id, status, note, clientId),
      appendQuestionNote: (id, text, clientId, metadata) => this.appendQuestionNoteFromExternal(id, text, clientId, metadata),
      updateQuestionFields: (id, patch) => this.updateQuestionFieldsFromExternal(id, patch),
      recommendCapture: (draft) => this.recommendCaptureTargets(draft),
      createDeviceCapture: (request) => this.createDeviceCaptureFromExternal(request),
      undoCapture: async (captureId, undoToken) => {
        return this.captureService.undo(undoToken, captureId);
      },
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
      },
      onCapture: (selectedText) => {
        const file = this.app.workspace.getActiveFile();
        this.openCaptureModal({
          intent: "selection",
          body: selectedText,
          selection: selectedText,
          sourceFile: file?.path,
          entryPoint: "selection"
        });
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
    this.addRibbonIcon("square-pen", "Open smart capture", () => {
      this.openCaptureModal({ entryPoint: "ribbon" });
    });
    this.addRibbonIcon("bot", "Open ToWrite AI assistant", () => {
      this.openAiAssistant();
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
      id: "open-smart-capture",
      name: "Open smart capture",
      callback: () => {
        this.openCaptureModal({ entryPoint: "command" });
      }
    });

    this.addCommand({
      id: "open-ai-assistant",
      name: "Open AI assistant",
      callback: () => {
        this.openAiAssistant();
      }
    });

    this.addCommand({
      id: "capture-selection-to-note",
      name: "Capture selection to a note or folder",
      editorCallback: (editor, view) => {
        const file = view.file;
        if (!file) {
          new Notice("ToWrite needs an active Markdown file.");
          return;
        }
        const selection = editor.getSelection().trim();
        if (!selection) {
          new Notice("Select some text first.");
          return;
        }
        this.openCaptureModal({
          intent: "selection",
          body: selection,
          selection,
          sourceFile: file.path,
          headingPath: this.headingPathForLine(file, editor.getCursor("from").line),
          entryPoint: "selection"
        });
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
          onDeleteQuestion: (id) => this.deleteQuestion(id),
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
    this.registerInterval(window.setInterval(() => {
      void this.runSuggestionNotifications();
    }, 15 * 60 * 1000));
    void this.configureExternalApiServer(false);
    this.configureQuote0Sync();

    this.app.workspace.onLayoutReady(() => {
      void this.refreshIndex();
      if (this.settings.autoOpenSidebar) {
        window.setTimeout(() => {
          void this.activateSidebar();
        }, 250);
      }
      void this.runSuggestionNotifications();
    });
    if (this.securityMigrationVersion < 1) {
      this.securityMigrationVersion = 1;
      await this.savePluginData();
    }
    if (this.showQueryTokenMigrationNotice) {
      new Notice("ToWrite disabled External API query-token reads during the security upgrade. Re-enable them explicitly in Advanced API settings only if a restricted device flow requires it.", 12000);
    }
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

  openCaptureModal(options: CaptureLaunchOptions = {}): void {
    if (!this.settings.deviceCapture.enabled) {
      new Notice("Smart capture is disabled in ToWrite settings.");
      return;
    }
    this.refreshCaptureConfiguration();
    const sourceFile = options.sourceFile ?? this.getActiveFile() ?? undefined;
    const question = options.questionId ? this.store.getQuestion(options.questionId) : undefined;
    const intent = options.intent ?? (question ? "answer" : options.selection ? "selection" : "new");
    const sourceLearningContext = sourceFile ? this.learningContextForFile(sourceFile) : {};
    const draft: CaptureDraft = {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      id: `capture_${randomTokenFragment()}`,
      intent,
      body: options.body ?? (intent === "selection" ? options.selection ?? "" : ""),
      tags: [],
      links: [],
      source: sourceFile || options.questionId || options.selection ? {
        file: sourceFile,
        headingPath: options.headingPath,
        selection: options.selection,
        questionId: options.questionId,
        entryPoint: options.entryPoint ?? "command",
        ...sourceLearningContext
      } : undefined,
      createdAt: new Date().toISOString()
    };

    const modal = new CaptureModal(this.app, {
      draft,
      language: this.settings.language,
      context: {
        sourceLabel: sourceFile ? "Obsidian" : undefined,
        sourceFile,
        headingPath: options.headingPath,
        selection: options.selection,
        questionId: question?.id,
        questionTitle: question?.title || question?.question,
        questionText: question?.question
      },
      initialCandidates: [],
      callbacks: {
        recommend: async (currentDraft, signal, publishUpdate) => {
          const local = await this.recommendCaptureTargets(currentDraft);
          if (signal.aborted) {
            return local;
          }
          this.captureSuggestedTargets.set(currentDraft.id, local[0]?.id ?? "");
          if (this.settings.backend.enabled && this.settings.backend.useForRecommendations) {
            void this.backendClient.rerankTargets(currentDraft, local).then((enhanced) => {
              if (!signal.aborted) {
                this.captureSuggestedTargets.set(currentDraft.id, enhanced[0]?.id ?? local[0]?.id ?? "");
                publishUpdate(enhanced);
              }
            }).catch(() => undefined);
          }
          return local;
        },
        preview: async (currentDraft, candidate) => {
          this.refreshCaptureConfiguration();
          return this.captureService.preview(currentDraft, candidate);
        },
        submit: (request) => this.submitCaptureModal(request),
        openResult: async (result) => {
          if (result.capture?.finalPath) {
            await this.openFile(result.capture.finalPath);
          }
        },
        undoResult: async (result) => {
          const capture = result.capture;
          if (!capture?.undoToken) {
            return;
          }
          const undone = await this.captureService.undo(capture.undoToken);
          if (!undone.undone) {
            new Notice("The capture was already removed.");
            return;
          }
          const candidate = this.captureCommittedCandidates.get(capture.captureId);
          if (candidate) {
            await this.recordCaptureRouteLearning(draft, candidate, "undone");
          }
          new Notice("Capture undone.");
        }
      },
      onClosed: () => {
        this.captureSuggestedTargets.delete(draft.id);
      }
    });
    modal.open();
  }

  openCaptureForQuestion(questionId: string): void {
    const question = this.store.getQuestion(questionId);
    if (!question) {
      new Notice("ToWrite question not found.");
      return;
    }
    this.openCaptureModal({
      intent: "answer",
      sourceFile: question.source.file,
      headingPath: question.source.headingPath,
      questionId,
      entryPoint: "question-card"
    });
  }

  private refreshCaptureConfiguration(): void {
    this.captureRecommender.updateSettings(this.captureRecommendationSettings());
    this.captureService.updateOptions(captureServiceOptionsFromPluginSettings(this.settings, {
      onVaultChanged: (path, operation) => this.onCaptureVaultChanged(path, operation)
    }));
  }

  private captureRecommendationSettings() {
    const base = captureRecommendationSettingsFromPluginSettings(this.settings);
    const confirmedRoutes = this.learningService.getAcceptedHabits()
      .filter((habit) => habit.rule.kind === "routing")
      .map((habit) => habit.rule.kind === "routing" ? {
        targetId: habit.rule.targetId,
        context: { ...habit.rule.context }
      } : undefined)
      .filter((route): route is NonNullable<typeof route> => Boolean(route));
    return { ...base, confirmedRoutes };
  }

  private async recommendCaptureTargets(draft: CaptureDraft): Promise<CaptureTargetCandidate[]> {
    this.refreshCaptureConfiguration();
    return this.captureRecommender.recommendCandidates(draft);
  }

  private async submitCaptureModal(request: CaptureModalSubmitRequest): Promise<CaptureModalSubmitResult> {
    const { draft, candidate, preview, archiveAnswer } = request;
    if (draft.intent === "answer" && (!draft.source?.questionId || !this.store.getQuestion(draft.source.questionId))) {
      throw new Error("The source question no longer exists.");
    }
    let capture: CaptureCommitResult | undefined;
    if (draft.intent !== "answer" || archiveAnswer) {
      if (!candidate) {
        throw new Error("Choose a capture destination before saving.");
      }
      this.refreshCaptureConfiguration();
      const currentCandidates = await this.recommendCaptureTargets(draft);
      const currentCandidate = currentCandidates.find((item) => item.id === candidate.id);
      if (!currentCandidate
        || currentCandidate.path !== candidate.path
        || currentCandidate.action !== candidate.action
        || currentCandidate.kind !== candidate.kind) {
        throw new CaptureConflictError("target-changed", "The selected capture target is no longer authorized. Refresh recommendations before saving.");
      }
      const targetRevision = request.targetRevision ?? preview?.targetRevision ?? candidate.targetRevision;
      if (currentCandidate.action === "create" && targetRevision !== currentCandidate.targetRevision) {
        throw new CaptureConflictError("target-changed", "Capture folder settings changed after preview. Refresh recommendations before saving.");
      }
      capture = await this.captureService.commit({
        draft,
        candidate: currentCandidate,
        targetRevision
      });
      this.captureCommittedCandidates.set(draft.id, currentCandidate);
      await this.recordCaptureRouteLearning(draft, currentCandidate, this.captureSelectionFor(draft, currentCandidate));
    }

    if (draft.intent === "answer") {
      const questionId = draft.source?.questionId;
      if (!questionId) {
        throw new Error("The source question is missing.");
      }
      const link = capture ? `\n\nSaved to [[${capture.finalPath.replace(/\.md$/iu, "")}]]` : "";
      const updated = await this.appendQuestionNoteFromExternal(
        questionId,
        `${draft.body}${link}`,
        "native-capture",
        {
          source_device: "obsidian-modal",
          source_file: draft.source?.file,
          input_mode: "answer",
          created_at: new Date().toISOString()
        }
      );
      if (!updated) {
        throw new Error("The source question no longer exists.");
      }
      const context = this.learningContextForFile(draft.source?.file ?? "");
      await this.recordLearningEvent({
        kind: "question-action",
        at: new Date().toISOString(),
        timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
        questionId,
        action: "answered",
        sourceFilePath: draft.source?.file,
        ...context
      });
    }

    return {
      capture,
      message: capture
        ? `Saved to ${capture.finalPath}`
        : "Answer appended to the question card.",
      openLabel: capture ? "Open note" : undefined,
      canOpen: Boolean(capture),
      canUndo: draft.intent !== "answer" && Boolean(capture?.undoToken)
    };
  }

  private captureSelectionFor(draft: CaptureDraft, candidate: CaptureTargetCandidate): "accepted" | "reselected" | "inbox" {
    if (candidate.kind === "inbox") {
      return "inbox";
    }
    return this.captureSuggestedTargets.get(draft.id) === candidate.id ? "accepted" : "reselected";
  }

  private async recordCaptureRouteLearning(
    draft: CaptureDraft,
    candidate: CaptureTargetCandidate,
    selection: "accepted" | "reselected" | "inbox" | "undone"
  ): Promise<void> {
    const sourceFile = draft.source?.file;
    const context = sourceFile ? this.learningContextForFile(sourceFile) : {};
    await this.recordLearningEvent({
      kind: "capture-route",
      at: new Date().toISOString(),
      timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
      captureId: draft.id,
      entryPoint: draft.source?.entryPoint ?? "command",
      suggestedTargetId: this.captureSuggestedTargets.get(draft.id),
      selectedTargetId: candidate.id,
      selectedTargetKind: candidate.kind === "existingNote" ? "existing-note" : candidate.kind,
      selection,
      sourceFilePath: sourceFile,
      ...context
    });
  }

  private async onCaptureVaultChanged(path: string, _operation: "commit" | "undo"): Promise<void> {
    const file = this.app.vault.getFileByPath(path);
    if (file) {
      await this.indexer.indexFile(file);
      if (this.shouldBuildLocalKnowledgeIndex()) {
        await this.localKnowledgeIndex.upsert(this.app, file, this.settings.exportDirectory, this.getLocalKnowledgeScope());
      }
    } else {
      this.indexer.removeFile(path);
      this.localKnowledgeIndex.remove(path);
    }
    await this.workflowIndex.rebuild();
    if (this.settings.autoExport) {
      await this.exportNow(false, { rebuildWorkflow: false });
    }
    this.store.notify();
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
      await this.localKnowledgeIndex.rebuild(this.app, this.settings.exportDirectory, this.getLocalKnowledgeScope());
    }
    await this.workflowIndex.rebuild();
    if (this.settings.autoExport) {
      await this.exportNow(false, { rebuildWorkflow: false });
    }
    this.aiService.refreshMissingForActiveNote(this.getActiveFile());
    this.store.notify();
  }

  async refreshWorkflowIndex(): Promise<void> {
    try {
      await this.workflowIndex.rebuild();
    } catch (error) {
      // Configured stage tabs are still useful even if one vault file cannot be indexed.
      this.store.notify();
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`ToWrite Workflow counts could not be refreshed: ${message}`);
      return;
    }
    // Let open views consume the new stage payload before optional export work.
    this.store.notify();
    if (this.settings.autoExport) {
      try {
        await this.exportNow(false, { rebuildWorkflow: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`ToWrite Workflow updated, but export failed: ${message}`);
      }
    }
  }

  notifyUi(): void {
    this.store.notify();
  }

  async exportNow(showNotice = true, options: { rebuildWorkflow?: boolean } = {}): Promise<void> {
    if (options.rebuildWorkflow !== false) {
      await this.workflowIndex.rebuild();
    }
    await this.exporter.exportAll();
    await this.exportCaptureTargetCatalog();
    if (showNotice) {
      const directory = this.settings.exportDirectory.replace(/\\/gu, "/").replace(/\/+$/u, "");
      new Notice(`ToWrite JSON exported to ${directory}, including capture-targets.json.`);
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
    return this.settings.ai.enabled || this.settings.deviceCapture.localRecommendations;
  }

  private getLocalKnowledgeScope() {
    return {
      includeFolders: this.settings.deviceCapture.includeFolders,
      excludeFolders: this.settings.deviceCapture.excludeFolders,
      excludeTags: this.settings.deviceCapture.excludeTags,
      excludeFrontmatter: this.settings.deviceCapture.excludeFrontmatter
    };
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  async savePluginData(): Promise<void> {
    const data: ToWriteSavedData = {
      settings: this.settings,
      questionStates: this.store?.serializeStates() ?? this.savedQuestionStates,
      pushState: this.pushState,
      learningState: this.learningService?.getState() ?? this.savedLearningState,
      suggestionNotifications: this.suggestionNotifications,
      snoozedSuggestions: this.snoozedSuggestions,
      securityMigrationVersion: this.securityMigrationVersion,
      aiAssistantState: this.aiAssistantState
    };
    await this.saveData(data);
    await this.exportCaptureTargetCatalog();
  }

  async testBackendConnection(): Promise<void> {
    try {
      const capabilities = await this.backendClient.getCapabilities();
      const features = [
        capabilities.recommendTargets ? "target recommendations" : "",
        capabilities.suggestHabits ? "habit suggestions" : "",
        capabilities.mobileCapture ? "mobile capture" : ""
      ].filter(Boolean).join(", ") || "no optional features";
      new Notice(`Obsidian AI Backend protocol ${capabilities.protocolVersion}: ${features}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Obsidian AI Backend unavailable: ${message}`);
    }
  }

  async listAiModels(): Promise<AiModelInfo[]> {
    return this.aiProvider.listModels();
  }

  async testAiConnection(): Promise<AiConnectionResult> {
    return this.aiProvider.testConnection();
  }

  openAiAssistant(): void {
    new AiAssistantModal(this.app, {
      language: this.settings.language,
      initialMessages: [...this.aiAssistantState.messages],
      callbacks: {
        loadCatalog: () => this.loadAiAssistantCatalog(),
        send: (request) => this.sendAiAssistantMessage(request),
        choose: (request) => this.chooseAiAssistantInteraction(request),
        clearHistory: () => this.clearAiAssistantHistory(),
        renderMarkdown: (markdown, element, sourcePath) => this.renderMarkdown(markdown, element, sourcePath)
      }
    }).open();
  }

  private async loadAiAssistantCatalog(): Promise<AiAssistantCatalog> {
    let warning = "";

    if (this.settings.backend.enabled) {
      try {
        const [models, skills, agents] = await Promise.all([
          this.backendClient.listModels(),
          this.backendClient.listSkills(),
          this.backendClient.listAgents()
        ]);
        if (models.length > 0) {
          this.aiAssistantMode = "backend";
          const context = this.getAiAssistantContextPreview();
          const selectedModelId = models.some((model) => model.id === this.aiAssistantState.selectedModelId)
            ? this.aiAssistantState.selectedModelId
            : models[0].id;
          return {
            mode: "backend",
            models,
            skills,
            agents,
            selectedModelId,
            selectedSkillPath: skills.some((skill) => skill.skillPath === this.aiAssistantState.selectedSkillPath)
              ? this.aiAssistantState.selectedSkillPath
              : "",
            selectedAgentIds: this.aiAssistantState.selectedAgentIds.filter((id) => agents.some((agent) => agent.agentId === id)),
            context
          };
        }
        warning = this.settings.language === "zh"
          ? "Backend 没有返回聊天模型，已回退插件直连。"
          : "Backend returned no chat models; using the direct provider.";
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warning = this.settings.language === "zh"
          ? `Backend 助手不可用，已回退插件直连：${message}`
          : `Backend assistant unavailable; using the direct provider: ${message}`;
      }
    }

    this.aiAssistantMode = "direct";
    let models: AiModelInfo[] = [];
    try {
      models = await this.aiProvider.listModels();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warning = warning || (this.settings.language === "zh"
        ? `模型发现不可用，使用手动模型：${message}`
        : `Model discovery unavailable; using the configured model: ${message}`);
    }
    const configuredModel = this.settings.ai.model.trim();
    if (configuredModel && !models.some((model) => model.id === configuredModel)) {
      models.unshift({ id: configuredModel });
    }
    if (models.length === 0) {
      throw new Error(this.settings.language === "zh"
        ? "请先在 AI 设置中填写 Base URL、API Key 和模型。"
        : "Configure an AI Base URL, API key, and model first.");
    }
    const selectedModelId = models.some((model) => model.id === this.aiAssistantState.selectedModelId)
      ? this.aiAssistantState.selectedModelId
      : configuredModel || models[0].id;
    return {
      mode: "direct",
      models: models.map((model) => ({ id: model.id, label: model.id, provider: model.ownedBy })),
      skills: [],
      agents: [],
      selectedModelId,
      selectedSkillPath: "",
      selectedAgentIds: [],
      context: this.getAiAssistantContextPreview(),
      warning: warning || undefined
    };
  }

  private async sendAiAssistantMessage(request: AiAssistantSendRequest) {
    const message = request.message.trim();
    if (!message) {
      return [...this.aiAssistantState.messages];
    }
    const previousMessages = [...this.aiAssistantState.messages];
    const userMessage = createAiAssistantMessage("user", message, {
      modelId: request.modelId,
      skillPath: request.skillPath || undefined,
      agentIds: request.agentIds
    });
    this.aiAssistantState = {
      messages: [...previousMessages, userMessage].slice(-80),
      selectedModelId: request.modelId,
      selectedSkillPath: request.skillPath,
      selectedAgentIds: request.agentIds
    };
    await this.saveAiAssistantState();

    try {
      const context = this.getAiAssistantContextPreview();
      const history = previousMessages.slice(-30).map(({ role, content }) => ({ role, content }));
      let reply = "";
      let interaction: AiAssistantChoiceInteraction | undefined;
      if (this.aiAssistantMode === "backend") {
        if (request.skillPath) {
          const skillReply = await this.backendClient.runSkill({
            skillPath: request.skillPath,
            modelId: request.modelId,
            userInput: buildSkillInput(message, history, context, request.agentIds)
          });
          ({ content: reply, interaction } = parseBackendInteraction(skillReply));
        } else {
          const backendReply = await this.backendClient.chatOnContext({
            message,
            modelId: request.modelId,
            notePaths: context.activeFile ? [context.activeFile] : [],
            contextSnippets: buildBackendContextSnippets(context),
            chatHistory: history,
            agentIds: request.agentIds
          });
          ({ content: reply, interaction } = parseBackendInteraction(backendReply));
        }
      } else {
        const systemContext = await this.buildDirectAiAssistantSystemContext(context);
        const messages = [
          { role: "system", content: systemContext },
          ...history,
          { role: "user", content: message }
        ] as const;
        try {
          const completion = await this.aiProvider.complete([...messages], request.modelId, {
            tools: [ASK_USER_CHOICE_TOOL]
          });
          ({ content: reply, interaction } = parseDirectInteraction(completion.content, completion.toolCalls));
        } catch {
          reply = await this.aiProvider.chat([...messages], request.modelId);
        }
      }
      const assistantMessage = createAiAssistantMessage("assistant", reply, {
        modelId: request.modelId,
        skillPath: request.skillPath || undefined,
        agentIds: request.agentIds,
        interaction
      });
      this.aiAssistantState.messages = [...this.aiAssistantState.messages, assistantMessage].slice(-80);
      await this.saveAiAssistantState();
      return [...this.aiAssistantState.messages];
    } catch (error) {
      this.aiAssistantState = { ...this.aiAssistantState, messages: previousMessages };
      await this.saveAiAssistantState();
      throw error;
    }
  }

  private async chooseAiAssistantInteraction(request: {
    messageId: string;
    optionId: string;
    modelId: string;
    skillPath: string;
    agentIds: string[];
  }) {
    const index = this.aiAssistantState.messages.findIndex((message) => message.id === request.messageId);
    const message = this.aiAssistantState.messages[index];
    const interaction = message?.interaction;
    if (!interaction || interaction.status !== "pending") {
      return [...this.aiAssistantState.messages];
    }
    const followUp = choiceFollowUpText(interaction, request.optionId);
    if (!followUp) {
      return [...this.aiAssistantState.messages];
    }
    const updated = {
      ...message,
      interaction: { ...interaction, status: "answered" as const, selectedOptionId: request.optionId }
    };
    this.aiAssistantState.messages = this.aiAssistantState.messages.map((item, itemIndex) => itemIndex === index ? updated : item);
    await this.saveAiAssistantState();
    return this.sendAiAssistantMessage({
      message: followUp,
      modelId: request.modelId,
      skillPath: request.skillPath,
      agentIds: request.agentIds
    });
  }

  private async clearAiAssistantHistory() {
    this.aiAssistantState = { ...this.aiAssistantState, messages: [] };
    await this.saveAiAssistantState();
    return [];
  }

  private getAiAssistantContextPreview(): AiAssistantContextPreview {
    const activeFile = this.getActiveFile() ?? undefined;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const selection = view?.editor.getSelection().trim().slice(0, 4000) || undefined;
    const questionSummaries = activeFile
      ? this.store.query({ filePath: activeFile })
        .filter((question) => question.status !== "resolved" && question.status !== "ignored")
        .slice(0, 20)
        .map((question) => `${question.lane}: ${question.title || question.question}`.slice(0, 500))
      : [];
    const sentFields = [
      activeFile && this.aiAssistantMode === "backend" ? "active note path (Backend may read the note)" : "",
      activeFile && this.aiAssistantMode === "direct" ? "active note path and content (up to 12,000 characters)" : "",
      selection ? "selected text" : "",
      questionSummaries.length ? "unresolved question summaries" : "",
      "local chat history",
      this.aiAssistantMode === "backend" ? "selected Backend model, Skill, and Agents" : "selected direct model"
    ].filter(Boolean);
    return { activeFile, selection, questionSummaries, sentFields };
  }

  private async buildDirectAiAssistantSystemContext(context: AiAssistantContextPreview): Promise<string> {
    let noteContent = "";
    if (context.activeFile) {
      const file = this.app.vault.getFileByPath(context.activeFile);
      if (file?.extension === "md") {
        noteContent = (await this.app.vault.cachedRead(file)).slice(0, 12000);
      }
    }
    return [
      "You are the ToWrite AI assistant inside Obsidian.",
      "Use only the explicitly supplied local context. Do not claim web access.",
      "When a user decision is genuinely required before continuing, use the ask_user_choice tool. Otherwise answer directly.",
      context.activeFile ? `Active note: ${context.activeFile}` : "",
      context.selection ? `Selected text:\n${context.selection}` : "",
      context.questionSummaries.length ? `Unresolved questions:\n${context.questionSummaries.join("\n")}` : "",
      noteContent ? `Active note content:\n${noteContent}` : ""
    ].filter(Boolean).join("\n\n");
  }

  private async saveAiAssistantState(): Promise<void> {
    await this.savePluginData();
    const root = normalizeVaultPath(this.settings.exportDirectory);
    await this.writeVaultText(`${root}/ai/conversations.json`, `${JSON.stringify({
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      conversation: this.aiAssistantState
    }, null, 2)}\n`);
  }

  async exportLearningData(showNotice = true): Promise<void> {
    if (!this.learningService) {
      return;
    }
    const bundle = this.learningService.exportBundle();
    const root = normalizeVaultPath(this.settings.exportDirectory);
    await this.writeVaultText(`${root}/${bundle.files.events}`, bundle.eventsJsonl ? `${bundle.eventsJsonl}\n` : "");
    await this.writeVaultText(`${root}/${bundle.files.habits}`, `${bundle.habitsJson}\n`);
    await this.savePluginData();
    if (showNotice) {
      new Notice(`ToWrite learning data exported to ${root}/learning/.`);
    }
  }

  async setLearningEnabled(enabled: boolean): Promise<void> {
    this.settings.learning.enabled = enabled;
    this.learningService.setCollectionPaused(!enabled);
    await this.exportLearningData(false);
    this.store.notify();
  }

  private async exportCaptureTargetCatalog(): Promise<void> {
    const root = normalizeVaultPath(this.settings.exportDirectory);
    const recommendation = captureRecommendationSettingsFromPluginSettings(this.settings);
    const catalog = {
      schemaVersion: 1,
      revision: recommendation.settingsRevision,
      inboxFile: recommendation.inboxFile,
      targetFolders: recommendation.targetFolders,
      appendHeading: recommendation.appendHeading,
      defaultTags: this.settings.deviceCapture.defaultTags,
      includeFolders: recommendation.includeFolders ?? [],
      excludeFolders: recommendation.excludeFolders ?? [],
      excludeTags: recommendation.excludeTags ?? [],
      excludeFrontmatter: recommendation.excludeFrontmatter ?? [],
      workflowStages: recommendation.workflowStages ?? []
    };
    const content = `${JSON.stringify(catalog, null, 2)}\n`;
    if (content === this.lastCaptureTargetCatalogJson) {
      return;
    }
    await this.writeVaultText(`${root}/capture-targets.json`, content);
    this.lastCaptureTargetCatalogJson = content;
  }

  async clearLearningData(): Promise<void> {
    if (!window.confirm("Clear all ToWrite learning events, candidates, and accepted learned habits? Manual Push rules are kept.")) {
      return;
    }
    this.learningService.clearLearningData({ preservePause: false, preserveManualHabits: true });
    this.learningService.setCollectionPaused(!this.settings.learning.enabled);
    await this.exportLearningData(false);
    this.store.notify();
    new Notice("ToWrite learning data cleared.");
  }

  getProactiveSuggestions(): ProactiveSuggestion[] {
    if (this.settings.learning.enabled) {
      const candidates = this.learningService.inferCandidates();
      void this.maybeEnhanceHabitCandidateCopy(candidates);
    }
    const now = new Date();
    const suggestions = this.suggestionService.build({
      questions: this.store.query(),
      habits: this.learningService.getCandidates(),
      activeFile: this.getActiveFile(),
      now,
      timezoneOffsetMinutes: -now.getTimezoneOffset()
    });
    const nowMs = now.getTime();
    for (const [id, until] of Object.entries(this.snoozedSuggestions)) {
      if (!Number.isFinite(Date.parse(until)) || Date.parse(until) <= nowMs) {
        delete this.snoozedSuggestions[id];
      }
    }
    return suggestions.filter((suggestion) => {
      const until = Date.parse(this.snoozedSuggestions[suggestion.id] ?? "");
      return !Number.isFinite(until) || until <= nowMs;
    });
  }

  async actOnSuggestion(id: string, action: ProactiveSuggestionAction): Promise<void> {
    const suggestion = this.getProactiveSuggestions().find((item) => item.id === id);
    if (!suggestion) {
      return;
    }

    if (action === "open-source") {
      if (suggestion.questionId) {
        await this.jumpToQuestion(suggestion.questionId);
      } else {
        this.openCaptureModal({ entryPoint: "sidebar" });
      }
    } else if (action === "start-capture") {
      this.openCaptureModal({ entryPoint: "sidebar" });
    } else if (action === "accept" && suggestion.habitId) {
      this.learningService.acceptCandidate(suggestion.habitId);
      await this.exportLearningData(false);
      new Notice("Habit confirmed. It can now influence suggestions.");
    } else if (action === "edit" && suggestion.habitId) {
      const candidate = this.learningService.getCandidates().find((item) => item.id === suggestion.habitId);
      if (candidate) {
        const label = window.prompt("Habit label", candidate.label);
        if (label !== null) {
          const description = window.prompt("Habit description", candidate.description);
          this.learningService.rewriteCandidateCopy(candidate.id, {
            label,
            description: description ?? candidate.description
          }, new Date(), false);
          await this.exportLearningData(false);
        }
      }
    } else if (action === "view-evidence" && suggestion.evidence) {
      const evidence = suggestion.evidence;
      new Notice(`${suggestion.title}\n${evidence.matchingSamples}/${evidence.sampleSize} matches across ${evidence.distinctDays} days (${Math.round(evidence.ratio * 100)}%).`, 10000);
    } else if (action === "later" || action === "snooze") {
      this.snoozedSuggestions[suggestion.id] = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await this.savePluginData();
    } else if (action === "dismiss") {
      if (suggestion.habitId) {
        this.learningService.dismissCandidate(suggestion.habitId);
        await this.exportLearningData(false);
      } else if (suggestion.questionId && suggestion.source === "due-reminder") {
        await this.updateQuestionFromUi(suggestion.questionId, { reminderDismissedAt: new Date().toISOString() });
      } else {
        this.snoozedSuggestions[suggestion.id] = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await this.savePluginData();
      }
    }

    await this.recordSuggestionFeedback(suggestion, action);
    this.store.notify();
  }

  private async recordSuggestionFeedback(suggestion: ProactiveSuggestion, action: ProactiveSuggestionAction): Promise<void> {
    const feedbackAction = action === "accept"
      ? "accepted"
      : action === "edit"
        ? "edited"
        : action === "dismiss"
          ? "dismissed"
          : action === "later" || action === "snooze"
            ? "later"
            : "opened";
    await this.recordLearningEvent({
      kind: "suggestion-feedback",
      at: new Date().toISOString(),
      timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
      suggestionId: suggestion.id,
      habitId: suggestion.habitId,
      action: feedbackAction
    });
  }

  private async runSuggestionNotifications(): Promise<void> {
    if (!this.settings.learning.notificationsEnabled) {
      return;
    }
    const now = new Date();
    const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    this.suggestionNotifications = this.suggestionNotifications.filter((event) => Date.parse(event.notifiedAt) >= cutoff);
    let changed = false;
    for (const suggestion of this.getProactiveSuggestions()) {
      const eligibility = this.suggestionService.notificationEligibility(suggestion, {
        enabled: this.settings.learning.notificationsEnabled,
        quietHoursStart: this.settings.learning.quietHoursStart,
        quietHoursEnd: this.settings.learning.quietHoursEnd,
        dailyHabitLimit: this.settings.learning.maxHabitNotificationsPerDay,
        timezoneOffsetMinutes: -now.getTimezoneOffset()
      }, this.suggestionNotifications, now);
      if (!eligibility.eligible) {
        continue;
      }
      new Notice(`${suggestion.title}\n${suggestion.triggerReason}`, 10000);
      this.suggestionNotifications.push({
        suggestionId: suggestion.id,
        source: suggestion.source,
        habitId: suggestion.habitId,
        notifiedAt: now.toISOString()
      });
      changed = true;
    }
    if (changed) {
      await this.savePluginData();
    }
  }

  private async recordLearningEvent(event: NewActivityEvent): Promise<void> {
    if (!this.settings.learning.enabled || !this.learningService) {
      return;
    }
    this.learningService.setCollectionPaused(false);
    this.learningService.recordEvent(event);
    const candidates = this.learningService.inferCandidates();
    void this.maybeEnhanceHabitCandidateCopy(candidates);
    await this.exportLearningData(false);
    this.store.notify();
  }

  private async maybeEnhanceHabitCandidateCopy(candidates: HabitCandidate[]): Promise<void> {
    if (!this.settings.backend.enabled || !this.settings.backend.useForHabitSuggestions) {
      return;
    }
    const pending = candidates
      .filter((candidate) => candidate.status === "pending" && !candidate.copyEditedByAiAt && !this.habitBackendRequests.has(candidate.id))
      .slice(0, 5);
    if (pending.length === 0) {
      return;
    }
    for (const candidate of pending) {
      this.habitBackendRequests.add(candidate.id);
    }
    try {
      const response = await this.backendClient.suggestHabits<{
        schemaVersion: 1;
        candidates: Array<Pick<HabitCandidate, "id" | "label" | "description" | "rule" | "evidence">>;
      }, { candidateId?: unknown; id?: unknown; label?: unknown; description?: unknown }>({
        schemaVersion: 1,
        candidates: pending.map(({ id, label, description, rule, evidence }) => ({
          id,
          label,
          description,
          rule,
          evidence
        }))
      });
      let changed = false;
      for (const suggestion of response.suggestions) {
        const id = typeof suggestion.candidateId === "string"
          ? suggestion.candidateId
          : typeof suggestion.id === "string" ? suggestion.id : "";
        if (!pending.some((candidate) => candidate.id === id)) {
          continue;
        }
        const current = this.learningService.getCandidates().find((candidate) => candidate.id === id);
        if (!current || current.status !== "pending") {
          continue;
        }
        const label = typeof suggestion.label === "string" ? suggestion.label : undefined;
        const description = typeof suggestion.description === "string" ? suggestion.description : undefined;
        if (!label && !description) {
          continue;
        }
        this.learningService.rewriteCandidateCopy(id, { label, description });
        changed = true;
      }
      if (changed) {
        await this.exportLearningData(false);
        this.store.notify();
      }
    } catch {
      // Local rule-generated copy remains authoritative when Backend is unavailable.
    }
  }

  private async writeVaultText(path: string, content: string): Promise<void> {
    await writeVaultDataText(this.app, normalizeVaultPath(path), content);
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

  private async appendQuestionNoteFromExternal(id: string, text: string, clientId?: string, metadata?: DeviceWritebackMetadata): Promise<OpenQuestion | undefined> {
    const question = this.store.getQuestion(id);
    if (!question) {
      return undefined;
    }
    const note = createExternalQuestionNote(text, clientId, metadata);
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
    if (request.captureId || request.candidateId || request.action || request.targetRevision || request.target?.kind === "existingNote") {
      return this.createVersionedDeviceCapture(request);
    }
    const createdAt = new Date().toISOString();
    const text = request.text.trim();
    const target = this.resolveDeviceCaptureTarget(request);
    const metadata = cleanWritebackMetadata({
      ...request.metadata,
      input_mode: request.metadata?.input_mode || "capture",
      created_at: request.metadata?.created_at || createdAt
    });
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
        clientId: request.clientId,
        metadata
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
        workflowStage: target.stage,
        metadata
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

  private async createVersionedDeviceCapture(request: DeviceCaptureRequest): Promise<DeviceCaptureResult> {
    const createdAt = new Date().toISOString();
    const draft: CaptureDraft = {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      id: request.captureId?.trim() || `capture_${randomTokenFragment()}`,
      intent: "new",
      body: request.text.trim(),
      title: request.title?.trim() || undefined,
      tags: normalizeCaptureTags(request.tags),
      links: Array.from(request.text.matchAll(/https?:\/\/[^\s<>{}\[\]"']+/giu)).map((match) => match[0]).slice(0, 10),
      source: request.metadata?.source_file ? {
        file: request.metadata.source_file,
        entryPoint: "external-api",
        ...this.learningContextForFile(request.metadata.source_file)
      } : { entryPoint: "external-api" },
      createdAt
    };
    const candidates = await this.recommendCaptureTargets(draft);
    let candidate = request.candidateId
      ? candidates.find((item) => item.id === request.candidateId)
      : undefined;
    if (!candidate && request.target?.kind === "existingNote") {
      candidate = candidates.find((item) => item.kind === "existingNote" && item.path === request.target?.filePath);
    }
    if (!candidate && request.target?.kind === "inboxFile") {
      candidate = candidates.find((item) => item.kind === "inbox" && (!request.target?.inboxFile || item.path === request.target.inboxFile));
    }
    if (!candidate && (request.target?.kind === "folderPath" || request.target?.kind === "stageId")) {
      candidate = candidates.find((item) => item.kind === "folder" && (
        request.target?.kind === "folderPath"
          ? item.path === request.target.folderPath
          : item.stageId === request.target?.stageId
      ));
    }
    if (!candidate) {
      throw new Error("Capture target is no longer in the current recommendation catalog. Refresh recommendations before saving.");
    }
    if (request.action && request.action !== candidate.action) {
      throw new Error("Capture action does not match the selected target.");
    }
    if (candidate.action === "create" && request.targetRevision && request.targetRevision !== candidate.targetRevision) {
      throw new CaptureConflictError("target-changed", "Capture folder settings changed after preview. Refresh recommendations before saving.");
    }
    const result = await this.captureService.commit({
      draft,
      candidate,
      targetRevision: request.targetRevision ?? candidate.targetRevision
    });
    this.captureCommittedCandidates.set(draft.id, candidate);
    this.captureSuggestedTargets.set(draft.id, candidates[0]?.id ?? "");
    await this.recordCaptureRouteLearning(draft, candidate, this.captureSelectionFor(draft, candidate));
    return {
      filePath: result.finalPath,
      title: request.title?.trim() || defaultTitleFromBody(request.text),
      tags: normalizeCaptureTags([...this.settings.deviceCapture.defaultTags, ...request.tags]),
      targetKind: candidate.kind === "existingNote" ? "existingNote" : candidate.kind === "folder" ? "folderPath" : "inboxFile",
      createdAt: result.createdAt,
      openUri: result.openUri,
      captureId: result.captureId,
      candidateId: result.candidateId,
      action: result.action,
      undoToken: result.undoToken,
      targetRevision: result.targetRevision,
      idempotent: result.idempotent
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
  private savedLearningState?: HabitLearningState;

  private async loadPluginData(): Promise<void> {
    const data = (await this.loadData()) as Partial<ToWriteSavedData> | null;
    this.settings = normalizeSettings(data?.settings);
    this.securityMigrationVersion = Number.isFinite(data?.securityMigrationVersion)
      ? Math.max(0, Math.floor(data?.securityMigrationVersion ?? 0))
      : 0;
    if (this.securityMigrationVersion < 1) {
      this.showQueryTokenMigrationNotice = data?.settings?.externalApi?.allowQueryTokenForRead === true;
      this.settings.externalApi.allowQueryTokenForRead = false;
    }
    this.savedQuestionStates = data?.questionStates ?? {};
    this.pushState = normalizePushRuntimeState(data?.pushState);
    this.savedLearningState = migrateManualPushHabits(
      data?.learningState,
      this.settings,
      Array.isArray(data?.settings?.push?.habits)
    );
    this.suggestionNotifications = Array.isArray(data?.suggestionNotifications) ? data.suggestionNotifications : [];
    this.snoozedSuggestions = data?.snoozedSuggestions && typeof data.snoozedSuggestions === "object"
      ? { ...data.snoozedSuggestions }
      : {};
    this.aiAssistantState = normalizeAiAssistantState(data?.aiAssistantState);
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
      getArticleTypes: () => this.settings.articleTypes.enabled
        ? this.settings.articleTypes.types.map((type) => ({ ...type }))
        : [],
      getWorkflowStages: () => this.settings.workflowStages.enabled
        ? this.settings.workflowStages.stages.map((stage) => ({
            ...stage,
            folderPrefixes: [...stage.folderPrefixes],
            tags: [...stage.tags]
          }))
        : [],
      getWorkflowPayload: () => this.workflowIndex.getPayload({ limit: 200, compact: true }),
      getStatusOptions: () => this.settings.statusOptions,
      getLanguage: () => this.settings.language,
      getGroupCurrentByHeading: () => this.settings.groupCurrentByHeading,
      getCompactEditorDecorations: () => this.settings.compactEditorDecorations,
      getReminderPresets: () => this.settings.reminderPresets,
      getProactiveSuggestions: () => this.getProactiveSuggestions(),
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
      openCapture: () => this.openCaptureModal({ entryPoint: "sidebar" }),
      openAiAssistant: () => this.openAiAssistant(),
      openCaptureForQuestion: (id) => this.openCaptureForQuestion(id),
      actOnSuggestion: (id, action) => this.actOnSuggestion(id, action),
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
    this.app.workspace.updateOptions();
  }

  private async activateSidebar(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(TOWRITE_SIDEBAR_VIEW)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      return;
    }

    await leaf.setViewState({ type: TOWRITE_SIDEBAR_VIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private async activateDashboard(): Promise<void> {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: TOWRITE_DASHBOARD_VIEW, active: true });
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  private registerEvents(): void {
    const reindexFile = debounce((file: TFile) => {
      void this.indexer.indexFile(file).then(async () => {
        if (this.shouldBuildLocalKnowledgeIndex()) {
          await this.localKnowledgeIndex.upsert(this.app, file, this.settings.exportDirectory, this.getLocalKnowledgeScope());
        }
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
          this.recordEditPresenceLearning(file);
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
        this.localKnowledgeIndex.remove(oldPath);
        if (file instanceof TFile && file.extension === "md") {
          reindexFile(file);
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.aiService.refreshMissingForActiveNote(this.getActiveFile());
        this.recordFileSwitchLearning();
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
      this.localKnowledgeIndex.remove(file.path);
      void Promise.resolve().then(async () => {
        await this.workflowIndex.rebuild();
        if (this.settings.autoExport) {
          await this.exportNow(false);
        }
        this.store.notify();
      });
    }
  }

  private recordFileSwitchLearning(): void {
    const filePath = this.getActiveFile();
    if (!filePath || !this.settings.learning.enabled) {
      return;
    }
    const context = this.learningContextForFile(filePath);
    void this.recordLearningEvent({
      kind: "file-switched",
      at: new Date().toISOString(),
      timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
      filePath,
      ...context
    });
  }

  private recordEditPresenceLearning(file: TFile): void {
    if (!this.settings.learning.enabled) {
      return;
    }
    const now = Date.now();
    const previous = this.lastLearningEditPresence.get(file.path) ?? 0;
    if (now - previous < 60_000) {
      return;
    }
    this.lastLearningEditPresence.set(file.path, now);
    const context = this.learningContextForFile(file.path);
    void this.recordLearningEvent({
      kind: "edit-presence",
      at: new Date(now).toISOString(),
      timezoneOffsetMinutes: -new Date(now).getTimezoneOffset(),
      filePath: file.path,
      ...context
    });
  }

  private learningContextForFile(filePath: string): { articleTypeId?: string; workflowStageId?: string } {
    const article = this.store.getArticleSummary(filePath);
    if (article?.typeId || article?.stageId) {
      return {
        articleTypeId: article.typeId,
        workflowStageId: article.stageId
      };
    }
    const workflowFile = this.workflowIndex.getPayload({ limit: 500, compact: true }).files?.find((item) => item.filePath === filePath);
    return {
      articleTypeId: workflowFile?.typeId,
      workflowStageId: workflowFile?.stageId
    };
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
      source: suggestion.source,
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

    if (this.store.isSidecarQuestion(question.id)) {
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

    if (this.store.isSidecarQuestion(question.id)) {
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

function buildBackendContextSnippets(context: AiAssistantContextPreview) {
  const snippets: Array<{ kind: string; title: string; text: string }> = [{
    kind: "assistant_tool_contract",
    title: "ToWrite interactive choice tool",
    text: BACKEND_CHOICE_INSTRUCTION
  }];
  if (context.selection) {
    snippets.push({ kind: "selection", title: "Obsidian selection", text: context.selection });
  }
  if (context.questionSummaries.length > 0) {
    snippets.push({
      kind: "open_questions",
      title: "ToWrite unresolved questions",
      text: context.questionSummaries.join("\n")
    });
  }
  return snippets;
}

function buildSkillInput(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  context: AiAssistantContextPreview,
  agentIds: string[] = []
): string {
  return [
    BACKEND_CHOICE_INSTRUCTION,
    context.activeFile ? `Active note: ${context.activeFile}` : "",
    agentIds.length ? `Requested agents: ${agentIds.map((id) => `@${id}`).join(", ")}` : "",
    context.selection ? `Selected text:\n${context.selection}` : "",
    context.questionSummaries.length ? `Unresolved questions:\n${context.questionSummaries.join("\n")}` : "",
    history.length ? `Recent conversation:\n${history.map((item) => `${item.role}: ${item.content}`).join("\n")}` : "",
    `User request:\n${message}`
  ].filter(Boolean).join("\n\n").slice(0, 30000);
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
    learning: normalizeLearningSettings(settings?.learning),
    backend: normalizeBackendSettings(settings?.backend),
    deviceProfiles: normalizeDeviceProfiles(settings?.deviceProfiles),
    articleTypes: normalizeArticleTypesSettings(settings?.articleTypes),
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
    defaultTags: normalizeCaptureTags(settings?.defaultTags ?? DEFAULT_SETTINGS.deviceCapture.defaultTags),
    appendHeading: String(settings?.appendHeading ?? DEFAULT_SETTINGS.deviceCapture.appendHeading)
      .replace(/^#+\s*/u, "")
      .trim()
      .slice(0, 120) || DEFAULT_SETTINGS.deviceCapture.appendHeading,
    localRecommendations: settings?.localRecommendations !== false,
    includeFolders: normalizeWorkflowList(settings?.includeFolders),
    excludeFolders: normalizeWorkflowList(settings?.excludeFolders ?? DEFAULT_SETTINGS.deviceCapture.excludeFolders),
    excludeTags: normalizeCaptureTags(settings?.excludeTags ?? DEFAULT_SETTINGS.deviceCapture.excludeTags),
    excludeFrontmatter: normalizeCaptureTags(settings?.excludeFrontmatter ?? DEFAULT_SETTINGS.deviceCapture.excludeFrontmatter)
  };
}

function normalizeLearningSettings(settings?: Partial<ToWriteSettings["learning"]>): ToWriteSettings["learning"] {
  return {
    enabled: settings?.enabled === true,
    retentionDays: 30,
    idleMinutes: 5,
    notificationsEnabled: settings?.notificationsEnabled === true,
    quietHoursStart: normalizeClock(settings?.quietHoursStart, DEFAULT_SETTINGS.learning.quietHoursStart),
    quietHoursEnd: normalizeClock(settings?.quietHoursEnd, DEFAULT_SETTINGS.learning.quietHoursEnd),
    maxHabitNotificationsPerDay: clampNumber(
      settings?.maxHabitNotificationsPerDay ?? DEFAULT_SETTINGS.learning.maxHabitNotificationsPerDay,
      0,
      20,
      3
    )
  };
}

function normalizeBackendSettings(settings?: Partial<ToWriteSettings["backend"]>): ToWriteSettings["backend"] {
  const rawBaseUrl = String(settings?.baseUrl ?? DEFAULT_SETTINGS.backend.baseUrl).trim().replace(/\/+$/u, "");
  return {
    enabled: settings?.enabled === true,
    baseUrl: /^https?:\/\//iu.test(rawBaseUrl) ? rawBaseUrl : DEFAULT_SETTINGS.backend.baseUrl,
    token: String(settings?.token ?? "").trim().slice(0, 500),
    useForRecommendations: settings?.useForRecommendations !== false,
    useForHabitSuggestions: settings?.useForHabitSuggestions === true,
    timeoutMs: clampNumber(settings?.timeoutMs ?? DEFAULT_SETTINGS.backend.timeoutMs, 500, 10000, 2500)
  };
}

function normalizeClock(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/u.test(text) ? text : fallback;
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
    allowQueryTokenForRead: settings?.allowQueryTokenForRead === true,
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

function createExternalQuestionNote(text?: string, clientId?: string, metadata?: DeviceWritebackMetadata): OpenQuestionNote | undefined {
  const trimmed = text?.trim();
  if (!trimmed) {
    return undefined;
  }

  const cleanMetadata = cleanWritebackMetadata(metadata);
  return {
    id: `oqn_${randomTokenFragment()}`,
    kind: "text",
    text: trimmed.slice(0, 4000),
    source: "api",
    clientId: clientId?.trim().slice(0, 80) || undefined,
    createdAt: new Date().toISOString(),
    metadata: Object.keys(cleanMetadata).length > 0 ? cleanMetadata : undefined
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

function cleanWritebackMetadata(metadata?: DeviceWritebackMetadata): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    const normalizedKey = key.trim().toLowerCase().replace(/[^a-z0-9_]/gu, "_");
    const normalizedValue = String(value ?? "").trim().slice(0, 300);
    if (!normalizedKey || !normalizedValue) {
      continue;
    }
    output[normalizedKey] = normalizedValue;
  }
  return output;
}

function formatMetadataLines(metadata?: Record<string, string>): string {
  return Object.entries(metadata ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function formatInboxCaptureEntry(options: {
  title: string;
  text: string;
  tags: string[];
  createdAt: string;
  clientId?: string;
  metadata?: Record<string, string>;
}): string {
  const tagLine = options.tags.length > 0 ? `\n${options.tags.map((tag) => `#${tag}`).join(" ")}` : "";
  const clientLine = options.clientId ? `\nsource_client: ${options.clientId.trim().slice(0, 80)}` : "";
  const metadataLines = formatMetadataLines(options.metadata);
  return [
    `## ${options.title}`,
    "",
    `created: ${options.createdAt}`,
    "source: device",
    `${clientLine}${tagLine}`.trim(),
    metadataLines,
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
  metadata?: Record<string, string>;
}): string {
  const frontmatter = [
    "---",
    `title: ${yamlString(options.title)}`,
    "source: device",
    `created: ${options.createdAt}`,
    ...(options.clientId ? [`source_client: ${yamlString(options.clientId.trim().slice(0, 80))}`] : []),
    ...Object.entries(options.metadata ?? {}).map(([key, value]) => `${key}: ${yamlString(value)}`),
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
