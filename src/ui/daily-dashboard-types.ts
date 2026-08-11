import type {
  DailyDashboardSnapshot,
  DailyDevicePolicy,
  DailyPlanGroup,
  DailyPlanHierarchy,
  DailyPlanCreateInput,
  DailyPlanItem,
  DailyPlanNormalizationPreview,
  DailyPlanNormalizationResult,
  DailyPlanNormalizationUndoResult,
  DailyAnalyticsRange,
  DailyMonthlySummary,
  DailyJournalDaySnapshot,
  DailyJournalMonthSnapshot,
  DailyJournalWriteBackResult,
  DailyPlanPriority,
  DailyPlanUpdate,
  DailySummary,
  DailyTaskRevision
} from "../daily/types";
import type {
  DailyTaskTimingSnapshot,
  DailyTimerEvent
} from "../daily/task-timer-types";
import type {
  TaskPoolCreateInput,
  TaskPoolDocument,
  TaskPoolItem,
  TaskPoolRevision,
  TaskPoolUpdate
} from "../daily/task-pool-types";
import type {
  WorkPoolAction,
  WorkPoolItem,
  WorkPoolQuery,
  WorkPoolSnapshot,
  WorkPoolViewPreset,
  WorkPoolProjectRule,
  WorkPoolProjectAppearance
} from "../work-pool";

export type {
  DailyDashboardSnapshot,
  DailyDevicePolicy,
  DailyPlanGroup,
  DailyPlanHierarchy,
  DailyPlanCreateInput,
  DailyPlanItem,
  DailyPlanItemKind,
  DailyPlanNormalizationPreview,
  DailyPlanNormalizationResult,
  DailyPlanNormalizationUndoResult,
  DailyAnalyticsRange,
  DailyMonthlySummary,
  DailyJournalDaySnapshot,
  DailyJournalMonthSnapshot,
  DailyJournalWriteBackResult,
  DailyPlanStatus,
  DailyPlanUpdate,
  DailyPlanPriority,
  DailyTaskRevision
} from "../daily/types";
export type { DailyTaskTimingSnapshot, DailyTimerEvent } from "../daily/task-timer-types";
export type {
  TaskPoolCreateInput,
  TaskPoolDocument,
  TaskPoolItem,
  TaskPoolRevision,
  TaskPoolUpdate
} from "../daily/task-pool-types";
export type {
  WorkPoolAction,
  WorkPoolGroup,
  WorkPoolHistoryMode,
  WorkPoolItem,
  WorkPoolQuery,
  WorkPoolSnapshot,
  WorkPoolSourceTab,
  WorkPoolGroupingDimension,
  WorkPoolViewPreset,
  WorkPoolProjectRule,
  WorkPoolProjectAppearance,
  WorkPoolGroupNode
} from "../work-pool";

/** UI-only provenance. The Markdown written by DailyPlanService remains deterministic. */
export type DailySummaryPresentation = DailySummary & {
  source?: "rules" | "ai";
};

export interface DailyPlanMetadataPresentation {
  theme?: string;
  primaryId?: string;
  minimumId?: string;
  sourcePath?: string;
  sourceKind?: "daily-note" | "fixed-document";
  /** Whether the canonical Markdown source currently exists in the Vault. */
  sourceExists?: boolean;
  diagnostics?: string[];
  revision?: string;
}

export interface DailyPlanningCandidate {
  id: string;
  title: string;
  description?: string;
  source: "pool" | "tothink" | "towrite" | "inbox" | "stale" | "echo" | "note";
  kind?: DailyPlanItem["kind"];
  target?: string;
  taskRef?: string;
  category?: string;
  dueDate?: string;
  estimateMinutes?: number;
  poolRevision?: TaskPoolRevision;
  workKind?: DailyPlanItem["workKind"];
  workRef?: string;
  workRevision?: string;
}

export interface DailyCategoryPresetPresentation {
  id: string;
  label: string;
  color: string;
  icon?: string;
}

export interface DailyDashboardConfiguration {
  categoryPresets: DailyCategoryPresetPresentation[];
  defaultView: DailyDashboardView;
  focusMessages: string[];
  focusMessageIntervalSeconds: 0 | 10 | 30 | 60;
  taskPoolPath: string;
  autoReturnUnfinished: boolean;
  workflowStages?: Array<{ id: string; label: string }>;
  articleTypes?: Array<{ id: string; label: string }>;
  questionStatuses?: Array<{ id: string; label: string }>;
  workPool?: WorkPoolPresentationSettings;
  /** Latest optional telemetry from a displayed ESP32 card. */
  deviceBatteryPercent?: number;
  dailyNoteIntegration?: {
    source: "obsidian" | "custom";
    corePluginEnabled: boolean;
    folder: string;
    format: string;
    template: string;
    templateExists: boolean;
  };
}

