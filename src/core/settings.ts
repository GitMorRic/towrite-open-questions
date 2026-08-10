import type { OpenQuestionColor, OpenQuestionLane, QuestionStatusOption } from "./types";
import type { PushHabitRule, PushRuntimeState, PushTargetSettings, ToWritePushSettings } from "../push/types";
import type { HabitLearningState } from "../learning/types";
import type { SuggestionNotificationEvent } from "../suggestions/types";
import { DEFAULT_DEVICE_BUTTON_MAPPINGS, normalizeDeviceButtonMappings } from "../device-interactions";
import type { AiAssistantState } from "../ai/chat";
import { DEFAULT_CAPTURE_BRIDGE_SETTINGS } from "../capture-bridge/settings";
import type { CaptureBridgeSettings } from "../capture-bridge/types";
import type { LocalTapSelectionState } from "../capture-bridge/selection";
import type { EchoCard } from "../hub/echo-cards";
import type { DailyActivityState } from "../daily";
import type {
  WorkPoolProjectRule,
  WorkPoolProjectAppearance,
  WorkPoolViewPreset
} from "../work-pool/types";

export type ToWriteLanguage = "zh" | "en";

/** Controls only ToWrite's left Ribbon shortcuts. Commands remain available. */
export interface ToWriteRibbonSettings {
  workspace: boolean;
  questions: boolean;
  capture: boolean;
  ai: boolean;
  focus: boolean;
}

export function normalizeRibbonSettings(
  settings?: Partial<ToWriteRibbonSettings>
): ToWriteRibbonSettings {
  return {
    workspace: settings?.workspace !== false,
    questions: settings?.questions === true,
    capture: settings?.capture === true,
    ai: settings?.ai === true,
    focus: settings?.focus === true
  };
}

export interface ToWriteAiSettings {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  autoRun: boolean;
  maxAutoRunsPerSession: number;
  rerankLocalNotes: boolean;
}

export type ToWriteQuote0LaneScope = "" | OpenQuestionLane;
export type ToWriteQuote0DashboardApi = "text" | "image" | "canvas";
export type ToWriteQuote0ImageDitherType = "NONE" | "DIFFUSION" | "ORDERED";

export interface ToWriteQuote0Settings {
  enabled: boolean;
  apiBaseUrl: string;
  apiKey: string;
  deviceId: string;
  taskKey: string;
  taskAlias: string;
  dashboardApi: ToWriteQuote0DashboardApi;
  imageTaskKey: string;
  imageTaskAlias: string;
  imageDitherType: ToWriteQuote0ImageDitherType;
  imageBorder: 0 | 1;
  canvasTaskAlias: string;
  canvasBorder: 0 | 1;
  refreshSeconds: number;
  forceRefreshAfterSend: boolean;
  lane: ToWriteQuote0LaneScope;
  nfcToken: string;
  cursor: number;
  lastSyncedQuestionId: string;
  lastSyncedAt: string;
  lastError: string;
}

export interface ToWriteExternalApiSettings {
  enabled: boolean;
  bindHost: string;
  port: number;
  token: string;
  allowQueryTokenForRead: boolean;
  publicBaseUrl: string;
}

export interface WorkflowStageSettings {
  id: string;
  title: string;
  description: string;
  color: OpenQuestionColor;
  folderPrefixes: string[];
  tags: string[];
  limit: number;
  staleAfterDays: number;
}

export interface WorkflowStagesSettings {
  enabled: boolean;
  stages: WorkflowStageSettings[];
}

export interface ArticleTypeSettings {
  id: string;
  title: string;
  color: OpenQuestionColor;
  folderPrefixes: string[];
  tags: string[];
}

export interface ArticleTypesSettings {
  enabled: boolean;
  parseHierarchicalTags: boolean;
  types: ArticleTypeSettings[];
}

export interface ToWriteDeviceCaptureSettings {
  enabled: boolean;
  inboxFile: string;
  targetFolders: string[];
  defaultTags: string[];
  appendHeading: string;
  localRecommendations: boolean;
  includeFolders: string[];
  excludeFolders: string[];
  excludeTags: string[];
  excludeFrontmatter: string[];
}

export interface ToWriteLearningSettings {
  enabled: boolean;
  retentionDays: number;
  idleMinutes: number;
  notificationsEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  maxHabitNotificationsPerDay: number;
}

export interface ToWriteBackendSettings {
  enabled: boolean;
  baseUrl: string;
  token: string;
  useForRecommendations: boolean;
  useForHabitSuggestions: boolean;
  timeoutMs: number;
}

export type ToWriteHubSelectionMode = "manual" | "agent" | "rotation" | "schedule";

/** Public Device Hub connection. Secrets stay in plugin data and are never put in URLs. */
export interface ToWriteHubSettings {
  enabled: boolean;
  baseUrl: string;
  receiverId: string;
  receiverToken: string;
  /** Public P-256 JWK copied to the Receiver registration. */
  receiverPublicKeyJwk: string;
  /** Private P-256 JWK stays only in local plugin data and is never rendered or uploaded. */
  receiverPrivateKeyJwk: string;
  /** Connector-local HMAC key for opaque refs; never uploaded or placed in a URL. */
  referenceSecret: string;
  deviceId: string;
  syncIntervalSeconds: number;
  shareDisplayBody: boolean;
  /** Ask the Hub to vibrate for explicit user "show now" selections. */
  manualSelectionVibration: boolean;
  /** Compatibility mirror for older settings; selectionMode is authoritative. */
  autoSelect: boolean;
  selectionMode: ToWriteHubSelectionMode;
  autoAddSelections: boolean;
  rotationIntervalMinutes: number;
  rotationCursor: number;
  lastRotationCandidateId: string;
  lastRotationContentId: string;
  manualHoldMinutes: number;
  manualHoldUntil: string;
  manualHoldCandidateId: string;
  manualHoldContentId: string;
  /** Recently consumed schedule occurrence IDs; prevents overlapping cards from alternating in one window. */
  scheduleOccurrenceIds: string[];
  lastScheduleOccurrenceId: string;
  manualPlace: string;
  manualMode: string;
  tapUrl: string;
  lastSyncedAt: string;
  lastError: string;
  lastStateVersion: number;
  lastSelectedContentId: string;
  lastDisplayedContentId: string;
}

export type ToWriteDeviceProfileKind = "mobile-eink" | "eink-bw" | "desktop-card";
export type ToWriteDeviceProfilePage = "home" | "cards" | "workflow" | "articles";

export interface ToWriteDeviceProfileSettings {
  id: string;
  name: string;
  profile: ToWriteDeviceProfileKind;
  width: number;
  height: number;
  inches: number;
  defaultPage: ToWriteDeviceProfilePage;
  defaultLane?: OpenQuestionLane | "";
  refreshSeconds: number;
}

export interface ToWriteReminderPreset {
  label: string;
  value: string;
}

export type ToWriteInboxGroupBy = "project" | "folder";

