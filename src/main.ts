import "./styles.css";
import {
  Component,
  MarkdownRenderChild,
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
import {
  normalizeWorkflowStageId,
  readExplicitWorkflowStage,
  WORKFLOW_STAGE_PROPERTY
} from "./core/workflow-metadata";
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
  normalizeDesktopActions,
  normalizeDeviceProfiles,
  normalizeInboxSettings,
  normalizeRibbonSettings,
  normalizeWorkPoolSettings,
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
import { concealTaskPoolTechnicalMetadata } from "./obsidian/task-pool-preview";
import { concealDailyTaskTechnicalMetadata } from "./obsidian/daily-task-preview";
import {
  createTaskPoolTechnicalMetadataExtension,
  refreshTaskPoolTechnicalMetadata
} from "./obsidian/task-pool-editor";
import {
  readObsidianDailyNotesConfiguration,
  shouldUseObsidianDailyNotes
} from "./obsidian/daily-notes";
import { activateWorkspaceView } from "./obsidian/view-activation";
import { confirmWithModal, promptWithModal } from "./obsidian/dialogs";
import { AiQuestionService } from "./ai/service";
import {
  BackendEnhancementClient,
  type BackendDailyTimerTransitionRequest
} from "./backend/client";
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
  buildDailyAnalyticsRange,
  DailyPlanNormalizationService,
  DailyTaskTimerService,
  DailyTimerTransitionCoordinator,
  JsonDailyTimerTransitionJournal,
  DailyTransitionJournal,
  PersistentDailyTaskTimer,
  predictDailyPlanItemStatusRevision,
  parseDailyMarkdownTargets,
  collectDailyLinkedNoteReferences,
  shouldAutomaticallyNormalizeDailyEdit,
  isDisplayableDailyDraftTask,
  projectDailyTaskAggregates,
  resolveDailyTarget,
  dailyDeviceScore,
  dailyCreateOnlyTitle,
  dailyPlanCacheInvalidationForPath,
  isConfiguredDailyPlanSourcePath,
  changedDailyMarkdownTimerTaskIds,
  canSkipMissingDailyTimerMarkdownTask,
  dailyMarkdownTimerEventId,
  dailyMarkdownTimerOperations,
  dailyMarkdownTimerTransactionId,
  dailyTaskTextForBackend,
  dailyWikiLink,
  dailyMigrationSelectionKey,
  expandDailyMigrationSelections,
  planDailyMigrationDestinations,
  unfinishedDailyLeafItems,
  DailyPlanConflictError,
  DailyPlanService,
  executeDailyStartAndOpen,
  NoteTaskPoolCoordinator,
  TaskPoolService,
  TaskPoolConflictError,
  dailyAiSummaryPlaceholderInstruction,
  parseConstrainedDailyAiSummary,
  type DailyActivityState,
  type DailyAnalyticsRange,
  type DailyMonthlySummary,
  type DailyJournalDaySnapshot,
  type DailyJournalMonthSnapshot,
  type DailyJournalWriteBackResult,
  type DailyTaskTransitionKind,
  type DailyDashboardSnapshot,
  type DailyMarkdownTarget,
  type DailyMarkdownTimerOperation,
  type DailyPlanCreateInput,
  type DailyPlanDocument,
  type DailyPlanGroup,
  type DailyPlanHierarchy,
  type DailyPlanItem,
  type DailyPlanMetadataUpdate,
  type DailyPlanNormalizationEdit,
  type DailyPlanNormalizationPreview,
  type DailyPlanNormalizationResult,
  type DailyPlanNormalizationUndoResult,
  type DailyPlanStorage,
  type DailyPlanUpdate,
  type DailySummary,
  type DailyTaskMigration,
  type DailyTaskTimingSnapshot,
  type DailyTimerCorrectionOptions,
  type TaskPoolDocument,
  type TaskPoolItem,
  type TaskPoolRevision,
  type DailyTimerEvent,
  type DailyTimerEventLog,
  type DailyTimerEventSource,
  type DailyTimerTransitionAdapter,
  type DailyTimerTransitionOptions,
  type DailyTaskRevision,
  NoteTaskService,
  type NoteTaskCandidate,
  type NoteTaskDocument,
  type NoteTaskPatch,
  type TrackedNoteTask
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
  combineHubCandidatePrivacy,
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
  DeviceCompletionGuard,
  DeviceDisplayAcknowledgement,
  DeviceDisplayedTuple,
  DeviceEventInput
} from "./device-interactions";
import { shouldStartDailyOverviewForAction } from "./device-interactions";
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
import {
  WorkPoolService,
  isWorkPoolSourceExcluded,
  isWorkPoolSourceIncluded,
  questionRevision,
  type WorkPoolAction,
  type WorkPoolItem,
  type WorkPoolQuery,
  type WorkPoolSnapshot,
  type WorkPoolTaskRelation
} from "./work-pool";
import { applyInboxStageMetadata, materializeInboxStageMetadata, type InboxMetadataBatchResult } from "./inbox/metadata";
import type { InboxDeviceEligibility, InboxSnapshot } from "./inbox/types";
import { yieldToEventLoop } from "./core/async-batch";
import { createQuestionDecorations, refreshQuestionDecorations } from "./obsidian/decorations";
import {
  createDailyTaskControls,
  refreshDailyTaskControls,
  type DailyLinkedTaskProjection
} from "./obsidian/daily-task-controls";
import {
  createNoteTaskControls,
  rankNoteTaskPoolMatches,
  refreshNoteTaskControls
} from "./obsidian/note-task-controls";
import {
  MarkdownTaskInputSuggest,
  type MarkdownTaskInputSuggestion
} from "./obsidian/task-input-suggest";
import {
  DailyTaskPropertiesModal,
  type DailyTaskPropertiesModalOptions,
  type DailyTaskPropertiesModalResult
} from "./obsidian/daily-task-properties-modal";
import { initialNoteTaskDeadline } from "./obsidian/daily-task-properties";
import { OpenQuestionIndexer } from "./obsidian/indexer";
import { jumpToQuestion as jumpToQuestionInWorkspace } from "./obsidian/jump";
import { ObsidianNavigationAdapter } from "./obsidian/open-target";
import { openPinnedFloatingView } from "./obsidian/floating-view";
import { noteTaskTimingReconciliationAction } from "./obsidian/note-task-timing";
import {
  NavigationCheckpointService,
  NavigationRouter,
  DeepLinkNavigationAdapter,
  WebNavigationAdapter,
  NAVIGATION_TARGET_SCHEMA_VERSION,
  dailyNavigationTargetKey,
  navigationTargetForDailyItem,
  navigationTargetForMarkdownTarget,
  type NavigationTarget,
  type ObsidianNavigationTarget
} from "./navigation";
import { AddQuestionModal } from "./obsidian/modal";
import { CaptureModal } from "./obsidian/capture-modal";
import { AiAssistantModal } from "./obsidian/ai-assistant-modal";
import { PdfQuestionLayer, pdfAnchorFromCurrentSelection } from "./obsidian/pdf-layer";
import { SelectionQuestionToolbar } from "./obsidian/selection-toolbar";
import { ToWriteSettingTab } from "./obsidian/settings-tab";
import { QuestionSidecarRepository } from "./obsidian/sidecar";
import { readVaultDataText, writeVaultDataText } from "./obsidian/vault-data";
import {
  TOWRITE_DASHBOARD_VIEW,
  TOWRITE_SIDEBAR_VIEW,
  TOWRITE_TODAY_FLOATING_VIEW,
  ToWriteDashboardItemView,
  type ToWriteDashboardViewState,
  ToWriteSidebarItemView,
  ToWriteTodayFloatingItemView
} from "./obsidian/views";
import type { ActiveLineRange, LinkSuggestion, ToWriteUiApi } from "./ui/api";
import type {
  DailyDashboardAdapter,
  DailyPlanningCandidate,
  DailySummaryPresentation
} from "./ui/daily-dashboard-types";
import TodayEmbedCard from "./ui/TodayEmbedCard.svelte";
import { todayEmbedMarkdown } from "./ui/today-embed-state";
import type { CaptureModalSubmitRequest, CaptureModalSubmitResult } from "./ui/capture-modal-types";
import type {
  AiAssistantCatalog,
  AiAssistantContextPreview,
  AiAssistantSendRequest
} from "./ui/ai-assistant-types";

const LOCAL_EINK_EXPECTED_POLL_SECONDS = 5;

