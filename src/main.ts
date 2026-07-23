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
import { DeferredKeyedQueue } from "./core/deferred-keyed-queue";
import { makeQuestionId } from "./core/hash";
import { queryQuestions as filterQuestions } from "./core/query";
import {
  DEFAULT_SETTINGS,
  DEFAULT_STATUS_OPTIONS,
  DEFAULT_WORKFLOW_STAGES,
  ensureInboxWorkflowStage,
  normalizeExternalApiBindHost,
  normalizeExternalApiPublicBaseUrl,
  normalizeArticleTypesSettings,
  normalizeDeviceProfiles,
  normalizeInboxSettings,
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
  QuestionDeliveryPolicy,
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
  MISSING_TARGET_REVISION,
  captureContentRevision,
  captureFolderRevision,
  captureRecommendationSettingsFromPluginSettings,
  captureServiceOptionsFromPluginSettings,
  type CaptureCommitResult,
  type CaptureDraft,
  type CaptureIntent,
  type CaptureTargetCandidate
} from "./capture";
import {
  CAPTURE_BRIDGE_PROTOCOL_VERSION,
  CaptureBridgeCoordinator,
  CaptureBridgeRequestError,
  CaptureBridgeServer,
  CapturePluginBridgeClient,
  LocalTapSelectionService,
  buildLocalCaptureTapUri,
  captureDraftFromBridgeCommit,
  generateCaptureTapId,
  generateSnapshotId,
  localCaptureNdefStatus,
  buildQuestionCaptureActivity,
  hasValidQuestionCaptureActivityIntegrity,
  hydrateCaptureBridgeSettings,
  isMatchingQuestionCaptureActivity,
  normalizeCaptureBridgeBaseUrl,
  normalizeCaptureBridgeSettings,
  type CaptureBridgeRuntimeStatus,
  type LocalTapSelectionState,
  type TapSelectionReference,
  type TapSelectionSnapshot
} from "./capture-bridge";
import { QuestionExporter } from "./export/exporter";
import { ToWriteExternalApiServer, type DeviceCaptureRequest, type DeviceCaptureResult, type DeviceWritebackMetadata } from "./external/server";
import { PushEngine } from "./push/engine";
import { normalizePushRuntimeState, type PushAnchorInput, type PushFeedbackInput } from "./push/state";
import type { PushCandidate, PushFeedPayload, PushRuntimeState } from "./push/types";
import {
  HabitLearningService,
  isInTimeWindow,
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
import {
  DeviceHubConnector,
  HubAdminClient,
  HubClient,
  HubCaptureWritebackService,
  buildDeviceLibrary,
  canAdvanceRotation,
  createOpaqueHubRef,
  generateHubCaptureKeyPair,
  isManualHoldActive,
  normalizeQuestionDeliveryPolicy,
  scheduledLibraryChoice,
  validateNtag213Uri,
  type DeviceLibrarySnapshot,
  type HubCapabilities,
  type HubContextState,
  type HubDeviceState,
  type HubDeviceSecretRotation,
  type HubEmailChallenge,
  type HubFeedbackAction,
  type HubSelectionMode,
  type HubPersonalProvisionResult,
  type HubTapRotation,
  type LocalHubCandidate,
  type Ntag213UriValidation
} from "./hub";
import {
  ECHO_CARD_HARD_LIMITS,
  ECHO_CARD_MAX_COUNT,
  ECHO_CARD_REFERENCE_PRESETS,
  clonePreset,
  composeEchoCardDisplay,
  createEmptyEchoCard,
  echoCardLocalId,
  normalizeEchoCards,
  validateEchoCardLayout,
  type EchoCard,
  type EchoCardReferencePreset
} from "./hub/echo-cards";
import {
  echoCardCaptureIntent,
  isEchoCardEligibleForMode,
  scheduledEchoCardChoice
} from "./hub/echo-card-selection";
import { Quote0SyncService, type Quote0SyncPreview, type Quote0SyncResult } from "./quote0/sync-service";
import type { Quote0Device, Quote0DeviceStatus } from "./quote0/client";
import { WorkflowIndex } from "./workflow";
import { InboxIndex } from "./inbox";
import { applyInboxStageMetadata, materializeInboxStageMetadata, type InboxMetadataBatchResult } from "./inbox/metadata";
import type { InboxDeviceEligibility, InboxSnapshot } from "./inbox/types";
import { yieldToEventLoop } from "./core/async-batch";
import { createQuestionDecorations, refreshQuestionDecorations } from "./obsidian/decorations";
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
  private inboxIndex!: InboxIndex;
  private localKnowledgeIndex!: LocalKnowledgeIndex;
  private aiService!: AiQuestionService;
  private aiProvider!: OpenAiCompatibleProvider;
  private aiAssistantState: AiAssistantState = { ...EMPTY_AI_ASSISTANT_STATE };
  private aiAssistantMode: AiAssistantMode = "direct";
  private backendClient!: BackendEnhancementClient;
  private captureService!: CaptureService;
  private captureRecommender!: CaptureTargetRecommender;
  private localTapSelection!: LocalTapSelectionService;
  private captureBridgeCoordinator!: CaptureBridgeCoordinator;
  private captureBridgeServer!: CaptureBridgeServer;
  private capturePluginBridge!: CapturePluginBridgeClient;
  private externalApiServer!: ToWriteExternalApiServer;
  private pushEngine!: PushEngine;
  private hubClient!: HubClient;
  private deviceHub!: DeviceHubConnector;
  private hubWriteback!: HubCaptureWritebackService;
  private quote0SyncService!: Quote0SyncService;
  private learningService!: HabitLearningService;
  private suggestionService!: SuggestionService;
  private uiApi!: ToWriteUiApi;
  private selectionToolbar?: SelectionQuestionToolbar;
  private pdfQuestionLayer?: PdfQuestionLayer;
  private backgroundRefreshTimer = 0;
  private hubSyncTimer = 0;
  private hubContextTimer = 0;
  private hubCandidateSyncTimer = 0;
  private backgroundRefreshRunning = false;
  private backgroundRefreshQueued = false;
  private readonly pendingWorkflowPaths = new Set<string>();
  private readonly inboxMetadataWrites = new Set<string>();
  private readonly activeContextListeners = new Set<() => void>();
  private lastEditorActivityAt = 0;
  private readonly lastLearningEditPresence = new Map<string, number>();
  private learningEditQueue!: DeferredKeyedQueue<NewActivityEvent>;
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
    this.learningEditQueue = new DeferredKeyedQueue(async (events) => {
      for (const event of events) {
        await this.recordLearningEvent(event);
      }
    }, {
      delayMs: 1_000,
      onError: (error) => console.error("ToWrite could not persist deferred edit presence", error)
    });
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
    this.inboxIndex = new InboxIndex(this.app, () => this.settings.inbox);
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
    this.localTapSelection = new LocalTapSelectionService({
      createSnapshot: (reference) => this.createTapSelectionSnapshot(reference),
      getFallbackLocalId: () => this.buildHubCandidates()[0]?.localId,
      validateSnapshot: (snapshot) => this.validatePersistedTapSelectionSnapshot(snapshot),
      onStateChanged: () => {
        void this.savePluginData();
      }
    });
    this.localTapSelection.restore(this.savedCaptureBridgeState);
    this.captureBridgeCoordinator = new CaptureBridgeCoordinator({
      selection: this.localTapSelection,
      isTapAllowed: (tapId) => tapId === this.settings.captureBridge.tapId,
      handoffTtlSeconds: () => this.settings.captureBridge.handoffTtlSeconds,
      commitAdapter: {
        commit: async (snapshot, request) => {
          const draft = captureDraftFromBridgeCommit(snapshot, request);
          return this.commitTapBridgeCapture(snapshot, draft);
        },
        undo: async (captureId, undoToken) => this.undoTapBridgeCapture(captureId, undoToken)
      }
    });
    this.captureBridgeServer = new CaptureBridgeServer({
      pluginVersion: this.manifest.version,
      getSettings: () => this.settings.captureBridge,
      coordinator: this.captureBridgeCoordinator
    });
    this.capturePluginBridge = new CapturePluginBridgeClient(this.app);
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
    this.hubClient = new HubClient(() => ({
      baseUrl: this.settings.hub.baseUrl,
      token: this.settings.hub.receiverToken,
      timeoutMs: 8_000
    }));
    this.deviceHub = new DeviceHubConnector({
      client: this.hubClient,
      getSettings: () => ({
        ...this.settings.hub,
        autoSelect: this.shouldHubAgentAutoSelect()
      }),
      getCandidates: () => this.buildHubCandidates(),
      enhanceCandidates: async (candidates) => {
        if (!this.settings.backend.enabled || !this.settings.backend.useForRecommendations) {
          return candidates;
        }
        const acceptedHabits = this.learningService.getCandidates().flatMap((habit) => {
          if (habit.status !== "accepted" || habit.rule.kind !== "time-stage") {
            return [];
          }
          const rule = habit.rule;
          return [{
            habit_id: habit.id,
            status: "accepted",
            context: {
              workflow_stage: rule.workflowStageId,
              article_type: rule.articleTypeId
            },
            boost: 8
          }];
        }).slice(0, 20);
        return this.backendClient.rerankDeviceHubCandidates([...candidates], {
          state: normalizeHubContextState(this.settings.hub.manualMode),
          semanticPlace: this.settings.hub.manualPlace,
          mode: this.settings.hub.manualMode
        }, acceptedHabits);
      },
      onState: (state) => {
        this.localTapSelection.recordHubState(state);
        void this.rememberHubState(state);
      },
      onError: (error) => {
        this.settings.hub.lastError = messageForError(error).slice(0, 500);
      }
    });
    this.hubWriteback = new HubCaptureWritebackService({
      client: this.hubClient,
      captureService: this.captureService,
      getReceiverId: () => this.settings.hub.receiverId,
      getPrivateKey: () => this.hubReceiverPrivateKey(),
      resolveTarget: (writeTargetRef) => this.resolveHubWriteTarget(writeTargetRef),
      onError: (error) => {
        this.settings.hub.lastError = messageForError(error).slice(0, 500);
      }
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
      getQuestions: (filePath) => this.store.getQuestionsForFile(filePath),
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
            return this.store.getQuestionsForFile(activePath).filter((question) => question.status !== "ignored");
          },
          getActiveFileSuggestions: () => {
            const activePath = this.getActiveFile();
            return activePath ? this.store.getSuggestionsForFile(activePath) : [];
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
    this.configureDeviceHub();
    void this.configureCaptureBridge(false);
    this.registerInterval(window.setInterval(() => {
      void this.registerCapturePluginBridge(false);
    }, 30_000));

    this.app.workspace.onLayoutReady(() => {
      void this.refreshIndex();
      if (this.settings.autoOpenSidebar) {
        window.setTimeout(() => {
          void this.activateSidebar();
        }, 250);
      }
      void this.runSuggestionNotifications();
      void this.syncDeviceHub(false);
      void this.registerCapturePluginBridge(false);
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
    if (this.hubSyncTimer) {
      window.clearInterval(this.hubSyncTimer);
      this.hubSyncTimer = 0;
    }
    if (this.hubContextTimer) {
      window.clearTimeout(this.hubContextTimer);
      this.hubContextTimer = 0;
    }
    if (this.hubCandidateSyncTimer) {
      window.clearTimeout(this.hubCandidateSyncTimer);
      this.hubCandidateSyncTimer = 0;
    }
    this.learningEditQueue?.dispose();
    void this.externalApiServer?.stop();
    void this.capturePluginBridge?.remove("towrite-open-questions");
    void this.captureBridgeServer?.stop();
    this.deviceHub?.dispose();
    this.quote0SyncService?.stop();
    this.selectionToolbar?.destroy();
  }

  queryQuestions(query: OpenQuestionQuery = {}): OpenQuestion[] {
    return this.store.query(query);
  }

  getArticleSummary(filePath: string): ArticleSummary | undefined {
    return this.store.getArticleSummary(filePath);
  }

  getInboxSnapshot(): InboxSnapshot {
    return this.inboxIndex.getSnapshot();
  }

  refreshInboxIndex(): void {
    this.inboxIndex.rebuild();
    this.store.notify();
    this.queueDeviceHubSync();
  }

  async materializeInboxMetadata(): Promise<InboxMetadataBatchResult> {
    const result = await materializeInboxStageMetadata(this.app, this.settings.inbox);
    for (const path of result.updatedPaths) this.pendingWorkflowPaths.add(path);
    if (result.updatedPaths.length > 0) this.scheduleBackgroundRefresh(undefined, 900);
    this.inboxIndex.rebuild();
    this.store.notify();
    this.queueDeviceHubSync();
    return result;
  }

  getInboxItemDeviceEligibility(itemId: string): InboxDeviceEligibility {
    const item = this.inboxIndex.getItem(itemId);
    if (!item) {
      return {
        eligible: false,
        reason: this.settings.language === "zh" ? "笔记已被移动或删除" : "The note was moved or deleted"
      };
    }
    const privacy = this.hubPrivacyForPath(item.filePath, item.tags);
    if (privacy?.private || privacy?.excluded) {
      return {
        eligible: false,
        reason: this.settings.language === "zh" ? "已被本地隐私规则排除" : "Excluded by the local privacy policy"
      };
    }
    return { eligible: true };
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
      await this.indexer.indexFile(file, false);
      if (this.shouldBuildLocalKnowledgeIndex()) {
        await this.localKnowledgeIndex.upsert(this.app, file, this.settings.exportDirectory, this.getLocalKnowledgeScope());
      }
      await this.workflowIndex.upsert(file);
    } else {
      await this.indexer.removeFile(path, false);
      this.localKnowledgeIndex.remove(path);
      this.workflowIndex.removeFile(path);
    }
    if (this.settings.autoExport) {
      await this.exportNow(false, { rebuildWorkflow: false });
    }
    this.refreshEditorDecorations();
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
    this.inboxIndex.rebuild();
    await this.indexer.rebuildVault(false);
    await this.refreshSidecars({ rebuildWorkflow: false, notify: false });
    // Publish the core question index before optional knowledge/workflow scans.
    // The scans below are batched, and this yield lets Obsidian paint/respond.
    this.refreshEditorDecorations();
    this.store.notify();
    await yieldToEventLoop();
    if (this.shouldBuildLocalKnowledgeIndex()) {
      await this.localKnowledgeIndex.rebuild(this.app, this.settings.exportDirectory, this.getLocalKnowledgeScope());
    }
    await this.workflowIndex.rebuild();
    if (this.settings.autoExport) {
      await this.exportNow(false, { rebuildWorkflow: false });
    }
    this.aiService.refreshMissingForActiveNote(this.getActiveFile());
    this.refreshEditorDecorations();
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

  private scheduleBackgroundRefresh(filePath?: string, delayMs = 3500): void {
    if (filePath) {
      this.pendingWorkflowPaths.add(filePath);
    }
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
    if (Date.now() - this.lastEditorActivityAt < 1200) {
      this.scheduleBackgroundRefresh(undefined, 1200);
      return;
    }

    this.backgroundRefreshRunning = true;
    let paths: string[] = [];
    try {
      paths = Array.from(this.pendingWorkflowPaths);
      this.pendingWorkflowPaths.clear();
      const files = paths
        .map((path) => this.app.vault.getFileByPath(path))
        .filter((file): file is TFile => Boolean(file));
      if (files.length > 0) {
        await this.workflowIndex.upsertFiles(files);
      }
      if (this.settings.autoExport) {
        await this.exportNow(false, { rebuildWorkflow: false });
      }
      this.aiService.refreshMissingForActiveNote(this.getActiveFile());
      this.store.notify();
    } catch (error) {
      paths.forEach((path) => this.pendingWorkflowPaths.add(path));
      console.error("ToWrite background refresh failed", error);
    } finally {
      this.backgroundRefreshRunning = false;
      if (this.backgroundRefreshQueued) {
        this.backgroundRefreshQueued = false;
        this.scheduleBackgroundRefresh(undefined, 1200);
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

  subscribeActiveContext(listener: () => void): () => void {
    this.activeContextListeners.add(listener);
    return () => this.activeContextListeners.delete(listener);
  }

  private notifyActiveContext(): void {
    for (const listener of this.activeContextListeners) {
      listener();
    }
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
      aiAssistantState: this.aiAssistantState,
      captureBridgeState: this.localTapSelection?.serialize() ?? this.savedCaptureBridgeState
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
      ? this.store.getQuestionsForFile(activeFile)
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
        candidates: Array<{
          id: string;
          label: string;
          description: string;
          rule: object;
          evidence: HabitCandidate["evidence"];
        }>;
      }, { candidateId?: unknown; id?: unknown; label?: unknown; description?: unknown }>({
        schemaVersion: 1,
        candidates: pending.map(({ id, label, description, rule, evidence }) => ({
          id,
          label,
          description,
          // Routing target IDs may encode a local catalog entry. Backend only
          // receives the content-free rule shape needed to rewrite copy.
          rule: rule.kind === "routing"
            ? { kind: rule.kind, context: rule.context, targetKind: rule.targetKind }
            : rule,
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

  getCaptureBridgeStatus(): CaptureBridgeRuntimeStatus {
    const status = this.capturePluginBridge?.getStatus(this.captureBridgeServer?.isRunning() ?? false) ?? {
      running: false,
      pluginDetected: false,
      compatible: false,
      registered: false
    };
    return this.settings.captureBridge.lastError && !status.error
      ? { ...status, error: this.settings.captureBridge.lastError }
      : status;
  }

  getLocalCaptureTapUrl(): string {
    try {
      return buildLocalCaptureTapUri(
        this.settings.captureBridge.captureBaseUrl,
        this.settings.captureBridge.tapId
      );
    } catch {
      return "";
    }
  }

  getLocalCaptureNdefStatus(): { bytes: number; fits: boolean; error?: string } {
    const estimate = localCaptureNdefStatus(
      this.settings.captureBridge.captureBaseUrl,
      this.settings.captureBridge.tapId
    );
    if (estimate) return { bytes: estimate.totalBytes, fits: estimate.fits };
    try {
      buildLocalCaptureTapUri(this.settings.captureBridge.captureBaseUrl, this.settings.captureBridge.tapId);
      return { bytes: 0, fits: false };
    } catch (error) {
      return { bytes: 0, fits: false, error: messageForError(error) };
    }
  }

  async configureCaptureBridge(showNotice = true): Promise<void> {
    if (!this.captureBridgeServer || !this.capturePluginBridge) return;
    const bridge = this.settings.captureBridge;
    if (!Platform.isDesktopApp || !bridge.enabled || bridge.flow !== "local_capture") {
      await this.capturePluginBridge.remove("towrite-open-questions").catch(() => undefined);
      await this.captureBridgeServer.stop();
      if (showNotice && bridge.enabled && !Platform.isDesktopApp) {
        new Notice("Local Capture bridge is available only in Obsidian desktop.");
      }
      return;
    }
    try {
      await this.captureBridgeServer.restart();
      await this.registerCapturePluginBridge(false);
      if (showNotice) {
        const status = this.getCaptureBridgeStatus();
        new Notice(status.registered
          ? `Capture bridge connected on 127.0.0.1:${bridge.port}.`
          : `Capture bridge is listening, but Capture is not linked: ${status.error || "compatible Capture plugin not found"}`);
      }
    } catch (error) {
      bridge.lastError = messageForError(error).slice(0, 500);
      await this.savePluginData();
      if (showNotice) new Notice(`Capture bridge failed: ${bridge.lastError}`);
    }
  }

  async detectCapturePluginBridge(showNotice = true): Promise<CaptureBridgeRuntimeStatus> {
    const bridge = this.settings.captureBridge;
    const status = await this.capturePluginBridge.detect(this.captureBridgeServer.isRunning());
    const changed = hydrateCaptureBridgeSettings(bridge, status.capabilities);
    if (changed) await this.savePluginData();
    if (showNotice) {
      new Notice(status.compatible
        ? "Compatible Capture bridge detected."
        : `Capture bridge detection failed: ${status.error || "plugin unavailable"}`);
    }
    return status;
  }

  async registerCapturePluginBridge(showNotice = true): Promise<CaptureBridgeRuntimeStatus> {
    const bridge = this.settings.captureBridge;
    // Detect even when the listener is disabled. This lets either plugin load
    // first and persists Capture's trusted origin/owner as soon as it appears.
    const detected = await this.detectCapturePluginBridge(false);
    if (!bridge.enabled || bridge.flow !== "local_capture" || !this.captureBridgeServer.isRunning()) {
      if (showNotice) new Notice("Enable the local Capture Bridge before linking Capture.");
      return detected;
    }
    if (!detected.compatible) {
      bridge.lastError = detected.error ?? "Compatible Capture plugin is not loaded.";
      if (showNotice) new Notice(bridge.lastError);
      return detected;
    }
    const normalizedCaptureBaseUrl = normalizeCaptureBridgeBaseUrl(bridge.captureBaseUrl);
    if (!normalizedCaptureBaseUrl || !bridge.ownerLogin) {
      bridge.lastError = "Configure a canonical https://*.ts.net:8790 Capture origin and trusted Tailscale owner before linking.";
      await this.savePluginData();
      const status = this.getCaptureBridgeStatus();
      if (showNotice) new Notice(bridge.lastError);
      return status;
    }
    bridge.captureBaseUrl = normalizedCaptureBaseUrl;
    if (detected.capabilities?.tailscaleServeTrusted !== true) {
      bridge.lastError = "Capture has not confirmed trusted Tailscale Serve identity headers.";
      await this.savePluginData();
      const status = this.getCaptureBridgeStatus();
      if (showNotice) new Notice(bridge.lastError);
      return status;
    }
    const registeredAt = new Date().toISOString();
    const status = await this.capturePluginBridge.register({
      connectorId: "towrite-open-questions",
      callbackBaseUrl: `http://127.0.0.1:${bridge.port}`,
      callbackToken: bridge.callbackToken,
      tapIds: [bridge.tapId],
      ownerLogin: bridge.ownerLogin,
      registeredAt
    });
    const previousRegisteredAt = bridge.lastRegisteredAt;
    const previousError = bridge.lastError;
    if (status.registered) {
      const previousTimestamp = Date.parse(previousRegisteredAt);
      if (!Number.isFinite(previousTimestamp) || Date.now() - previousTimestamp >= 60 * 60_000) {
        bridge.lastRegisteredAt = registeredAt;
      }
    }
    bridge.lastError = status.error?.slice(0, 500) ?? "";
    if (bridge.lastRegisteredAt !== previousRegisteredAt || bridge.lastError !== previousError) {
      await this.savePluginData();
    }
    if (showNotice) new Notice(status.registered ? "ToWrite and Capture are linked." : `Capture link failed: ${bridge.lastError}`);
    return status;
  }

  async rotateLocalCaptureTapId(): Promise<string> {
    this.settings.captureBridge.tapId = generateCaptureTapId();
    this.captureBridgeCoordinator.clear();
    await this.savePluginData();
    if (this.settings.captureBridge.enabled
      && this.settings.captureBridge.flow === "local_capture"
      && this.captureBridgeServer.isRunning()) {
      await this.registerCapturePluginBridge(false);
    }
    return this.getLocalCaptureTapUrl();
  }

  async openLocalCaptureTap(): Promise<void> {
    const status = this.getCaptureBridgeStatus();
    if (!this.settings.captureBridge.enabled || !status.running || !status.registered) {
      throw new Error("Enable and link the local Capture Bridge before simulating a tap.");
    }
    if (status.compatible) {
      await this.capturePluginBridge.openPrefilledCapture({ tapId: this.settings.captureBridge.tapId });
      return;
    }
    const url = this.getLocalCaptureTapUrl();
    if (!url) throw new Error("Configure a valid Capture HTTPS origin first.");
    window.open(url, "_blank", "noopener,noreferrer");
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

  configureDeviceHub(): void {
    if (this.hubSyncTimer) {
      window.clearInterval(this.hubSyncTimer);
      this.hubSyncTimer = 0;
    }
    if (!this.deviceHub || !this.settings.hub.enabled) {
      return;
    }
    this.hubSyncTimer = window.setInterval(() => {
      void this.syncDeviceHub(false);
    }, Math.max(15, this.settings.hub.syncIntervalSeconds) * 1_000);
  }

  async testHubConnection(): Promise<HubCapabilities | undefined> {
    try {
      const capabilities = await this.deviceHub.testConnection();
      this.settings.hub.lastError = "";
      if (this.settings.hub.deviceId) {
        await this.refreshDeviceHubState(false);
      }
      await this.savePluginData();
      new Notice(`Device Hub V1 connected · max ${capabilities.maxCandidates} candidates.`);
      return capabilities;
    } catch (error) {
      const message = messageForError(error);
      this.settings.hub.lastError = message.slice(0, 500);
      await this.savePluginData();
      new Notice(`Device Hub connection failed: ${message}`);
      return undefined;
    }
  }

  async syncDeviceHub(showNotice = false): Promise<HubDeviceState | undefined> {
    if (!this.settings.hub.enabled) {
      if (showNotice) {
        new Notice("Enable Device Hub first.");
      }
      return undefined;
    }
    try {
      // Restore selected/displayed before deciding whether Agent may auto-select.
      // This prevents a restart from overwriting a manual selection that the
      // device has not acknowledged yet.
      if (!this.deviceHub.getState() && this.settings.hub.deviceId.trim()) {
        await this.deviceHub.refreshState();
      }
      let state = await this.deviceHub.sync();
      state = await this.applyDeviceHubSelectionPolicy(state);
      const writeback = await this.hubWriteback.processPending();
      this.settings.hub.lastSyncedAt = new Date().toISOString();
      this.settings.hub.lastError = writeback.conflicts > 0 || writeback.failed > 0
        ? `Device Hub writeback kept ${writeback.conflicts} conflict(s) and ${writeback.failed} failed capture(s) queued.`
        : "";
      await this.savePluginData();
      if (showNotice) {
        new Notice(state ? `Device Hub synced · state v${state.selected?.stateVersion ?? 0}.` : "Device Hub is not fully configured.");
      }
      return state;
    } catch (error) {
      const message = messageForError(error);
      this.settings.hub.lastError = message.slice(0, 500);
      await this.savePluginData();
      if (showNotice) {
        new Notice(`Device Hub sync failed: ${message}`);
      }
      return undefined;
    }
  }

  async sendQuestionToDeviceHub(questionId: string): Promise<HubDeviceState | undefined> {
    const entry = this.getDeviceContentLibrary().entries.find((item) => item.id === questionId);
    if (!entry?.inLibrary) {
      await this.updateQuestionDeliveryPolicy(questionId, { membership: "included" });
    }
    return this.sendLocalCandidateToDeviceHub(questionId);
  }

  async sendInboxItemToDeviceHub(itemId: string): Promise<HubDeviceState | undefined> {
    const eligibility = this.getInboxItemDeviceEligibility(itemId);
    if (!eligibility.eligible) throw new Error(eligibility.reason || "This Inbox note is not eligible.");
    return this.sendLocalCandidateToDeviceHub(itemId);
  }

  getEchoCardPresets(): readonly EchoCardReferencePreset[] {
    return ECHO_CARD_REFERENCE_PRESETS;
  }

  getEchoCards(): EchoCard[] {
    return normalizeEchoCards(this.settings.echoCards);
  }

  async createEchoCardFromPreset(presetId?: string): Promise<EchoCard> {
    // Creating an editor draft must not write data.json. The settings UI calls
    // upsertEchoCard only after the user explicitly saves (or sends) the card.
    return presetId ? clonePreset(presetId) : createEmptyEchoCard();
  }

  async upsertEchoCard(input: EchoCard): Promise<EchoCard> {
    const overLimit = (Object.entries(ECHO_CARD_HARD_LIMITS) as Array<[
      keyof typeof ECHO_CARD_HARD_LIMITS,
      number
    ]>).find(([field, limit]) => Array.from(String(input[field] ?? "")).length > limit);
    if (overLimit) {
      throw new Error(this.settings.language === "zh"
        ? `${overLimit[0]} 超过 ${overLimit[1]} 个字符，请先精简。`
        : `${overLimit[0]} exceeds ${overLimit[1]} characters. Shorten it before saving.`);
    }
    if (input.schedule?.enabled && !/^([01]\d|2[0-3]):[0-5]\d$/u.test(input.schedule.localTime.trim())) {
      throw new Error(this.settings.language === "zh"
        ? "固定显示时间必须使用 24 小时 HH:mm，例如 15:30。"
        : "Scheduled time must use 24-hour HH:mm, such as 15:30.");
    }
    const existing = this.settings.echoCards.find((card) => card.id === input.id);
    if (!existing && this.settings.echoCards.length >= ECHO_CARD_MAX_COUNT) {
      throw new Error(this.settings.language === "zh"
        ? `最多保存 ${ECHO_CARD_MAX_COUNT} 张 Echo 卡片，请先删除不再使用的卡片。`
        : `You can save up to ${ECHO_CARD_MAX_COUNT} Echo cards. Delete an unused card first.`);
    }
    const now = new Date().toISOString();
    const normalized = normalizeEchoCards([{
      ...input,
      createdAt: existing?.createdAt || input.createdAt || now,
      updatedAt: now
    }])[0];
    if (!normalized) {
      throw new Error(this.settings.language === "zh" ? "这张 Echo 卡片的数据无效。" : "This Echo card is invalid.");
    }
    const next = existing
      ? this.settings.echoCards.map((card) => card.id === normalized.id ? normalized : card)
      : [...this.settings.echoCards, normalized];
    this.settings.echoCards = normalizeEchoCards(next);
    if (!this.settings.echoCards.some((card) => card.id === normalized.id)) {
      throw new Error(this.settings.language === "zh" ? "Echo 卡片未能保存，请重试。" : "The Echo card could not be saved. Try again.");
    }
    await this.savePluginData();
    this.notifyUi();
    this.queueDeviceHubSync();
    return normalized;
  }

  async deleteEchoCard(cardId: string): Promise<void> {
    this.settings.echoCards = this.settings.echoCards.filter((card) => card.id !== cardId);
    await this.savePluginData();
    this.notifyUi();
    this.queueDeviceHubSync();
  }

  async sendEchoCardToDeviceHub(cardId: string): Promise<HubDeviceState | undefined> {
    const localId = echoCardLocalId(cardId);
    const candidate = this.buildHubCandidates(localId).find((item) => item.localId === localId);
    if (!candidate) {
      const card = this.settings.echoCards.find((item) => item.id === cardId);
      const layout = card ? validateEchoCardLayout(card) : undefined;
      if (layout && !layout.fits) {
        throw new Error(this.settings.language === "zh"
          ? "卡片内容超出 2.7 英寸布局预算，请先缩短标记出的字段。"
          : "The card exceeds the 2.7-inch layout budget. Shorten the highlighted fields first.");
      }
      throw new Error(this.settings.language === "zh"
        ? "卡片目标无效或被隐私规则排除。请使用已有 Markdown 笔记、授权文件夹或 Inbox。"
        : "The card target is invalid or excluded. Use an existing Markdown note, an authorized folder, or Inbox.");
    }
    return this.sendLocalCandidateToDeviceHub(localId);
  }

  private async sendLocalCandidateToDeviceHub(localId: string): Promise<HubDeviceState | undefined> {
    await this.localTapSelection.selectLocal(localId);
    if (!this.settings.hub.enabled) {
      new Notice(this.settings.captureBridge.flow === "local_capture"
        ? (this.settings.language === "zh" ? "已设为本地 NFC / Capture 当前内容。" : "Set as the current local NFC / Capture card.")
        : (this.settings.language === "zh" ? "请先在设置中启用并配对 Device Hub。" : "Enable and pair Device Hub in settings first."));
      return undefined;
    }
    if (this.hubCandidateSyncTimer) {
      window.clearTimeout(this.hubCandidateSyncTimer);
      this.hubCandidateSyncTimer = 0;
    }
    const previousHold = {
      until: this.settings.hub.manualHoldUntil,
      candidateId: this.settings.hub.manualHoldCandidateId,
      contentId: this.settings.hub.manualHoldContentId
    };
    try {
      if (this.hubCandidateSyncTimer) {
        window.clearTimeout(this.hubCandidateSyncTimer);
        this.hubCandidateSyncTimer = 0;
      }
      const holdMs = Math.max(0, this.settings.hub.manualHoldMinutes) * 60_000;
      this.settings.hub.manualHoldUntil = holdMs > 0 ? new Date(Date.now() + holdMs).toISOString() : "";
      this.settings.hub.manualHoldCandidateId = localId;
      this.settings.hub.manualHoldContentId = "";
      const state = await this.deviceHub.selectLocalCandidate(localId, this.buildHubCandidates(localId));
      await this.localTapSelection.rememberHubSelection(localId, state);
      this.settings.hub.manualHoldContentId = state.selected?.selectedContentId ?? "";
      await this.savePluginData();
      new Notice(this.settings.language === "zh" ? "已将这张卡设为墨水屏期望内容。" : "This card is now the desired e-ink content.");
      return state;
    } catch (error) {
      this.settings.hub.manualHoldUntil = previousHold.until;
      this.settings.hub.manualHoldCandidateId = previousHold.candidateId;
      this.settings.hub.manualHoldContentId = previousHold.contentId;
      const message = messageForError(error);
      new Notice(`${this.settings.language === "zh" ? "发送到墨水屏失败" : "Could not send to e-ink"}: ${message}`);
      throw error;
    }
  }

  getDeviceContentLibrary(): DeviceLibrarySnapshot {
    const hub = this.settings.hub;
    return buildDeviceLibrary(this.store?.query() ?? [], {
      mode: hub.selectionMode,
      autoAddSelections: hub.autoAddSelections,
      rotationIntervalMinutes: hub.rotationIntervalMinutes,
      manualHoldUntil: hub.manualHoldUntil,
      isPrivacyAllowed: (question) => this.hubPrivacyForPath(question.source.file, question.tags)?.excluded !== true
    });
  }

  async setDeviceHubSelectionMode(mode: HubSelectionMode): Promise<void> {
    if (!isHubSelectionMode(mode)) return;
    this.settings.hub.selectionMode = mode;
    this.settings.hub.autoSelect = mode === "agent";
    if (mode !== "rotation") {
      this.settings.hub.lastRotationCandidateId = "";
      this.settings.hub.lastRotationContentId = "";
    }
    await this.savePluginData();
    this.store.notify();
    this.queueDeviceHubSync();
  }

  async updateQuestionDeliveryPolicy(questionId: string, patch: Partial<QuestionDeliveryPolicy>): Promise<void> {
    const question = this.store.getQuestion(questionId);
    if (!question) return;
    const current = normalizeQuestionDeliveryPolicy(question.deliveryPolicy);
    const next: QuestionDeliveryPolicy = {
      ...current,
      ...patch,
      schedule: Object.prototype.hasOwnProperty.call(patch, "schedule") ? patch.schedule : current.schedule
    };
    await this.updateQuestionFromUi(questionId, { deliveryPolicy: next });
  }

  async toggleQuestionInDeviceLibrary(questionId: string): Promise<void> {
    const entry = this.getDeviceContentLibrary().entries.find((item) => item.id === questionId);
    if (!entry) return;
    await this.updateQuestionDeliveryPolicy(questionId, {
      membership: entry.inLibrary ? "excluded" : "included"
    });
  }

  async setQuestionDeviceSchedule(questionId: string, localTime?: string): Promise<void> {
    const normalized = String(localTime ?? "").trim();
    if (normalized && !/^([01]\d|2[0-3]):[0-5]\d$/u.test(normalized)) {
      throw new Error("Use a 24-hour HH:mm time such as 15:30.");
    }
    await this.updateQuestionDeliveryPolicy(questionId, {
      membership: "included",
      schedule: normalized ? {
        enabled: true,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        localTime: normalized,
        durationMinutes: 30
      } : undefined
    });
  }

  async advanceDeviceHub(): Promise<HubDeviceState | undefined> {
    const snapshot = this.getDeviceContentLibrary();
    const questionIds = snapshot.entries
      .filter((entry) => entry.inLibrary && entry.eligible && entry.rotationEligible)
      .map((entry) => entry.id);
    const echoIds = this.settings.echoCards
      .filter((card) => card.inLibrary && card.rotationEligible)
      .map((card) => echoCardLocalId(card))
      .filter((localId) => this.buildHubCandidates(localId).some((candidate) => candidate.localId === localId));
    const pool = [...new Set([...questionIds, ...echoIds])];
    if (pool.length === 0) {
      throw new Error(this.settings.language === "zh" ? "设备内容库里没有可循环的卡片。" : "The device library has no rotation-eligible cards.");
    }
    const currentId = this.settings.hub.lastRotationCandidateId || this.settings.hub.manualHoldCandidateId;
    const currentIndex = pool.indexOf(currentId);
    const nextId = pool[(currentIndex + 1 + pool.length) % pool.length] ?? pool[0];
    this.settings.hub.manualHoldUntil = "";
    this.settings.hub.manualHoldCandidateId = "";
    this.settings.hub.manualHoldContentId = "";
    await this.localTapSelection.selectLocal(nextId);
    if (!this.settings.hub.enabled) {
      this.settings.hub.lastRotationCandidateId = nextId;
      this.settings.hub.rotationCursor = (pool.indexOf(nextId) + 1) % pool.length;
      await this.savePluginData();
      return undefined;
    }
    const state = await this.deviceHub.selectLocalCandidate(nextId, this.buildHubCandidates(nextId), {
      reason: "manual",
      policyVersion: "towrite-user-next-v1",
      modelVersion: "user-next"
    });
    await this.localTapSelection.rememberHubSelection(nextId, state);
    this.settings.hub.lastRotationCandidateId = nextId;
    this.settings.hub.lastRotationContentId = state.selected?.selectedContentId ?? "";
    this.settings.hub.rotationCursor = (pool.indexOf(nextId) + 1) % pool.length;
    await this.savePluginData();
    return state;
  }

  async refreshDeviceHubState(showNotice = true): Promise<HubDeviceState | undefined> {
    try {
      const state = await this.deviceHub.refreshState();
      if (state) {
        this.settings.hub.lastError = "";
        await this.savePluginData();
      }
      if (showNotice && state) {
        new Notice(`Device Hub state v${state.selected?.stateVersion ?? 0} refreshed.`);
      }
      return state;
    } catch (error) {
      const message = messageForError(error);
      this.settings.hub.lastError = message.slice(0, 500);
      await this.savePluginData();
      if (showNotice) {
        new Notice(`Device Hub state failed: ${message}`);
      }
      return undefined;
    }
  }

  queueDeviceHubContext(): void {
    if (this.hubContextTimer) {
      window.clearTimeout(this.hubContextTimer);
    }
    this.hubContextTimer = window.setTimeout(() => {
      this.hubContextTimer = 0;
      const state = normalizeHubContextState(this.settings.hub.manualMode);
      void this.deviceHub.setManualContext(state, this.settings.hub.manualPlace).catch(async (error: unknown) => {
        this.settings.hub.lastError = messageForError(error).slice(0, 500);
        await this.savePluginData();
      });
    }, 600);
  }

  private shouldHubAgentAutoSelect(now = new Date()): boolean {
    const hub = this.settings.hub;
    if (hub.selectionMode !== "agent" || normalizeHubContextState(hub.manualMode) === "do_not_disturb") {
      return false;
    }
    if (isManualHoldActive(hub.manualHoldUntil, now)) {
      return false;
    }
    const state = this.deviceHub?.getState();
    return !state || !hubStateWaitingForDisplay(state);
  }

  private async applyDeviceHubSelectionPolicy(state: HubDeviceState | undefined): Promise<HubDeviceState | undefined> {
    if (!state) return state;
    const hub = this.settings.hub;
    const now = new Date();
    if (hub.selectionMode === "manual" || hub.selectionMode === "agent") return state;
    if (normalizeHubContextState(hub.manualMode) === "do_not_disturb") return state;
    if (isManualHoldActive(hub.manualHoldUntil, now) || hubStateWaitingForDisplay(state)) return state;

    const library = this.getDeviceContentLibrary();
    if (hub.selectionMode === "schedule") {
      const consumedOccurrences = normalizeScheduleOccurrenceIds(hub.scheduleOccurrenceIds, hub.lastScheduleOccurrenceId);
      const questionChoice = scheduledLibraryChoice(library.entries, now, consumedOccurrences);
      const scheduledEcho = scheduledEchoCardChoice(this.settings.echoCards, now, consumedOccurrences);
      const echoChoice = scheduledEcho
        && this.buildHubCandidates(scheduledEcho.localId).some((candidate) => candidate.localId === scheduledEcho.localId)
        ? scheduledEcho
        : undefined;
      const choiceId = questionChoice?.entry.id ?? echoChoice?.localId;
      const occurrenceId = questionChoice?.occurrenceId ?? echoChoice?.occurrenceId;
      if (!choiceId || !occurrenceId) return state;
      const selected = await this.deviceHub.selectLocalCandidate(choiceId, this.buildHubCandidates(choiceId), {
        reason: "policy",
        policyVersion: "towrite-schedule-v1",
        modelVersion: "deterministic-schedule"
      });
      await this.localTapSelection.rememberHubSelection(choiceId, selected);
      hub.lastScheduleOccurrenceId = occurrenceId;
      hub.scheduleOccurrenceIds = normalizeScheduleOccurrenceIds([...consumedOccurrences, occurrenceId]);
      await this.savePluginData();
      return selected;
    }

    if (!canAdvanceRotation(state, hub.lastRotationContentId, hub.rotationIntervalMinutes, now)) return state;
    const questionIds = library.entries
      .filter((entry) => entry.inLibrary && entry.eligible && entry.rotationEligible)
      .map((entry) => entry.id);
    const echoIds = this.settings.echoCards
      .filter((card) => card.inLibrary && card.rotationEligible)
      .map((card) => echoCardLocalId(card))
      .filter((localId) => this.buildHubCandidates(localId).some((candidate) => candidate.localId === localId));
    const pool = [...new Set([...questionIds, ...echoIds])];
    const choiceId = pool.length > 0 ? pool[hub.rotationCursor % pool.length] : undefined;
    if (!choiceId) return state;
    const selected = await this.deviceHub.selectLocalCandidate(choiceId, this.buildHubCandidates(choiceId), {
      reason: "policy",
      policyVersion: "towrite-rotation-ack-v1",
      modelVersion: "deterministic-rotation"
    });
    await this.localTapSelection.rememberHubSelection(choiceId, selected);
    hub.lastRotationCandidateId = choiceId;
    hub.lastRotationContentId = selected.selected?.selectedContentId ?? "";
    hub.rotationCursor = (pool.indexOf(choiceId) + 1) % pool.length;
    await this.savePluginData();
    return selected;
  }

  private queueDeviceHubSync(): void {
    if (!this.settings.hub.enabled) {
      return;
    }
    if (this.hubCandidateSyncTimer) {
      window.clearTimeout(this.hubCandidateSyncTimer);
    }
    this.hubCandidateSyncTimer = window.setTimeout(() => {
      this.hubCandidateSyncTimer = 0;
      void this.syncDeviceHub(false);
    }, 1_500);
  }

  getDeviceHubState(): HubDeviceState | undefined {
    return this.deviceHub?.getState() ?? (this.settings.hub.enabled ? {
      protocolVersion: "1",
      deviceId: this.settings.hub.deviceId,
      online: false,
      tapUrl: this.settings.hub.tapUrl || undefined
    } : undefined);
  }

  async sendDeviceHubFeedback(action: HubFeedbackAction): Promise<void> {
    try {
      await this.deviceHub.sendFeedback(action);
      this.settings.hub.lastError = "";
      await this.savePluginData();
    } catch (error) {
      this.settings.hub.lastError = messageForError(error).slice(0, 500);
      await this.savePluginData();
      throw error;
    }
  }

  getHubNdefStatus(): { bytes: number; fits: boolean; valid: boolean; errors: string[] } {
    if (!this.settings.hub.tapUrl) {
      return { bytes: 0, fits: false, valid: false, errors: ["Tap URL is not available yet."] };
    }
    const validation: Ntag213UriValidation = validateNtag213Uri(this.settings.hub.tapUrl);
    return {
      bytes: validation.estimate.totalBytes,
      fits: validation.estimate.fits,
      valid: validation.valid,
      errors: [...validation.errors]
    };
  }

  openDeviceHubTap(): void {
    const url = this.settings.hub.tapUrl;
    if (!url || !this.getHubNdefStatus().valid) {
      new Notice("Device Hub tap URL is unavailable or unsafe.");
      return;
    }
    activeWindow.open(url, "_blank", "noopener,noreferrer");
  }

  async generateHubReceiverKeyPair(): Promise<string> {
    const pair = await generateHubCaptureKeyPair();
    const publicKey = JSON.stringify(pair.publicKey);
    this.settings.hub.receiverPublicKeyJwk = publicKey;
    this.settings.hub.receiverPrivateKeyJwk = JSON.stringify(pair.privateKey);
    await this.savePluginData();
    return publicKey;
  }

  startHubEmailAuth(email: string): Promise<HubEmailChallenge> {
    return new HubAdminClient(this.settings.hub.baseUrl).startEmailAuth(email);
  }

  async verifyHubEmailAuth(email: string, challengeId: string, code: string): Promise<string> {
    const access = await new HubAdminClient(this.settings.hub.baseUrl).verifyEmailAuth(email, challengeId, code);
    return access.accessToken;
  }

  async provisionPersonalDeviceHub(accountAccessToken: string): Promise<HubPersonalProvisionResult> {
    const publicKeyText = this.settings.hub.receiverPublicKeyJwk;
    if (!publicKeyText) {
      throw new Error("Generate the local P-256 receiver key before provisioning Device Hub.");
    }
    let receiverPublicKey: JsonWebKey;
    try {
      receiverPublicKey = JSON.parse(publicKeyText) as JsonWebKey;
    } catch {
      throw new Error("The local Device Hub receiver public key is invalid.");
    }
    const result = await new HubAdminClient(this.settings.hub.baseUrl).provisionPersonalHub(accountAccessToken, {
      receiverPublicKey,
      receiverName: `${this.app.vault.getName()} · ToWrite Connector`,
      deviceName: "ToWrite E-ink Display"
    });
    this.settings.hub.receiverId = result.receiverId;
    this.settings.hub.receiverToken = result.pullToken;
    this.settings.hub.deviceId = result.deviceId;
    this.settings.hub.tapUrl = result.tapUrl;
    this.settings.hub.enabled = true;
    this.settings.hub.lastError = "";
    await this.savePluginData();
    this.configureDeviceHub();
    void this.syncDeviceHub(false);
    return result;
  }

  rotateHubDeviceSecret(accountAccessToken: string): Promise<HubDeviceSecretRotation> {
    if (!this.settings.hub.deviceId) {
      throw new Error("Configure a Device Hub device before rotating its secret.");
    }
    return new HubAdminClient(this.settings.hub.baseUrl)
      .rotateDeviceSecret(accountAccessToken, this.settings.hub.deviceId);
  }

  async rotateHubTapId(accountAccessToken: string): Promise<HubTapRotation> {
    if (!this.settings.hub.deviceId) {
      throw new Error("Configure a Device Hub device before rotating its NFC address.");
    }
    const result = await new HubAdminClient(this.settings.hub.baseUrl)
      .rotateTapId(accountAccessToken, this.settings.hub.deviceId);
    this.settings.hub.tapUrl = result.tapUrl;
    await this.savePluginData();
    return result;
  }

  getHubReceiverKeyStatus(): { configured: boolean; publicKeyJwk: string } {
    return {
      configured: Boolean(this.hubReceiverPrivateKey() && this.settings.hub.receiverPublicKeyJwk),
      publicKeyJwk: this.settings.hub.receiverPublicKeyJwk
    };
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

    this.patchQuestionState(id, patch);
    await this.savePluginData();
    this.queueDeviceHubSync();
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

    this.patchQuestionState(id, {
      notes: [...(question.notes ?? []), note]
    });
    await this.savePluginData();
    this.queueDeviceHubSync();
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
      this.patchQuestionState(id, statePatch);
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
  private savedCaptureBridgeState?: LocalTapSelectionState;

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
    this.savedCaptureBridgeState = data?.captureBridgeState;
  }

  private hubReceiverPrivateKey(): JsonWebKey | undefined {
    const value = this.settings.hub.receiverPrivateKeyJwk;
    if (!value) {
      return undefined;
    }
    try {
      const key = JSON.parse(value) as JsonWebKey;
      return key.kty === "EC" && key.crv === "P-256" && key.x && key.y && key.d
        ? key
        : undefined;
    } catch {
      return undefined;
    }
  }

  private async createTapSelectionSnapshot(reference: TapSelectionReference): Promise<TapSelectionSnapshot> {
    const localId = reference.localId?.trim();
    if (!localId) {
      throw new CaptureBridgeRequestError(
        409,
        "The displayed Hub content has no authenticated local target mapping. Refresh Device Hub state before tapping."
      );
    }
    const local = this.buildHubCandidates(localId).find((candidate) => candidate.localId === localId);
    if (!local || local.privacy?.private || local.privacy?.excluded) {
      throw new CaptureBridgeRequestError(409, "This local card is no longer authorized for Capture handoff.");
    }
    const targetPath = local.writeTargetLocalId?.trim() || this.settings.deviceCapture.inboxFile;
    const targetAction = local.writeTargetAction ?? "append";
    const inbox = targetPath === this.settings.deviceCapture.inboxFile && targetAction === "append";
    const targetFile = this.app.vault.getFileByPath(targetPath);
    if (targetAction === "append" && !inbox && !targetFile) {
      throw new CaptureBridgeRequestError(409, "The selected note no longer exists.");
    }
    if (targetAction === "append" && !inbox && this.hubPrivacyForPath(targetPath)?.excluded) {
      throw new CaptureBridgeRequestError(409, "The selected note is now excluded by the local privacy policy.");
    }
    const snapshotId = generateSnapshotId();
    const question = this.store.getQuestion(localId);
    // A custom Echo card may look like a question without being backed by an
    // OpenQuestion record. Only real question cards use the answer writeback.
    const intent: CaptureIntent = echoCardCaptureIntent(local.type, Boolean(question));
    const recommendationSettings = this.captureRecommendationSettings();
    const initialRevision = targetAction === "create"
      ? captureFolderRevision(targetPath, recommendationSettings.settingsRevision, local.writeTargetStageId)
      : targetFile
        ? captureContentRevision(await this.app.vault.read(targetFile))
        : MISSING_TARGET_REVISION;
    const candidate: CaptureTargetCandidate = {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      id: `bridge-target:${snapshotId}`,
      kind: targetAction === "create" ? (local.writeTargetKind ?? "folder") : inbox ? "inbox" : "existingNote",
      action: targetAction,
      path: targetPath,
      reason: "Frozen local NFC Capture target",
      confidence: "strong",
      score: 1,
      targetRevision: initialRevision,
      heading: local.writeTargetHeading ?? this.settings.deviceCapture.appendHeading,
      stageId: local.writeTargetStageId
    };
    const previewDraft: CaptureDraft = {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      id: `preview:${snapshotId}`,
      intent,
      body: "Capture bridge revision preview",
      tags: [],
      links: [],
      source: {
        file: question?.source.file || (targetAction === "append" ? local.writeTargetLocalId : undefined),
        questionId: question?.id,
        entryPoint: "capture-bridge-preview"
      }
    };
    const preview = await this.captureService.preview(previewDraft, candidate);
    candidate.targetRevision = preview.targetRevision;
    const card = reference.card;
    return {
      protocolVersion: CAPTURE_BRIDGE_PROTOCOL_VERSION,
      snapshotId,
      source: reference.source,
      sourceContentId: reference.contentId,
      localId,
      createdAt: new Date().toISOString(),
      contentType: card?.contentType ?? local.type,
      title: card?.title || local.display.title || "Untitled",
      prompt: card?.prompt || local.display.prompt || "Continue writing",
      body: card?.body ?? local.display.body,
      allowedActions: card?.actions ?? [...local.allowedActions],
      intent,
      candidate,
      sourceContext: {
        file: question?.source.file || (targetAction === "append" ? local.writeTargetLocalId : undefined),
        questionId: question?.id
      }
    };
  }

  private async validateTapSelectionSnapshot(snapshot: TapSelectionSnapshot, draft: CaptureDraft): Promise<void> {
    const candidate = snapshot.candidate;
    if (candidate.action === "append") {
      const inbox = candidate.path === this.settings.deviceCapture.inboxFile;
      if (!inbox && candidate.path !== snapshot.sourceContext?.file) {
        throw new CaptureBridgeRequestError(409, "The frozen append target is no longer authorized for this card.");
      }
      if (!inbox && (!this.app.vault.getFileByPath(candidate.path) || this.hubPrivacyForPath(candidate.path)?.excluded)) {
        throw new CaptureBridgeRequestError(409, "The frozen append target no longer exists or is excluded.");
      }
    } else {
      const current = this.captureRecommendationSettings();
      const allowedFolders = new Set([
        ...current.targetFolders,
        ...(current.workflowStages ?? []).flatMap((stage) => stage.folderPrefixes)
      ].map((path) => normalizeFolderPath(path)));
      if (!allowedFolders.has(normalizeFolderPath(candidate.path))) {
        throw new CaptureBridgeRequestError(409, "The frozen create folder is no longer in the authorized Capture catalog.");
      }
      const expectedFolderRevision = captureFolderRevision(
        candidate.path,
        current.settingsRevision,
        candidate.stageId
      );
      if (expectedFolderRevision !== candidate.targetRevision) {
        throw new CaptureBridgeRequestError(409, "Capture target settings changed after the handoff was created.");
      }
    }
    const currentPreview = await this.captureService.preview(draft, candidate);
    if (currentPreview.targetRevision !== candidate.targetRevision) {
      throw new CaptureBridgeRequestError(409, "Capture target changed after preview. Refresh the handoff before saving.");
    }
  }

  private async validatePersistedTapSelectionSnapshot(snapshot: TapSelectionSnapshot): Promise<void> {
    const localId = snapshot.localId?.trim();
    if (!localId) {
      throw new CaptureBridgeRequestError(409, "Persisted Capture selection has no authenticated local mapping.");
    }
    const current = this.buildHubCandidates(localId).find((candidate) => candidate.localId === localId);
    if (!current || current.privacy?.private || current.privacy?.excluded) {
      throw new CaptureBridgeRequestError(409, "Persisted Capture selection is no longer eligible.");
    }
    const expectedPath = current.writeTargetLocalId?.trim() || this.settings.deviceCapture.inboxFile;
    if (snapshot.candidate.path !== expectedPath) {
      throw new CaptureBridgeRequestError(409, "Persisted Capture target no longer matches the selected card.");
    }
    const draft: CaptureDraft = {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      id: `validate:${generateSnapshotId()}`,
      intent: snapshot.intent,
      body: "Capture bridge persisted target validation",
      tags: [],
      links: [],
      source: {
        file: snapshot.sourceContext?.file,
        questionId: snapshot.sourceContext?.questionId,
        entryPoint: "capture-bridge-validation"
      }
    };
    await this.validateTapSelectionSnapshot(snapshot, draft);
  }

  private async commitTapBridgeCapture(
    snapshot: TapSelectionSnapshot,
    draft: CaptureDraft
  ): Promise<CaptureCommitResult> {
    await this.validateTapSelectionSnapshot(snapshot, draft);
    const capture = await this.captureService.commit({
      draft,
      candidate: snapshot.candidate,
      targetRevision: snapshot.candidate.targetRevision
    });
    if (snapshot.intent !== "answer") return capture;

    const questionId = snapshot.sourceContext?.questionId;
    const question = questionId ? this.store.getQuestion(questionId) : undefined;
    if (!questionId || !question) {
      await this.rollbackBridgeCapture(capture);
      throw new CaptureBridgeRequestError(409, "The source question no longer exists.");
    }
    const activity = buildQuestionCaptureActivity({
      captureId: draft.id,
      questionId,
      body: draft.body,
      finalPath: capture.finalPath
    });
    const existing = (question.notes ?? []).filter((note) => note.metadata?.capture_id === draft.id);
    if (existing.length > 1) {
      if (!capture.idempotent) await this.rollbackBridgeCapture(capture);
      throw new CaptureBridgeRequestError(409, "Multiple question activities use this Capture ID.");
    }
    if (existing[0]) {
      if (!isMatchingQuestionCaptureActivity(existing[0], draft.id, activity)) {
        if (!capture.idempotent) await this.rollbackBridgeCapture(capture);
        throw new CaptureBridgeRequestError(409, "Question activity changed after this Capture was committed.");
      }
      return capture;
    }

    try {
      const updated = await this.appendQuestionNoteFromExternal(
        questionId,
        activity.text,
        "towrite-capture-bridge/v1",
        {
          capture_id: draft.id,
          activity_digest: activity.digest,
          source_device: "nfc-capture",
          source_file: snapshot.sourceContext?.file,
          input_mode: "answer",
          created_at: capture.createdAt
        }
      );
      if (!updated) throw new Error("The source question disappeared while saving its activity.");
      return capture;
    } catch (error) {
      await this.rollbackBridgeCapture(capture);
      throw error;
    }
  }

  private async rollbackBridgeCapture(capture: CaptureCommitResult): Promise<void> {
    if (capture.idempotent) {
      throw new CaptureBridgeRequestError(409, "Question activity failed during an idempotent retry; the existing Capture was preserved.");
    }
    if (!capture.undoToken) {
      throw new CaptureBridgeRequestError(409, "Capture activity failed and the written block is no longer safe to roll back.");
    }
    try {
      await this.captureService.undo(capture.undoToken, capture.captureId);
    } catch (error) {
      throw new CaptureBridgeRequestError(409, `Capture activity failed and rollback was unsafe: ${messageForError(error)}`);
    }
  }

  private async undoTapBridgeCapture(captureId: string, undoToken: string): Promise<{ undone: boolean }> {
    const matches: Array<{ question: OpenQuestion; note: OpenQuestionNote }> = [];
    for (const question of this.store.query()) {
      for (const note of question.notes ?? []) {
        if (note.metadata?.capture_id === captureId) matches.push({ question, note });
      }
    }
    if (matches.length > 1) {
      throw new CaptureBridgeRequestError(409, "Multiple question activities use this Capture ID.");
    }
    const activity = matches[0];
    if (activity) {
      if (!hasValidQuestionCaptureActivityIntegrity(activity.note, captureId, activity.question.id)) {
        throw new CaptureBridgeRequestError(409, "Question activity changed and cannot be safely undone.");
      }
    }
    const result = await this.captureService.undo(undoToken, captureId);
    if (!result.undone || !activity) return { undone: result.undone };
    this.patchQuestionState(activity.question.id, {
      notes: (activity.question.notes ?? []).filter((note) => note.id !== activity.note.id)
    });
    await this.savePluginData();
    this.queueDeviceHubSync();
    if (this.settings.autoExport) await this.exportNow(false);
    return { undone: true };
  }

  private async localIdForHubRefs(candidateRef?: string, writeTargetRef?: string): Promise<string | undefined> {
    if (!candidateRef) return undefined;
    for (const candidate of this.buildHubCandidates()) {
      if (candidate.privacy?.private || candidate.privacy?.excluded) continue;
      const expectedCandidateRef = await createOpaqueHubRef("candidate", candidate.localId, this.settings.hub.referenceSecret);
      if (candidateRef !== expectedCandidateRef) continue;
      if (writeTargetRef) {
        if (!candidate.writeTargetLocalId) continue;
        const expectedTargetRef = await createOpaqueHubRef("target", candidate.writeTargetLocalId, this.settings.hub.referenceSecret);
        if (writeTargetRef !== expectedTargetRef) continue;
      }
      return candidate.localId;
    }
    return undefined;
  }

  private async resolveHubWriteTarget(writeTargetRef: string): Promise<CaptureTargetCandidate | undefined> {
    const normalizedRef = writeTargetRef.trim();
    let localPath = "";
    let matchedLocalCandidate: LocalHubCandidate | undefined;
    if (!normalizedRef) {
      localPath = this.settings.deviceCapture.inboxFile;
    } else {
      const eligible = this.buildHubCandidates().filter((candidate) => (
        Boolean(candidate.writeTargetLocalId)
        && !candidate.privacy?.private
        && !candidate.privacy?.noAi
        && !candidate.privacy?.excluded
      ));
      const uniqueLocalTargets = [...new Set(eligible.map((candidate) => candidate.writeTargetLocalId!).filter(Boolean))];
      for (const candidatePath of uniqueLocalTargets) {
        const opaqueRef = await createOpaqueHubRef("target", candidatePath, this.settings.hub.referenceSecret);
        if (opaqueRef === normalizedRef) {
          localPath = candidatePath;
          matchedLocalCandidate = eligible.find((candidate) => candidate.writeTargetLocalId === candidatePath);
          break;
        }
      }
      // A tap session can outlive the current top-20 recommendation batch (or
      // an Obsidian restart). Resolve the opaque ref against current local files
      // only as a background fallback; the Hub still never supplies a path.
      if (!localPath) {
        for (const file of this.app.vault.getMarkdownFiles()) {
          const privacy = this.hubPrivacyForPath(file.path);
          if (privacy?.private || privacy?.noAi || privacy?.excluded) {
            continue;
          }
          const opaqueRef = await createOpaqueHubRef("target", file.path, this.settings.hub.referenceSecret);
          if (opaqueRef === normalizedRef) {
            localPath = file.path;
            break;
          }
        }
      }
      if (!localPath) {
        return undefined;
      }
    }

    const action = matchedLocalCandidate?.writeTargetAction ?? "append";
    const inbox = localPath === this.settings.deviceCapture.inboxFile && action === "append";
    if (action === "append" && !inbox && !this.app.vault.getFileByPath(localPath)) {
      // Do not silently recreate a note that disappeared after it was shown.
      return undefined;
    }
    return {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      id: `hub-write:${normalizedRef || "inbox"}`,
      kind: action === "create" ? "folder" : inbox ? "inbox" : "existingNote",
      action,
      path: localPath,
      reason: "Device Hub frozen opaque write target",
      confidence: "strong",
      score: 1,
      targetRevision: action === "create"
        ? captureFolderRevision(
          localPath,
          this.captureRecommendationSettings().settingsRevision,
          matchedLocalCandidate?.writeTargetStageId
        )
        : MISSING_TARGET_REVISION,
      heading: matchedLocalCandidate?.writeTargetHeading ?? this.settings.deviceCapture.appendHeading,
      stageId: matchedLocalCandidate?.writeTargetStageId
    };
  }

  private buildHubCandidates(preferredLocalId?: string): LocalHubCandidate[] {
    const now = new Date();
    const library = this.getDeviceContentLibrary();
    const libraryById = new Map(library.entries.map((entry) => [entry.id, entry]));
    const leaseMinutes = Math.max(10, Math.min(120, this.settings.hub.syncIntervalSeconds / 60 * 3));
    const leaseExpiresAt = new Date(now.getTime() + leaseMinutes * 60_000).toISOString();
    const acceptedHabits = this.learningService.getAcceptedHabits().filter((habit) => (
      habit.rule.kind === "time-stage"
      && isInTimeWindow(now, habit.rule.timeWindow, -now.getTimezoneOffset())
    ));
    const articleByPath = new Map(this.store.getArticleSummaries().map((article) => [article.filePath, article]));
    const candidates = this.pushEngine.getCandidates(now)
      .filter((candidate) => candidate.type !== "home-summary")
      .filter((candidate) => {
        const localId = candidate.questionId || candidate.id;
        const entry = libraryById.get(localId);
        if (!entry?.inLibrary || !entry.eligible) return false;
        if (preferredLocalId === localId) return true;
        if (this.settings.hub.selectionMode === "agent") return entry.agentEligible;
        if (this.settings.hub.selectionMode === "rotation") return entry.rotationEligible;
        if (this.settings.hub.selectionMode === "schedule") return Boolean(entry.schedule?.enabled);
        return true;
      })
      .map((candidate): LocalHubCandidate => {
        const article = candidate.sourceFile ? articleByPath.get(candidate.sourceFile) : undefined;
        const habitMatch = acceptedHabits.some((habit) => {
          if (habit.rule.kind !== "time-stage") return false;
          if (habit.rule.workflowStageId && habit.rule.workflowStageId !== (candidate.workflowStageId || article?.stageId)) return false;
          if (habit.rule.articleTypeId && habit.rule.articleTypeId !== article?.typeId) return false;
          return true;
        });
        const type = hubContentTypeForCandidate(candidate);
        const zh = this.settings.language === "zh";
        const genericPrompt = type === "question_prompt"
          ? (zh ? "继续处理这个未解决问题" : "Continue this unresolved question")
          : type === "stale_note_nudge"
            ? (zh ? "给这篇笔记补充一个小步骤" : "Add one small step to this note")
            : (zh ? "继续写这篇笔记" : "Continue writing this note");
        const selectionTitle = candidate.lane === "write"
          ? (zh ? "来自划线的 ToWrite" : "ToWrite from selection")
          : (zh ? "来自划线的 ToThink" : "ToThink from selection");
        return {
          localId: candidate.id,
          type,
          display: {
            title: candidate.sourceRule === "selection" && !this.settings.hub.shareDisplayBody
              ? selectionTitle
              : candidate.title || candidate.sourceTitle || "Untitled",
            body: this.settings.hub.shareDisplayBody ? candidate.body.slice(0, 1_200) : undefined,
            prompt: this.settings.hub.shareDisplayBody
              ? (candidate.nextAction || candidate.note || genericPrompt).slice(0, 400)
              : genericPrompt
          },
          sourceLocalId: candidate.sourceFile ? `${candidate.sourceFile}:${candidate.questionId || candidate.id}` : candidate.id,
          writeTargetLocalId: candidate.sourceFile,
          writeTargetKind: "existingNote",
          writeTargetAction: "append",
          writeTargetHeading: this.settings.deviceCapture.appendHeading,
          allowedActions: candidate.type === "question"
            ? ["open", "respond", "useful", "later", "skip"]
            : ["open", "capture", "useful", "later", "skip"],
          reasonCode: candidate.reminderDue
            ? "due_reminder"
            : habitMatch
              ? "accepted_habit"
              : candidate.stale
                ? "stale_note"
                : candidate.type === "question"
                  ? "unresolved_question"
                  : "local_recommendation",
          score: Math.min(1, hubScoreForCandidate(candidate) + (habitMatch ? 0.1 : 0)),
          policyBasis: candidate.reminderDue ? "due" : habitMatch ? "accepted_habit" : "general",
          // A due reminder may break the server-side hold. Accepted habits may
          // vibrate, but do not displace a held card solely due to urgency.
          urgency: candidate.reminderDue ? 1 : habitMatch ? 0.7 : 0,
          // Eligibility lease: content missing from future batches naturally
          // becomes unselectable even before the Hub gains explicit withdraw.
          expiresAt: leaseExpiresAt,
          privacy: this.hubPrivacyForCandidate(candidate)
        };
      });

    const authorizedCreateFolders = new Set([
      ...this.settings.deviceCapture.targetFolders,
      ...this.settings.workflowStages.stages.flatMap((stage) => stage.folderPrefixes)
    ].map((path) => normalizeFolderPath(path)).filter(Boolean));
    for (const card of this.settings.echoCards) {
      const localId = echoCardLocalId(card);
      const manuallyRequested = preferredLocalId === localId;
      if (!isEchoCardEligibleForMode(card, this.settings.hub.selectionMode, manuallyRequested)) continue;
      if (!validateEchoCardLayout(card).fits) continue;

      const targetPath = normalizeVaultPath(card.targetPath || this.settings.deviceCapture.inboxFile);
      const target = this.app.vault.getAbstractFileByPath(targetPath);
      const isInbox = targetPath === normalizeVaultPath(this.settings.deviceCapture.inboxFile);
      const isMarkdown = target instanceof TFile && target.extension.toLowerCase() === "md";
      const isCreateFolder = authorizedCreateFolders.has(normalizeFolderPath(targetPath))
        && (!target || target instanceof TFolder);
      if (!isInbox && !isMarkdown && !isCreateFolder) continue;

      const action = isCreateFolder && !isInbox && !isMarkdown ? "create" : "append";
      const privacy = this.hubPrivacyForPath(targetPath);
      if (!privacy || privacy.private || privacy.excluded) continue;
      candidates.push({
        localId,
        type: card.contentType,
        display: composeEchoCardDisplay(card),
        sourceLocalId: localId,
        writeTargetLocalId: targetPath,
        writeTargetKind: action === "create" ? "folder" : isInbox ? "inbox" : "existingNote",
        writeTargetAction: action,
        writeTargetHeading: this.settings.deviceCapture.appendHeading,
        allowedActions: [...new Set(card.actions)].slice(0, 3),
        reasonCode: card.disclosure === "none" ? "echo_card" : "echo_card_ai_disclosed",
        score: manuallyRequested ? 1 : 0.5,
        policyBasis: "general",
        urgency: 0,
        expiresAt: leaseExpiresAt,
        privacy
      });
    }

    const includeInbox = this.settings.inbox.includeInDeviceCandidates;
    const inboxPool = this.inboxIndex.getCandidateItems(8, preferredLocalId);
    for (const item of inboxPool) {
      if (!includeInbox && item.id !== preferredLocalId) continue;
      const privacy = this.hubPrivacyForPath(item.filePath, item.tags);
      if (privacy?.private || privacy?.excluded) continue;
      const ageDays = Math.max(0, (now.getTime() - Date.parse(item.updatedAt)) / 86_400_000);
      candidates.push({
        localId: item.id,
        type: "note_continue",
        display: {
          title: item.title,
          prompt: this.settings.language === "zh" ? "整理或继续这条 Inbox 笔记" : "Organize or continue this Inbox note"
        },
        sourceLocalId: item.filePath,
        writeTargetLocalId: item.filePath,
        writeTargetKind: "existingNote",
        writeTargetAction: "append",
        writeTargetHeading: this.settings.deviceCapture.appendHeading,
        allowedActions: ["open", "capture", "useful", "later", "skip"],
        reasonCode: "inbox_pending",
        score: Math.max(0.3, 0.52 - Math.min(ageDays, 90) / 900),
        policyBasis: "general",
        urgency: 0,
        expiresAt: leaseExpiresAt,
        privacy
      });
    }

    const blankCreateFolder = this.settings.deviceCapture.targetFolders[0]?.trim();
    candidates.push({
      localId: "towrite:blank-capture",
      type: "blank_capture",
      display: {
        title: this.settings.language === "zh" ? "快速记录" : "Quick capture",
        prompt: this.settings.language === "zh" ? "记下此刻的一句话" : "Capture one thought from this moment"
      },
      writeTargetLocalId: blankCreateFolder || this.settings.deviceCapture.inboxFile,
      writeTargetKind: blankCreateFolder ? "folder" : "inbox",
      writeTargetAction: blankCreateFolder ? "create" : "append",
      writeTargetHeading: this.settings.deviceCapture.appendHeading,
      allowedActions: ["capture", "later", "skip"],
      reasonCode: "blank_capture_fallback",
      score: 0.25,
      policyBasis: "general",
      urgency: 0
    });
    const sorted = candidates.sort((left, right) => right.score - left.score);
    const preferred = preferredLocalId ? sorted.find((candidate) => candidate.localId === preferredLocalId) : undefined;
    return preferred
      ? [preferred, ...sorted.filter((candidate) => candidate.localId !== preferred.localId)].slice(0, 20)
      : sorted.slice(0, 20);
  }

  private hubPrivacyForCandidate(candidate: PushCandidate): NonNullable<LocalHubCandidate["privacy"]> {
    return this.hubPrivacyForPath(candidate.sourceFile || "", candidate.tags);
  }

  private hubPrivacyForPath(path: string, candidateTags: readonly string[] = []): NonNullable<LocalHubCandidate["privacy"]> {
    if (!path) {
      return { excluded: true };
    }
    const normalizedPath = path.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
    const lowerPath = normalizedPath.toLowerCase();
    const scope = this.settings.deviceCapture;
    const includes = scope.includeFolders.map((folder) => normalizeFolderPath(folder).toLowerCase()).filter(Boolean);
    const excludes = scope.excludeFolders.map((folder) => normalizeFolderPath(folder).toLowerCase()).filter(Boolean);
    const excludedByPath = (includes.length > 0 && !includes.some((folder) => lowerPath === folder || lowerPath.startsWith(`${folder}/`)))
      || excludes.some((folder) => lowerPath === folder || lowerPath.startsWith(`${folder}/`));

    const file = this.app.vault.getAbstractFileByPath(normalizedPath);
    const excludedAttachment = file instanceof TFile && file.extension.toLowerCase() !== "md";
    const cache = file instanceof TFile ? this.app.metadataCache.getFileCache(file) : null;
    const frontmatter = cache?.frontmatter && typeof cache.frontmatter === "object"
      ? cache.frontmatter as Record<string, unknown>
      : {};
    const tags = new Set([
      ...candidateTags,
      ...(cache?.tags ?? []).map((tag) => tag.tag),
      ...frontmatterTags(frontmatter)
    ].map((tag) => tag.toLowerCase().replace(/^#/u, "")));
    const deniedTags = new Set(scope.excludeTags.map((tag) => tag.toLowerCase().replace(/^#/u, "")));
    const excludedByTag = [...tags].some((tag) => deniedTags.has(tag));
    const deniedFrontmatter = new Set(scope.excludeFrontmatter.map((key) => key.toLowerCase()));
    const excludedByFrontmatter = Object.entries(frontmatter).some(([key, value]) => (
      deniedFrontmatter.has(key.toLowerCase()) && privacyFlagEnabled(value)
    ));
    const noCloud = tags.has("no-cloud")
      || tags.has("no_cloud")
      || privacyFlagEnabled(frontmatter.no_cloud)
      || privacyFlagEnabled(frontmatter["no-cloud"]);
    return {
      private: tags.has("private") || privacyFlagEnabled(frontmatter.private),
      noAi: tags.has("no-ai") || tags.has("no_ai") || privacyFlagEnabled(frontmatter.no_ai),
      excluded: excludedAttachment || excludedByPath || excludedByTag || excludedByFrontmatter || noCloud
    };
  }

  private async rememberHubState(state: HubDeviceState): Promise<void> {
    const hub = this.settings.hub;
    const selectedLocalId = await this.localIdForHubRefs(
      state.selected?.candidateRef,
      state.selected?.writeTargetRef
    ) || (state.selected?.selectedContentId === hub.manualHoldContentId ? hub.manualHoldCandidateId : undefined);
    const displayedLocalId = await this.localIdForHubRefs(
      state.displayed?.candidateRef,
      state.displayed?.writeTargetRef
    ) || (state.displayed?.contentId === hub.manualHoldContentId ? hub.manualHoldCandidateId : undefined);
    await this.localTapSelection.rememberHubStateMappings(state, {
      selectedLocalId: selectedLocalId || undefined,
      displayedLocalId: displayedLocalId || undefined
    });
    hub.lastStateVersion = state.selected?.stateVersion ?? state.displayed?.stateVersion ?? 0;
    hub.lastSelectedContentId = state.selected?.selectedContentId ?? "";
    hub.lastDisplayedContentId = state.displayed?.contentId ?? "";
    if (hub.manualHoldContentId
      && state.displayed?.contentId === hub.manualHoldContentId
      && hub.manualHoldMinutes > 0) {
      const displayedAt = Date.parse(state.displayed.displayedAt);
      const ackBasedHoldUntil = Number.isFinite(displayedAt)
        ? new Date(displayedAt + hub.manualHoldMinutes * 60_000).toISOString()
        : "";
      if (ackBasedHoldUntil && Date.parse(ackBasedHoldUntil) > Date.parse(hub.manualHoldUntil || "")) {
        hub.manualHoldUntil = ackBasedHoldUntil;
      }
    }
    if (state.tapUrl) {
      const validation = validateNtag213Uri(state.tapUrl);
      if (validation.valid) {
        hub.tapUrl = state.tapUrl;
      }
    }
    await this.savePluginData();
    this.store.notify();
  }

  private createUiApi(): ToWriteUiApi {
    return {
      getActiveFile: () => this.getActiveFile(),
      getActiveLineRange: () => this.getActiveLineRange(),
      getQuestions: (query = {}) => {
        if (query.scope === "active-file" && !query.filePath) {
          return [];
        }
        if (query.filePath) {
          return filterQuestions(this.store.getQuestionsForFile(query.filePath), query);
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
      getInboxSnapshot: () => this.getInboxSnapshot(),
      getInboxItemDeviceEligibility: (id) => this.getInboxItemDeviceEligibility(id),
      getDeviceHubState: () => this.getDeviceHubState(),
      getDeviceContentLibrary: () => this.getDeviceContentLibrary(),
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
      syncDeviceHub: () => this.syncDeviceHub(false),
      sendQuestionToDeviceHub: (id) => this.sendQuestionToDeviceHub(id),
      sendInboxItemToDeviceHub: (id) => this.sendInboxItemToDeviceHub(id),
      advanceDeviceHub: () => this.advanceDeviceHub(),
      setDeviceHubSelectionMode: (mode) => this.setDeviceHubSelectionMode(mode),
      toggleQuestionInDeviceLibrary: (id) => this.toggleQuestionInDeviceLibrary(id),
      updateQuestionDeliveryPolicy: (id, patch) => this.updateQuestionDeliveryPolicy(id, patch),
      setQuestionDeviceSchedule: (id, localTime) => this.setQuestionDeviceSchedule(id, localTime),
      sendDeviceHubFeedback: (action) => this.sendDeviceHubFeedback(action),
      openDeviceHubTap: () => this.openDeviceHubTap(),
      acceptSuggestion: (id) => this.acceptSuggestion(id),
      editQuestion: (id) => this.editQuestion(id),
      deleteQuestion: (id) => this.deleteQuestion(id),
      pinQuestionToBlock: (id) => this.pinQuestionToBlock(id),
      refreshAi: (id) => this.refreshAi(id),
      refreshIndex: () => this.refreshIndex(),
      exportNow: () => this.exportNow(true),
      toggleCompactEditorDecorations: () => this.setCompactEditorDecorations(!this.settings.compactEditorDecorations),
      subscribe: (listener) => this.subscribe(listener),
      subscribeActiveContext: (listener) => this.subscribeActiveContext(listener)
    };
  }

  refreshEditorDecorations(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const codeMirror = (view?.editor as unknown as {
      cm?: { dispatch: (spec: { effects: ReturnType<typeof refreshQuestionDecorations.of> }) => void };
    } | undefined)?.cm;
    if (codeMirror) {
      codeMirror.dispatch({ effects: refreshQuestionDecorations.of(undefined) });
      return;
    }
    this.app.workspace.updateOptions();
  }

  private patchQuestionState(id: string, patch: Omit<Partial<StoredQuestionState>, "id">): void {
    this.store.patchQuestion(id, patch, false);
    this.workflowIndex.refreshQuestions();
    this.refreshEditorDecorations();
    this.store.notify();
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
      void (async () => {
        await this.indexer.indexFile(file, false);
        this.inboxIndex.upsert(file);
        if (this.shouldBuildLocalKnowledgeIndex()) {
          await this.localKnowledgeIndex.upsert(this.app, file, this.settings.exportDirectory, this.getLocalKnowledgeScope());
        }
        if (this.store.hasSidecarQuestionsForFile(file.path)) {
          await this.refreshSidecarsForFile(file.path, false);
        }
        this.refreshEditorDecorations();
        this.store.notify();
        this.scheduleBackgroundRefresh(file.path);
        this.queueDeviceHubSync();
      })().catch((error: unknown) => {
        console.error("ToWrite could not refresh the edited file", error);
      });
    }, 900, true);
    const notifyActiveContext = debounce(() => {
      this.notifyActiveContext();
    }, 120, true);
    const rebuildInboxAfterFolderChange = debounce(() => {
      this.inboxIndex.rebuild();
      this.store.notify();
      this.queueDeviceHubSync();
    }, 300, true);
    const pendingInboxMetadataFiles = new Map<string, TFile>();
    const refreshInboxFromMetadata = debounce(() => {
      let changed = false;
      for (const file of pendingInboxMetadataFiles.values()) {
        changed = this.inboxIndex.upsertFromMetadata(file) || changed;
      }
      pendingInboxMetadataFiles.clear();
      if (!changed) return;
      this.store.notify();
      this.queueDeviceHubSync();
    }, 180, true);

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (file.extension === "md") {
          pendingInboxMetadataFiles.set(file.path, file);
          refreshInboxFromMetadata();
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.recordEditPresenceLearning(file);
          this.deviceHub?.recordEditPresence();
          reindexFile(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          void this.autoApplyInboxMetadata(file)
            .catch((error: unknown) => console.error("ToWrite could not apply Inbox metadata", error))
            .finally(() => reindexFile(file));
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFolder) rebuildInboxAfterFolderChange();
        this.handleDeletedFile(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFolder) rebuildInboxAfterFolderChange();
        void (async () => {
          const sidecarQuestions = this.store.getSidecarQuestionsForFile(oldPath);
          await this.indexer.removeFile(oldPath, false);
          this.inboxIndex.remove(oldPath);
          this.localKnowledgeIndex.remove(oldPath);
          this.workflowIndex.removeFile(oldPath);
          if (sidecarQuestions.length > 0 && file instanceof TFile) {
            const movedQuestions = sidecarQuestions.map((question) => ({
              ...question,
              source: { ...question.source, file: file.path },
              updatedAt: new Date().toISOString()
            }));
            for (let index = 0; index < sidecarQuestions.length; index += 1) {
              await this.sidecars.upsert(movedQuestions[index]);
              await this.sidecars.remove(sidecarQuestions[index]);
            }
            const resolved = await this.sidecars.resolveQuestions(movedQuestions);
            this.store.replaceSidecarQuestions(oldPath, [], false);
            this.store.replaceSidecarQuestions(file.path, resolved, false);
          }
          if (file instanceof TFile && file.extension === "md") {
            try {
              await this.autoApplyInboxMetadata(file);
            } catch (error) {
              console.error("ToWrite could not apply Inbox metadata after a rename", error);
            }
            reindexFile(file);
          } else {
            this.store.notify();
          }
        })().catch((error: unknown) => console.error("ToWrite could not index a renamed file", error));
      })
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.aiService.refreshMissingForActiveNote(this.getActiveFile());
        this.recordFileSwitchLearning();
        this.refreshEditorDecorations();
        this.notifyActiveContext();
      })
    );

    this.registerEvent(
      this.app.workspace.on("editor-change", () => {
        this.lastEditorActivityAt = Date.now();
        notifyActiveContext();
      })
    );

    this.registerDomEvent(activeDocument, "keyup", (event) => {
      if (isEditorNavigationKey(event.key) && eventTargetsMarkdownEditor(event)) {
        notifyActiveContext();
      }
    });
    this.registerDomEvent(activeDocument, "mouseup", (event) => {
      if (eventTargetsMarkdownEditor(event)) {
        notifyActiveContext();
      }
    });
  }

  private async autoApplyInboxMetadata(file: TFile): Promise<void> {
    if (!this.settings.inbox.autoApplyStageOnCreate || this.inboxMetadataWrites.has(file.path)) return;
    this.inboxMetadataWrites.add(file.path);
    try {
      await applyInboxStageMetadata(this.app, file, this.settings.inbox);
    } finally {
      this.inboxMetadataWrites.delete(file.path);
    }
  }

  private handleDeletedFile(file: TAbstractFile): void {
    if (file instanceof TFile && file.extension === "md") {
      void (async () => {
        await this.indexer.removeFile(file.path, false);
        this.inboxIndex.remove(file.path);
        this.localKnowledgeIndex.remove(file.path);
        this.workflowIndex.removeFile(file.path);
        if (this.store.hasSidecarQuestionsForFile(file.path)) {
          await this.refreshSidecarsForFile(file.path, false);
        }
        this.refreshEditorDecorations();
        this.store.notify();
        this.queueDeviceHubSync();
        if (this.settings.autoExport) {
          this.scheduleBackgroundRefresh();
        }
      })().catch((error: unknown) => console.error("ToWrite could not remove a deleted file", error));
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
    this.learningEditQueue.enqueue(file.path, {
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
    this.queueDeviceHubSync();
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

    this.patchQuestionState(id, {
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
      this.patchQuestionState(question.id, {
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
    this.queueDeviceHubSync();
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
      this.patchQuestionState(id, patch);
    }

    await this.savePluginData();
    this.queueDeviceHubSync();
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
        this.patchQuestionState(id, { status: "ignored" });
      }
    } else {
      this.patchQuestionState(id, { status: "ignored" });
    }

    await this.savePluginData();
    this.queueDeviceHubSync();
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

  private async refreshSidecars(options: { rebuildWorkflow?: boolean; notify?: boolean } = {}): Promise<void> {
    const questions = await this.sidecars.refreshResolvedQuestions();
    this.store.replaceAllSidecarQuestions(questions, false);
    if (options.rebuildWorkflow !== false) {
      this.workflowIndex?.refreshQuestions();
    }
    if (options.notify !== false) {
      this.refreshEditorDecorations();
      this.store.notify();
    }
  }

  private async refreshSidecarsForFile(filePath: string, notify = true): Promise<void> {
    const current = this.store.getSidecarQuestionsForFile(filePath);
    const resolved = await this.sidecars.resolveQuestions(current);
    this.store.replaceSidecarQuestions(filePath, resolved, false);
    if (notify) {
      this.refreshEditorDecorations();
      this.store.notify();
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
    captureBridge: normalizeCaptureBridgeSettings(settings?.captureBridge),
    inbox: normalizeInboxSettings(settings?.inbox),
    echoCards: normalizeEchoCards(settings?.echoCards),
    hub: normalizeHubSettings(settings?.hub),
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

function normalizeHubSettings(settings?: Partial<ToWriteSettings["hub"]>): ToWriteSettings["hub"] {
  const defaults = DEFAULT_SETTINGS.hub;
  const rawBaseUrl = String(settings?.baseUrl ?? defaults.baseUrl).trim().replace(/\/+$/u, "");
  const tapUrl = String(settings?.tapUrl ?? "").trim().slice(0, 512);
  const selectionMode = isHubSelectionMode(settings?.selectionMode)
    ? settings.selectionMode
    : settings?.autoSelect === false
      ? "manual"
      : defaults.selectionMode;
  const lastScheduleOccurrenceId = String(settings?.lastScheduleOccurrenceId ?? "").trim().slice(0, 320);
  const scheduleOccurrenceIds = normalizeScheduleOccurrenceIds(settings?.scheduleOccurrenceIds, lastScheduleOccurrenceId);
  return {
    enabled: settings?.enabled === true,
    baseUrl: /^https?:\/\//iu.test(rawBaseUrl) ? rawBaseUrl : defaults.baseUrl,
    receiverId: String(settings?.receiverId ?? "").trim().slice(0, 120),
    receiverToken: String(settings?.receiverToken ?? "").trim().slice(0, 500),
    receiverPublicKeyJwk: normalizeHubJwkSetting(settings?.receiverPublicKeyJwk, false),
    receiverPrivateKeyJwk: normalizeHubJwkSetting(settings?.receiverPrivateKeyJwk, true),
    referenceSecret: String(settings?.referenceSecret ?? "").trim().slice(0, 200) || `href_${randomTokenFragment()}_${randomTokenFragment()}`,
    deviceId: String(settings?.deviceId ?? "").trim().slice(0, 120),
    syncIntervalSeconds: clampNumber(settings?.syncIntervalSeconds ?? defaults.syncIntervalSeconds, 15, 86400, 60),
    shareDisplayBody: settings?.shareDisplayBody === true,
    manualSelectionVibration: settings?.manualSelectionVibration !== false,
    autoSelect: selectionMode === "agent",
    selectionMode,
    autoAddSelections: settings?.autoAddSelections !== false,
    rotationIntervalMinutes: clampNumber(settings?.rotationIntervalMinutes ?? defaults.rotationIntervalMinutes, 1, 1440, 30),
    rotationCursor: clampNumber(settings?.rotationCursor ?? 0, 0, Number.MAX_SAFE_INTEGER, 0),
    lastRotationCandidateId: String(settings?.lastRotationCandidateId ?? "").trim().slice(0, 200),
    lastRotationContentId: String(settings?.lastRotationContentId ?? "").trim().slice(0, 120),
    manualHoldMinutes: clampNumber(settings?.manualHoldMinutes ?? defaults.manualHoldMinutes, 0, 10080, 30),
    manualHoldUntil: normalizeOptionalIso(settings?.manualHoldUntil),
    manualHoldCandidateId: String(settings?.manualHoldCandidateId ?? "").trim().slice(0, 200),
    manualHoldContentId: String(settings?.manualHoldContentId ?? "").trim().slice(0, 120),
    scheduleOccurrenceIds,
    lastScheduleOccurrenceId,
    manualPlace: String(settings?.manualPlace ?? "").trim().slice(0, 120),
    manualMode: String(settings?.manualMode ?? "").trim().slice(0, 120),
    tapUrl: /^https?:\/\//iu.test(tapUrl) ? tapUrl : "",
    lastSyncedAt: String(settings?.lastSyncedAt ?? "").trim().slice(0, 64),
    lastError: String(settings?.lastError ?? "").trim().slice(0, 500),
    lastStateVersion: clampNumber(settings?.lastStateVersion ?? 0, 0, Number.MAX_SAFE_INTEGER, 0),
    lastSelectedContentId: String(settings?.lastSelectedContentId ?? "").trim().slice(0, 120),
    lastDisplayedContentId: String(settings?.lastDisplayedContentId ?? "").trim().slice(0, 120)
  };
}

function isHubSelectionMode(value: unknown): value is ToWriteSettings["hub"]["selectionMode"] {
  return value === "manual" || value === "agent" || value === "rotation" || value === "schedule";
}

function normalizeOptionalIso(value: unknown): string {
  const text = String(value ?? "").trim();
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function normalizeScheduleOccurrenceIds(value: unknown, legacyLast = ""): string[] {
  const source = Array.isArray(value) ? value : [];
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of [...source, legacyLast]) {
    const id = String(item ?? "")
      .replace(/[\u0000-\u001f\u007f]/gu, "")
      .trim()
      .slice(0, 320);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
  }
  return output.slice(-100);
}

function normalizeHubJwkSetting(value: unknown, requirePrivate: boolean): string {
  const text = String(value ?? "").trim().slice(0, 4_000);
  if (!text) {
    return "";
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed.kty !== "EC"
      || parsed.crv !== "P-256"
      || typeof parsed.x !== "string"
      || typeof parsed.y !== "string"
      || (requirePrivate && typeof parsed.d !== "string")) {
      return "";
    }
    return JSON.stringify(parsed);
  } catch {
    return "";
  }
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
    stages: ensureInboxWorkflowStage(normalizeWorkflowStageList(stages))
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

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeHubContextState(value: string): HubContextState {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/gu, "_");
  const aliases: Record<string, HubContextState> = {
    desk: "desk_focus",
    focus: "desk_focus",
    idle: "desk_idle",
    walk: "walking",
    outdoor: "outdoors",
    commute: "commuting",
    exercise: "exercising",
    rest: "resting",
    dnd: "do_not_disturb",
    quiet: "do_not_disturb"
  };
  const supported = new Set<HubContextState>([
    "unknown",
    "desk_focus",
    "desk_idle",
    "walking",
    "outdoors",
    "commuting",
    "exercising",
    "resting",
    "do_not_disturb"
  ]);
  return supported.has(normalized as HubContextState)
    ? normalized as HubContextState
    : aliases[normalized] ?? "unknown";
}

function hubContentTypeForCandidate(candidate: PushCandidate): LocalHubCandidate["type"] {
  if (candidate.type === "question") {
    return "question_prompt";
  }
  if (!candidate.body.trim()) {
    return "title_only";
  }
  if (candidate.stale) {
    return "stale_note_nudge";
  }
  return "note_continue";
}

function hubStateWaitingForDisplay(state: HubDeviceState): boolean {
  if (!state.selected) return false;
  return !state.displayed
    || state.displayed.selectionId !== state.selected.selectionId
    || state.displayed.contentId !== state.selected.selectedContentId
    || state.displayed.stateVersion !== state.selected.stateVersion;
}

function hubScoreForCandidate(candidate: PushCandidate): number {
  if (candidate.reminderDue) return 0.98;
  if (candidate.priority === "P1") return 0.94;
  if (candidate.pinned) return 0.9;
  if (candidate.priority === "P2") return 0.82;
  if (candidate.priority === "P3") return 0.74;
  if (candidate.type === "question") return 0.72;
  if (candidate.stale) return 0.68;
  return 0.5;
}

function frontmatterTags(frontmatter: Record<string, unknown>): string[] {
  const value = frontmatter.tags ?? frontmatter.tag;
  if (Array.isArray(value)) {
    return value.filter((tag): tag is string => typeof tag === "string");
  }
  if (typeof value === "string") {
    return value.split(/[\s,，、]+/gu).map((tag) => tag.trim()).filter(Boolean);
  }
  return [];
}

function privacyFlagEnabled(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  return ["true", "yes", "1", "private", "exclude"].includes(value.trim().toLowerCase());
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

function isEditorNavigationKey(key: string): boolean {
  return key === "ArrowUp"
    || key === "ArrowDown"
    || key === "ArrowLeft"
    || key === "ArrowRight"
    || key === "PageUp"
    || key === "PageDown"
    || key === "Home"
    || key === "End";
}

function eventTargetsMarkdownEditor(event: Event): boolean {
  const target = event.target as { closest?: (selector: string) => Element | null } | null;
  return typeof target?.closest === "function" && Boolean(target.closest(".cm-editor"));
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