export interface ToWriteInboxSettings {
  enabled: boolean;
  /** Vault-relative roots monitored without reading note bodies. */
  folderPrefixes: string[];
  /** Add `workflow_stage: inbox` to new or moved Markdown notes under a watched root. */
  autoApplyStageOnCreate: boolean;
  groupBy: ToWriteInboxGroupBy;
  maxItems: number;
  /** Allow locally indexed Inbox notes to enter the privacy-gated device candidate pool. */
  includeInDeviceCandidates: boolean;
}

export interface ToWriteDailySettings {
  enabled: boolean;
  /** Exactly one Markdown source is active at a time. */
  planSourceMode: "daily-note" | "fixed-document";
  /** Prefer the Obsidian core Daily Notes folder/format/template when available. */
  dailyNoteSource: "obsidian" | "custom";
  /** Vault-relative root containing YYYY-MM-DD daily notes. */
  dailyNoteRoot: string;
  dailyNoteFormat: string;
  /** Fixed planner document used when planSourceMode is fixed-document. */
  fixedPlanPath: string;
  /** Markdown truth source for reusable work that has not been assigned to a day. */
  taskPoolPath: string;
  /** Return unfinished pool-backed assignments when a day has ended. */
  autoReturnUnfinished: boolean;
  /**
   * Mirror scheduling fields as Tasks emoji on the checkbox line. Disabled by
   * default so ToWrite metadata never changes the human-readable task title.
   */
  tasksCompatibilityOutput: boolean;
  /** User-owned category presets used by the planner and task-pool board. */
  categoryPresets: ToWriteDailyCategoryPreset[];
  dashboardDefaultView: "list" | "board" | "table" | "calendar";
  /** User-authored lines shown in the compact focus-window message carousel. */
  focusMessages: string[];
  /** Zero disables automatic carousel advance. */
  focusMessageIntervalSeconds: 0 | 10 | 30 | 60;
  /** Date section heading in a fixed planner document remains YYYY-MM-DD. */
  planHeading: string;
  todoHeading: string;
  summaryHeading: string;
  activityTracking: boolean;
  rawEventRetentionDays: number;
  /** Content-free task timer ledger and pause/resume controls. */
  taskTimingEnabled: boolean;
  /** Treat an unclosed interval older than this as requiring confirmation. */
  taskTimingReviewHours: number;
  /** Optional coarse e-ink refresh while a task is running; zero disables it. */
  runningCardRefreshMinutes: 0 | 5 | 15 | 30;
  /** Lightweight task status controls in configured plan documents. */
  editorTaskControls: boolean;
  attachmentFolder: string;
  includeInDeviceCandidates: boolean;
  /**
   * Summary cards are separate from task delivery and never enter a real
   * queue unless the user explicitly enables a policy. `none` still permits
   * the one-shot "send now" action from the Today dashboard.
   */
  summaryDevicePolicy: import("../daily/types").DailySummaryDevicePolicy;
  /** Prefer the trusted Backend DailyOps writer while its capability handshake is healthy. */
  writerMode: "auto" | "local" | "backend";
}

export interface ToWriteDailyCategoryPreset {
  id: string;
  label: string;
  color: string;
  icon?: string;
}

export interface ToWriteWorkPoolSettings {
  defaultViewId: string;
  views: WorkPoolViewPreset[];
  projectFrontmatterKeys: string[];
  projectTagPrefixes: string[];
  projectRules: WorkPoolProjectRule[];
  projectAppearances: WorkPoolProjectAppearance[];
  pageSize: number;
  defaultGroupsExpanded: boolean;
  showTechnicalMetadata: boolean;
  /** Explicit Vault files/folders whose ordinary Markdown checkboxes may enter the Work Pool. */
  includedSourcePaths: string[];
  autoIncludeDailyLinks: boolean;
  autoIncludeWorkflowNotes: boolean;
  autoIncludeQuestionNotes: boolean;
  hiddenItemIds: string[];
  excludedSourcePaths: string[];
}

export interface ToWriteSettings {
  language: ToWriteLanguage;
  ribbon: ToWriteRibbonSettings;
  exportDirectory: string;
  autoExport: boolean;
  autoOpenSidebar: boolean;
  groupCurrentByHeading: boolean;
  enableCandidateDetection: boolean;
  enableEditorDecorations: boolean;
  compactEditorDecorations: boolean;
  candidateTriggerWords: string[];
  statusOptions: QuestionStatusOption[];
  defaultThinkColor: OpenQuestionColor;
  defaultWriteColor: OpenQuestionColor;
  externalApi: ToWriteExternalApiSettings;
  deviceCapture: ToWriteDeviceCaptureSettings;
  learning: ToWriteLearningSettings;
  backend: ToWriteBackendSettings;
  captureBridge: CaptureBridgeSettings;
  inbox: ToWriteInboxSettings;
  daily: ToWriteDailySettings;
  workPool: ToWriteWorkPoolSettings;
  /** User-authored e-ink cards. Built-in examples are immutable presets and are not persisted here. */
  echoCards: EchoCard[];
  hub: ToWriteHubSettings;
  deviceProfiles: ToWriteDeviceProfileSettings[];
  articleTypes: ArticleTypesSettings;
  workflowStages: WorkflowStagesSettings;
  reminderPresets: ToWriteReminderPreset[];
  ai: ToWriteAiSettings;
  quote0: ToWriteQuote0Settings;
  push: ToWritePushSettings;
  writeArticleProperties: boolean;
}

export interface ToWriteSavedData {
  settings: ToWriteSettings;
  questionStates: Record<string, import("./types").StoredQuestionState>;
  pushState?: PushRuntimeState;
  learningState?: HabitLearningState;
  suggestionNotifications?: SuggestionNotificationEvent[];
  snoozedSuggestions?: Record<string, string>;
  securityMigrationVersion?: number;
  aiAssistantState?: AiAssistantState;
  captureBridgeState?: LocalTapSelectionState;
  dailyActivityState?: DailyActivityState;
  dailyDeviceStateVersion?: number;
  /** Bounded idempotency keys for one-shot local Daily device schedules. */
  dailyScheduleOccurrenceIds?: string[];
  /** Bounded, content-free idempotency journal for desktop UI side effects. */
  deviceCommandJournal?: Array<{
    eventId: string;
    fingerprint: string;
    /**
     * `indeterminate` is persisted before a UI side effect. After a crash it
     * is terminal and must never be replayed as successfully executed.
     */
    status: "processing" | "indeterminate" | "executed" | "unsupported" | "conflict";
    processedAt: string;
    action: string;
    resultRevision?: string;
    timingRevision?: string;
    displayMessage?: string;
  }>;
}

export const DEFAULT_STATUS_OPTIONS: QuestionStatusOption[] = [
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
  { id: "blocked", label: "Blocked" },
  { id: "paused", label: "Paused" },
  { id: "ignored", label: "Ignored" },
  { id: "candidate", label: "Candidate" }
];

