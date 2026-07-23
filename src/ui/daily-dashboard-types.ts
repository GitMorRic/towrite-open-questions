import type {
  DailyDashboardSnapshot,
  DailyDevicePolicy,
  DailyPlanCreateInput,
  DailyPlanItem,
  DailyPlanUpdate,
  DailySummary,
  DailyTaskRevision
} from "../daily/types";

export type {
  DailyDashboardSnapshot,
  DailyDevicePolicy,
  DailyPlanCreateInput,
  DailyPlanItem,
  DailyPlanItemKind,
  DailyPlanStatus,
  DailyPlanUpdate,
  DailyTaskRevision
} from "../daily/types";

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

/**
 * Narrow bridge between the Svelte view and the plugin services.
 *
 * Keeping the methods optional lets older installations render the Today
 * overview read-only while the global Workflow Dashboard remains available.
 */
export interface DailyDashboardAdapter {
  getSnapshot(date?: string): DailyDashboardSnapshot | undefined | Promise<DailyDashboardSnapshot | undefined>;
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
  completeItem?(id: string, revision: DailyTaskRevision): void | Promise<void>;
  reopenItem?(id: string, revision: DailyTaskRevision): void | Promise<void>;
  writeSummary?(summary: DailySummary): void | Promise<void>;
  generateSummary?(mode: "rules" | "ai"): DailySummaryPresentation | Promise<DailySummaryPresentation>;
  sendItemToDevice?(id: string, revision: DailyTaskRevision): void | Promise<void>;
  sendSummaryToDevice?(): void | Promise<void>;
  openItem?(item: DailyPlanItem): void | Promise<void>;
  openPlanSource?(date: string): void | Promise<void>;
  listPlanningCandidates?(date: string): DailyPlanningCandidate[] | Promise<DailyPlanningCandidate[]>;
  addPlanningCandidate?(date: string, candidate: DailyPlanningCandidate): void | Promise<void>;
  subscribe?(listener: () => void): (() => void);
}
