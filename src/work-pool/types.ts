import type { OpenQuestionLane, OpenQuestionStatus } from "../core/types";
import type { TaskPoolLifecycleState, TaskPoolRevision } from "../daily/task-pool-types";

export const WORK_POOL_SCHEMA_VERSION = 1 as const;

export type WorkPoolItemKind = "task" | "question" | "note";
export type WorkPoolSourceTab = "all" | "task" | "tothink" | "towrite" | "inbox" | "note";
export type WorkPoolHistoryMode = "active" | "history" | "all";
export type WorkPoolGroupingDimension =
  | "workType"
  | "project"
  | "source"
  | "stage"
  | "articleType"
  | "note"
  | "status"
  | "category"
  | "none";

export type WorkPoolClassificationSource =
  | "task"
  | "note-frontmatter"
  | "inbox"
  | "tag"
  | "folder-rule"
  | "native"
  | "fallback";

export interface WorkPoolClassification {
  workTypeId: string;
  workTypeLabel: string;
  workTypeSource: WorkPoolClassificationSource;
  projectId?: string;
  projectLabel?: string;
  projectSource?: WorkPoolClassificationSource;
  inheritedFromNote?: boolean;
}

export interface WorkPoolProjectRule {
  id: string;
  label: string;
  tags: string[];
  folderPrefixes: string[];
}

export interface WorkPoolProjectAppearance {
  projectId: string;
  color: string;
  icon: string;
}

export interface WorkPoolClassificationOptions {
  projectFrontmatterKeys?: string[];
  projectTagPrefixes?: string[];
  projectRules?: WorkPoolProjectRule[];
}

export interface WorkPoolViewPreset {
  id: string;
  label: string;
  /** Independent presentation choice; grouping no longer implicitly controls layout. */
  layout?: "list" | "board";
  primary: WorkPoolGroupingDimension;
  secondary: WorkPoolGroupingDimension;
  source?: WorkPoolSourceTab;
  history?: WorkPoolHistoryMode;
  stageId?: string;
  typeId?: string;
  status?: string;
  workType?: string;
  project?: string;
  defaultExpanded?: boolean;
}

export interface WorkPoolSourceRef {
  kind: WorkPoolItemKind;
  id: string;
  revision: string;
}

export interface WorkPoolItem {
  schemaVersion: typeof WORK_POOL_SCHEMA_VERSION;
  id: string;
  kind: WorkPoolItemKind;
  sourceRef: WorkPoolSourceRef;
  title: string;
  description?: string;
  notePath?: string;
  target?: string;
  active: boolean;
  inbox?: boolean;
  stale?: boolean;
  category?: string;
  project?: string;
  stageId?: string;
  stageTitle?: string;
  typeId?: string;
  typeTitle?: string;
  tags: string[];
  taskId?: string;
  taskState?: TaskPoolLifecycleState;
  taskRevision?: TaskPoolRevision;
  lane?: OpenQuestionLane;
  questionId?: string;
  questionStatus?: OpenQuestionStatus;
  dueDate?: string;
  estimateMinutes?: number;
  createdAt?: string;
  updatedAt?: string;
  classification: WorkPoolClassification;
}

export interface WorkPoolGroup {
  id: string;
  notePath?: string;
  title: string;
  note?: WorkPoolItem;
  children: WorkPoolItem[];
  taskCount: number;
  thinkCount: number;
  writeCount: number;
  activeCount: number;
}

export interface WorkPoolQuery {
  source?: WorkPoolSourceTab;
  history?: WorkPoolHistoryMode;
  stageId?: string;
  typeId?: string;
  category?: string;
  workType?: string;
  project?: string;
  status?: string;
  search?: string;
}

export interface WorkPoolGroupNode {
  id: string;
  key: string;
  title: string;
  dimension: WorkPoolGroupingDimension;
  items: WorkPoolItem[];
  children: WorkPoolGroupNode[];
  counts: {
    total: number;
    tasks: number;
    think: number;
    write: number;
    inbox: number;
    notes: number;
  };
}

export type WorkPoolAction =
  | "open"
  | "add-today"
  | "add-tomorrow"
  | "complete-task"
  | "return-task"
  | "drop-task"
  | "resolve-question"
  | "reopen-question"
  | "move-to-think"
  | "move-to-write"
  | "change-question-status"
  | "change-stage";

export interface WorkPoolSnapshot {
  schemaVersion: typeof WORK_POOL_SCHEMA_VERSION;
  generatedAt: string;
  items: WorkPoolItem[];
  groups: WorkPoolGroup[];
  counts: {
    active: number;
    history: number;
    tasks: number;
    think: number;
    write: number;
    inbox: number;
    notes: number;
  };
}