export const DEFAULT_WORKFLOW_STAGES: WorkflowStageSettings[] = [
  {
    id: "inbox",
    title: "Inbox",
    description: "未处理、待整理或等待分流",
    color: "slate",
    folderPrefixes: [],
    tags: ["inbox"],
    limit: 50,
    staleAfterDays: 7
  },
  {
    id: "raw",
    title: "Raw",
    description: "Capture / 未整理",
    color: "slate",
    folderPrefixes: ["00-Raw", "MindFlow/00-Raw"],
    tags: ["raw", "capture"],
    limit: 20,
    staleAfterDays: 14
  },
  {
    id: "sparks",
    title: "Sparks",
    description: "灵感、火花和还没展开的开头",
    color: "amber",
    folderPrefixes: ["01-Sparks", "MindFlow/01-Sparks"],
    tags: ["spark", "sparks"],
    limit: 20,
    staleAfterDays: 7
  },
  {
    id: "initialize",
    title: "Initialize",
    description: "已初步整理，等待进入推进",
    color: "mint",
    folderPrefixes: ["01-Initialize", "Techbench/01-Initialize"],
    tags: ["initialize", "initialized"],
    limit: 20,
    staleAfterDays: 21
  },
  {
    id: "processing",
    title: "Processing",
    description: "需要继续查资料、讨论或写作推进",
    color: "sky",
    folderPrefixes: ["02-Processing", "Techbench/02-Processing"],
    tags: ["processing", "next"],
    limit: 20,
    staleAfterDays: 10
  },
  {
    id: "archive",
    title: "Archive",
    description: "已归档或暂时完成",
    color: "violet",
    folderPrefixes: ["03-Archive", "MindFlow/03-Archive", "Techbench/03-Archive"],
    tags: ["archive", "archived"],
    limit: 20,
    staleAfterDays: 0
  }
];

/** Inbox is a core workflow state shared by the sidebar, Capture, and device delivery. */
export function ensureInboxWorkflowStage(stages: WorkflowStageSettings[]): WorkflowStageSettings[] {
  if (stages.some((stage) => String(stage.id ?? "").trim().toLocaleLowerCase() === "inbox")) {
    return stages;
  }
  const inbox = DEFAULT_WORKFLOW_STAGES.find((stage) => stage.id === "inbox");
  return inbox
    ? [{ ...inbox, folderPrefixes: [...inbox.folderPrefixes], tags: [...inbox.tags] }, ...stages]
    : stages;
}

export const DEFAULT_ARTICLE_TYPES: ArticleTypeSettings[] = [
  {
    id: "mindflow",
    title: "MindFlow",
    color: "mint",
    folderPrefixes: ["MindFlow", "ByteDance/MindFlow"],
    tags: ["mindflow"]
  },
  {
    id: "tech",
    title: "Tech",
    color: "sky",
    folderPrefixes: ["Techbench", "Tech"],
    tags: ["tech"]
  },
  {
    id: "project",
    title: "Project",
    color: "violet",
    folderPrefixes: ["Projects", "Project"],
    tags: ["project"]
  }
];

export const DEFAULT_DEVICE_PROFILES: ToWriteDeviceProfileSettings[] = [
  {
    id: "eink-27-landscape",
    name: "2.7 inch e-ink landscape",
    profile: "eink-bw",
    width: 264,
    height: 176,
    inches: 2.7,
    defaultPage: "home",
    defaultLane: "",
    refreshSeconds: 300
  }
];

export const DEFAULT_QUOTE0_SETTINGS: ToWriteQuote0Settings = {
  enabled: false,
  apiBaseUrl: "https://dot.mindreset.tech",
  apiKey: "",
  deviceId: "",
  taskKey: "",
  taskAlias: "ToWrite Open Questions",
  dashboardApi: "text",
  imageTaskKey: "",
  imageTaskAlias: "ToWrite Dashboard",
  imageDitherType: "NONE",
  imageBorder: 0,
  canvasTaskAlias: "ToWrite Dashboard",
  canvasBorder: 0,
  refreshSeconds: 300,
  forceRefreshAfterSend: true,
  lane: "",
  nfcToken: "",
  cursor: 0,
  lastSyncedQuestionId: "",
  lastSyncedAt: "",
  lastError: ""
};

export const DEFAULT_PUSH_SETTINGS: ToWritePushSettings = {
  enabled: false,
  privacy: {
    level: "local-coarse",
    allowPreciseLocation: false,
    shareWithAi: false
  },
  targets: [
    {
      id: "local-web",
      name: "Local web / phone",
      type: "local-web",
      enabled: true,
      profile: "mobile-eink",
      width: 390,
      height: 844,
      inches: 6.1,
      defaultPage: "home",
      defaultLane: "",
      refreshSeconds: 60,
      quietHoursStart: "",
      quietHoursEnd: "",
      token: "",
      capabilities: ["pull", "sse", "feedback", "input"],
      buttonMappings: DEFAULT_DEVICE_BUTTON_MAPPINGS
    },
    {
      id: "quote0",
      name: "quote0",
      type: "quote0",
      enabled: false,
      profile: "eink-bw",
      width: 264,
      height: 176,
      inches: 2.7,
      defaultPage: "cards",
      defaultLane: "",
      refreshSeconds: 300,
      quietHoursStart: "",
      quietHoursEnd: "",
      token: "",
      capabilities: ["push", "nfc", "text-api"],
      buttonMappings: DEFAULT_DEVICE_BUTTON_MAPPINGS
    }
  ],
  habits: [
    {
      id: "morning-sparks",
      label: "Morning sparks",
      enabled: true,
      timeStart: "06:00",
      timeEnd: "11:00",
      placeLabel: "",
      mode: "",
      stageIds: ["raw", "sparks"],
      lanes: ["think"],
      statuses: [],
      targetIds: [],
      boost: 18,
      limitPerDay: 12
    },
    {
      id: "evening-writing",
      label: "Evening writing",
      enabled: true,
      timeStart: "18:00",
      timeEnd: "23:00",
      placeLabel: "",
      mode: "writing",
      stageIds: ["processing"],
      lanes: ["write"],
      statuses: [],
      targetIds: [],
      boost: 20,
      limitPerDay: 12
    }
  ],
  habitText: "",
  aiRerank: false
};

export const DEFAULT_REMINDER_PRESETS: ToWriteReminderPreset[] = [
  { label: "15 分钟后", value: "15m" },
  { label: "1 小时后", value: "1h" },
  { label: "3 小时后", value: "3h" },
  { label: "今天 18:00", value: "today 18:00" },
  { label: "今天 21:00", value: "today 21:00" },
  { label: "明天 09:00", value: "tomorrow 09:00" },
  { label: "明天 21:00", value: "tomorrow 21:00" },
  { label: "下周 09:00", value: "nextWeek 09:00" }
];

