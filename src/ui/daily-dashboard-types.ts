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
  DailyPlanUpdate,
  DailySummary,
  DailyTaskRevision
} from "../daily/types";
import type {
  DailyTaskTimingSnapshot,
  DailyTimerEvent
} from "../daily/task-timer-types";

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
  DailyPlanStatus,
  DailyPlanUpdate,
  DailyTaskRevision
} from "../daily/types";
export type { DailyTaskTimingSnapshot, DailyTimerEvent } from "../daily/task-timer-types";

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
  diagnostics?: string[];
  revision?: string;
}

export interface DailyPlanningCandidate {
  id: string;
  title: string;
  description?: string;
  source: "tothink" | "towrite" | "inbox" | "stale" | "echo" | "note";
  kind?: DailyPlanItem["kind"];
  target?: string;
}

export interface DailyTimingCorrectionInput {
  targetEventId: string;
  replacementAt: string;
  reason: string;
  expectedTimingRevision: string;
}

/**
 * Narrow bridge between the Svelte view and the plugin services.
 *
 * Keeping the methods optional lets older installations render the Today
 * overview read-only while the global Workflow Dashboard remains available.
 */
export interface DailyDashboardAdapter {
  getSnapshot(date?: string): DailyDashboardSnapshot | undefined | Promise<DailyDashboardSnapshot | undefined>;
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
  createItem?(input: DailyPlanCreateInput): void | Promise<void>;
  updateItem?(id: string, revision: DailyTaskRevision, patch: DailyPlanUpdate): void | Promise<void>;
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
  reopenItem?(id: string, revision: DailyTaskRevision): void | Promise<void>;
  getItemTiming?(
    id: string,
    estimateMinutes?: number
  ): DailyTaskTimingSnapshot | Promise<DailyTaskTimingSnapshot>;
  listItemTimerEvents?(id: string): DailyTimerEvent[] | Promise<DailyTimerEvent[]>;
  correctItemTiming?(
    id: string,
    correction: DailyTimingCorrectionInput
  ): void | Promise<void>;
  writeSummary?(summary: DailySummary): void | Promise<void>;
  generateSummary?(mode: "rules" | "ai"): DailySummaryPresentation | Promise<DailySummaryPresentation>;
  sendItemToDevice?(id: string, revision: DailyTaskRevision): void | Promise<void>;
  sendSummaryToDevice?(): void | Promise<void>;
  openItem?(item: DailyPlanItem): void | Promise<void>;
  openGroup?(group: DailyPlanGroup): void | Promise<void>;
  openPlanSource?(date: string): void | Promise<void>;
  listPlanningCandidates?(date: string): DailyPlanningCandidate[] | Promise<DailyPlanningCandidate[]>;
  addPlanningCandidate?(date: string, candidate: DailyPlanningCandidate): void | Promise<void>;
  subscribe?(listener: () => void): (() => void);
}
