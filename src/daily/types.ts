import type { DailyTaskTimingSnapshot } from "./task-timer-types";

export const DAILY_SCHEMA_VERSION = 1 as const;
/** Markdown contract version. Activity/summary JSON remains schema v1. */
export const DAILY_PLAN_SCHEMA_VERSION = 2 as const;

export type DailyPlanSource =
  | { kind: "daily-note"; dailyRoot?: string; dateFormat?: string }
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
export type DailyWorkKind = "question" | "note" | "inbox";

export interface DailyTaskRevision {
  value: string;
  sourcePath: string;
  blockId: string;
  /** Date scope is required to address fixed-document plans without guessing. */
  date?: string;
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
  /** Optional user-facing category independent of the structural list group. */
  category?: string;
  /**
   * Stable reference to a canonical Task Pool item. A Daily item may be an
   * assignment/projection while the pool remains the content source of truth.
   */
  taskRef?: string;
  /** Frozen Task Pool revision used to reject stale cross-document writes. */
  taskPoolRevision?: string;
  /** Native source kind for a non-Task-Pool item added from the unified Work Pool. */
  workKind?: DailyWorkKind;
  /** Stable source id: question id or normalized Vault note path. */
  workRef?: string;
  /** Frozen native-source revision used by explicit cross-source completion. */
  workRevision?: string;
  /** Stable id of the nearest containing checkbox task, when one exists. */
  parentTaskId?: string;
  /**
   * One-based source line of the nearest containing checkbox task. This keeps
   * an authored parent/child relationship available before the parent receives
   * its stable block id. It is runtime/source metadata and is never written as
   * a ToWrite field.
   */
  parentTaskLine?: number;
  /** Structural list depth inside the configured ToDo section. */
  depth?: number;
  scheduledDate: string;
  /** Distinguishes an authored schedule from the date-scoped compatibility default. */
  scheduledDateExplicit?: boolean;
  dueDate: string;
  /** Distinguishes an authored deadline from the date-scoped compatibility default. */
  dueDateExplicit?: boolean;
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
  /** Local-only named desktop action selected through `[towrite-action:: ...]`. */
  desktopActionId?: string;
  startedAt?: string;
  /**
   * Opaque revision of the task's inherited group chain. Hierarchy-aware
   * callers must compare it in addition to the task revision before acting.
   */
  lineageRevision?: string;
  /** Nearest containing plain-list category, when the source uses groups. */
  groupId?: string;
  /** This checkbox is also the root of an authored Markdown category tree. */
  structuralCategory?: boolean;
  /** Read-only direct child projection used by carry-over review and merging. */
  structuralChildren?: DailyPlanStructuralChild[];
  /** Full local-only group chain used to explain target inheritance. */
  lineage?: DailyPlanLineage;
  /** Unified open target used by Dashboard, device, NFC and Capture callers. */
  targetResolution?: DailyTargetResolution;
  /** Runtime-only timer projection; never serialized into task Markdown. */
  timing?: DailyTaskTimingSnapshot;
  /** Direct continuation lines physically placed after a nested child block. */
  detachedOwnedLines?: number[];
  /**
   * Runtime-only marker for an authored checkbox that has not yet received a
   * stable Markdown block id. Draft items are read-only until an explicit user
   * action materializes their exact source line.
   */
  provisional?: boolean;
  /** One-based source line used by the draft CAS materialization step. */
  draftLine?: number;
  /** Read-only roll-up of descendant and linked-note work. */
  aggregate?: DailyTaskAggregate;
}

export interface DailyPlanStructuralChild {
  text: string;
  status: DailyPlanStatus;
  checkbox: boolean;
  /** Exact-content key with block ids removed; safe for conservative merging. */
  mergeKey: string;
  children: DailyPlanStructuralChild[];
}

export interface DailyTaskAggregate {
  /** All descendant Daily tasks plus linked-note tasks in this subtree. */
  total: number;
  /** Descendants that are explicitly or transitively complete. */
  done: number;
  /** True when at least one dependent exists and every dependent is complete. */
  complete: boolean;
  /** The parent checkbox itself was explicitly checked by the author. */
  explicitlyComplete: boolean;
  dailyTasks: number;
  linkedTasks: number;
}

export interface StableDailyTaskReference {
  kind: "stable";
  id: string;
  revision: DailyTaskRevision;
  date: string;
}

export interface DraftDailyTaskReference {
  kind: "draft";
  id: string;
  date: string;
  sourcePath: string;
  line: number;
  sourceRevision: string;
  rawLine: string;
}

export type DailyTaskReference = StableDailyTaskReference | DraftDailyTaskReference;

export type DailyTargetSource =
  | "action"
  | "explicit"
  | "task-link"
  | "ancestor-link"
  | "task-block"
  | "dashboard";

export interface DailyMarkdownTarget {
  kind: "wikilink" | "markdown";
  raw: string;
  /** Obsidian link text for wikilinks, or a safe vault-relative Markdown path. */
  linkText: string;
  /** Populated for relative Markdown links, including the `.md` suffix. */
  path?: string;
  label?: string;
  heading?: string;
  blockId?: string;
}