export const DEFAULT_SETTINGS: ToWriteSettings = {
  language: "zh",
  ribbon: {
    workspace: true,
    questions: false,
    capture: false,
    ai: false,
    focus: false
  },
  exportDirectory: ".obsidian-open-questions",
  autoExport: true,
  autoOpenSidebar: true,
  groupCurrentByHeading: false,
  enableCandidateDetection: true,
  enableEditorDecorations: true,
  compactEditorDecorations: false,
  candidateTriggerWords: [
    "\u8fd9\u91cc\u8981\u8865",
    "\u8865\u4e00\u70b9",
    "\u8865\u5145",
    "\u8fd8\u8981\u8865",
    "\u5206\u6790\u4e00\u4e0b",
    "\u6709\u6ca1\u6709\u5b9e\u6d4b",
    "\u9700\u8981\u786e\u8ba4",
    "\u6765\u6e90\u662f\u4ec0\u4e48",
    "\u7ee7\u7eed\u5199",
    "\u540e\u7eed\u5199",
    "\u5f85\u5199",
    "\u8865\u5199",
    "\u6269\u5199",
    "todo",
    "TODO"
  ],
  statusOptions: DEFAULT_STATUS_OPTIONS,
  defaultThinkColor: "amber",
  defaultWriteColor: "sky",
  externalApi: {
    enabled: false,
    bindHost: "127.0.0.1",
    port: 48321,
    token: "",
    allowQueryTokenForRead: false,
    publicBaseUrl: ""
  },
  deviceCapture: {
    enabled: true,
    inboxFile: "00-Raw/Device Inbox.md",
    targetFolders: ["00-Raw", "01-Sparks", "02-Processing"],
    defaultTags: ["capture", "device"],
    appendHeading: "Captures",
    localRecommendations: true,
    includeFolders: [],
    excludeFolders: [".obsidian-open-questions", "99-System", "Templates", ".trash"],
    excludeTags: ["private", "no-ai", "no-cloud"],
    excludeFrontmatter: ["private", "no_ai", "ai_private", "no_cloud"]
  },
  learning: {
    enabled: false,
    retentionDays: 30,
    idleMinutes: 5,
    notificationsEnabled: false,
    quietHoursStart: "23:00",
    quietHoursEnd: "08:00",
    maxHabitNotificationsPerDay: 3
  },
  backend: {
    enabled: false,
    baseUrl: "http://127.0.0.1:8790",
    token: "",
    useForRecommendations: true,
    useForHabitSuggestions: false,
    timeoutMs: 2500
  },
  captureBridge: { ...DEFAULT_CAPTURE_BRIDGE_SETTINGS },
  inbox: {
    enabled: true,
    folderPrefixes: ["00-Raw_Materials/Quick_Notes", "00-Raw/Quick_Notes"],
    autoApplyStageOnCreate: false,
    groupBy: "project",
    maxItems: 200,
    includeInDeviceCandidates: true
  },
  daily: {
    enabled: true,
    planSourceMode: "daily-note",
    dailyNoteSource: "obsidian",
    dailyNoteRoot: "Daily",
    dailyNoteFormat: "YYYY-MM-DD",
    fixedPlanPath: "Planning/Daily Plans.md",
    taskPoolPath: "Planning/Task Pool.md",
    autoReturnUnfinished: true,
    tasksCompatibilityOutput: false,
    categoryPresets: [
      { id: "project", label: "项目", color: "#4f8cff", icon: "folder-kanban" },
      { id: "writing", label: "写作与发布", color: "#d1843e", icon: "pen-line" },
      { id: "learning", label: "记录与搞懂", color: "#3e9b78", icon: "lightbulb" },
      { id: "other", label: "其他", color: "#7b8494", icon: "shapes" }
    ],
    dashboardDefaultView: "list",
    focusMessages: [],
    focusMessageIntervalSeconds: 30,
    planHeading: "\u4eca\u65e5\u8ba1\u5212",
    todoHeading: "ToDo",
    summaryHeading: "\u4eca\u65e5\u603b\u7ed3",
    activityTracking: true,
    rawEventRetentionDays: 30,
    taskTimingEnabled: true,
    taskTimingReviewHours: 4,
    runningCardRefreshMinutes: 15,
    editorTaskControls: true,
    attachmentFolder: "00-Raw_Materials/Voice_Captures",
    includeInDeviceCandidates: true,
    summaryDevicePolicy: "none",
    writerMode: "auto"
  },
  workPool: {
    defaultViewId: "all-work",
    views: [
      {
        id: "all-work",
        label: "全部工作",
        layout: "board",
        primary: "workType",
        secondary: "project",
        history: "active",
        defaultExpanded: true
      },
      {
        id: "by-project",
        label: "按项目",
        layout: "board",
        primary: "project",
        secondary: "note",
        history: "active",
        defaultExpanded: true
      },
      {
        id: "by-workflow",
        label: "按流程",
        layout: "list",
        primary: "stage",
        secondary: "articleType",
        history: "active"
      },
      {
        id: "by-source",
        label: "按来源",
        layout: "list",
        primary: "source",
        secondary: "note",
        history: "active"
      }
    ],
    projectFrontmatterKeys: ["project", "projects"],
    projectTagPrefixes: ["project/"],
    projectRules: [],
    projectAppearances: [],
    pageSize: 80,
    defaultGroupsExpanded: true,
    showTechnicalMetadata: false,
    includedSourcePaths: [],
    autoIncludeDailyLinks: true,
    autoIncludeWorkflowNotes: true,
    autoIncludeQuestionNotes: true,
    hiddenItemIds: [],
    excludedSourcePaths: []
  },
  echoCards: [],
  hub: {
    enabled: false,
    baseUrl: "http://127.0.0.1:8080",
    receiverId: "",
    receiverToken: "",
    receiverPublicKeyJwk: "",
    receiverPrivateKeyJwk: "",
    referenceSecret: "",
    deviceId: "",
    syncIntervalSeconds: 60,
    shareDisplayBody: false,
    manualSelectionVibration: true,
    autoSelect: true,
    selectionMode: "agent",
    autoAddSelections: true,
    rotationIntervalMinutes: 30,
    rotationCursor: 0,
    lastRotationCandidateId: "",
    lastRotationContentId: "",
    manualHoldMinutes: 30,
    manualHoldUntil: "",
    manualHoldCandidateId: "",
    manualHoldContentId: "",
    scheduleOccurrenceIds: [],
    lastScheduleOccurrenceId: "",
    manualPlace: "",
    manualMode: "",
    tapUrl: "",
    lastSyncedAt: "",
    lastError: "",
    lastStateVersion: 0,
    lastSelectedContentId: "",
    lastDisplayedContentId: ""
  },
  deviceProfiles: DEFAULT_DEVICE_PROFILES,
  articleTypes: {
    enabled: true,
    parseHierarchicalTags: true,
    types: DEFAULT_ARTICLE_TYPES
  },
  workflowStages: {
    enabled: false,
    stages: DEFAULT_WORKFLOW_STAGES
  },
  reminderPresets: DEFAULT_REMINDER_PRESETS,
  ai: {
    enabled: false,
    baseUrl: "",
    apiKey: "",
    model: "gpt-4o-mini",
    autoRun: false,
    maxAutoRunsPerSession: 5,
    rerankLocalNotes: true
  },
  quote0: DEFAULT_QUOTE0_SETTINGS,
  push: DEFAULT_PUSH_SETTINGS,
  writeArticleProperties: false
};

