export const DAILY_SCHEMA_VERSION = 1 as const;
/** Markdown contract version. Activity/summary JSON remains schema v1. */
export const DAILY_PLAN_SCHEMA_VERSION = 2 as const;

export type DailyPlanSource =
  | { kind: "daily-note"; dailyRoot?: string }
  | { kind: "fixed-document"; path: string };

export type DailyPlanDiagnosticCode =
  | "missing-block-id"
  | "multiple-block-ids"
  | "duplicate-block-id"
  | "duplicate-primary"
  | "duplicate-minimum";

export interface DailyPlanDiagnostic {
  code: DailyPlanDiagnosticCode;
  severity: "error";
  message: string;
  sourcePath: string;
  line: number;
  blockId?: string;
}

export interface DailyPlanMetadata {
  theme?: string;
  primaryId?: string;
  minimumId?: string;
}

export interface DailyPlanDocument {
  schemaVersion: typeof DAILY_PLAN_SCHEMA_VERSION;
  date: string;
  source: DailyPlanSource;
  sourcePath: string;
  metadata: DailyPlanMetadata;
  items: DailyPlanItem[];
  diagnostics: DailyPlanDiagnostic[];
  /** Revision of the complete date-scoped plan, including unknown user text. */
  revision: string;
}

export interface DailyPlanMetadataUpdate {
  theme?: string | null;
  /** Selects one existing task in this date-scoped plan; null clears it. */
  primaryId?: string | null;
  /** Selects one existing task in this date-scoped plan; null clears it. */
  minimumId?: string | null;
}

export type DailyPlanItemKind = "task" | "create_note" | "edit_note" | "send_card";
export type DailyDevicePolicy = "none" | "manual" | "scheduled" | "rotation" | "agent";
/** Daily summaries have no meaningful one-shot clock; they remain opt-in. */
export type DailySummaryDevicePolicy = Exclude<DailyDevicePolicy, "scheduled">;
export type DailyPlanStatus = "todo" | "in-progress" | "done";
export type DailyPlanPriority = "highest" | "high" | "normal" | "low" | "lowest";

export interface DailyTaskRevision {
  value: string;
  sourcePath: string;
  blockId: string;
}

export interface DailyPlanItem {
  schemaVersion: typeof DAILY_SCHEMA_VERSION;
  id: string;
  blockId: string;
  date: string;
  text: string;
  kind: DailyPlanItemKind;
  status: DailyPlanStatus;
  done: boolean;
  sourcePath: string;
  line: number;
  /** Inclusive one-based end line of the logical task block. */
  endLine?: number;
  rawLine: string;
  /** Checkbox line plus recognized ToWrite metadata and block-id continuations. */
  rawBlock?: string;
  revision: DailyTaskRevision;
  scheduledDate: string;
  dueDate: string;
  completionDate?: string;
  scheduledFor?: string;
  devicePolicy: DailyDevicePolicy;
  priority?: DailyPlanPriority;
  /** Whether the source explicitly contains a Tasks priority emoji. */
  priorityExplicit?: boolean;
  tags: string[];
  linkedNotes: string[];
  /** Always populated by the v2 parser; optional for v1 serialized callers. */
  primary?: boolean;
  /** Always populated by the v2 parser; optional for v1 serialized callers. */
  minimum?: boolean;
  goal?: string;
  nextStep?: string;
  estimateMinutes?: number;
  /** Raw user-facing target, normally an Obsidian wikilink. */
  target?: string;
  startedAt?: string;
}

export interface DailyPlanCreateInput {
  id?: string;
  date?: string | Date;
  text: string;
  kind?: DailyPlanItemKind;
  devicePolicy?: DailyDevicePolicy;
  scheduledFor?: string;
  dueDate?: string;
  priority?: DailyPlanPriority;
  tags?: string[];
  primary?: boolean;
  minimum?: boolean;
  goal?: string;
  nextStep?: string;
  estimateMinutes?: number;
  target?: string;
}

