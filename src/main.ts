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
  normalizePath,
  type Editor
} from "obsidian";
import { createQuestionAnchor, lineRangeForOffsets } from "./core/anchor";
import { DeferredKeyedQueue } from "./core/deferred-keyed-queue";
import { makeQuestionId, shortHash } from "./core/hash";
import { queryQuestions as filterQuestions } from "./core/query";
import {
  DEFAULT_SETTINGS,
  DEFAULT_STATUS_OPTIONS,
  DEFAULT_WORKFLOW_STAGES,
  ensureInboxWorkflowStage,
  normalizeExternalApiBindHost,
  normalizeExternalApiPublicBaseUrl,
  normalizeArticleTypesSettings,
  normalizeDailySettings,
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
  ExportEinkPayload,
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
  CAPTURE_BRIDGE_PROTOCOL_V2,
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
  type CaptureBridgeStagedAsset,
  type LocalTapSelectionState,
  type TapSelectionReference,
  type TapSelectionSnapshot
} from "./capture-bridge";
import {
  DailyActivityService,
  dailyDeviceScore,
  dailyCreateOnlyTitle,
  dailyPlanCacheInvalidationForPath,
  dailyTaskTextForBackend,
  dailyWikiLink,
  DailyPlanConflictError,
  DailyPlanService,
  dailyAiSummaryPlaceholderInstruction,
  parseConstrainedDailyAiSummary,
  type DailyActivityState,
  type DailyDashboardSnapshot,
  type DailyDevicePolicy,
  type DailyPlanCreateInput,
  type DailyPlanDocument,
  type DailyPlanItem,
  type DailyPlanMetadata,
  type DailyPlanMetadataUpdate,
  type DailyPlanUpdate,
  type DailySummary,
  type DailyTaskRevision
} from "./daily";
import { QuestionExporter } from "./export/exporter";
import {
  ToWriteExternalApiServer,
  type DeviceCommandExecutionResult,
  type DeviceCaptureRequest,
  type DeviceCaptureResult,
  type DeviceWritebackMetadata,
  type ExternalApiRuntimeStatus
} from "./external/server";
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
  HubDeviceEventWritebackService,
  buildDevicePagingPool,
  buildDeviceLibrary,
  adaptDailyPlanItemForDevice,
  adaptDailySummaryForDevice,
  buildDailyDeckSnapshot,
  canAdvanceRotation,
  createOpaqueHubRef,
  devicePagingPosition,
  generateHubCaptureKeyPair,
  isManualHoldActive,
  normalizeQuestionDeliveryPolicy,
  nextDevicePagingItem,
  prioritizeDevicePagingPool,
  scheduledLibraryChoice,
  validateNtag213Uri,
  type DeviceLibrarySnapshot,
  type HubCapabilities,
  type HubContextState,
  type HubContentAction,
  type HubDeviceState,
  type HubDeviceSecretRotation,
  type HubEmailChallenge,
  type HubFeedbackAction,
  type HubPendingDeviceEvent,
  type HubSelectionMode,
  type HubPersonalProvisionResult,
  type HubTapRotation,
  type LocalHubCandidate,
  type Ntag213UriValidation
} from "./hub";
import { buildExternalEinkPlaylistPayload, type DailyEinkCard } from "./external/eink-playlist";
import type {
  DeviceActionIntent,
  DeviceCommandAction,
  DeviceCompletionGuard,
  DeviceDisplayAcknowledgement,
  DeviceDisplayedTuple,
  DeviceEventInput
} from "./device-interactions";
import {
  resolveLocalEinkConnectionStatus,
  type SmallScreenConnectionStatus
} from "./device-status";
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
import type {
  DailyDashboardAdapter,
  DailyPlanningCandidate,
  DailySummaryPresentation
} from "./ui/daily-dashboard-types";
import type { CaptureModalSubmitRequest, CaptureModalSubmitResult } from "./ui/capture-modal-types";
import type {
  AiAssistantCatalog,
  AiAssistantContextPreview,
  AiAssistantSendRequest
} from "./ui/ai-assistant-types";

const LOCAL_EINK_EXPECTED_POLL_SECONDS = 5;

interface CaptureLaunchOptions {
  intent?: CaptureIntent;
  body?: string;
  title?: string;
  sourceFile?: string;
  headingPath?: string[];
  selection?: string;
  questionId?: string;
  entryPoint?: string;
  /** Restrict the modal to create targets; cancellation never creates a file. */
  createOnly?: boolean;
}

interface FrozenDisplayedDailyContext {
  dailyItemId?: string;
  dailyTaskRevision?: string;
  dailyDate?: string;
  dailySourcePath?: string;
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
  private dailyPlanService!: DailyPlanService;
  private dailyActivityService!: DailyActivityService;
  private dailyPlanItems: DailyPlanItem[] = [];
  private dailyPlanDocument?: DailyPlanDocument;
  private dailyActivityRetentionDays = 30;
  private dailyStateSaveTimer = 0;
  private dailyMidnightTimer = 0;
  private dailyDeviceStateVersion = 1;
  private dailyScheduleOccurrenceIds = new Set<string>();
  private dailyPlanCacheInitialized = false;
  private dailyBackendWriterCheckedAt = 0;
  private dailyBackendWriterAvailable = false;
  private observedExternalApiStartedAt = "";
  private observedSuccessfulEinkPolls = 0;
  private readonly localDeviceDisplayKeys = new Map<string, string>();
  private readonly localDeviceServedTaskRevisions = new Map<string, {
    dailyItemId?: string;
    taskRevision?: string;
    taskDate: string;
    taskSourcePath?: string;
    tapSnapshot?: TapSelectionSnapshot;
    display?: DailyEinkCard;
  }>();
  private readonly localDeviceCompletionGuards = new Map<string, DeviceCompletionGuard & {
    deviceId?: string;
    selectionId?: string;
    contentId?: string;
    revisionId?: string;
    dailyItemId?: string;
    taskRevision?: string;
    taskDate?: string;
    taskSourcePath?: string;
  }>();
  private readonly deviceCommandJournal = new Map<string, {
    eventId: string;
    fingerprint: string;
    status: "indeterminate" | "executed" | "unsupported" | "conflict";
    processedAt: string;
    action: string;
    resultRevision?: string;
    displayMessage?: string;
  }>();
  private externalApiServer!: ToWriteExternalApiServer;
  private pushEngine!: PushEngine;
  private hubClient!: HubClient;
  private deviceHub!: DeviceHubConnector;
  private hubWriteback!: HubCaptureWritebackService;
  private hubDeviceEventWriteback!: HubDeviceEventWritebackService;
  private quote0SyncService!: Quote0SyncService;
  private learningService!: HabitLearningService;
  private suggestionService!: SuggestionService;
  private uiApi!: ToWriteUiApi;
  private selectionToolbar?: SelectionQuestionToolbar;
  private pdfQuestionLayer?: PdfQuestionLayer;
  private backgroundRefreshTimer = 0;
  private hubSyncTimer = 0;
  private hubDeviceEventPollTimer = 0;
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
  private readonly legacyEinkPlaylistCache = new Map<string, ExportEinkPayload>();
  private readonly bridgeCaptureAssets = new Map<string, Array<{ path: string; sha256: string }>>();