export function normalizeArticleTypesSettings(settings?: Partial<ArticleTypesSettings>): ArticleTypesSettings {
  const types = Array.isArray(settings?.types) && settings.types.length > 0
    ? settings.types
    : DEFAULT_ARTICLE_TYPES;
  const normalized = normalizeArticleTypeList(types);
  return {
    enabled: settings?.enabled !== false,
    parseHierarchicalTags: settings?.parseHierarchicalTags !== false,
    types: normalized.length > 0 ? normalized : DEFAULT_ARTICLE_TYPES
  };
}

export function normalizeInboxSettings(settings?: Partial<ToWriteInboxSettings>): ToWriteInboxSettings {
  const folderPrefixes = normalizeArticleStringList(settings?.folderPrefixes);
  return {
    enabled: settings?.enabled !== false,
    folderPrefixes: folderPrefixes.length > 0 ? folderPrefixes : [...DEFAULT_SETTINGS.inbox.folderPrefixes],
    autoApplyStageOnCreate: settings?.autoApplyStageOnCreate === true,
    groupBy: settings?.groupBy === "folder" ? "folder" : "project",
    maxItems: clampIntegerSetting(settings?.maxItems, 10, 2_000, DEFAULT_SETTINGS.inbox.maxItems),
    includeInDeviceCandidates: settings?.includeInDeviceCandidates !== false
  };
}

export function normalizeDailySettings(settings?: Partial<ToWriteDailySettings>): ToWriteDailySettings {
  const defaults = DEFAULT_SETTINGS.daily;
  return {
    enabled: settings?.enabled !== false,
    planSourceMode: settings?.planSourceMode === "fixed-document" ? "fixed-document" : "daily-note",
    dailyNoteSource: settings?.dailyNoteSource === "custom" ? "custom" : "obsidian",
    dailyNoteRoot: normalizeVaultFolderSetting(settings?.dailyNoteRoot, defaults.dailyNoteRoot),
    dailyNoteFormat: normalizeDailyNoteFormatSetting(settings?.dailyNoteFormat),
    fixedPlanPath: normalizeVaultFileSetting(settings?.fixedPlanPath, defaults.fixedPlanPath),
    taskPoolPath: normalizeVaultFileSetting(settings?.taskPoolPath, defaults.taskPoolPath),
    autoReturnUnfinished: settings?.autoReturnUnfinished !== false,
    tasksCompatibilityOutput: settings?.tasksCompatibilityOutput === true,
    categoryPresets: normalizeDailyCategoryPresets(settings?.categoryPresets, defaults.categoryPresets),
    dashboardDefaultView: settings?.dashboardDefaultView === "board"
      || settings?.dashboardDefaultView === "table"
      || settings?.dashboardDefaultView === "calendar"
      ? settings.dashboardDefaultView
      : "list",
    focusMessages: normalizeFocusMessages(settings?.focusMessages),
    focusMessageIntervalSeconds: normalizeFocusMessageInterval(settings?.focusMessageIntervalSeconds),
    planHeading: normalizeHeadingSetting(settings?.planHeading, defaults.planHeading),
    todoHeading: normalizeHeadingSetting(settings?.todoHeading, defaults.todoHeading),
    summaryHeading: normalizeHeadingSetting(settings?.summaryHeading, defaults.summaryHeading),
    activityTracking: settings?.activityTracking !== false,
    rawEventRetentionDays: clampIntegerSetting(
      settings?.rawEventRetentionDays,
      1,
      365,
      defaults.rawEventRetentionDays
    ),
    taskTimingEnabled: settings?.taskTimingEnabled !== false,
    taskTimingReviewHours: clampIntegerSetting(
      settings?.taskTimingReviewHours,
      1,
      24,
      defaults.taskTimingReviewHours
    ),
    runningCardRefreshMinutes: normalizeRunningCardRefreshMinutes(settings?.runningCardRefreshMinutes),
    editorTaskControls: settings?.editorTaskControls !== false,
    attachmentFolder: normalizeVaultFolderSetting(settings?.attachmentFolder, defaults.attachmentFolder),
    includeInDeviceCandidates: settings?.includeInDeviceCandidates !== false,
    summaryDevicePolicy: settings?.summaryDevicePolicy === "manual"
      || settings?.summaryDevicePolicy === "rotation"
      || settings?.summaryDevicePolicy === "agent"
      ? settings.summaryDevicePolicy
      : "none",
    writerMode: settings?.writerMode === "local" || settings?.writerMode === "backend"
      ? settings.writerMode
      : "auto"
  };
}

export function normalizeWorkPoolSettings(
  settings?: Partial<ToWriteWorkPoolSettings>
): ToWriteWorkPoolSettings {
  const defaults = DEFAULT_SETTINGS.workPool;
  const views = normalizeWorkPoolViews(settings?.views, defaults.views);
  const defaultViewId = views.some((view) => view.id === settings?.defaultViewId)
    ? String(settings?.defaultViewId)
    : views.some((view) => view.id === defaults.defaultViewId)
      ? defaults.defaultViewId
      : views[0].id;
  return {
    defaultViewId,
    views,
    projectFrontmatterKeys: [...new Set(normalizedSimpleList(
      settings?.projectFrontmatterKeys,
      defaults.projectFrontmatterKeys
    ).map((value) => value.toLocaleLowerCase()))],
    projectTagPrefixes: [...new Set(normalizedSimpleList(
      settings?.projectTagPrefixes,
      defaults.projectTagPrefixes
    ).map((value) => value.replace(/^#+/u, "").toLocaleLowerCase()))],
    projectRules: normalizeWorkPoolProjectRules(settings?.projectRules),
    projectAppearances: normalizeWorkPoolProjectAppearances(settings?.projectAppearances),
    pageSize: clampIntegerSetting(settings?.pageSize, 20, 500, defaults.pageSize),
    defaultGroupsExpanded: settings?.defaultGroupsExpanded !== false,
    showTechnicalMetadata: settings?.showTechnicalMetadata === true,
    includedSourcePaths: normalizeWorkPoolSourcePaths(settings?.includedSourcePaths),
    autoIncludeDailyLinks: settings?.autoIncludeDailyLinks !== false,
    autoIncludeWorkflowNotes: settings?.autoIncludeWorkflowNotes !== false,
    autoIncludeQuestionNotes: settings?.autoIncludeQuestionNotes !== false,
    hiddenItemIds: normalizeWorkPoolHiddenItemIds(settings?.hiddenItemIds),
    excludedSourcePaths: normalizeWorkPoolExcludedSourcePaths(settings?.excludedSourcePaths)
  };
}

function normalizeWorkPoolHiddenItemIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, 512))
    .filter(Boolean))];
}

function normalizeWorkPoolExcludedSourcePaths(value: unknown): string[] {
  return normalizeWorkPoolSourcePaths(value);
}

function normalizeWorkPoolSourcePaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "").replace(/\/{2,}/gu, "/"))
    .filter((entry) => Boolean(entry) && !/(?:^|\/)\.\.?($|\/)/u.test(entry)))];
}

