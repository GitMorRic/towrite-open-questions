export const TASK_POOL_SCHEMA_VERSION = 1 as const;
export const DEFAULT_TASK_POOL_PATH = "Planning/Task Pool.md";
export const DEFAULT_TASK_POOL_HEADING = "Tasks";

export type TaskPoolLifecycleState =
  | "pool"
  | "planned"
  | "returned"
  | "dropped"
  | "done";

export interface TaskPoolRevision {
  value: string;
  sourcePath: string;
  taskId: string;
}

export interface TaskPoolItem {
  schemaVersion: typeof TASK_POOL_SCHEMA_VERSION;
  id: string;
  taskId: string;
  text: string;
  state: TaskPoolLifecycleState;
  sourcePath: string;
  /** Inclusive, one-based source lines for revision-safe replacement. */
  line: number;
  endLine: number;
  rawLine: string;
  rawBlock: string;
  revision: TaskPoolRevision;
  category?: string;
  project?: string;
  target?: string;
  /** Stable, Vault-local block link to the ordinary-note task that registered this item. */
  source?: string;
  dueDate?: string;
  estimateMinutes?: number;
  plannedDate?: string;
  returnedDate?: string;
  droppedAt?: string;
  completedAt?: string;
  assignmentId?: string;
  /** Continuation lines not owned by ToWrite, preserved on every mutation. */
  unknownLines: string[];
}

export type TaskPoolDiagnosticCode =
  | "missing-task-id"
  | "invalid-task-id"
  | "duplicate-task-id"
  | "invalid-state"
  | "invalid-date"
  | "invalid-estimate"
  | "invalid-target"
  | "invalid-source"
  | "invalid-assignment-id";

export interface TaskPoolDiagnostic {
  code: TaskPoolDiagnosticCode;
  severity: "error" | "warning";
  message: string;
  sourcePath: string;
  line: number;
  taskId?: string;
}

export interface TaskPoolDocument {
  schemaVersion: typeof TASK_POOL_SCHEMA_VERSION;
  sourcePath: string;
  heading: string;
  items: TaskPoolItem[];
  diagnostics: TaskPoolDiagnostic[];
  /** Revision of the complete configured Tasks section. */
  revision: string;
}

export interface TaskPoolCreateInput {
  id?: string;
  text: string;
  category?: string;
  project?: string;
  target?: string;
  source?: string;
  dueDate?: string;
  estimateMinutes?: number;
}

export interface TaskPoolUpdate {
  text?: string;
  category?: string | null;
  project?: string | null;
  target?: string | null;
  source?: string | null;
  dueDate?: string | null;
  estimateMinutes?: number | null;
}

/**
 * Content-free Daily projection. The task body stays in the task-pool
 * Markdown and is resolved by taskRef when the Daily view is rendered.
 */
export interface TaskPoolDailyAssignment {
  schemaVersion: typeof TASK_POOL_SCHEMA_VERSION;
  taskRef: string;
  date: string;
  category?: string;
  project?: string;
  target?: string;
  dueDate?: string;
  estimateMinutes?: number;
  taskRevision: string;
  assignmentId?: string;
}

export interface TaskPoolDailyReference {
  schemaVersion: typeof TASK_POOL_SCHEMA_VERSION;
  taskRef: string;
  date: string;
  line: number;
  assignmentId?: string;
}

export interface TaskPoolAssignmentResult {
  task: TaskPoolItem;
  assignment: TaskPoolDailyAssignment;
  /** A content-free Daily checkbox containing only stable references. */
  referenceMarkdown: string;
  idempotent: boolean;
}

export interface TaskPoolTransitionResult {
  task: TaskPoolItem;
  releasedAssignmentId?: string;
  idempotent: boolean;
}

export interface TaskPoolReconciliation {
  date: string;
  assignedTaskIds: string[];
  duplicateTaskIds: string[];
  staleTaskIds: string[];
  /** Pool entries marked planned for this date but missing a Daily reference. */
  orphanedPlannedTaskIds: string[];
  /** Daily references whose pool entry is not in the matching planned state. */
  stateMismatchTaskIds: string[];
  candidates: TaskPoolItem[];
}

export interface TaskPoolExport {
  schemaVersion: typeof TASK_POOL_SCHEMA_VERSION;
  exportedAt: string;
  sourcePath: string;
  revision: string;
  items: Array<{
    taskId: string;
    text: string;
    state: TaskPoolLifecycleState;
    category?: string;
    project?: string;
    target?: string;
    source?: string;
    dueDate?: string;
    estimateMinutes?: number;
    plannedDate?: string;
    returnedDate?: string;
    droppedAt?: string;
    completedAt?: string;
    assignmentId?: string;
    revision: string;
  }>;
}

export interface TaskPoolFormatPreview {
  sourcePath: string;
  expectedRevision: string;
  changed: boolean;
  legacyFieldCount: number;
  affectedTaskIds: string[];
  before: string;
  after: string;
}

export interface TaskPoolFormatResult {
  document: TaskPoolDocument;
  undoToken?: string;
  changed: boolean;
}

export interface TaskPoolFormatUndoResult {
  document: TaskPoolDocument;
  restored: boolean;
}