/**
 * An explicitly configured HTTPS destination. Web targets are never inferred
 * from arbitrary prose; they must come from the owned `towrite-target` field.
 */
export interface DailyWebTarget {
  kind: "web";
  raw: string;
  url: string;
  label: string;
}

export interface DailyPlanGroup {
  id: string;
  text: string;
  /** Exact list line used by the cross-runtime lineage CAS contract. */
  rawLine?: string;
  sourcePath: string;
  line: number;
  endLine: number;
  depth: number;
  parentGroupId?: string;
  links: DailyMarkdownTarget[];
}

export interface DailyPlanLineage {
  /** Root-to-leaf group order. */
  groups: DailyPlanGroup[];
  /** Changes whenever a containing group line, link, or nesting changes. */
  revision: string;
}

export interface DailyTargetResolution {
  source: DailyTargetSource;
  /** Opaque local settings key; never expanded into device or Hub payloads. */
  actionId?: string;
  target?: DailyMarkdownTarget;
  webTarget?: DailyWebTarget;
  /** Source-note block fallback. */
  sourcePath?: string;
  blockId?: string;
  displayLabel: string;
  lineageRevision: string;
}

export interface DailyPlanHierarchyTask {
  /** Present for normalized checkbox tasks. */
  id?: string;
  blockId?: string;
  /** One-based line for a standalone id owned by this task. */
  blockIdLine?: number;
  /** Direct continuation lines physically placed after a nested child block. */
  detachedOwnedLines: number[];
  text: string;
  sourcePath: string;
  line: number;
  endLine: number;
  depth: number;
  /** Stable id of the nearest containing checkbox task, when one exists. */
  parentTaskId?: string;
  /** One-based source line of that parent, including draft parents without ids. */
  parentTaskLine?: number;
  /** Optional explicit category stored in a ToWrite continuation field. */
  category?: string;
  /** Optional canonical Task Pool reference stored in a continuation field. */
  taskRef?: string;
  status: DailyPlanStatus;
  checkbox: boolean;
  rawLine: string;
  rawBlock: string;
  explicitActionId?: string;
  explicitTarget?: string;
  links: DailyMarkdownTarget[];
  lineage: DailyPlanLineage;
  lineageRevision: string;
  targetResolution: DailyTargetResolution;
  normalizationRequired: boolean;
}

export type DailyPlanHierarchyDiagnosticCode =
  | "multiple-block-ids"
  | "duplicate-block-id"
  | "unsafe-target"
  | "broken-target";

export interface DailyPlanHierarchyDiagnostic {
  code: DailyPlanHierarchyDiagnosticCode;
  severity: "error" | "warning";
  message: string;
  sourcePath: string;
  line: number;
  blockId?: string;
  target?: string;
}

export interface DailyPlanHierarchy {
  schemaVersion: 1;
  date: string;
  source: DailyPlanSource;
  sourcePath: string;
  groups: DailyPlanGroup[];
  tasks: DailyPlanHierarchyTask[];
  diagnostics: DailyPlanHierarchyDiagnostic[];
  /** Revision of the complete date-scoped plan, including unknown user text. */
  revision: string;
}

export type DailyPlanNormalizationKind = "plain-leaf" | "missing-block-id";

export interface DailyPlanNormalizationEdit {
  line: number;
  kind: DailyPlanNormalizationKind;
  before: string;
  after: string;
  proposedBlockId: string;
  taskText: string;
  lineageRevision: string;
  targetResolution: DailyTargetResolution;
  /** Read-only hint from legacy inline timing prose; never applied implicitly. */
  legacyTimingSuggestion?: {
    estimateMinutes?: number;
    observedTimes: string[];
    confidence: "low";
  };
}

export interface DailyPlanNormalizationPreview {
  schemaVersion: 1;
  date: string;
  source: DailyPlanSource;
  sourcePath: string;
  expectedRevision: string;
  groups: DailyPlanGroup[];
  tasks: DailyPlanHierarchyTask[];
  diagnostics: DailyPlanHierarchyDiagnostic[];
  edits: DailyPlanNormalizationEdit[];
  changed: boolean;
  /** A compact unified-style diff containing only lines the plugin will edit. */
  diff: string;
}

export interface DailyPlanNormalizationResult {
  preview: DailyPlanNormalizationPreview;
  revision: string;
  undoToken?: string;
}

export interface DailyPlanNormalizationUndoResult {
  restored: boolean;
  revision: string;
}

/** A focused repair view for malformed task identities in one Daily source. */
export interface DailyTaskRepairPreview {
  schemaVersion: 1;
  date: string;
  sourcePath: string;
  expectedRevision: string;
  /** Missing IDs that can be added without guessing another task's identity. */
  recoverable: DailyPlanNormalizationEdit[];
  /** Duplicate/ambiguous identities that require the user to inspect the diff. */
  blocked: DailyPlanHierarchyDiagnostic[];
  diff: string;
}

/** Auditable move of one active commitment between Daily Markdown documents. */
export interface DailyTaskMigration {
  schemaVersion: 1;
  migrationId: string;
  taskId: string;
  fromDate: string;
  toDate: string;
  fromSourcePath: string;
  toSourcePath: string;
  migratedAt: string;
  destinationTaskId: string;
}