  async onload(): Promise<void> {
    await this.loadPluginData();

    this.store = new OpenQuestionStore(this.savedQuestionStates);
    this.register(this.store.subscribe(() => this.invalidateLegacyEinkPlaylist()));
    this.initializeDailyServices();
    await this.refreshDailyPlanCache(false);
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
      onStateChanged: async () => {
        this.invalidateLegacyEinkPlaylist();
        this.notifyUi();
        await this.savePluginData();
      }
    });
    this.localTapSelection.restore(this.savedCaptureBridgeState);
    this.captureBridgeCoordinator = new CaptureBridgeCoordinator({
      selection: this.localTapSelection,
      createOnlySnapshot: (snapshot) => this.createOnlyTapSelectionSnapshot(snapshot),
      isTapAllowed: (tapId) => tapId === this.settings.captureBridge.tapId,
      handoffTtlSeconds: () => this.settings.captureBridge.handoffTtlSeconds,
      commitAdapter: {
        commit: async (snapshot, request, assets) => {
          const draft = captureDraftFromBridgeCommit(snapshot, request);
          return this.commitTapBridgeCapture(snapshot, draft, assets);
        },
        complete: async (snapshot, request) => this.completeDailyFromBridge(snapshot, request.idempotencyKey),
        later: async (snapshot, request) => this.snoozeDailyFromBridge(snapshot, request.idempotencyKey),
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
      getEinkPayload: (limit, cursor, query) => this.buildLegacyEinkPlaylist(limit, cursor, query),
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
      advanceDevicePage: (direction) => this.advanceLocalDevicePage(direction),
      getDeviceCompletionGuard: (targetId) => this.getCurrentDeviceCompletionGuard(targetId),
      completeDeviceCard: (event) => this.completeDailyFromDeviceEvent(event),
      acknowledgeDeviceDisplay: (acknowledgement, targetId) => this.acknowledgeLocalDeviceDisplay(acknowledgement, targetId),
      getDeviceDisplayedTuple: (targetId) => this.getCurrentDeviceDisplayedTuple(targetId),
      resolveDeviceGestureReplay: (event) => this.resolveLocalDeviceGestureReplay(event),
      handleDeviceGesture: (event) => this.handleLocalDeviceGesture(event),
      getDailySnapshot: () => this.getDailyDashboardSnapshot(),
      getDailyPlan: (date) => this.dailyPlanService.read(date),
      updateDailyPlanMetadata: (date, revision, patch) => this.updateDailyPlanMetadata(date, revision, patch),
      createDailyItem: (input) => this.createDailyItem(input),
      updateDailyItem: (id, revision, patch, date) => this.updateDailyItem(id, revision, patch, date),
      startDailyItem: (id, revision, date) => this.startDailyItem(id, revision, date),
      completeDailyItem: (id, revision, eventId, date) => this.completeDailyItem(id, revision, eventId, date),
      writeDailySummary: (summary) => this.writeDailySummary(summary),
      onRuntimeStatusChanged: (status) => this.handleExternalApiRuntimeStatus(status),
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
    this.hubDeviceEventWriteback = new HubDeviceEventWritebackService({
      client: this.hubClient,
      getReceiverId: () => this.settings.hub.receiverId,
      apply: (event) => this.applyPendingHubDeviceEvent(event),
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

    const dailyDashboardApi = this.createDailyDashboardAdapter();
    this.registerView(
      TOWRITE_SIDEBAR_VIEW,
      (leaf) => new ToWriteSidebarItemView(leaf, this.uiApi, {
        dailyApi: dailyDashboardApi,
        onOpenDashboard: () => {
          void this.activateDashboard();
        }
      })
    );
    this.registerView(
      TOWRITE_DASHBOARD_VIEW,
      (leaf) => new ToWriteDashboardItemView(leaf, this.uiApi, {
        dailyApi: dailyDashboardApi,
        getFullWorkflowPayload: () => this.workflowIndex.getPayload({ compact: true })
      })
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
      id: "add-active-note-to-today",
      name: "Add active note to today's plan",
      callback: () => {
        void this.addActiveNoteToDaily();
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
    this.scheduleDailyMidnightRefresh();
    this.registerInterval(window.setInterval(() => {
      void this.runDueDailyDeviceSchedule();
    }, 30_000));
    void this.runDueDailyDeviceSchedule();

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
    if (this.hubDeviceEventPollTimer) {
      window.clearTimeout(this.hubDeviceEventPollTimer);
      this.hubDeviceEventPollTimer = 0;
    }
    if (this.hubContextTimer) {
      window.clearTimeout(this.hubContextTimer);
      this.hubContextTimer = 0;
    }
    if (this.hubCandidateSyncTimer) {
      window.clearTimeout(this.hubCandidateSyncTimer);
      this.hubCandidateSyncTimer = 0;
    }
    if (this.dailyStateSaveTimer) {
      window.clearTimeout(this.dailyStateSaveTimer);
      this.dailyStateSaveTimer = 0;
    }
    if (this.dailyMidnightTimer) {
      window.clearTimeout(this.dailyMidnightTimer);
      this.dailyMidnightTimer = 0;
    }
    void this.dailyActivityService?.flushMeasurements().then(() => this.savePluginData());
    this.dailyActivityService?.dispose();
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
      title: options.title?.trim() || undefined,
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
        questionText: question?.question,
        createOnly: options.createOnly === true
      },
      initialCandidates: [],
      callbacks: {
        recommend: async (currentDraft, signal, publishUpdate) => {
          const recommended = await this.recommendCaptureTargets(currentDraft);
          const local = options.createOnly
            ? recommended.filter((candidate) => candidate.action === "create")
            : recommended;
          if (signal.aborted) {
            return local;
          }
          this.captureSuggestedTargets.set(currentDraft.id, local[0]?.id ?? "");
          if (this.settings.backend.enabled && this.settings.backend.useForRecommendations) {
            void this.backendClient.rerankTargets(currentDraft, local).then((enhanced) => {
              if (!signal.aborted) {
                const safe = options.createOnly
                  ? enhanced.filter((candidate) => candidate.action === "create")
                  : enhanced;
                this.captureSuggestedTargets.set(currentDraft.id, safe[0]?.id ?? local[0]?.id ?? "");
                publishUpdate(safe);
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
      this.dailyActivityService.recordCaptureCommitted(capture.captureId);
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
      captureBridgeState: this.localTapSelection?.serialize() ?? this.savedCaptureBridgeState,
      dailyActivityState: this.dailyActivityService?.getState() ?? this.savedDailyActivityState,
      dailyDeviceStateVersion: this.dailyDeviceStateVersion,
      dailyScheduleOccurrenceIds: [...this.dailyScheduleOccurrenceIds].slice(-200),
      deviceCommandJournal: [...this.deviceCommandJournal.values()].slice(-256)
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
    if (this.hubDeviceEventPollTimer) {
      window.clearTimeout(this.hubDeviceEventPollTimer);
      this.hubDeviceEventPollTimer = 0;
    }
    if (!this.deviceHub || !this.settings.hub.enabled) {
      return;
    }
    this.hubSyncTimer = window.setInterval(() => {
      void this.syncDeviceHub(false);
    }, Math.max(15, this.settings.hub.syncIntervalSeconds) * 1_000);
    this.scheduleHubDeviceEventPoll(0);
  }

  private scheduleHubDeviceEventPoll(delayMs = 250): void {
    if (!this.settings.hub.enabled || !this.hubDeviceEventWriteback) return;
    if (this.hubDeviceEventPollTimer) {
      window.clearTimeout(this.hubDeviceEventPollTimer);
    }
    this.hubDeviceEventPollTimer = window.setTimeout(() => {
      this.hubDeviceEventPollTimer = 0;
      void this.pollHubDeviceEvents();
    }, Math.max(0, delayMs));
  }

  private async pollHubDeviceEvents(): Promise<void> {
    if (!this.settings.hub.enabled) return;
    try {
      const result = await this.hubDeviceEventWriteback.processPending(50, 25);
      if (result.pending > 0 || result.failed > 0) {
        this.notifyUi();
      }
    } catch (error) {
      // The regular Hub sync owns durable error notices. This short retry keeps
      // a transient offline period from turning into a tight request loop.
      this.settings.hub.lastError = messageForError(error).slice(0, 500);
      this.notifyUi();
      this.scheduleHubDeviceEventPoll(2_000);
      return;
    }
    this.scheduleHubDeviceEventPoll(100);
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
    if (!this.deviceHub.isConfigured()) {
      if (showNotice) {
        new Notice("Enable Device Hub and complete device pairing first.");
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
      const deviceEvents = await this.hubDeviceEventWriteback.processPending();
      this.settings.hub.lastSyncedAt = new Date().toISOString();
      this.settings.hub.lastError = writeback.conflicts > 0 || writeback.failed > 0 || deviceEvents.failed > 0
        ? `Device Hub writeback kept ${writeback.conflicts} capture conflict(s), ${writeback.failed} capture failure(s), and ${deviceEvents.failed} device event failure(s) queued.`
        : deviceEvents.conflicts > 0
          ? `Device Hub acknowledged ${deviceEvents.conflicts} stale Daily completion event(s) as conflicts.`
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

  async addQuestionToDaily(questionId: string): Promise<void> {
    const question = this.store.getQuestion(questionId);
    if (!question) throw new Error("The ToWrite question no longer exists.");
    const date = formatDailyInputDate(new Date());
    const id = `daily_q_${shortHash(`${date}|${question.id}`)}`;
    if (this.dailyPlanItems.some((item) => item.id === id)) {
      new Notice(this.settings.language === "zh" ? "这个问题已经在今日计划中。" : "This question is already in today's plan.");
      return;
    }
    const link = dailyWikiLink(question.source.file, question.source.blockId);
    await this.createDailyItem({
      id,
      date,
      text: `${question.lane === "write" ? "继续" : "处理"} ${link}：${question.question}`.slice(0, 600),
      kind: question.lane === "write" ? "edit_note" : "task",
      devicePolicy: "none",
      tags: ["towrite/question"]
    });
    new Notice(this.settings.language === "zh" ? "已加入今日计划。" : "Added to today's plan.");
  }

  async addInboxItemToDaily(itemId: string): Promise<void> {
    const item = this.inboxIndex.getSnapshot().items.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("The Inbox note no longer exists.");
    const date = formatDailyInputDate(new Date());
    const id = `daily_inbox_${shortHash(`${date}|${item.filePath}`)}`;
    if (this.dailyPlanItems.some((candidate) => candidate.id === id)) {
      new Notice(this.settings.language === "zh" ? "这条 Inbox 笔记已经在今日计划中。" : "This Inbox note is already in today's plan.");
      return;
    }
    await this.createDailyItem({
      id,
      date,
      text: `${this.settings.language === "zh" ? "整理" : "Organize"} ${dailyWikiLink(item.filePath)}：${item.title}`.slice(0, 600),
      kind: "edit_note",
      devicePolicy: "none",
      tags: ["towrite/inbox"]
    });
    new Notice(this.settings.language === "zh" ? "已加入今日计划。" : "Added to today's plan.");
  }

  private async addActiveNoteToDaily(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension.toLowerCase() !== "md") {
      new Notice(this.settings.language === "zh" ? "请先打开一个 Markdown 笔记。" : "Open a Markdown note first.");
      return;
    }
    const date = formatDailyInputDate(new Date());
    const id = `daily_note_${shortHash(`${date}|${file.path}`)}`;
    if (this.dailyPlanItems.some((item) => item.id === id)) {
      new Notice(this.settings.language === "zh" ? "这篇笔记已经在今日计划中。" : "This note is already in today's plan.");
      return;
    }
    await this.createDailyItem({
      id,
      date,
      text: `${this.settings.language === "zh" ? "继续" : "Continue"} ${dailyWikiLink(file.path)}`,
      kind: "edit_note",
      devicePolicy: "none",
      tags: ["towrite/today"]
    });
    new Notice(this.settings.language === "zh" ? "当前笔记已加入今日计划。" : "Active note added to today's plan.");
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

  private async selectLocalDeviceCard(localId: string): Promise<void> {
    await this.localTapSelection.selectLocal(localId);
    this.dailyDeviceStateVersion += 1;
    this.dailyActivityService.recordCardSelected(localId);
    this.invalidateLegacyEinkPlaylist();
    this.scheduleDailyStateSave();
  }

  private async sendLocalCandidateToDeviceHub(localId: string): Promise<HubDeviceState | undefined> {
    try {
      await this.selectLocalDeviceCard(localId);
    } catch (error) {
      const message = messageForError(error);
      new Notice(this.settings.language === "zh"
        ? `未能准备墨水屏卡片：${message}`
        : `Could not prepare the e-ink card: ${message}`);
      throw error;
    }
    const localStatus = this.getSmallScreenConnectionStatus().local;
    if (!this.deviceHub.isConfigured()) {
      new Notice(this.localScreenSelectionNotice(localStatus.state));
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
      const state = await this.deviceHub.selectLocalCandidate(localId, this.buildHubCandidates(localId, true));
      await this.localTapSelection.rememberHubSelection(localId, state);
      this.settings.hub.manualHoldContentId = state.selected?.selectedContentId ?? "";
      await this.savePluginData();
      new Notice(state.inSync
        ? (this.settings.language === "zh"
          ? "墨水屏已 ACK 显示这张卡。"
          : "The e-ink display acknowledged this card.")
        : state.online
          ? (this.settings.language === "zh"
            ? "已提交为墨水屏期望内容，设备在线，等待本次刷新 ACK。"
            : "Queued as desired content; the device is online and the display ACK is pending.")
          : localStatus.online
            ? (this.settings.language === "zh"
              ? "Hub 设备离线，但本地 ESP32 在线；已设为 /api/v1/eink 当前卡，下一次拉取会刷新。"
              : "The Hub device is offline, but the local ESP32 is online; the next /api/v1/eink poll will refresh this card.")
            : localStatus.state === "waiting"
              ? (this.settings.language === "zh"
                ? "卡片已保存；本地 API 正在监听，但尚未看到 ESP32 拉取，Hub 设备也离线。"
                : "Card saved; the local API is listening but no ESP32 poll has been observed, and the Hub device is offline.")
              : (this.settings.language === "zh"
                ? "卡片已保存为期望内容，但 ESP32 当前离线或从未连接；屏幕暂时不会变化。"
                : "Saved as desired content, but the ESP32 is offline or has never connected, so the screen will not change yet."));
      return state;
    } catch (error) {
      this.settings.hub.manualHoldUntil = previousHold.until;
      this.settings.hub.manualHoldCandidateId = previousHold.candidateId;
      this.settings.hub.manualHoldContentId = previousHold.contentId;
      const message = messageForError(error);
      new Notice(this.settings.language === "zh"
        ? `已设为本地小屏当前卡；Device Hub 同步失败：${message}`
        : `Set as the current local screen card; Device Hub sync failed: ${message}`);
      this.settings.hub.lastError = message.slice(0, 500);
      await this.savePluginData();
      return undefined;
    }
  }

  private localScreenSelectionNotice(state: SmallScreenConnectionStatus["local"]["state"]): string {
    if (this.settings.language === "zh") {
      if (state === "online") return "已设为当前卡；ESP32 在线，将在下一次拉取时刷新。";
      if (state === "waiting") return "已设为当前卡；本地 API 正在监听，但尚未看到 ESP32 拉取。";
      if (state === "error") return "已设为当前卡；ESP32 最近一次请求失败，请查看“小屏连接状态”。";
      if (state === "stale") return "已设为当前卡；ESP32 已超过预期时间没有拉取，屏幕可能仍显示旧内容。";
      if (state === "stopped") return "已设为当前卡，但本地 API 没有成功监听，屏幕不会刷新。";
      return "已设为当前卡，但本地 External API 已关闭，屏幕不会刷新。";
    }
    if (state === "online") return "Set as current; the online ESP32 will refresh on its next poll.";
    if (state === "waiting") return "Set as current; the API is listening but no ESP32 poll has been observed.";
    if (state === "error") return "Set as current; the ESP32's latest request failed. Check Small-screen connection.";
    if (state === "stale") return "Set as current; the ESP32 has missed its expected poll window and may still show old content.";
    if (state === "stopped") return "Set as current, but the local API is not listening, so the display will not refresh.";
    return "Set as current, but the local External API is disabled, so the display will not refresh.";
  }

  private dailyDeviceAdapters(preferredLocalId?: string) {
    if (!this.settings.daily.enabled || !this.settings.daily.includeInDeviceCandidates) return [];
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    return this.dailyPlanItems.map((item) => {
      const targetLink = item.target
        ? item.target.replace(/^\[\[/u, "").replace(/\]\]$/u, "").split("|")[0].trim()
        : item.linkedNotes[0];
      const linked = targetLink
        ? this.app.metadataCache.getFirstLinkpathDest(targetLink.split("#")[0], item.sourcePath)
        : undefined;
      const targetPath = linked?.path || this.settings.deviceCapture.inboxFile;
      const isInbox = targetPath === this.settings.deviceCapture.inboxFile;
      const privacy = this.hubPrivacyForPath(targetPath, item.tags, { ignoreIncludeFolders: isInbox });
      const kindTitle = this.settings.language === "zh"
        ? ({ task: "今日任务", create_note: "新建笔记", edit_note: "继续修改", send_card: "今日发送" } as const)[item.kind]
        : ({ task: "Today", create_note: "Create note", edit_note: "Edit note", send_card: "Send today" } as const)[item.kind];
      const localId = `daily-plan:${item.id}`;
      return adaptDailyPlanItemForDevice({
        id: item.id,
        kind: item.kind,
        status: item.status,
        devicePolicy: preferredLocalId === localId && item.devicePolicy === "none"
          ? "manual"
          : item.devicePolicy,
        taskRevision: item.revision.value,
        display: {
          title: kindTitle,
          body: item.text,
          prompt: item.scheduledFor
            ? `${this.settings.language === "zh" ? "计划于" : "Scheduled"} ${formatLocalDateTime(item.scheduledFor)}`
            : (this.settings.language === "zh" ? "记录、完成，或稍后处理" : "Capture, complete, or handle later")
        },
        sourceLocalId: `${item.sourcePath}#^${item.blockId}`,
        writeTargetLocalId: targetPath,
        allowedActions: ["open", "capture", "complete"],
        score: dailyDeviceScore(item),
        reasonCode: item.devicePolicy === "scheduled" ? "daily_scheduled" : `daily_${item.devicePolicy}`,
        availableAt: item.devicePolicy === "scheduled" ? item.scheduledFor : undefined,
        expiresAt: tomorrow.toISOString(),
        privacy
      });
    });
  }

  private dailySummaryDeviceAdapter(preferredLocalId?: string) {
    if (!this.settings.daily.enabled || !this.settings.daily.includeInDeviceCandidates) return undefined;
    const snapshot = this.dailyActivityService.getSnapshot(new Date(), this.dailyPlanItems);
    const localId = `daily-summary:${snapshot.date}`;
    const sourcePath = this.dailyPlanService.pathForDate(snapshot.date);
    const privacy = this.hubPrivacyForPath(sourcePath);
    if (privacy.private || privacy.excluded) return undefined;
    const configuredPolicy = this.settings.daily.summaryDevicePolicy;
    const requestedPolicy = preferredLocalId === localId && configuredPolicy === "none"
      ? "manual"
      : configuredPolicy;
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    const metrics = snapshot.summary.metrics;
    return adaptDailySummaryForDevice({
      id: snapshot.date,
      devicePolicy: requestedPolicy,
      display: {
        title: this.settings.language === "zh" ? "今日总结" : "Today summary",
        body: snapshot.summary.headline,
        prompt: this.settings.language === "zh"
          ? `完成 ${metrics.completed}/${metrics.planned} · 写作新增 ${metrics.positiveWritingUnits}`
          : `${metrics.completed}/${metrics.planned} complete · ${metrics.positiveWritingUnits} writing units`
      },
      sourceLocalId: sourcePath,
      allowedActions: ["open", "capture", "later"],
      reasonCode: `daily_summary_${requestedPolicy}`,
      expiresAt: tomorrow.toISOString(),
      privacy
    });
  }

  private dailyEinkCards(): DailyEinkCard[] {
    const deck = this.currentDailyDeck();
    const zh = this.settings.language === "zh";
    const overview: DailyEinkCard = {
      localId: deck.overview.localId,
      contentType: "daily_overview",
      title: deck.theme || (zh ? "今日概要" : "Today"),
      body: [
        deck.overview.current
          ? `● ${deck.overview.current.text}`
          : (zh ? "今天还没有待办" : "No remaining task"),
        ...deck.overview.upcoming.map((item) => `○ ${item.text}`),
        `${deck.overview.progress.done} / ${deck.overview.progress.total}`
      ].join("\n"),
      prompt: deck.overview.current?.nextStep
        || (zh ? "主键开始并打开" : "Press primary to start and open"),
      actions: ["open", "capture"],
      updatedAt: this.dailyPlanDocument?.revision
    };
    const planCards: DailyEinkCard[] = deck.planItems.map((card) => ({
      localId: card.localId,
      contentType: "daily_plan_item",
      title: card.item.status === "in-progress"
        ? (zh ? "正在推进" : "In progress")
        : (zh ? "今日任务" : "Today task"),
      body: [
        card.item.text,
        card.item.goal ? `${zh ? "目标" : "Goal"} · ${card.item.goal}` : "",
        card.item.nextStep ? `${zh ? "下一步" : "Next"} · ${card.item.nextStep}` : ""
      ].filter(Boolean).join("\n\n"),
      prompt: card.item.estimateMinutes
        ? `${zh ? "预计" : "Estimate"} ${card.item.estimateMinutes} min`
        : (zh ? "打开、完成，或新建记录" : "Open, complete, or capture"),
      actions: ["open", "capture", "complete"],
      taskRevision: card.item.taskRevision,
      updatedAt: card.item.taskRevision
    }));
    const result: DailyEinkCard = {
      localId: deck.result.localId,
      contentType: "daily_result",
      title: zh ? "今日结果" : "Today result",
      body: [
        ...deck.result.completed.map((item) => `✓ ${item.text}`),
        ...deck.result.remaining.map((item) => `→ ${item.text}`)
      ].join("\n") || (zh ? "今天还没有计划" : "No plan yet"),
      prompt: `${deck.result.progress.done} / ${deck.result.progress.total}`,
      actions: ["open", "capture"],
      updatedAt: this.dailyPlanDocument?.revision
    };
    const summaryAdapter = this.dailySummaryDeviceAdapter();
    if (!summaryAdapter) return [overview, ...planCards, result];
    const snapshot = this.dailyActivityService.getSnapshot(new Date(), this.dailyPlanItems);
    const candidate = summaryAdapter.candidate;
    const stableRevision = shortHash(JSON.stringify({
      date: snapshot.date,
      metrics: snapshot.summary.metrics,
      items: snapshot.plan.items.map((item) => [item.id, item.revision.value, item.status])
    }));
    return [overview, ...planCards, result, {
      localId: summaryAdapter.localId,
      contentType: "daily_summary",
      title: candidate?.display.title || (this.settings.language === "zh" ? "今日总结" : "Today summary"),
      body: candidate?.display.body || snapshot.summary.headline,
      prompt: candidate?.display.prompt,
      actions: candidate?.allowedActions ?? ["open", "capture", "later"],
      updatedAt: `daily-summary:${stableRevision}`
    }];
  }

  private currentDailyDeck() {
    const date = this.dailyPlanDocument?.date ?? formatDailyInputDate(new Date());
    return buildDailyDeckSnapshot({
      date,
      theme: this.dailyPlanDocument?.metadata.theme,
      items: this.dailyPlanItems.map((item) => ({
        id: item.id,
        text: item.text,
        kind: item.kind,
        status: item.status,
        taskRevision: item.revision.value,
        primary: item.primary,
        minimum: item.minimum,
        goal: item.goal,
        nextStep: item.nextStep,
        estimateMinutes: item.estimateMinutes,
        target: item.target,
        startedAt: item.startedAt
      }))
    });
  }

  getDeviceContentLibrary(): DeviceLibrarySnapshot {
    const hub = this.settings.hub;
    return buildDeviceLibrary(this.store?.query() ?? [], {
      mode: hub.selectionMode,
      autoAddSelections: hub.autoAddSelections,
      rotationIntervalMinutes: hub.rotationIntervalMinutes,
      manualHoldUntil: hub.manualHoldUntil,
      isPrivacyAllowed: (question) => {
        const privacy = this.hubPrivacyForPath(question.source.file, question.tags);
        return !privacy.private && !privacy.excluded;
      }
    });
  }

  getDevicePagingQueue(): string[] {
    return [...this.getDevicePagingPool()];
  }

  private getDevicePagingPool(): string[] {
    const library = this.getDeviceContentLibrary();
    const daily = [
      ...this.dailyDeviceAdapters(),
      ...[this.dailySummaryDeviceAdapter()].filter(
        (item): item is NonNullable<typeof item> => item !== undefined
      )
    ];
    const dailyAvailable = new Set(daily.filter((item) => item.candidate).map((item) => item.localId));
    const configuredPool = buildDevicePagingPool(
      this.settings.echoCards,
      library.entries,
      (localId) => {
        if (localId.startsWith("daily-plan:") || localId.startsWith("daily-summary:")) {
          return dailyAvailable.has(localId);
        }
        if (!localId.startsWith("echo-card:")) return true;
        const card = this.settings.echoCards.find((item) => echoCardLocalId(item) === localId);
        return Boolean(card && validateEchoCardLayout(card).fits && this.resolveEchoCardTarget(card));
      },
      daily.map((item) => item.pagingItem)
    );
    if (!this.settings.daily.enabled || !this.settings.daily.includeInDeviceCandidates) {
      return configuredPool;
    }
    const deck = this.currentDailyDeck();
    return [...new Set([
      deck.overview.localId,
      ...deck.planItems.map((item) => item.localId),
      deck.result.localId,
      ...configuredPool
    ])];
  }

  private currentDevicePagingLocalId(): string | undefined {
    return this.localTapSelection.currentLocalId()
      || this.settings.hub.manualHoldCandidateId
      || this.settings.hub.lastRotationCandidateId
      || (this.settings.daily.enabled ? this.currentDailyDeck().overview.localId : undefined)
      || undefined;
  }

  private buildLegacyEinkPlaylist(
    limit: number,
    cursor: number,
    query: OpenQuestionQuery = {}
  ): ExportEinkPayload {
    const normalizedQuery = { ...query };
    delete normalizedQuery.limit;
    const currentRequestedId = this.currentDevicePagingLocalId();
    const cacheKey = `${limit}:${cursor}:${this.dailyDeviceStateVersion}:${currentRequestedId ?? ""}:${JSON.stringify(normalizedQuery)}`;
    const cached = this.legacyEinkPlaylistCache.get(cacheKey);
    if (cached) return cached;

    const questions = this.store?.query(normalizedQuery) ?? [];
    const questionIds = new Set(questions.map((question) => question.id));
    const dailyCards = this.dailyEinkCards();
    const dailyIds = new Set(dailyCards.map((card) => card.localId));
    const filtered = Object.keys(normalizedQuery).length > 0;
    const rawPool = this.getDevicePagingPool();
    const filteredPool = filtered
      ? rawPool.filter((localId) => questionIds.has(localId))
      : rawPool;
    const currentEcho = currentRequestedId?.startsWith("echo-card:")
      ? this.settings.echoCards.find((card) => echoCardLocalId(card) === currentRequestedId)
      : undefined;
    const currentEchoAllowed = !filtered
      && currentEcho !== undefined
      && validateEchoCardLayout(currentEcho).fits
      && this.resolveEchoCardTarget(currentEcho) !== undefined;
    const currentDailyAllowed = !filtered
      && Boolean(currentRequestedId && dailyIds.has(currentRequestedId));
    const currentLocalId = currentRequestedId && (
      questionIds.has(currentRequestedId)
      || currentEchoAllowed
      || currentDailyAllowed
    )
      ? currentRequestedId
      : undefined;
    const payload = buildExternalEinkPlaylistPayload(
      this.app.vault.getName(),
      questions,
      this.store?.getArticleSummaries() ?? [],
      this.settings.echoCards,
      {
        orderedLocalIds: filteredPool,
        selectedLocalId: currentLocalId,
        dailyCards,
        stateVersion: this.dailyDeviceStateVersion,
        cursor,
        limit
      }
    );
    const servedCardId = payload.playlist?.currentId || payload.focus[0]?.id;
    const servedRevision = payload.playlist?.revision;
    if (servedCardId && servedRevision) {
      const deck = this.currentDailyDeck();
      const taskId = servedCardId.startsWith("daily-plan:")
        ? servedCardId.slice("daily-plan:".length)
        : servedCardId === deck.overview.localId
          ? deck.currentItemId
          : undefined;
      const servedItem = taskId
        ? this.dailyPlanItems.find((item) => item.id === taskId)
        : undefined;
      const dailyDate = servedItem?.date
        || (/^daily-(?:overview|result|summary):(\d{4}-\d{2}-\d{2})$/u.exec(servedCardId)?.[1]);
      if (dailyDate) {
        const servedDailyCard = dailyCards.find((card) => card.localId === servedCardId);
        const selectionState = this.localTapSelection.serialize();
        const tapSnapshot = [
          selectionState.localSnapshot,
          selectionState.localDisplayedSnapshot
        ].find((snapshot) => snapshot?.localId === servedCardId
          && (!servedItem
            || snapshot?.sourceContext?.dailyItemId === servedItem.id
            && snapshot.sourceContext.dailyTaskRevision === servedItem.revision.value));
        this.localDeviceServedTaskRevisions.set(
          `${servedRevision}:${servedCardId}`,
          {
            dailyItemId: servedItem?.id,
            taskRevision: servedItem?.revision.value,
            taskDate: dailyDate,
            taskSourcePath: servedItem?.sourcePath,
            tapSnapshot,
            display: servedDailyCard ? { ...servedDailyCard, actions: [...servedDailyCard.actions] } : undefined
          }
        );
      }
      while (this.localDeviceServedTaskRevisions.size > 128) {
        const oldest = this.localDeviceServedTaskRevisions.keys().next().value as string | undefined;
        if (!oldest) break;
        this.localDeviceServedTaskRevisions.delete(oldest);
      }
    }
    this.legacyEinkPlaylistCache.set(cacheKey, payload);
    if (this.legacyEinkPlaylistCache.size > 32) {
      const oldest = this.legacyEinkPlaylistCache.keys().next().value as string | undefined;
      if (oldest) this.legacyEinkPlaylistCache.delete(oldest);
    }
    return payload;
  }

  private invalidateLegacyEinkPlaylist(): void {
    this.legacyEinkPlaylistCache.clear();
  }

  private async advanceLocalDevicePage(direction: "next" | "prev"): Promise<void> {
    const pool = this.getDevicePagingPool();
    const currentId = this.currentDevicePagingLocalId();
    const nextId = direction === "next"
      ? nextDevicePagingItem(pool, currentId)
      : previousDevicePagingItem(pool, currentId);
    if (!nextId) {
      throw new Error(this.settings.language === "zh"
        ? "小屏翻页队列里没有可显示的卡片。请先保存 Echo 卡并开启“加入小屏翻页”，或加入 ToThink / ToWrite。"
        : "The small-screen paging queue is empty. Save an Echo card with paging enabled or add a ToThink / ToWrite card.");
    }
    await this.selectLocalDeviceCard(nextId);
    this.settings.hub.lastRotationCandidateId = nextId;
    this.settings.hub.rotationCursor = (pool.indexOf(nextId) + 1) % pool.length;
    await this.savePluginData();
    this.store.notify();
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
    const pool = this.getDevicePagingPool();
    if (pool.length === 0) {
      throw new Error(this.settings.language === "zh"
        ? "小屏翻页队列里没有可显示的卡片。请先保存 Echo 卡并开启“加入小屏翻页”，或加入 ToThink / ToWrite。"
        : "The small-screen paging queue has no eligible cards.");
    }
    const currentId = this.currentDevicePagingLocalId();
    const nextId = nextDevicePagingItem(pool, currentId) ?? pool[0];
    this.settings.hub.manualHoldUntil = "";
    this.settings.hub.manualHoldCandidateId = "";
    this.settings.hub.manualHoldContentId = "";
    await this.selectLocalDeviceCard(nextId);
    this.settings.hub.lastRotationCandidateId = nextId;
    this.settings.hub.rotationCursor = (pool.indexOf(nextId) + 1) % pool.length;
    await this.savePluginData();
    if (!this.deviceHub.isConfigured()) {
      return undefined;
    }
    try {
      const state = await this.deviceHub.selectLocalCandidate(nextId, this.buildHubCandidates(nextId, true), {
        reason: "manual",
        policyVersion: "towrite-user-next-v2",
        modelVersion: "user-next"
      });
      await this.localTapSelection.rememberHubSelection(nextId, state);
      this.settings.hub.lastRotationCandidateId = nextId;
      this.settings.hub.lastRotationContentId = state.selected?.selectedContentId ?? "";
      this.settings.hub.rotationCursor = (pool.indexOf(nextId) + 1) % pool.length;
      await this.savePluginData();
      return state;
    } catch (error) {
      const message = messageForError(error);
      this.settings.hub.lastError = message.slice(0, 500);
      await this.savePluginData();
      new Notice(this.settings.language === "zh"
        ? `本地小屏已翻页，Device Hub 同步失败：${message}`
        : `Local screen advanced; Device Hub sync failed: ${message}`);
      return undefined;
    }
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
      const dailyChoice = this.dailyPlanItems
        .filter((item) => !item.done
          && item.devicePolicy === "scheduled"
          && Boolean(item.scheduledFor)
          && Date.parse(item.scheduledFor ?? "") <= now.getTime())
        .map((item) => ({
          localId: `daily-plan:${item.id}`,
          occurrenceId: dailyScheduleOccurrenceId(item)
        }))
        .filter((item) => !consumedOccurrences.includes(item.occurrenceId))
        .sort((left, right) => left.occurrenceId.localeCompare(right.occurrenceId))[0];
      const questionChoice = scheduledLibraryChoice(library.entries, now, consumedOccurrences);
      const scheduledEcho = scheduledEchoCardChoice(this.settings.echoCards, now, consumedOccurrences);
      const echoChoice = scheduledEcho
        && this.buildHubCandidates(scheduledEcho.localId).some((candidate) => candidate.localId === scheduledEcho.localId)
        ? scheduledEcho
        : undefined;
      const choiceId = dailyChoice?.localId ?? questionChoice?.entry.id ?? echoChoice?.localId;
      const occurrenceId = dailyChoice?.occurrenceId ?? questionChoice?.occurrenceId ?? echoChoice?.occurrenceId;
      if (!choiceId || !occurrenceId) return state;
      const selected = await this.deviceHub.selectLocalCandidate(choiceId, this.buildHubCandidates(choiceId, true), {
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
    const pool = this.getDevicePagingPool();
    const choiceId = pool.length > 0 ? pool[hub.rotationCursor % pool.length] : undefined;
    if (!choiceId) return state;
    const selected = await this.deviceHub.selectLocalCandidate(choiceId, this.buildHubCandidates(choiceId, true), {
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

  private handleExternalApiRuntimeStatus(status: ExternalApiRuntimeStatus): void {
    const sessionId = status.startedAt?.trim() ?? "";
    if (sessionId !== this.observedExternalApiStartedAt) {
      this.observedExternalApiStartedAt = sessionId;
      this.observedSuccessfulEinkPolls = 0;
      this.localDeviceDisplayKeys.clear();
      this.localDeviceCompletionGuards.clear();
    }
    if (status.successfulPolls <= this.observedSuccessfulEinkPolls) return;
    this.observedSuccessfulEinkPolls = status.successfulPolls;
    // A GET only means the ESP32 fetched desired content. The authoritative
    // displayed tuple is updated solely by POST /api/v1/device/display-acks
    // after the panel refresh succeeds.
    this.notifyUi();
  }

  private async acknowledgeLocalDeviceDisplay(
    acknowledgement: DeviceDisplayAcknowledgement,
    targetId: string
  ): Promise<void> {
    const cardId = acknowledgement.cardId;
    const servedTask = this.localDeviceServedTaskRevisions.get(
      `${acknowledgement.playlistRevision}:${cardId}`
    );
    const targetKey = localDeviceTargetKey(targetId);
    this.localDeviceCompletionGuards.set(targetKey, {
      deviceId: acknowledgement.deviceId,
      selectionId: acknowledgement.selectionId,
      contentId: acknowledgement.contentId,
      revisionId: acknowledgement.revisionId,
      cardId,
      stateVersion: acknowledgement.stateVersion,
      playlistRevision: acknowledgement.playlistRevision,
      dailyItemId: servedTask?.dailyItemId,
      taskRevision: servedTask?.taskRevision,
      taskDate: servedTask?.taskDate,
      taskSourcePath: servedTask?.taskSourcePath
    });
    const displayKey = [
      targetKey,
      acknowledgement.selectionId,
      acknowledgement.stateVersion,
      acknowledgement.contentId,
      acknowledgement.revisionId,
      cardId,
      acknowledgement.playlistRevision
    ].join(":");
    if (displayKey === this.localDeviceDisplayKeys.get(targetKey)) return;
    this.localDeviceDisplayKeys.set(targetKey, displayKey);
    if (servedTask?.tapSnapshot) {
      await this.localTapSelection.recordLocalDisplayedSnapshot(servedTask.tapSnapshot);
    } else {
      await this.localTapSelection.recordLocalDisplayed(
        cardId,
        servedTask
          ? {
              dailyItemId: servedTask.dailyItemId,
              dailyTaskRevision: servedTask.taskRevision,
              dailyDate: servedTask.taskDate,
              dailySourcePath: servedTask.taskSourcePath
            }
          : undefined,
        servedTask?.display
          ? {
              contentType: servedTask.display.contentType,
              title: servedTask.display.title,
              prompt: servedTask.display.prompt ?? "",
              body: servedTask.display.body,
              allowedActions: servedTask.display.actions.filter(
                (action): action is HubContentAction =>
                  ["respond", "capture", "open", "next", "useful", "later", "skip", "complete"]
                    .includes(action)
              )
            }
          : undefined
      );
    }
    this.dailyActivityService.recordCardDisplayed(cardId);
    this.notifyUi();
  }

  private getCurrentDeviceCompletionGuard(targetId?: string): DeviceCompletionGuard | undefined {
    const exact = this.localDeviceCompletionGuards.get(localDeviceTargetKey(targetId));
    if (!exact) return undefined;
    return {
      cardId: exact.cardId,
      stateVersion: exact.stateVersion,
      playlistRevision: exact.playlistRevision
    };
  }

  private getCurrentDeviceDisplayedTuple(targetId?: string): DeviceDisplayedTuple | undefined {
    const exact = this.localDeviceCompletionGuards.get(localDeviceTargetKey(targetId));
    if (!exact?.deviceId || !exact.selectionId || !exact.contentId || !exact.revisionId) {
      return undefined;
    }
    return {
      deviceId: exact.deviceId,
      selectionId: exact.selectionId,
      stateVersion: exact.stateVersion,
      contentId: exact.contentId,
      revisionId: exact.revisionId,
      cardId: exact.cardId,
      playlistRevision: exact.playlistRevision
    };
  }

  private deviceCommandFingerprint(event: Pick<
    DeviceEventInput,
    | "deviceId"
    | "selectionId"
    | "stateVersion"
    | "contentId"
    | "revisionId"
    | "cardId"
    | "playlistRevision"
    | "button"
    | "gesture"
    | "action"
  >): string {
    return shortHash(JSON.stringify({
      deviceId: event.deviceId,
      selectionId: event.selectionId,
      stateVersion: event.stateVersion,
      contentId: event.contentId,
      revisionId: event.revisionId,
      cardId: event.cardId,
      playlistRevision: event.playlistRevision,
      button: event.button,
      gesture: event.gesture,
      action: event.action
    }));
  }

  private resolveLocalDeviceGestureReplay(
    event: DeviceEventInput
  ): DeviceCommandExecutionResult | undefined {
    const existing = this.deviceCommandJournal.get(event.eventId);
    if (!existing) return undefined;
    if (existing.fingerprint !== this.deviceCommandFingerprint(event)) {
      return { status: "conflict", displayMessage: "Event ID conflict" };
    }
    if (existing.status === "indeterminate") {
      return {
        status: "conflict",
        action: existing.action as DeviceActionIntent,
        displayMessage: existing.displayMessage
          || (this.settings.language === "zh"
            ? "上次命令结果未知，已安全阻止重复执行"
            : "Prior command outcome is unknown; retry blocked safely")
      };
    }
    return {
      status: existing.status === "executed"
        ? "executed"
        : existing.status === "unsupported"
          ? "unsupported"
          : "conflict",
      action: existing.action as DeviceActionIntent,
      resultRevision: existing.resultRevision,
      displayMessage: existing.displayMessage || deviceCommandMessage(existing.action as DeviceActionIntent)
    };
  }

  private async handleLocalDeviceGesture(event: DeviceEventInput) {
    const action = event.action;
    if (!action || event.schemaVersion !== 2) {
      return {
        status: "unsupported" as const,
        displayMessage: "Update device firmware"
      };
    }
    const displayed = this.localDeviceCompletionGuards.get(localDeviceTargetKey(event.targetId));
    const frozenDaily: FrozenDisplayedDailyContext | undefined = displayed
      ? {
          dailyItemId: displayed.dailyItemId,
          dailyTaskRevision: displayed.taskRevision,
          dailyDate: displayed.taskDate,
          dailySourcePath: displayed.taskSourcePath
        }
      : undefined;
    const fingerprint = this.deviceCommandFingerprint(event);
    const existing = this.deviceCommandJournal.get(event.eventId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return {
          status: "conflict" as const,
          displayMessage: "Event ID conflict"
        };
      }
      return {
        status: existing.status === "executed"
          ? "executed" as const
          : existing.status === "unsupported"
            ? "unsupported" as const
            : existing.status === "conflict"
              ? "conflict" as const
              : "conflict" as const,
        displayMessage: existing.status === "indeterminate"
          ? (this.settings.language === "zh" ? "命令已处理" : "Command already handled")
          : deviceCommandMessage(action)
      };
    }

    this.deviceCommandJournal.set(event.eventId, {
      eventId: event.eventId,
      fingerprint,
      status: "indeterminate",
      processedAt: new Date().toISOString(),
      action,
      displayMessage: this.settings.language === "zh"
        ? "命令执行中；若应用中断将不会自动重试"
        : "Command reserved; an interrupted side effect will not be retried"
    });
    this.trimDeviceCommandJournal();
    // Persist before any UI side effect. A crash between open() and the HTTP
    // response therefore cannot create a second modal on retry.
    await this.savePluginData();

    try {
      let resultRevision: string | undefined;
      let resolvedAction = action;
      let displayMessage = deviceCommandMessage(action);
      let status: "executed" | "unsupported" | "conflict" = "executed";

      if (action === "record_reserved") {
        status = "unsupported";
        displayMessage = this.settings.language === "zh" ? "录音功能尚未启用" : "Recording is not enabled";
      } else if (action === "page_prev" || action === "page_next") {
        await this.advanceLocalDailyPage(event.cardId, action === "page_next" ? "next" : "prev");
        displayMessage = this.settings.language === "zh" ? "已切换页面" : "Page queued";
      } else if (action === "task_prev" || action === "task_next") {
        if (!event.cardId?.startsWith("daily-plan:")) {
          throw new DailyPlanConflictError(
            "invalid-state",
            "Task switching is available only on a displayed Daily task page."
          );
        }
        await this.advanceLocalDailyTask(event.cardId, action === "task_next" ? "next" : "prev");
        displayMessage = this.settings.language === "zh" ? "已切换任务" : "Task queued";
      } else if (action === "complete") {
        await this.completeDailyFromDeviceEvent(event);
        displayMessage = this.settings.language === "zh" ? "已完成" : "Completed";
      } else if (action === "create_note") {
        await this.openCreateOnlyCaptureForDisplayed(event.cardId, frozenDaily);
        displayMessage = this.settings.language === "zh" ? "已打开新建记录" : "New capture opened";
      } else if (action === "open_current" || action === "start_open") {
        const opened = await this.openDisplayedCard(
          event.cardId,
          action === "open_current",
          frozenDaily
        );
        resolvedAction = opened.started ? "start_open" : "open_current";
        resultRevision = opened.resultRevision;
        displayMessage = opened.displayMessage;
      } else {
        status = "unsupported";
        displayMessage = this.settings.language === "zh" ? "固件动作不受支持" : "Unsupported gesture";
      }

      this.deviceCommandJournal.set(event.eventId, {
        eventId: event.eventId,
        fingerprint,
        status,
        processedAt: new Date().toISOString(),
        action: resolvedAction,
        resultRevision,
        displayMessage
      });
      await this.savePluginData();
      return { status, displayMessage, action: resolvedAction, resultRevision };
    } catch (error) {
      const message = messageForError(error);
      this.deviceCommandJournal.set(event.eventId, {
        eventId: event.eventId,
        fingerprint,
        status: "conflict",
        processedAt: new Date().toISOString(),
        action,
        displayMessage: message.slice(0, 80)
      });
      await this.savePluginData();
      return {
        status: "conflict" as const,
        displayMessage: message.slice(0, 80),
        action
      };
    }
  }

  private trimDeviceCommandJournal(): void {
    while (this.deviceCommandJournal.size > 256) {
      const oldest = this.deviceCommandJournal.keys().next().value as string | undefined;
      if (!oldest) break;
      this.deviceCommandJournal.delete(oldest);
    }
  }

  private async advanceLocalDailyPage(
    displayedCardId: string | undefined,
    direction: "next" | "prev"
  ): Promise<void> {
    const deck = this.currentDailyDeck();
    const taskCard = displayedCardId?.startsWith("daily-plan:")
      ? deck.planItems.find((card) => card.localId === displayedCardId)
      : undefined;
    const page = displayedCardId === deck.overview.localId
      ? "daily_overview"
      : displayedCardId === deck.result.localId
        ? "daily_result"
        : taskCard
          ? "daily_plan_item"
          : undefined;
    if (!page) {
      await this.advanceLocalDevicePage(direction);
      return;
    }
    const order = deck.pageOrder;
    const index = order.indexOf(page);
    const nextPage = order[(index + (direction === "next" ? 1 : -1) + order.length) % order.length];
    const nextId = nextPage === "daily_overview"
      ? deck.overview.localId
      : nextPage === "daily_result"
        ? deck.result.localId
        : taskCard?.localId || deck.activePlanItem?.localId || deck.result.localId;
    await this.selectLocalDeviceCard(nextId);
  }

  private async advanceLocalDailyTask(
    displayedCardId: string | undefined,
    direction: "next" | "prev"
  ): Promise<void> {
    const cards = this.currentDailyDeck().planItems;
    if (cards.length === 0) {
      throw new Error(this.settings.language === "zh" ? "今日还没有任务卡" : "There is no task card today");
    }
    const currentIndex = displayedCardId
      ? cards.findIndex((card) => card.localId === displayedCardId)
      : -1;
    const base = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (base + (direction === "next" ? 1 : -1) + cards.length) % cards.length;
    await this.selectLocalDeviceCard(cards[nextIndex].localId);
  }

  private async openDisplayedCard(
    displayedCardId: string | undefined,
    startOverview: boolean,
    frozenDaily?: FrozenDisplayedDailyContext
  ): Promise<{ started: boolean; resultRevision?: string; displayMessage: string }> {
    const cardId = displayedCardId?.trim() ?? "";
    const deck = this.currentDailyDeck();
    if (cardId.startsWith("daily-overview:")) {
      if (!frozenDaily?.dailyDate) {
        throw new DailyPlanConflictError(
          "revision-changed",
          "The displayed overview has no frozen Daily snapshot."
        );
      }
      const current = frozenDaily?.dailyItemId
        ? await this.resolveFrozenDailyItem(frozenDaily, frozenDaily.dailyItemId)
        : undefined;
      if (!current) {
        await this.activateDashboard();
        return {
          started: false,
          displayMessage: this.settings.language === "zh" ? "已打开今日计划" : "Today opened"
        };
      }
      const started = startOverview
        ? await this.startDailyItem(current.id, current.revision, current.date)
        : current;
      await this.refreshDailyPlanCache(false);
      try {
        const focused = await this.openDailyItemTarget(started);
        return {
          started: startOverview,
          resultRevision: started.revision.value,
          displayMessage: focused
            ? (this.settings.language === "zh" ? "已打开" : "Opened")
            : (this.settings.language === "zh" ? "已开始，请手动切到电脑" : "Started; bring computer forward")
        };
      } catch (error) {
        new Notice(this.settings.language === "zh"
          ? `任务已开始，但未能聚焦笔记：${messageForError(error)}`
          : `Task started, but the note could not be focused: ${messageForError(error)}`);
        return {
          started: startOverview,
          resultRevision: started.revision.value,
          displayMessage: this.settings.language === "zh" ? "已开始，聚焦失败" : "Started; focus failed"
        };
      }
    }
    if (cardId.startsWith("daily-result:") || cardId.startsWith("daily-summary:")) {
      const displayedDate = frozenDaily?.dailyDate
        || /^daily-(?:result|summary):(\d{4}-\d{2}-\d{2})$/u.exec(cardId)?.[1]
        || deck.date;
      const focused = await this.openDailyPlanSource(displayedDate);
      return {
        started: false,
        displayMessage: focused
          ? (this.settings.language === "zh" ? "已打开计划原文" : "Plan opened")
          : (this.settings.language === "zh" ? "请手动切到电脑" : "Bring computer forward")
      };
    }
    if (cardId.startsWith("daily-plan:")) {
      const id = cardId.slice("daily-plan:".length);
      const item = await this.resolveFrozenDailyItem(frozenDaily, id);
      const focused = await this.openDailyItemTarget(item);
      return {
        started: false,
        resultRevision: item.revision.value,
        displayMessage: focused
          ? (this.settings.language === "zh" ? "已打开" : "Opened")
          : (this.settings.language === "zh" ? "请手动切到电脑" : "Bring computer forward")
      };
    }
    const question = this.store.getQuestion(cardId);
    if (question) {
      await this.jumpToQuestion(cardId);
      const focused = bestEffortFocusObsidian();
      return {
        started: false,
        displayMessage: focused
          ? (this.settings.language === "zh" ? "已打开批注" : "Question opened")
          : (this.settings.language === "zh" ? "批注已打开，请切到电脑" : "Question opened; bring computer forward")
      };
    }
    const echo = cardId.startsWith("echo-card:")
      ? this.settings.echoCards.find((card) => echoCardLocalId(card) === cardId)
      : undefined;
    const echoTarget = echo ? this.resolveEchoCardTarget(echo) : undefined;
    if (echoTarget?.path) {
      await this.openFile(echoTarget.path);
      const focused = bestEffortFocusObsidian();
      return {
        started: false,
        displayMessage: focused
          ? (this.settings.language === "zh" ? "已打开" : "Opened")
          : (this.settings.language === "zh" ? "请手动切到电脑" : "Bring computer forward")
      };
    }
    await this.activateDashboard();
    const focused = bestEffortFocusObsidian();
    return {
      started: false,
      displayMessage: focused
        ? (this.settings.language === "zh" ? "已打开 ToWrite" : "ToWrite opened")
        : (this.settings.language === "zh" ? "请手动切到电脑" : "Bring computer forward")
    };
  }

  private async resolveFrozenDailyItem(
    frozen: FrozenDisplayedDailyContext | undefined,
    expectedId: string
  ): Promise<DailyPlanItem> {
    if (!frozen?.dailyItemId
      || frozen.dailyItemId !== expectedId
      || !frozen.dailyTaskRevision
      || !frozen.dailyDate) {
      throw new DailyPlanConflictError(
        "revision-changed",
        "The displayed Daily task has no frozen source revision."
      );
    }
    const item = await this.dailyPlanService.get(expectedId, frozen.dailyDate);
    if (!item
      || item.revision.value !== frozen.dailyTaskRevision
      || (frozen.dailySourcePath && item.sourcePath !== frozen.dailySourcePath)) {
      throw new DailyPlanConflictError(
        "revision-changed",
        "The displayed Daily task changed after the screen was refreshed."
      );
    }
    return item;
  }

  private async openDailyItemTarget(item: DailyPlanItem): Promise<boolean> {
    const rawTarget = item.target?.trim();
    const linkText = rawTarget
      ? rawTarget.replace(/^\[\[/u, "").replace(/\]\]$/u, "").split("|")[0].trim()
      : item.linkedNotes[0];
    const linked = linkText
      ? this.app.metadataCache.getFirstLinkpathDest(linkText.split("#")[0], item.sourcePath)
      : undefined;
    if (linked) {
      await this.app.workspace.openLinkText(linkText, item.sourcePath, false);
      return bestEffortFocusObsidian();
    }
    if (item.kind === "create_note") {
      this.openCaptureModal({
        entryPoint: "device-primary",
        createOnly: true,
        title: dailyCreateOnlyTitle(item),
        sourceFile: item.sourcePath
      });
      return bestEffortFocusObsidian();
    }
    await this.app.workspace.openLinkText(
      `${item.sourcePath}#^${item.blockId}`,
      item.sourcePath,
      false
    );
    return bestEffortFocusObsidian();
  }

  private async openDailyPlanSource(date: string): Promise<boolean> {
    const path = this.dailyPlanService.pathForDate(date);
    const file = this.app.vault.getFileByPath(path);
    if (file) {
      await this.openFile(path);
    } else {
      await this.activateDashboard();
    }
    return bestEffortFocusObsidian();
  }

  private async openCreateOnlyCaptureForDisplayed(
    displayedCardId: string | undefined,
    frozenDaily?: FrozenDisplayedDailyContext
  ): Promise<void> {
    const cardId = displayedCardId?.trim() ?? "";
    const dailyId = cardId.startsWith("daily-plan:")
      ? cardId.slice("daily-plan:".length)
      : cardId.startsWith("daily-overview:")
        ? frozenDaily?.dailyItemId
        : undefined;
    if (cardId.startsWith("daily-overview:") && !frozenDaily?.dailyDate) {
      throw new DailyPlanConflictError(
        "revision-changed",
        "The displayed overview has no frozen Daily snapshot."
      );
    }
    const item = dailyId
      ? await this.resolveFrozenDailyItem(frozenDaily, dailyId)
      : undefined;
    const question = this.store.getQuestion(cardId);
    this.openCaptureModal({
      entryPoint: "device-primary-double",
      createOnly: true,
      title: item?.kind === "create_note"
        ? item.target?.replace(/^\[\[/u, "").replace(/\]\]$/u, "").split("|")[0].split("/").at(-1)
          || item.text
        : undefined,
      sourceFile: item?.sourcePath || question?.source.file,
      questionId: question?.id,
      body: ""
    });
    bestEffortFocusObsidian();
  }

  private async completeDailyFromDeviceEvent(event: DeviceEventInput): Promise<void> {
    const cardId = event.cardId?.trim() ?? "";
    if (!cardId.startsWith("daily-plan:")) {
      throw new DailyPlanConflictError("revision-changed", "Only a displayed Daily plan card can be completed.");
    }
    const id = cardId.slice("daily-plan:".length);
    const served = this.localDeviceCompletionGuards.get(localDeviceTargetKey(event.targetId));
    const item = await this.dailyPlanService.get(id, served?.taskDate);
    if (!item) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
    if (!served?.taskRevision || item.revision.value !== served.taskRevision) {
      throw new DailyPlanConflictError("revision-changed", "The Daily task changed after this card was rendered.");
    }
    await this.completeDailyItem(id, item.revision, event.eventId, item.date);
    await this.advanceAfterDailyCompletion(id);
  }

  private async applyPendingHubDeviceEvent(
    event: HubPendingDeviceEvent
  ): Promise<{
    status: "applied" | "conflict" | "ignored";
    resultRevision?: string;
    message?: string;
  }> {
    if (event.deviceId !== this.settings.hub.deviceId.trim()) {
      return { status: "ignored", message: "Device does not belong to this Connector." };
    }

    const checkedFingerprint = shortHash(JSON.stringify({
      action: event.action,
      deviceId: event.deviceId,
      selectionId: event.selectionId,
      stateVersion: event.stateVersion,
      contentId: event.contentId,
      revisionId: event.revisionId,
      candidateRef: event.candidateRef,
      sourceRef: event.sourceRef,
      writeTargetRef: event.writeTargetRef
    }));
    const concurrentlyReserved = this.deviceCommandJournal.get(event.eventId);
    if (concurrentlyReserved) {
      if (concurrentlyReserved.fingerprint !== checkedFingerprint) {
        return { status: "conflict", message: "Event ID conflict." };
      }
      if (concurrentlyReserved.status === "indeterminate") {
        return {
          status: "conflict",
          message: concurrentlyReserved.displayMessage
            || "Prior command outcome is unknown; retry blocked safely."
        };
      }
      return {
        status: concurrentlyReserved.status === "executed"
          ? "applied"
          : concurrentlyReserved.status === "unsupported"
            ? "ignored"
            : "conflict",
        resultRevision: concurrentlyReserved.resultRevision,
        message: concurrentlyReserved.displayMessage || deviceCommandMessage(event.action)
      };
    }

    const displayed = this.getDeviceHubState()?.displayed;
    if (!displayed
      || displayed.selectionId !== event.selectionId
      || displayed.stateVersion !== event.stateVersion
      || displayed.contentId !== event.contentId
      || displayed.revisionId !== event.revisionId) {
      return {
        status: "conflict",
        message: "The command no longer matches the card visible on the screen."
      };
    }

    const uiCommand = event.action === "open_current"
      || event.action === "start_open"
      || event.action === "create_note"
      || event.action === "record_reserved";
    const createdAt = Date.parse(event.createdAt);
    const explicitExpiry = Date.parse(event.expiresAt ?? "");
    const expiry = Number.isFinite(explicitExpiry)
      ? explicitExpiry
      : Number.isFinite(createdAt)
        ? createdAt + 30_000
        : 0;
    if (uiCommand && (!expiry || expiry <= Date.now())) {
      return {
        status: "ignored",
        message: this.settings.language === "zh" ? "命令已过期" : "Command expired"
      };
    }

    const storedSnapshot = this.localTapSelection.serialize().contentSnapshots
      .find((entry) => entry.contentId === event.contentId)?.snapshot;
    const localId = storedSnapshot?.localId
      || await this.localIdForHubRefs(event.candidateRef, event.writeTargetRef);
    if (!localId) {
      return {
        status: "conflict",
        message: "The displayed card has no authenticated local mapping."
      };
    }

    const currentCandidate = this.buildHubCandidates(localId, true)
      .find((candidate) => candidate.localId === localId)
      ?? this.localDailyPageCandidate(localId);
    const expectedCandidateRef = await createOpaqueHubRef(
      "candidate",
      localId,
      this.settings.hub.referenceSecret
    );
    const expectedTargetPath = storedSnapshot?.candidate.path
      || currentCandidate?.writeTargetLocalId;
    const expectedSourceLocalId = (storedSnapshot?.sourceContext?.dailySourcePath && storedSnapshot.sourceContext.dailyItemId
        ? `${storedSnapshot.sourceContext.dailySourcePath}#^${storedSnapshot.sourceContext.dailyItemId}`
        : storedSnapshot?.sourceContext?.file)
      || currentCandidate?.sourceLocalId;
    const [expectedTargetRef, expectedSourceRef] = await Promise.all([
      expectedTargetPath
        ? createOpaqueHubRef("target", expectedTargetPath, this.settings.hub.referenceSecret)
        : Promise.resolve(undefined),
      expectedSourceLocalId
        ? createOpaqueHubRef("source", expectedSourceLocalId, this.settings.hub.referenceSecret)
        : Promise.resolve(undefined)
    ]);
    if (event.candidateRef !== expectedCandidateRef
      || (event.writeTargetRef || undefined) !== expectedTargetRef
      || (event.sourceRef || undefined) !== expectedSourceRef) {
      return {
        status: "conflict",
        message: "The command references do not match the authenticated local card."
      };
    }

    const fingerprint = shortHash(JSON.stringify({
      action: event.action,
      deviceId: event.deviceId,
      selectionId: event.selectionId,
      stateVersion: event.stateVersion,
      contentId: event.contentId,
      revisionId: event.revisionId,
      candidateRef: event.candidateRef,
      sourceRef: event.sourceRef,
      writeTargetRef: event.writeTargetRef
    }));
    const existing = this.deviceCommandJournal.get(event.eventId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return { status: "conflict", message: "Event ID conflict." };
      }
      if (existing.status) {
        return {
          status: existing.status === "executed" ? "applied" : existing.status === "unsupported" ? "ignored" : "conflict",
          resultRevision: existing.resultRevision,
          message: existing.status === "indeterminate"
            ? (this.settings.language === "zh" ? "命令已处理" : "Command already handled")
            : deviceCommandMessage(event.action)
        };
      }
    }

    this.deviceCommandJournal.set(event.eventId, {
      eventId: event.eventId,
      fingerprint,
      status: "indeterminate",
      processedAt: new Date().toISOString(),
      action: event.action,
      displayMessage: "Command reserved; an interrupted side effect will not be retried"
    });
    this.trimDeviceCommandJournal();
    // Persist before desktop UI side effects so a retry cannot open a second
    // note or Capture modal after a crash or a lost Hub ACK.
    await this.savePluginData();

    try {
      let resultRevision: string | undefined;
      let message = deviceCommandMessage(event.action);
      let journalStatus: "executed" | "unsupported" = "executed";

      if (event.action === "record_reserved") {
        journalStatus = "unsupported";
        message = this.settings.language === "zh" ? "录音功能尚未启用" : "Recording is not enabled";
      } else if (event.action === "create_note") {
        await this.openCreateOnlyCaptureForDisplayed(localId, {
          dailyItemId: storedSnapshot?.sourceContext?.dailyItemId,
          dailyTaskRevision: storedSnapshot?.sourceContext?.dailyTaskRevision,
          dailyDate: storedSnapshot?.sourceContext?.dailyDate,
          dailySourcePath: storedSnapshot?.sourceContext?.dailySourcePath
        });
        message = this.settings.language === "zh" ? "已打开新建记录" : "New capture opened";
      } else if (event.action === "open_current" || event.action === "start_open") {
        const opened = await this.openDisplayedCard(
          localId,
          event.action === "start_open",
          {
            dailyItemId: storedSnapshot?.sourceContext?.dailyItemId,
            dailyTaskRevision: storedSnapshot?.sourceContext?.dailyTaskRevision,
            dailyDate: storedSnapshot?.sourceContext?.dailyDate,
            dailySourcePath: storedSnapshot?.sourceContext?.dailySourcePath
          }
        );
        resultRevision = opened.resultRevision;
        message = opened.displayMessage;
      } else if (event.action === "complete") {
        if (event.contentType !== "daily_plan_item" || !localId.startsWith("daily-plan:")) {
          throw new DailyPlanConflictError(
            "revision-changed",
            "Only a displayed Daily plan card can be completed."
          );
        }
        const snapshot = storedSnapshot ?? await this.localTapSelection.snapshotForContent(event.contentId);
        const id = snapshot?.sourceContext?.dailyItemId;
        const frozenRevision = snapshot?.sourceContext?.dailyTaskRevision;
        const dailyDate = snapshot?.sourceContext?.dailyDate;
        if (!snapshot || !id || !frozenRevision || localId !== `daily-plan:${id}`) {
          throw new DailyPlanConflictError("revision-changed", "The displayed task mapping is stale.");
        }
        const item = await this.dailyPlanService.get(id, dailyDate);
        if (!item) {
          throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
        }
        if (item.revision.value !== frozenRevision) {
          throw new DailyPlanConflictError(
            "revision-changed",
            "The Daily task changed after this card was displayed."
          );
        }
        if (item.done) {
          resultRevision = item.revision.value;
        } else {
          const completed = await this.completeDailyItem(id, item.revision, event.eventId, item.date);
          await this.advanceAfterDailyCompletion(id);
          resultRevision = completed.revision.value;
        }
        message = this.settings.language === "zh" ? "已完成" : "Completed";
      } else {
        journalStatus = "unsupported";
        message = this.settings.language === "zh" ? "设备动作不受支持" : "Unsupported device action";
      }

      this.deviceCommandJournal.set(event.eventId, {
        eventId: event.eventId,
        fingerprint,
        status: journalStatus,
        processedAt: new Date().toISOString(),
        action: event.action,
        resultRevision,
        displayMessage: message
      });
      await this.savePluginData();
      return {
        status: journalStatus === "executed" ? "applied" : "ignored",
        resultRevision,
        message
      };
    } catch (error) {
      this.deviceCommandJournal.set(event.eventId, {
        eventId: event.eventId,
        fingerprint,
        status: "conflict",
        processedAt: new Date().toISOString(),
        action: event.action,
        displayMessage: messageForError(error).slice(0, 120)
      });
      await this.savePluginData();
      if (error instanceof DailyPlanConflictError || error instanceof CaptureBridgeRequestError) {
        return { status: "conflict", message: messageForError(error).slice(0, 120) };
      }
      throw error;
    }
  }

  getSmallScreenConnectionStatus(nowMs = Date.now()): SmallScreenConnectionStatus {
    const runtime = this.externalApiServer?.getRuntimeStatus();
    const lastTarget = runtime?.lastTargetId
      ? this.settings.push.targets.find((target) => target.id === runtime.lastTargetId)
      : undefined;
    const expectedTarget = lastTarget
      ?? this.settings.push.targets.find((target) => target.enabled && target.type === "local-web")
      ?? this.settings.push.targets.find((target) => target.enabled && target.id !== "quote0");
    const local = resolveLocalEinkConnectionStatus({
      enabled: this.settings.externalApi.enabled,
      bindHost: this.settings.externalApi.bindHost,
      port: this.settings.externalApi.port,
      refreshSeconds: LOCAL_EINK_EXPECTED_POLL_SECONDS,
      targetId: expectedTarget?.id,
      targetName: expectedTarget?.name,
      targetTokenConfigured: Boolean(expectedTarget?.token?.trim()),
      masterTokenConfigured: Boolean(this.settings.externalApi.token.trim()),
      runtime,
      nowMs
    });
    const hubState = this.getDeviceHubState();
    const hubConfigured = Boolean(
      this.settings.hub.enabled
      && this.settings.hub.receiverId.trim()
      && this.settings.hub.receiverToken.trim()
      && this.settings.hub.deviceId.trim()
    );
    const hubSelectedId = hubState?.selected?.selectedContentId
      || this.settings.hub.lastSelectedContentId
      || undefined;
    const hubDisplayedId = hubState?.displayed?.contentId
      || this.settings.hub.lastDisplayedContentId
      || undefined;
    const currentLocalId = local.lastServedCardId
      || this.localTapSelection.currentDisplayedLocalId()
      || this.currentDevicePagingLocalId();
    const currentEcho = currentLocalId?.startsWith("echo-card:")
      ? this.settings.echoCards.find((card) => echoCardLocalId(card) === currentLocalId)
      : undefined;
    const currentQuestion = currentLocalId && !currentEcho
      ? this.store?.getQuestion(currentLocalId)
      : undefined;
    const currentDailyId = currentLocalId?.startsWith("daily-plan:")
      ? currentLocalId.slice("daily-plan:".length)
      : undefined;
    const currentDaily = currentDailyId
      ? this.dailyPlanItems.find((item) => item.id === currentDailyId)
      : undefined;
    const paging = devicePagingPosition(this.getDevicePagingPool(), currentLocalId);
    const hasConfiguredRoute = local.enabled || hubConfigured;
    const deliveryReady = local.online || Boolean(hubState?.online);
    const waiting = local.state === "waiting";
    return {
      overall: deliveryReady
        ? "online"
        : !hasConfiguredRoute
          ? "disabled"
          : waiting
            ? "waiting"
            : "offline",
      local,
      hub: {
        enabled: this.settings.hub.enabled,
        configured: hubConfigured,
        online: Boolean(hubState?.online),
        inSync: Boolean(hubState?.inSync),
        selectedContentId: hubSelectedId,
        displayedContentId: hubDisplayedId,
        lastSyncedAt: this.settings.hub.lastSyncedAt || undefined,
        lastError: this.settings.hub.lastError || undefined
      },
      current: {
        localId: currentLocalId,
        title: currentEcho?.name
          || currentDaily?.text
          || currentQuestion?.title
          || currentQuestion?.question
          || local.lastServedTitle,
        contentType: currentEcho?.contentType
          || (currentDaily ? "daily_plan_item" : undefined)
          || (currentQuestion ? (currentQuestion.lane === "write" ? "note_continue" : "question_prompt") : undefined),
        sourceType: currentEcho
          ? "echo"
          : currentDaily
            ? "daily-plan"
            : currentQuestion
              ? "question"
              : paging.dailySourceType ?? paging.sourceType,
        lane: currentQuestion?.lane,
        pageIndex: paging.pageIndex,
        pageNumber: paging.pageNumber,
        totalPages: paging.totalPages,
        inQueue: paging.inQueue
      },
      hasConfiguredRoute,
      deliveryReady
    };
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
    this.dailyActivityService.recordCaptureCommitted(result.captureId);
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
  private savedDailyActivityState?: DailyActivityState;

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
    this.savedDailyActivityState = data?.dailyActivityState;
    this.dailyDeviceStateVersion = Number.isSafeInteger(data?.dailyDeviceStateVersion)
      ? Math.max(1, Number(data?.dailyDeviceStateVersion))
      : 1;
    this.dailyScheduleOccurrenceIds = new Set(
      Array.isArray(data?.dailyScheduleOccurrenceIds)
        ? data.dailyScheduleOccurrenceIds.filter((value): value is string => typeof value === "string" && value.length <= 240).slice(-200)
        : []
    );
    this.deviceCommandJournal.clear();
    for (const entry of Array.isArray(data?.deviceCommandJournal) ? data.deviceCommandJournal.slice(-256) : []) {
      if (!entry || typeof entry.eventId !== "string" || typeof entry.fingerprint !== "string"
        || typeof entry.processedAt !== "string" || typeof entry.action !== "string"
        || (entry.status !== "processing" && entry.status !== "indeterminate"
          && entry.status !== "executed" && entry.status !== "unsupported"
          && entry.status !== "conflict")) {
        continue;
      }
      this.deviceCommandJournal.set(entry.eventId, {
        eventId: entry.eventId.slice(0, 160),
        fingerprint: entry.fingerprint.slice(0, 240),
        status: entry.status === "processing" ? "indeterminate" : entry.status,
        processedAt: entry.processedAt,
        action: entry.action.slice(0, 80),
        resultRevision: typeof entry.resultRevision === "string"
          ? entry.resultRevision.slice(0, 160)
          : undefined,
        displayMessage: typeof entry.displayMessage === "string"
          ? entry.displayMessage.slice(0, 160)
          : undefined
      });
    }
  }

  private initializeDailyServices(state: DailyActivityState | undefined = this.savedDailyActivityState): void {
    this.dailyPlanService = this.createDailyPlanService();
    this.dailyActivityRetentionDays = this.settings.daily.rawEventRetentionDays;
    this.dailyActivityService = new DailyActivityService(state, {
      retentionDays: this.dailyActivityRetentionDays,
      language: this.settings.language,
      onChanged: (nextState) => {
        this.savedDailyActivityState = nextState;
        this.notifyUi();
        this.scheduleDailyStateSave();
      },
      onError: (error) => console.error("ToWrite Daily activity failed", error)
    });
    this.dailyActivityService.setCollectionPaused(
      !this.settings.daily.enabled || !this.settings.daily.activityTracking
    );
  }

  private createDailyPlanService(): DailyPlanService {
    return new DailyPlanService({
      readText: async (path) => {
        const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
        if (!file) return undefined;
        if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") {
          throw new Error(`${path} is not a Markdown file.`);
        }
        return this.app.vault.read(file);
      },
      writeText: async (path, content) => {
        const normalized = normalizePath(path);
        await this.ensureParentFolder(normalized);
        const existing = this.app.vault.getAbstractFileByPath(normalized);
        if (existing instanceof TFile) {
          await this.app.vault.modify(existing, content);
          return;
        }
        if (existing) throw new Error(`${normalized} already exists and is not a file.`);
        await this.app.vault.create(normalized, content);
      }
    }, {
      source: this.settings.daily.planSourceMode === "fixed-document"
        ? { kind: "fixed-document", path: this.settings.daily.fixedPlanPath }
        : { kind: "daily-note", dailyRoot: this.settings.daily.dailyNoteRoot },
      dailyRoot: this.settings.daily.dailyNoteRoot,
      planHeading: this.settings.daily.planHeading,
      todoHeading: this.settings.daily.todoHeading,
      summaryHeading: this.settings.daily.summaryHeading,
      onChanged: async () => {
        await this.refreshDailyPlanCache();
        this.queueDeviceHubSync();
      }
    });
  }

  private scheduleDailyStateSave(): void {
    if (this.dailyStateSaveTimer) window.clearTimeout(this.dailyStateSaveTimer);
    this.dailyStateSaveTimer = window.setTimeout(() => {
      this.dailyStateSaveTimer = 0;
      void this.savePluginData();
    }, 500);
  }

  private scheduleDailyMidnightRefresh(): void {
    if (this.dailyMidnightTimer) window.clearTimeout(this.dailyMidnightTimer);
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 1, 0);
    this.dailyMidnightTimer = window.setTimeout(() => {
      this.dailyMidnightTimer = 0;
      void this.refreshDailyDashboard().finally(() => this.scheduleDailyMidnightRefresh());
    }, Math.max(1_000, next.getTime() - now.getTime()));
  }

  /**
   * One-shot local scheduler. It only changes desired state after the exact
   * item/time occurrence becomes due; the bounded occurrence set makes
   * restarts and 30-second ticks idempotent.
   */
  private async runDueDailyDeviceSchedule(now = new Date()): Promise<void> {
    if (!this.localTapSelection
      || !this.settings.daily.enabled
      || normalizeHubContextState(this.settings.hub.manualMode) === "do_not_disturb"
      || isManualHoldActive(this.settings.hub.manualHoldUntil, now)) {
      return;
    }
    const due = this.dailyPlanItems
      .filter((item) => !item.done
        && item.devicePolicy === "scheduled"
        && Boolean(item.scheduledFor)
        && Date.parse(item.scheduledFor ?? "") <= now.getTime())
      .sort((left, right) => (left.scheduledFor ?? "").localeCompare(right.scheduledFor ?? "")
        || left.id.localeCompare(right.id))
      .find((item) => !this.dailyScheduleOccurrenceIds.has(dailyScheduleOccurrenceId(item)));
    if (!due) return;
    const occurrenceId = dailyScheduleOccurrenceId(due);
    const localId = `daily-plan:${due.id}`;
    await this.selectLocalDeviceCard(localId);
    if (this.deviceHub?.isConfigured()) {
      try {
        const state = await this.deviceHub.selectLocalCandidate(localId, this.buildHubCandidates(localId, true), {
          reason: "policy",
          policyVersion: "towrite-daily-once-v1",
          modelVersion: "deterministic-schedule"
        });
        await this.localTapSelection.rememberHubSelection(localId, state);
        this.settings.hub.lastError = "";
      } catch (error) {
        this.settings.hub.lastError = messageForError(error).slice(0, 500);
      }
    }
    this.dailyScheduleOccurrenceIds.add(occurrenceId);
    while (this.dailyScheduleOccurrenceIds.size > 200) {
      const oldest = this.dailyScheduleOccurrenceIds.values().next().value as string | undefined;
      if (!oldest) break;
      this.dailyScheduleOccurrenceIds.delete(oldest);
    }
    this.scheduleDailyStateSave();
    this.queueDeviceHubSync();
  }

  private async refreshDailyPlanCache(notify = true): Promise<void> {
    const previous = this.dailyPlanItems;
    const previousRevision = this.dailyPlanDocument?.revision;
    const document = this.settings.daily.enabled
      ? await this.dailyPlanService.read()
      : undefined;
    const next = document?.items ?? [];
    if (this.dailyPlanCacheInitialized && previous[0]?.sourcePath === next[0]?.sourcePath) {
      const previousById = new Map(previous.map((item) => [item.id, item]));
      for (const item of next) {
        const old = previousById.get(item.id);
        if (old && !old.done && item.done) {
          this.dailyActivityService.recordTaskCompleted(item.id);
        }
      }
    }
    this.dailyPlanItems = next;
    this.dailyPlanDocument = document;
    if (this.dailyPlanCacheInitialized && previousRevision && document?.revision !== previousRevision) {
      this.dailyDeviceStateVersion += 1;
      this.scheduleDailyStateSave();
    }
    this.dailyPlanCacheInitialized = true;
    this.invalidateLegacyEinkPlaylist();
    if (notify) this.notifyUi();
    void this.runDueDailyDeviceSchedule().catch((error: unknown) => {
      console.error("ToWrite Daily one-shot schedule failed", error);
    });
  }

  async refreshDailyDashboard(): Promise<void> {
    this.dailyBackendWriterCheckedAt = 0;
    const needsActivityReconfigure = !this.dailyActivityService
      || this.dailyActivityRetentionDays !== this.settings.daily.rawEventRetentionDays;
    if (needsActivityReconfigure) {
      await this.dailyActivityService?.flushMeasurements();
      const activityState = this.dailyActivityService?.getState() ?? this.savedDailyActivityState;
      this.dailyActivityService?.dispose();
      this.initializeDailyServices(activityState);
    } else {
      this.dailyPlanService = this.createDailyPlanService();
      this.dailyActivityService.setCollectionPaused(
        !this.settings.daily.enabled || !this.settings.daily.activityTracking
      );
    }
    await this.refreshDailyPlanCache();
  }

  private async getDailyDashboardSnapshot(value: Date | string = new Date()): Promise<DailyDashboardSnapshot> {
    const date = formatDailyInputDate(value);
    const today = formatDailyInputDate(new Date());
    if (date === today) {
      await this.refreshDailyPlanCache(false);
      return this.dailyActivityService.getSnapshot(date, this.dailyPlanItems);
    }
    const items = this.settings.daily.enabled ? await this.dailyPlanService.list(date) : [];
    return this.dailyActivityService.getSnapshot(date, items);
  }

  private async createDailyItem(input: DailyPlanCreateInput): Promise<DailyPlanItem> {
    this.assertDailyEnabled();
    if (await this.shouldUseBackendDailyWriter()) {
      const date = input.date ? formatDailyInputDate(input.date) : formatDailyInputDate(new Date());
      const result = await this.backendClient.createDailyTask({
        id: input.id,
        text: dailyTaskTextForBackend(input.text, input.priority, input.priority !== undefined),
        date,
        kind: input.kind ?? "task",
        devicePolicy: input.devicePolicy ?? "none",
        scheduledFor: input.scheduledFor,
        dueDate: input.dueDate,
        tags: input.tags,
        primary: input.primary,
        minimum: input.minimum,
        goal: input.goal,
        nextStep: input.nextStep,
        estimateMinutes: input.estimateMinutes,
        target: input.target
      });
      await this.refreshDailyPlanCache();
      const created = await this.dailyPlanService.get(result.id, date);
      if (!created) throw new Error("Backend wrote the Daily task, but the local Markdown view could not verify it.");
      return created;
    }
    return this.dailyPlanService.create(input);
  }

  private async updateDailyItem(
    id: string,
    revision: DailyTaskRevision,
    patch: DailyPlanUpdate,
    value: Date | string = new Date()
  ): Promise<DailyPlanItem> {
    this.assertDailyEnabled();
    if (await this.shouldUseBackendDailyWriter()) {
      const current = await this.dailyPlanService.get(id, value);
      if (!current) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
      if (current.revision.value !== revision.value) {
        throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
      }
      await this.backendClient.updateDailyTask({
        id,
        rawLine: current.rawLine,
        rawBlock: current.rawBlock,
        text: dailyTaskTextForBackend(
          patch.text ?? current.text,
          patch.priority ?? current.priority,
          patch.priority !== undefined || current.priorityExplicit
        ),
        date: patch.dueDate ?? current.dueDate,
        status: patch.status,
        kind: patch.kind ?? current.kind,
        devicePolicy: patch.devicePolicy ?? current.devicePolicy,
        scheduledFor: patch.scheduledFor === null ? undefined : patch.scheduledFor ?? current.scheduledFor,
        tags: patch.tags ?? current.tags,
        primary: patch.primary ?? current.primary,
        minimum: patch.minimum ?? current.minimum,
        goal: patch.goal === null ? "" : patch.goal ?? current.goal,
        nextStep: patch.nextStep === null ? "" : patch.nextStep ?? current.nextStep,
        estimateMinutes: patch.estimateMinutes === null ? undefined : patch.estimateMinutes ?? current.estimateMinutes,
        target: patch.target === null ? "" : patch.target ?? current.target,
        startedAt: patch.startedAt === null ? "" : patch.startedAt ?? current.startedAt
      });
      await this.refreshDailyPlanCache();
      const updated = await this.dailyPlanService.get(id, value);
      if (!updated) throw new Error("Backend updated the Daily task, but the local Markdown view could not verify it.");
      return updated;
    }
    return this.dailyPlanService.update(id, revision, patch, value);
  }

  private async updateDailyPlanMetadata(
    date: string,
    expectedPlanRevision: string,
    patch: DailyPlanMetadataUpdate
  ): Promise<DailyPlanDocument> {
    this.assertDailyEnabled();
    let document: DailyPlanDocument;
    if (await this.shouldUseBackendDailyWriter()) {
      const current = await this.dailyPlanService.read(date);
      if (current.revision !== expectedPlanRevision) {
        throw new DailyPlanConflictError("revision-changed", "The Daily plan changed after it was loaded.");
      }
      const backendPlan = await this.backendClient.getDailyPlan(date);
      if (patch.theme !== undefined) {
        await this.backendClient.updateDailyPlan(
          date,
          patch.theme === null ? "" : patch.theme ?? current.metadata.theme ?? "",
          backendPlan.noteRevision
        );
        await this.refreshDailyPlanCache();
      }
      for (const [key, requestedId] of [
        ["primary", patch.primaryId],
        ["minimum", patch.minimumId]
      ] as const) {
        if (requestedId === undefined) continue;
        const refreshed = await this.dailyPlanService.read(date);
        if (requestedId !== null && !refreshed.items.some((item) => item.id === requestedId)) {
          throw new DailyPlanConflictError("not-found", `Daily plan ${key} task does not exist: ${requestedId}`);
        }
        for (const item of refreshed.items) {
          const desired = requestedId !== null && item.id === requestedId;
          if (Boolean(item[key]) === desired) continue;
          await this.updateDailyItem(item.id, item.revision, { [key]: desired }, date);
        }
      }
      document = await this.dailyPlanService.read(date);
    } else {
      document = await this.dailyPlanService.updateMetadata(
        patch,
        expectedPlanRevision,
        date
      );
    }
    await this.refreshDailyPlanCache();
    this.queueDeviceHubSync();
    return document;
  }

  private async startDailyItem(
    id: string,
    revision: DailyTaskRevision,
    value: Date | string = new Date()
  ): Promise<DailyPlanItem> {
    this.assertDailyEnabled();
    let started: DailyPlanItem;
    if (await this.shouldUseBackendDailyWriter()) {
      const current = await this.dailyPlanService.get(id, value);
      if (!current) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
      if (current.revision.value !== revision.value) {
        throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
      }
      await this.backendClient.updateDailyTask({
        id,
        rawLine: current.rawLine,
        rawBlock: current.rawBlock,
        text: current.text,
        date: current.dueDate,
        status: "in-progress",
        kind: current.kind,
        devicePolicy: current.devicePolicy,
        scheduledFor: current.scheduledFor,
        tags: current.tags
      });
      await this.refreshDailyPlanCache();
      const verified = await this.dailyPlanService.get(id, value);
      if (!verified) throw new Error("Backend started the Daily task, but the local Markdown view could not verify it.");
      started = verified;
    } else {
      started = await this.dailyPlanService.start(id, revision, value);
    }
    await this.refreshDailyPlanCache();
    this.queueDeviceHubSync();
    return started;
  }

  private async completeDailyItem(
    id: string,
    revision: DailyTaskRevision,
    eventId?: string,
    value: Date | string = new Date()
  ): Promise<DailyPlanItem> {
    this.assertDailyEnabled();
    let item: DailyPlanItem;
    if (await this.shouldUseBackendDailyWriter()) {
      const current = await this.dailyPlanService.get(id, value);
      if (!current) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
      if (current.revision.value !== revision.value) {
        throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
      }
      await this.backendClient.completeDailyTask(id, current.rawBlock ?? current.rawLine);
      await this.refreshDailyPlanCache();
      item = await this.dailyPlanService.get(id, value) ?? current;
    } else {
      item = await this.dailyPlanService.complete(id, revision, value);
    }
    this.dailyActivityService.recordTaskCompleted(id, new Date(), eventId);
    return item;
  }

  private async reopenDailyItem(
    id: string,
    revision: DailyTaskRevision,
    value: Date | string = new Date()
  ): Promise<DailyPlanItem> {
    this.assertDailyEnabled();
    if (await this.shouldUseBackendDailyWriter()) {
      const current = await this.dailyPlanService.get(id, value);
      if (!current) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
      if (current.revision.value !== revision.value) {
        throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
      }
      await this.backendClient.reopenDailyTask(id, current.rawBlock ?? current.rawLine);
      await this.refreshDailyPlanCache();
      const reopened = await this.dailyPlanService.get(id, value);
      if (!reopened) throw new Error("Backend reopened the Daily task, but the local Markdown view could not verify it.");
      return reopened;
    }
    return this.dailyPlanService.reopen(id, revision, value);
  }

  private async writeDailySummary(summary: DailySummary): Promise<{ path: string; changed: boolean }> {
    this.assertDailyEnabled();
    if (await this.shouldUseBackendDailyWriter()) {
      const result = await this.backendClient.writeDailySummary(summary);
      await this.refreshDailyPlanCache();
      return { path: this.dailyPlanService.pathForDate(summary.date), changed: result.changed };
    }
    return this.dailyPlanService.writeSummary(summary);
  }

  private async shouldUseBackendDailyWriter(now = Date.now()): Promise<boolean> {
    const mode = this.settings.daily.writerMode;
    if (mode === "local") return false;
    if (!this.settings.backend.enabled) {
      if (mode === "backend") throw new Error("DailyOps Backend writer is selected, but Backend integration is disabled.");
      return false;
    }
    if (now - this.dailyBackendWriterCheckedAt < 15_000) {
      if (!this.dailyBackendWriterAvailable && mode === "backend") {
        throw new Error("DailyOps Backend writer is unavailable or incompatible.");
      }
      return this.dailyBackendWriterAvailable;
    }
    try {
      const status = await this.backendClient.getDailyOpsStatus();
      const expectedPlanSource = this.settings.daily.planSourceMode === "fixed-document" ? "fixed" : "daily";
      const sourceCompatible = status.planSource === expectedPlanSource
        && (expectedPlanSource === "fixed"
          ? normalizeVaultPath(status.planDocument) === normalizeVaultPath(this.settings.daily.fixedPlanPath)
          : normalizeFolderPath(status.dailyNoteRoot) === normalizeFolderPath(this.settings.daily.dailyNoteRoot)
            && status.dailyNoteFormat === this.settings.daily.dailyNoteFormat);
      const compatible = status.protocolVersion === "towrite-daily-ops/v2"
        && status.markdownContract === "towrite-daily-plan/v2"
        && status.enabled
        && status.writerCapable
        && sourceCompatible
        && status.todoHeading.trim().toLowerCase() === this.settings.daily.todoHeading.trim().toLowerCase()
        && status.planHeading.trim().toLowerCase() === this.settings.daily.planHeading.trim().toLowerCase();
      this.dailyBackendWriterAvailable = compatible;
      this.dailyBackendWriterCheckedAt = now;
      if (!compatible && mode === "backend") {
        throw new Error("DailyOps Backend is reachable, but its Markdown contract or Daily folder settings do not match ToWrite.");
      }
      return compatible;
    } catch (error) {
      this.dailyBackendWriterAvailable = false;
      this.dailyBackendWriterCheckedAt = now;
      if (mode === "backend") throw error;
      return false;
    }
  }

  private assertDailyEnabled(): void {
    if (!this.settings.daily.enabled) {
      throw new Error(this.settings.language === "zh" ? "请先在设置中启用“今日计划”。" : "Enable Daily planning in settings first.");
    }
  }

  private async generateDailySummary(mode: "rules" | "ai"): Promise<DailySummaryPresentation> {
    const snapshot = await this.getDailyDashboardSnapshot();
    if (mode === "rules") return { ...snapshot.summary, source: "rules" };
    const reply = await this.aiProvider.chat([
      {
        role: "system",
        content: [
          "Rewrite a factual daily writing summary using only the supplied structured counters and plan labels.",
          "Never add tasks, achievements, or note contents.",
          dailyAiSummaryPlaceholderInstruction()
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify({
          date: snapshot.date,
          metrics: snapshot.summary.metrics,
          items: snapshot.plan.items.map((item) => ({
            text: item.text,
            kind: item.kind,
            status: item.status
          }))
        })
      }
    ], undefined, { maxTokens: 500 });
    const parsed = parseConstrainedDailyAiSummary(reply, snapshot.summary);
    if (!parsed) {
      return { ...snapshot.summary, source: "rules" };
    }
    return {
      ...snapshot.summary,
      headline: parsed.headline,
      lines: parsed.lines,
      markdown: [`## ${this.settings.daily.summaryHeading}`, "", parsed.headline, "", ...parsed.lines.map((line) => `- ${line}`)].join("\n"),
      source: "ai"
    };
  }

  private createDailyDashboardAdapter(): DailyDashboardAdapter {
    return {
      getSnapshot: (date) => this.getDailyDashboardSnapshot(date ?? new Date()),
      getPlanMetadata: async (date) => {
        const document = await this.dailyPlanService.read(date);
        return {
          ...document.metadata,
          sourcePath: document.sourcePath,
          sourceKind: document.source.kind,
          diagnostics: document.diagnostics.map((diagnostic) => diagnostic.message),
          revision: document.revision
        };
      },
      updatePlanMetadata: async (date, revision, patch) => {
        const current = await this.dailyPlanService.read(date);
        if (revision && current.revision !== revision) {
          throw new DailyPlanConflictError("revision-changed", "The Daily plan changed after it was loaded.");
        }
        let planRevision = current.revision;
        if (Object.prototype.hasOwnProperty.call(patch, "theme")) {
          const updated = await this.updateDailyPlanMetadata(
            date,
            planRevision,
            { theme: patch.theme ?? null }
          );
          planRevision = updated.revision;
        }
        if (patch.primaryId) {
          const item = await this.dailyPlanService.get(patch.primaryId, date);
          if (item && !item.primary) {
            await this.updateDailyItem(item.id, item.revision, { primary: true }, date);
          }
        }
        if (patch.minimumId) {
          const item = await this.dailyPlanService.get(patch.minimumId, date);
          if (item && !item.minimum) {
            await this.updateDailyItem(item.id, item.revision, { minimum: true }, date);
          }
        }
        await this.refreshDailyPlanCache();
      },
      createItem: async (input) => { await this.createDailyItem(input); },
      updateItem: async (id, revision, patch) => {
        await this.updateDailyItem(id, revision, patch, await this.dateForDailyItem(id, revision));
      },
      moveItem: async (id, revision, direction) => {
        const date = await this.dateForDailyItem(id, revision);
        if (await this.shouldUseBackendDailyWriter()) {
          const current = await this.dailyPlanService.get(id, date);
          if (!current) {
            throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
          }
          if (current.revision.value !== revision.value) {
            throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
          }
          await this.backendClient.moveDailyTask(
            id,
            current.rawBlock ?? current.rawLine,
            direction
          );
        } else {
          await this.dailyPlanService.move(id, revision, direction, date);
        }
        await this.refreshDailyPlanCache();
      },
      startItem: async (id, revision) => {
        const date = await this.dateForDailyItem(id, revision);
        await this.startDailyItem(id, revision, date);
      },
      completeItem: async (id, revision) => {
        await this.completeDailyItem(id, revision, undefined, await this.dateForDailyItem(id, revision));
      },
      reopenItem: async (id, revision) => {
        await this.reopenDailyItem(id, revision, await this.dateForDailyItem(id, revision));
      },
      writeSummary: async (summary) => { await this.writeDailySummary(summary); },
      generateSummary: (mode) => this.generateDailySummary(mode),
      sendItemToDevice: async (id, revision) => {
        await this.sendDailyItemToDevice(id, revision, await this.dateForDailyItem(id, revision));
      },
      sendSummaryToDevice: async () => { await this.sendDailySummaryToDevice(); },
      openItem: async (item) => { await this.openDailyItemTarget(item); },
      openPlanSource: async (date) => { await this.openDailyPlanSource(date); },
      listPlanningCandidates: (date) => this.listDailyPlanningCandidates(date),
      addPlanningCandidate: async (date, candidate) => {
        await this.createDailyItem({
          date,
          text: candidate.title,
          kind: candidate.kind ?? "edit_note",
          target: candidate.target,
          devicePolicy: "rotation"
        });
      },
      subscribe: (listener) => this.subscribe(listener)
    };
  }

  private async dateForDailyItem(id: string, revision: DailyTaskRevision): Promise<string> {
    const dates = [0, 1, -1].map((offset) => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      return formatDailyInputDate(date);
    });
    for (const date of dates) {
      const item = await this.dailyPlanService.get(id, date);
      if (item && item.revision.value === revision.value) return date;
    }
    throw new DailyPlanConflictError("not-found", `Daily item does not exist at the supplied revision: ${id}`);
  }

  private listDailyPlanningCandidates(_date: string): DailyPlanningCandidate[] {
    const output: DailyPlanningCandidate[] = [];
    const seen = new Set<string>();
    const append = (candidate: DailyPlanningCandidate): void => {
      if (!candidate.id || seen.has(candidate.id)) return;
      seen.add(candidate.id);
      output.push(candidate);
    };
    for (const question of this.store.query().filter((item) => item.status !== "resolved" && item.status !== "ignored")) {
      append({
        id: `question:${question.id}`,
        title: question.title || question.question,
        description: question.question,
        source: question.lane === "write" ? "towrite" : "tothink",
        kind: "edit_note",
        target: dailyWikiLink(question.source.file, question.source.blockId)
      });
    }
    for (const item of this.getInboxSnapshot().items) {
      append({
        id: `inbox:${item.id}`,
        title: item.title,
        description: item.project || item.folder,
        source: "inbox",
        kind: "edit_note",
        target: `[[${item.filePath}]]`
      });
    }
    for (const article of this.store.getArticleSummaries().filter((item) => item.stale)) {
      append({
        id: `stale:${article.filePath}`,
        title: article.title,
        description: this.settings.language === "zh" ? "久未继续的笔记" : "Stale note",
        source: "stale",
        kind: "edit_note",
        target: `[[${article.filePath}]]`
      });
    }
    for (const card of this.settings.echoCards) {
      const target = this.resolveEchoCardTarget(card);
      if (!target || target.kind !== "existingNote") continue;
      append({
        id: `echo:${card.id}`,
        title: card.name,
        description: card.whyNow || card.context,
        source: "echo",
        kind: "edit_note",
        target: `[[${target.path}]]`
      });
    }
    return output.slice(0, 100);
  }

  async exportDailyActivity(): Promise<void> {
    const bundle = this.dailyActivityService.exportBundle();
    const root = normalizeVaultPath(this.settings.exportDirectory);
    await writeVaultDataText(this.app, `${root}/${bundle.files.events}`, bundle.eventsJsonl);
    await writeVaultDataText(this.app, `${root}/${bundle.files.aggregates}`, bundle.aggregatesJson);
  }

  async clearDailyActivity(): Promise<void> {
    this.dailyActivityService.clearActivityData();
    await this.savePluginData();
    this.notifyUi();
  }

  private async sendDailyItemToDevice(
    id: string,
    revision: DailyTaskRevision,
    value: Date | string = new Date()
  ): Promise<void> {
    const current = await this.dailyPlanService.get(id, value);
    if (!current) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
    if (current.revision.value !== revision.value) {
      throw new DailyPlanConflictError("revision-changed", "The Daily item changed before it could be sent.");
    }
    await this.sendLocalCandidateToDeviceHub(`daily-plan:${id}`);
  }

  private async sendDailySummaryToDevice(): Promise<void> {
    const snapshot = await this.getDailyDashboardSnapshot();
    await this.sendLocalCandidateToDeviceHub(`daily-summary:${snapshot.date}`);
  }

  private async completeDailyFromBridge(
    snapshot: TapSelectionSnapshot,
    eventId: string
  ): Promise<{ path: string; completedAt: string; idempotent?: boolean }> {
    const id = snapshot.sourceContext?.dailyItemId;
    const revision = snapshot.sourceContext?.dailyTaskRevision;
    const dailyDate = snapshot.sourceContext?.dailyDate;
    if (!id || !revision) {
      throw new CaptureBridgeRequestError(409, "The displayed card is not a Daily plan item.");
    }
    const item = await this.completeDailyItem(id, {
      value: revision,
      sourcePath: snapshot.sourceContext?.dailySourcePath ?? "",
      blockId: id
    }, `bridge-complete:${eventId}`, dailyDate);
    await this.advanceAfterDailyCompletion(id);
    return {
      path: item.sourcePath,
      completedAt: new Date().toISOString(),
      idempotent: false
    };
  }

  private async snoozeDailyFromBridge(
    snapshot: TapSelectionSnapshot,
    _eventId: string
  ): Promise<{ path: string; snoozedUntil: string; idempotent?: boolean }> {
    const id = snapshot.sourceContext?.dailyItemId;
    const revision = snapshot.sourceContext?.dailyTaskRevision;
    const dailyDate = snapshot.sourceContext?.dailyDate;
    if (!id || !revision) {
      throw new CaptureBridgeRequestError(409, "The displayed card is not a Daily plan item.");
    }
    const snoozedUntil = new Date(Date.now() + 30 * 60_000).toISOString();
    const item = await this.updateDailyItem(id, {
      value: revision,
      sourcePath: snapshot.sourceContext?.dailySourcePath ?? "",
      blockId: id
    }, {
      devicePolicy: "scheduled",
      scheduledFor: snoozedUntil
    }, dailyDate);
    return { path: item.sourcePath, snoozedUntil, idempotent: false };
  }

  private async advanceAfterDailyCompletion(completedId: string): Promise<void> {
    const localId = `daily-plan:${completedId}`;
    if (this.currentDevicePagingLocalId() !== localId) return;
    const pool = this.getDevicePagingPool();
    const nextId = nextDevicePagingItem(pool, localId);
    if (nextId && nextId !== localId) {
      await this.selectLocalDeviceCard(nextId);
    }
    this.queueDeviceHubSync();
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
    const local = this.buildHubCandidates(localId).find((candidate) => candidate.localId === localId)
      ?? this.localDailyPageCandidate(localId);
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
    const dailyAdapter = this.dailyDeviceAdapters().find((item) => item.localId === localId);
    const overviewCurrentId = localId.startsWith("daily-overview:")
      ? this.currentDailyDeck().currentItemId
      : undefined;
    const dailyItem = dailyAdapter
      ? this.dailyPlanItems.find((item) => item.id === dailyAdapter.pagingItem.id)
      : overviewCurrentId
        ? this.dailyPlanItems.find((item) => item.id === overviewCurrentId)
        : undefined;
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
        questionId: question?.id,
        dailyItemId: dailyItem?.id,
        dailyTaskRevision: dailyItem?.revision.value,
        dailyDate: dailyItem?.date,
        dailySourcePath: dailyItem?.sourcePath
      }
    };
  }

  private async createOnlyTapSelectionSnapshot(
    source: TapSelectionSnapshot
  ): Promise<TapSelectionSnapshot> {
    const draft: CaptureDraft = {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      id: `capture_${randomTokenFragment()}`,
      intent: "new",
      body: "",
      title: source.title?.trim() || undefined,
      tags: [],
      links: [],
      source: source.sourceContext?.file || source.sourceContext?.questionId
        ? {
            file: source.sourceContext.file,
            questionId: source.sourceContext.questionId,
            entryPoint: "capture-bridge-create-only"
          }
        : {
            entryPoint: "capture-bridge-create-only"
          },
      createdAt: new Date().toISOString()
    };
    const candidate = (await this.recommendCaptureTargets(draft))
      .find((item) => item.action === "create");
    if (!candidate) {
      throw new CaptureBridgeRequestError(
        409,
        "No authorized create target is configured for create-only Capture."
      );
    }
    return {
      ...source,
      protocolVersion: CAPTURE_BRIDGE_PROTOCOL_V2,
      snapshotId: generateSnapshotId(),
      createdAt: new Date().toISOString(),
      intent: "new",
      candidate: { ...candidate },
      allowedActions: ["capture"]
    };
  }

  private localDailyPageCandidate(localId: string): LocalHubCandidate | undefined {
    const deck = this.currentDailyDeck();
    const isOverview = localId === deck.overview.localId;
    const isResult = localId === deck.result.localId;
    if (!isOverview && !isResult) return undefined;
    const current = deck.currentItemId
      ? this.dailyPlanItems.find((item) => item.id === deck.currentItemId)
      : undefined;
    const targetLink = current?.target
      ? current.target.replace(/^\[\[/u, "").replace(/\]\]$/u, "").split("|")[0].trim()
      : current?.linkedNotes[0];
    const linked = current && targetLink
      ? this.app.metadataCache.getFirstLinkpathDest(targetLink.split("#")[0], current.sourcePath)
      : undefined;
    const targetPath = isOverview
      ? linked?.path || current?.sourcePath || this.dailyPlanService.pathForDate(deck.date)
      : this.dailyPlanService.pathForDate(deck.date);
    const planPath = this.dailyPlanService.pathForDate(deck.date);
    const writableTargetPath = this.app.vault.getFileByPath(targetPath)
      ? targetPath
      : this.settings.deviceCapture.inboxFile;
    const isInbox = writableTargetPath === this.settings.deviceCapture.inboxFile;
    const privacy = this.hubPrivacyForPath(writableTargetPath, [], { ignoreIncludeFolders: isInbox });
    if (privacy.private || privacy.excluded) return undefined;
    return {
      localId,
      type: isOverview ? "daily_overview" : "daily_result",
      display: isOverview
        ? {
            title: deck.theme || (this.settings.language === "zh" ? "今日概要" : "Today"),
            body: deck.overview.current?.text || "",
            prompt: deck.overview.current?.nextStep
          }
        : {
            title: this.settings.language === "zh" ? "今日结果" : "Today result",
            body: `${deck.result.progress.done} / ${deck.result.progress.total}`
          },
      sourceLocalId: planPath,
      writeTargetLocalId: writableTargetPath,
      writeTargetAction: "append",
      writeTargetKind: isInbox ? "inbox" : "existingNote",
      allowedActions: ["open", "capture"],
      reasonCode: isOverview ? "daily_overview" : "daily_result",
      score: 100,
      privacy
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
    let expectedPath: string;
    const dailyId = snapshot.sourceContext?.dailyItemId;
    if (dailyId && (
      localId === `daily-plan:${dailyId}`
      || localId.startsWith("daily-overview:")
    )) {
      const sourceDate = snapshot.sourceContext?.dailyDate
        || dailyDateFromPath(snapshot.sourceContext?.dailySourcePath)
        || formatDailyInputDate(new Date(snapshot.createdAt));
      const item = await this.dailyPlanService.get(dailyId, sourceDate);
      if (!item
        || item.revision.value !== snapshot.sourceContext?.dailyTaskRevision
        || (snapshot.sourceContext?.dailySourcePath
          && item.sourcePath !== snapshot.sourceContext.dailySourcePath)) {
        throw new CaptureBridgeRequestError(409, "The persisted Daily card changed after it was displayed.");
      }
      const linked = item.linkedNotes[0]
        ? this.app.metadataCache.getFirstLinkpathDest(item.linkedNotes[0], item.sourcePath)
        : undefined;
      expectedPath = linked?.path || this.settings.deviceCapture.inboxFile;
    } else {
      const current = this.buildHubCandidates(localId).find((candidate) => candidate.localId === localId);
      if (!current || current.privacy?.private || current.privacy?.excluded) {
        throw new CaptureBridgeRequestError(409, "Persisted Capture selection is no longer eligible.");
      }
      expectedPath = current.writeTargetLocalId?.trim() || this.settings.deviceCapture.inboxFile;
    }
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
    draft: CaptureDraft,
    assets: readonly CaptureBridgeStagedAsset[] = []
  ): Promise<CaptureCommitResult> {
    await this.validateTapSelectionSnapshot(snapshot, draft);
    const persistedAssets = await this.persistBridgeCaptureAssets(draft.id, assets);
    const enrichedDraft = persistedAssets.length > 0
      ? {
          ...draft,
          body: [
            draft.body.trim() || (this.settings.language === "zh" ? "待转写录音" : "Voice note pending transcription"),
            ...persistedAssets.map((asset) => `![[${asset.path}]]`)
          ].join("\n\n")
        }
      : draft;
    try {
      const result = await this.commitTapBridgeCaptureCore(snapshot, enrichedDraft);
      if (persistedAssets.length > 0) {
        this.bridgeCaptureAssets.set(result.captureId, persistedAssets.map(({ path, sha256 }) => ({ path, sha256 })));
      }
      return result;
    } catch (error) {
      await this.removeUnreferencedBridgeAssets(persistedAssets);
      throw error;
    }
  }

  private async commitTapBridgeCaptureCore(
    snapshot: TapSelectionSnapshot,
    draft: CaptureDraft
  ): Promise<CaptureCommitResult> {
    const capture = await this.captureService.commit({
      draft,
      candidate: snapshot.candidate,
      targetRevision: snapshot.candidate.targetRevision
    });
    this.dailyActivityService.recordCaptureCommitted(capture.captureId);
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
    if (!result.undone) return { undone: false };
    const assets = this.bridgeCaptureAssets.get(captureId) ?? [];
    await this.removeUnreferencedBridgeAssets(assets);
    this.bridgeCaptureAssets.delete(captureId);
    if (!activity) return { undone: true };
    this.patchQuestionState(activity.question.id, {
      notes: (activity.question.notes ?? []).filter((note) => note.id !== activity.note.id)
    });
    await this.savePluginData();
    this.queueDeviceHubSync();
    if (this.settings.autoExport) await this.exportNow(false);
    return { undone: true };
  }

  private async persistBridgeCaptureAssets(
    captureId: string,
    assets: readonly CaptureBridgeStagedAsset[]
  ): Promise<Array<{ path: string; sha256: string }>> {
    if (assets.length === 0) return [];
    const day = new Date().toISOString().slice(0, 10);
    const folder = normalizePath(`${this.settings.daily.attachmentFolder}/${day}`);
    await this.ensureVaultFolder(folder);
    const written: Array<{ path: string; sha256: string }> = [];
    try {
      for (const asset of assets) {
        const extension = bridgeAssetExtension(asset.fileName, asset.mimeType);
        const stem = sanitizeBridgeAssetStem(asset.fileName) || "voice";
        const path = normalizePath(`${folder}/${stem}-${captureId.slice(-10)}-${asset.assetRef.slice(-8)}.${extension}`);
        if (this.app.vault.getAbstractFileByPath(path)) {
          throw new CaptureBridgeRequestError(409, "A staged audio attachment already exists.");
        }
        const copy = new Uint8Array(asset.bytes.byteLength);
        copy.set(asset.bytes);
        await this.app.vault.createBinary(path, copy.buffer);
        written.push({ path, sha256: await sha256Hex(asset.bytes) });
      }
      return written;
    } catch (error) {
      await this.removeUnreferencedBridgeAssets(written);
      throw error;
    }
  }

  private async removeUnreferencedBridgeAssets(
    assets: ReadonlyArray<{ path: string; sha256: string }>
  ): Promise<void> {
    if (assets.length === 0) return;
    const markdownFiles = this.app.vault.getMarkdownFiles();
    for (const asset of assets) {
      const file = this.app.vault.getFileByPath(asset.path);
      if (!file) continue;
      const bytes = new Uint8Array(await this.app.vault.readBinary(file));
      if (await sha256Hex(bytes) !== asset.sha256) continue;
      let referenced = false;
      const basename = asset.path.split("/").pop() ?? asset.path;
      for (const note of markdownFiles) {
        const text = await this.app.vault.cachedRead(note);
        if (text.includes(asset.path) || text.includes(basename)) {
          referenced = true;
          break;
        }
      }
      if (!referenced) {
        await this.app.vault.delete(file);
      }
    }
  }

  private async ensureVaultFolder(path: string): Promise<void> {
    const segments = path.split("/").filter(Boolean);
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
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

  private resolveEchoCardTarget(
    card: EchoCard,
    authorizedCreateFolders = new Set([
      ...this.settings.deviceCapture.targetFolders,
      ...this.settings.workflowStages.stages.flatMap((stage) => stage.folderPrefixes)
    ].map((path) => normalizeFolderPath(path)).filter(Boolean))
  ): {
    path: string;
    kind: "folder" | "inbox" | "existingNote";
    action: "create" | "append";
    privacy: NonNullable<LocalHubCandidate["privacy"]>;
  } | undefined {
    const targetPath = normalizeVaultPath(card.targetPath || this.settings.deviceCapture.inboxFile);
    const target = this.app.vault.getAbstractFileByPath(targetPath);
    const isInbox = targetPath === normalizeVaultPath(this.settings.deviceCapture.inboxFile);
    const isMarkdown = target instanceof TFile && target.extension.toLowerCase() === "md";
    const isCreateFolder = authorizedCreateFolders.has(normalizeFolderPath(targetPath))
      && (!target || target instanceof TFolder);
    if (!isInbox && !isMarkdown && !isCreateFolder) return undefined;

    const action = isCreateFolder && !isInbox && !isMarkdown ? "create" : "append";
    // Inbox is an explicit fallback and may sit outside an include scope, but
    // explicit excludes and private metadata still apply.
    const privacy = this.hubPrivacyForPath(targetPath, [], { ignoreIncludeFolders: isInbox });
    if (privacy.private || privacy.excluded) return undefined;
    return {
      path: targetPath,
      kind: action === "create" ? "folder" : isInbox ? "inbox" : "existingNote",
      action,
      privacy
    };
  }

  private buildHubCandidates(preferredLocalId?: string, includePagingPool = false): LocalHubCandidate[] {
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
        if (preferredLocalId === localId || (includePagingPool && entry.rotationEligible)) return true;
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
      if (!isEchoCardEligibleForMode(card, this.settings.hub.selectionMode, manuallyRequested)
        && !(includePagingPool && card.inLibrary && card.rotationEligible)) continue;
      if (!validateEchoCardLayout(card).fits) continue;

      const target = this.resolveEchoCardTarget(card, authorizedCreateFolders);
      if (!target) continue;
      candidates.push({
        localId,
        type: card.contentType,
        display: composeEchoCardDisplay(card),
        sourceLocalId: localId,
        writeTargetLocalId: target.path,
        writeTargetKind: target.kind,
        writeTargetAction: target.action,
        writeTargetHeading: this.settings.deviceCapture.appendHeading,
        allowedActions: [...new Set(card.actions)].slice(0, 3),
        reasonCode: card.disclosure === "none" ? "echo_card" : "echo_card_ai_disclosed",
        score: manuallyRequested ? 1 : 0.5,
        policyBasis: "general",
        urgency: 0,
        expiresAt: leaseExpiresAt,
        privacy: target.privacy
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

    const dailyAdapters = this.dailyDeviceAdapters(preferredLocalId);
    if (this.settings.daily.enabled && this.settings.daily.includeInDeviceCandidates) {
      const deck = this.currentDailyDeck();
      for (const pageId of [deck.overview.localId, deck.result.localId]) {
        const page = this.localDailyPageCandidate(pageId);
        if (!page) continue;
        candidates.push({
          ...page,
          score: preferredLocalId === pageId
            ? 1
            : pageId === deck.overview.localId
              ? 0.92
              : 0.38,
          expiresAt: leaseExpiresAt
        });
      }
    }
    for (const adapter of dailyAdapters) {
      const candidate = adapter.candidate;
      if (!candidate) continue;
      const item = this.dailyPlanItems.find((entry) => entry.id === adapter.pagingItem.id);
      const manuallyRequested = preferredLocalId === adapter.localId;
      const scheduledDue = item?.devicePolicy === "scheduled"
        && Boolean(item.scheduledFor)
        && Date.parse(item.scheduledFor ?? "") <= now.getTime();
      const scheduledWithin24Hours = item?.devicePolicy === "scheduled"
        && Boolean(item.scheduledFor)
        && Date.parse(item.scheduledFor ?? "") <= now.getTime() + 24 * 60 * 60_000;
      const eligibleForMode = manuallyRequested
        || (includePagingPool && item?.devicePolicy === "rotation")
        || (this.settings.hub.selectionMode === "rotation" && item?.devicePolicy === "rotation")
        || scheduledWithin24Hours
        || (this.settings.hub.selectionMode === "agent" && item?.devicePolicy === "agent");
      if (!eligibleForMode) continue;
      candidates.push({
        ...candidate,
        score: manuallyRequested ? 1 : scheduledDue ? 0.96 : candidate.score,
        policyBasis: scheduledDue ? "due" : candidate.policyBasis,
        urgency: scheduledDue ? 1 : candidate.urgency
      });
    }
    const summaryAdapter = this.dailySummaryDeviceAdapter(preferredLocalId);
    if (summaryAdapter?.candidate) {
      const manuallyRequested = preferredLocalId === summaryAdapter.localId;
      const policy = summaryAdapter.pagingItem.devicePolicy;
      const eligibleForMode = manuallyRequested
        || (includePagingPool && policy === "rotation")
        || (this.settings.hub.selectionMode === "rotation" && policy === "rotation")
        || (this.settings.hub.selectionMode === "agent" && policy === "agent");
      if (eligibleForMode) {
        candidates.push({
          ...summaryAdapter.candidate,
          score: manuallyRequested ? 1 : summaryAdapter.candidate.score
        });
      }
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
    const scoreSorted = candidates.sort((left, right) => right.score - left.score);
    const candidateByLocalId = new Map(scoreSorted.map((candidate) => [candidate.localId, candidate]));
    const pagingPool = buildDevicePagingPool(
      this.settings.echoCards,
      library.entries,
      (localId) => candidateByLocalId.has(localId),
      [
        ...dailyAdapters.map((item) => item.pagingItem),
        ...(summaryAdapter ? [summaryAdapter.pagingItem] : [])
      ]
    );
    const pagingCandidates = pagingPool.flatMap((localId) => {
      const candidate = candidateByLocalId.get(localId);
      return candidate ? [candidate] : [];
    });
    const ordered = [
      ...pagingCandidates,
      ...scoreSorted.filter((candidate) => !pagingPool.includes(candidate.localId))
    ];
    if (!preferredLocalId || !ordered.some((candidate) => candidate.localId === preferredLocalId)) {
      return ordered.slice(0, 20);
    }
    const candidateById = new Map(ordered.map((candidate) => [candidate.localId, candidate]));
    return prioritizeDevicePagingPool(
      ordered.map((candidate) => candidate.localId),
      preferredLocalId
    ).flatMap((localId) => {
      const candidate = candidateById.get(localId);
      return candidate ? [candidate] : [];
    }).slice(0, 20);
  }

  private hubPrivacyForCandidate(candidate: PushCandidate): NonNullable<LocalHubCandidate["privacy"]> {
    return this.hubPrivacyForPath(candidate.sourceFile || "", candidate.tags);
  }

  private hubPrivacyForPath(
    path: string,
    candidateTags: readonly string[] = [],
    options: { ignoreIncludeFolders?: boolean } = {}
  ): NonNullable<LocalHubCandidate["privacy"]> {
    if (!path) {
      return { excluded: true };
    }
    const normalizedPath = path.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
    const lowerPath = normalizedPath.toLowerCase();
    const scope = this.settings.deviceCapture;
    const includes = scope.includeFolders.map((folder) => normalizeFolderPath(folder).toLowerCase()).filter(Boolean);
    const excludes = scope.excludeFolders.map((folder) => normalizeFolderPath(folder).toLowerCase()).filter(Boolean);
    const excludedByPath = (!options.ignoreIncludeFolders
      && includes.length > 0
      && !includes.some((folder) => lowerPath === folder || lowerPath.startsWith(`${folder}/`)))
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
    const previousSelectedContentId = hub.lastSelectedContentId;
    const previousDisplayedContentId = hub.lastDisplayedContentId;
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
    if (hub.lastSelectedContentId && hub.lastSelectedContentId !== previousSelectedContentId) {
      this.dailyActivityService.recordCardSelected(selectedLocalId || hub.lastSelectedContentId);
    }
    if (hub.lastDisplayedContentId && hub.lastDisplayedContentId !== previousDisplayedContentId) {
      this.dailyActivityService.recordCardDisplayed(displayedLocalId || hub.lastDisplayedContentId);
    }
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
      getSmallScreenConnectionStatus: () => this.getSmallScreenConnectionStatus(),
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
      addQuestionToDaily: (id) => this.addQuestionToDaily(id),
      addInboxItemToDaily: (id) => this.addInboxItemToDaily(id),
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
    const previous = this.store.getQuestion(id);
    this.store.patchQuestion(id, patch, false);
    if (patch.status === "resolved" && previous && previous.status !== "resolved") {
      this.dailyActivityService.recordQuestionResolved(id);
    }
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
    const refreshDailyPlanAfterVaultChange = debounce(() => {
      void this.refreshDailyPlanCache().catch((error: unknown) => {
        console.error("ToWrite could not refresh the edited Daily plan", error);
      });
    }, 700, true);

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
          if (this.settings.daily.enabled && this.settings.daily.activityTracking) {
            this.dailyActivityService.scheduleDocumentMeasurement({
              filePath: file.path,
              reason: "modified",
              readContent: async () => {
                const current = this.app.vault.getFileByPath(file.path);
                return current ? this.app.vault.cachedRead(current) : undefined;
              }
            });
          }
          if (this.isTrackedDailyPlanPath(file.path)) {
            refreshDailyPlanAfterVaultChange();
          }
          this.recordEditPresenceLearning(file);
          this.deviceHub?.recordEditPresence();
          reindexFile(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          if (this.settings.daily.enabled && this.settings.daily.activityTracking) {
            this.dailyActivityService.scheduleDocumentMeasurement({
              filePath: file.path,
              reason: "created",
              readContent: async () => {
                const current = this.app.vault.getFileByPath(file.path);
                return current ? this.app.vault.cachedRead(current) : undefined;
              }
            });
          }
          if (this.isTrackedDailyPlanPath(file.path)) {
            refreshDailyPlanAfterVaultChange();
          }
          void this.autoApplyInboxMetadata(file)
            .catch((error: unknown) => console.error("ToWrite could not apply Inbox metadata", error))
            .finally(() => reindexFile(file));
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFolder) rebuildInboxAfterFolderChange();
        if (file instanceof TFile) {
          this.dailyActivityService.removeDocumentBaseline(file.path);
          if (this.isTrackedDailyPlanPath(file.path)) {
            // Both today's and tomorrow's source are watched. Always re-read
            // the active (today) plan so deleting tomorrow cannot blank the
            // current dashboard cache.
            refreshDailyPlanAfterVaultChange();
          }
        }
        this.handleDeletedFile(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFolder) rebuildInboxAfterFolderChange();
        if (file instanceof TFile) {
          this.dailyActivityService.renameDocumentBaseline(oldPath, file.path);
          if (this.isTrackedDailyPlanPath(oldPath) || this.isTrackedDailyPlanPath(file.path)) {
            refreshDailyPlanAfterVaultChange();
          }
        }
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

  private isTrackedDailyPlanPath(path: string): boolean {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return dailyPlanCacheInvalidationForPath(
      path,
      this.dailyPlanService.pathForDate(today),
      this.dailyPlanService.pathForDate(tomorrow)
    ) === "refresh";
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

function sanitizeBridgeAssetStem(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[A-Za-z0-9]{1,8}$/u, "");
  return withoutExtension
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9\u3400-\u9fff_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
}

function bridgeAssetExtension(fileName: string, mimeType: string): string {
  const explicit = /\.([A-Za-z0-9]{1,8})$/u.exec(fileName)?.[1]?.toLowerCase();
  if (explicit && ["webm", "mp4", "m4a", "mp3", "ogg", "wav", "aac"].includes(explicit)) {
    return explicit;
  }
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("aac")) return "aac";
  return "m4a";
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = bytes.slice();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
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
    daily: normalizeDailySettings(settings?.daily),
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

function previousDevicePagingItem(pool: readonly string[], currentId?: string): string | undefined {
  if (pool.length === 0) return undefined;
  const currentIndex = currentId ? pool.indexOf(currentId) : -1;
  return currentIndex < 0
    ? pool[pool.length - 1]
    : pool[(currentIndex - 1 + pool.length) % pool.length];
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

function dailyScheduleOccurrenceId(item: DailyPlanItem): string {
  return `daily:${item.id}:${item.scheduledFor ?? ""}`;
}

function localDeviceTargetKey(targetId: string | undefined): string {
  const normalized = targetId?.trim();
  return normalized || "__default__";
}

function formatLocalDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function formatDailyInputDate(value: Date | string): string {
  if (typeof value === "string") {
    const exact = /^(\d{4}-\d{2}-\d{2})$/u.exec(value.trim());
    if (exact) return exact[1];
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new Error("Daily date is invalid.");
    value = parsed;
  }
  return [
    value.getFullYear().toString().padStart(4, "0"),
    (value.getMonth() + 1).toString().padStart(2, "0"),
    value.getDate().toString().padStart(2, "0")
  ].join("-");
}

function dailyDateFromPath(value: string | undefined): string | undefined {
  const match = /(?:^|\/)(\d{4}-\d{2}-\d{2})\.md$/iu.exec(value?.replace(/\\/gu, "/").trim() ?? "");
  return match?.[1];
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

function deviceCommandMessage(action: string): string {
  if (action === "record_reserved") return "Recording is not enabled";
  if (action === "create_note") return "New capture opened";
  if (action === "open_current" || action === "start_open") return "Opened";
  if (action === "complete") return "Completed";
  if (action === "page_prev" || action === "page_next") return "Page queued";
  if (action === "task_prev" || action === "task_next") return "Task queued";
  return "Command handled";
}

function bestEffortFocusObsidian(): boolean {
  try {
    window.focus();
    return typeof document === "undefined" || typeof document.hasFocus !== "function"
      ? true
      : document.hasFocus();
  } catch {
    // Desktop focus is best-effort; the Markdown transition already succeeded.
    return false;
  }
}