function normalizeWorkPoolViews(
  value: unknown,
  fallback: WorkPoolViewPreset[]
): WorkPoolViewPreset[] {
  if (!Array.isArray(value)) return fallback.map((view) => ({ ...view }));
  const output: WorkPoolViewPreset[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Partial<WorkPoolViewPreset>;
    const id = normalizedSettingId(record.id ?? record.label);
    const label = String(record.label ?? "").trim().replace(/\s+/gu, " ").slice(0, 60);
    if (!id || !label || seen.has(id)) continue;
    const primary = normalizeWorkPoolDimension(record.primary, "workType");
    let secondary = normalizeWorkPoolDimension(record.secondary, "none");
    if (secondary === primary) secondary = "none";
    seen.add(id);
    output.push({
      id,
      label,
      layout: record.layout === "board" || record.layout === "list"
        ? record.layout
        : (id === "all-work" || primary === "project" ? "board" : "list"),
      primary,
      secondary,
      ...(isWorkPoolSource(record.source) ? { source: record.source } : {}),
      ...(record.history === "history" || record.history === "all"
        ? { history: record.history }
        : { history: "active" }),
      ...optionalTextFields(record, ["stageId", "typeId", "status", "workType", "project"]),
      defaultExpanded: record.defaultExpanded === true
    });
  }
  return (output.length ? output : fallback).map((view) => ({ ...view }));
}

function normalizeWorkPoolProjectRules(value: unknown): WorkPoolProjectRule[] {
  if (!Array.isArray(value)) return [];
  const output: WorkPoolProjectRule[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Partial<WorkPoolProjectRule>;
    const id = normalizedSettingId(record.id ?? record.label);
    const label = String(record.label ?? "").trim().replace(/\s+/gu, " ").slice(0, 80);
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    output.push({
      id,
      label,
      tags: normalizedSimpleList(record.tags, []),
      folderPrefixes: normalizedSimpleList(record.folderPrefixes, [])
    });
  }
  return output;
}

function normalizeWorkPoolProjectAppearances(value: unknown): WorkPoolProjectAppearance[] {
  if (!Array.isArray(value)) return [];
  const output: WorkPoolProjectAppearance[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Partial<WorkPoolProjectAppearance>;
    const projectId = normalizedSettingId(record.projectId);
    const color = /^#[0-9a-f]{6}$/iu.test(String(record.color ?? ""))
      ? String(record.color).toLocaleLowerCase()
      : "#7c6ee6";
    const icon = String(record.icon ?? "folder-kanban").trim().toLocaleLowerCase().slice(0, 40);
    if (!projectId || seen.has(projectId)) continue;
    seen.add(projectId);
    output.push({ projectId, color, icon: icon || "folder-kanban" });
  }
  return output;
}

function normalizeWorkPoolDimension(
  value: unknown,
  fallback: WorkPoolViewPreset["primary"]
): WorkPoolViewPreset["primary"] {
  return value === "workType" || value === "project" || value === "subproject" || value === "source"
    || value === "stage" || value === "articleType" || value === "note"
    || value === "status" || value === "category" || value === "none"
    ? value
    : fallback;
}

function isWorkPoolSource(value: unknown): value is NonNullable<WorkPoolViewPreset["source"]> {
  return value === "all" || value === "task" || value === "tothink"
    || value === "towrite" || value === "inbox" || value === "note";
}

function normalizedSimpleList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = [...new Set(value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean))];
  return normalized.length ? normalized : [...fallback];
}

function normalizedSettingId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60);
}

function optionalTextFields<T extends object, K extends keyof T>(
  record: T,
  keys: readonly K[]
): Partial<Pick<T, K>> {
  const output: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    const value = String(record[key] ?? "").trim();
    if (value) output[key] = value as T[K];
  }
  return output;
}

function normalizeDailyCategoryPresets(
  value: unknown,
  fallback: ToWriteDailyCategoryPreset[]
): ToWriteDailyCategoryPreset[] {
  if (!Array.isArray(value)) return fallback.map((preset) => ({ ...preset }));
  const output: ToWriteDailyCategoryPreset[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Partial<ToWriteDailyCategoryPreset>;
    const id = String(record.id ?? record.label ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 60);
    const label = String(record.label ?? "").trim().replace(/\s+/gu, " ").slice(0, 80);
    if (!id || !label || seen.has(id)) continue;
    const color = /^#[0-9a-f]{6}$/iu.test(String(record.color ?? ""))
      ? String(record.color).toLowerCase()
      : "#7b8494";
    const icon = String(record.icon ?? "").trim().replace(/[^a-z0-9-]/giu, "").slice(0, 60);
    seen.add(id);
    output.push({ id, label, color, ...(icon ? { icon } : {}) });
  }
  return (output.length ? output : fallback).map((preset) => ({ ...preset }));
}

function normalizeRunningCardRefreshMinutes(value: unknown): 0 | 5 | 15 | 30 {
  return value === 0 || value === 5 || value === 30 ? value : 15;
}

function normalizeFocusMessages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((entry) => String(entry ?? "").replace(/\s+/gu, " ").trim().slice(0, 180))
    .filter(Boolean))]
    .slice(0, 30);
}

function normalizeFocusMessageInterval(value: unknown): 0 | 10 | 30 | 60 {
  return value === 0 || value === 10 || value === 60 ? value : 30;
}

export function normalizeArticleTypeList(types: ArticleTypeSettings[]): ArticleTypeSettings[] {
  const seen = new Set<string>();
  const output: ArticleTypeSettings[] = [];

  for (const type of types) {
    const id = normalizeArticleTypeId(type.id || type.title);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    output.push({
      id,
      title: String(type.title ?? "").trim() || id,
      color: isSettingsColor(type.color) ? type.color : "slate",
      folderPrefixes: normalizeArticleStringList(type.folderPrefixes),
      tags: normalizeArticleTagList(type.tags)
    });
  }

  return output;
}

export function normalizeDeviceProfiles(profiles?: ToWriteDeviceProfileSettings[]): ToWriteDeviceProfileSettings[] {
  const source = Array.isArray(profiles) && profiles.length > 0 ? profiles : DEFAULT_DEVICE_PROFILES;
  const seen = new Set<string>();
  const output: ToWriteDeviceProfileSettings[] = [];

  for (const profile of source) {
    const id = normalizeDeviceProfileId(profile.id || profile.name);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    output.push({
      id,
      name: String(profile.name ?? "").trim() || id,
      profile: normalizeDeviceProfileKind(profile.profile),
      width: clampIntegerSetting(profile.width, 80, 2400, 264),
      height: clampIntegerSetting(profile.height, 80, 2400, 176),
      inches: clampNumberSetting(profile.inches, 1, 32, 2.7),
      defaultPage: normalizeDeviceProfilePage(profile.defaultPage),
      defaultLane: profile.defaultLane === "think" || profile.defaultLane === "write" ? profile.defaultLane : "",
      refreshSeconds: clampIntegerSetting(profile.refreshSeconds, 15, 86400, 300)
    });
  }

  return output.length > 0 ? output : DEFAULT_DEVICE_PROFILES;
}