/** User-approved policy for one historical carry-over batch. */
export interface DailyMigrationOptions {
  /**
   * Consolidate only byte-equivalent task intent into one destination item.
   * Similar text with different context is never merged automatically.
   */
  mergeExactDuplicates?: boolean;
  /** Stable merge-unit keys in the user's preferred top-to-bottom order. */
  unitOrder?: string[];
  /** User-authored destination titles for newly created, non-pool units. */
  destinationTextByUnit?: Record<string, string>;
}

export interface DailyPlanCreateInput {
  id?: string;
  date?: string | Date;
  text: string;
  kind?: DailyPlanItemKind;
  category?: string;
  taskRef?: string;
  taskPoolRevision?: string;
  workKind?: DailyWorkKind;
  workRef?: string;
  workRevision?: string;
  devicePolicy?: DailyDevicePolicy;
  scheduledDate?: string;
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
  desktopActionId?: string;
}

export interface DailyPlanUpdate {
  text?: string;
  kind?: DailyPlanItemKind;
  category?: string | null;
  taskRef?: string | null;
  taskPoolRevision?: string | null;
  workKind?: DailyWorkKind | null;
  workRef?: string | null;
  workRevision?: string | null;
  devicePolicy?: DailyDevicePolicy;
  scheduledDate?: string | null;
  scheduledFor?: string | null;
  dueDate?: string | null;
  priority?: DailyPlanPriority;
  tags?: string[];
  status?: Exclude<DailyPlanStatus, "done">;
  primary?: boolean;
  minimum?: boolean;
  goal?: string | null;
  nextStep?: string | null;
  estimateMinutes?: number | null;
  target?: string | null;
  desktopActionId?: string | null;
  startedAt?: string | null;
}

/** Optional fields shown by the progressive editor card for a quick task. */
export type DailyPlanEnrichmentPatch = Pick<
  DailyPlanUpdate,
  "category" | "target" | "dueDate" | "estimateMinutes" | "nextStep"
>;

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

export interface DailyAnalyticsDay {
  date: string;
  planned: number;
  completed: number;
  completionRate: number;
  firstStartedAt?: string;
  lastCompletedAt?: string;
  activeMs: number;
  wallMs: number;
  pausedMs: number;
  interruptions: number;
  positiveWritingUnits: number;
  netWritingUnits: number;
  notesCreated: number;
  notesModified: number;
  trackingComplete: boolean;
  needsReview: boolean;
}

export interface DailyAnalyticsBreakdown {
  id: string;
  label: string;
  planned: number;
  completed: number;
  activeMs: number;
}

export interface DailyAnalyticsRange {
  schemaVersion: 1;
  from: string;
  to: string;
  generatedAt: string;
  days: DailyAnalyticsDay[];
  totals: Omit<DailyAnalyticsDay, "date" | "firstStartedAt" | "lastCompletedAt"> & {
    firstStartedAt?: string;
    lastCompletedAt?: string;
  };
  byCategory: DailyAnalyticsBreakdown[];
}

export interface DailyMonthlySummary extends DailyAnalyticsRange {
  month: string;
}

export type DailyTaskTransitionKind =
  | "schedule"
  | "start"
  | "pause"
  | "resume"
  | "complete"
  | "reopen"
  | "migrate"
  | "return"
  | "abandon";

/**
 * Content-minimal, local-only audit event for the work journal. `title` is a
 * short local snapshot so a historical day remains understandable after the
 * source task is renamed; no note body is stored.
 */
export interface DailyTaskTransitionEvent {
  schemaVersion: 1;
  eventId: string;
  taskId: string;
  kind: DailyTaskTransitionKind;
  at: string;
  localDate: string;
  sourceDate?: string;
  destinationDate?: string;
  title: string;
  category?: string;
  project?: string;
}

export interface DailyJournalDaySnapshot {
  schemaVersion: 1;
  date: string;
  generatedAt: string;
  planned: number;
  completed: number;
  completionRate: number;
  firstStartedAt?: string;
  lastCompletedAt?: string;
  activeMs: number;
  pausedMs: number;
  interruptions: number;
  unfinished: number;
  migratedIn: number;
  migratedOut: number;
  returned: number;
  abandoned: number;
  byCategory: DailyAnalyticsBreakdown[];
  transitions: DailyTaskTransitionEvent[];
}

export interface DailyJournalMonthSnapshot {
  schemaVersion: 1;
  month: string;
  generatedAt: string;
  days: DailyJournalDaySnapshot[];
  totals: Omit<DailyJournalDaySnapshot, "date" | "generatedAt" | "transitions" | "byCategory">;
  byCategory: DailyAnalyticsBreakdown[];
}

export interface DailyJournalWriteBackResult {
  date: string;
  sourcePath: string;
  revision: string;
  idempotent: boolean;
}

export interface DailyDocumentMeasurementRequest {
  filePath: string;
  readContent: () => Promise<string | undefined>;
  reason?: DailyDocumentMeasurementReason;
  at?: Date;
}