export interface WorkPoolPresentationSettings {
  defaultViewId: string;
  views: WorkPoolViewPreset[];
  projectFrontmatterKeys: string[];
  projectTagPrefixes: string[];
  projectRules: WorkPoolProjectRule[];
  projectAppearances: WorkPoolProjectAppearance[];
  pageSize: number;
  defaultGroupsExpanded: boolean;
  showTechnicalMetadata: boolean;
  hiddenItemIds: string[];
  includedSourcePaths: string[];
  autoIncludeDailyLinks: boolean;
  autoIncludeWorkflowNotes: boolean;
  autoIncludeQuestionNotes: boolean;
  excludedSourcePaths: string[];
}

export interface DailyTimingCorrectionInput {
  targetEventId: string;
  replacementAt: string;
  reason: string;
  expectedTimingRevision: string;
}

export type DailyDashboardView = "list" | "board" | "table" | "calendar";
export type DailyDueDateShortcut = "today" | "tomorrow" | "friday" | "next-week" | "clear";

/**
 * Forward-compatible presentation fields for the task-pool/dashboard work.
 * Older plan parsers simply omit them and continue to render from lineage.
 */
export type DailyPlanItemPresentation = DailyPlanItem & {
  category?: string;
  parentTaskId?: string;
  depth?: number;
};

export type DailyPlanCreatePresentation = DailyPlanCreateInput & {
  category?: string;
  parentTaskId?: string;
  depth?: number;
};

export type DailyPlanUpdatePresentation = DailyPlanUpdate & {
  category?: string | null;
  parentTaskId?: string | null;
  depth?: number | null;
};

/**
 * Narrow bridge between the Svelte view and the plugin services.
 *
 * Keeping the methods optional lets older installations render the Today
 * overview read-only while the global Workflow Dashboard remains available.
 */