export function normalizeReminderPresets(presets?: ToWriteReminderPreset[]): ToWriteReminderPreset[] {
  const source = Array.isArray(presets) && presets.length > 0 ? presets : DEFAULT_REMINDER_PRESETS;
  const seen = new Set<string>();
  const output: ToWriteReminderPreset[] = [];

  for (const preset of source) {
    const label = String(preset.label ?? "").trim();
    const value = String(preset.value ?? "").trim();
    const key = `${label}\u0000${value}`;
    if (!label || !value || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push({ label, value });
  }

  return output.length > 0 ? output : DEFAULT_REMINDER_PRESETS;
}

export function normalizeQuote0Settings(settings?: Partial<ToWriteQuote0Settings>): ToWriteQuote0Settings {
  return {
    ...DEFAULT_QUOTE0_SETTINGS,
    ...(settings ?? {}),
    enabled: settings?.enabled === true,
    apiBaseUrl: normalizeQuote0ApiBaseUrl(settings?.apiBaseUrl),
    apiKey: String(settings?.apiKey ?? "").trim(),
    deviceId: normalizeQuote0ShortText(settings?.deviceId, 120),
    taskKey: normalizeQuote0ShortText(settings?.taskKey, 120),
    taskAlias: normalizeQuote0ShortText(settings?.taskAlias, 100) || DEFAULT_QUOTE0_SETTINGS.taskAlias,
    dashboardApi: normalizeQuote0DashboardApi(settings?.dashboardApi),
    imageTaskKey: normalizeQuote0ShortText(settings?.imageTaskKey, 120),
    imageTaskAlias: normalizeQuote0ShortText(settings?.imageTaskAlias, 100) || DEFAULT_QUOTE0_SETTINGS.imageTaskAlias,
    imageDitherType: normalizeQuote0ImageDitherType(settings?.imageDitherType),
    imageBorder: settings?.imageBorder === 1 ? 1 : 0,
    canvasTaskAlias: normalizeQuote0ShortText(settings?.canvasTaskAlias, 100) || DEFAULT_QUOTE0_SETTINGS.canvasTaskAlias,
    canvasBorder: settings?.canvasBorder === 1 ? 1 : 0,
    refreshSeconds: clampIntegerSetting(settings?.refreshSeconds, 60, 86400, DEFAULT_QUOTE0_SETTINGS.refreshSeconds),
    forceRefreshAfterSend: settings?.forceRefreshAfterSend !== false,
    lane: settings?.lane === "think" || settings?.lane === "write" ? settings.lane : "",
    nfcToken: normalizeQuote0ShortText(settings?.nfcToken, 160),
    cursor: clampIntegerSetting(settings?.cursor, 0, 100000, 0),
    lastSyncedQuestionId: normalizeQuote0ShortText(settings?.lastSyncedQuestionId, 120),
    lastSyncedAt: normalizeQuote0ShortText(settings?.lastSyncedAt, 80),
    lastError: normalizeQuote0ShortText(settings?.lastError, 400)
  };
}

export function normalizePushSettings(
  settings?: Partial<ToWritePushSettings>,
  quote0?: ToWriteQuote0Settings
): ToWritePushSettings {
  const normalizedQuote0 = quote0 ?? DEFAULT_QUOTE0_SETTINGS;
  const targets = normalizePushTargets(settings?.targets, normalizedQuote0);
  return {
    ...DEFAULT_PUSH_SETTINGS,
    ...(settings ?? {}),
    enabled: settings?.enabled === true || normalizedQuote0.enabled,
    privacy: {
      level: settings?.privacy?.level === "precise-location" || settings?.privacy?.level === "no-location"
        ? settings.privacy.level
        : "local-coarse",
      allowPreciseLocation: settings?.privacy?.allowPreciseLocation === true,
      shareWithAi: settings?.privacy?.shareWithAi === true
    },
    targets,
    habits: normalizePushHabits(settings?.habits),
    habitText: String(settings?.habitText ?? "").trim().slice(0, 4000),
    aiRerank: settings?.aiRerank === true
  };
}

function normalizePushTargets(targets: PushTargetSettings[] | undefined, quote0: ToWriteQuote0Settings): PushTargetSettings[] {
  const source = Array.isArray(targets) && targets.length > 0
    ? targets
    : DEFAULT_PUSH_SETTINGS.targets;
  const seen = new Set<string>();
  const output: PushTargetSettings[] = [];

  for (const target of source) {
    const id = normalizePushId(target.id || target.name);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    output.push({
      id,
      name: normalizePushShortText(target.name, 100) || id,
      type: normalizePushTargetType(target.type),
      enabled: target.enabled === true,
      profile: normalizeDeviceProfileKind(target.profile),
      width: clampIntegerSetting(target.width, 80, 2400, 264),
      height: clampIntegerSetting(target.height, 80, 2400, 176),
      inches: clampNumberSetting(target.inches, 1, 32, 2.7),
      defaultPage: normalizeDeviceProfilePage(target.defaultPage),
      defaultLane: target.defaultLane === "think" || target.defaultLane === "write" ? target.defaultLane : "",
      refreshSeconds: clampIntegerSetting(target.refreshSeconds, 15, 86400, 300),
      quietHoursStart: normalizeTime(target.quietHoursStart),
      quietHoursEnd: normalizeTime(target.quietHoursEnd),
      token: normalizePushShortText(target.token, 200),
      capabilities: normalizePushStringList(target.capabilities).slice(0, 12),
      buttonMappings: normalizeDeviceButtonMappings(target.buttonMappings)
    });
  }

  const quoteTargetIndex = output.findIndex((target) => target.id === "quote0");
  const quoteTarget: PushTargetSettings = {
    id: "quote0",
    name: "quote0",
    type: "quote0",
    enabled: quote0.enabled,
    profile: "eink-bw",
    width: 264,
    height: 176,
    inches: 2.7,
    defaultPage: "cards",
    defaultLane: quote0.lane,
    refreshSeconds: quote0.refreshSeconds,
    quietHoursStart: "",
    quietHoursEnd: "",
    token: quote0.nfcToken,
    capabilities: quote0Capabilities(quote0.dashboardApi),
    buttonMappings: DEFAULT_DEVICE_BUTTON_MAPPINGS
  };

  if (quoteTargetIndex >= 0) {
    output[quoteTargetIndex] = {
      ...output[quoteTargetIndex],
      type: "quote0",
      profile: "eink-bw",
      width: 264,
      height: 176,
      inches: 2.7,
      defaultPage: "cards",
      defaultLane: quote0.lane || output[quoteTargetIndex].defaultLane,
      refreshSeconds: quote0.refreshSeconds || output[quoteTargetIndex].refreshSeconds,
      token: quote0.nfcToken || output[quoteTargetIndex].token,
      capabilities: uniquePushList([
        ...output[quoteTargetIndex].capabilities,
        "push",
        "nfc",
        "text-api",
        quote0.dashboardApi === "image" ? "image-api" : "",
        quote0.dashboardApi === "canvas" ? "canvas-api" : ""
      ]),
      buttonMappings: output[quoteTargetIndex].buttonMappings,
      enabled: quote0.enabled || output[quoteTargetIndex].enabled
    };
  } else {
    output.push(quoteTarget);
  }

  return output.length > 0 ? output : DEFAULT_PUSH_SETTINGS.targets;
}

function normalizePushHabits(habits: PushHabitRule[] | undefined): PushHabitRule[] {
  const source = Array.isArray(habits) && habits.length > 0 ? habits : DEFAULT_PUSH_SETTINGS.habits;
  const seen = new Set<string>();
  const output: PushHabitRule[] = [];

  for (const habit of source) {
    const id = normalizePushId(habit.id || habit.label);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    output.push({
      id,
      label: normalizePushShortText(habit.label, 100) || id,
      enabled: habit.enabled !== false,
      timeStart: normalizeTime(habit.timeStart),
      timeEnd: normalizeTime(habit.timeEnd),
      placeLabel: normalizePushShortText(habit.placeLabel, 80),
      mode: normalizePushShortText(habit.mode, 80),
      stageIds: normalizePushStringList(habit.stageIds).map(normalizePushId).filter(Boolean),
      lanes: normalizePushStringList(habit.lanes).filter((item): item is OpenQuestionLane => item === "think" || item === "write"),
      statuses: normalizePushStringList(habit.statuses) as PushHabitRule["statuses"],
      targetIds: normalizePushStringList(habit.targetIds).map(normalizePushId).filter(Boolean),
      boost: clampIntegerSetting(habit.boost, -100, 100, 10),
      limitPerDay: clampIntegerSetting(habit.limitPerDay, 0, 500, 0)
    });
  }

  return output;
}

function normalizePushTargetType(value: unknown): PushTargetSettings["type"] {
  return value === "quote0" || value === "mobile-app" || value === "local-web" || value === "webhook" ? value : "local-web";
}

function normalizePushId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9_-]/gu, "")
    .slice(0, 80);
}