function renderDailyJournalMarkdown(snapshot: DailyJournalDaySnapshot): string {
  const minutes = (value: number): string => `${Math.round(value / 60_000)} min`;
  const lines = [
    "## ToWrite 日志",
    "",
    `- 计划：${snapshot.planned}`,
    `- 完成：${snapshot.completed}（${Math.round(snapshot.completionRate * 100)}%）`,
    `- 实际投入：${minutes(snapshot.activeMs)}`,
    `- 暂停：${minutes(snapshot.pausedMs)}；中断：${snapshot.interruptions}`,
    `- 未完成：${snapshot.unfinished}；迁入：${snapshot.migratedIn}；迁出：${snapshot.migratedOut}`,
    `- 回流工作池：${snapshot.returned}；放弃：${snapshot.abandoned}`
  ];
  if (snapshot.firstStartedAt) lines.push(`- 首次开始：${snapshot.firstStartedAt}`);
  if (snapshot.lastCompletedAt) lines.push(`- 最后完成：${snapshot.lastCompletedAt}`);
  return lines.join("\n");
}

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
  dailyLineageRevision?: string;
  dailyTimingRevision?: string;
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
  private readonly workPoolService = new WorkPoolService();
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
  private dailyPlanNormalizationService!: DailyPlanNormalizationService;
  private noteTaskService!: NoteTaskService;
  private noteTaskPoolCoordinator!: NoteTaskPoolCoordinator;
  private taskPoolService!: TaskPoolService;
  private dailyActivityService!: DailyActivityService;
  private dailyTaskTimer?: PersistentDailyTaskTimer;
  private dailyTransitionJournal?: DailyTransitionJournal;
  private noteTaskTimer?: PersistentDailyTaskTimer;
  private dailyTimerCoordinator?: DailyTimerTransitionCoordinator;
  private dailyTimerLedgerPath = "";
  private dailyTimerLoadError = "";
  private dailyTimerTransitionTail: Promise<void> = Promise.resolve();
  private dailyTimerManagedMarkdownWriteDepth = 0;
  private dailyPlanItems: DailyPlanItem[] = [];
  private dailyEditorPlanItems: DailyPlanItem[] = [];
  private dailyPlanDocument?: DailyPlanDocument;
  private dailyPlanNormalizationPreviews: DailyPlanNormalizationPreview[] = [];
  private readonly dailyDraftReferences = new Map<string, {
    date: string;
    sourcePath: string;
    line: number;
    expectedRevision: string;
    rawLine: string;
  }>();
  private dailyLinkedTaskProjections: DailyLinkedTaskProjection[] = [];
  private previousDailyUnfinished: DailyPlanItem[] = [];
  private activeNoteTaskDocument?: NoteTaskDocument;
  private activeTaskPoolItems: TaskPoolItem[] = [];
  private markdownTaskNoteSuggestions: MarkdownTaskInputSuggestion[] = [];
  private markdownTaskInputSuggestionCache: MarkdownTaskInputSuggestion[] = [];
  private workPoolTaskSourceAllowlistCache: string[] = [];
  private workPoolTaskSourceAllowlistInitialized = false;
  private activeNoteTaskPoolMatches = new Map<string, TaskPoolItem[]>();
  private readonly noteTaskRelationsBySource = new Map<string, WorkPoolTaskRelation[]>();
  private readonly ribbonIconElements = new Map<keyof ToWriteSettings["ribbon"], HTMLElement>();
  private taskPoolFormatUndoToken?: string;
  private activeNoteTaskRefreshTail: Promise<void> = Promise.resolve();
  private dailyActivityRetentionDays = 30;
  private dailyStateSaveTimer = 0;
  private dailyMidnightTimer = 0;
  private dailyTimerDisplayRefreshTimer = 0;
  private dailyDeviceStateVersion = 1;
  private dailyScheduleOccurrenceIds = new Set<string>();
  private dailyPlanCacheInitialized = false;
  private dailyPlanInitializationPromise?: Promise<void>;
  private dailyDraftPreviewRefreshScheduled = false;
  private dailyBackendWriterCheckedAt = 0;
  private dailyBackendWriterAvailable = false;
  private readonly dailyBackendTimingCache = new Map<string, {
    taskRevision: string;
    lineageRevision?: string;
    timing: DailyTaskTimingSnapshot;
    events: DailyTimerEvent[];
    fetchedAtMs: number;
  }>();
  private readonly dailyBackendTransitionRequests = new Map<string, {
    action: "start" | "pause" | "resume" | "complete" | "reopen";
    taskId: string;
    request: Required<Pick<
      BackendDailyTimerTransitionRequest,
      "eventId" | "source" | "rawBlock" | "taskRevision" | "lineageRevision" | "expectedTimingRevision"
    >> & Pick<BackendDailyTimerTransitionRequest, "at">;
  }>();
  private observedExternalApiStartedAt = "";
  private observedSuccessfulEinkPolls = 0;
  private readonly localDeviceDisplayKeys = new Map<string, string>();
  private readonly localDeviceServedTaskRevisions = new Map<string, {
    dailyItemId?: string;
    taskRevision?: string;
    lineageRevision?: string;
    timingRevision?: string;
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
    lineageRevision?: string;
    timingRevision?: string;
    taskDate?: string;
    taskSourcePath?: string;
    batteryPercent?: number;
    firmwareVersion?: string;
    screenModel?: string;
    capabilities?: string[];
  }>();
  private lastLocalDeviceBatteryPercent?: number;
  private readonly deviceCommandJournal = new Map<string, {
    eventId: string;
    fingerprint: string;
    status: "indeterminate" | "executed" | "unsupported" | "conflict";
    processedAt: string;
    action: string;
    resultRevision?: string;
    timingRevision?: string;
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
  private navigationRouter!: NavigationRouter;
  private navigationCheckpointService!: NavigationCheckpointService;
  private uiApi!: ToWriteUiApi;
  private selectionToolbar?: SelectionQuestionToolbar;
  private pdfQuestionLayer?: PdfQuestionLayer;
  private backgroundRefreshTimer = 0;
  private startupReconciliationTimer = 0;
  private startupMarkdownReconciliationTimer = 0;
  private startupIdleCallback?: number;
  private startupCachesReady = false;
  private fullVaultMaintenanceQueue: Promise<void> = Promise.resolve();
  private indexRefreshPromise?: Promise<void>;
  private markdownTaskSyncPromise?: Promise<{
    filesScanned: number;
    tasksRegistered: number;
    filesFailed: number;
  }>;
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

    this.navigationRouter = new NavigationRouter();
    this.navigationRouter.register(new ObsidianNavigationAdapter(this.app));
    this.navigationRouter.register(new WebNavigationAdapter());
    this.navigationRouter.register(new DeepLinkNavigationAdapter());
    const navigationCheckpointPath =
      `${normalizeVaultPath(this.settings.exportDirectory)}/daily/navigation-checkpoints.json`;
    this.navigationCheckpointService = new NavigationCheckpointService({
      readText: () => readVaultDataText(this.app, navigationCheckpointPath),
      writeText: (content) => writeVaultDataText(this.app, navigationCheckpointPath, content)
    });
    this.backendClient = new BackendEnhancementClient(() => this.settings.backend);
    this.store = new OpenQuestionStore(this.savedQuestionStates);
    this.register(this.store.subscribe(() => this.invalidateLegacyEinkPlaylist()));
    this.initializeDailyServices();
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
        transitionTiming: async (snapshot, request, operation) => {
          return this.transitionDailyTimingFromBridge(
            snapshot,
            operation,
            `bridge-timing:${request.idempotencyKey}`
          );
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
      laterDeviceCard: (event) => this.laterDailyFromDeviceEvent(event),
      acknowledgeDeviceDisplay: (acknowledgement, targetId) => this.acknowledgeLocalDeviceDisplay(acknowledgement, targetId),
      getDeviceDisplayedTuple: (targetId) => this.getCurrentDeviceDisplayedTuple(targetId),
      resolveDeviceGestureReplay: (event) => this.resolveLocalDeviceGestureReplay(event),
      handleDeviceGesture: (event) => this.handleLocalDeviceGesture(event),
      getMobilePushConfig: (deviceId) =>
        this.hubClient.getMobilePushConfig(this.settings.hub.deviceId.trim() || deviceId),
      registerMobilePushSubscription: (deviceId, subscription) =>
        this.hubClient.registerMobilePushSubscription(
          this.settings.hub.deviceId.trim() || deviceId,
          subscription
        ),
      publishDeviceHandoff: (deviceId, handoff) =>
        this.hubClient.publishPhoneHandoff(this.settings.hub.deviceId.trim() || deviceId, handoff),
      getDailySnapshot: () => this.getDailyDashboardSnapshot(),
      getDailyPlan: (date) => this.dailyPlanService.read(date),
      getPreviousDailyUnfinished: (date) => this.getPreviousDailyUnfinished(date),
      migratePreviousDailyItems: (date, selections) => this.migratePreviousDailyItems(date, selections),
      getDailyAnalyticsRange: (from, to) => this.getDailyAnalyticsRange(from, to),
      getDailyMonthlySummary: (month) => this.getDailyMonthlySummary(month),
      getDailyJournalDay: (date) => this.getDailyJournalDay(date),
      getDailyJournalMonth: (month) => this.getDailyJournalMonth(month),
      writeDailyJournal: (date) => this.writeDailyJournal(date),
      locateCurrentFocusedTask: () => this.locateCurrentFocusedTask(),
      previewDailyPlanNormalization: (date) => this.previewDailyPlanNormalization(date),
      normalizeDailyPlan: (date, preview) => this.normalizeDailyPlan(date, preview),
      updateDailyPlanMetadata: (date, revision, patch) => this.updateDailyPlanMetadata(date, revision, patch),
      createDailyItem: (input) => this.createDailyItem(input),
      updateDailyItem: (id, revision, patch, date) => this.updateDailyItem(id, revision, patch, date),
      startDailyItem: (id, revision, eventId, date, timingRevision, lineageRevision) =>
        this.startDailyItem(id, revision, date, eventId, "obsidian", timingRevision, lineageRevision),
      pauseDailyItem: (id, revision, eventId, date, timingRevision, lineageRevision) =>
        this.pauseDailyItem(id, revision, eventId, date, "obsidian", timingRevision, lineageRevision),
      resumeDailyItem: (id, revision, eventId, date, timingRevision, lineageRevision) =>
        this.resumeDailyItem(id, revision, eventId, date, "obsidian", timingRevision, lineageRevision),
      completeDailyItem: (id, revision, eventId, date, timingRevision, lineageRevision) =>
        this.completeDailyItem(id, revision, eventId, date, "obsidian", timingRevision, lineageRevision),
      getDailyItemTiming: (id, date) => this.getDailyItemTiming(id, date),
      correctDailyItemTiming: (id, timingRevision, patch, date) =>
        this.correctDailyItemTiming(id, timingRevision, patch, date),
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
          this.runViewAction("ToWrite Workbench", () => this.activateDashboard());
        }
      })
    );
    this.registerView(
      TOWRITE_DASHBOARD_VIEW,
      (leaf) => new ToWriteDashboardItemView(leaf, this.uiApi, {
        dailyApi: dailyDashboardApi,
        getFullWorkflowPayload: () => this.workflowIndex.getPayload({ compact: true }),
        onOpenFloatingToday: () => {
          this.runViewAction("Focus Now", () => this.activateTodayFloating());
        }
      })
    );
    this.registerView(
      TOWRITE_TODAY_FLOATING_VIEW,
      (leaf) => new ToWriteTodayFloatingItemView(leaf, {
        dailyApi: dailyDashboardApi,
        onOpenDashboard: () => {
          this.runViewAction("ToWrite Workbench", () => this.activateDashboard({ activeTab: "today" }));
        },
        onOpenTaskPool: () => {
          this.runViewAction("ToWrite Workbench", () => this.activateDashboard({ activeTab: "pool" }));
        }
      })
    );
    this.registerMarkdownCodeBlockProcessor("towrite-today", (source, el, context) => {
      const component = new TodayEmbedCard({
        target: el,
        props: {
          dailyApi: dailyDashboardApi,
          source,
          onOpenDashboard: () => {
            this.runViewAction("ToWrite Workbench", () => this.activateDashboard({ activeTab: "today" }));
          },
          onOpenFloating: () => {
            this.runViewAction("Focus Now", () => this.activateTodayFloating());
          }
        }
      });
      const lifecycle = new MarkdownRenderChild(el);
      lifecycle.register(() => component.$destroy());
      context.addChild(lifecycle);
    });
    this.registerMarkdownPostProcessor((el, context) => {
      if (normalizePath(context.sourcePath) !== normalizePath(this.settings.daily.taskPoolPath)) return;
      if (this.settings.workPool.showTechnicalMetadata) return;
      concealTaskPoolTechnicalMetadata(el);
    });
    this.registerMarkdownPostProcessor((el, context) => {
      if (!this.settings.daily.enabled || !this.isTrackedDailyPlanPath(context.sourcePath)) return;
      concealDailyTaskTechnicalMetadata(el);
      if (
        normalizePath(context.sourcePath) !== normalizePath(this.dailyPlanDocument?.sourcePath ?? "")
        || this.previousDailyUnfinished.length === 0
      ) return;
      const previewRoot = el.closest(".markdown-preview-view") ?? el.parentElement ?? el;
      if (previewRoot.querySelector("[data-towrite-previous-migration]")) return;
      const prompt = createEl("aside");
      prompt.className = "towrite-daily-previous-migration";
      prompt.dataset.towritePreviousMigration = "true";
      const text = createSpan();
      text.textContent = `昨日还有 ${this.previousDailyUnfinished.length} 项未完成`;
      const button = createEl("button");
      button.type = "button";
      button.textContent = "选择迁移";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.runViewAction("昨日未完成迁移", () => this.activateDashboard({
          activeTab: "today",
          focusPreviousMigration: true,
          popout: true
        }));
      });
      prompt.append(text, button);
      el.prepend(prompt);
    });

    this.refreshRibbonIcons();

    this.addCommand({
      id: "open-towrite-sidebar",
      name: "Open questions sidebar",
      callback: () => {
        this.runViewAction("Open Questions", () => this.activateSidebar());
      }
    });

    this.addCommand({
      id: "open-towrite-dashboard",
      name: "Open question dashboard",
      callback: () => {
        this.runViewAction("ToWrite Workbench", () => this.activateDashboard());
      }
    });

    this.addCommand({
      id: "open-today-dashboard",
      name: "Today: open dashboard",
      callback: () => {
        this.runViewAction("ToWrite Workbench", () => this.activateDashboard({ activeTab: "today" }));
      }
    });

    this.addCommand({
      id: "locate-current-focused-task",
      name: "Today: locate current focused task",
      callback: () => {
        void this.locateCurrentFocusedTask();
      }
    });

    this.addCommand({
      id: "repair-current-daily-task-structure",
      name: "Today: repair current Daily task structure",
      callback: () => {
        void this.repairActiveDailyTaskStructure();
      }
    });

    this.addCommand({
      id: "open-task-pool-dashboard",
      name: "Workbench: open work pool",
      callback: () => {
        this.runViewAction("ToWrite Workbench", () => this.activateDashboard({ activeTab: "pool" }));
      }
    });

    this.addCommand({
      id: "clean-task-pool-format",
      name: "Work pool: organize Task Pool technical fields",
      callback: () => {
        void this.cleanTaskPoolFormat();
      }
    });

    this.addCommand({
      id: "undo-task-pool-format-cleanup",
      name: "Work pool: undo last Task Pool format cleanup",
      callback: () => {
        void this.undoTaskPoolFormatCleanup();
      }
    });

    this.addCommand({
      id: "insert-today-card",
      name: "Today: insert synced card into note",
      editorCallback: (editor) => {
        editor.replaceSelection(todayEmbedMarkdown());
      }
    });

    this.addCommand({
      id: "open-today-floating-window",
      name: "Focus Now: open floating window",
      callback: () => {
        this.runViewAction("Focus Now", () => this.activateTodayFloating());
      }
    });

    this.addCommand({
      id: "simulate-displayed-primary-button",
      name: "Device: simulate main-button single click",
      callback: () => {
        void this.simulateDisplayedPrimaryButton();
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
    this.registerEditorExtension(createDailyTaskControls({
      isEnabled: () => this.settings.daily.enabled && this.settings.daily.editorTaskControls,
      getActiveFilePath: () => this.getActiveFile() ?? undefined,
      getItems: () => this.dailyEditorPlanItems,
      getNormalizationPreviews: () => this.dailyPlanNormalizationPreviews,
      getLinkedTaskProjections: () => this.dailyLinkedTaskProjections,
      getPreviousUnfinished: () => this.previousDailyUnfinished,
      getTodaySourcePath: () => this.dailyPlanDocument?.sourcePath,
      getTiming: (item) => this.dailyTimingSnapshotForItem(item),
      onToggle: async (item) => {
        try {
          const timing = this.dailyTimingSnapshotForItem(item);
          if (timing.status === "running") {
            await this.pauseDailyItem(
              item.id,
              item.revision,
              undefined,
              item.date,
              "obsidian",
              timing.timingRevision
            );
          } else if (timing.status === "paused") {
            await this.resumeDailyItem(
              item.id,
              item.revision,
              undefined,
              item.date,
              "obsidian",
              timing.timingRevision
            );
          } else if (timing.status !== "completed") {
            await this.startDailyItem(item.id, item.revision, item.date);
          }
        } catch (error) {
          new Notice(messageForError(error));
        }
      },
      onComplete: async (item) => {
        try {
          await this.completeDailyItem(item.id, item.revision, undefined, item.date);
          await this.refreshDailyPlanCache();
        } catch (error) {
          new Notice(messageForError(error));
        }
      },
      onOpen: async (item) => { await this.openDailyItemTarget(item); },
      onEditProperties: (item) => this.editDailyTaskProperties(item),
      onEnrich: (edit) => this.enrichPendingDailyTask(edit),
      onTrackOnly: (edit) => this.trackPendingDailyTask(edit),
      onOpenPending: async (edit) => {
        const sourcePath = this.getActiveFile() ?? "";
        const target = edit.targetResolution.target;
        if (!target || !this.resolveDailyMarkdownTargetFile(target, sourcePath)) {
          new Notice("ToWrite 找不到这条待办关联的文档。");
          return;
        }
        await this.openObsidianLink(this.dailyTargetLinkText(target), sourcePath);
      },
      onToggleLinkedTask: (projection, item) => this.toggleDailyLinkedTask(projection, item),
      onOpenLinkedNote: (projection) => this.openFile(projection.targetPath),
      onOpenPreviousMigration: async () => {
        await this.activateDashboard({ activeTab: "today" });
      }
    }));
    this.registerEditorExtension(createTaskPoolTechnicalMetadataExtension({
      isEnabled: () => this.settings.daily.enabled,
      getActiveFilePath: () => this.getActiveFile() ?? undefined,
      getTaskPoolPath: () => this.settings.daily.taskPoolPath,
      showTechnicalMetadata: () => this.settings.workPool.showTechnicalMetadata
    }));
    this.registerEditorExtension(createNoteTaskControls({
      isEnabled: () => this.settings.daily.enabled && this.settings.daily.editorTaskControls,
      getActiveFilePath: () => this.getActiveFile() ?? undefined,
      getDocument: () => this.activeNoteTaskDocument,
      getTiming: (item) => this.noteTaskTimingSnapshot(item),
      getPoolTask: (item) => item.poolTaskRef
        ? this.activeTaskPoolItems.find((poolItem) => poolItem.taskId === item.poolTaskRef)
        : undefined,
      getPoolMatches: (candidate) =>
        this.activeNoteTaskPoolMatches.get(noteTaskCandidateCacheKey(candidate)) ?? [],
      onEditProperties: (item) => this.editTrackedNoteTaskProperties(item),
      onToggleTiming: (item) => this.toggleTrackedNoteTaskTiming(item),
      onComplete: (item) => this.completeTrackedNoteTask(item),
      onAddTrackedToPool: (item) => this.addTrackedNoteTaskToPool(item),
      onAddToPool: (candidate) => this.addPendingNoteTaskToPool(candidate),
      onLinkPoolTask: (candidate, item) => this.linkPendingNoteTaskToPool(candidate, item),
      onEnrich: (candidate) => this.enrichPendingNoteTask(candidate),
      onTrackOnly: (candidate) => this.trackPendingNoteTask(candidate)
    }));
    this.registerEditorSuggest(new MarkdownTaskInputSuggest(this.app, {
      isEnabled: () => this.settings.daily.enabled,
      getItems: () => this.markdownTaskInputSuggestions()
    }));

    this.addSettingTab(new ToWriteSettingTab(this.app, this));
    this.registerEvents();
    this.registerInterval(window.setInterval(() => {
      void this.runSuggestionNotifications();
    }, 15 * 60 * 1000));
    // File changes are synchronized incrementally. This slower pass is only a
    // reconciliation safety net for external sync tools that may skip events.
    this.registerInterval(window.setInterval(() => {
      if (
        this.settings.daily.enabled
        && Date.now() - this.lastEditorActivityAt >= 5_000
      ) {
        void this.syncMarkdownTasksToWorkPool();
      }
    }, 30 * 60 * 1000));
    this.registerInterval(window.setInterval(() => {
      if (
        this.activeNoteTaskDocument?.tasks.some((item) =>
          this.noteTaskTimingSnapshot(item).status === "running"
        )
      ) {
        this.refreshNoteEditorTaskControls();
      }
    }, 60_000));
    const persistSecurityMigration = this.securityMigrationVersion < 1;
    if (persistSecurityMigration) this.securityMigrationVersion = 1;
    this.app.workspace.onLayoutReady(() => {
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
      // Restore only the files needed by the visible Today/Work Pool surfaces.
      // Full Vault indexing and Markdown reconciliation wait for an idle turn so
      // a cold laptop can finish metadata-cache and sync recovery first.
      void this.restoreStartupCaches().catch((error: unknown) => {
        console.error("ToWrite startup cache restore failed", error);
      });
      this.scheduleStartupReconciliation();
      if (this.settings.autoOpenSidebar) {
        window.setTimeout(() => {
          void this.activateSidebar();
        }, 250);
      }
      void this.runSuggestionNotifications();
      void this.syncDeviceHub(false);
      void this.registerCapturePluginBridge(false);
      if (persistSecurityMigration) {
        window.setTimeout(() => {
          void this.savePluginData().catch((error: unknown) => {
            console.error("ToWrite could not persist the deferred security migration", error);
          });
        }, 1_000);
      }
      if (this.showQueryTokenMigrationNotice) {
        new Notice("ToWrite disabled External API query-token reads during the security upgrade. Re-enable them explicitly in Advanced API settings only if a restricted device flow requires it.", 12000);
      }
    });
  }

  onunload(): void {
    if (this.backgroundRefreshTimer) {
      window.clearTimeout(this.backgroundRefreshTimer);
      this.backgroundRefreshTimer = 0;
    }
    if (this.startupReconciliationTimer) {
      window.clearTimeout(this.startupReconciliationTimer);
      this.startupReconciliationTimer = 0;
    }
    if (this.startupMarkdownReconciliationTimer) {
      window.clearTimeout(this.startupMarkdownReconciliationTimer);
      this.startupMarkdownReconciliationTimer = 0;
    }
    if (this.startupIdleCallback !== undefined) {
      const idleWindow = window as Window & {
        cancelIdleCallback?: (handle: number) => void;
      };
      idleWindow.cancelIdleCallback?.(this.startupIdleCallback);
      this.startupIdleCallback = undefined;
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
    if (this.dailyTimerDisplayRefreshTimer) {
      window.clearTimeout(this.dailyTimerDisplayRefreshTimer);
      this.dailyTimerDisplayRefreshTimer = 0;
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
    if (this.indexRefreshPromise) return this.indexRefreshPromise;
    const operation = this.enqueueFullVaultMaintenance(() => this.runFullIndexRefresh());
    this.indexRefreshPromise = operation;
    try {
      await operation;
    } finally {
      if (this.indexRefreshPromise === operation) this.indexRefreshPromise = undefined;
    }
  }

  private async runFullIndexRefresh(): Promise<void> {
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

  private enqueueFullVaultMaintenance<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.fullVaultMaintenanceQueue.then(operation, operation);
    this.fullVaultMaintenanceQueue = result.then(() => undefined, () => undefined);
    return result;
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

  /** Rebuild only this plugin's Ribbon shortcuts; command-palette entries are unaffected. */
  refreshRibbonIcons(): void {
    // Hot reloads and interrupted unloads can leave an older instance's
    // Ribbon element behind. Remove only ToWrite-owned elements before the
    // current instance recreates the enabled shortcuts.
    this.app.workspace.containerEl.ownerDocument
      .querySelectorAll<HTMLElement>("[data-towrite-ribbon]")
      .forEach((element) => element.remove());
    for (const element of this.ribbonIconElements.values()) {
      element.remove();
    }
    this.ribbonIconElements.clear();

    const descriptors: Array<{
      id: keyof ToWriteSettings["ribbon"];
      icon: string;
      label: string;
      action: () => void;
    }> = [
      {
        id: "workspace",
        icon: "list-checks",
        label: "Open Todo Workspace",
        action: () => {
          this.runViewAction("ToWrite Workbench", () => this.activateDashboard({ activeTab: "today", popout: true }));
        }
      },
      {
        id: "questions",
        icon: "circle-help",
        label: "Open ToWrite questions",
        action: () => {
          this.runViewAction("Open Questions", () => this.activateSidebar());
        }
      },
      {
        id: "capture",
        icon: "square-pen",
        label: "Open smart capture",
        action: () => { this.openCaptureModal({ entryPoint: "ribbon" }); }
      },
      {
        id: "ai",
        icon: "bot",
        label: "Open ToWrite AI assistant",
        action: () => { this.openAiAssistant(); }
      },
      {
        id: "focus",
        icon: "focus",
        label: "Open ToWrite Focus Now window",
        action: () => {
          this.runViewAction("Focus Now", () => this.activateTodayFloating());
        }
      }
    ];

    for (const descriptor of descriptors) {
      if (!this.settings.ribbon[descriptor.id]) continue;
      const element = this.addRibbonIcon(descriptor.icon, descriptor.label, descriptor.action);
      element.dataset.towriteRibbon = descriptor.id;
      this.ribbonIconElements.set(descriptor.id, element);
    }
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

  private scheduleBackgroundRefresh(filePath?: string, delayMs = 8000): void {
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
    if (Date.now() - this.lastEditorActivityAt < 2000) {
      this.scheduleBackgroundRefresh(undefined, 2000);
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

  private async restoreStartupCaches(): Promise<void> {
    await this.runStartupStep("navigation checkpoints", () => this.navigationCheckpointService.load());
    await yieldToEventLoop();
    await this.runStartupStep("Daily timer", () => this.initializeDailyTaskTimer());
    await this.runStartupStep("note task timer", () => this.initializeNoteTaskTimer());
    await yieldToEventLoop();
    await this.runStartupStep("Task Pool cache", () => this.refreshActiveTaskPoolCache(false));
    await yieldToEventLoop();
    await this.runStartupStep("Daily plan cache", () => this.refreshDailyPlanCache(false, {
      rebuildLinkedProjection: false,
      refreshBackendTiming: false,
      refreshPreviousUnfinished: false,
      // Publish the parsed Markdown plan first. Draft discovery is read-only
      // enrichment and must never hold Workbench or Focus on a loading screen.
      refreshDraftPreviews: false
    }));
    this.startupCachesReady = true;
    this.rebuildMarkdownTaskInputSuggestionCache();
    this.notifyUi();
    // Draft discovery needs to parse the editable Daily document (and the
    // following day). It is useful enrichment, but it must not gate the first
    // usable Today snapshot or leave Workbench/Focus on a loading screen.
    this.scheduleDailyDraftPreviewRefresh();
    // Historical carry-over discovery can inspect many Daily files. It is an
    // enrichment of the already usable Today snapshot, so never keep Obsidian
    // startup or the Focus/Workbench views waiting for it.
    void this.refreshPreviousDailyUnfinishedCache().catch((error: unknown) => {
      console.error("ToWrite could not restore previous Daily unfinished items", error);
    });
    await yieldToEventLoop();
    await this.runStartupStep("active note tasks", () => this.refreshActiveNoteTaskCache());
  }

  private async runStartupStep(label: string, operation: () => Promise<unknown>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      console.error(`ToWrite could not restore ${label}`, error);
    }
  }

  private scheduleStartupReconciliation(delayMs = 5_000): void {
    if (this.startupReconciliationTimer) window.clearTimeout(this.startupReconciliationTimer);
    this.startupReconciliationTimer = window.setTimeout(() => {
      this.startupReconciliationTimer = 0;
      if (Date.now() - this.lastEditorActivityAt < 3_000) {
        this.scheduleStartupReconciliation(4_000);
        return;
      }
      const idleWindow = window as Window & {
        requestIdleCallback?: (
          callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
          options?: { timeout: number }
        ) => number;
      };
      const run = (): void => {
        this.startupIdleCallback = undefined;
        void this.runStartupReconciliation();
      };
      if (idleWindow.requestIdleCallback) {
        this.startupIdleCallback = idleWindow.requestIdleCallback(run, { timeout: 15_000 });
      } else {
        this.startupReconciliationTimer = window.setTimeout(run, 1_500);
      }
    }, delayMs);
  }

  private async runStartupReconciliation(): Promise<void> {
    if (!this.startupCachesReady) {
      this.scheduleStartupReconciliation(3_000);
      return;
    }
    // requestIdleCallback may fire because of its timeout even while the user
    // has started typing. Re-check immediately before touching the whole Vault.
    if (Date.now() - this.lastEditorActivityAt < 5_000) {
      this.scheduleStartupReconciliation(8_000);
      return;
    }
    try {
      await this.refreshIndex();
      this.rebuildMarkdownTaskNoteSuggestions();
      await this.returnExpiredTaskPoolAssignments();
      await this.refreshActiveTaskPoolCache(false);
      this.notifyUi();
    } catch (error) {
      console.error("ToWrite background index reconciliation failed", error);
    } finally {
      this.scheduleStartupMarkdownReconciliation();
    }
  }

  private scheduleStartupMarkdownReconciliation(delayMs = 20_000): void {
    if (!this.settings.daily.enabled) return;
    if (this.startupMarkdownReconciliationTimer) {
      window.clearTimeout(this.startupMarkdownReconciliationTimer);
    }
    this.startupMarkdownReconciliationTimer = window.setTimeout(() => {
      this.startupMarkdownReconciliationTimer = 0;
      if (Date.now() - this.lastEditorActivityAt < 5_000) {
        this.scheduleStartupMarkdownReconciliation(8_000);
        return;
      }
      void this.syncMarkdownTasksToWorkPool().catch((error: unknown) => {
        console.error("ToWrite deferred Markdown reconciliation failed", error);
      });
    }, delayMs);
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
    const persistedSettings = this.persistSensitiveSettings();
    const data: ToWriteSavedData = {
      settings: persistedSettings,
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
      dailyCarryoverReviews: this.dailyCarryoverReviews,
      dailyCarryoverIgnored: this.dailyCarryoverIgnored,
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
    if (!await confirmWithModal(
      this.app,
      "Clear all ToWrite learning events, candidates, and accepted learned habits? Manual Push rules are kept.",
      "Clear learning data"
    )) {
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
        const label = await promptWithModal(this.app, "Habit label", candidate.label);
        if (label !== null) {
          const description = await promptWithModal(this.app, "Habit description", candidate.description);
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
      const resolution = item.targetResolution ?? resolveDailyTarget({
        sourcePath: item.sourcePath,
        taskText: item.text,
        rawBlock: item.rawBlock,
        blockId: item.blockId,
        explicitTarget: item.target,
        lineage: item.lineage
      });
      const targetPath = this.dailyCaptureTargetPath(item);
      const isInbox = targetPath === this.settings.deviceCapture.inboxFile;
      const privacy = combineHubCandidatePrivacy(
        this.hubPrivacyForPath(item.sourcePath, item.tags),
        this.hubPrivacyForPath(targetPath, [], { ignoreIncludeFolders: isInbox })
      );
      const groupLabel = dailyGroupDisplayLabel(item.lineage?.groups.at(-1));
      const timing = this.dailyTimingSnapshotForItem(item);
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
          body: [groupLabel, item.text].filter(Boolean).join("\n"),
          prompt: item.scheduledFor
            ? `${this.settings.language === "zh" ? "计划于" : "Scheduled"} ${formatLocalDateTime(item.scheduledFor)}`
            : `${resolution.displayLabel} · ${dailyTimingStatusLabel(timing.status, this.settings.language)}`
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
    const progressBar = compactDeviceProgressBar(
      deck.overview.progress.done,
      deck.overview.progress.total
    );
    const overview: DailyEinkCard = {
      localId: deck.overview.localId,
      contentType: "daily_overview",
      title: zh ? "今日总览" : "Today overview",
      body: [
        `${progressBar} ${deck.overview.progress.done}/${deck.overview.progress.total}`,
        ...deck.overview.projects.slice(0, 4).map((project) =>
          `${project.label}  ${project.done}/${project.total}`
        ),
        deck.theme ? `${zh ? "主线" : "Focus"} · ${deck.theme}` : "",
        deck.overview.current
          ? `${zh ? "当前" : "Now"} · ${deck.overview.current.text}`
          : (zh ? "今天还没有待办" : "No remaining task"),
      ].filter(Boolean).join("\n"),
      prompt: `${zh ? "电量" : "Battery"} ${deck.overview.batteryPercent ?? "--"}% · ${
        zh ? "主键开始" : "Primary: start"
      }`,
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
        card.item.groupLabel ? `${zh ? "分类" : "Group"} · ${card.item.groupLabel}` : "",
        `${card.position}/${card.total} · ${card.item.text}`,
        card.item.targetLabel ? `${zh ? "目标" : "Target"} · ${card.item.targetLabel}` : "",
        card.item.timing
          ? `${dailyDeckTimingStatusLabel(card.item.timing.state, this.settings.language)} · ${
            Math.floor(card.item.timing.activeSeconds / 60)
          }${zh ? " 分钟" : " min"}${
            card.item.estimateMinutes ? ` / ${card.item.estimateMinutes}` : ""
          }`
          : "",
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
    const inboxCards: DailyEinkCard[] = deck.inboxItems.map((card) => ({
      localId: card.localId,
      contentType: "daily_inbox",
      title: card.item
        ? `${dailyInboxSourceLabel(card.item.source, this.settings.language)} · ${card.item.title}`
        : (zh ? "提醒 · 收件箱" : "Reminders · Inbox"),
      body: card.item
        ? [card.item.detail, card.item.reason ? `${zh ? "此刻出现" : "Why now"} · ${card.item.reason}` : ""]
            .filter(Boolean)
            .join("\n\n")
        : (zh ? "现在没有新提醒" : "No new reminders"),
      prompt: card.total > 0
        ? `${card.position}/${card.total} · ${zh ? "右键切换，主键确认" : "Right: next · Primary: confirm"}`
        : (zh ? "右键切换" : "Right: next"),
      actions: card.item ? ["open", "later"] : ["next"],
      updatedAt: card.item?.generatedAt || this.dailyPlanDocument?.revision
    }));
    const summaryAdapter = this.dailySummaryDeviceAdapter();
    if (!summaryAdapter) return [overview, ...planCards, ...inboxCards];
    const snapshot = this.dailyActivityService.getSnapshot(new Date(), this.dailyPlanItems);
    const candidate = summaryAdapter.candidate;
    const stableRevision = shortHash(JSON.stringify({
      date: snapshot.date,
      metrics: snapshot.summary.metrics,
      items: snapshot.plan.items.map((item) => [item.id, item.revision.value, item.status])
    }));
    return [overview, ...planCards, ...inboxCards, {
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
      items: this.dailyPlanItems.map((item) => {
        const groupLabel = dailyGroupDisplayLabel(item.lineage?.groups.at(-1));
        const poolTask = item.taskRef
          ? this.activeTaskPoolItems.find((candidate) => candidate.taskId === item.taskRef)
          : undefined;
        const projectLabel = cleanDailyProjectLabel(poolTask?.project)
          || cleanDailyProjectLabel(groupLabel)
          || item.category
          || (this.settings.language === "zh" ? "未分类" : "Unclassified");
        const projectId = dailyProjectIdentifier(projectLabel);
        const projectColor = this.settings.workPool.projectAppearances
          .find((appearance) => appearance.projectId === projectId)?.color;
        return {
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
          startedAt: item.startedAt,
          groupLabel,
          projectId,
          projectLabel,
          projectColor,
          targetLabel: item.targetResolution?.displayLabel,
          targetProvenance: item.targetResolution?.source,
          lineageRevision: item.lineageRevision,
          timing: dailyDeckTiming(this.dailyTimingSnapshotForItem(item))
        };
      }),
      inboxItems: this.currentDailyInboxItems(),
      batteryPercent: this.lastLocalDeviceBatteryPercent
    });
  }

  private currentDailyInboxItems() {
    const suggestions = this.getProactiveSuggestions()
      .filter((suggestion) => {
        if (!suggestion.sourceFile) return true;
        const privacy = this.hubPrivacyForPath(suggestion.sourceFile);
        return !privacy.private && !privacy.excluded;
      })
      .slice(0, 8)
      .map((suggestion) => ({
        id: `suggestion:${suggestion.id}`,
        source: "rule" as const,
        title: suggestion.title,
        detail: suggestion.detail,
        reason: suggestion.triggerReason,
        generatedAt: suggestion.generatedAt
      }));
    const seenTitles = new Set(suggestions.map((item) => item.title.trim().toLocaleLowerCase()));
    const inbox = this.getInboxSnapshot().items
      .filter((item) => {
        if (seenTitles.has(item.title.trim().toLocaleLowerCase())) return false;
        const privacy = this.hubPrivacyForPath(item.filePath, item.tags);
        return !privacy.private && !privacy.excluded;
      })
      .slice(0, 8)
      .map((item) => ({
        id: `inbox:${item.id}`,
        source: item.kind === "human-message" ? "human" as const : "inbox" as const,
        title: item.title,
        detail: [item.project, item.folder].filter(Boolean).join(" · "),
        reason: this.settings.language === "zh" ? "尚未整理的 Inbox 内容" : "Pending Inbox item",
        generatedAt: item.updatedAt
      }));
    return [...suggestions, ...inbox].slice(0, 12);
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
      ...deck.inboxItems.map((item) => item.localId),
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
      const servedTiming = servedItem ? this.dailyTimingSnapshotForItem(servedItem) : undefined;
      const dailyDate = servedItem?.date
        || (/^daily-(?:overview|result|summary|inbox):(\d{4}-\d{2}-\d{2})(?::|$)/u.exec(servedCardId)?.[1]);
      if (dailyDate) {
        const servedDailyCard = dailyCards.find((card) => card.localId === servedCardId);
        const selectionState = this.localTapSelection.serialize();
        const tapSnapshot = [
          selectionState.localSnapshot,
          selectionState.localDisplayedSnapshot
        ].find((snapshot) => snapshot?.localId === servedCardId
          && (!servedItem
            || snapshot?.sourceContext?.dailyItemId === servedItem.id
            && snapshot.sourceContext.dailyTaskRevision === servedItem.revision.value
            && snapshot.sourceContext.lineageRevision === servedItem.lineageRevision));
        this.localDeviceServedTaskRevisions.set(
          `${servedRevision}:${servedCardId}`,
          {
            dailyItemId: servedItem?.id,
            taskRevision: servedItem?.revision.value,
            lineageRevision: servedItem?.lineageRevision,
            timingRevision: servedTiming?.timingRevision,
            taskDate: dailyDate,
            taskSourcePath: servedItem?.sourcePath,
            tapSnapshot,
            display: servedDailyCard ? { ...servedDailyCard, actions: [...servedDailyCard.actions] } : undefined
          }
        );
      }
      while (this.localDeviceServedTaskRevisions.size > 128) {
        const oldest = this.localDeviceServedTaskRevisions.keys().next().value;
        if (!oldest) break;
        this.localDeviceServedTaskRevisions.delete(oldest);
      }
    }
    this.legacyEinkPlaylistCache.set(cacheKey, payload);
    if (this.legacyEinkPlaylistCache.size > 32) {
      const oldest = this.legacyEinkPlaylistCache.keys().next().value;
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
      lineageRevision: servedTask?.lineageRevision,
      timingRevision: servedTask?.timingRevision,
      taskDate: servedTask?.taskDate,
      taskSourcePath: servedTask?.taskSourcePath,
      batteryPercent: acknowledgement.batteryPercent,
      firmwareVersion: acknowledgement.firmwareVersion,
      screenModel: acknowledgement.screenModel,
      capabilities: acknowledgement.capabilities
    });
    if (acknowledgement.batteryPercent !== undefined) {
      this.lastLocalDeviceBatteryPercent = acknowledgement.batteryPercent;
    }
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
              lineageRevision: servedTask.lineageRevision,
              timingRevision: servedTask.timingRevision,
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
      timingRevision: existing.timingRevision,
      displayMessage: existing.displayMessage || deviceCommandMessage(existing.action)
    };
  }

  private async simulateDisplayedPrimaryButton(): Promise<void> {
    const runtimeTargetId = this.externalApiServer?.getRuntimeStatus().lastTargetId?.trim();
    const preferredTargetId = runtimeTargetId
      || this.settings.push.targets.find((target) =>
        target.enabled && this.localDeviceCompletionGuards.has(localDeviceTargetKey(target.id))
      )?.id;
    const entry = preferredTargetId
      ? [localDeviceTargetKey(preferredTargetId), this.localDeviceCompletionGuards.get(
        localDeviceTargetKey(preferredTargetId)
      )] as const
      : this.localDeviceCompletionGuards.entries().next().value;
    const targetId = entry?.[0] === "__default__" ? "" : entry?.[0];
    const displayed = entry?.[1];
    if (!displayed
      || !targetId
      || !displayed.deviceId
      || !displayed.selectionId
      || !displayed.contentId
      || !displayed.revisionId) {
      new Notice(this.settings.language === "zh"
        ? "还没有设备已 ACK 的 displayed 卡片；先让墨水屏拉取、显示并 ACK。"
        : "No displayed card has been ACKed yet. Poll, render, and ACK the screen first.");
      return;
    }
    const event: DeviceEventInput = {
      schemaVersion: 2,
      eventId: `evt_sim_${randomTokenFragment()}`,
      targetId,
      deviceId: displayed.deviceId,
      selectionId: displayed.selectionId,
      stateVersion: displayed.stateVersion,
      contentId: displayed.contentId,
      revisionId: displayed.revisionId,
      cardId: displayed.cardId,
      playlistRevision: displayed.playlistRevision,
      button: "primary",
      gesture: "single",
      action: "open_current"
    };
    const result = await this.handleLocalDeviceGesture(event);
    new Notice(result.status === "executed"
      ? (this.settings.language === "zh"
        ? `主键模拟成功：${result.displayMessage}`
        : `Main-button simulation: ${result.displayMessage}`)
      : (this.settings.language === "zh"
        ? `主键模拟未执行：${result.displayMessage}`
        : `Main-button simulation did not execute: ${result.displayMessage}`));
  }

  private async handleLocalDeviceGesture(event: DeviceEventInput) {
    const action = event.action;
    if (!action || (event.schemaVersion !== 2 && event.schemaVersion !== 3)) {
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
          dailyLineageRevision: displayed.lineageRevision,
          dailyTimingRevision: displayed.timingRevision,
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
        resultRevision: existing.resultRevision,
        timingRevision: existing.timingRevision,
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
      let timingRevision: string | undefined;
      let resolvedAction = action;
      let displayMessage = deviceCommandMessage(action);
      let status: "executed" | "waiting" | "unsupported" | "conflict" = "executed";

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
      } else if (action === "item_prev" || action === "item_next") {
        await this.advanceLocalDailyItem(event.cardId, action === "item_next" ? "next" : "prev");
        displayMessage = this.settings.language === "zh" ? "已切换当前条目" : "Item queued";
      } else if (action === "complete") {
        await this.completeDailyFromDeviceEvent(event);
        displayMessage = this.settings.language === "zh" ? "已完成" : "Completed";
      } else if (action === "toggle_timer" || action === "pause_task" || action === "resume_task") {
        const transitioned = await this.transitionDisplayedDailyTimer(
          event.cardId,
          frozenDaily,
          event.eventId,
          action
        );
        resultRevision = transitioned.item.revision.value;
        timingRevision = transitioned.timing.timingRevision;
        displayMessage = dailyTimingStatusLabel(transitioned.timing.status, this.settings.language);
      } else if (action === "create_note") {
        status = "waiting";
        displayMessage = this.settings.language === "zh" ? "正在发送到手机" : "Preparing phone handoff";
      } else if (action === "open_current" || action === "start_open") {
        const opened = await this.openDisplayedCard(
          event.cardId,
          shouldStartDailyOverviewForAction(action),
          frozenDaily,
          event.eventId
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
        status: status === "waiting" ? "executed" : status,
        processedAt: new Date().toISOString(),
        action: resolvedAction,
        resultRevision,
        timingRevision,
        displayMessage
      });
      await this.savePluginData();
      return { status, displayMessage, action: resolvedAction, resultRevision, timingRevision };
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
      const oldest = this.deviceCommandJournal.keys().next().value;
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
    const inboxCard = displayedCardId?.startsWith("daily-inbox:")
      ? deck.inboxItems.find((card) => card.localId === displayedCardId)
      : undefined;
    const page = displayedCardId === deck.overview.localId
      ? "daily_overview"
      : taskCard
          ? "daily_plan_item"
        : inboxCard
          ? "daily_inbox"
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
      : nextPage === "daily_inbox"
        ? inboxCard?.localId || deck.activeInboxItem.localId
        : taskCard?.localId || deck.activePlanItem?.localId || deck.overview.localId;
    await this.selectLocalDeviceCard(nextId);
  }

  private async advanceLocalDailyItem(
    displayedCardId: string | undefined,
    direction: "next" | "prev"
  ): Promise<void> {
    const deck = this.currentDailyDeck();
    const cards = displayedCardId?.startsWith("daily-inbox:")
      ? deck.inboxItems
      : displayedCardId?.startsWith("daily-plan:")
        ? deck.planItems
        : [];
    if (cards.length === 0) {
      throw new DailyPlanConflictError(
        "invalid-state",
        "Item switching is available only on a displayed Daily task or reminder page."
      );
    }
    const currentIndex = displayedCardId
      ? cards.findIndex((card) => card.localId === displayedCardId)
      : -1;
    const base = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (base + (direction === "next" ? 1 : -1) + cards.length) % cards.length;
    await this.selectLocalDeviceCard(cards[nextIndex].localId);
  }

  private async advanceLocalDailyTask(
    displayedCardId: string | undefined,
    direction: "next" | "prev"
  ): Promise<void> {
    if (this.currentDailyDeck().planItems.length === 0) {
      throw new Error(this.settings.language === "zh" ? "今日还没有任务卡" : "There is no task card today");
    }
    await this.advanceLocalDailyItem(displayedCardId, direction);
  }

  private async transitionDisplayedDailyTimer(
    displayedCardId: string | undefined,
    frozen: FrozenDisplayedDailyContext | undefined,
    eventId: string,
    requested: "toggle_timer" | "pause_task" | "resume_task"
  ): Promise<{ item: DailyPlanItem; timing: DailyTaskTimingSnapshot }> {
    const cardId = displayedCardId?.trim() ?? "";
    const id = cardId.startsWith("daily-plan:")
      ? cardId.slice("daily-plan:".length)
      : cardId.startsWith("daily-overview:")
        ? frozen?.dailyItemId
        : undefined;
    if (!id) {
      throw new DailyPlanConflictError(
        "invalid-state",
        "Task timing is available only for the displayed Daily overview or task."
      );
    }
    const current = await this.resolveFrozenDailyItem(frozen, id);
    const timing = this.dailyTimingSnapshotForItem(current);
    if (frozen?.dailyTimingRevision && frozen.dailyTimingRevision !== timing.timingRevision) {
      throw new DailyPlanConflictError(
        "revision-changed",
        "The task timer changed after this card was displayed."
      );
    }
    const operation = requested === "toggle_timer"
      ? timing.status === "running"
        ? "pause"
        : timing.status === "paused"
          ? "resume"
          : timing.status === "not-started"
            ? "start"
            : undefined
      : requested === "pause_task" ? "pause" : "resume";
    if (!operation) {
      throw new DailyPlanConflictError("invalid-state", "A completed task must be reopened in Obsidian.");
    }
    const transitioned = operation === "pause"
      ? await this.pauseDailyItem(
        id,
        current.revision,
        eventId,
        current.date,
        "device",
        frozen?.dailyTimingRevision,
        frozen?.dailyLineageRevision
      )
      : operation === "resume"
        ? await this.resumeDailyItem(
          id,
          current.revision,
          eventId,
          current.date,
          "device",
          frozen?.dailyTimingRevision,
          frozen?.dailyLineageRevision
        )
        : await this.startDailyItem(
          id,
          current.revision,
          current.date,
          eventId,
          "device",
          frozen?.dailyTimingRevision,
          frozen?.dailyLineageRevision
        );
    return {
      item: transitioned,
      timing: this.dailyTimingSnapshotForItem(transitioned)
    };
  }

  private async openDisplayedCard(
    displayedCardId: string | undefined,
    startOverview: boolean,
    frozenDaily?: FrozenDisplayedDailyContext,
    deviceEventId?: string
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
        ? await this.startDailyItem(
          current.id,
          current.revision,
          current.date,
          deviceEventId ? `${deviceEventId}:start` : undefined,
          deviceEventId ? "device" : "obsidian",
          frozenDaily?.dailyTimingRevision,
          frozenDaily?.dailyLineageRevision
        )
        : current;
      await this.refreshDailyPlanCache(false);
      try {
        const focused = await this.openDailyItemTarget(started, {
          eventId: deviceEventId,
          displayedValidated: Boolean(deviceEventId)
        });
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
    if (cardId.startsWith("daily-inbox:")) {
      const inboxCard = deck.inboxItems.find((card) => card.localId === cardId);
      const itemId = inboxCard?.item?.id ?? "";
      if (itemId.startsWith("suggestion:")) {
        await this.actOnSuggestion(itemId.slice("suggestion:".length), "open-source");
        return {
          started: false,
          displayMessage: this.settings.language === "zh" ? "已打开提醒来源" : "Reminder source opened"
        };
      }
      if (itemId.startsWith("inbox:")) {
        const inbox = this.getInboxSnapshot().items.find((item) => item.id === itemId.slice("inbox:".length));
        if (inbox) {
          await this.openFile(inbox.filePath);
          bestEffortFocusObsidian();
          return {
            started: false,
            displayMessage: this.settings.language === "zh" ? "已打开 Inbox" : "Inbox item opened"
          };
        }
      }
      await this.activateDashboard({ activeTab: "today" });
      return {
        started: false,
        displayMessage: this.settings.language === "zh" ? "已打开提醒页" : "Reminder page opened"
      };
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
      let focused = false;
      const active = await executeDailyStartAndOpen(item, {
        loadCurrent: () => this.dailyPlanService.get(item.id, item.date),
        getTiming: () => this.getDailyItemTiming(item.id, item.date),
        start: (current, timing) => this.startDailyItem(
          current.id,
          current.revision,
          current.date,
          deviceEventId ? `${deviceEventId}:start` : undefined,
          deviceEventId ? "device" : "obsidian",
          timing.timingRevision,
          frozenDaily?.dailyLineageRevision
        ),
        open: async (current) => {
          focused = await this.openDailyItemTarget(current, {
            eventId: deviceEventId,
            displayedValidated: Boolean(deviceEventId)
          });
        }
      });
      return {
        started: active.revision.value !== item.revision.value,
        resultRevision: active.revision.value,
        displayMessage: focused
          ? (active.revision.value !== item.revision.value
            ? (this.settings.language === "zh" ? "已开始并打开" : "Started and opened")
            : (this.settings.language === "zh" ? "已打开" : "Opened"))
          : (active.revision.value !== item.revision.value
            ? (this.settings.language === "zh" ? "已开始，请手动切到电脑" : "Started; bring computer forward")
            : (this.settings.language === "zh" ? "请手动切到电脑" : "Bring computer forward"))
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
      || (frozen.dailyLineageRevision && item.lineageRevision !== frozen.dailyLineageRevision)
      || (frozen.dailySourcePath && item.sourcePath !== frozen.dailySourcePath)) {
      throw new DailyPlanConflictError(
        "revision-changed",
        "The displayed Daily task changed after the screen was refreshed."
      );
    }
    return item;
  }

  private async openDailyItemTarget(
    item: DailyPlanItem,
    context: { eventId?: string; displayedValidated?: boolean } = {}
  ): Promise<boolean> {
    const resolution = item.targetResolution ?? resolveDailyTarget({
      sourcePath: item.sourcePath,
      taskText: item.text,
      rawBlock: item.rawBlock,
      blockId: item.blockId,
      explicitTarget: item.target,
      lineage: item.lineage
    });
    if (resolution?.source === "action") {
      return this.openConfiguredDesktopAction(resolution.actionId, item, {
        eventId: context.eventId,
        displayedValidated: context.displayedValidated ?? !context.eventId
      });
    }
    const target = resolution?.target;
    const linked = target ? this.resolveDailyMarkdownTargetFile(target, item.sourcePath) : undefined;
    let navigationTarget = resolution
      ? navigationTargetForDailyItem(item, resolution)
      : undefined;
    if (navigationTarget?.provider === "obsidian") {
      navigationTarget = this.applyDailyNavigationCheckpoint(
        item,
        resolution,
        navigationTarget
      );
    }
    if (navigationTarget && (!target || linked)) {
      const result = await this.navigationRouter.open(navigationTarget, {
        eventId: context.eventId,
        displayedValidated: context.displayedValidated ?? !context.eventId
      });
      if (result.status !== "opened") {
        throw new DailyPlanConflictError(
          result.status === "not-found" ? "not-found" : "invalid-state",
          result.message
        );
      }
      return result.focused;
    }
    if (item.kind === "create_note") {
      this.openCaptureModal({
        entryPoint: "device-primary",
        createOnly: true,
        title: target?.label || dailyCreateOnlyTitle(item),
        sourceFile: item.sourcePath
      });
      return bestEffortFocusObsidian();
    }
    if (resolution?.source === "dashboard") {
      await this.activateDashboard();
      return bestEffortFocusObsidian();
    }
    if (target && !linked) {
      throw new DailyPlanConflictError(
        "not-found",
        `The target note no longer exists: ${target.label || target.linkText}`
      );
    }
    await this.activateDashboard();
    return bestEffortFocusObsidian();
  }

  private async openConfiguredDesktopAction(
    actionId: string | undefined,
    item: DailyPlanItem,
    context: { eventId?: string; displayedValidated: boolean }
  ): Promise<boolean> {
    const profile = this.settings.desktopActions.find((candidate) => candidate.id === actionId);
    if (!actionId || !profile || !profile.enabled) {
      throw new DailyPlanConflictError(
        "invalid-state",
        actionId
          ? `The desktop action is missing or disabled: ${actionId}`
          : "The task contains an invalid towrite-action id."
      );
    }
    if (profile.kind === "today") {
      await this.activateDashboard({ activeTab: "today" });
      return bestEffortFocusObsidian();
    }
    if (profile.kind === "focus") {
      await this.activateTodayFloating();
      return bestEffortFocusObsidian();
    }

    let target: NavigationTarget | undefined;
    if (profile.kind === "deep-link") {
      target = {
        schemaVersion: NAVIGATION_TARGET_SCHEMA_VERSION,
        provider: "deep-link" as const,
        url: profile.target,
        label: profile.name
      };
    } else {
      const configured = resolveDailyTarget({
        sourcePath: item.sourcePath,
        taskText: "",
        explicitTarget: profile.target
      });
      if (profile.kind === "obsidian" && configured.target) {
        target = navigationTargetForMarkdownTarget(configured.target, item.sourcePath);
      } else if (profile.kind === "https" && configured.webTarget) {
        target = {
          schemaVersion: NAVIGATION_TARGET_SCHEMA_VERSION,
          provider: "web" as const,
          url: configured.webTarget.url,
          label: profile.name
        };
      }
    }
    if (!target) {
      throw new DailyPlanConflictError(
        "invalid-state",
        `Desktop action ${profile.id} has an invalid ${profile.kind} target.`
      );
    }
    const result = await this.navigationRouter.open(target, context);
    if (result.status !== "opened") {
      throw new DailyPlanConflictError(
        result.status === "not-found" ? "not-found" : "invalid-state",
        result.message
      );
    }
    return result.focused;
  }

  private applyDailyNavigationCheckpoint(
    item: DailyPlanItem,
    resolution: NonNullable<DailyPlanItem["targetResolution"]>,
    target: ObsidianNavigationTarget
  ): ObsidianNavigationTarget {
    const checkpoint = this.navigationCheckpointService.get(
      item.id,
      dailyNavigationTargetKey(item, resolution)
    );
    if (!checkpoint) return target;
    const resolved = this.resolveObsidianNavigationTargetFile(target);
    if (!resolved || resolved.path !== normalizePath(checkpoint.filePath)) return target;
    return {
      ...target,
      filePath: resolved.path,
      locations: [
        ...checkpoint.locations,
        ...(target.locations ?? [])
      ]
    };
  }

  private resolveObsidianNavigationTargetFile(
    target: ObsidianNavigationTarget
  ): TFile | undefined {
    const direct = target.filePath
      ? this.app.vault.getFileByPath(normalizePath(target.filePath))
      : undefined;
    if (direct) return direct;
    return target.linkText
      ? this.app.metadataCache.getFirstLinkpathDest(target.linkText, target.sourcePath) ?? undefined
      : undefined;
  }

  private async startAndOpenDailyItem(item: DailyPlanItem): Promise<void> {
    const date = item.revision.date ?? await this.dateForDailyItem(item.id, item.revision);
    const stable = await this.ensureStableDailyTask(item.id, item.revision, date);
    let activated: DailyPlanItem | undefined;
    await executeDailyStartAndOpen(stable, {
      loadCurrent: () => this.dailyPlanService.get(stable.id, date),
      getTiming: (current) => this.getDailyItemTiming(current.id, date),
      start: async (current, timing) => {
        activated = await this.startDailyItem(
          current.id,
          current.revision,
          date,
          undefined,
          "obsidian",
          timing.timingRevision,
          current.lineageRevision
        );
        return activated;
      },
      open: (active) => this.openDailyItemTarget(active).then(() => undefined)
    });
    await this.recordDailyTransition("start", activated ?? stable);
  }

  private hasDailyItemCheckpoint(item: DailyPlanItem): boolean {
    const resolution = item.targetResolution ?? resolveDailyTarget({
      sourcePath: item.sourcePath,
      taskText: item.text,
      rawBlock: item.rawBlock,
      blockId: item.blockId,
      explicitTarget: item.target,
      lineage: item.lineage
    });
    return this.navigationCheckpointService.has(
      item.id,
      dailyNavigationTargetKey(item, resolution)
    );
  }

  private async pauseAndRememberDailyItem(item: DailyPlanItem): Promise<void> {
    const date = await this.dateForDailyItem(item.id, item.revision);
    const current = await this.dailyPlanService.get(item.id, date);
    if (!current) {
      throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${item.id}`);
    }
    if (current.revision.value !== item.revision.value
      || (item.lineageRevision && current.lineageRevision !== item.lineageRevision)) {
      throw new DailyPlanConflictError(
        "revision-changed",
        "The Daily task or inherited target changed after the floating card was loaded."
      );
    }
    const resolution = current.targetResolution ?? resolveDailyTarget({
      sourcePath: current.sourcePath,
      taskText: current.text,
      rawBlock: current.rawBlock,
      blockId: current.blockId,
      explicitTarget: current.target,
      lineage: current.lineage
    });
    const navigationTarget = navigationTargetForDailyItem(current, resolution);
    if (!navigationTarget || navigationTarget.provider !== "obsidian") {
      throw new DailyPlanConflictError(
        "invalid-state",
        "External web pages cannot report their scroll position to Obsidian. Add a URL fragment to the explicit target instead."
      );
    }
    const targetFile = this.resolveObsidianNavigationTargetFile(navigationTarget);
    if (!targetFile || targetFile.extension.toLowerCase() !== "md") {
      throw new DailyPlanConflictError(
        "not-found",
        "The note for this task is unavailable, so its reading position was not saved."
      );
    }
    const view = this.app.workspace.getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .find((candidate): candidate is MarkdownView =>
        candidate instanceof MarkdownView && candidate.file?.path === targetFile.path
      );
    if (!view?.file) {
      throw new DailyPlanConflictError(
        "invalid-state",
        "Open the task note before choosing “later” so ToWrite can save its current reading position."
      );
    }
    const editor = view.editor;
    const cursor = editor.getCursor();
    const line = Math.max(0, Math.min(cursor.line, Math.max(0, editor.lineCount() - 1)));
    const lineText = editor.getLine(line);
    const content = editor.getValue();
    const startOffset = editor.posToOffset({ line, ch: 0 });
    const endOffset = editor.posToOffset({ line, ch: lineText.length });
    const locations: import("./navigation").ObsidianNavigationLocation[] = [];
    if (lineText.trim()) {
      locations.push({
        kind: "text",
        anchor: createQuestionAnchor(content, startOffset, endOffset)
      });
    }
    locations.push({ kind: "line", range: { start: line, end: line } });
    await this.navigationCheckpointService.set({
      schemaVersion: 1,
      taskId: current.id,
      targetKey: dailyNavigationTargetKey(current, resolution),
      filePath: targetFile.path,
      locations,
      capturedAt: new Date().toISOString()
    });
    const timing = await this.getDailyItemTiming(current.id, date);
    if (this.settings.daily.taskTimingEnabled && timing.status === "running") {
      await this.pauseDailyItem(
        current.id,
        current.revision,
        undefined,
        date,
        "obsidian",
        timing.timingRevision,
        current.lineageRevision
      );
    }
  }

  private resolveDailyMarkdownTargetFile(
    target: DailyMarkdownTarget,
    sourcePath = ""
  ): TFile | undefined {
    const directPath = target.path ? normalizePath(target.path) : "";
    const direct = directPath ? this.app.vault.getFileByPath(directPath) : undefined;
    if (direct) return direct;
    const linked = this.app.metadataCache.getFirstLinkpathDest(target.linkText, sourcePath);
    if (linked) return linked;
    // Many writers use Markdown links as note-name links (the same mental
    // model as wikilinks). Keep standards-compliant relative resolution first,
    // then let Obsidian resolve the authored basename across the Vault.
    if (target.kind === "markdown") {
      const noteName = target.linkText.split("/").pop()?.replace(/\.md$/iu, "").trim();
      if (noteName) {
        return this.app.metadataCache.getFirstLinkpathDest(noteName, sourcePath) ?? undefined;
      }
    }
    return undefined;
  }

  private dailyTargetLinkText(target: DailyMarkdownTarget): string {
    const base = target.path || target.linkText;
    if (target.blockId) return `${base}#^${target.blockId}`;
    if (target.heading) return `${base}#${target.heading}`;
    return base;
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

  private async locateCurrentFocusedTask(): Promise<boolean> {
    await this.refreshDailyPlanCache(false);
    const current = this.dailyPlanItems.find((item) => item.status === "in-progress")
      ?? this.dailyPlanItems.find((item) => this.dailyTimingSnapshotForItem(item).status === "running");
    if (!current) {
      new Notice(this.settings.language === "zh"
        ? "当前没有进行中的任务；请先在今日工作台选择并开始一项任务。"
        : "There is no focused task. Start one from Today first.");
      await this.activateDashboard({ activeTab: "today" });
      return false;
    }
    const file = this.app.vault.getFileByPath(normalizePath(current.sourcePath));
    if (!file) {
      new Notice(this.settings.language === "zh" ? "当前任务的日记原文已不存在。" : "The focused task source no longer exists.");
      return false;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { active: true });
    if (!(leaf.view instanceof MarkdownView)) return false;
    const line = Math.max(0, current.line - 1);
    leaf.view.editor.setCursor({ line, ch: 0 });
    leaf.view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
    window.setTimeout(() => {
      const selector = `[data-towrite-task="${CSS.escape(current.id)}"]`;
      const element = leaf.view.containerEl.querySelector<HTMLElement>(selector);
      if (!element) return;
      element.classList.add("towrite-focused-task-flash");
      window.setTimeout(() => element.classList.remove("towrite-focused-task-flash"), 1_500);
    }, 40);
    return true;
  }

  private async repairActiveDailyTaskStructure(): Promise<void> {
    const activePath = this.app.workspace.getActiveFile()?.path;
    if (!activePath) {
      new Notice("Open a Daily note first.");
      return;
    }
    await this.refreshDailyPlanCache(false);
    const preview = this.dailyPlanNormalizationPreviews.find((candidate) =>
      normalizePath(candidate.sourcePath) === normalizePath(activePath)
    );
    if (!preview) {
      new Notice(this.settings.language === "zh" ? "当前笔记不是已配置的日记计划来源。" : "The active note is not a configured Daily source.");
      return;
    }
    if (preview.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      new Notice(this.settings.language === "zh"
        ? "检测到重复标识或正文冲突，请在工作台查看结构预览后处理。"
        : "Duplicate ids or content conflicts require review in the Workbench preview.");
      await this.activateDashboard({ activeTab: "today" });
      return;
    }
    let repaired = 0;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const next = await this.dailyPlanNormalizationService.preview(preview.date);
      const edit = next.edits.find((candidate) => shouldAutomaticallyNormalizeDailyEdit(candidate, next.sourcePath));
      if (!edit) break;
      await this.dailyPlanNormalizationService.normalizeTask(next, edit.line);
      repaired += 1;
    }
    await this.refreshDailyPlanCache();
    new Notice(this.settings.language === "zh"
      ? (repaired ? `已安全修复 ${repaired} 条日记任务。` : "当前日记任务结构已经正常。")
      : (repaired ? `Safely repaired ${repaired} Daily task(s).` : "The Daily task structure is already valid."));
  }

  private async openTaskPoolSource(): Promise<boolean> {
    let file = this.app.vault.getFileByPath(this.taskPoolService.path);
    if (!file) {
      await this.createDailyPlanStorage().writeText(
        this.taskPoolService.path,
        "# ToWrite Task Pool\n\n## Tasks\n"
      );
      file = this.app.vault.getFileByPath(this.taskPoolService.path);
    }
    if (file) {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file, { active: true });
      if (leaf.view instanceof MarkdownView) {
        await leaf.view.setState(
          { ...leaf.view.getState(), mode: "source" },
          { history: false }
        );
      }
    } else {
      await this.activateDashboard();
    }
    return bestEffortFocusObsidian();
  }

  private async openDailyGroupTarget(group: import("./daily").DailyPlanGroup): Promise<boolean> {
    const target = group.links[0];
    if (target && this.resolveDailyMarkdownTargetFile(target, group.sourcePath)) {
      const result = await this.navigationRouter.open(
        navigationTargetForMarkdownTarget(target, group.sourcePath),
        { displayedValidated: true }
      );
      if (result.status === "opened") return result.focused;
    }
    const source = this.app.vault.getFileByPath(group.sourcePath);
    if (source) {
      await this.openFile(source.path);
      return bestEffortFocusObsidian();
    }
    await this.activateDashboard();
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
    if (served.lineageRevision && item.lineageRevision !== served.lineageRevision) {
      throw new DailyPlanConflictError(
        "revision-changed",
        "The Daily task inherited target changed after this card was rendered."
      );
    }
    await this.completeDailyItem(
      id,
      item.revision,
      event.eventId,
      item.date,
      "device",
      served.timingRevision,
      served.lineageRevision
    );
    await this.advanceAfterDailyCompletion(id);
  }

  private async laterDailyFromDeviceEvent(event: DeviceEventInput): Promise<void> {
    const cardId = event.cardId?.trim() ?? "";
    if (!cardId.startsWith("daily-plan:")) {
      throw new DailyPlanConflictError("revision-changed", "Only a displayed Daily plan card can be deferred.");
    }
    const id = cardId.slice("daily-plan:".length);
    const served = this.localDeviceCompletionGuards.get(localDeviceTargetKey(event.targetId));
    const item = await this.dailyPlanService.get(id, served?.taskDate);
    if (!item) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
    if (!served?.taskRevision || item.revision.value !== served.taskRevision) {
      throw new DailyPlanConflictError("revision-changed", "The Daily task changed after this card was rendered.");
    }
    if (served.lineageRevision && item.lineageRevision !== served.lineageRevision) {
      throw new DailyPlanConflictError(
        "revision-changed",
        "The Daily task inherited target changed after this card was rendered."
      );
    }
    await this.updateDailyItem(id, item.revision, {
      devicePolicy: "scheduled",
      scheduledFor: new Date(Date.now() + 30 * 60_000).toISOString()
    }, item.date);
  }

  private async applyPendingHubDeviceEvent(
    event: HubPendingDeviceEvent
  ): Promise<{
    status: "applied" | "conflict" | "ignored";
    resultRevision?: string;
    timingRevision?: string;
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
        timingRevision: concurrentlyReserved.timingRevision,
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
          timingRevision: existing.timingRevision,
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
      let timingRevision: string | undefined;
      let message = deviceCommandMessage(event.action);
      let journalStatus: "executed" | "unsupported" = "executed";

      if (event.action === "record_reserved") {
        journalStatus = "unsupported";
        message = this.settings.language === "zh" ? "录音功能尚未启用" : "Recording is not enabled";
      } else if (event.action === "create_note") {
        await this.openCreateOnlyCaptureForDisplayed(localId, {
          dailyItemId: storedSnapshot?.sourceContext?.dailyItemId,
          dailyTaskRevision: storedSnapshot?.sourceContext?.dailyTaskRevision,
          dailyLineageRevision: storedSnapshot?.sourceContext?.lineageRevision,
          dailyTimingRevision: storedSnapshot?.sourceContext?.timingRevision,
          dailyDate: storedSnapshot?.sourceContext?.dailyDate,
          dailySourcePath: storedSnapshot?.sourceContext?.dailySourcePath
        });
        message = this.settings.language === "zh" ? "已打开新建记录" : "New capture opened";
      } else if (event.action === "open_current" || event.action === "start_open") {
        const opened = await this.openDisplayedCard(
          localId,
          shouldStartDailyOverviewForAction(event.action),
          {
            dailyItemId: storedSnapshot?.sourceContext?.dailyItemId,
            dailyTaskRevision: storedSnapshot?.sourceContext?.dailyTaskRevision,
            dailyLineageRevision: storedSnapshot?.sourceContext?.lineageRevision,
            dailyTimingRevision: storedSnapshot?.sourceContext?.timingRevision,
            dailyDate: storedSnapshot?.sourceContext?.dailyDate,
            dailySourcePath: storedSnapshot?.sourceContext?.dailySourcePath
          },
          event.eventId
        );
        resultRevision = opened.resultRevision;
        message = opened.displayMessage;
      } else if (event.action === "pause_task" || event.action === "resume_task") {
        const transitioned = await this.transitionDisplayedDailyTimer(
          localId,
          {
            dailyItemId: storedSnapshot?.sourceContext?.dailyItemId,
            dailyTaskRevision: storedSnapshot?.sourceContext?.dailyTaskRevision,
            dailyLineageRevision: storedSnapshot?.sourceContext?.lineageRevision,
            dailyTimingRevision: storedSnapshot?.sourceContext?.timingRevision,
            dailyDate: storedSnapshot?.sourceContext?.dailyDate,
            dailySourcePath: storedSnapshot?.sourceContext?.dailySourcePath
          },
          event.eventId,
          event.action
        );
        resultRevision = transitioned.item.revision.value;
        timingRevision = transitioned.timing.timingRevision;
        message = dailyTimingStatusLabel(transitioned.timing.status, this.settings.language);
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
        const frozenLineageRevision = snapshot?.sourceContext?.lineageRevision;
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
        if (frozenLineageRevision && item.lineageRevision !== frozenLineageRevision) {
          throw new DailyPlanConflictError(
            "revision-changed",
            "The Daily task inherited target changed after this card was displayed."
          );
        }
        if (item.done) {
          resultRevision = item.revision.value;
        } else {
          const completed = await this.completeDailyItem(
            id,
            item.revision,
            event.eventId,
            item.date,
            "device",
            snapshot.sourceContext?.timingRevision,
            snapshot.sourceContext?.lineageRevision
          );
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
        timingRevision,
        displayMessage: message
      });
      await this.savePluginData();
      return {
        status: journalStatus === "executed" ? "applied" : "ignored",
        resultRevision,
        timingRevision,
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
      links: Array.from(request.text.matchAll(/https?:\/\/[^\s<>{}"']+/giu)).map((match) => match[0]).slice(0, 10),
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
  private dailyCarryoverReviews: Record<string, string> = {};
  private dailyCarryoverIgnored: Record<string, string[]> = {};
  private readonly historicalDailyUnfinishedCache = new Map<string, {
    expiresAt: number;
    items: DailyPlanItem[];
  }>();

  private async loadPluginData(): Promise<void> {
    const data = (await this.loadData()) as Partial<ToWriteSavedData> | null;
    this.settings = normalizeSettings(data?.settings);
    this.restoreSensitiveSettings(data?.settings);
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
    this.dailyCarryoverReviews = data?.dailyCarryoverReviews && typeof data.dailyCarryoverReviews === "object"
      ? { ...data.dailyCarryoverReviews }
      : {};
    this.dailyCarryoverIgnored = data?.dailyCarryoverIgnored && typeof data.dailyCarryoverIgnored === "object"
      ? Object.fromEntries(Object.entries(data.dailyCarryoverIgnored)
          .filter(([, values]) => Array.isArray(values))
          .map(([date, values]) => [date, values.filter((value): value is string => typeof value === "string").slice(-512)]))
      : {};
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
        timingRevision: typeof entry.timingRevision === "string"
          ? entry.timingRevision.slice(0, 160)
          : undefined,
        displayMessage: typeof entry.displayMessage === "string"
          ? entry.displayMessage.slice(0, 160)
          : undefined
      });
    }
  }

  /**
   * SecretStorage is the authoritative store for credentials on Obsidian 1.11.4+.
   * Existing plaintext values win once so upgrades are lossless; subsequent saves
   * scrub the corresponding fields from data.json.
   */
  private restoreSensitiveSettings(raw?: Partial<ToWriteSettings>): void {
    const restore = (id: string, plaintext: unknown, fallback: string): string => {
      const legacy = typeof plaintext === "string" ? plaintext.trim() : "";
      if (legacy) {
        this.app.secretStorage.setSecret(id, legacy);
        return legacy;
      }
      return this.app.secretStorage.getSecret(id) ?? fallback;
    };
    this.settings.ai.apiKey = restore("towrite-ai-api-key", raw?.ai?.apiKey, this.settings.ai.apiKey);
    this.settings.quote0.apiKey = restore("towrite-quote0-api-key", raw?.quote0?.apiKey, this.settings.quote0.apiKey);
    this.settings.quote0.nfcToken = restore("towrite-quote0-nfc-token", raw?.quote0?.nfcToken, this.settings.quote0.nfcToken);
    this.settings.externalApi.token = restore("towrite-external-api-token", raw?.externalApi?.token, this.settings.externalApi.token);
    this.settings.backend.token = restore("towrite-backend-token", raw?.backend?.token, this.settings.backend.token);
    this.settings.captureBridge.callbackToken = restore(
      "towrite-capture-bridge-token",
      raw?.captureBridge?.callbackToken,
      this.settings.captureBridge.callbackToken
    );
    this.settings.hub.receiverToken = restore("towrite-hub-receiver-token", raw?.hub?.receiverToken, this.settings.hub.receiverToken);
    this.settings.hub.receiverPrivateKeyJwk = restore(
      "towrite-hub-private-key",
      raw?.hub?.receiverPrivateKeyJwk,
      this.settings.hub.receiverPrivateKeyJwk
    );
    this.settings.hub.referenceSecret = restore("towrite-hub-reference-secret", raw?.hub?.referenceSecret, this.settings.hub.referenceSecret);

    const legacyPushTokens = raw?.push?.targets?.map((target) => target.token ?? "") ?? [];
    const storedPushTokens = this.app.secretStorage.getSecret("towrite-push-target-tokens");
    if (legacyPushTokens.some(Boolean)) {
      this.app.secretStorage.setSecret("towrite-push-target-tokens", JSON.stringify(legacyPushTokens));
      this.settings.push.targets.forEach((target, index) => { target.token = legacyPushTokens[index] ?? target.token; });
    } else if (storedPushTokens) {
      try {
        const tokens = JSON.parse(storedPushTokens) as unknown;
        if (Array.isArray(tokens)) {
          this.settings.push.targets.forEach((target, index) => {
            target.token = typeof tokens[index] === "string" ? tokens[index] : target.token;
          });
        }
      } catch {
        // A malformed optional secret must not prevent the plugin from loading.
      }
    }
  }

  private persistSensitiveSettings(): ToWriteSettings {
    this.app.secretStorage.setSecret("towrite-ai-api-key", this.settings.ai.apiKey);
    this.app.secretStorage.setSecret("towrite-quote0-api-key", this.settings.quote0.apiKey);
    this.app.secretStorage.setSecret("towrite-quote0-nfc-token", this.settings.quote0.nfcToken);
    this.app.secretStorage.setSecret("towrite-external-api-token", this.settings.externalApi.token);
    this.app.secretStorage.setSecret("towrite-backend-token", this.settings.backend.token);
    this.app.secretStorage.setSecret("towrite-capture-bridge-token", this.settings.captureBridge.callbackToken);
    this.app.secretStorage.setSecret("towrite-hub-receiver-token", this.settings.hub.receiverToken);
    this.app.secretStorage.setSecret("towrite-hub-private-key", this.settings.hub.receiverPrivateKeyJwk);
    this.app.secretStorage.setSecret("towrite-hub-reference-secret", this.settings.hub.referenceSecret);
    this.app.secretStorage.setSecret(
      "towrite-push-target-tokens",
      JSON.stringify(this.settings.push.targets.map((target) => target.token))
    );

    const persisted = JSON.parse(JSON.stringify(this.settings)) as ToWriteSettings;
    persisted.ai.apiKey = "";
    persisted.quote0.apiKey = "";
    persisted.quote0.nfcToken = "";
    persisted.externalApi.token = "";
    persisted.backend.token = "";
    persisted.captureBridge.callbackToken = "";
    persisted.hub.receiverToken = "";
    persisted.hub.receiverPrivateKeyJwk = "";
    persisted.hub.referenceSecret = "";
    persisted.push.targets.forEach((target) => { target.token = ""; });
    return persisted;
  }

  private initializeDailyServices(state: DailyActivityState | undefined = this.savedDailyActivityState): void {
    this.dailyPlanService = this.createDailyPlanService();
    this.dailyPlanNormalizationService = this.createDailyPlanNormalizationService();
    this.noteTaskService = this.createNoteTaskService();
    this.taskPoolService = this.createTaskPoolService();
    this.noteTaskPoolCoordinator = new NoteTaskPoolCoordinator(
      this.noteTaskService,
      this.taskPoolService,
      {
        completePlanned: (item) => this.completePlannedPoolTaskFromNote(item),
        resolveCategory: (task) => this.taskCategoryFromSourceNote(task.sourcePath)
      }
    );
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
    return new DailyPlanService(this.createDailyPlanStorage(), {
      source: this.dailyPlanSourceSetting(),
      dailyRoot: this.settings.daily.dailyNoteRoot,
      planHeading: this.settings.daily.planHeading,
      todoHeading: this.settings.daily.todoHeading,
      summaryHeading: this.settings.daily.summaryHeading,
      tasksCompatibilityOutput: this.settings.daily.tasksCompatibilityOutput,
      onChanged: async () => {
        await this.refreshDailyPlanCache();
        this.queueDeviceHubSync();
      }
    });
  }

  private taskCategoryFromSourceNote(sourcePath: string): string | undefined {
    const file = this.app.vault.getFileByPath(sourcePath);
    if (!file) return undefined;
    const cachedFrontmatter: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!cachedFrontmatter || typeof cachedFrontmatter !== "object") return undefined;
    const frontmatter = cachedFrontmatter as Record<string, unknown>;
    for (const key of [
      "towrite-category",
      "towrite_category",
      "task-category",
      "task_category",
      "category"
    ]) {
      const value = frontmatter[key];
      const candidate: unknown = Array.isArray(value) ? value[0] : value;
      if (typeof candidate !== "string") continue;
      const normalized = candidate.trim().replace(/\s+/gu, " ");
      if (normalized) return normalized.slice(0, 120);
    }
    return undefined;
  }

  private createDailyPlanNormalizationService(): DailyPlanNormalizationService {
    return new DailyPlanNormalizationService(this.createDailyPlanStorage(), {
      source: this.dailyPlanSourceSetting(),
      dailyRoot: this.settings.daily.dailyNoteRoot,
      planHeading: this.settings.daily.planHeading,
      todoHeading: this.settings.daily.todoHeading,
      summaryHeading: this.settings.daily.summaryHeading,
      targetExists: (target) => Boolean(this.resolveDailyMarkdownTargetFile(target)),
      onChanged: async () => {
        await this.refreshDailyPlanCache();
        this.queueDeviceHubSync();
      }
    });
  }

  private createTaskPoolService(): TaskPoolService {
    return new TaskPoolService(this.createDailyPlanStorage(), {
      path: this.settings.daily.taskPoolPath,
      onChanged: async () => {
        await this.refreshActiveTaskPoolCache();
        this.notifyUi();
        this.queueDeviceHubSync();
      }
    });
  }

  private createNoteTaskService(): NoteTaskService {
    const storage = this.createDailyPlanStorage();
    return new NoteTaskService({
      ...storage,
      processText: async (path, update) => {
        const file = this.app.vault.getFileByPath(normalizePath(path));
        if (!file || file.extension.toLowerCase() !== "md") {
          throw new Error(`Markdown note does not exist: ${path}`);
        }
        return this.app.vault.process(file, update);
      }
    });
  }

  private dailyPlanSourceSetting() {
    return this.settings.daily.planSourceMode === "fixed-document"
      ? { kind: "fixed-document" as const, path: this.settings.daily.fixedPlanPath }
      : {
          kind: "daily-note" as const,
          dailyRoot: this.resolvedDailyNoteConfiguration().folder,
          dateFormat: this.resolvedDailyNoteConfiguration().format
        };
  }

  private resolvedDailyNoteConfiguration(): {
    source: "obsidian" | "custom";
    enabled: boolean;
    folder: string;
    format: string;
    template: string;
    templateExists: boolean;
  } {
    const core = readObsidianDailyNotesConfiguration(this.app);
    const useCore = shouldUseObsidianDailyNotes({
      source: this.settings.daily.dailyNoteSource,
      folder: this.settings.daily.dailyNoteRoot,
      format: this.settings.daily.dailyNoteFormat
    }, core);
    const folder = (useCore ? core.folder : this.settings.daily.dailyNoteRoot) || "Daily";
    const format = (useCore ? core.format : this.settings.daily.dailyNoteFormat) || "YYYY-MM-DD";
    const templatePath = core.template
      ? normalizePath(core.template.toLowerCase().endsWith(".md") ? core.template : `${core.template}.md`)
      : "";
    return {
      source: useCore ? "obsidian" : "custom",
      enabled: core.enabled,
      folder,
      format,
      template: templatePath,
      templateExists: Boolean(templatePath && this.app.vault.getFileByPath(templatePath))
    };
  }

  private createDailyPlanStorage(): DailyPlanStorage {
    return {
      readText: async (path) => {
        const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
        if (!file) {
          const daily = this.resolvedDailyNoteConfiguration();
          const normalized = normalizePath(path);
          const root = `${normalizePath(daily.folder)}/`;
          if (
            this.settings.daily.planSourceMode === "daily-note"
            && normalized.startsWith(root)
            && normalized.toLowerCase().endsWith(".md")
            && daily.templateExists
          ) {
            const template = this.app.vault.getFileByPath(daily.template);
            if (template) return this.app.vault.read(template);
          }
          return undefined;
        }
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
    };
  }

  private async initializeDailyTaskTimer(): Promise<void> {
    const root = normalizeVaultPath(this.settings.exportDirectory);
    this.dailyTimerLedgerPath = `${root}/daily/task-timer-events.jsonl`;
    const transitionLedgerPath = `${root}/daily/task-transition-events.jsonl`;
    const log: DailyTimerEventLog = {
      readJsonl: async () => await readVaultDataText(this.app, this.dailyTimerLedgerPath) ?? "",
      appendJsonl: async (jsonl) => {
        if (!jsonl) return;
        const existing = await readVaultDataText(this.app, this.dailyTimerLedgerPath) ?? "";
        const separator = existing && !existing.endsWith("\n") ? "\n" : "";
        await writeVaultDataText(this.app, this.dailyTimerLedgerPath, `${existing}${separator}${jsonl}`);
      },
      archive: async (name, jsonl) => {
        const safeName = name.replace(/[^A-Za-z0-9_.-]/gu, "_");
        await writeVaultDataText(this.app, `${root}/daily/archive/${safeName}`, jsonl);
      },
      clear: async () => {
        await writeVaultDataText(this.app, this.dailyTimerLedgerPath, "");
      }
    };
    try {
      this.dailyTransitionJournal = await DailyTransitionJournal.load({
        readJsonl: async () => await readVaultDataText(this.app, transitionLedgerPath) ?? "",
        appendJsonl: async (jsonl) => {
          if (!jsonl) return;
          const existing = await readVaultDataText(this.app, transitionLedgerPath) ?? "";
          const separator = existing && !existing.endsWith("\n") ? "\n" : "";
          await writeVaultDataText(this.app, transitionLedgerPath, `${existing}${separator}${jsonl}`);
        }
      });
    } catch (error) {
      this.dailyTransitionJournal = undefined;
      console.error("ToWrite work journal ledger could not be loaded", error);
    }
    try {
      this.dailyTaskTimer = await PersistentDailyTaskTimer.load(log, {
        maxOpenSessionMs: this.settings.daily.taskTimingReviewHours * 60 * 60_000
      });
      const journalPath = `${root}/daily/task-timer-transactions.json`;
      const journal = new JsonDailyTimerTransitionJournal({
        readText: () => readVaultDataText(this.app, journalPath),
        writeText: (value) => writeVaultDataText(this.app, journalPath, value)
      });
      this.dailyTimerCoordinator = new DailyTimerTransitionCoordinator(
        journal,
        this.createDailyTimerTransitionAdapter()
      );
      const reconciled = await this.dailyTimerCoordinator.reconcilePending();
      const conflicts = reconciled.filter((result) => result.status === "conflict");
      if (conflicts.length > 0) {
        this.dailyTimerLoadError = `${conflicts.length} task timer transaction(s) require review.`;
      } else {
        this.dailyTimerLoadError = "";
      }
    } catch (error) {
      this.dailyTaskTimer = undefined;
      this.dailyTimerCoordinator = undefined;
      this.dailyTimerLoadError = messageForError(error);
      console.error("ToWrite task timer ledger could not be loaded", error);
    }
  }

  private async initializeNoteTaskTimer(): Promise<void> {
    const root = normalizeVaultPath(this.settings.exportDirectory);
    const ledgerPath = `${root}/tasks/note-task-timer-events.jsonl`;
    const log: DailyTimerEventLog = {
      readJsonl: async () => await readVaultDataText(this.app, ledgerPath) ?? "",
      appendJsonl: async (jsonl) => {
        if (!jsonl) return;
        const existing = await readVaultDataText(this.app, ledgerPath) ?? "";
        const separator = existing && !existing.endsWith("\n") ? "\n" : "";
        await writeVaultDataText(this.app, ledgerPath, `${existing}${separator}${jsonl}`);
      },
      archive: async (name, jsonl) => {
        const safeName = name.replace(/[^A-Za-z0-9_.-]/gu, "_");
        await writeVaultDataText(this.app, `${root}/tasks/archive/${safeName}`, jsonl);
      },
      clear: async () => {
        await writeVaultDataText(this.app, ledgerPath, "");
      }
    };
    try {
      this.noteTaskTimer = await PersistentDailyTaskTimer.load(log, {
        maxOpenSessionMs: this.settings.daily.taskTimingReviewHours * 60 * 60_000
      });
    } catch (error) {
      this.noteTaskTimer = undefined;
      console.error("ToWrite ordinary-note task timer ledger could not be loaded", error);
    }
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
      void this.returnExpiredTaskPoolAssignments()
        .then(() => this.refreshDailyDashboard())
        .finally(() => this.scheduleDailyMidnightRefresh());
    }, Math.max(1_000, next.getTime() - now.getTime()));
  }

  private async returnExpiredTaskPoolAssignments(now = new Date()): Promise<void> {
    if (!this.settings.daily.enabled || !this.settings.daily.autoReturnUnfinished || !this.taskPoolService) return;
    const returnedDate = formatDailyInputDate(now);
    let pool: TaskPoolDocument;
    try {
      pool = await this.taskPoolService.read();
    } catch (error) {
      console.error("ToWrite could not inspect the Task Pool for expired assignments", error);
      return;
    }
    const documents = new Map<string, DailyPlanDocument>();
    for (const poolTask of pool.items) {
      if (
        poolTask.state !== "planned"
        || !poolTask.plannedDate
        || poolTask.plannedDate >= returnedDate
        || !poolTask.assignmentId
      ) {
        continue;
      }
      try {
        let document = documents.get(poolTask.plannedDate);
        if (!document) {
          document = await this.dailyPlanService.read(poolTask.plannedDate);
          documents.set(poolTask.plannedDate, document);
        }
        const assignment = document.items.find((item) =>
          item.id === poolTask.assignmentId && item.taskRef === poolTask.taskId
        );
        if (assignment?.status === "done") {
          await this.taskPoolService.completeAssigned(
            poolTask.taskId,
            poolTask.revision,
            poolTask.plannedDate,
            poolTask.assignmentId
          );
        } else {
          await this.taskPoolService.returnToPool(
            poolTask.taskId,
            poolTask.revision,
            returnedDate
          );
        }
      } catch (error) {
        console.error(`ToWrite could not reconcile expired Task Pool item ${poolTask.taskId}`, error);
      }
    }
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
      const oldest = this.dailyScheduleOccurrenceIds.values().next().value;
      if (!oldest) break;
      this.dailyScheduleOccurrenceIds.delete(oldest);
    }
    this.scheduleDailyStateSave();
    this.queueDeviceHubSync();
  }

  private async refreshDailyPlanCache(
    notify = true,
    options: {
      rebuildLinkedProjection?: boolean;
      refreshBackendTiming?: boolean;
      refreshPreviousUnfinished?: boolean;
      refreshDraftPreviews?: boolean;
    } = {}
  ): Promise<void> {
    const wasInitialized = this.dailyPlanCacheInitialized;
    const previous = this.dailyPlanItems;
    const previousRevision = this.dailyPlanDocument?.revision;
    let document = this.settings.daily.enabled
      ? await this.dailyPlanService.read()
      : undefined;
    if (document
      && wasInitialized
      && await this.synchronizeDailyMarkdownTimerState(document, previous)) {
      // Starting a manually selected task can atomically pause another `[/]`
      // task. Re-read after the journal commit so the cache never publishes
      // the pre-normalized two-running-task document.
      document = await this.dailyPlanService.read();
    }
    let next = document?.items ?? [];
    let poolProjectionChanged = false;
    if (wasInitialized && previous[0]?.sourcePath === next[0]?.sourcePath) {
      const previousById = new Map(previous.map((item) => [item.id, item]));
      for (const item of next) {
        const old = previousById.get(item.id);
        if (old && !old.done && item.done) {
          this.dailyActivityService.recordTaskCompleted(item.taskRef ?? item.id);
          const projected = await this.syncTaskPoolCompletion(item);
          poolProjectionChanged ||= projected.revision.value !== item.revision.value;
        } else if (old?.done && !item.done && item.taskRef) {
          try {
            const projected = await this.syncTaskPoolReopen(item);
            poolProjectionChanged ||= projected.revision.value !== item.revision.value;
          } catch (error) {
            console.error("ToWrite could not reopen a Task Pool item after a Markdown checkbox change", error);
          }
        } else if (old && item.taskRef) {
          const projected = await this.syncTaskPoolFieldsFromDaily(old, item);
          poolProjectionChanged ||= projected.revision.value !== item.revision.value;
        }
      }
    }
    if (document && poolProjectionChanged) {
      document = await this.dailyPlanService.read(document.date);
      next = document.items;
    }
    const shouldRefreshDraftPreviews = options.refreshDraftPreviews !== false;
    const editorDocuments: DailyPlanDocument[] = document ? [document] : [];
    if (document && shouldRefreshDraftPreviews) {
      const tomorrow = new Date(`${document.date}T12:00:00`);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDate = formatDailyInputDate(tomorrow);
      try {
        editorDocuments.push(await this.dailyPlanService.read(tomorrowDate));
      } catch (error) {
        console.error("ToWrite could not read tomorrow's plan for editor task controls", error);
      }
    }
    const normalizationPreviews: DailyPlanNormalizationPreview[] = [];
    if (document && shouldRefreshDraftPreviews) {
      for (const editorDocument of editorDocuments) {
        try {
          normalizationPreviews.push(
            await this.dailyPlanNormalizationService.preview(editorDocument.date)
          );
        } catch (error) {
          console.error("ToWrite could not inspect quick Daily tasks for progressive properties", error);
        }
      }
    }
    this.dailyPlanItems = next;
    this.dailyEditorPlanItems = editorDocuments.flatMap((entry) => entry.items);
    this.dailyPlanDocument = document;
    if (shouldRefreshDraftPreviews) {
      this.dailyPlanNormalizationPreviews = normalizationPreviews;
    }
    // Keep runtime draft ids stable while a valid, un-normalized task remains
    // in the note. Clearing the whole map here made a dashboard refresh race
    // with Start/Focus actions: the rendered draft id disappeared before the
    // action could promote it to a stable Markdown task id.
    const previewDates = new Set(normalizationPreviews.map((entry) => entry.date));
    const validDraftIds = new Set<string>();
    for (const preview of normalizationPreviews) {
      for (const edit of preview.edits) {
        const task = preview.tasks.find((candidate) => candidate.line === edit.line);
        if (!isDisplayableDailyDraftTask(edit, task)) continue;
        validDraftIds.add(
          this.dailyDraftItemId(preview.sourcePath, preview.date, edit.line, edit.before)
        );
      }
    }
    if (shouldRefreshDraftPreviews) {
      for (const [id, reference] of this.dailyDraftReferences) {
        if (previewDates.has(reference.date) && !validDraftIds.has(id)) {
          this.dailyDraftReferences.delete(id);
        }
      }
    }
    // Publish the core Daily snapshot before historical scans, linked-note
    // projection and backend timing enrichment. Those operations may inspect
    // many files and must never keep Workbench or Today Focus on a permanent
    // loading screen.
    this.dailyPlanCacheInitialized = true;
    // The plan document itself is the only blocking dependency for Today and
    // Focus. Publish it immediately; history, linked-note projection and
    // backend timing are optional enrichment and may inspect many files.
    // Waiting for them here made both surfaces appear permanently stuck on
    // large or freshly restored vaults.
    this.invalidateLegacyEinkPlaylist();
    this.scheduleRunningDailyCardRefresh();
    this.refreshDailyEditorTaskControls();
    if (notify) this.notifyUi();
    if (!document) {
      this.previousDailyUnfinished = [];
    } else if (options.refreshPreviousUnfinished !== false) {
      this.previousDailyUnfinished = await this.getPreviousDailyUnfinished(document.date);
    }
    if (options.refreshBackendTiming !== false) await this.refreshDailyBackendTimingCache(next);
    if (options.rebuildLinkedProjection !== false) await this.rebuildDailyLinkedTaskProjectionCache();
    if (wasInitialized && previousRevision && document?.revision !== previousRevision) {
      this.dailyDeviceStateVersion += 1;
      this.scheduleDailyStateSave();
    }
    this.invalidateLegacyEinkPlaylist();
    this.scheduleRunningDailyCardRefresh();
    this.refreshDailyEditorTaskControls();
    // Publish the enriched snapshot as a second, non-blocking update.
    if (notify) this.notifyUi();
    void this.runDueDailyDeviceSchedule().catch((error: unknown) => {
      console.error("ToWrite Daily one-shot schedule failed", error);
    });
  }

  private async refreshPreviousDailyUnfinishedCache(): Promise<void> {
    const document = this.dailyPlanDocument;
    if (!document) {
      if (this.previousDailyUnfinished.length === 0) return;
      this.previousDailyUnfinished = [];
      this.notifyUi();
      return;
    }
    const sourcePath = document.sourcePath;
    const date = document.date;
    const items = await this.getPreviousDailyUnfinished(date);
    // A date/source switch while the historical scan was running must not
    // publish stale carry-over work into the newly opened Daily plan.
    if (this.dailyPlanDocument?.date !== date
      || this.dailyPlanDocument.sourcePath !== sourcePath) return;
    this.previousDailyUnfinished = items;
    this.notifyUi();
  }

  /**
   * Reconciles direct Markdown checkbox edits after the existing Vault debounce
   * has fired. This never runs from the editor key handler itself.
   *
   * The currently parsed task and lineage revisions form the CAS boundary.
   * Markdown already contains the desired state, so the journal adapter makes
   * the target write idempotent while still applying an automatic pause to any
   * other running task in the same transaction.
   */
  private async synchronizeDailyMarkdownTimerState(
    document: DailyPlanDocument,
    previousItems: readonly DailyPlanItem[]
  ): Promise<boolean> {
    if (!this.settings.daily.taskTimingEnabled
      || this.dailyTimerManagedMarkdownWriteDepth > 0) {
      return false;
    }
    const sourceFile = this.app.vault.getFileByPath(document.sourcePath);
    const observedAt = new Date(sourceFile?.stat.mtime ?? Date.now()).toISOString();
    const manuallyChangedIds = changedDailyMarkdownTimerTaskIds(previousItems, document.items);
    if (manuallyChangedIds.size === 0) return false;
    const previousById = new Map(previousItems
      .filter((item) => item.sourcePath === document.sourcePath && item.date === document.date)
      .map((item) => [item.id, item]));
    if (await this.shouldUseBackendDailyWriter()) {
      return this.synchronizeBackendDailyMarkdownTimerState(
        document,
        manuallyChangedIds,
        previousById,
        observedAt
      );
    }
    if (!this.dailyTaskTimer || !this.dailyTimerCoordinator) return false;
    let reconciled = false;

    await this.withDailyTimerLock(async () => {
      for (const observed of document.items) {
        if (!manuallyChangedIds.has(observed.id)) continue;
        // A prior item can have auto-paused this one, so always resolve the
        // latest full task block instead of acting on the stale loop snapshot.
        const current = await this.dailyPlanService.get(observed.id, document.date);
        if (!current?.lineageRevision) continue;
        const timing = this.dailyTaskTimer!.core.getSnapshot(current.id, current.estimateMinutes);
        const operations = dailyMarkdownTimerOperations(current.status, timing.status);
        if (operations.length === 0) continue;
        await this.reconcileDailyMarkdownTimerOperations(current, operations, observedAt);
        reconciled = true;
      }
    });
    return reconciled;
  }

  private async synchronizeBackendDailyMarkdownTimerState(
    document: DailyPlanDocument,
    manuallyChangedIds: ReadonlySet<string>,
    previousById: ReadonlyMap<string, DailyPlanItem>,
    observedAt: string
  ): Promise<boolean> {
    let reconciled = false;
    await this.withDailyTimerLock(async () => {
      this.dailyTimerManagedMarkdownWriteDepth += 1;
      try {
        for (const observed of document.items) {
          if (!manuallyChangedIds.has(observed.id)) continue;
          const previous = previousById.get(observed.id);
          const current = await this.dailyPlanService.get(observed.id, document.date);
          if (!previous || !current?.lineageRevision
            || previous.lineageRevision !== current.lineageRevision) {
            throw new DailyPlanConflictError(
              "revision-changed",
              "The task or inherited target changed together with its checkbox; timer synchronization was refused."
            );
          }
          const before = await this.backendClient.getDailyTaskTiming(current.id, {
            taskRevision: current.revision.value,
            lineageRevision: current.lineageRevision,
            includeEvents: false
          });
          const operations = dailyMarkdownTimerOperations(current.status, before.timing.status);
          if (operations.length === 0) continue;
          if (operations.length > 1) {
            throw new DailyPlanConflictError(
              "invalid-state",
              "Changing a completed task directly to [/] requires reopening it first; use [ ] or the ToWrite controls."
            );
          }
          const operation = operations[0];
          const transitionAt = safeDailyMarkdownTransitionAt(observedAt, before.timing.lastTransitionAt);
          if (operation === "start" || operation === "resume") {
            await this.pauseBackendRunningPeerBeforeManualStart(
              current,
              [...previousById.values()],
              transitionAt
            );
          }
          const eventId = dailyMarkdownTimerEventId({
            date: current.date,
            taskId: current.id,
            operation,
            taskRevision: previous.revision.value,
            lineageRevision: current.lineageRevision,
            timingRevision: before.timing.timingRevision
          });
          const request: BackendDailyTimerTransitionRequest = {
            eventId,
            at: transitionAt,
            source: "obsidian",
            // Backend recovery verifies that applying the requested checkbox
            // action to this exact old block byte-for-byte produces `current`.
            rawBlock: previous.rawBlock ?? previous.rawLine,
            taskRevision: previous.revision.value,
            lineageRevision: current.lineageRevision,
            expectedTimingRevision: before.timing.timingRevision
          };
          const result = operation === "start"
            ? await this.backendClient.startDailyTask(current.id, request)
            : operation === "pause"
              ? await this.backendClient.pauseDailyTask(current.id, request)
              : operation === "resume"
                ? await this.backendClient.resumeDailyTask(current.id, request)
                : operation === "complete"
                  ? await this.backendClient.completeDailyTask(current.id, request)
                  : await this.backendClient.reopenDailyTask(current.id, request);
          this.rememberBackendDailyTiming(current, result.timing);
          reconciled = true;
        }
      } finally {
        this.dailyTimerManagedMarkdownWriteDepth -= 1;
      }
    });
    return reconciled;
  }

  private async pauseBackendRunningPeerBeforeManualStart(
    target: DailyPlanItem,
    candidates: readonly DailyPlanItem[],
    at: string
  ): Promise<void> {
    for (const candidate of candidates) {
      if (candidate.id === target.id) continue;
      const current = await this.dailyPlanService.get(candidate.id, candidate.date);
      if (!current?.lineageRevision) continue;
      const timing = await this.backendClient.getDailyTaskTiming(current.id, {
        taskRevision: current.revision.value,
        lineageRevision: current.lineageRevision,
        includeEvents: false
      });
      if (timing.timing.status !== "running") continue;
      const eventId = dailyMarkdownTimerEventId({
        date: current.date,
        taskId: current.id,
        operation: "pause",
        taskRevision: current.revision.value,
        lineageRevision: current.lineageRevision,
        timingRevision: timing.timing.timingRevision
      });
      const result = await this.backendClient.pauseDailyTask(current.id, {
        eventId,
        at: safeDailyMarkdownTransitionAt(at, timing.timing.lastTransitionAt),
        source: "obsidian",
        rawBlock: current.rawBlock ?? current.rawLine,
        taskRevision: current.revision.value,
        lineageRevision: current.lineageRevision,
        expectedTimingRevision: timing.timing.timingRevision
      });
      this.rememberBackendDailyTiming(current, result.timing);
    }
  }

  private rememberBackendDailyTiming(
    item: DailyPlanItem,
    timing: DailyTaskTimingSnapshot
  ): void {
    this.dailyBackendTimingCache.set(item.id, {
      taskRevision: item.revision.value,
      lineageRevision: item.lineageRevision,
      timing,
      events: [],
      fetchedAtMs: Date.now()
    });
  }

  private async reconcileDailyMarkdownTimerOperations(
    current: DailyPlanItem,
    operations: readonly DailyMarkdownTimerOperation[],
    observedAt: string
  ): Promise<void> {
    const timer = this.requireDailyTaskTimer();
    const latestLedgerMs = timer.core.getEvents().reduce(
      (latest, event) => Math.max(latest, Date.parse(event.at)),
      Number.NEGATIVE_INFINITY
    );
    const observedMs = Date.parse(observedAt);
    const transitionAt = new Date(
      Number.isFinite(latestLedgerMs) && latestLedgerMs >= observedMs
        ? latestLedgerMs + 1
        : observedMs
    ).toISOString();
    const draft = new DailyTaskTimerService(timer.core.getEvents(), {
      maxOpenSessionMs: this.settings.daily.taskTimingReviewHours * 60 * 60_000
    });
    const events: DailyTimerEvent[] = [];
    const affectedTaskIds: string[] = [];

    for (const operation of operations) {
      const timingBefore = draft.getSnapshot(current.id, current.estimateMinutes, transitionAt);
      const eventId = dailyMarkdownTimerEventId({
        date: current.date,
        taskId: current.id,
        operation,
        taskRevision: current.revision.value,
        lineageRevision: current.lineageRevision!,
        timingRevision: timingBefore.timingRevision
      });
      const options: DailyTimerTransitionOptions = {
        eventId,
        at: transitionAt,
        source: "obsidian",
        sessionId: operation === "start" || operation === "resume"
          ? `ses_markdown:${eventId}`
          : undefined
      };
      const transition = operation === "start"
        ? draft.start(current.id, options)
        : operation === "pause"
          ? draft.pause(current.id, options)
          : operation === "resume"
            ? draft.resume(current.id, options)
            : operation === "complete"
              ? draft.complete(current.id, options)
              : draft.reopen(current.id, options);
      if (transition.idempotent) continue;
      events.push(...transition.events);
      for (const affectedId of transition.affectedTaskIds) {
        if (!affectedTaskIds.includes(affectedId)) affectedTaskIds.push(affectedId);
      }
    }
    if (events.length === 0) return;

    const expected: Record<string, string> = {};
    for (const affectedId of affectedTaskIds) {
      const affected = affectedId === current.id
        ? await this.dailyPlanService.get(current.id, current.date)
        : await this.findDailyItem(affectedId);
      if (!affected?.lineageRevision) {
        if (canSkipMissingDailyTimerMarkdownTask({
          currentTaskId: current.id,
          affectedTaskId: affectedId,
          desiredStatus: desiredDailyStatusForTimerEvents(events, affectedId)
        })) continue;
        throw new DailyPlanConflictError(
          "not-found",
          `The active Daily task ${affectedId} cannot be safely coordinated with the Markdown edit.`
        );
      }
      expected[dailyTimerTaskKey(affected)] = dailyTimerExpectedRevision(affected);
    }
    const coordinator = this.dailyTimerCoordinator;
    if (!coordinator) {
      throw new DailyPlanConflictError("invalid-state", "Task timer transaction journal is unavailable.");
    }
    const entry = await coordinator.prepare(
      events,
      expected,
      dailyMarkdownTimerTransactionId(events.map((event) => event.eventId))
    );
    this.dailyTimerManagedMarkdownWriteDepth += 1;
    try {
      const result = await coordinator.execute(entry);
      if (result.status !== "committed") {
        throw new DailyPlanConflictError(
          "revision-changed",
          "Daily Markdown changed again while its checkbox state was being synchronized."
        );
      }
    } finally {
      this.dailyTimerManagedMarkdownWriteDepth -= 1;
    }
  }

  async refreshDailyDashboard(): Promise<void> {
    this.dailyBackendWriterCheckedAt = 0;
    // Daily-note location and format can change independently of the selected
    // dashboard date (for example when the core Daily Notes plugin is enabled).
    // Never reuse carry-over results resolved against an older source.
    this.historicalDailyUnfinishedCache.clear();
    const needsActivityReconfigure = !this.dailyActivityService
      || this.dailyActivityRetentionDays !== this.settings.daily.rawEventRetentionDays;
    if (needsActivityReconfigure) {
      await this.dailyActivityService?.flushMeasurements();
      const activityState = this.dailyActivityService?.getState() ?? this.savedDailyActivityState;
      this.dailyActivityService?.dispose();
      this.initializeDailyServices(activityState);
    } else {
      this.dailyPlanService = this.createDailyPlanService();
      this.dailyPlanNormalizationService = this.createDailyPlanNormalizationService();
      this.taskPoolService = this.createTaskPoolService();
      this.dailyActivityService.setCollectionPaused(
        !this.settings.daily.enabled || !this.settings.daily.activityTracking
      );
    }
    await this.initializeDailyTaskTimer();
    await this.refreshDailyPlanCache();
    this.rebuildMarkdownTaskNoteSuggestions();
  }

  private async getDailyDashboardSnapshot(value: Date | string = new Date()): Promise<DailyDashboardSnapshot> {
    const date = formatDailyInputDate(value);
    const today = formatDailyInputDate(new Date());
    if (date === today) {
      // UI consumers (Workbench and Today Focus) may request the same snapshot
      // at the same time. Reading the snapshot must not start a full projection
      // rebuild on every subscriber notification; doing so created a refresh
      // feedback loop and left one of the views indefinitely loading.
      await this.ensureDailyPlanCacheReady();
      return this.withDailyTimingSnapshots(
        this.dailyActivityService.getSnapshot(
          date,
          projectDailyTaskAggregates(this.dailyDisplayItems(date), this.dailyLinkedTaskProjections)
        )
      );
    }
    const items = this.settings.daily.enabled ? await this.dailyPlanService.list(date) : [];
    return this.withDailyTimingSnapshots(
      this.dailyActivityService.getSnapshot(date, projectDailyTaskAggregates(items))
    );
  }

  private async ensureDailyPlanCacheReady(): Promise<void> {
    if (this.dailyPlanCacheInitialized) return;
    if (!this.dailyPlanInitializationPromise) {
      this.dailyPlanInitializationPromise = this.refreshDailyPlanCache(false, {
        rebuildLinkedProjection: false,
        refreshBackendTiming: false,
        refreshPreviousUnfinished: false,
        refreshDraftPreviews: false
      }).finally(() => {
        this.dailyPlanInitializationPromise = undefined;
      });
    }
    await this.dailyPlanInitializationPromise;
    this.scheduleDailyDraftPreviewRefresh();
  }

  private scheduleDailyDraftPreviewRefresh(): void {
    if (this.dailyDraftPreviewRefreshScheduled || !this.settings.daily.enabled) return;
    this.dailyDraftPreviewRefreshScheduled = true;
    window.setTimeout(() => {
      void this.refreshDailyPlanCache(true, {
        rebuildLinkedProjection: false,
        refreshBackendTiming: false,
        refreshPreviousUnfinished: false,
        refreshDraftPreviews: true
      }).catch((error: unknown) => {
        console.error("ToWrite could not enrich the Daily draft snapshot", error);
      }).finally(() => {
        this.dailyDraftPreviewRefreshScheduled = false;
      });
    }, 0);
  }

  /**
   * Projects valid, un-normalized checkbox leaves into Today without touching
   * Markdown. The generated id is deliberately runtime-only and is resolved
   * through ensureStableDailyTask before any mutation is attempted.
   */
  private dailyDisplayItems(date: string): DailyPlanItem[] {
    const stable = this.dailyPlanItems;
    const preview = this.dailyPlanNormalizationPreviews.find((entry) => entry.date === date);
    if (!preview) return stable;
    const stableLines = new Set(stable.map((item) => item.line));
    const drafts: DailyPlanItem[] = [];
    for (const edit of preview.edits) {
      if (stableLines.has(edit.line)) continue;
      const task = preview.tasks.find((candidate) => candidate.line === edit.line);
      if (!isDisplayableDailyDraftTask(edit, task)) continue;
      // Do not include the whole-document revision in the runtime id. An
      // unrelated edit elsewhere in the Daily note must not make a rendered
      // draft disappear between the dashboard snapshot and its timing query.
      // The revision remains part of the write-time CAS boundary below.
      const id = this.dailyDraftItemId(preview.sourcePath, date, edit.line, edit.before);
      this.dailyDraftReferences.set(id, {
        date,
        sourcePath: preview.sourcePath,
        line: edit.line,
        expectedRevision: preview.expectedRevision,
        rawLine: edit.before
      });
      drafts.push({
        schemaVersion: 1,
        id,
        blockId: id,
        date,
        text: task.text,
        kind: "task",
        status: task.status,
        done: task.status === "done",
        sourcePath: preview.sourcePath,
        line: task.line,
        endLine: task.endLine,
        rawLine: task.rawLine,
        rawBlock: task.rawBlock,
        revision: {
          value: preview.expectedRevision,
          sourcePath: preview.sourcePath,
          blockId: id,
          date
        },
        parentTaskId: task.parentTaskId,
        parentTaskLine: task.parentTaskLine,
        depth: task.depth,
        scheduledDate: date,
        scheduledDateExplicit: false,
        dueDate: date,
        dueDateExplicit: false,
        devicePolicy: "none",
        priority: "normal",
        priorityExplicit: false,
        tags: [],
        linkedNotes: task.links.map((link) => link.linkText),
        primary: false,
        minimum: false,
        lineageRevision: task.lineageRevision,
        lineage: task.lineage,
        groupId: task.lineage.groups.at(-1)?.id,
        category: task.lineage.groups.at(-1)?.text,
        targetResolution: task.targetResolution,
        detachedOwnedLines: task.detachedOwnedLines,
        provisional: true,
        draftLine: task.line
      });
    }
    return [...stable, ...drafts].sort((left, right) => left.line - right.line);
  }

  private dailyDraftItemId(sourcePath: string, date: string, line: number, rawLine: string): string {
    return `draft_${shortHash(`${sourcePath}|${date}|${line}|${rawLine}`)}`;
  }

  private projectedDailyDraftItem(id: string, date?: string): DailyPlanItem | undefined {
    if (!id.startsWith("draft_")) return undefined;
    const targetDate = date
      ?? this.dailyDraftReferences.get(id)?.date
      ?? formatDailyInputDate(new Date());
    return this.dailyDisplayItems(targetDate).find((item) => item.id === id && item.provisional === true);
  }

  private async ensureStableDailyTask(
    id: string,
    revision: DailyTaskRevision,
    date: string
  ): Promise<DailyPlanItem> {
    if (!id.startsWith("draft_")) {
      const current = await this.dailyPlanService.get(id, date);
      if (!current) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
      if (current.revision.value !== revision.value) {
        throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
      }
      return current;
    }
    let draft = this.dailyDraftReferences.get(id);
    // A view may request an action after a cache refresh or workspace reload.
    // Rebuild the runtime reference from a fresh, read-only preview instead of
    // treating a valid visible draft as a missing persisted task.
    if (!draft) {
      const preview = await this.dailyPlanNormalizationService.preview(date);
      const edit = preview.edits.find((candidate) =>
        this.dailyDraftItemId(preview.sourcePath, date, candidate.line, candidate.before) === id
        && (candidate.kind === "missing-block-id" || candidate.kind === "plain-leaf")
      );
      const task = edit
        ? preview.tasks.find((candidate) => candidate.line === edit.line)
        : undefined;
      if (edit && isDisplayableDailyDraftTask(edit, task)) {
        draft = {
          date,
          sourcePath: preview.sourcePath,
          line: edit.line,
          expectedRevision: preview.expectedRevision,
          rawLine: edit.before
        };
        this.dailyDraftReferences.set(id, draft);
      }
    }
    if (!draft || draft.date !== date || draft.sourcePath !== revision.sourcePath) {
      throw new DailyPlanConflictError("revision-changed", "The draft Daily task is no longer current. Refresh and try again.");
    }
    if (revision.value !== draft.expectedRevision) {
      throw new DailyPlanConflictError("revision-changed", "The Daily task changed while it was being edited. Refresh and try again.");
    }
    const preview = await this.dailyPlanNormalizationService.preview(date);
    if (preview.expectedRevision !== draft.expectedRevision || preview.sourcePath !== draft.sourcePath) {
      throw new DailyPlanConflictError("revision-changed", "The Daily task changed while it was being edited. No id was written.");
    }
    const edit = preview.edits.find((candidate) =>
      candidate.line === draft.line
      && candidate.before === draft.rawLine
      && (candidate.kind === "missing-block-id" || candidate.kind === "plain-leaf")
    );
    if (!edit) {
      throw new DailyPlanConflictError("revision-changed", "The target task line changed. No id was written.");
    }
    await this.dailyPlanNormalizationService.normalizeTask(preview, edit.line);
    await this.refreshDailyPlanCache(false);
    const current = await this.dailyPlanService.get(edit.proposedBlockId, date);
    if (!current) throw new DailyPlanConflictError("not-found", "The materialized Daily task could not be verified.");
    this.dailyDraftReferences.delete(id);
    return current;
  }

  private withDailyTimingSnapshots(snapshot: DailyDashboardSnapshot): DailyDashboardSnapshot {
    return {
      ...snapshot,
      plan: {
        ...snapshot.plan,
        items: snapshot.plan.items.map((item) => ({
          ...item,
          timing: this.dailyTimingSnapshotForItem(item)
        }))
      }
    };
  }

  private async getDailyAnalyticsRange(from: string, to: string): Promise<DailyAnalyticsRange> {
    const dates = inclusiveDailyDates(from, to, 370);
    const days = [];
    for (const date of dates) {
      const snapshot = await this.getDailyDashboardSnapshot(date);
      days.push({
        snapshot,
        timings: Object.fromEntries(snapshot.plan.items.map((item) => [
          item.id,
          this.dailyTimingSnapshotForItem(item)
        ]))
      });
    }
    return buildDailyAnalyticsRange(
      days,
      this.dailyTaskTimer?.core.getEvents() ?? [],
      new Date()
    );
  }

  private async getDailyMonthlySummary(month: string): Promise<DailyMonthlySummary> {
    const normalized = /^\d{4}-\d{2}$/u.test(month)
      ? month
      : formatDailyInputDate(new Date()).slice(0, 7);
    const start = `${normalized}-01`;
    const first = new Date(`${start}T12:00:00`);
    const next = new Date(first);
    next.setMonth(next.getMonth() + 1, 1);
    next.setDate(next.getDate() - 1);
    const end = formatDailyInputDate(next);
    const range = await this.getDailyAnalyticsRange(start, end);
    return { ...range, month: normalized };
  }

  private async getDailyJournalDay(date: string): Promise<DailyJournalDaySnapshot> {
    const normalized = formatDailyInputDate(date);
    const range = await this.getDailyAnalyticsRange(normalized, normalized);
    const day = range.days[0];
    if (!day) throw new DailyPlanConflictError("not-found", `Daily journal date is unavailable: ${normalized}`);
    const snapshot = this.dailyTransitionJournal?.day(normalized, day) ?? {
      schemaVersion: 1 as const,
      date: normalized,
      generatedAt: new Date().toISOString(),
      planned: day.planned,
      completed: day.completed,
      completionRate: day.completionRate,
      ...(day.firstStartedAt ? { firstStartedAt: day.firstStartedAt } : {}),
      ...(day.lastCompletedAt ? { lastCompletedAt: day.lastCompletedAt } : {}),
      activeMs: day.activeMs,
      pausedMs: day.pausedMs,
      interruptions: day.interruptions,
      unfinished: Math.max(0, day.planned - day.completed),
      migratedIn: 0,
      migratedOut: 0,
      returned: 0,
      abandoned: 0,
      byCategory: range.byCategory,
      transitions: []
    };
    return { ...snapshot, byCategory: range.byCategory };
  }

  private async getDailyJournalMonth(month: string): Promise<DailyJournalMonthSnapshot> {
    const analytics = await this.getDailyMonthlySummary(month);
    if (this.dailyTransitionJournal) {
      return this.dailyTransitionJournal.month(analytics.month, analytics.days, analytics.byCategory);
    }
    const days = await Promise.all(analytics.days.map((day) => this.getDailyJournalDay(day.date)));
    return {
      schemaVersion: 1,
      month: analytics.month,
      generatedAt: new Date().toISOString(),
      days,
      totals: {
        schemaVersion: 1,
        planned: analytics.totals.planned,
        completed: analytics.totals.completed,
        completionRate: analytics.totals.completionRate,
        activeMs: analytics.totals.activeMs,
        pausedMs: analytics.totals.pausedMs,
        interruptions: analytics.totals.interruptions,
        unfinished: days.reduce((sum, day) => sum + day.unfinished, 0),
        migratedIn: 0,
        migratedOut: 0,
        returned: 0,
        abandoned: 0
      },
      byCategory: analytics.byCategory
    };
  }

  private async writeDailyJournal(date: string): Promise<DailyJournalWriteBackResult> {
    const normalized = formatDailyInputDate(date);
    const before = await this.dailyPlanService.read(normalized);
    const storage = this.createDailyPlanStorage();
    const markdown = await storage.readText(before.sourcePath) ?? "";
    const snapshot = await this.getDailyJournalDay(normalized);
    const body = renderDailyJournalMarkdown(snapshot);
    const start = "<!-- towrite-journal:start -->";
    const end = "<!-- towrite-journal:end -->";
    const replacement = `${start}\n${body}\n${end}`;
    const marker = /<!-- towrite-journal:start -->[\s\S]*?<!-- towrite-journal:end -->/u;
    const next = marker.test(markdown)
      ? markdown.replace(marker, replacement)
      : `${markdown.replace(/\s*$/u, "")}\n\n${replacement}\n`;
    if (next === markdown) {
      return { date: normalized, sourcePath: before.sourcePath, revision: before.revision, idempotent: true };
    }
    const current = await this.dailyPlanService.read(normalized);
    if (current.revision !== before.revision) {
      throw new DailyPlanConflictError("revision-changed", "The Daily note changed before its journal could be written.");
    }
    await storage.writeText(before.sourcePath, next);
    const after = await this.dailyPlanService.read(normalized);
    await this.refreshDailyPlanCache(false);
    return { date: normalized, sourcePath: before.sourcePath, revision: after.revision, idempotent: false };
  }

  private async recordDailyTransition(
    kind: DailyTaskTransitionKind,
    item: DailyPlanItem,
    options: { eventId?: string; sourceDate?: string; destinationDate?: string } = {}
  ): Promise<void> {
    if (!this.dailyTransitionJournal) return;
    const now = new Date();
    await this.dailyTransitionJournal.append({
      schemaVersion: 1,
      eventId: options.eventId?.trim() || `jrn_${randomTokenFragment()}`,
      taskId: item.id,
      kind,
      at: now.toISOString(),
      localDate: formatDailyInputDate(now),
      title: item.text.slice(0, 240),
      ...(item.category ? { category: item.category } : {}),
      ...(options.sourceDate ? { sourceDate: options.sourceDate } : {}),
      ...(options.destinationDate ? { destinationDate: options.destinationDate } : {})
    });
  }

  private async getPreviousDailyUnfinished(date: string): Promise<DailyPlanItem[]> {
    const targetDate = formatDailyInputDate(date);
    const ignored = new Set(this.dailyCarryoverIgnored[targetDate] ?? []);
    const items = (await this.collectHistoricalDailyUnfinished(targetDate))
      .filter((item) => !ignored.has(this.dailyCarryoverItemKey(item)));
    const fingerprint = this.dailyCarryoverFingerprint(items);
    return fingerprint && this.dailyCarryoverReviews[targetDate] === fingerprint ? [] : items;
  }

  private dailyCarryoverItemKey(item: DailyPlanItem): string {
    return `${item.revision.date ?? ""}:${item.id}:${item.revision.value}`;
  }

  private async collectHistoricalDailyUnfinished(
    targetDate: string,
    force = false
  ): Promise<DailyPlanItem[]> {
    const cached = this.historicalDailyUnfinishedCache.get(targetDate);
    if (!force && cached && cached.expiresAt > Date.now()) return cached.items;
    const dates: string[] = [];
    const cursor = new Date(`${targetDate}T12:00:00`);
    // Daily-note mode can cheaply skip dates with no file. Six months covers
    // long breaks without turning the review into an unbounded Vault scan.
    const maximumLookback = this.settings.daily.planSourceMode === "daily-note" ? 183 : 31;
    for (let offset = 1; offset <= maximumLookback; offset += 1) {
      cursor.setDate(cursor.getDate() - 1);
      const sourceDate = formatDailyInputDate(cursor);
      if (
        this.settings.daily.planSourceMode !== "daily-note"
        || this.app.vault.getFileByPath(this.dailyPlanService.pathForDate(sourceDate))
      ) {
        dates.push(sourceDate);
      }
    }
    const dailyItems = await Promise.all(dates.map((sourceDate) => this.dailyPlanService.list(sourceDate)));
    const items = dailyItems
      .flatMap((items, index) => unfinishedDailyLeafItems(items).map((item) => ({
        ...item,
        revision: { ...item.revision, date: dates[index] }
      })))
      .sort((left, right) => (right.revision.date ?? "").localeCompare(left.revision.date ?? "") || left.line - right.line);
    this.historicalDailyUnfinishedCache.set(targetDate, {
      expiresAt: Date.now() + 30_000,
      items
    });
    return items;
  }

  private dailyCarryoverFingerprint(items: DailyPlanItem[]): string {
    if (items.length === 0) return "";
    return shortHash(items
      .map((item) => `${item.revision.date}:${item.id}:${item.revision.value}`)
      .sort()
      .join("\n"));
  }

  private async dismissPreviousDailyUnfinished(date: string): Promise<void> {
    const targetDate = formatDailyInputDate(date);
    const fingerprint = this.dailyCarryoverFingerprint(
      await this.collectHistoricalDailyUnfinished(targetDate, true)
    );
    if (fingerprint) this.dailyCarryoverReviews[targetDate] = fingerprint;
    else delete this.dailyCarryoverReviews[targetDate];
    if (this.dailyPlanDocument?.date === targetDate) {
      this.previousDailyUnfinished = [];
    }
    await this.savePluginData();
    this.store.notify();
  }

  private async dismissPreviousDailyItem(
    date: string,
    id: string,
    revision: DailyTaskRevision
  ): Promise<void> {
    const targetDate = formatDailyInputDate(date);
    const item = (await this.collectHistoricalDailyUnfinished(targetDate, true)).find((candidate) =>
      candidate.id === id
      && candidate.revision.date === revision.date
      && candidate.revision.value === revision.value
    );
    if (!item) {
      throw new DailyPlanConflictError(
        "revision-changed",
        this.settings.language === "zh"
          ? "原日记任务在迁移列表打开后发生了变化；请按刷新后的列表重新选择。"
          : "The historical Daily task changed after the carryover review was opened. Please select it again from the refreshed list."
      );
    }
    const ignored = new Set(this.dailyCarryoverIgnored[targetDate] ?? []);
    ignored.add(this.dailyCarryoverItemKey(item));
    this.dailyCarryoverIgnored[targetDate] = [...ignored].slice(-512);
    delete this.dailyCarryoverReviews[targetDate];
    if (this.dailyPlanDocument?.date === targetDate) {
      const ignoredKey = this.dailyCarryoverItemKey(item);
      this.previousDailyUnfinished = this.previousDailyUnfinished.filter(
        (candidate) => this.dailyCarryoverItemKey(candidate) !== ignoredKey
      );
    }
    await this.savePluginData();
    this.store.notify();
  }

  private async migratePreviousDailyItems(
    date: string,
    selections: Array<{ id: string; revision: DailyTaskRevision }>
  ): Promise<DailyTaskMigration[]> {
    const targetDate = formatDailyInputDate(date);
    const historicalItems = await this.collectHistoricalDailyUnfinished(targetDate, true);
    const sourceBySelection = new Map(historicalItems.map((item) => [dailyMigrationSelectionKey(item), item]));
    const selectedIdsByDate = new Map<string, Set<string>>();
    for (const selection of selections) {
      const item = sourceBySelection.get(dailyMigrationSelectionKey(selection));
      if (!item) {
        if (this.dailyPlanDocument?.date === targetDate) {
          const ignored = new Set(this.dailyCarryoverIgnored[targetDate] ?? []);
          this.previousDailyUnfinished = historicalItems.filter(
            (candidate) => !ignored.has(this.dailyCarryoverItemKey(candidate))
          );
          this.notifyUi();
        }
        throw new DailyPlanConflictError(
          "revision-changed",
          this.settings.language === "zh"
            ? "原日记任务在迁移列表打开后发生了变化；列表已刷新，请重新选择。"
            : "The historical Daily task changed after the carryover review was opened. The list was refreshed; please select it again."
        );
      }
      const sourceDate = item.revision.date;
      if (!sourceDate) {
        throw new DailyPlanConflictError("invalid-state", "The historical Daily task has no source date.");
      }
      const ids = selectedIdsByDate.get(sourceDate) ?? new Set<string>();
      ids.add(item.id);
      selectedIdsByDate.set(sourceDate, ids);
    }
    const validated = [...selectedIdsByDate]
      .flatMap(([sourceDate, selectedIds]) => expandDailyMigrationSelections(
        historicalItems.filter((item) => item.revision.date === sourceDate),
        selectedIds
      ));
    if (validated.length === 0) {
      throw new DailyPlanConflictError(
        "invalid-state",
        this.settings.language === "zh"
          ? "所选分类下没有可迁移的未完成叶子任务。"
          : "The selected group has no unfinished leaf tasks to migrate."
      );
    }
    // Reserve the complete batch before touching any source note. Historical
    // ids are date-scoped, so two legitimate source tasks may otherwise merge
    // silently or fail only after an earlier selection has already moved.
    const destination = await this.dailyPlanService.read(targetDate);
    const destinationBlocking = destination.diagnostics.filter(
      (entry) => entry.code !== "missing-block-id"
    );
    if (destinationBlocking.length > 0) {
      throw new DailyPlanConflictError(
        "invalid-document",
        this.settings.language === "zh"
          ? `目标日记存在需要先修复的任务结构问题：${destinationBlocking[0].message}`
          : `The destination Daily note must be repaired before migration: ${destinationBlocking[0].message}`
      );
    }
    const planned = planDailyMigrationDestinations(validated, destination.items, targetDate);
    for (const { item } of planned) {
      const sourceDate = item.revision.date!;
      const current = await this.dailyPlanService.get(item.id, sourceDate);
      if (!current || current.revision.value !== item.revision.value) {
        throw new DailyPlanConflictError(
          "revision-changed",
          this.settings.language === "zh"
            ? "迁移准备期间，原日记任务发生了变化；未开始迁移，请刷新后重新选择。"
            : "A historical Daily task changed while the migration batch was being prepared. Nothing was moved; refresh and select again."
        );
      }
      await this.assertDailyLifecycleLeaf(current, sourceDate);
      if (current.taskRef) {
        const poolTask = await this.taskPoolService.get(current.taskRef);
        if (!poolTask) {
          throw new TaskPoolConflictError("not-found", `Task Pool item does not exist: ${current.taskRef}`);
        }
        this.assertCurrentTaskPoolAssignment(poolTask, current);
      }
    }

    const migrations: DailyTaskMigration[] = [];
    for (const { item, destinationId } of planned) {
      migrations.push(await this.moveDailyItemToTomorrow(
        item.id,
        item.revision,
        targetDate,
        destinationId
      ));
    }
    delete this.dailyCarryoverReviews[targetDate];
    this.historicalDailyUnfinishedCache.delete(targetDate);
    await this.savePluginData();
    return migrations;
  }

  private dailyTimingSnapshotForItem(
    item: Pick<DailyPlanItem, "id" | "estimateMinutes" | "taskRef">
  ): DailyTaskTimingSnapshot {
    const backend = item.taskRef ? undefined : this.dailyBackendTimingCache.get(item.id);
    if (backend) return projectCachedDailyTiming(
      backend.timing,
      backend.fetchedAtMs,
      item.estimateMinutes,
      this.settings.daily.taskTimingReviewHours
    );
    return this.dailyTaskTimer?.core.getSnapshot(item.id, item.estimateMinutes)
      ?? new DailyTaskTimerService().getSnapshot(item.id, item.estimateMinutes);
  }

  private scheduleRunningDailyCardRefresh(): void {
    if (this.dailyTimerDisplayRefreshTimer) {
      window.clearTimeout(this.dailyTimerDisplayRefreshTimer);
      this.dailyTimerDisplayRefreshTimer = 0;
    }
    const minutes = this.settings.daily.runningCardRefreshMinutes;
    if (!this.settings.daily.enabled
      || !this.settings.daily.taskTimingEnabled
      || minutes === 0
      || !this.dailyPlanItems.some((item) => this.dailyTimingSnapshotForItem(item).status === "running")) {
      return;
    }
    this.dailyTimerDisplayRefreshTimer = window.setTimeout(() => {
      this.dailyTimerDisplayRefreshTimer = 0;
      this.dailyDeviceStateVersion += 1;
      this.invalidateLegacyEinkPlaylist();
      this.notifyUi();
      this.queueDeviceHubSync();
      this.scheduleRunningDailyCardRefresh();
    }, minutes * 60_000);
  }

  private async refreshDailyBackendTimingCache(items: readonly DailyPlanItem[]): Promise<void> {
    if (!this.settings.daily.taskTimingEnabled || !(await this.shouldUseBackendDailyWriter())) {
      this.dailyBackendTimingCache.clear();
      return;
    }
    const backendItems = items.filter((item) => !item.taskRef);
    const liveIds = new Set(backendItems.map((item) => item.id));
    for (const id of this.dailyBackendTimingCache.keys()) {
      if (!liveIds.has(id)) this.dailyBackendTimingCache.delete(id);
    }
    await Promise.all(backendItems.map(async (item) => {
      const cached = this.dailyBackendTimingCache.get(item.id);
      if (cached
        && cached.taskRevision === item.revision.value
        && cached.lineageRevision === item.lineageRevision) {
        return;
      }
      const result = await this.backendClient.getDailyTaskTiming(item.id, {
        taskRevision: item.revision.value,
        lineageRevision: item.lineageRevision,
        includeEvents: false
      });
      this.dailyBackendTimingCache.set(item.id, {
        taskRevision: item.revision.value,
        lineageRevision: item.lineageRevision,
        timing: result.timing,
        events: [],
        fetchedAtMs: Date.now()
      });
    }));
  }

  private async previewDailyPlanNormalization(date: string): Promise<DailyPlanNormalizationPreview> {
    this.assertDailyEnabled();
    return this.dailyPlanNormalizationService.preview(date);
  }

  private async normalizeDailyPlan(
    date: string,
    preview: DailyPlanNormalizationPreview
  ): Promise<DailyPlanNormalizationResult> {
    this.assertDailyEnabled();
    if (preview.date !== date) {
      throw new DailyPlanConflictError("invalid-document", "Normalization preview date does not match.");
    }
    if (await this.shouldUseBackendDailyWriter()) {
      throw new DailyPlanConflictError(
        "invalid-state",
        "Normalization must be run by the configured DailyOps writer. Switch the Daily writer to local or upgrade Backend."
      );
    }
    const result = await this.dailyPlanNormalizationService.normalize(preview);
    await this.refreshDailyPlanCache();
    return result;
  }

  private async undoDailyPlanNormalization(token: string): Promise<DailyPlanNormalizationUndoResult> {
    const result = await this.dailyPlanNormalizationService.undo(token);
    await this.refreshDailyPlanCache();
    return result;
  }

  private async createDailyItem(input: DailyPlanCreateInput): Promise<DailyPlanItem> {
    this.assertDailyEnabled();
    if (!input.taskRef && input.category === undefined && await this.shouldUseBackendDailyWriter()) {
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
    const current = await this.dailyPlanService.get(id, value);
    if (!current) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
    if (current.revision.value !== revision.value) {
      throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
    }
    let updated: DailyPlanItem;
    if (!current.taskRef && await this.shouldUseBackendDailyWriter()) {
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
      const verified = await this.dailyPlanService.get(id, value);
      if (!verified) throw new Error("Backend updated the Daily task, but the local Markdown view could not verify it.");
      updated = verified;
    } else {
      updated = await this.dailyPlanService.update(id, revision, patch, value);
    }
    return this.syncTaskPoolFieldsFromDaily(current, updated);
  }

  private async trackPendingDailyTask(edit: DailyPlanNormalizationEdit): Promise<void> {
    try {
      const preview = this.requireCurrentDailyNormalizationEdit(edit);
      await this.dailyPlanNormalizationService.normalizeTask(preview, edit.line);
      await this.refreshDailyPlanCache();
      new Notice(this.settings.language === "zh"
        ? "已跟踪这条待办；没有添加任何可选属性。"
        : "This task is now tracked without optional properties.");
    } catch (error) {
      new Notice(messageForError(error));
    }
  }

  private refreshActiveNoteTaskCache(path = this.getActiveFile() ?? undefined): Promise<void> {
    const run = this.activeNoteTaskRefreshTail.then(() =>
      this.refreshActiveNoteTaskCacheUnlocked(path)
    );
    this.activeNoteTaskRefreshTail = run.catch(() => undefined);
    return run;
  }

  private async refreshActiveNoteTaskCacheUnlocked(path: string | undefined): Promise<void> {
    const enabled = this.settings.daily.enabled && this.settings.daily.editorTaskControls;
    if (
      !enabled
      || !path
      || this.isConfiguredDailyPlanSourcePath(path)
      || normalizePath(path) === normalizePath(this.taskPoolService.path)
      || !this.isWorkPoolTaskSourceAllowed(path)
    ) {
      this.activeNoteTaskDocument = undefined;
      this.activeNoteTaskPoolMatches.clear();
      this.refreshNoteEditorTaskControls();
      return;
    }
    const file = this.app.vault.getFileByPath(normalizePath(path));
    if (!file || file.extension.toLowerCase() !== "md") {
      if (path) this.noteTaskRelationsBySource.delete(normalizePath(path));
      this.activeNoteTaskDocument = undefined;
      this.refreshNoteEditorTaskControls();
      return;
    }
    try {
      const previousStatus = new Map(
        (this.activeNoteTaskDocument?.sourcePath === file.path
          ? this.activeNoteTaskDocument.tasks
          : []
        ).map((item) => [item.taskId, item.status] as const)
      );
      await this.refreshActiveTaskPoolCache(false);
      let inspected = await this.noteTaskService.inspect(file.path);
      if (this.getActiveFile() !== file.path) return;
      const automatic = inspected.candidates
        .filter((candidate) => candidate.status !== "done")
        .slice(0, 100);
      if (automatic.length > 0) {
        const registered = await this.noteTaskService.adoptMany(
          automatic.map((candidate) => ({
            candidate,
            patch: { poolTaskRef: candidate.proposedTaskId }
          }))
        );
        for (const item of registered) {
          try {
            await this.noteTaskPoolCoordinator.ensureRegistered(item);
          } catch (error) {
            console.error(`ToWrite could not finish automatic Task Pool registration for ${item.taskId}`, error);
          }
        }
        inspected = await this.noteTaskService.inspect(file.path);
      }
      const previouslyTrackedButLocal = inspected.tasks.filter((item) =>
        item.status !== "done" && !item.poolTaskRef
      );
      if (previouslyTrackedButLocal.length > 0) {
        for (const item of previouslyTrackedButLocal) {
          try {
            const linked = await this.noteTaskService.update(item, {
              poolTaskRef: item.taskId
            });
            await this.noteTaskPoolCoordinator.ensureRegistered(linked);
          } catch (error) {
            console.error(`ToWrite could not migrate tracked task ${item.taskId} into the Task Pool`, error);
          }
        }
        inspected = await this.noteTaskService.inspect(file.path);
      }
      await this.reconcileNoteTaskTiming(inspected.tasks);
      await this.reconcileTrackedNoteTasksWithPool(inspected.tasks);
      this.updateNoteTaskRelations(inspected);
      if (this.getActiveFile() !== file.path) return;
      for (const item of inspected.tasks) {
        if (
          item.status === "done"
          && previousStatus.has(item.taskId)
          && previousStatus.get(item.taskId) !== "done"
        ) {
          this.dailyActivityService.recordTaskCompleted(
            item.poolTaskRef ?? item.taskId,
            new Date()
          );
        }
      }
      this.activeNoteTaskDocument = inspected;
      await this.refreshActiveTaskPoolCache(false);
    } catch (error) {
      console.error("ToWrite could not inspect ordinary tasks in the active note", error);
      this.activeNoteTaskDocument = undefined;
      this.activeNoteTaskPoolMatches.clear();
    }
    this.refreshNoteEditorTaskControls();
  }

  private async refreshActiveTaskPoolCache(refreshControls = true): Promise<void> {
    try {
      this.activeTaskPoolItems = (await this.taskPoolService.read()).items;
    } catch (error) {
      console.error("ToWrite could not refresh the Task Pool search cache", error);
      this.activeTaskPoolItems = [];
    }
    this.rebuildMarkdownTaskInputSuggestionCache();
    this.rebuildActiveNoteTaskPoolMatches();
    if (refreshControls) this.refreshNoteEditorTaskControls();
  }

  private rebuildMarkdownTaskNoteSuggestions(): void {
    const allowlist = this.rebuildWorkPoolTaskSourceAllowlistCache();
    this.markdownTaskNoteSuggestions = this.app.vault.getMarkdownFiles()
      .filter((file) =>
        normalizePath(file.path) !== normalizePath(this.taskPoolService.path)
        && !this.isConfiguredDailyPlanSourcePath(file.path)
        && this.isWorkPoolTaskSourceAllowed(file.path, allowlist)
      )
      .map((file) => ({
      id: `note:${normalizePath(file.path)}`,
      kind: "note",
      label: file.basename,
      detail: `笔记 · ${file.path}`,
      replacement: `[[${file.path.replace(/\.md$/iu, "")}]]`,
      searchText: `${file.basename} ${file.path}`
      }));
    this.rebuildMarkdownTaskInputSuggestionCache(allowlist);
  }

  private markdownTaskInputSuggestions(): readonly MarkdownTaskInputSuggestion[] {
    return this.markdownTaskInputSuggestionCache;
  }

  private rebuildMarkdownTaskInputSuggestionCache(
    allowlist: readonly string[] = this.workPoolTaskSourceAllowlist()
  ): void {
    const tasks: MarkdownTaskInputSuggestion[] = this.activeTaskPoolItems
      .filter((item) => item.state !== "done" && item.state !== "dropped")
      .filter((item) => {
        const sourcePath = this.taskPoolItemSourcePath(item);
        return !sourcePath || this.isWorkPoolTaskSourceAllowed(sourcePath, allowlist);
      })
      .map((item) => ({
        id: `task:${item.taskId}`,
        kind: "task",
        label: item.text,
        detail: ["工作池待办", item.project, item.category].filter(Boolean).join(" · "),
        replacement: item.text,
        searchText: [item.text, item.project, item.category, item.target, item.source].filter(Boolean).join(" ")
      }));
    this.markdownTaskInputSuggestionCache = [...tasks, ...this.markdownTaskNoteSuggestions];
  }

  private rebuildWorkPoolTaskSourceAllowlistCache(): string[] {
    const paths = new Set(this.settings.workPool.includedSourcePaths.map(normalizePath));
    // This cache is also built while onload() is restoring the Task Pool. At
    // that point the question store exists, but the Workflow and Inbox indexes
    // are intentionally created a little later. Treat those indexes as
    // optional startup inputs; rebuildMarkdownTaskNoteSuggestions() refreshes
    // the cache again after every index has been initialized.
    const workflowIndex = this.workflowIndex as WorkflowIndex | undefined;
    const inboxIndex = this.inboxIndex as InboxIndex | undefined;
    const questionStore = this.store as OpenQuestionStore | undefined;
    const addPath = (path: string | undefined): void => {
      const normalized = path ? normalizePath(path) : "";
      if (normalized) paths.add(normalized);
    };
    if (this.settings.workPool.autoIncludeWorkflowNotes) {
      for (const file of workflowIndex?.getPayload({ compact: true }).files ?? []) addPath(file.filePath);
      for (const item of inboxIndex?.getSnapshot().items ?? []) addPath(item.filePath);
    }
    if (this.settings.workPool.autoIncludeQuestionNotes && questionStore) {
      for (const question of questionStore.query()) {
        if (question.status !== "resolved" && question.status !== "ignored") addPath(question.source.file);
      }
    }
    if (this.settings.workPool.autoIncludeDailyLinks) {
      for (const item of this.dailyEditorPlanItems) {
        addPath(item.sourcePath);
        for (const link of item.linkedNotes) {
          addPath(this.app.metadataCache.getFirstLinkpathDest(link, item.sourcePath)?.path);
        }
      }
      // Freshly typed Daily checkboxes may not have a stable ^daily_* id yet,
      // so they are present in the normalization hierarchy before they become
      // DailyPlanItems. Follow their direct and inherited note links too.
      for (const preview of this.dailyPlanNormalizationPreviews) {
        addPath(preview.sourcePath);
        for (const task of preview.tasks) {
          const targets = [
            ...task.links,
            ...task.lineage.groups.flatMap((group) => group.links),
            ...(task.targetResolution.target ? [task.targetResolution.target] : [])
          ];
          for (const target of targets) {
            addPath(target.path ?? this.app.metadataCache.getFirstLinkpathDest(
              target.linkText,
              task.sourcePath
            )?.path);
          }
        }
      }
    }
    let changed = true;
    while (changed) {
      changed = false;
      const allowedParents = [...paths];
      for (const relations of this.noteTaskRelationsBySource.values()) {
        for (const relation of relations) {
          if (!isWorkPoolSourceIncluded(relation.parentSourcePath, allowedParents)) continue;
          const child = normalizePath(relation.childNotePath);
          if (!paths.has(child)) {
            paths.add(child);
            changed = true;
          }
        }
      }
    }
    this.workPoolTaskSourceAllowlistCache = [...paths];
    this.workPoolTaskSourceAllowlistInitialized = true;
    return this.workPoolTaskSourceAllowlistCache;
  }

  private workPoolTaskSourceAllowlist(): readonly string[] {
    return this.workPoolTaskSourceAllowlistInitialized
      ? this.workPoolTaskSourceAllowlistCache
      : this.rebuildWorkPoolTaskSourceAllowlistCache();
  }

  private isWorkPoolTaskSourceAllowed(
    path: string,
    includedSourcePaths: readonly string[] = this.workPoolTaskSourceAllowlist()
  ): boolean {
    if (isWorkPoolSourceExcluded(path, this.settings.workPool.excludedSourcePaths)) return false;
    return isWorkPoolSourceIncluded(path, includedSourcePaths);
  }

  private taskPoolItemSourcePath(item: TaskPoolItem): string | undefined {
    const link = /^\[\[([^|\]#]+)(?:#[^|\]]*)?(?:\|[^\]]*)?\]\]$/u.exec(item.source?.trim() ?? "")?.[1];
    if (!link) return undefined;
    const file = this.app.metadataCache.getFirstLinkpathDest(link, this.taskPoolService.path);
    return file?.path ?? normalizePath(link.endsWith(".md") ? link : `${link}.md`);
  }

  private rebuildActiveNoteTaskPoolMatches(): void {
    const matches = new Map<string, TaskPoolItem[]>();
    for (const candidate of this.activeNoteTaskDocument?.candidates ?? []) {
      matches.set(
        noteTaskCandidateCacheKey(candidate),
        rankNoteTaskPoolMatches(candidate.taskText, this.activeTaskPoolItems)
      );
    }
    this.activeNoteTaskPoolMatches = matches;
  }

  private async reconcileTrackedNoteTasksWithPool(items: readonly TrackedNoteTask[]): Promise<void> {
    for (const item of items) {
      if (!item.poolTaskRef) continue;
      try {
        if (item.status === "done") {
          await this.noteTaskPoolCoordinator.complete(item);
        } else {
          await this.noteTaskPoolCoordinator.ensureRegistered(item);
        }
      } catch (error) {
        console.error(`ToWrite could not reconcile note task ${item.taskId} with the Task Pool`, error);
      }
    }
  }

  private async trackPendingNoteTask(candidate: NoteTaskCandidate): Promise<void> {
    try {
      await this.noteTaskService.adopt(candidate);
      await this.refreshActiveNoteTaskCache(candidate.sourcePath);
      new Notice(this.settings.language === "zh"
        ? "已跟踪这条待办；没有添加任何可选属性。"
        : "This task is now tracked without optional properties.");
    } catch (error) {
      new Notice(messageForError(error));
      await this.refreshActiveNoteTaskCache();
    }
  }

  private async addPendingNoteTaskToPool(
    candidate: NoteTaskCandidate,
    patch: NoteTaskPatch = {}
  ): Promise<void> {
    const current = this.requireCurrentNoteTaskCandidate(candidate);
    if (!current) return;
    try {
      await this.noteTaskPoolCoordinator.register(current, patch);
      await this.refreshActiveNoteTaskCache(current.sourcePath);
      new Notice(this.settings.language === "zh"
        ? "已登记到统一任务池；完成后会进入任务池的“已完成”栏。"
        : "Added to the shared Task Pool. Completion will move it to the Done lane.");
    } catch (error) {
      new Notice(messageForError(error));
      await this.refreshActiveNoteTaskCache();
    }
  }

  private async linkPendingNoteTaskToPool(
    candidate: NoteTaskCandidate,
    poolTask: TaskPoolItem
  ): Promise<void> {
    const current = this.requireCurrentNoteTaskCandidate(candidate);
    if (!current) return;
    const latestPoolTask = this.activeTaskPoolItems.find((item) =>
      item.taskId === poolTask.taskId
      && item.revision.value === poolTask.revision.value
    );
    if (!latestPoolTask) {
      new Notice(this.settings.language === "zh"
        ? "任务池条目已经变化，请等待列表刷新后再试。"
        : "The Task Pool item changed. Wait for the suggestions to refresh.");
      return;
    }
    try {
      await this.noteTaskPoolCoordinator.linkExisting(current, latestPoolTask);
      await this.refreshActiveNoteTaskCache(current.sourcePath);
      new Notice(this.settings.language === "zh"
        ? "已关联已有任务池条目，没有创建重复任务。"
        : "Linked the existing Task Pool item without creating a duplicate.");
    } catch (error) {
      new Notice(messageForError(error));
      await this.refreshActiveNoteTaskCache();
    }
  }

  private async addTrackedNoteTaskToPool(item: TrackedNoteTask): Promise<void> {
    try {
      let current = this.activeNoteTaskDocument?.tasks.find((candidate) =>
        candidate.taskId === item.taskId
        && candidate.revision === item.revision
      );
      if (!current) {
        throw new Error("这条待办已经变化，请等待刷新后再试。");
      }
      if (!current.poolTaskRef) {
        current = await this.noteTaskService.update(current, { poolTaskRef: current.taskId });
      }
      await this.noteTaskPoolCoordinator.ensureRegistered(current);
      await this.refreshActiveNoteTaskCache(current.sourcePath);
      new Notice(this.settings.language === "zh"
        ? "已加入统一任务池。"
        : "Added to the shared Task Pool.");
    } catch (error) {
      new Notice(messageForError(error));
      await this.refreshActiveNoteTaskCache();
    }
  }

  private requireCurrentNoteTaskCandidate(
    candidate: NoteTaskCandidate
  ): NoteTaskCandidate | undefined {
    const current = this.activeNoteTaskDocument?.candidates.find((entry) =>
      entry.sourcePath === candidate.sourcePath
      && entry.line === candidate.line
      && entry.before === candidate.before
      && entry.documentRevision === candidate.documentRevision
    );
    if (!current) {
      new Notice(this.settings.language === "zh"
        ? "这条待办已经变化，请等待插件刷新后再试。"
        : "This task changed. Wait for the editor to refresh and try again.");
    }
    return current;
  }

  private async enrichPendingNoteTask(candidate: NoteTaskCandidate): Promise<void> {
    const current = this.requireCurrentNoteTaskCandidate(candidate);
    if (!current) return;
    const result = await this.openDailyTaskPropertiesModal({
      taskText: candidate.taskText,
      resolvedTargetLabel: candidate.resolvedTargetLabel,
      pending: true,
      schedule: {},
      categorySuggestions: this.settings.daily.categoryPresets.map((preset) => preset.label)
    });
    if (!result) return;
    if (result.action === "track-only") {
      await this.addPendingNoteTaskToPool(candidate);
      return;
    }
    await this.addPendingNoteTaskToPool(candidate, {
      ...result.patch,
      ...result.schedulePatch
    });
  }

  private async editTrackedNoteTaskProperties(item: TrackedNoteTask): Promise<void> {
    let currentItem = item;
    const result = await this.openDailyTaskPropertiesModal({
      taskText: item.text,
      resolvedTargetLabel: item.target ?? item.sourcePath,
      pending: false,
      initial: {
        category: item.category,
        target: item.target,
        dueDate: item.dueDate ?? "",
        dueDateExplicit: Boolean(item.dueDate),
        estimateMinutes: item.estimateMinutes,
        nextStep: item.nextStep
      },
      schedule: {
        initial: {
          plannedStartAt: item.plannedStartAt,
          expectedFinishAt: item.expectedFinishAt,
          deadlineAt: initialNoteTaskDeadline(item.deadlineAt, item.dueDate)
        },
        timing: this.noteTaskTimingSnapshot(item),
        getTimingEvents: () => this.noteTaskTimingEvents(currentItem.taskId),
        ...(item.status !== "done" ? {
          onTimingAction: async (action: "start" | "pause" | "resume" | "complete") => {
            const transitioned = await this.transitionTrackedNoteTaskTiming(currentItem, action);
            currentItem = transitioned.item;
            return transitioned.timing;
          }
        } : {})
      },
      categorySuggestions: this.settings.daily.categoryPresets.map((preset) => preset.label)
    });
    if (!result || result.action !== "save") return;
    try {
      const updated = await this.noteTaskService.update(currentItem, {
        ...result.patch,
        ...result.schedulePatch
      });
      if (updated.poolTaskRef) {
        await this.noteTaskPoolCoordinator.ensureRegistered(updated);
      }
      await this.refreshActiveNoteTaskCache(currentItem.sourcePath);
      new Notice(this.settings.language === "zh" ? "待办属性已更新。" : "Task properties updated.");
    } catch (error) {
      new Notice(messageForError(error));
      await this.refreshActiveNoteTaskCache();
    }
  }

  private noteTaskTimingSnapshot(
    item: Pick<TrackedNoteTask, "taskId" | "estimateMinutes">
  ): DailyTaskTimingSnapshot {
    return this.noteTaskTimer?.core.getSnapshot(item.taskId, item.estimateMinutes)
      ?? new DailyTaskTimerService().getSnapshot(item.taskId, item.estimateMinutes);
  }

  private noteTaskTimingEvents(taskId: string): DailyTimerEvent[] {
    return this.noteTaskTimer?.core.getEvents().filter((event) => event.taskId === taskId) ?? [];
  }

  private async reconcileNoteTaskTiming(items: readonly TrackedNoteTask[]): Promise<void> {
    const timer = this.noteTaskTimer;
    if (!timer) return;
    for (const item of items) {
      const timing = timer.core.getSnapshot(item.taskId, item.estimateMinutes);
      const action = noteTaskTimingReconciliationAction(item.status, timing.status);
      if (!action) continue;
      try {
        await timer.transition((draft) => {
          const options = {
            eventId: `evt_note_reconcile_${randomTokenFragment()}`,
            source: "obsidian" as const
          };
          if (action === "reopen") return draft.reopen(item.taskId, options);
          return timing.status === "not-started"
            ? draft.startAndComplete(item.taskId, options)
            : draft.complete(item.taskId, options);
        });
      } catch (error) {
        console.error(`ToWrite could not reconcile timer state for ${item.taskId}`, error);
      }
    }
  }

  private async toggleTrackedNoteTaskTiming(item: TrackedNoteTask): Promise<void> {
    try {
      const timing = this.noteTaskTimingSnapshot(item);
      const action = timing.status === "running"
        ? "pause"
        : timing.status === "paused"
          ? "resume"
          : "start";
      await this.transitionTrackedNoteTaskTiming(item, action);
    } catch (error) {
      new Notice(messageForError(error));
    }
  }

  private async completeTrackedNoteTask(item: TrackedNoteTask): Promise<void> {
    try {
      await this.transitionTrackedNoteTaskTiming(item, "complete");
    } catch (error) {
      new Notice(messageForError(error));
    }
  }

  private async transitionTrackedNoteTaskTiming(
    item: TrackedNoteTask,
    action: "start" | "pause" | "resume" | "complete"
  ): Promise<{ item: TrackedNoteTask; timing: DailyTaskTimingSnapshot }> {
    if (!this.noteTaskTimer) throw new Error("Task timer ledger is unavailable.");
    let currentItem = item;
    const before = this.noteTaskTimingSnapshot(item);
    if (action === "complete" && item.status !== "done") {
      currentItem = await this.noteTaskService.setStatus(item, "done");
    }
    if (!(action === "complete" && before.status === "completed")) {
      await this.noteTaskTimer.transition((draft) => {
        const options = { source: "obsidian" as const };
        if (action === "start") return draft.start(item.taskId, options);
        if (action === "pause") return draft.pause(item.taskId, options);
        if (action === "resume") return draft.resume(item.taskId, options);
        return before.status === "not-started"
          ? draft.startAndComplete(item.taskId, options)
          : draft.complete(item.taskId, options);
      });
    }
    if (action === "complete") {
      this.dailyActivityService.recordTaskCompleted(
        currentItem.poolTaskRef ?? currentItem.taskId,
        new Date()
      );
      try {
        await this.noteTaskPoolCoordinator.complete(currentItem);
      } catch (error) {
        console.error("ToWrite completed the note task but could not synchronize its Task Pool state", error);
        new Notice(this.settings.language === "zh"
          ? "待办已完成，但任务池状态暂未同步；插件会在下次刷新时重试。"
          : "The task completed, but its Task Pool state will retry on the next refresh.");
      }
      await this.refreshActiveNoteTaskCache(currentItem.sourcePath);
    } else {
      this.refreshNoteEditorTaskControls();
    }
    return {
      item: currentItem,
      timing: this.noteTaskTimingSnapshot(currentItem)
    };
  }

  private async completePlannedPoolTaskFromNote(poolTask: TaskPoolItem): Promise<void> {
    if (!poolTask.plannedDate || !poolTask.assignmentId) {
      throw new TaskPoolConflictError("invalid-state", "The planned Task Pool item is missing its assignment.");
    }
    const plan = await this.dailyPlanService.read(poolTask.plannedDate);
    const assignment = plan.items.find((item) =>
      item.taskRef === poolTask.taskId
      && item.id === poolTask.assignmentId
    );
    if (!assignment) {
      throw new TaskPoolConflictError(
        "not-found",
        "The planned Daily assignment could not be found; refresh the Task Pool before completing it."
      );
    }
    await this.completeDailyItem(
      assignment.id,
      assignment.revision,
      undefined,
      poolTask.plannedDate
    );
  }

  private async enrichPendingDailyTask(edit: DailyPlanNormalizationEdit): Promise<void> {
    const preview = this.findCurrentDailyNormalizationPreview(edit);
    const hierarchyTask = preview?.tasks.find((task) =>
      task.line === edit.line
      && task.rawLine === edit.before
      && task.lineageRevision === edit.lineageRevision
    );
    if (!preview || !hierarchyTask) {
      new Notice(this.settings.language === "zh"
        ? "这条待办已经变化，请等待插件刷新后再试。"
        : "This task changed. Wait for the editor to refresh and try again.");
      return;
    }
    const result = await this.openDailyTaskPropertiesModal({
      taskText: edit.taskText,
      resolvedTargetLabel: edit.targetResolution.displayLabel,
      lineageLabel: hierarchyTask.lineage.groups.at(-1)?.text,
      pending: true,
      categorySuggestions: this.settings.daily.categoryPresets.map((preset) => preset.label)
    });
    if (!result) return;
    if (result.action === "track-only") {
      await this.trackPendingDailyTask(edit);
      return;
    }
    try {
      const currentPreview = this.requireCurrentDailyNormalizationEdit(edit);
      await this.dailyPlanNormalizationService.adoptTask(
        currentPreview,
        edit.line,
        result.patch
      );
      await this.refreshDailyPlanCache();
      new Notice(this.settings.language === "zh" ? "待办属性已保存。" : "Task properties saved.");
    } catch (error) {
      new Notice(messageForError(error));
    }
  }

  private async editDailyTaskProperties(item: DailyPlanItem): Promise<void> {
    const result = await this.openDailyTaskPropertiesModal({
      taskText: item.text,
      resolvedTargetLabel: item.targetResolution?.displayLabel ?? item.target ?? item.sourcePath,
      lineageLabel: item.lineage?.groups.at(-1)?.text,
      pending: false,
      initial: item,
      categorySuggestions: this.settings.daily.categoryPresets.map((preset) => preset.label)
    });
    if (!result || result.action !== "save") return;
    try {
      await this.updateDailyItem(item.id, item.revision, result.patch, item.date);
      await this.refreshDailyPlanCache();
      new Notice(this.settings.language === "zh" ? "待办属性已更新。" : "Task properties updated.");
    } catch (error) {
      new Notice(messageForError(error));
    }
  }

  private openDailyTaskPropertiesModal(
    options: DailyTaskPropertiesModalOptions
  ): Promise<DailyTaskPropertiesModalResult | undefined> {
    return new Promise((resolve) => {
      new DailyTaskPropertiesModal(this.app, options, resolve).open();
    });
  }

  private requireCurrentDailyNormalizationEdit(
    edit: DailyPlanNormalizationEdit
  ): DailyPlanNormalizationPreview {
    const preview = this.findCurrentDailyNormalizationPreview(edit);
    const matches = preview?.edits.filter((candidate) =>
      candidate.line === edit.line
      && candidate.before === edit.before
      && candidate.proposedBlockId === edit.proposedBlockId
      && candidate.lineageRevision === edit.lineageRevision
    ) ?? [];
    if (!preview || matches.length !== 1) {
      throw new DailyPlanConflictError(
        "revision-changed",
        "The quick task changed after the editor enrichment control was rendered."
      );
    }
    return preview;
  }

  private findCurrentDailyNormalizationPreview(
    edit: DailyPlanNormalizationEdit
  ): DailyPlanNormalizationPreview | undefined {
    return this.dailyPlanNormalizationPreviews.find((preview) =>
      preview.edits.some((candidate) =>
        candidate.line === edit.line
        && candidate.before === edit.before
        && candidate.proposedBlockId === edit.proposedBlockId
        && candidate.lineageRevision === edit.lineageRevision
      )
    );
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
    value: Date | string = new Date(),
    eventId?: string,
    source: DailyTimerEventSource = "obsidian",
    expectedTimingRevision?: string,
    expectedLineageRevision?: string
  ): Promise<DailyPlanItem> {
    this.assertDailyEnabled();
    const frozenCurrent = await this.dailyPlanService.get(id, value);
    const useBackendWriter = !frozenCurrent?.taskRef && await this.shouldUseBackendDailyWriter();
    if (!useBackendWriter) {
      const replay = await this.replayLocalDailyTimerTransition(
        id,
        eventId,
        ["start", "resume"],
        source,
        value,
        expectedLineageRevision
      );
      if (replay) return replay;
    }
    let started: DailyPlanItem;
    if (useBackendWriter) {
      const current = await this.dailyPlanService.get(id, value);
      if (!current) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
      if (expectedLineageRevision && current.lineageRevision !== expectedLineageRevision) {
        throw new DailyPlanConflictError("revision-changed", "The Daily task inherited target changed after it was loaded.");
      }
      if (current.revision.value !== revision.value && !(eventId && expectedTimingRevision)) {
        throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
      }
      const before = await this.backendClient.getDailyTaskTiming(id, {
        taskRevision: current.revision.value,
        lineageRevision: current.lineageRevision,
        includeEvents: false
      });
      if (before.timing.status === "completed") {
        throw new DailyPlanConflictError("invalid-state", "A completed Daily task must be reopened before it can continue.");
      }
      if (before.timing.status !== "running" || current.revision.value !== revision.value) {
        await this.backendClient.startDailyTask(id, this.prepareBackendDailyTransitionRequest(
          "start",
          id,
          current,
          revision.value,
          eventId,
          source,
          expectedTimingRevision ?? before.timing.timingRevision
        ));
      }
      await this.refreshDailyPlanCache();
      const verified = await this.dailyPlanService.get(id, value);
      if (!verified) throw new Error("Backend started the Daily task, but the local Markdown view could not verify it.");
      started = verified;
    } else {
      started = await this.withDailyTimerLock(async () => {
        const current = await this.requireDailyItemAtRevision(id, revision, value);
        if (expectedLineageRevision && current.lineageRevision !== expectedLineageRevision) {
          throw new DailyPlanConflictError("revision-changed", "The Daily task inherited target changed after it was loaded.");
        }
        const timing = this.dailyTimingSnapshotForItem(current);
        if (expectedTimingRevision && timing.timingRevision !== expectedTimingRevision) {
          throw new DailyPlanConflictError("revision-changed", "Task timing changed after it was loaded.");
        }
        if (timing.status === "completed") {
          throw new DailyPlanConflictError("invalid-state", "A completed Daily task must be reopened before it can continue.");
        }
        const operation = !this.settings.daily.taskTimingEnabled
          ? undefined
          : timing.status === "paused" ? "resume" : timing.status === "not-started" ? "start" : undefined;
        const options = operation
          ? this.dailyTimerTransitionOptions(eventId, source, true)
          : undefined;
        return operation && options
          ? this.executeLocalDailyTimerTransition(id, revision, value, operation, options)
          : this.dailyPlanService.start(id, revision, value);
      });
    }
    await this.refreshDailyPlanCache();
    this.queueDeviceHubSync();
    return started;
  }

  private async pauseDailyItem(
    id: string,
    revision: DailyTaskRevision,
    eventId?: string,
    value: Date | string = new Date(),
    source: DailyTimerEventSource = "obsidian",
    expectedTimingRevision?: string,
    expectedLineageRevision?: string
  ): Promise<DailyPlanItem> {
    this.assertDailyEnabled();
    const frozenCurrent = await this.dailyPlanService.get(id, value);
    const useBackendWriter = !frozenCurrent?.taskRef && await this.shouldUseBackendDailyWriter();
    if (!useBackendWriter) {
      const replay = await this.replayLocalDailyTimerTransition(
        id,
        eventId,
        ["pause"],
        source,
        value,
        expectedLineageRevision
      );
      if (replay) return replay;
    }
    if (useBackendWriter) {
      const current = await this.dailyPlanService.get(id, value);
      if (!current) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
      if (expectedLineageRevision && current.lineageRevision !== expectedLineageRevision) {
        throw new DailyPlanConflictError("revision-changed", "The Daily task inherited target changed after it was loaded.");
      }
      if (current.revision.value !== revision.value && !(eventId && expectedTimingRevision)) {
        throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
      }
      const before = await this.backendClient.getDailyTaskTiming(id, {
        taskRevision: current.revision.value,
        lineageRevision: current.lineageRevision,
        includeEvents: false
      });
      await this.backendClient.pauseDailyTask(id, this.prepareBackendDailyTransitionRequest(
        "pause",
        id,
        current,
        revision.value,
        eventId,
        source,
        expectedTimingRevision ?? before.timing.timingRevision
      ));
      await this.refreshDailyPlanCache();
      return await this.dailyPlanService.get(id, value) ?? current;
    }
    return this.withDailyTimerLock(async () => {
      const current = await this.requireDailyItemAtRevision(id, revision, value);
      if (expectedLineageRevision && current.lineageRevision !== expectedLineageRevision) {
        throw new DailyPlanConflictError("revision-changed", "The Daily task inherited target changed after it was loaded.");
      }
      const timing = this.dailyTimingSnapshotForItem(current);
      if (expectedTimingRevision && timing.timingRevision !== expectedTimingRevision) {
        throw new DailyPlanConflictError("revision-changed", "Task timing changed after it was loaded.");
      }
      if (timing.status !== "running") {
        throw new DailyPlanConflictError("invalid-state", "Only a running Daily task can be paused.");
      }
      const paused = await this.executeLocalDailyTimerTransition(
        id,
        revision,
        value,
        "pause",
        this.dailyTimerTransitionOptions(eventId, source, false)
      );
      await this.refreshDailyPlanCache();
      this.queueDeviceHubSync();
      return paused;
    });
  }

  private async resumeDailyItem(
    id: string,
    revision: DailyTaskRevision,
    eventId?: string,
    value: Date | string = new Date(),
    source: DailyTimerEventSource = "obsidian",
    expectedTimingRevision?: string,
    expectedLineageRevision?: string
  ): Promise<DailyPlanItem> {
    const frozenCurrent = await this.dailyPlanService.get(id, value);
    const useBackendWriter = !frozenCurrent?.taskRef && await this.shouldUseBackendDailyWriter();
    if (!useBackendWriter) {
      const replay = await this.replayLocalDailyTimerTransition(
        id,
        eventId,
        ["resume"],
        source,
        value,
        expectedLineageRevision
      );
      if (replay) return replay;
    } else if (eventId && expectedTimingRevision) {
      return this.startDailyItem(
        id,
        revision,
        value,
        eventId,
        source,
        expectedTimingRevision,
        expectedLineageRevision
      );
    }
    const current = await this.requireDailyItemAtRevision(id, revision, value);
    if (expectedLineageRevision && current.lineageRevision !== expectedLineageRevision) {
      throw new DailyPlanConflictError("revision-changed", "The Daily task inherited target changed after it was loaded.");
    }
    const timing = await this.getDailyItemTiming(id, formatDailyInputDate(value));
    if (expectedTimingRevision && timing.timingRevision !== expectedTimingRevision) {
      throw new DailyPlanConflictError("revision-changed", "Task timing changed after it was loaded.");
    }
    if (timing.status !== "paused") {
      throw new DailyPlanConflictError("invalid-state", "Only a paused Daily task can be resumed.");
    }
    return this.startDailyItem(
      id,
      revision,
      value,
      eventId,
      source,
      expectedTimingRevision,
      expectedLineageRevision
    );
  }

  private async getDailyItemTiming(id: string, date?: string): Promise<DailyTaskTimingSnapshot> {
    const item = await this.findDailyItem(id, date) ?? this.projectedDailyDraftItem(id, date);
    // Draft ids are runtime-only. If the author deletes a draft checkbox while
    // a view still holds the previous snapshot, returning an empty local timing
    // snapshot lets that stale frame retire quietly on the next refresh.
    if (!item && id.startsWith("draft_")) {
      return new DailyTaskTimerService().getSnapshot(id);
    }
    if (!item) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
    // Draft tasks are intentionally absent from Markdown until the author
    // performs an explicit action. They still need a harmless local timing
    // snapshot so one draft cannot fail the entire Today dashboard render.
    if (item.provisional) return this.dailyTimingSnapshotForItem(item);
    if (!item.taskRef && await this.shouldUseBackendDailyWriter()) {
      const result = await this.backendClient.getDailyTaskTiming(id, {
        taskRevision: item.revision.value,
        lineageRevision: item.lineageRevision,
        includeEvents: false
      });
      this.dailyBackendTimingCache.set(id, {
        taskRevision: item.revision.value,
        lineageRevision: item.lineageRevision,
        timing: result.timing,
        events: result.events,
        fetchedAtMs: Date.now()
      });
      return this.dailyTimingSnapshotForItem(item);
    }
    return this.dailyTimingSnapshotForItem(item);
  }

  private async correctDailyItemTiming(
    id: string,
    expectedTimingRevision: string,
    patch:
      | ({ operation: "correct"; targetEventId: string } & DailyTimerCorrectionOptions)
      | { operation: "reset"; options?: DailyTimerTransitionOptions },
    date?: string
  ): Promise<DailyTaskTimingSnapshot> {
    const item = await this.findDailyItem(id, date);
    if (!item) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
    if (!item.taskRef && await this.shouldUseBackendDailyWriter()) {
      const result = await this.backendClient.correctDailyTaskTiming(id, patch.operation === "reset"
        ? {
            eventId: patch.options?.eventId ?? `evt_reset_${randomTokenFragment()}`,
            operation: "reset",
            expectedTimingRevision,
            source: patch.options?.source ?? "obsidian",
            taskRevision: item.revision.value,
            lineageRevision: item.lineageRevision
          }
        : {
            eventId: patch.eventId ?? `evt_correct_${randomTokenFragment()}`,
            operation: "correct",
            expectedTimingRevision,
            targetEventId: patch.targetEventId,
            replacementAt: patch.replacementAt instanceof Date
              ? patch.replacementAt.toISOString()
              : patch.replacementAt,
            reason: patch.reason,
            source: patch.source ?? "obsidian",
            taskRevision: item.revision.value,
            lineageRevision: item.lineageRevision
          });
      this.dailyBackendTimingCache.set(id, {
        taskRevision: item.revision.value,
        lineageRevision: item.lineageRevision,
        timing: result.timing,
        events: result.events,
        fetchedAtMs: Date.now()
      });
      return result.timing;
    }
    return this.withDailyTimerLock(async () => {
      const timer = this.requireDailyTaskTimer();
      const before = timer.core.getSnapshot(id, item.estimateMinutes);
      if (before.timingRevision !== expectedTimingRevision) {
        throw new DailyPlanConflictError("revision-changed", "Task timing changed after it was loaded.");
      }
      if (patch.operation === "reset") {
        await timer.transition((draft) => draft.reset(id, {
          eventId: patch.options?.eventId ?? `evt_reset_${randomTokenFragment()}`,
          at: patch.options?.at ?? new Date().toISOString(),
          source: patch.options?.source ?? "obsidian"
        }));
      } else {
        await timer.transition((draft) => draft.correct(patch.targetEventId, {
          eventId: patch.eventId ?? `evt_correct_${randomTokenFragment()}`,
          at: patch.at ?? new Date().toISOString(),
          source: patch.source ?? "obsidian",
          replacementAt: patch.replacementAt,
          invalidateTarget: patch.invalidateTarget,
          reason: patch.reason
        }));
      }
      this.dailyDeviceStateVersion += 1;
      this.invalidateLegacyEinkPlaylist();
      this.notifyUi();
      this.queueDeviceHubSync();
      return timer.core.getSnapshot(id, item.estimateMinutes);
    });
  }

  private async requireDailyItemAtRevision(
    id: string,
    revision: DailyTaskRevision,
    value: Date | string
  ): Promise<DailyPlanItem> {
    const current = await this.dailyPlanService.get(id, value);
    if (!current) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
    if (current.revision.value !== revision.value) {
      throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
    }
    return current;
  }

  private async findDailyItem(id: string, date?: string): Promise<DailyPlanItem | undefined> {
    if (date) return this.dailyPlanService.get(id, date);
    for (const offset of [0, 1, -1, -2, -3, -4, -5, -6, -7]) {
      const value = new Date();
      value.setDate(value.getDate() + offset);
      const item = await this.dailyPlanService.get(id, value);
      if (item) return item;
    }
    return undefined;
  }

  private dailyTimerTransitionOptions(
    eventId: string | undefined,
    source: DailyTimerEventSource,
    createSession: boolean
  ): DailyTimerTransitionOptions {
    const stableEventId = eventId?.trim() || `evt_${randomTokenFragment()}`;
    return {
      eventId: stableEventId,
      sessionId: createSession ? `ses_${shortHash(stableEventId).slice(0, 32)}` : undefined,
      source
    };
  }

  private prepareBackendDailyTransitionRequest(
    action: "start" | "pause" | "resume" | "complete" | "reopen",
    taskId: string,
    current: DailyPlanItem,
    requestedTaskRevision: string,
    eventId: string | undefined,
    source: DailyTimerEventSource,
    expectedTimingRevision: string,
    at?: string
  ): BackendDailyTimerTransitionRequest {
    const stableEventId = eventId?.trim() || `evt_${randomTokenFragment()}`;
    const existing = this.dailyBackendTransitionRequests.get(stableEventId);
    if (existing) {
      const same = existing.action === action
        && existing.taskId === taskId
        && existing.request.source === source
        && existing.request.taskRevision === requestedTaskRevision
        && existing.request.lineageRevision === (current.lineageRevision ?? "")
        && existing.request.expectedTimingRevision === expectedTimingRevision;
      if (!same) {
        throw new DailyPlanConflictError(
          "revision-changed",
          "Backend timer event ID was already used with another frozen request."
        );
      }
      return { ...existing.request };
    }
    if (current.revision.value !== requestedTaskRevision) {
      throw new DailyPlanConflictError(
        "revision-changed",
        "The Daily task changed after it was loaded and no exact Backend replay is available."
      );
    }
    const request = {
      eventId: stableEventId,
      source,
      rawBlock: current.rawBlock ?? current.rawLine,
      taskRevision: requestedTaskRevision,
      lineageRevision: current.lineageRevision ?? "",
      expectedTimingRevision,
      ...(at ? { at } : {})
    } satisfies Required<Pick<
      BackendDailyTimerTransitionRequest,
      "eventId" | "source" | "rawBlock" | "taskRevision" | "lineageRevision" | "expectedTimingRevision"
    >>;
    this.dailyBackendTransitionRequests.set(stableEventId, {
      action,
      taskId,
      request
    });
    while (this.dailyBackendTransitionRequests.size > 500) {
      const oldest = this.dailyBackendTransitionRequests.keys().next().value;
      if (!oldest) break;
      this.dailyBackendTransitionRequests.delete(oldest);
    }
    return { ...request };
  }

  private createDailyTimerTransitionAdapter(): DailyTimerTransitionAdapter {
    return {
      predictMarkdownRevisions: async (entry) => {
        const revisions: Record<string, string> = {};
        for (const [key, expected] of Object.entries(entry.expectedMarkdownRevisions)) {
          const identity = parseDailyTimerTaskKey(key);
          const item = await this.dailyPlanService.get(identity.id, identity.date);
          if (!item?.lineageRevision) {
            throw new DailyPlanConflictError(
              "not-found",
              `Timer transaction task cannot be predicted: ${identity.id}`
            );
          }
          const before = parseDailyTimerExpectedRevision(expected);
          if (item.revision.value !== before.taskRevision
            || item.lineageRevision !== before.lineageRevision) {
            throw new DailyPlanConflictError(
              "revision-changed",
              "Daily task or inherited target changed before timer after-state prediction."
            );
          }
          const desired = desiredDailyStatusForTimerEvents(entry.events, identity.id);
          if (!desired) {
            throw new DailyPlanConflictError(
              "invalid-state",
              `Timer transaction has no Markdown state for task ${identity.id}.`
            );
          }
          const predicted = predictDailyPlanItemStatusRevision(item, desired, {
            tasksCompatibilityOutput: this.settings.daily.tasksCompatibilityOutput
          });
          revisions[key] = `${predicted.value}\u0000${item.lineageRevision}`;
        }
        return revisions;
      },
      inspectMarkdown: async (entry) => {
        let before = 0;
        let after = 0;
        for (const [key, expected] of Object.entries(entry.expectedMarkdownRevisions)) {
          const identity = parseDailyTimerTaskKey(key);
          const item = await this.dailyPlanService.get(identity.id, identity.date);
          if (!item) return "conflict";
          const expectedRevision = parseDailyTimerExpectedRevision(expected);
          if (item.lineageRevision !== expectedRevision.lineageRevision) return "conflict";
          if (item.revision.value === expectedRevision.taskRevision) {
            before += 1;
            continue;
          }
          const appliedRevision = entry.appliedMarkdownRevisions?.[key];
          const intendedAfterRevision = appliedRevision
            ?? entry.expectedAfterMarkdownRevisions?.[key];
          if (intendedAfterRevision
            && dailyTimerExpectedRevision(item) === intendedAfterRevision) {
            after += 1;
            continue;
          }
          return "conflict";
        }
        if (before > 0 && after > 0) return "conflict";
        return after > 0 ? "after" : "before";
      },
      applyMarkdown: async (entry) => {
        const affectedTaskIds = [...new Set(entry.events
          .filter((event) => event.kind !== "correct" && event.kind !== "reset")
          .map((event) => event.taskId))]
          .sort((left, right) =>
            dailyTimerMarkdownApplyOrder(desiredDailyStatusForTimerEvents(entry.events, left))
            - dailyTimerMarkdownApplyOrder(desiredDailyStatusForTimerEvents(entry.events, right))
          );
        for (const taskId of affectedTaskIds) {
          const keyed = Object.entries(entry.expectedMarkdownRevisions)
            .find(([key]) => parseDailyTimerTaskKey(key).id === taskId);
          if (!keyed) {
            if (desiredDailyStatusForTimerEvents(entry.events, taskId) === "todo") continue;
            throw new DailyPlanConflictError("not-found", `Timer transaction task is missing: ${taskId}`);
          }
          const identity = parseDailyTimerTaskKey(keyed[0]);
          const current = await this.dailyPlanService.get(identity.id, identity.date);
          if (!current) {
            throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${identity.id}`);
          }
          const expected = parseDailyTimerExpectedRevision(keyed[1]);
          if (current.revision.value !== expected.taskRevision
            || current.lineageRevision !== expected.lineageRevision) {
            throw new DailyPlanConflictError("revision-changed", "Daily task or inherited target changed during timer transition.");
          }
          const desired = desiredDailyStatusForTimerEvents(entry.events, taskId);
          if (desired === "in-progress") {
            await this.dailyPlanService.start(current.id, current.revision, identity.date);
          } else if (desired === "todo" && current.status === "done") {
            await this.dailyPlanService.reopen(current.id, current.revision, identity.date);
          } else if (desired === "todo") {
            await this.dailyPlanService.update(current.id, current.revision, { status: "todo" }, identity.date);
          } else if (desired === "done") {
            await this.dailyPlanService.complete(current.id, current.revision, identity.date);
          }
        }
      },
      captureMarkdownRevisions: async (entry) => {
        const revisions: Record<string, string> = {};
        for (const key of Object.keys(entry.expectedMarkdownRevisions)) {
          const identity = parseDailyTimerTaskKey(key);
          const item = await this.dailyPlanService.get(identity.id, identity.date);
          if (!item?.lineageRevision) {
            throw new DailyPlanConflictError(
              "not-found",
              `Timer transaction task cannot be verified after writing: ${identity.id}`
            );
          }
          revisions[key] = dailyTimerExpectedRevision(item);
        }
        return revisions;
      },
      hasTimerEvents: async (eventIds) => {
        const existing = new Set(this.requireDailyTaskTimer().core.getEvents().map((event) => event.eventId));
        return eventIds.every((eventId) => existing.has(eventId));
      },
      appendTimerEvents: async (events) => {
        await this.requireDailyTaskTimer().appendEvents(events);
      }
    };
  }

  private async replayLocalDailyTimerTransition(
    id: string,
    eventId: string | undefined,
    allowedKinds: readonly ("start" | "pause" | "resume" | "complete" | "reopen")[],
    source: DailyTimerEventSource,
    value: Date | string,
    expectedLineageRevision?: string
  ): Promise<DailyPlanItem | undefined> {
    const stableEventId = eventId?.trim();
    if (!stableEventId || !this.settings.daily.taskTimingEnabled || !this.dailyTaskTimer) {
      return undefined;
    }
    const existing = this.dailyTaskTimer.core.getEvents()
      .find((event) => event.eventId === stableEventId);
    if (!existing) return undefined;
    if (!allowedKinds.includes(existing.kind as typeof allowedKinds[number])) {
      throw new DailyPlanConflictError(
        "revision-changed",
        "Timer event ID was already used for another transition."
      );
    }
    const draft = new DailyTaskTimerService(this.dailyTaskTimer.core.getEvents(), {
      maxOpenSessionMs: this.settings.daily.taskTimingReviewHours * 60 * 60_000
    });
    const options: DailyTimerTransitionOptions = { eventId: stableEventId, source };
    const replay = existing.kind === "start"
      ? draft.start(id, options)
      : existing.kind === "pause"
        ? draft.pause(id, options)
        : existing.kind === "resume"
          ? draft.resume(id, options)
          : existing.kind === "complete"
            ? draft.complete(id, options)
            : draft.reopen(id, options);
    if (!replay.idempotent) return undefined;
    const item = await this.findDailyItem(id, formatDailyInputDate(value));
    if (!item) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
    if (expectedLineageRevision && item.lineageRevision !== expectedLineageRevision) {
      throw new DailyPlanConflictError(
        "revision-changed",
        "The Daily task inherited target changed after it was loaded."
      );
    }
    return item;
  }

  private async executeLocalDailyTimerTransition(
    id: string,
    revision: DailyTaskRevision,
    value: Date | string,
    operation: "start" | "pause" | "resume" | "complete" | "reopen" | "start-and-complete",
    options: DailyTimerTransitionOptions
  ): Promise<DailyPlanItem> {
    const current = await this.requireDailyItemAtRevision(id, revision, value);
    const timer = this.requireDailyTaskTimer();
    const draft = new DailyTaskTimerService(timer.core.getEvents(), {
      maxOpenSessionMs: this.settings.daily.taskTimingReviewHours * 60 * 60_000
    });
    const transition = operation === "start"
      ? draft.start(id, options)
      : operation === "pause"
        ? draft.pause(id, options)
        : operation === "resume"
          ? draft.resume(id, options)
          : operation === "complete"
            ? draft.complete(id, options)
            : operation === "start-and-complete"
              ? draft.startAndComplete(id, options)
              : draft.reopen(id, options);
    if (transition.idempotent) {
      const replayed = await this.dailyPlanService.get(id, value);
      if (!replayed) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
      return replayed;
    }
    const expected: Record<string, string> = {};
    for (const affectedId of transition.affectedTaskIds) {
      const affected = affectedId === current.id
        ? current
        : await this.findDailyItem(affectedId);
      if (!affected || !affected.lineageRevision) {
        if (canSkipMissingDailyTimerMarkdownTask({
          currentTaskId: current.id,
          affectedTaskId: affectedId,
          desiredStatus: desiredDailyStatusForTimerEvents(transition.events, affectedId)
        })) continue;
        throw new DailyPlanConflictError(
          "not-found",
          `The active Daily task ${affectedId} cannot be safely coordinated with this transition.`
        );
      }
      expected[dailyTimerTaskKey(affected)] = dailyTimerExpectedRevision(affected);
    }
    const coordinator = this.dailyTimerCoordinator;
    if (!coordinator) throw new DailyPlanConflictError("invalid-state", "Task timer transaction journal is unavailable.");
    const transactionId = `txn_${transition.commandEventId.replace(/[^A-Za-z0-9._:-]/gu, "_")}`;
    const entry = await coordinator.prepare(transition.events, expected, transactionId);
    const result = await (async () => {
      this.dailyTimerManagedMarkdownWriteDepth += 1;
      try {
        return await coordinator.execute(entry);
      } finally {
        this.dailyTimerManagedMarkdownWriteDepth -= 1;
      }
    })();
    if (result.status !== "committed") {
      throw new DailyPlanConflictError(
        "revision-changed",
        "Daily Markdown changed during the timer transition; the journal retained the conflict for review."
      );
    }
    const updated = await this.dailyPlanService.get(id, value);
    if (!updated) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
    return updated;
  }

  private requireDailyTaskTimer(): PersistentDailyTaskTimer {
    if (!this.settings.daily.taskTimingEnabled) {
      throw new DailyPlanConflictError("invalid-state", "Daily task timing is disabled.");
    }
    if (!this.dailyTaskTimer) {
      throw new DailyPlanConflictError(
        "invalid-state",
        this.dailyTimerLoadError
          ? `Task timer ledger is unavailable: ${this.dailyTimerLoadError}`
          : "Task timer ledger is unavailable."
      );
    }
    return this.dailyTaskTimer;
  }

  private async withDailyTimerLock<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.dailyTimerTransitionTail;
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.dailyTimerTransitionTail = previous.then(() => current);
    await previous;
    try {
      return await action();
    } finally {
      release?.();
    }
  }

  private async completeDailyItem(
    id: string,
    revision: DailyTaskRevision,
    eventId?: string,
    value: Date | string = new Date(),
    source: DailyTimerEventSource = "obsidian",
    expectedTimingRevision?: string,
    expectedLineageRevision?: string
  ): Promise<DailyPlanItem> {
    this.assertDailyEnabled();
    const frozenCurrent = await this.dailyPlanService.get(id, value);
    const useBackendWriter = !frozenCurrent?.taskRef && await this.shouldUseBackendDailyWriter();
    if (!useBackendWriter) {
      const replay = await this.replayLocalDailyTimerTransition(
        id,
        eventId,
        ["complete"],
        source,
        value,
        expectedLineageRevision
      );
      if (replay) {
        return this.syncTaskPoolCompletion(replay);
      }
    }
    let item: DailyPlanItem;
    if (useBackendWriter) {
      const current = await this.dailyPlanService.get(id, value);
      if (!current) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
      if (expectedLineageRevision && current.lineageRevision !== expectedLineageRevision) {
        throw new DailyPlanConflictError("revision-changed", "The Daily task inherited target changed after it was loaded.");
      }
      if (current.revision.value !== revision.value && !(eventId && expectedTimingRevision)) {
        throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
      }
      if (!this.settings.daily.taskTimingEnabled) {
        if (current.revision.value !== revision.value) {
          throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
        }
        await this.backendClient.setDailyTaskCompletionWithoutTiming(
          id,
          "complete",
          current.rawBlock ?? current.rawLine
        );
      } else {
        const before = await this.backendClient.getDailyTaskTiming(id, {
          taskRevision: current.revision.value,
          lineageRevision: current.lineageRevision,
          includeEvents: false
        });
        const commandEventId = eventId?.trim() || `evt_${randomTokenFragment()}`;
        const priorIdleStart = eventId?.trim()
          ? this.dailyBackendTransitionRequests.get(`${commandEventId}:start`)
          : undefined;
        const recoveringIdleCompletion = before.timing.status === "running"
          && priorIdleStart?.action === "start"
          && priorIdleStart.taskId === id;
        if (before.timing.status === "not-started") {
          const at = new Date().toISOString();
          this.dailyTimerManagedMarkdownWriteDepth += 1;
          try {
            await this.backendClient.startDailyTask(id, this.prepareBackendDailyTransitionRequest(
              "start",
              id,
              current,
              revision.value,
              `${commandEventId}:start`,
              source,
              expectedTimingRevision ?? before.timing.timingRevision,
              at
            ));
            await this.refreshDailyPlanCache();
            const started = await this.dailyPlanService.get(id, value);
            if (!started) {
              throw new DailyPlanConflictError(
                "not-found",
                "Backend started the Daily task, but its completion could not be verified."
              );
            }
            const startedTiming = await this.backendClient.getDailyTaskTiming(id, {
              taskRevision: started.revision.value,
              lineageRevision: started.lineageRevision,
              includeEvents: false
            });
            await this.backendClient.completeDailyTask(id, this.prepareBackendDailyTransitionRequest(
              "complete",
              id,
              started,
              started.revision.value,
              commandEventId,
              source,
              startedTiming.timing.timingRevision,
              at
            ));
          } finally {
            this.dailyTimerManagedMarkdownWriteDepth -= 1;
          }
        } else if (recoveringIdleCompletion) {
          // The first half of the zero-time transition may have committed
          // before the request was interrupted. Resume only when this process
          // still holds the exact frozen start request; otherwise a fresh
          // user action is required instead of guessing across a restart.
          await this.backendClient.completeDailyTask(id, this.prepareBackendDailyTransitionRequest(
            "complete",
            id,
            current,
            current.revision.value,
            commandEventId,
            source,
            before.timing.timingRevision,
            priorIdleStart.request.at
          ));
        } else {
          await this.backendClient.completeDailyTask(id, this.prepareBackendDailyTransitionRequest(
            "complete",
            id,
            current,
            revision.value,
            eventId,
            source,
            expectedTimingRevision ?? before.timing.timingRevision
          ));
        }
      }
      await this.refreshDailyPlanCache();
      item = await this.dailyPlanService.get(id, value) ?? current;
    } else {
      item = await this.withDailyTimerLock(async () => {
        const current = await this.requireDailyItemAtRevision(id, revision, value);
        if (expectedLineageRevision && current.lineageRevision !== expectedLineageRevision) {
          throw new DailyPlanConflictError("revision-changed", "The Daily task inherited target changed after it was loaded.");
        }
        const timing = this.dailyTimingSnapshotForItem(current);
        const options = !this.settings.daily.taskTimingEnabled || timing.status === "completed"
          ? undefined
          : this.dailyTimerTransitionOptions(eventId, source, timing.status === "not-started");
        return options
          ? this.executeLocalDailyTimerTransition(
            id,
            revision,
            value,
            timing.status === "not-started" ? "start-and-complete" : "complete",
            options
          )
          : this.dailyPlanService.complete(id, revision, value);
      });
    }
    this.dailyActivityService.recordTaskCompleted(item.taskRef ?? item.id, new Date(), eventId);
    return this.syncTaskPoolCompletion(item);
  }

  private async reopenDailyItem(
    id: string,
    revision: DailyTaskRevision,
    value: Date | string = new Date(),
    eventId?: string,
    source: DailyTimerEventSource = "obsidian",
    expectedTimingRevision?: string,
    expectedLineageRevision?: string
  ): Promise<DailyPlanItem> {
    this.assertDailyEnabled();
    const frozenCurrent = await this.dailyPlanService.get(id, value);
    const useBackendWriter = !frozenCurrent?.taskRef && await this.shouldUseBackendDailyWriter();
    if (!useBackendWriter) {
      const replay = await this.replayLocalDailyTimerTransition(
        id,
        eventId,
        ["reopen"],
        source,
        value,
        expectedLineageRevision
      );
      if (replay) return replay;
    }
    if (useBackendWriter) {
      const current = await this.dailyPlanService.get(id, value);
      if (!current) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
      if (expectedLineageRevision && current.lineageRevision !== expectedLineageRevision) {
        throw new DailyPlanConflictError("revision-changed", "The Daily task inherited target changed after it was loaded.");
      }
      if (current.revision.value !== revision.value && !(eventId && expectedTimingRevision)) {
        throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
      }
      const before = await this.backendClient.getDailyTaskTiming(id, {
        taskRevision: current.revision.value,
        lineageRevision: current.lineageRevision,
        includeEvents: false
      });
      const hasReplay = Boolean(
        eventId?.trim()
        && this.dailyBackendTransitionRequests.get(eventId.trim())?.action === "reopen"
      );
      if (!this.settings.daily.taskTimingEnabled || (before.timing.status !== "completed" && !hasReplay)) {
        if (current.revision.value !== revision.value) {
          throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
        }
        await this.backendClient.setDailyTaskCompletionWithoutTiming(
          id,
          "reopen",
          current.rawBlock ?? current.rawLine
        );
      } else {
        if (expectedTimingRevision
          && before.timing.timingRevision !== expectedTimingRevision
          && !hasReplay) {
          throw new DailyPlanConflictError("revision-changed", "Task timing changed after it was loaded.");
        }
        await this.backendClient.reopenDailyTask(id, this.prepareBackendDailyTransitionRequest(
          "reopen",
          id,
          current,
          revision.value,
          eventId ?? `evt_reopen_${randomTokenFragment()}`,
          source,
          expectedTimingRevision ?? before.timing.timingRevision
        ));
      }
      await this.refreshDailyPlanCache();
      const reopened = await this.dailyPlanService.get(id, value);
      if (!reopened) throw new Error("Backend reopened the Daily task, but the local Markdown view could not verify it.");
      return reopened;
    }
    return this.withDailyTimerLock(async () => {
      const current = await this.requireDailyItemAtRevision(id, revision, value);
      if (expectedLineageRevision && current.lineageRevision !== expectedLineageRevision) {
        throw new DailyPlanConflictError("revision-changed", "The Daily task inherited target changed after it was loaded.");
      }
      const timing = this.dailyTimingSnapshotForItem(current);
      if (this.settings.daily.taskTimingEnabled && timing.status === "completed") {
        return this.executeLocalDailyTimerTransition(
          id,
          revision,
          value,
          "reopen",
          this.dailyTimerTransitionOptions(eventId, source, false)
        );
      }
      return this.dailyPlanService.reopen(id, revision, value);
    });
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
    // Task Pool assignments and explicit categories are plugin-owned V2
    // extensions that the current Backend contract cannot mutate atomically.
    // Keep the complete date on one local writer instead of mixing timer
    // ledgers or silently dropping these fields.
    if (this.dailyPlanItems.some((item) => item.taskRef || item.category)) return false;
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
      const localDaily = this.resolvedDailyNoteConfiguration();
      const sourceCompatible = status.planSource === expectedPlanSource
        && (expectedPlanSource === "fixed"
          ? normalizeVaultPath(status.planDocument) === normalizeVaultPath(this.settings.daily.fixedPlanPath)
          : normalizeFolderPath(status.dailyNoteRoot) === normalizeFolderPath(localDaily.folder)
            && status.dailyNoteFormat.replace(/\.md$/iu, "") === localDaily.format.replace(/\.md$/iu, ""));
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

  private async getWorkPoolSnapshot(query: WorkPoolQuery = {}): Promise<WorkPoolSnapshot> {
    const taskPool = await this.taskPoolService.read();
    const dailyDate = formatDailyInputDate(new Date());
    const dailyHierarchy = this.settings.daily.enabled
      ? await this.dailyPlanService.readHierarchy(dailyDate)
      : undefined;
    return this.buildWorkPoolSnapshot(taskPool.items, dailyHierarchy, query);
  }

  private getCachedWorkPoolSnapshot(query: WorkPoolQuery = {}): WorkPoolSnapshot {
    const dailyDate = formatDailyInputDate(new Date());
    const preview = this.dailyPlanNormalizationPreviews.find((candidate) => candidate.date === dailyDate);
    const dailyHierarchy: DailyPlanHierarchy | undefined = preview
      ? {
          schemaVersion: 1,
          date: preview.date,
          source: preview.source,
          sourcePath: preview.sourcePath,
          groups: preview.groups,
          tasks: preview.tasks,
          diagnostics: preview.diagnostics,
          revision: preview.expectedRevision
        }
      : undefined;
    return this.buildWorkPoolSnapshot(this.activeTaskPoolItems, dailyHierarchy, query);
  }

  private buildWorkPoolSnapshot(
    tasks: readonly TaskPoolItem[],
    dailyHierarchy: DailyPlanHierarchy | undefined,
    query: WorkPoolQuery
  ): WorkPoolSnapshot {
    const taskSourceAllowlist = this.workPoolTaskSourceAllowlist();
    const dailyDate = dailyHierarchy?.date ?? formatDailyInputDate(new Date());
    return this.workPoolService.build({
      tasks,
      questions: this.store.query(),
      inboxItems: this.getInboxSnapshot().items,
      workflowFiles: this.workflowIndex.getPayload({ compact: true }).files ?? [],
      taskRelations: [
        ...this.noteTaskRelationsBySource.values(),
        ...(dailyHierarchy ? [this.dailyLinkedWorkPoolRelations(dailyHierarchy)] : [])
      ].flat(),
      dailyPlan: dailyHierarchy
        ? {
            date: dailyDate,
            sourcePath: dailyHierarchy.sourcePath,
            revision: dailyHierarchy.revision,
            tasks: dailyHierarchy.tasks
          }
        : undefined,
      classification: {
        projectFrontmatterKeys: this.settings.workPool.projectFrontmatterKeys,
        projectTagPrefixes: this.settings.workPool.projectTagPrefixes,
        projectRules: this.settings.workPool.projectRules
      },
      visibility: {
        hiddenItemIds: this.settings.workPool.hiddenItemIds,
        enforceTaskSourceAllowlist: true,
        includedTaskSourcePaths: taskSourceAllowlist,
        excludedSourcePaths: this.settings.workPool.excludedSourcePaths
      }
    }, query);
  }

  private async syncMarkdownTasksToWorkPool(): Promise<{
    filesScanned: number;
    tasksRegistered: number;
    filesFailed: number;
  }> {
    if (this.markdownTaskSyncPromise) return this.markdownTaskSyncPromise;
    const operation = this.enqueueFullVaultMaintenance(() => this.runMarkdownTaskSync());
    this.markdownTaskSyncPromise = operation;
    try {
      return await operation;
    } finally {
      if (this.markdownTaskSyncPromise === operation) this.markdownTaskSyncPromise = undefined;
    }
  }

  private async runMarkdownTaskSync(): Promise<{
    filesScanned: number;
    tasksRegistered: number;
    filesFailed: number;
  }> {
    const beforeIds = new Set((await this.taskPoolService.list()).map((item) => item.taskId));
    const taskSourceAllowlist = this.rebuildWorkPoolTaskSourceAllowlistCache();
    let filesScanned = 0;
    let filesFailed = 0;
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (
        normalizePath(file.path) === normalizePath(this.taskPoolService.path)
        || this.isConfiguredDailyPlanSourcePath(file.path)
        || !this.isWorkPoolTaskSourceAllowed(file.path, taskSourceAllowlist)
      ) {
        continue;
      }
      try {
        await this.syncMarkdownTasksForFile(file.path, new Set<string>(), taskSourceAllowlist);
        filesScanned += 1;
      } catch (error) {
        filesFailed += 1;
        console.error(`ToWrite could not sync Markdown tasks from ${file.path}`, error);
      }
      if ((filesScanned + filesFailed) % 10 === 0) await yieldToEventLoop();
    }
    const after = await this.taskPoolService.list();
    this.rebuildMarkdownTaskNoteSuggestions();
    await this.refreshActiveTaskPoolCache(false);
    await this.refreshActiveNoteTaskCache();
    await this.rebuildDailyLinkedTaskProjectionCache();
    this.notifyUi();
    return {
      filesScanned,
      filesFailed,
      tasksRegistered: after.filter((item) => !beforeIds.has(item.taskId)).length
    };
  }

  private async syncMarkdownTasksForFile(
    path: string,
    visited = new Set<string>(),
    includedSourcePaths: readonly string[] = this.workPoolTaskSourceAllowlist(),
    followRelations = true
  ): Promise<void> {
    const normalizedPath = normalizePath(path);
    if (visited.has(normalizedPath)) return;
    visited.add(normalizedPath);
    if (
      normalizePath(path) === normalizePath(this.taskPoolService.path)
      || this.isConfiguredDailyPlanSourcePath(path)
      || !this.isWorkPoolTaskSourceAllowed(path, includedSourcePaths)
    ) {
      this.noteTaskRelationsBySource.delete(normalizePath(path));
      return;
    }
    let inspected = await this.noteTaskService.inspect(path);
    const automatic = inspected.candidates
      .filter((candidate) => candidate.status !== "done")
      .slice(0, 500);
    if (automatic.length > 0) {
      const adopted = await this.noteTaskService.adoptMany(automatic.map((candidate) => ({
        candidate,
        patch: { poolTaskRef: candidate.proposedTaskId }
      })));
      for (const item of adopted) await this.noteTaskPoolCoordinator.ensureRegistered(item);
      inspected = await this.noteTaskService.inspect(path);
    }
    while (true) {
      const local = inspected.tasks.find((item) => item.status !== "done" && !item.poolTaskRef);
      if (!local) break;
      const linked = await this.noteTaskService.update(local, { poolTaskRef: local.taskId });
      await this.noteTaskPoolCoordinator.ensureRegistered(linked);
      inspected = await this.noteTaskService.inspect(path);
    }
    for (const item of inspected.tasks) {
      if (item.status === "done") await this.noteTaskPoolCoordinator.complete(item);
      else await this.noteTaskPoolCoordinator.ensureRegistered(item);
    }
    this.updateNoteTaskRelations(inspected);
    if (!followRelations) return;
    for (const relation of this.noteTaskRelationsBySource.get(normalizedPath) ?? []) {
      if (isWorkPoolSourceExcluded(relation.childNotePath, this.settings.workPool.excludedSourcePaths)) continue;
      const childAllowlist = isWorkPoolSourceIncluded(relation.childNotePath, includedSourcePaths)
        ? includedSourcePaths
        : [...includedSourcePaths, relation.childNotePath];
      await this.syncMarkdownTasksForFile(relation.childNotePath, visited, childAllowlist);
    }
  }

  private updateNoteTaskRelations(document: NoteTaskDocument): void {
    const parentSourcePath = normalizePath(document.sourcePath);
    const relations = document.relations.flatMap((relation): WorkPoolTaskRelation[] => {
      const child = this.app.metadataCache.getFirstLinkpathDest(
        relation.childLinkText,
        relation.parentSourcePath
      );
      if (!child || child.extension.toLocaleLowerCase() !== "md") return [];
      return [{
        parentTaskId: relation.parentTaskId,
        parentTaskTitle: relation.parentTaskText,
        parentSourcePath,
        childNotePath: normalizePath(child.path),
        revision: relation.revision
      }];
    });
    const unique = [...new Map(relations.map((relation) => [
      `${relation.parentTaskId}\u0000${relation.childNotePath}`,
      relation
    ])).values()];
    if (unique.length > 0) this.noteTaskRelationsBySource.set(parentSourcePath, unique);
    else this.noteTaskRelationsBySource.delete(parentSourcePath);
  }

  private dailyLinkedWorkPoolRelations(hierarchy: DailyPlanHierarchy): WorkPoolTaskRelation[] {
    return collectDailyLinkedNoteReferences(hierarchy).flatMap((reference): WorkPoolTaskRelation[] => {
      const child = this.resolveDailyLinkedNote(reference.target, reference.sourcePath);
      if (!child) return [];
      return [{
        parentTaskId: reference.parentId,
        parentTaskTitle: reference.parentTitle,
        parentSourcePath: normalizePath(reference.sourcePath),
        childNotePath: normalizePath(child.path),
        revision: reference.revision
      }];
    });
  }

  private resolveDailyLinkedNote(target: DailyMarkdownTarget, sourcePath: string): TFile | undefined {
    const direct = target.path ? this.app.vault.getFileByPath(normalizePath(target.path)) : undefined;
    if (direct instanceof TFile && direct.extension.toLocaleLowerCase() === "md") return direct;
    const resolved = this.app.metadataCache.getFirstLinkpathDest(target.linkText, sourcePath);
    return resolved?.extension.toLocaleLowerCase() === "md" ? resolved : undefined;
  }

  /**
   * Builds an editor-only projection from cached Daily hierarchy references to
   * the linked notes' canonical checkbox tasks. Nothing is copied into Daily;
   * status changes continue to write to the linked note through NoteTaskService.
   */
  private async rebuildDailyLinkedTaskProjectionCache(): Promise<void> {
    const projections: DailyLinkedTaskProjection[] = [];
    const documents = new Map<string, Promise<NoteTaskDocument>>();
    for (const preview of this.dailyPlanNormalizationPreviews) {
      const hierarchy: DailyPlanHierarchy = {
        schemaVersion: 1,
        date: preview.date,
        source: preview.source,
        sourcePath: preview.sourcePath,
        groups: preview.groups,
        tasks: preview.tasks,
        diagnostics: preview.diagnostics,
        revision: preview.expectedRevision
      };
      for (const reference of collectDailyLinkedNoteReferences(hierarchy)) {
        const target = this.resolveDailyLinkedNote(reference.target, reference.sourcePath);
        if (!target || normalizePath(target.path) === normalizePath(reference.sourcePath)) continue;
        const targetPath = normalizePath(target.path);
        let pending = documents.get(targetPath);
        if (!pending) {
          pending = this.noteTaskService.inspect(targetPath);
          documents.set(targetPath, pending);
        }
        let document = await pending;
        if (document.candidates.some((candidate) => candidate.status !== "done")
          && !isWorkPoolSourceExcluded(targetPath, this.settings.workPool.excludedSourcePaths)) {
          const adopted = await this.noteTaskService.adoptMany(
            document.candidates
              .filter((candidate) => candidate.status !== "done")
              .slice(0, 100)
              .map((candidate) => ({ candidate, patch: { poolTaskRef: candidate.proposedTaskId } }))
          );
          for (const item of adopted) await this.noteTaskPoolCoordinator.ensureRegistered(item);
          document = await this.noteTaskService.inspect(targetPath);
          documents.set(targetPath, Promise.resolve(document));
        }
        if (document.tasks.length === 0) continue;
        projections.push({
          id: reference.id,
          sourcePath: reference.sourcePath,
          line: reference.line,
          targetPath,
          targetTitle: reference.target.label || target.basename,
          relationRevision: reference.revision,
          tasks: document.tasks.slice(0, 100)
        });
      }
    }
    this.dailyLinkedTaskProjections = projections;
    this.refreshDailyEditorTaskControls();
  }

  private async toggleDailyLinkedTask(
    projection: DailyLinkedTaskProjection,
    stale: TrackedNoteTask
  ): Promise<void> {
    const currentProjection = this.dailyLinkedTaskProjections.find((candidate) =>
      candidate.id === projection.id && candidate.relationRevision === projection.relationRevision
    );
    if (!currentProjection) {
      throw new DailyPlanConflictError("revision-changed", "The linked Daily row changed. Refresh before updating its child task.");
    }
    const document = await this.noteTaskService.inspect(projection.targetPath);
    const current = document.tasks.find((task) => task.taskId === stale.taskId);
    if (!current || current.revision !== stale.revision) {
      throw new DailyPlanConflictError("revision-changed", "The linked task changed. Refresh before updating it.");
    }
    const updated = await this.noteTaskService.setStatus(
      current,
      current.status === "done" ? "todo" : "done"
    );
    if (updated.status === "done") await this.noteTaskPoolCoordinator.complete(updated);
    else await this.noteTaskPoolCoordinator.ensureRegistered(updated);
    await this.syncMarkdownTasksForFile(updated.sourcePath);
    await this.refreshActiveTaskPoolCache(false);
    await this.rebuildDailyLinkedTaskProjectionCache();
    this.notifyUi();
  }

  private async currentWorkPoolItem(item: WorkPoolItem): Promise<WorkPoolItem> {
    const current = (await this.getWorkPoolSnapshot({ history: "all" }))
      .items.find((candidate) => candidate.id === item.id);
    if (!current) {
      throw new DailyPlanConflictError("not-found", "The Work Pool source was moved or deleted.");
    }
    if (current.sourceRef.revision !== item.sourceRef.revision) {
      throw new DailyPlanConflictError(
        "revision-changed",
        "The Work Pool source changed after it was loaded. Refresh before applying the action."
      );
    }
    return current;
  }

  private async actOnWorkPoolItem(
    staleItem: WorkPoolItem,
    action: WorkPoolAction,
    options: { date?: string; stageId?: string; status?: string } = {}
  ): Promise<void> {
    const item = await this.currentWorkPoolItem(staleItem);
    if (action === "open") {
      await this.openWorkPoolItem(item);
      return;
    }
    if (item.dailyDate) {
      if (action === "add-today" && item.dailyDate === (options.date ?? formatDailyInputDate(new Date()))) {
        return;
      }
      if (action === "complete-task") {
        const daily = await this.materializeDailyWorkPoolItem(item);
        await this.completeDailyItem(daily.id, daily.revision, undefined, item.dailyDate);
        this.notifyUi();
        return;
      }
      if (action === "add-today" || action === "add-tomorrow") {
        throw new DailyPlanConflictError(
          "invalid-state",
          "This task is already scheduled by its Daily Markdown source. Move it from the Today view instead."
        );
      }
      return;
    }
    if (action === "add-today" || action === "add-tomorrow") {
      const date = options.date ?? (() => {
        const value = new Date();
        if (action === "add-tomorrow") value.setDate(value.getDate() + 1);
        return formatDailyInputDate(value);
      })();
      await this.addWorkPoolItemToDate(item, date);
      return;
    }
    if (item.kind === "task" && item.taskId && item.taskRevision) {
      if (action === "complete-task") {
        await this.completeWorkPoolTask(item);
      } else if (action === "reopen-task") {
        await this.reopenWorkPoolTask(item);
      } else if (action === "return-task") {
        const task = await this.requirePoolTask(item);
        if (task.state === "planned" && task.plannedDate && task.assignmentId) {
          const daily = await this.dailyPlanService.get(task.assignmentId, task.plannedDate);
          if (!daily) throw new TaskPoolConflictError("not-found", "The planned Daily assignment no longer exists.");
          await this.returnDailyItemToPool(daily.id, daily.revision);
        }
      } else if (action === "drop-task") {
        const task = await this.requirePoolTask(item);
        if (task.state === "planned" && task.plannedDate && task.assignmentId) {
          const daily = await this.dailyPlanService.get(task.assignmentId, task.plannedDate);
          if (!daily) throw new TaskPoolConflictError("not-found", "The planned Daily assignment no longer exists.");
          await this.dropDailyItem(daily.id, daily.revision);
        } else {
          await this.taskPoolService.drop(task.taskId, task.revision);
        }
      }
      this.notifyUi();
      return;
    }
    if (item.kind === "question" && item.questionId) {
      if (action === "resolve-question") {
        await this.updateQuestionFromUi(item.questionId, { status: "resolved" });
      } else if (action === "reopen-question") {
        await this.updateQuestionFromUi(item.questionId, { status: "open" });
      } else if (action === "move-to-think") {
        await this.updateQuestionFromUi(item.questionId, { lane: "think" });
      } else if (action === "move-to-write") {
        await this.updateQuestionFromUi(item.questionId, { lane: "write" });
      } else if (action === "change-question-status" && options.status) {
        const allowed = this.settings.statusOptions.some((status) => status.id === options.status);
        if (!allowed) throw new DailyPlanConflictError("invalid-state", "Select a configured question status.");
        await this.updateQuestionFromUi(item.questionId, { status: options.status });
      }
      this.notifyUi();
      return;
    }
    if (item.kind === "note" && action === "change-stage" && options.stageId) {
      await this.updateWorkPoolNoteStage(item, options.stageId);
      this.notifyUi();
    }
  }

  private async requirePoolTask(item: WorkPoolItem): Promise<TaskPoolItem> {
    const task = item.taskId ? await this.taskPoolService.get(item.taskId) : undefined;
    if (!task) throw new TaskPoolConflictError("not-found", "The Task Pool source no longer exists.");
    if (task.revision.value !== item.sourceRef.revision) {
      throw new TaskPoolConflictError("revision-changed", "The Task Pool item changed after it was loaded.");
    }
    return task;
  }

  private async sourceNoteTaskForPoolTask(task: TaskPoolItem): Promise<TrackedNoteTask | undefined> {
    const match = /^\[\[([^|\]#]+)(?:\.md)?#\^(task_[A-Za-z0-9_-]+)(?:\|[^\]]*)?\]\]$/u.exec(task.source?.trim() ?? "");
    if (!match) return undefined;
    const sourcePath = normalizePath(match[1].endsWith(".md") ? match[1] : `${match[1]}.md`);
    const document = await this.noteTaskService.inspect(sourcePath);
    const matches = document.tasks.filter((candidate) => candidate.taskId === match[2]);
    if (matches.length !== 1) {
      throw new TaskPoolConflictError(
        "revision-changed",
        "The source checkbox was moved, removed, or duplicated. Refresh before changing it."
      );
    }
    const source = matches[0];
    if (source.poolTaskRef !== task.taskId || source.text !== task.text) {
      throw new TaskPoolConflictError(
        "revision-changed",
        "The source checkbox changed before the Work Pool action was applied."
      );
    }
    return source;
  }

  private async completeWorkPoolTask(item: WorkPoolItem): Promise<void> {
    const task = await this.requirePoolTask(item);
    const source = await this.sourceNoteTaskForPoolTask(task);
    const completedSource = source && source.status !== "done"
      ? await this.noteTaskService.setStatus(source, "done")
      : source;
    if (task.state === "planned") {
      await this.completePlannedPoolTaskFromNote(task);
    } else if (completedSource) {
      await this.noteTaskPoolCoordinator.complete(completedSource);
    } else {
      await this.taskPoolService.complete(task.taskId, task.revision);
    }
    if (completedSource) await this.syncMarkdownTasksForFile(completedSource.sourcePath);
  }

  private async reopenWorkPoolTask(item: WorkPoolItem): Promise<void> {
    const task = await this.requirePoolTask(item);
    const source = await this.sourceNoteTaskForPoolTask(task);
    if (source && source.status === "done") {
      const reopenedSource = await this.noteTaskService.setStatus(source, "todo");
      await this.noteTaskPoolCoordinator.ensureRegistered(reopenedSource);
      await this.syncMarkdownTasksForFile(reopenedSource.sourcePath);
      return;
    }
    await this.taskPoolService.reopen(task.taskId, task.revision);
  }

  private async materializeDailyWorkPoolItem(item: WorkPoolItem): Promise<DailyPlanItem> {
    if (!item.dailyDate) {
      throw new DailyPlanConflictError("invalid-state", "The Work Pool item is not a Daily task.");
    }
    if (item.dailyBlockId) {
      const current = await this.dailyPlanService.get(item.dailyBlockId, item.dailyDate);
      if (!current) throw new DailyPlanConflictError("not-found", "The Daily task no longer exists.");
      return current;
    }
    if (!item.dailyProvisional || !item.dailyLine) {
      throw new DailyPlanConflictError("invalid-state", "Normalize this Daily task before changing its state.");
    }
    const preview = await this.dailyPlanNormalizationService.preview(item.dailyDate);
    const edit = preview.edits.find((candidate) => candidate.line === item.dailyLine);
    if (!edit) {
      throw new DailyPlanConflictError(
        "revision-changed",
        "The Daily task changed after the Work Pool was loaded. Refresh and try again."
      );
    }
    await this.dailyPlanNormalizationService.normalizeTask(preview, edit.line);
    await this.refreshDailyPlanCache();
    const current = await this.dailyPlanService.get(edit.proposedBlockId, item.dailyDate);
    if (!current) throw new DailyPlanConflictError("not-found", "The normalized Daily task could not be verified.");
    return current;
  }

  private async openWorkPoolItem(item: WorkPoolItem): Promise<void> {
    if (item.kind === "question" && item.questionId) {
      await this.jumpToQuestion(item.questionId);
      return;
    }
    if (item.kind === "note" && item.notePath) {
      await this.openFile(item.notePath);
      return;
    }
    const link = /^\[\[([^\]]+)\]\]$/u.exec(item.target?.trim() ?? "")?.[1];
    if (link) {
      await this.openObsidianLink(link, this.taskPoolService.path);
      return;
    }
    if (item.notePath) {
      await this.openFile(item.notePath);
      return;
    }
    await this.openTaskPoolSource();
  }

  private async addWorkPoolItemToDate(item: WorkPoolItem, date: string): Promise<void> {
    if (item.kind === "task" && item.taskId && item.taskRevision) {
      await this.assignTaskPoolItemToDate(item.taskId, item.taskRevision, date);
      return;
    }
    const current = await this.dailyPlanService.read(date);
    if (current.items.some((candidate) =>
      candidate.workKind === (item.kind === "question" ? "question" : item.inbox ? "inbox" : "note")
      && candidate.workRef === item.sourceRef.id
      && candidate.status !== "done"
    )) return;
    await this.createDailyItem({
      date,
      text: item.title,
      kind: "edit_note",
      category: item.category ?? item.stageTitle ?? item.typeTitle,
      target: item.target,
      workKind: item.kind === "question" ? "question" : item.inbox ? "inbox" : "note",
      workRef: item.sourceRef.id,
      workRevision: item.sourceRef.revision,
      devicePolicy: "rotation"
    });
  }

  private async updateWorkPoolNoteStage(item: WorkPoolItem, stageId: string): Promise<void> {
    const stage = this.settings.workflowStages.stages.find((candidate) =>
      normalizeWorkflowStageId(candidate.id) === normalizeWorkflowStageId(stageId)
    );
    if (!stage || !item.notePath) {
      throw new DailyPlanConflictError("invalid-state", "Select a configured Workflow stage.");
    }
    const file = this.app.vault.getFileByPath(item.notePath);
    if (!file) throw new DailyPlanConflictError("not-found", "The Workflow note no longer exists.");
    await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
      const explicit = readExplicitWorkflowStage(frontmatter);
      if (
        explicit
        && item.stageId
        && normalizeWorkflowStageId(explicit) !== normalizeWorkflowStageId(item.stageId)
      ) {
        throw new DailyPlanConflictError(
          "revision-changed",
          "The note Workflow stage changed after it was loaded."
        );
      }
      frontmatter[WORKFLOW_STAGE_PROPERTY] = stage.id;
    });
    this.pendingWorkflowPaths.add(file.path);
    await this.workflowIndex.upsert(file);
    this.inboxIndex.upsert(file);
    this.queueDeviceHubSync();
  }

  private async completeDailyItemAndApplyOrigin(
    id: string,
    revision: DailyTaskRevision,
    stageId?: string
  ): Promise<void> {
    const date = await this.dateForDailyItem(id, revision);
    const item = await this.dailyPlanService.get(id, date);
    if (!item || item.revision.value !== revision.value) {
      throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
    }
    if (!item.workKind || !item.workRef || !item.workRevision) {
      await this.completeDailyItem(id, revision, undefined, date);
      return;
    }
    const source = (await this.getWorkPoolSnapshot({ history: "all" })).items.find((candidate) =>
      candidate.sourceRef.id === item.workRef
      && candidate.sourceRef.kind === (item.workKind === "question" ? "question" : "note")
    );
    if (!source || source.sourceRef.revision !== item.workRevision) {
      throw new DailyPlanConflictError(
        "revision-changed",
        "The linked Work Pool source changed. Refresh before completing both objects."
      );
    }
    if (item.workKind === "question" && source.questionId) {
      const priorStatus = source.questionStatus ?? "open";
      await this.updateQuestionFromUi(source.questionId, { status: "resolved" });
      try {
        await this.completeDailyItem(id, revision, undefined, date);
      } catch (error) {
        await this.updateQuestionFromUi(source.questionId, { status: priorStatus }).catch((rollbackError) => {
          console.error("ToWrite could not roll back a Work Pool question transition", rollbackError);
        });
        throw error;
      }
      return;
    } else {
      if (!stageId) throw new DailyPlanConflictError("invalid-state", "Choose the Workflow stage to apply.");
      const noteFile = source.notePath ? this.app.vault.getFileByPath(source.notePath) : undefined;
      const previousExplicitStage = noteFile
        ? readExplicitWorkflowStage(this.app.metadataCache.getFileCache(noteFile)?.frontmatter)
        : undefined;
      await this.updateWorkPoolNoteStage(source, stageId);
      try {
        await this.completeDailyItem(id, revision, undefined, date);
      } catch (error) {
        if (noteFile) {
          await this.app.fileManager.processFrontMatter(noteFile, (frontmatter: Record<string, unknown>) => {
            if (previousExplicitStage) frontmatter[WORKFLOW_STAGE_PROPERTY] = previousExplicitStage;
            else delete frontmatter[WORKFLOW_STAGE_PROPERTY];
          }).catch((rollbackError) => {
            console.error("ToWrite could not roll back a Work Pool stage transition", rollbackError);
          });
          await this.workflowIndex.upsert(noteFile);
          this.inboxIndex.upsert(noteFile);
        }
        throw error;
      }
      return;
    }
  }

  private createDailyDashboardAdapter(): DailyDashboardAdapter {
    return {
      getSnapshot: (date) => this.getDailyDashboardSnapshot(date ?? new Date()),
      getConfiguration: () => ({
        categoryPresets: this.settings.daily.categoryPresets.map((preset) => ({ ...preset })),
        defaultView: this.settings.daily.dashboardDefaultView,
        focusMessages: [...this.settings.daily.focusMessages],
        focusMessageIntervalSeconds: this.settings.daily.focusMessageIntervalSeconds,
        taskPoolPath: this.settings.daily.taskPoolPath,
        autoReturnUnfinished: this.settings.daily.autoReturnUnfinished,
        workflowStages: this.settings.workflowStages.stages.map((stage) => ({
          id: stage.id,
          label: stage.title
        })),
        articleTypes: this.settings.articleTypes.types.map((type) => ({
          id: type.id,
          label: type.title
        })),
        questionStatuses: this.settings.statusOptions.map((status) => ({
          id: status.id,
          label: status.label
        })),
        deviceBatteryPercent: this.lastLocalDeviceBatteryPercent,
        dailyNoteIntegration: (() => {
          const daily = this.resolvedDailyNoteConfiguration();
          return {
            source: daily.source,
            corePluginEnabled: daily.enabled,
            folder: daily.folder,
            format: daily.format,
            template: daily.template,
            templateExists: daily.templateExists
          };
        })(),
        workPool: {
          ...this.settings.workPool,
          views: this.settings.workPool.views.map((view) => ({ ...view })),
          projectFrontmatterKeys: [...this.settings.workPool.projectFrontmatterKeys],
          projectTagPrefixes: [...this.settings.workPool.projectTagPrefixes],
          projectRules: this.settings.workPool.projectRules.map((rule) => ({
            ...rule,
            tags: [...rule.tags],
            folderPrefixes: [...rule.folderPrefixes]
          })),
          projectAppearances: this.settings.workPool.projectAppearances.map((appearance) => ({
            ...appearance
          })),
          hiddenItemIds: [...this.settings.workPool.hiddenItemIds],
          includedSourcePaths: [...this.settings.workPool.includedSourcePaths],
          excludedSourcePaths: [...this.settings.workPool.excludedSourcePaths]
        }
      }),
      getTaskPool: () => this.taskPoolService.read(),
      // Views consume the already-restored caches so reopening a Work Pool tab
      // never performs Vault reads while Obsidian is restoring its layout.
      getWorkPool: async (query) => this.getCachedWorkPoolSnapshot(query),
      actOnWorkPoolItem: async (item, action, options) => {
        await this.actOnWorkPoolItem(item, action, options);
      },
      createPoolTask: async (input) => this.taskPoolService.create(input),
      syncMarkdownTasks: () => this.syncMarkdownTasksToWorkPool(),
      updateWorkPoolSettings: async (patch) => {
        this.settings.workPool = normalizeWorkPoolSettings({
          ...this.settings.workPool,
          ...patch
        });
        await this.savePluginData();
        this.refreshTaskPoolTechnicalMetadata();
        this.notifyUi();
      },
      updatePoolTask: async (id, revision, patch) => this.taskPoolService.update(id, revision, patch),
      assignPoolTask: async (id, revision, date) => {
        await this.assignTaskPoolItemToDate(id, revision, date);
      },
      returnItemToPool: async (id, revision) => {
        const date = revision.date ?? await this.dateForDailyItem(id, revision);
        const current = await this.ensureStableDailyTask(id, revision, date);
        await this.returnDailyItemToPool(current.id, current.revision);
      },
      moveItemToTomorrow: async (id, revision) => {
        const date = revision.date ?? await this.dateForDailyItem(id, revision);
        const current = await this.ensureStableDailyTask(id, revision, date);
        await this.moveDailyItemToTomorrow(current.id, current.revision);
      },
      getPreviousUnfinished: async (date) => {
        const normalizedDate = formatDailyInputDate(date);
        if (this.dailyPlanDocument?.date === normalizedDate) {
          return this.previousDailyUnfinished;
        }
        return this.getPreviousDailyUnfinished(normalizedDate);
      },
      migratePreviousItems: async (date, selections) => {
        await this.migratePreviousDailyItems(formatDailyInputDate(date), selections);
      },
      dismissPreviousItems: async (date) => {
        await this.dismissPreviousDailyUnfinished(formatDailyInputDate(date));
      },
      dismissPreviousItem: async (date, id, revision) => {
        await this.dismissPreviousDailyItem(formatDailyInputDate(date), id, revision);
      },
      dropDailyItem: async (id, revision) => {
        const date = revision.date ?? await this.dateForDailyItem(id, revision);
        const current = await this.ensureStableDailyTask(id, revision, date);
        await this.dropDailyItem(current.id, current.revision);
      },
      getPlanHierarchy: (date) => this.dailyPlanService.readHierarchy(date),
      getNormalizationPreview: (date) => this.previewDailyPlanNormalization(date),
      normalizePlan: (preview) => this.normalizeDailyPlan(preview.date, preview),
      undoNormalization: (token) => this.undoDailyPlanNormalization(token),
      getPlanMetadata: async (date) => {
        const document = await this.dailyPlanService.read(date);
        return {
          ...document.metadata,
          sourcePath: document.sourcePath,
          sourceKind: document.source.kind,
          sourceExists: this.app.vault.getAbstractFileByPath(normalizePath(document.sourcePath)) instanceof TFile,
          diagnostics: document.diagnostics.map((diagnostic) => diagnostic.message),
          revision: document.revision
        };
      },
      ensurePlanSource: async (date) => {
        const current = await this.dailyPlanService.read(date);
        await this.dailyPlanService.updateMetadata(
          { theme: current.metadata.theme ?? null },
          current.revision,
          date
        );
        await this.refreshDailyPlanCache();
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
      createItem: async (input) => {
        const created = await this.createDailyItem(input);
        await this.recordDailyTransition("schedule", created);
      },
      updateItem: async (id, revision, patch) => {
        const date = revision.date ?? await this.dateForDailyItem(id, revision);
        const current = await this.ensureStableDailyTask(id, revision, date);
        await this.updateDailyItem(current.id, current.revision, patch, date);
      },
      moveItem: async (id, revision, direction) => {
        const date = revision.date ?? await this.dateForDailyItem(id, revision);
        const current = await this.ensureStableDailyTask(id, revision, date);
        if (!current.taskRef && await this.shouldUseBackendDailyWriter()) {
          await this.backendClient.moveDailyTask(
            current.id,
            current.rawBlock ?? current.rawLine,
            direction
          );
        } else {
          await this.dailyPlanService.move(current.id, current.revision, direction, date);
        }
        await this.refreshDailyPlanCache();
      },
      startItem: async (id, revision) => {
        const date = revision.date ?? await this.dateForDailyItem(id, revision);
        const current = await this.ensureStableDailyTask(id, revision, date);
        const started = await this.startDailyItem(current.id, current.revision, date);
        await this.recordDailyTransition("start", started);
      },
      pauseItem: async (id, revision, timingRevision) => {
        const date = revision.date ?? await this.dateForDailyItem(id, revision);
        const current = await this.ensureStableDailyTask(id, revision, date);
        const paused = await this.pauseDailyItem(current.id, current.revision, undefined, date, "obsidian", timingRevision);
        await this.recordDailyTransition("pause", paused);
      },
      resumeItem: async (id, revision, timingRevision) => {
        const date = revision.date ?? await this.dateForDailyItem(id, revision);
        const current = await this.ensureStableDailyTask(id, revision, date);
        const resumed = await this.resumeDailyItem(current.id, current.revision, undefined, date, "obsidian", timingRevision);
        await this.recordDailyTransition("resume", resumed);
      },
      completeItem: async (id, revision) => {
        const date = revision.date ?? await this.dateForDailyItem(id, revision);
        const current = await this.ensureStableDailyTask(id, revision, date);
        const completed = await this.completeDailyItem(current.id, current.revision, undefined, date);
        await this.recordDailyTransition("complete", completed);
      },
      completeItemAndApplyOrigin: async (id, revision, options) => {
        const date = revision.date ?? await this.dateForDailyItem(id, revision);
        const current = await this.ensureStableDailyTask(id, revision, date);
        await this.completeDailyItemAndApplyOrigin(current.id, current.revision, options?.stageId);
        const completed = await this.dailyPlanService.get(current.id, date) ?? current;
        await this.recordDailyTransition("complete", completed);
      },
      reopenItem: async (id, revision) => {
        const reopened = await this.reopenDailyItem(id, revision, await this.dateForDailyItem(id, revision));
        await this.syncTaskPoolReopen(reopened);
        await this.recordDailyTransition("reopen", reopened);
      },
      getItemTiming: (id, _estimateMinutes, date) => this.getDailyItemTiming(id, date),
      getAnalyticsRange: (from, to) => this.getDailyAnalyticsRange(from, to),
      getMonthlySummary: (month) => this.getDailyMonthlySummary(month),
      getJournalDay: (date) => this.getDailyJournalDay(date),
      getJournalMonth: (month) => this.getDailyJournalMonth(month),
      writeJournal: (date) => this.writeDailyJournal(date),
      listItemTimerEvents: async (id) => {
        const item = await this.findDailyItem(id);
        if (!item) throw new DailyPlanConflictError("not-found", `Daily item does not exist: ${id}`);
        if (!item.taskRef && await this.shouldUseBackendDailyWriter()) {
          const result = await this.backendClient.getDailyTaskTiming(id, {
            taskRevision: item.revision.value,
            lineageRevision: item.lineageRevision,
            includeEvents: true
          });
          this.dailyBackendTimingCache.set(id, {
            taskRevision: item.revision.value,
            lineageRevision: item.lineageRevision,
            timing: result.timing,
            events: result.events,
            fetchedAtMs: Date.now()
          });
          return result.events;
        }
        return this.requireDailyTaskTimer().core.getEvents().filter((event) => event.taskId === id);
      },
      correctItemTiming: async (id, correction) => {
        if (!correction.expectedTimingRevision) {
          throw new DailyPlanConflictError("revision-changed", "Task timing revision is required.");
        }
        await this.correctDailyItemTiming(id, correction.expectedTimingRevision, {
          operation: "correct",
          targetEventId: correction.targetEventId,
          replacementAt: correction.replacementAt,
          reason: correction.reason,
          source: "obsidian"
        });
      },
      writeSummary: async (summary) => { await this.writeDailySummary(summary); },
      generateSummary: (mode) => this.generateDailySummary(mode),
      sendItemToDevice: async (id, revision) => {
        const date = revision.date ?? await this.dateForDailyItem(id, revision);
        const current = await this.ensureStableDailyTask(id, revision, date);
        await this.sendDailyItemToDevice(current.id, current.revision, date);
      },
      sendSummaryToDevice: async () => { await this.sendDailySummaryToDevice(); },
      startAndOpenItem: async (item) => { await this.startAndOpenDailyItem(item); },
      pauseAndRememberItem: async (item) => { await this.pauseAndRememberDailyItem(item); },
      hasItemCheckpoint: (item) => this.hasDailyItemCheckpoint(item),
      openItem: async (item) => { await this.openDailyItemTarget(item); },
      openGroup: async (group) => { await this.openDailyGroupTarget(group); },
      openPlanSource: async (date) => { await this.openDailyPlanSource(date); },
      openPlanSettings: () => {
        const setting = (this.app as unknown as {
          setting?: { open(): void; openTabById(id: string): void };
        }).setting;
        setting?.open();
        setting?.openTabById(this.manifest.id);
      },
      openTaskPoolSource: async () => { await this.openTaskPoolSource(); },
      listPlanningCandidates: (date) => this.listDailyPlanningCandidates(date),
      openPlanningCandidate: (candidate) => this.openDailyPlanningCandidate(candidate),
      addPlanningCandidate: async (date, candidate) => {
        if (candidate.source === "pool" && candidate.taskRef && candidate.poolRevision) {
          await this.assignTaskPoolItemToDate(candidate.taskRef, candidate.poolRevision, date);
          return;
        }
        await this.createDailyItem({
          date,
          text: candidate.title,
          kind: candidate.kind ?? "edit_note",
          target: candidate.target,
          taskRef: candidate.taskRef,
          workKind: candidate.workKind,
          workRef: candidate.workRef,
          workRevision: candidate.workRevision,
          category: candidate.category,
          dueDate: candidate.dueDate,
          estimateMinutes: candidate.estimateMinutes,
          devicePolicy: "rotation"
        });
      },
      subscribe: (listener) => this.subscribe(listener)
    };
  }

  private async cleanTaskPoolFormat(): Promise<void> {
    try {
      const preview = await this.taskPoolService.previewFormatCleanup();
      if (!preview.changed) {
        new Notice(this.settings.language === "zh"
          ? "Task Pool 已经是简洁注释格式。"
          : "Task Pool already uses the compact comment format.");
        return;
      }
      const sample = taskPoolCleanupDiffSummary(preview.before, preview.after);
      const confirmed = await confirmWithModal(this.app, this.settings.language === "zh"
        ? `将整理 ${preview.affectedTaskIds.length} 条任务、${preview.legacyFieldCount} 行旧字段。\n\n${sample}\n\n只转换 ToWrite 字段，手写说明会保留。继续吗？`
        : `Organize ${preview.affectedTaskIds.length} task(s) and ${preview.legacyFieldCount} legacy field line(s)?\n\n${sample}\n\nOnly ToWrite-owned fields change; handwritten text is preserved.`,
      this.settings.language === "zh" ? "整理任务池格式" : "Organize task pool format");
      if (!confirmed) return;
      const result = await this.taskPoolService.applyFormatCleanup(preview.expectedRevision);
      this.taskPoolFormatUndoToken = result.undoToken;
      this.refreshTaskPoolTechnicalMetadata();
      new Notice(this.settings.language === "zh"
        ? "Task Pool 已整理；可运行“撤销上次格式整理”恢复。"
        : "Task Pool organized. Use the undo cleanup command to restore it.");
    } catch (error) {
      new Notice(messageForError(error));
    }
  }

  private async undoTaskPoolFormatCleanup(): Promise<void> {
    if (!this.taskPoolFormatUndoToken) {
      new Notice(this.settings.language === "zh"
        ? "没有可撤销的 Task Pool 格式整理。"
        : "There is no Task Pool format cleanup to undo.");
      return;
    }
    try {
      await this.taskPoolService.undoFormatCleanup(this.taskPoolFormatUndoToken);
      this.taskPoolFormatUndoToken = undefined;
      this.refreshTaskPoolTechnicalMetadata();
      new Notice(this.settings.language === "zh" ? "已恢复整理前的 Task Pool。" : "Task Pool cleanup was undone.");
    } catch (error) {
      new Notice(messageForError(error));
    }
  }

  private async assignTaskPoolItemToDate(
    taskId: string,
    revision: TaskPoolRevision,
    date: string
  ): Promise<DailyPlanItem> {
    this.assertDailyEnabled();
    const assignment = await this.taskPoolService.assignToDate(taskId, revision, date);
    const dailyId = assignment.assignment.assignmentId;
    if (!dailyId) throw new Error("Task Pool assignment did not produce a stable Daily id.");
    try {
      const created = await this.dailyPlanService.create({
        id: dailyId,
        date,
        text: assignment.task.text,
        kind: assignment.task.target ? "edit_note" : "task",
        taskRef: assignment.task.taskId,
        taskPoolRevision: assignment.task.revision.value,
        category: assignment.task.category,
        dueDate: assignment.task.dueDate,
        estimateMinutes: assignment.task.estimateMinutes,
        target: assignment.task.target,
        devicePolicy: "rotation"
      });
      await this.refreshDailyPlanCache();
      return created;
    } catch (error) {
      if (!assignment.idempotent) {
        try {
          await this.taskPoolService.returnToPool(
            assignment.task.taskId,
            assignment.task.revision,
            date
          );
        } catch (rollbackError) {
          console.error("ToWrite could not roll back a failed Task Pool assignment", rollbackError);
        }
      }
      throw error;
    }
  }

  private async returnDailyItemToPool(
    id: string,
    revision: DailyTaskRevision,
    returnedDate = formatDailyInputDate(new Date())
  ): Promise<void> {
    const date = await this.dateForDailyItem(id, revision);
    const item = await this.dailyPlanService.get(id, date);
    if (!item || item.revision.value !== revision.value) {
      throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
    }
    await this.assertDailyLifecycleLeaf(item, date);
    if (!item.taskRef) {
      const created = await this.taskPoolService.create({
        text: item.text,
        category: item.category,
        target: item.target,
        dueDate: item.dueDateExplicit ? item.dueDate : undefined,
        estimateMinutes: item.estimateMinutes
      });
      try {
        await this.dailyPlanService.remove(item.id, item.revision, date);
      } catch (error) {
        try {
          await this.taskPoolService.removeUnassigned(created.taskId, created.revision);
        } catch (rollbackError) {
          console.error("ToWrite could not roll back a newly pooled Daily task", rollbackError);
        }
        throw error;
      }
      await this.refreshDailyPlanCache();
      await this.recordDailyTransition("return", item, { sourceDate: date });
      return;
    }
    const poolTask = await this.taskPoolService.get(item.taskRef);
    if (!poolTask) throw new TaskPoolConflictError("not-found", `Task Pool item does not exist: ${item.taskRef}`);
    this.assertCurrentTaskPoolAssignment(poolTask, item);
    const returned = await this.taskPoolService.returnToPool(poolTask.taskId, poolTask.revision, returnedDate);
    try {
      await this.dailyPlanService.remove(item.id, item.revision, date);
    } catch (error) {
      try {
        await this.taskPoolService.restoreAssignment(
          returned.task.taskId,
          returned.task.revision,
          date,
          item.id
        );
      } catch (rollbackError) {
        console.error("ToWrite could not restore a Task Pool assignment after Daily removal failed", rollbackError);
      }
      throw error;
    }
    await this.refreshDailyPlanCache();
    await this.recordDailyTransition("return", item, { sourceDate: date });
  }

  private async moveDailyItemToTomorrow(
    id: string,
    revision: DailyTaskRevision,
    destinationDate?: string,
    destinationTaskId?: string
  ): Promise<DailyTaskMigration> {
    const date = await this.dateForDailyItem(id, revision);
    const item = await this.dailyPlanService.get(id, date);
    if (!item || item.revision.value !== revision.value) {
      throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
    }
    await this.assertDailyLifecycleLeaf(item, date);
    const tomorrow = new Date(`${date}T12:00:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = destinationDate
      ? formatDailyInputDate(destinationDate)
      : formatDailyInputDate(tomorrow);
    const targetTaskId = destinationTaskId ?? item.id;
    let createdTomorrow: DailyPlanItem | undefined;
    let createdTomorrowWasNew = false;
    let reassignedPool: TaskPoolItem | undefined;
    let reassignedPoolChanged = false;
    let migration: DailyTaskMigration | undefined;
    try {
      if (item.taskRef) {
        const poolTask = await this.taskPoolService.get(item.taskRef);
        if (!poolTask) throw new TaskPoolConflictError("not-found", `Task Pool item does not exist: ${item.taskRef}`);
        this.assertCurrentTaskPoolAssignment(poolTask, item);
        // Preserve the Daily id for an ordinary single move. A preflighted
        // historical batch may supply a deterministic alternative when that
        // id is already occupied by another date-scoped task.
        const assignment = await this.taskPoolService.restoreAssignment(
          poolTask.taskId,
          poolTask.revision,
          tomorrowDate,
          targetTaskId
        );
        reassignedPool = assignment.task;
        reassignedPoolChanged = !assignment.idempotent;
        const creation = await this.dailyPlanService.createWithResult({
          id: targetTaskId,
          date: tomorrowDate,
          text: poolTask.text,
          kind: item.kind,
          taskRef: poolTask.taskId,
          taskPoolRevision: assignment.task.revision.value,
          category: poolTask.category ?? item.category,
          dueDate: poolTask.dueDate,
          estimateMinutes: poolTask.estimateMinutes,
          target: poolTask.target ?? item.target,
          devicePolicy: item.devicePolicy,
          goal: item.goal,
          nextStep: item.nextStep,
          priority: item.priority,
          tags: item.tags
        });
        createdTomorrow = creation.item;
        createdTomorrowWasNew = creation.created;
      } else {
        const creation = await this.dailyPlanService.createWithResult({
          id: targetTaskId,
          date: tomorrowDate,
          text: item.text,
          kind: item.kind,
          category: item.category,
          dueDate: item.dueDateExplicit ? item.dueDate : undefined,
          estimateMinutes: item.estimateMinutes,
          target: item.target,
          workKind: item.workKind,
          workRef: item.workRef,
          workRevision: item.workRevision,
          devicePolicy: item.devicePolicy,
          goal: item.goal,
          nextStep: item.nextStep,
          priority: item.priority,
          tags: item.tags,
          primary: item.primary,
          minimum: item.minimum
        });
        createdTomorrow = creation.item;
        createdTomorrowWasNew = creation.created;
      }
      if (!createdTomorrow) throw new Error("Daily migration did not create its destination task.");
      if (destinationTaskId && !createdTomorrowWasNew) {
        throw new DailyPlanConflictError(
          "id-reused",
          "The preflighted Daily migration destination id became occupied before it could be written."
        );
      }
      migration = await this.dailyPlanService.recordMigration(item.id, item.revision, {
        date: tomorrowDate,
        taskId: createdTomorrow.id,
        migrationId: `mig_${randomTokenFragment()}`
      }, date);
    } catch (error) {
      if (createdTomorrow && createdTomorrowWasNew) {
        try {
          await this.dailyPlanService.remove(
            createdTomorrow.id,
            createdTomorrow.revision,
            tomorrowDate
          );
        } catch (rollbackError) {
          console.error("ToWrite could not remove a partially migrated Daily task", rollbackError);
        }
      }
      if (reassignedPool && reassignedPoolChanged) {
        try {
          await this.taskPoolService.restoreAssignment(
            reassignedPool.taskId,
            reassignedPool.revision,
            date,
            item.id
          );
        } catch (rollbackError) {
          console.error("ToWrite could not restore the prior Task Pool assignment", rollbackError);
        }
      }
      throw error;
    }
    await this.refreshDailyPlanCache();
    if (!migration) throw new Error("Daily migration did not produce an audit record.");
    await this.recordDailyTransition("migrate", item, {
      eventId: migration.migrationId,
      sourceDate: date,
      destinationDate: tomorrowDate
    });
    return migration;
  }

  private async dropDailyItem(id: string, revision: DailyTaskRevision): Promise<void> {
    const date = await this.dateForDailyItem(id, revision);
    const item = await this.dailyPlanService.get(id, date);
    if (!item || item.revision.value !== revision.value) {
      throw new DailyPlanConflictError("revision-changed", "The Daily task changed after it was loaded.");
    }
    await this.assertDailyLifecycleLeaf(item, date);
    if (item.taskRef) {
      const poolTask = await this.taskPoolService.get(item.taskRef);
      if (!poolTask) throw new TaskPoolConflictError("not-found", `Task Pool item does not exist: ${item.taskRef}`);
      this.assertCurrentTaskPoolAssignment(poolTask, item);
      const dropped = await this.taskPoolService.drop(poolTask.taskId, poolTask.revision);
      try {
        await this.dailyPlanService.remove(item.id, item.revision, date);
      } catch (error) {
        try {
          await this.taskPoolService.restoreAssignment(
            dropped.task.taskId,
            dropped.task.revision,
            date,
            item.id
          );
        } catch (rollbackError) {
          console.error("ToWrite could not restore a dropped Task Pool assignment", rollbackError);
        }
        throw error;
      }
    } else {
      await this.dailyPlanService.remove(item.id, item.revision, date);
    }
    await this.refreshDailyPlanCache();
    await this.recordDailyTransition("abandon", item, { sourceDate: date });
  }

  private async assertDailyLifecycleLeaf(item: DailyPlanItem, date: string): Promise<void> {
    const hierarchy = await this.dailyPlanService.readHierarchy(date);
    if (hierarchy.tasks.some((task) => task.parentTaskId === item.id)) {
      throw new DailyPlanConflictError(
        "invalid-state",
        this.settings.language === "zh"
          ? "这个任务仍有子任务。请先分别处理子任务，再移动、回池或停止追踪父任务。"
          : "This task still has subtasks. Handle them individually before moving, returning, or dropping the parent."
      );
    }
  }

  private assertCurrentTaskPoolAssignment(poolTask: TaskPoolItem, item: DailyPlanItem): void {
    if (
      poolTask.state !== "planned"
      || poolTask.plannedDate !== item.date
      || poolTask.assignmentId !== item.id
    ) {
      throw new TaskPoolConflictError(
        "invalid-state",
        "This Daily item is no longer the current Task Pool assignment."
      );
    }
    if (item.taskPoolRevision && poolTask.revision.value !== item.taskPoolRevision) {
      throw new TaskPoolConflictError(
        "revision-changed",
        "Task Pool item changed after this Daily assignment was loaded."
      );
    }
  }

  private async syncTaskPoolCompletion(item: DailyPlanItem): Promise<DailyPlanItem> {
    if (!item.taskRef || !this.taskPoolService) return item;
    try {
      const poolTask = await this.taskPoolService.get(item.taskRef);
      if (!poolTask) {
        throw new TaskPoolConflictError("not-found", `Task Pool item does not exist: ${item.taskRef}`);
      }
      if (poolTask.state === "done") {
        if (poolTask.plannedDate !== item.date || poolTask.assignmentId !== item.id) {
          throw new TaskPoolConflictError("invalid-state", "This Daily item is not the completed Task Pool assignment.");
        }
        return item.taskPoolRevision === poolTask.revision.value
          ? item
          : this.dailyPlanService.update(
            item.id,
            item.revision,
            { taskPoolRevision: poolTask.revision.value },
            item.date
          );
      }
      if (item.taskPoolRevision && poolTask.revision.value !== item.taskPoolRevision) {
        throw new TaskPoolConflictError("revision-changed", "Task Pool item changed after this Daily assignment was loaded.");
      }
      const completed = await this.taskPoolService.completeAssigned(
        poolTask.taskId,
        poolTask.revision,
        item.date,
        item.id
      );
      return this.dailyPlanService.update(
        item.id,
        item.revision,
        { taskPoolRevision: completed.task.revision.value },
        item.date
      );
    } catch (error) {
      console.error("ToWrite completed Daily task but could not update its Task Pool source", error);
      new Notice(this.settings.language === "zh"
        ? "今日任务已完成，但任务池状态同步失败；请打开任务池检查。"
        : "Daily task completed, but Task Pool synchronization failed. Please inspect the pool.");
      return item;
    }
  }

  private async syncTaskPoolReopen(item: DailyPlanItem): Promise<DailyPlanItem> {
    if (!item.taskRef || !this.taskPoolService) return item;
    const poolTask = await this.taskPoolService.get(item.taskRef);
    if (!poolTask) {
      throw new TaskPoolConflictError("not-found", `Task Pool item does not exist: ${item.taskRef}`);
    }
    if (poolTask.state === "planned") {
      if (poolTask.plannedDate !== item.date || poolTask.assignmentId !== item.id) {
        throw new TaskPoolConflictError("invalid-state", "This Daily item is no longer the current Task Pool assignment.");
      }
      return item.taskPoolRevision === poolTask.revision.value
        ? item
        : this.dailyPlanService.update(
          item.id,
          item.revision,
          { taskPoolRevision: poolTask.revision.value },
          item.date
        );
    }
    if (item.taskPoolRevision && poolTask.revision.value !== item.taskPoolRevision) {
      throw new TaskPoolConflictError("revision-changed", "Task Pool item changed after this Daily assignment was loaded.");
    }
    const reopened = await this.taskPoolService.reopenForDate(
      poolTask.taskId,
      poolTask.revision,
      item.date,
      item.id
    );
    return this.dailyPlanService.update(
      item.id,
      item.revision,
      { taskPoolRevision: reopened.task.revision.value },
      item.date
    );
  }

  private async syncTaskPoolFieldsFromDaily(
    before: DailyPlanItem,
    after: DailyPlanItem
  ): Promise<DailyPlanItem> {
    if (!after.taskRef || !this.taskPoolService) return after;
    const changed = before.text !== after.text
      || before.category !== after.category
      || before.target !== after.target
      || before.dueDate !== after.dueDate
      || before.dueDateExplicit !== after.dueDateExplicit
      || before.estimateMinutes !== after.estimateMinutes;
    if (!changed) return after;
    try {
      const poolTask = await this.taskPoolService.get(after.taskRef);
      if (!poolTask) throw new TaskPoolConflictError("not-found", `Task Pool item does not exist: ${after.taskRef}`);
      if (after.taskPoolRevision && poolTask.revision.value !== after.taskPoolRevision) {
        throw new TaskPoolConflictError("revision-changed", "Task Pool item changed after this Daily assignment was loaded.");
      }
      const updatedPool = await this.taskPoolService.updateAssigned(
        poolTask.taskId,
        poolTask.revision,
        after.date,
        after.id,
        {
        text: after.text,
        category: after.category ?? null,
        target: after.target ?? null,
        dueDate: after.dueDateExplicit ? after.dueDate : null,
        estimateMinutes: after.estimateMinutes ?? null
        }
      );
      return this.dailyPlanService.update(
        after.id,
        after.revision,
        { taskPoolRevision: updatedPool.revision.value },
        after.date
      );
    } catch (error) {
      console.error("ToWrite updated a Daily assignment but could not update its Task Pool source", error);
      new Notice(this.settings.language === "zh"
        ? "今日任务已更新，但任务池发生冲突；请打开任务池核对。"
        : "Daily task updated, but its Task Pool source conflicted. Please inspect the pool.");
      return after;
    }
  }

  private async dateForDailyItem(id: string, revision: DailyTaskRevision): Promise<string> {
    if (revision.date) {
      const item = await this.dailyPlanService.get(id, revision.date);
      if (item?.revision.value === revision.value) return revision.date;
      throw new DailyPlanConflictError(
        "revision-changed",
        "The Daily task changed in its original date scope after it was loaded."
      );
    }
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

  private async listDailyPlanningCandidates(date: string): Promise<DailyPlanningCandidate[]> {
    const output: DailyPlanningCandidate[] = [];
    const seen = new Set<string>();
    const append = (candidate: DailyPlanningCandidate): void => {
      if (!candidate.id || seen.has(candidate.id)) return;
      seen.add(candidate.id);
      output.push(candidate);
    };
    const daily = await this.dailyPlanService.read(date);
    const workItems = (await this.getWorkPoolSnapshot({ history: "active" })).items;
    const poolCandidates = await this.taskPoolService.candidates(
      date,
      daily.items.map((item) => ({
        taskRef: item.taskRef,
        date: item.date,
        assignmentId: item.id
      }))
    );
    for (const item of poolCandidates) {
      append({
        id: `pool:${item.taskId}`,
        title: item.text,
        description: [item.category, item.project].filter(Boolean).join(" · ")
          || (this.settings.language === "zh" ? "任务池" : "Task Pool"),
        source: "pool",
        kind: item.target ? "edit_note" : "task",
        target: item.target,
        taskRef: item.taskId,
        category: item.category,
        dueDate: item.dueDate,
        estimateMinutes: item.estimateMinutes,
        poolRevision: item.revision
      });
    }
    for (const question of this.store.query().filter((item) => item.status !== "resolved" && item.status !== "ignored")) {
      const workItem = workItems.find((item) => item.id === `question:${question.id}`);
      append({
        id: `question:${question.id}`,
        title: question.title || question.question,
        description: question.question,
        source: question.lane === "write" ? "towrite" : "tothink",
        kind: "edit_note",
        target: dailyWikiLink(question.source.file, question.source.blockId),
        workKind: "question",
        workRef: question.id,
        workRevision: workItem?.sourceRef.revision ?? questionRevision(question)
      });
    }
    for (const item of this.getInboxSnapshot().items) {
      const workItem = workItems.find((candidate) => candidate.id === `note:${normalizePath(item.filePath)}`);
      append({
        id: `inbox:${item.id}`,
        title: item.title,
        description: item.project || item.folder,
        source: "inbox",
        kind: "edit_note",
        target: `[[${item.filePath}]]`,
        workKind: "inbox",
        workRef: normalizePath(item.filePath),
        workRevision: workItem?.sourceRef.revision
      });
    }
    for (const article of this.store.getArticleSummaries().filter((item) => item.stale)) {
      const workItem = workItems.find((candidate) => candidate.id === `note:${normalizePath(article.filePath)}`);
      append({
        id: `stale:${article.filePath}`,
        title: article.title,
        description: this.settings.language === "zh" ? "久未继续的笔记" : "Stale note",
        source: "stale",
        kind: "edit_note",
        target: `[[${article.filePath}]]`,
        workKind: workItem ? "note" : undefined,
        workRef: workItem?.sourceRef.id,
        workRevision: workItem?.sourceRef.revision
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

  private async openDailyPlanningCandidate(candidate: DailyPlanningCandidate): Promise<void> {
    if (candidate.workKind === "question" && candidate.workRef) {
      await this.jumpToQuestion(candidate.workRef);
      return;
    }
    if (candidate.taskRef) {
      const item = (await this.getWorkPoolSnapshot({ history: "all" })).items
        .find((entry) => entry.taskId === candidate.taskRef);
      if (item) {
        await this.openWorkPoolItem(item);
        return;
      }
    }
    if ((candidate.workKind === "note" || candidate.workKind === "inbox") && candidate.workRef) {
      const path = normalizePath(candidate.workRef.replace(/^note:/u, ""));
      if (this.app.vault.getFileByPath(path)) {
        await this.openFile(path);
        return;
      }
    }
    const target = candidate.target
      ? parseDailyMarkdownTargets(candidate.target, { sourcePath: this.dailyPlanService.pathForDate() })[0]
      : undefined;
    const file = target ? this.resolveDailyMarkdownTargetFile(target, this.dailyPlanService.pathForDate()) : undefined;
    if (file) {
      await this.openFile(file.path);
      return;
    }
    await this.activateDashboard({ activeTab: "pool" });
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

  async openDailyTimerLedger(): Promise<string> {
    const file = this.app.vault.getFileByPath(this.dailyTimerLedgerPath);
    if (file) await this.openFile(file.path);
    return this.dailyTimerLedgerPath;
  }

  async exportDailyTimerLedger(): Promise<string> {
    const timer = this.requireDailyTaskTimer();
    const suffix = new Date().toISOString().replace(/[:.]/gu, "-");
    const path = `${normalizeVaultPath(this.settings.exportDirectory)}/daily/exports/task-timer-events-${suffix}.jsonl`;
    await writeVaultDataText(this.app, path, timer.exportJsonl());
    return path;
  }

  async archiveDailyTimerLedger(): Promise<string> {
    const name = `task-timer-events-${new Date().toISOString().replace(/[:.]/gu, "-")}.jsonl`;
    await this.withDailyTimerLock(async () => {
      const timer = this.requireDailyTaskTimer();
      const coordinator = this.dailyTimerCoordinator;
      if (!coordinator) {
        throw new DailyPlanConflictError(
          "invalid-state",
          "Task timer transaction journal is unavailable."
        );
      }
      await coordinator.assertNoPendingTransactions();
      await timer.archive(name);
    });
    return `${normalizeVaultPath(this.settings.exportDirectory)}/daily/archive/${name}`;
  }

  async clearDailyTimerLedger(): Promise<string> {
    const name = `task-timer-events-${new Date().toISOString().replace(/[:.]/gu, "-")}.jsonl`;
    await this.withDailyTimerLock(async () => {
      const timer = this.requireDailyTaskTimer();
      const coordinator = this.dailyTimerCoordinator;
      if (!coordinator) {
        throw new DailyPlanConflictError(
          "invalid-state",
          "Task timer transaction journal is unavailable."
        );
      }
      await coordinator.assertNoPendingTransactions();
      await timer.archiveAndClear("CLEAR", name);
    });
    this.dailyBackendTimingCache.clear();
    await this.refreshDailyPlanCache();
    return `${normalizeVaultPath(this.settings.exportDirectory)}/daily/archive/${name}`;
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
    const current = await this.dailyPlanService.get(id, dailyDate);
    if (!current
      || current.revision.value !== revision
      || (snapshot.sourceContext?.lineageRevision
        && current.lineageRevision !== snapshot.sourceContext.lineageRevision)) {
      throw new CaptureBridgeRequestError(
        409,
        "The task or its inherited target changed after this NFC page was opened."
      );
    }
    const item = await this.completeDailyItem(id, {
      value: revision,
      sourcePath: snapshot.sourceContext?.dailySourcePath ?? "",
      blockId: id
    }, `bridge-complete:${eventId}`, dailyDate, "nfc",
    snapshot.sourceContext?.timingRevision, snapshot.sourceContext?.lineageRevision);
    await this.advanceAfterDailyCompletion(id);
    return {
      path: item.sourcePath,
      completedAt: new Date().toISOString(),
      idempotent: false
    };
  }

  private async transitionDailyTimingFromBridge(
    snapshot: TapSelectionSnapshot,
    operation: "start" | "pause" | "resume",
    eventId: string
  ): Promise<{
    path: string;
    transitionedAt: string;
    timingState: "idle" | "running" | "paused" | "completed" | "needs-review";
    timingRevision: string;
    taskRevision: string;
    lineageRevision: string;
    idempotent?: boolean;
  }> {
    const id = snapshot.sourceContext?.dailyItemId;
    const revision = snapshot.sourceContext?.dailyTaskRevision;
    const lineageRevision = snapshot.sourceContext?.lineageRevision;
    const expectedTimingRevision = snapshot.sourceContext?.timingRevision;
    const date = snapshot.sourceContext?.dailyDate;
    if (!id || !revision || !date) {
      throw new CaptureBridgeRequestError(409, "The displayed card is not a Daily plan item.");
    }
    const current = await this.dailyPlanService.get(id, date);
    if (!current
      || current.revision.value !== revision
      || (lineageRevision && current.lineageRevision !== lineageRevision)) {
      throw new CaptureBridgeRequestError(
        409,
        "The task or its inherited target changed after this NFC page was opened."
      );
    }
    const timing = this.dailyTimingSnapshotForItem(current);
    if (expectedTimingRevision && expectedTimingRevision !== timing.timingRevision) {
      throw new CaptureBridgeRequestError(
        409,
        "The task timer changed after this NFC page was opened."
      );
    }
    const transitionEventId = `${eventId}:${operation}`;
    const updated = operation === "pause"
      ? await this.pauseDailyItem(
        id,
        current.revision,
        transitionEventId,
        date,
        "nfc",
        expectedTimingRevision,
        lineageRevision
      )
      : operation === "resume"
        ? await this.resumeDailyItem(
          id,
          current.revision,
          transitionEventId,
          date,
          "nfc",
          expectedTimingRevision,
          lineageRevision
        )
        : await this.startDailyItem(
          id,
          current.revision,
          date,
          transitionEventId,
          "nfc",
          expectedTimingRevision,
          lineageRevision
        );
    const after = await this.getDailyItemTiming(id, date);
    const updatedLineageRevision = updated.lineageRevision
      ?? updated.targetResolution?.lineageRevision
      ?? resolveDailyTarget({
        sourcePath: updated.sourcePath,
        taskText: updated.text,
        rawBlock: updated.rawBlock,
        blockId: updated.blockId,
        explicitTarget: updated.target,
        lineage: updated.lineage
      }).lineageRevision;
    return {
      path: updated.sourcePath,
      transitionedAt: after.lastTransitionAt ?? new Date().toISOString(),
      timingState: dailyBridgeTimingState(after),
      timingRevision: after.timingRevision,
      taskRevision: updated.revision.value,
      lineageRevision: updatedLineageRevision,
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
    const dailyTiming = dailyItem
      ? this.dailyTimingSnapshotForItem(dailyItem)
      : undefined;
    const dailyGroup = dailyItem?.lineage?.groups.at(-1);
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
        lineageRevision: dailyItem?.lineageRevision,
        timingState: dailyTiming ? dailyBridgeTimingState(dailyTiming) : undefined,
        timingRevision: dailyTiming?.timingRevision,
        groupId: dailyGroup?.id,
        groupLabel: dailyGroupDisplayLabel(dailyGroup),
        targetSource: dailyItem?.targetResolution?.source,
        activeMinutes: dailyTiming ? Math.floor(dailyTiming.activeMs / 60_000) : undefined,
        estimateMinutes: dailyItem?.estimateMinutes,
        interruptionCount: dailyTiming?.interruptionCount,
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
    const inboxCard = deck.inboxItems.find((card) => card.localId === localId);
    if (!isOverview && !inboxCard) return undefined;
    const current = deck.currentItemId
      ? this.dailyPlanItems.find((item) => item.id === deck.currentItemId)
      : undefined;
    const targetPath = isOverview
      ? (current ? this.dailyCaptureTargetPath(current) : this.dailyPlanService.pathForDate(deck.date))
      : this.dailyPlanService.pathForDate(deck.date);
    const planPath = this.dailyPlanService.pathForDate(deck.date);
    const writableTargetPath = this.app.vault.getFileByPath(targetPath)
      ? targetPath
      : this.settings.deviceCapture.inboxFile;
    const isInbox = writableTargetPath === this.settings.deviceCapture.inboxFile;
    const privacy = combineHubCandidatePrivacy(
      this.hubPrivacyForPath(planPath),
      this.hubPrivacyForPath(writableTargetPath, [], { ignoreIncludeFolders: isInbox })
    );
    if (privacy.private || privacy.excluded) return undefined;
    return {
      localId,
      type: isOverview ? "daily_overview" : "daily_inbox",
      display: isOverview
        ? {
            title: this.settings.language === "zh" ? "今日总览" : "Today overview",
            body: [
              `${compactDeviceProgressBar(deck.overview.progress.done, deck.overview.progress.total)} ${deck.overview.progress.done}/${deck.overview.progress.total}`,
              ...deck.overview.projects.slice(0, 4).map((project) => `${project.label} ${project.done}/${project.total}`),
              deck.overview.current?.text || ""
            ].filter(Boolean).join("\n"),
            prompt: `${this.settings.language === "zh" ? "电量" : "Battery"} ${deck.overview.batteryPercent ?? "--"}%`
          }
        : {
            title: inboxCard?.item?.title || (this.settings.language === "zh" ? "提醒 · 收件箱" : "Reminders · Inbox"),
            body: inboxCard?.item?.detail || "",
            prompt: inboxCard?.item?.reason
          },
      sourceLocalId: planPath,
      writeTargetLocalId: writableTargetPath,
      writeTargetAction: "append",
      writeTargetKind: isInbox ? "inbox" : "existingNote",
      allowedActions: ["open", "capture"],
      reasonCode: isOverview ? "daily_overview" : "daily_inbox",
      score: 100,
      privacy
    };
  }

  private async validateTapSelectionSnapshot(snapshot: TapSelectionSnapshot, draft: CaptureDraft): Promise<void> {
    const candidate = snapshot.candidate;
    const dailyId = snapshot.sourceContext?.dailyItemId;
    if (dailyId) {
      const sourceDate = snapshot.sourceContext?.dailyDate
        || dailyDateFromPath(snapshot.sourceContext?.dailySourcePath)
        || formatDailyInputDate(new Date(snapshot.createdAt));
      const item = await this.dailyPlanService.get(dailyId, sourceDate);
      if (!item
        || item.revision.value !== snapshot.sourceContext?.dailyTaskRevision
        || item.lineageRevision !== snapshot.sourceContext?.lineageRevision
        || (snapshot.sourceContext?.dailySourcePath
          && item.sourcePath !== snapshot.sourceContext.dailySourcePath)) {
        throw new CaptureBridgeRequestError(
          409,
          "The Daily task or its inherited target changed after this NFC page was opened."
        );
      }
      if (candidate.path !== this.dailyCaptureTargetPath(item)) {
        throw new CaptureBridgeRequestError(
          409,
          "The frozen Capture target no longer matches the Daily task target."
        );
      }
    }
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
        || item.lineageRevision !== snapshot.sourceContext?.lineageRevision
        || (snapshot.sourceContext?.dailySourcePath
          && item.sourcePath !== snapshot.sourceContext.dailySourcePath)) {
        throw new CaptureBridgeRequestError(409, "The persisted Daily card changed after it was displayed.");
      }
      expectedPath = this.dailyCaptureTargetPath(item);
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

  private dailyCaptureTargetPath(item: DailyPlanItem): string {
    const resolution = item.targetResolution ?? resolveDailyTarget({
      sourcePath: item.sourcePath,
      taskText: item.text,
      rawBlock: item.rawBlock,
      blockId: item.blockId,
      explicitTarget: item.target,
      lineage: item.lineage
    });
    const linked = resolution.target
      ? this.resolveDailyMarkdownTargetFile(resolution.target, item.sourcePath)
      : undefined;
    return linked?.path
      || (resolution.source === "task-block" ? item.sourcePath : this.settings.deviceCapture.inboxFile);
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
        await this.app.fileManager.trashFile(file);
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
      for (const pageId of [
        deck.overview.localId,
        ...deck.inboxItems.map((item) => item.localId)
      ]) {
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
      enableDefaultWorkflow: async () => {
        this.settings.workflowStages.enabled = true;
        if (this.settings.workflowStages.stages.length === 0) {
          this.settings.workflowStages.stages = DEFAULT_WORKFLOW_STAGES.map((stage) => ({
            ...stage,
            folderPrefixes: [...stage.folderPrefixes],
            tags: [...stage.tags]
          }));
        }
        await this.savePluginData();
        await this.refreshWorkflowIndex();
      },
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
      openPluginSettings: () => {
        const setting = (this.app as unknown as {
          setting?: { open(): void; openTabById(id: string): void };
        }).setting;
        setting?.open();
        setting?.openTabById(this.manifest.id);
      },
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

  refreshDailyEditorTaskControls(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const codeMirror = (view?.editor as unknown as {
      cm?: { dispatch: (spec: { effects: ReturnType<typeof refreshDailyTaskControls.of> }) => void };
    } | undefined)?.cm;
    if (codeMirror) {
      codeMirror.dispatch({ effects: refreshDailyTaskControls.of(undefined) });
      return;
    }
    this.app.workspace.updateOptions();
  }

  refreshTaskPoolTechnicalMetadata(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const codeMirror = (view?.editor as unknown as {
      cm?: { dispatch: (spec: { effects: ReturnType<typeof refreshTaskPoolTechnicalMetadata.of> }) => void };
    } | undefined)?.cm;
    if (codeMirror) {
      codeMirror.dispatch({ effects: refreshTaskPoolTechnicalMetadata.of(undefined) });
      return;
    }
    this.app.workspace.updateOptions();
  }

  refreshNoteEditorTaskControls(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const codeMirror = (view?.editor as unknown as {
      cm?: { dispatch: (spec: { effects: ReturnType<typeof refreshNoteTaskControls.of> }) => void };
    } | undefined)?.cm;
    if (codeMirror) {
      codeMirror.dispatch({ effects: refreshNoteTaskControls.of(undefined) });
      return;
    }
    this.app.workspace.updateOptions();
  }

  async refreshActiveNoteTasks(): Promise<void> {
    await this.refreshActiveNoteTaskCache();
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
    await activateWorkspaceView(this.app.workspace, {
      type: TOWRITE_SIDEBAR_VIEW,
      location: "right"
    });
  }

  private async activateDashboard(
    state: Partial<ToWriteDashboardViewState> & { popout?: boolean } = {}
  ): Promise<void> {
    if (state.popout) {
      const result = await openPinnedFloatingView(this.app.workspace, {
        viewType: TOWRITE_DASHBOARD_VIEW,
        state: {
          activeTab: state.activeTab ?? "today",
          focusPreviousMigration: state.focusPreviousMigration === true
        },
        width: 1180,
        height: 760,
        preferPopout: true
      });
      if (!result.popout && result.popoutError) {
        new Notice(this.settings.language === "zh"
          ? `无法创建独立工作台，已在普通标签页打开：${messageForError(result.popoutError)}`
          : `Could not create the Workbench pop-out; opened a tab instead: ${messageForError(result.popoutError)}`);
      }
      return;
    }
    await activateWorkspaceView(this.app.workspace, {
      type: TOWRITE_DASHBOARD_VIEW,
      location: "tab",
      state: {
        activeTab: state.activeTab ?? "today",
        focusPreviousMigration: state.focusPreviousMigration === true
      }
    });
  }

  private runViewAction(label: string, action: () => Promise<void>): void {
    void action().catch((error: unknown) => {
      console.error(`ToWrite could not open ${label}`, error);
      const detail = messageForError(error);
      new Notice(this.settings.language === "zh"
        ? `无法打开${label}：${detail}`
        : `Could not open ${label}: ${detail}`);
    });
  }

  private async activateTodayFloating(): Promise<void> {
    const result = await openPinnedFloatingView(this.app.workspace, {
      viewType: TOWRITE_TODAY_FLOATING_VIEW,
      state: { collapsed: false },
      width: 380,
      height: 520
    });
    if (!result.popout && result.popoutError) {
      new Notice(this.settings.language === "zh"
        ? `无法创建独立小窗，已在普通标签页打开：${messageForError(result.popoutError)}`
        : `Could not create a pop-out; opened a normal tab instead: ${messageForError(result.popoutError)}`);
    }
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
      const previousAllowlist = new Set(this.workPoolTaskSourceAllowlist());
      void this.refreshDailyPlanCache()
        .then(async () => {
          const nextAllowlist = this.rebuildWorkPoolTaskSourceAllowlistCache();
          const newlyAllowed = nextAllowlist.filter((path) => !previousAllowlist.has(path));
          for (const path of newlyAllowed) {
            const file = this.app.vault.getFileByPath(path);
            if (!file || file.extension !== "md" || this.isConfiguredDailyPlanSourcePath(path)) continue;
            await this.syncMarkdownTasksForFile(path, new Set<string>(), nextAllowlist);
          }
          await this.rebuildDailyLinkedTaskProjectionCache();
          this.rebuildMarkdownTaskNoteSuggestions();
          if (newlyAllowed.length > 0) {
            await this.refreshActiveTaskPoolCache(false);
            this.notifyUi();
          }
        })
        .catch((error: unknown) => {
          console.error("ToWrite could not refresh the edited Daily plan", error);
          new Notice(messageForError(error));
        });
    }, 1500, true);
    const refreshHistoricalDailyAfterVaultChange = debounce(() => {
      void this.refreshPreviousDailyUnfinishedCache().catch((error: unknown) => {
        console.error("ToWrite could not refresh historical Daily tasks", error);
      });
    }, 1500, true);
    const invalidateHistoricalDailyAfterVaultChange = (): void => {
      this.historicalDailyUnfinishedCache.clear();
      refreshHistoricalDailyAfterVaultChange();
    };
    const refreshActiveNoteTasksAfterVaultChange = debounce(() => {
      void this.refreshActiveNoteTaskCache().catch((error: unknown) => {
        console.error("ToWrite could not refresh ordinary tasks in the active note", error);
      });
    }, 1500, true);
    const refreshTaskPoolAfterVaultChange = debounce(() => {
      void this.refreshActiveTaskPoolCache().catch((error: unknown) => {
        console.error("ToWrite could not refresh the Task Pool search cache", error);
      });
    }, 250, true);
    const pendingMarkdownTaskPaths = new Set<string>();
    const syncChangedMarkdownTasks = debounce(() => {
      const paths = [...pendingMarkdownTaskPaths];
      pendingMarkdownTaskPaths.clear();
      void (async () => {
        const taskSourceAllowlist = this.rebuildWorkPoolTaskSourceAllowlistCache();
        for (const path of paths) {
          try {
            if (this.app.vault.getFileByPath(path)) {
              await this.syncMarkdownTasksForFile(path, new Set<string>(), taskSourceAllowlist, false);
            }
          } catch (error) {
            console.error(`ToWrite could not update the Work Pool from ${path}`, error);
          }
        }
        if (paths.length > 0) {
          await this.refreshActiveTaskPoolCache(false);
          await this.rebuildDailyLinkedTaskProjectionCache();
          this.notifyUi();
        }
      })();
    }, 2_200, true);

    const queueMarkdownTaskSync = (file: TFile): void => {
      if (!this.settings.daily.enabled || file.extension !== "md") return;
      if (normalizePath(file.path) === normalizePath(this.taskPoolService.path)) return;
      if (this.isConfiguredDailyPlanSourcePath(file.path)) return;
      pendingMarkdownTaskPaths.add(file.path);
      syncChangedMarkdownTasks();
    };

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
          if (normalizePath(file.path) === normalizePath(this.taskPoolService.path)) {
            refreshTaskPoolAfterVaultChange();
          } else if (this.isTrackedDailyPlanPath(file.path)) {
            refreshDailyPlanAfterVaultChange();
          } else if (this.isConfiguredDailyPlanSourcePath(file.path)) {
            invalidateHistoricalDailyAfterVaultChange();
          } else if (file.path === this.getActiveFile() || file.path === this.activeNoteTaskDocument?.sourcePath) {
            refreshActiveNoteTasksAfterVaultChange();
          }
          queueMarkdownTaskSync(file);
          this.recordEditPresenceLearning(file);
          this.deviceHub?.recordEditPresence();
          reindexFile(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.rebuildMarkdownTaskNoteSuggestions();
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
          if (normalizePath(file.path) === normalizePath(this.taskPoolService.path)) {
            refreshTaskPoolAfterVaultChange();
          } else if (this.isTrackedDailyPlanPath(file.path)) {
            refreshDailyPlanAfterVaultChange();
          } else if (this.isConfiguredDailyPlanSourcePath(file.path)) {
            invalidateHistoricalDailyAfterVaultChange();
          } else if (file.path === this.getActiveFile() || file.path === this.activeNoteTaskDocument?.sourcePath) {
            refreshActiveNoteTasksAfterVaultChange();
          }
          queueMarkdownTaskSync(file);
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
          this.noteTaskRelationsBySource.delete(normalizePath(file.path));
          for (const [sourcePath, relations] of this.noteTaskRelationsBySource) {
            const remaining = relations.filter((relation) => relation.childNotePath !== normalizePath(file.path));
            if (remaining.length > 0) this.noteTaskRelationsBySource.set(sourcePath, remaining);
            else this.noteTaskRelationsBySource.delete(sourcePath);
          }
          if (file.extension === "md") this.rebuildMarkdownTaskNoteSuggestions();
          this.dailyActivityService.removeDocumentBaseline(file.path);
          if (normalizePath(file.path) === normalizePath(this.taskPoolService.path)) {
            refreshTaskPoolAfterVaultChange();
          } else if (this.isTrackedDailyPlanPath(file.path)) {
            // Both today's and tomorrow's source are watched. Always re-read
            // the active (today) plan so deleting tomorrow cannot blank the
            // current dashboard cache.
            refreshDailyPlanAfterVaultChange();
          } else if (this.isConfiguredDailyPlanSourcePath(file.path)) {
            invalidateHistoricalDailyAfterVaultChange();
          } else if (
            file.path === this.getActiveFile()
            || file.path === this.activeNoteTaskDocument?.sourcePath
          ) {
            refreshActiveNoteTasksAfterVaultChange();
          }
        }
        this.handleDeletedFile(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFolder) rebuildInboxAfterFolderChange();
        if (file instanceof TFile) {
          const normalizedOldPath = normalizePath(oldPath);
          const normalizedNewPath = normalizePath(file.path);
          const sourceRelations = this.noteTaskRelationsBySource.get(normalizedOldPath);
          this.noteTaskRelationsBySource.delete(normalizedOldPath);
          if (sourceRelations) {
            this.noteTaskRelationsBySource.set(normalizedNewPath, sourceRelations.map((relation) => ({
              ...relation,
              parentSourcePath: normalizedNewPath
            })));
          }
          for (const [sourcePath, relations] of this.noteTaskRelationsBySource) {
            this.noteTaskRelationsBySource.set(sourcePath, relations.map((relation) => (
              relation.childNotePath === normalizedOldPath
                ? { ...relation, childNotePath: normalizedNewPath }
                : relation
            )));
          }
          if (file.extension === "md" || oldPath.toLocaleLowerCase().endsWith(".md")) {
            this.rebuildMarkdownTaskNoteSuggestions();
          }
          this.dailyActivityService.renameDocumentBaseline(oldPath, file.path);
          if (
            normalizePath(oldPath) === normalizePath(this.taskPoolService.path)
            || normalizePath(file.path) === normalizePath(this.taskPoolService.path)
          ) {
            refreshTaskPoolAfterVaultChange();
          } else if (this.isTrackedDailyPlanPath(oldPath) || this.isTrackedDailyPlanPath(file.path)) {
            refreshDailyPlanAfterVaultChange();
          } else if (
            this.isConfiguredDailyPlanSourcePath(oldPath)
            || this.isConfiguredDailyPlanSourcePath(file.path)
          ) {
            invalidateHistoricalDailyAfterVaultChange();
          } else if (oldPath === this.activeNoteTaskDocument?.sourcePath || file.path === this.getActiveFile()) {
            refreshActiveNoteTasksAfterVaultChange();
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
            queueMarkdownTaskSync(file);
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
        void this.refreshActiveNoteTaskCache();
      })
    );

    this.registerEvent(
      this.app.workspace.on("editor-change", () => {
        // Keep the keystroke path constant-time. Vault modify events debounce
        // every parser, index update, and network/export side effect.
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
    this.registerDomEvent(activeDocument, "dblclick", (event) => {
      if (!isBlankMarkdownEditorDoubleClick(event)) return;
      event.preventDefault();
      void this.locateCurrentFocusedTask();
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

  /** Any configured Daily source is owned by Daily, not ordinary Note Tasks. */
  private isConfiguredDailyPlanSourcePath(path: string): boolean {
    return isConfiguredDailyPlanSourcePath(path, this.dailyPlanSourceSetting());
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

function taskPoolCleanupDiffSummary(before: string, after: string): string {
  const beforeLines = before.split(/\r?\n/u);
  const afterLines = after.split(/\r?\n/u);
  const changed: string[] = [];
  const length = Math.max(beforeLines.length, afterLines.length);
  for (let index = 0; index < length && changed.length < 8; index += 1) {
    if (beforeLines[index] === afterLines[index]) continue;
    if (beforeLines[index] !== undefined) changed.push(`- ${beforeLines[index]}`);
    if (afterLines[index] !== undefined) changed.push(`+ ${afterLines[index]}`);
  }
  return changed.join("\n");
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
  const digest = await window.crypto.subtle.digest("SHA-256", copy.buffer);
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
    ribbon: normalizeRibbonSettings(settings?.ribbon),
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
    workPool: normalizeWorkPoolSettings(settings?.workPool),
    echoCards: normalizeEchoCards(settings?.echoCards),
    hub: normalizeHubSettings(settings?.hub),
    deviceProfiles: normalizeDeviceProfiles(settings?.deviceProfiles),
    desktopActions: normalizeDesktopActions(settings?.desktopActions),
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
  const source: unknown[] = Array.isArray(value) ? value : [];
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of [...source, legacyLast]) {
    const id = String(item ?? "")
      .replace(/\p{Cc}/gu, "")
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

function noteTaskCandidateCacheKey(
  candidate: Pick<NoteTaskCandidate, "sourcePath" | "line" | "taskRevision">
): string {
  return `${candidate.sourcePath}:${candidate.line}:${candidate.taskRevision}`;
}

function dailyTimerTaskKey(item: Pick<DailyPlanItem, "id" | "date">): string {
  return `${item.id}\u0000${item.date}`;
}

function safeDailyMarkdownTransitionAt(observedAt: string, lastTransitionAt?: string): string {
  const observedMs = Date.parse(observedAt);
  const lastMs = lastTransitionAt ? Date.parse(lastTransitionAt) : Number.NEGATIVE_INFINITY;
  return new Date(
    Number.isFinite(lastMs) && lastMs >= observedMs ? lastMs + 1 : observedMs
  ).toISOString();
}

function dailyGroupDisplayLabel(group: DailyPlanGroup | undefined): string | undefined {
  if (!group) return undefined;
  return group.text
    .replace(
      /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/gu,
      (_match, target: string, alias?: string) => alias?.trim() || target.trim()
    )
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .trim()
    || group.links[0]?.label
    || group.links[0]?.linkText
    || undefined;
}

function cleanDailyProjectLabel(value: string | undefined): string | undefined {
  const normalized = String(value ?? "")
    .trim()
    .replace(/^\[\[/u, "")
    .replace(/\]\]$/u, "")
    .split("|")[0]
    .trim();
  return normalized || undefined;
}

function dailyProjectIdentifier(value: string): string {
  return value.trim().toLocaleLowerCase()
    .replace(/^#+/u, "")
    .replace(/[\\/\s]+/gu, "-")
    .replace(/[^\p{Letter}\p{Number}_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 100) || "unclassified";
}

function compactDeviceProgressBar(done: number, total: number, width = 12): string {
  const completed = total > 0
    ? Math.max(0, Math.min(width, Math.round((done / total) * width)))
    : 0;
  return `${"█".repeat(completed)}${"░".repeat(width - completed)}`;
}

function dailyInboxSourceLabel(source: string, language: ToWriteSettings["language"]): string {
  const zh = language === "zh";
  if (source === "ai") return zh ? "AI 推测" : "AI inference";
  if (source === "human") return zh ? "亲友留言" : "Message";
  if (source === "inbox") return "Inbox";
  if (source === "system") return zh ? "系统" : "System";
  return zh ? "规则建议" : "Suggestion";
}

function parseDailyTimerTaskKey(value: string): { id: string; date: string } {
  const [id, date] = value.split("\u0000", 2);
  if (!id || !/^\d{4}-\d{2}-\d{2}$/u.test(date ?? "")) {
    throw new DailyPlanConflictError("invalid-document", "Task timer transaction identity is invalid.");
  }
  return { id, date };
}

function dailyTimerExpectedRevision(
  item: Pick<DailyPlanItem, "revision" | "lineageRevision">
): string {
  if (!item.lineageRevision) {
    throw new DailyPlanConflictError("invalid-document", "Daily task lineage revision is missing.");
  }
  return `${item.revision.value}\u0000${item.lineageRevision}`;
}

function parseDailyTimerExpectedRevision(value: string): {
  taskRevision: string;
  lineageRevision: string;
} {
  const [taskRevision, lineageRevision] = value.split("\u0000", 2);
  if (!taskRevision || !lineageRevision) {
    throw new DailyPlanConflictError("invalid-document", "Task timer transaction revision is invalid.");
  }
  return { taskRevision, lineageRevision };
}

function desiredDailyStatusForTimerEvents(
  events: readonly DailyTimerEvent[],
  taskId: string
): DailyPlanItem["status"] | undefined {
  const event = [...events].reverse().find((candidate) =>
    candidate.taskId === taskId && candidate.kind !== "correct" && candidate.kind !== "reset"
  );
  if (!event) return undefined;
  if (event.kind === "start" || event.kind === "resume") return "in-progress";
  if (event.kind === "complete") return "done";
  return "todo";
}

function dailyTimerMarkdownApplyOrder(status: DailyPlanItem["status"] | undefined): number {
  // Auto-paused peers must be written before the newly active task. Otherwise
  // DailyPlanService.start would already change the peer revision and make the
  // transaction's later peer CAS look stale.
  if (status === "todo") return 0;
  if (status === "done") return 1;
  if (status === "in-progress") return 2;
  return 3;
}

function projectCachedDailyTiming(
  snapshot: DailyTaskTimingSnapshot,
  fetchedAtMs: number,
  estimateMinutes: number | undefined,
  reviewHours: number
): DailyTaskTimingSnapshot {
  if (snapshot.status !== "running" || !snapshot.activeSince || snapshot.needsReview) {
    return { ...snapshot, estimateMinutes };
  }
  const now = Date.now();
  const activeSinceMs = Date.parse(snapshot.activeSince);
  if (!Number.isFinite(activeSinceMs) || now <= fetchedAtMs) {
    return { ...snapshot, estimateMinutes };
  }
  const midnight = new Date(activeSinceMs);
  midnight.setHours(24, 0, 0, 0);
  const reviewLimit = activeSinceMs + Math.max(1, reviewHours) * 60 * 60_000;
  const effectiveEnd = Math.min(now, midnight.getTime(), reviewLimit);
  const delta = Math.max(0, effectiveEnd - Math.max(fetchedAtMs, activeSinceMs));
  const activeMs = snapshot.activeMs + delta;
  const reviewReasons = new Set(snapshot.reviewReasons);
  if (now > reviewLimit) reviewReasons.add("open-session-over-4h");
  if (now >= midnight.getTime()) reviewReasons.add("open-session-crossed-midnight");
  const dateKey = formatDailyInputDate(new Date(Math.max(fetchedAtMs, activeSinceMs)));
  const dailyActiveMs = {
    ...snapshot.dailyActiveMs,
    [dateKey]: (snapshot.dailyActiveMs[dateKey] ?? 0) + delta
  };
  return {
    ...snapshot,
    activeMs,
    wallMs: snapshot.wallMs + delta,
    estimateMinutes,
    estimateDeltaMinutes: estimateMinutes === undefined
      ? undefined
      : Math.round(activeMs / 60_000) - estimateMinutes,
    dailyActiveMs,
    needsReview: reviewReasons.size > 0,
    reviewReasons: [...reviewReasons]
  };
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

function dailyDeckTiming(snapshot: DailyTaskTimingSnapshot) {
  const state = snapshot.needsReview
    ? "needs-review" as const
    : snapshot.status === "not-started"
      ? "idle" as const
      : snapshot.status;
  return {
    state,
    activeSeconds: Math.floor(snapshot.activeMs / 1_000),
    wallClockSeconds: Math.floor(snapshot.wallMs / 1_000),
    interruptionCount: snapshot.interruptionCount,
    firstStartedAt: snapshot.firstStartedAt,
    activeSince: snapshot.activeSince,
    completedAt: snapshot.completedAt,
    timingRevision: snapshot.timingRevision
  };
}

function dailyBridgeTimingState(snapshot: DailyTaskTimingSnapshot) {
  if (snapshot.needsReview) return "needs-review" as const;
  if (snapshot.status === "not-started") return "idle" as const;
  return snapshot.status;
}

function dailyTimingStatusLabel(
  status: DailyTaskTimingSnapshot["status"],
  language: ToWriteSettings["language"]
): string {
  const zh = language === "zh";
  if (status === "running") return zh ? "进行中" : "Running";
  if (status === "paused") return zh ? "已暂停" : "Paused";
  if (status === "completed") return zh ? "已完成" : "Completed";
  return zh ? "未开始" : "Not started";
}

function dailyDeckTimingStatusLabel(
  status: ReturnType<typeof dailyDeckTiming>["state"],
  language: ToWriteSettings["language"]
): string {
  if (status === "needs-review") return language === "zh" ? "待确认" : "Needs review";
  return dailyTimingStatusLabel(
    status === "idle" ? "not-started" : status,
    language
  );
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

function inclusiveDailyDates(from: string, to: string, maxDays: number): string[] {
  const start = new Date(`${formatDailyInputDate(from)}T12:00:00`);
  const end = new Date(`${formatDailyInputDate(to)}T12:00:00`);
  if (start.getTime() > end.getTime()) {
    throw new Error("Daily analytics range starts after it ends.");
  }
  const result: string[] = [];
  for (let current = start; current.getTime() <= end.getTime(); current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 12)) {
    if (result.length >= maxDays) throw new Error(`Daily analytics range exceeds ${maxDays} days.`);
    result.push(formatDailyInputDate(current));
  }
  return result;
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

function isBlankMarkdownEditorDoubleClick(event: MouseEvent): boolean {
  if (event.button !== 0) return false;
  const selection = typeof window.getSelection === "function" ? window.getSelection() : null;
  if (selection && !selection.isCollapsed) return false;
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target?.closest(".markdown-source-view .cm-editor")) return false;
  if (target.closest("a, button, input, textarea, select, [role='button'], .cm-widgetBuffer")) return false;
  const line = target.closest<HTMLElement>(".cm-line");
  if (line && line.textContent?.trim()) return false;
  return Boolean(line || target.closest(".cm-content, .cm-scroller"));
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
  if (action === "toggle_timer") return "Timer updated";
  if (action === "pause_task") return "Paused";
  if (action === "resume_task") return "Resumed";
  if (action === "page_prev" || action === "page_next") return "Page queued";
  if (action === "task_prev" || action === "task_next") return "Task queued";
  if (action === "item_prev" || action === "item_next") return "Item queued";
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