export interface DailyDashboardAdapter {
  getSnapshot(date?: string): DailyDashboardSnapshot | undefined | Promise<DailyDashboardSnapshot | undefined>;
  getConfiguration?(): DailyDashboardConfiguration | Promise<DailyDashboardConfiguration>;
  getTaskPool?(): TaskPoolDocument | Promise<TaskPoolDocument>;
  getWorkPool?(query?: WorkPoolQuery): WorkPoolSnapshot | Promise<WorkPoolSnapshot>;
  actOnWorkPoolItem?(
    item: WorkPoolItem,
    action: WorkPoolAction,
    options?: { date?: string; stageId?: string; status?: string }
  ): void | Promise<void>;
  createPoolTask?(input: TaskPoolCreateInput): TaskPoolItem | void | Promise<TaskPoolItem | void>;
  updateWorkPoolSettings?(
    patch: Partial<WorkPoolPresentationSettings>
  ): void | Promise<void>;
  syncMarkdownTasks?(): Promise<{
    filesScanned: number;
    tasksRegistered: number;
    filesFailed: number;
  }>;
  updatePoolTask?(
    id: string,
    revision: TaskPoolRevision,
    patch: TaskPoolUpdate
  ): TaskPoolItem | void | Promise<TaskPoolItem | void>;
  assignPoolTask?(
    id: string,
    revision: TaskPoolRevision,
    date: string
  ): void | Promise<void>;
  returnItemToPool?(id: string, revision: DailyTaskRevision): void | Promise<void>;
  moveItemToTomorrow?(id: string, revision: DailyTaskRevision): void | Promise<void>;
  getPreviousUnfinished?(date: string): DailyPlanItem[] | Promise<DailyPlanItem[]>;
  migratePreviousItems?(
    date: string,
    items: Array<{ id: string; revision: DailyTaskRevision }>
  ): void | Promise<void>;
  dropDailyItem?(id: string, revision: DailyTaskRevision): void | Promise<void>;
  getPlanHierarchy?(date: string): DailyPlanHierarchy | Promise<DailyPlanHierarchy>;
  getNormalizationPreview?(date: string): DailyPlanNormalizationPreview | Promise<DailyPlanNormalizationPreview>;
  normalizePlan?(preview: DailyPlanNormalizationPreview): DailyPlanNormalizationResult | Promise<DailyPlanNormalizationResult>;
  undoNormalization?(undoToken: string): DailyPlanNormalizationUndoResult | Promise<DailyPlanNormalizationUndoResult>;
  getPlanMetadata?(date: string): DailyPlanMetadataPresentation | Promise<DailyPlanMetadataPresentation>;
  updatePlanMetadata?(
    date: string,
    revision: string | undefined,
    patch: Pick<DailyPlanMetadataPresentation, "theme" | "primaryId" | "minimumId">
  ): void | Promise<void>;
  /** Creates the canonical Markdown scaffold without inventing a task. */
  ensurePlanSource?(date: string): void | Promise<void>;
  createItem?(input: DailyPlanCreatePresentation): void | Promise<void>;
  updateItem?(id: string, revision: DailyTaskRevision, patch: DailyPlanUpdatePresentation): void | Promise<void>;
  moveItem?(
    id: string,
    revision: DailyTaskRevision,
    direction: "up" | "down"
  ): void | Promise<void>;
  startItem?(id: string, revision: DailyTaskRevision): void | Promise<void>;
  pauseItem?(
    id: string,
    revision: DailyTaskRevision,
    timingRevision?: string
  ): void | Promise<void>;
  resumeItem?(
    id: string,
    revision: DailyTaskRevision,
    timingRevision?: string
  ): void | Promise<void>;
  completeItem?(id: string, revision: DailyTaskRevision): void | Promise<void>;
  completeItemAndApplyOrigin?(
    id: string,
    revision: DailyTaskRevision,
    options?: { stageId?: string }
  ): void | Promise<void>;
  reopenItem?(id: string, revision: DailyTaskRevision): void | Promise<void>;
  getItemTiming?(
    id: string,
    estimateMinutes?: number
  ): DailyTaskTimingSnapshot | Promise<DailyTaskTimingSnapshot>;
  getAnalyticsRange?(from: string, to: string): DailyAnalyticsRange | Promise<DailyAnalyticsRange>;
  getMonthlySummary?(month: string): DailyMonthlySummary | Promise<DailyMonthlySummary>;
  getJournalDay?(date: string): DailyJournalDaySnapshot | Promise<DailyJournalDaySnapshot>;
  getJournalMonth?(month: string): DailyJournalMonthSnapshot | Promise<DailyJournalMonthSnapshot>;
  writeJournal?(date: string): DailyJournalWriteBackResult | Promise<DailyJournalWriteBackResult>;
  listItemTimerEvents?(id: string): DailyTimerEvent[] | Promise<DailyTimerEvent[]>;
  correctItemTiming?(
    id: string,
    correction: DailyTimingCorrectionInput
  ): void | Promise<void>;
  writeSummary?(summary: DailySummary): void | Promise<void>;
  generateSummary?(mode: "rules" | "ai"): DailySummaryPresentation | Promise<DailySummaryPresentation>;
  sendItemToDevice?(id: string, revision: DailyTaskRevision): void | Promise<void>;
  sendSummaryToDevice?(): void | Promise<void>;
  /**
   * Atomically transitions a task to its active state and then opens the
   * freshly resolved target. Implementations must not open a stale revision.
   */
  startAndOpenItem?(item: DailyPlanItem): void | Promise<void>;
  /**
   * Explicitly stores the current local reading position for this task and
   * pauses an active timer. Checkpoints remain local and never enter Hub data.
   */
  pauseAndRememberItem?(item: DailyPlanItem): void | Promise<void>;
  hasItemCheckpoint?(item: DailyPlanItem): boolean | Promise<boolean>;
  openItem?(item: DailyPlanItem): void | Promise<void>;
  openGroup?(group: DailyPlanGroup): void | Promise<void>;
  openPlanSource?(date: string): void | Promise<void>;
  openPlanSettings?(): void | Promise<void>;
  openTaskPoolSource?(): void | Promise<void>;
  listPlanningCandidates?(date: string): DailyPlanningCandidate[] | Promise<DailyPlanningCandidate[]>;
  addPlanningCandidate?(date: string, candidate: DailyPlanningCandidate): void | Promise<void>;
  openPlanningCandidate?(candidate: DailyPlanningCandidate): void | Promise<void>;
  subscribe?(listener: () => void): (() => void);
}