export interface DailyPlanUpdate {
  text?: string;
  kind?: DailyPlanItemKind;
  devicePolicy?: DailyDevicePolicy;
  scheduledFor?: string | null;
  dueDate?: string;
  priority?: DailyPlanPriority;
  tags?: string[];
  status?: Exclude<DailyPlanStatus, "done">;
  primary?: boolean;
  minimum?: boolean;
  goal?: string | null;
  nextStep?: string | null;
  estimateMinutes?: number | null;
  target?: string | null;
  startedAt?: string | null;
}

export type DailyDocumentMeasurementReason = "created" | "modified";

export type DailyActivityEventKind =
  | "writing-measured"
  | "note-created"
  | "note-modified"
  | "task-completed"
  | "question-resolved"
  | "capture-committed"
  | "card-selected"
  | "card-displayed";

export interface DailyActivityEventBase {
  id: string;
  kind: DailyActivityEventKind;
  at: string;
  localDate: string;
  timezoneOffsetMinutes: number;
}

export interface DailyWritingMeasuredEvent extends DailyActivityEventBase {
  kind: "writing-measured";
  fileKey: string;
  positiveUnits: number;
  netUnits: number;
}

export interface DailyFileActivityEvent extends DailyActivityEventBase {
  kind: "note-created" | "note-modified";
  fileKey: string;
}

export interface DailyTaskCompletedEvent extends DailyActivityEventBase {
  kind: "task-completed";
  taskId: string;
}

export interface DailyQuestionResolvedEvent extends DailyActivityEventBase {
  kind: "question-resolved";
  questionId: string;
}

export interface DailyCaptureCommittedEvent extends DailyActivityEventBase {
  kind: "capture-committed";
  captureId: string;
}

export interface DailyCardActivityEvent extends DailyActivityEventBase {
  kind: "card-selected" | "card-displayed";
  cardId: string;
}

/** Content-free and keystroke-free event union. */
export type DailyActivityEvent =
  | DailyWritingMeasuredEvent
  | DailyFileActivityEvent
  | DailyTaskCompletedEvent
  | DailyQuestionResolvedEvent
  | DailyCaptureCommittedEvent
  | DailyCardActivityEvent;

export interface DailyActivityAggregate {
  date: string;
  positiveWritingUnits: number;
  netWritingUnits: number;
  notesCreated: number;
  notesModified: number;
  tasksCompleted: number;
  questionsResolved: number;
  capturesCommitted: number;
  cardsSelected: number;
  cardsDisplayed: number;
  trackingComplete: boolean;
}

export interface DailyFileMeasurementBaseline {
  fileKey: string;
  units: number;
  measuredAt: string;
}

export interface DailyActivityState {
  schemaVersion: typeof DAILY_SCHEMA_VERSION;
  collectionPaused: boolean;
  trackingStartedAt: string;
  events: DailyActivityEvent[];
  aggregates: Record<string, DailyActivityAggregate & { modifiedFileKeys?: string[] }>;
  fileBaselines: Record<string, DailyFileMeasurementBaseline>;
}

export interface DailyActivityExportBundle {
  schemaVersion: typeof DAILY_SCHEMA_VERSION;
  generatedAt: string;
  files: {
    events: "daily/activity-events.jsonl";
    aggregates: "daily/activity.json";
  };
  eventsJsonl: string;
  aggregatesJson: string;
}

export interface DailySummary {
  schemaVersion: typeof DAILY_SCHEMA_VERSION;
  date: string;
  generatedAt: string;
  headline: string;
  lines: string[];
  markdown: string;
  metrics: {
    planned: number;
    completed: number;
    remaining: number;
    positiveWritingUnits: number;
    netWritingUnits: number;
    notesCreated: number;
    notesModified: number;
  };
}

export interface DailyDashboardSnapshot {
  schemaVersion: typeof DAILY_SCHEMA_VERSION;
  date: string;
  plan: {
    items: DailyPlanItem[];
    total: number;
    todo: number;
    inProgress: number;
    done: number;
  };
  activity: DailyActivityAggregate;
  summary: DailySummary;
  trackingStartedAt: string;
}

export interface DailyDocumentMeasurementRequest {
  filePath: string;
  readContent: () => Promise<string | undefined>;
  reason?: DailyDocumentMeasurementReason;
  at?: Date;
}