function normalizePushShortText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizePushStringList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : String(value ?? "").split(/[,;\n|\uFF0C\u3001\uFF1B]+/u);
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const text = String(item).trim();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    output.push(text);
  }
  return output;
}

function uniquePushList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeTime(value: unknown): string {
  const text = String(value ?? "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/u.test(text) ? text : "";
}

function normalizeQuote0ImageDitherType(value: unknown): ToWriteQuote0ImageDitherType {
  return value === "DIFFUSION" || value === "ORDERED" ? value : "NONE";
}

function normalizeQuote0DashboardApi(value: unknown): ToWriteQuote0DashboardApi {
  return value === "image" || value === "canvas" ? value : "text";
}

function quote0Capabilities(dashboardApi: ToWriteQuote0DashboardApi): string[] {
  const values = ["push", "nfc", "text-api"];
  if (dashboardApi === "image") {
    values.push("image-api");
  }
  if (dashboardApi === "canvas") {
    values.push("canvas-api");
  }
  return values;
}

export function normalizeExternalApiBindHost(value?: string): string {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (!trimmed) {
    return DEFAULT_SETTINGS.externalApi.bindHost;
  }

  if (trimmed === "localhost") {
    return "127.0.0.1";
  }

  if (trimmed === "*" || trimmed === "::" || trimmed === "[::]" || trimmed === "0.0.0" || trimmed === "0.0.0.") {
    return "0.0.0.0";
  }

  if (isIpv4Address(trimmed) || isHostname(trimmed)) {
    return trimmed;
  }

  return DEFAULT_SETTINGS.externalApi.bindHost;
}

export function normalizeExternalApiPublicBaseUrl(value?: string): string {
  const trimmed = value?.trim().replace(/\/+$/u, "") ?? "";
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/u, "");
  } catch {
    return "";
  }
}

export function normalizeQuote0ApiBaseUrl(value?: string): string {
  const trimmed = value?.trim().replace(/\/+$/u, "") ?? "";
  if (!trimmed) {
    return DEFAULT_QUOTE0_SETTINGS.apiBaseUrl;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return DEFAULT_QUOTE0_SETTINGS.apiBaseUrl;
    }
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/u, "");
  } catch {
    return DEFAULT_QUOTE0_SETTINGS.apiBaseUrl;
  }
}

function normalizeQuote0ShortText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function isIpv4Address(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d+$/u.test(part)) {
      return false;
    }
    const number = Number(part);
    return number >= 0 && number <= 255;
  });
}

function isHostname(value: string): boolean {
  if (value.endsWith(".") || value.length > 253) {
    return false;
  }
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/u.test(value);
}


function normalizeDeviceProfileId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9_-]/gu, "");
}

function normalizeArticleTypeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9_-]/gu, "");
}

function normalizeArticleStringList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : String(value ?? "").split(/[,;\n|\uFF0C\u3001\uFF1B]+/u);
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const normalized = String(item).trim().replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function normalizeVaultFolderSetting(value: unknown, fallback: string): string {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\\/gu, "/")
    .replace(/^\/+|\/+$/gu, "")
    .replace(/(?:^|\/)\.{1,2}(?=\/|$)/gu, "");
  return normalized.slice(0, 500) || fallback;
}

function normalizeVaultFileSetting(value: unknown, fallback: string): string {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\\/gu, "/")
    .replace(/^\/+|\/+$/gu, "")
    .replace(/(?:^|\/)\.{1,2}(?=\/|$)/gu, "")
    .replace(/\/{2,}/gu, "/")
    .replace(/^\/+|\/+$/gu, "");
  const candidate = normalized || fallback;
  return candidate.toLowerCase().endsWith(".md") ? candidate : `${candidate}.md`;
}

function normalizeDailyNoteFormatSetting(value: unknown): string {
  const normalized = String(value ?? "YYYY-MM-DD")
    .trim()
    .replace(/\.md$/iu, "");
  if (!normalized || /[\\/:*?"<>|]/u.test(normalized)) return "YYYY-MM-DD";
  return normalized.slice(0, 80);
}

function normalizeHeadingSetting(value: unknown, fallback: string): string {
  return String(value ?? "")
    .replace(/^#+\s*/u, "")
    .replace(/[\r\n]+/gu, " ")
    .trim()
    .slice(0, 120) || fallback;
}

function normalizeArticleTagList(value: unknown): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of normalizeArticleStringList(value)) {
    const tag = item.replace(/^#+/u, "").toLowerCase();
    if (!tag || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    output.push(tag);
  }
  return output;
}

function isSettingsColor(value: unknown): value is OpenQuestionColor {
  return value === "amber"
    || value === "mint"
    || value === "sky"
    || value === "rose"
    || value === "violet"
    || value === "slate";
}

function normalizeDeviceProfileKind(value: unknown): ToWriteDeviceProfileKind {
  return value === "mobile-eink" || value === "eink-bw" || value === "desktop-card" ? value : "eink-bw";
}

function normalizeDeviceProfilePage(value: unknown): ToWriteDeviceProfilePage {
  return value === "cards" || value === "workflow" || value === "articles" || value === "home" ? value : "home";
}

function clampIntegerSetting(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function clampNumberSetting(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}
