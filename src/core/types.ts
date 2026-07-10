export type BuiltInOpenQuestionStatus = "candidate" | "open" | "resolved" | "ignored";
export type OpenQuestionStatus = BuiltInOpenQuestionStatus | (string & {});
export type OpenQuestionKind =
  | "research"
  | "experiment"
  | "explanation"
  | "citation"
  | "todo"
  | "evidence"
  | "other";
export type OpenQuestionPriority = "P1" | "P2" | "P3";
export type OpenQuestionColor = "amber" | "mint" | "sky" | "rose" | "violet" | "slate";
export type OpenQuestionLane = "think" | "write";
export type OpenQuestionRule = "double-question" | "task-question" | "question-callout" | "candidate" | "selection";

export const OPEN_QUESTION_COLORS: OpenQuestionColor[] = ["amber", "mint", "sky", "rose", "violet", "slate"];

export interface QuestionAnchor {
  startOffset: number;
  endOffset: number;
  selectedText: string;
  before: string;
  after: string;
  confidence?: number;
  orphaned?: boolean;
}

export interface PdfAnchorRect {
  pageNumber: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PdfAnchor {
  pageNumber: number;
  selectedText: string;
  rects: PdfAnchorRect[];
}

export interface OpenQuestionSource {
  file: string;
  headingPath: string[];
  lineStart: number;
  lineEnd: number;
  blockId?: string;
  page?: number;
  pdfAnchor?: PdfAnchor;
  rule: OpenQuestionRule;
}

export interface OpenQuestionAi {
  summary?: string;
  nextAction?: string;
  suggestedSearchQueries?: string[];
  relatedNotes?: Array<{
    file: string;
    title: string;
    reason?: string;
    snippet?: string;
    score?: number;
  }>;
  relatedConcepts?: string[];
  confidence?: number;
  generatedAt?: string;
  error?: string;
}

export interface OpenQuestionNote {
  id: string;
  kind: "text";
  text: string;
  source: "api" | "obsidian" | (string & {});
  clientId?: string;
  createdAt: string;
  metadata?: Record<string, string>;
}

export interface QuestionStatusOption {
  id: OpenQuestionStatus;
  label: string;
}

export interface OpenQuestion {
  id: string;
  title?: string;
  lane: OpenQuestionLane;
  status: OpenQuestionStatus;
  kind: OpenQuestionKind;
  priority?: OpenQuestionPriority;
  tags: string[];
  color: OpenQuestionColor;
  pinned?: boolean;
  compactEditorDecoration?: boolean;
  question: string;
  note?: string;
  notes?: OpenQuestionNote[];
  reminderAt?: string;
  reminderNote?: string;
  reminderSource?: "manual" | "ai" | (string & {});
  reminderDismissedAt?: string;
  anchorText?: string;
  anchor?: QuestionAnchor;
  source: OpenQuestionSource;
  contextSummary?: string;
  ai?: OpenQuestionAi;
  createdAt?: string;
  updatedAt?: string;
}

export interface OpenQuestionSuggestion {
  id: string;
  lane: OpenQuestionLane;
  kind: OpenQuestionKind;
  tags: string[];
  color: OpenQuestionColor;
  question: string;
  anchorText: string;
  source: OpenQuestionSource;
  contextSummary?: string;
}

export interface StoredQuestionState {
  id: string;
  title?: string;
  lane?: OpenQuestionLane;
  question?: string;
  status?: OpenQuestionStatus;
  kind?: OpenQuestionKind;
  priority?: OpenQuestionPriority;
  tags?: string[];
  color?: OpenQuestionColor;
  pinned?: boolean;
  compactEditorDecoration?: boolean;
  note?: string;
  notes?: OpenQuestionNote[];
  reminderAt?: string;
  reminderNote?: string;
  reminderSource?: "manual" | "ai" | (string & {});
  reminderDismissedAt?: string;
  anchorText?: string;
  anchor?: QuestionAnchor;
  source?: OpenQuestionSource;
  ai?: OpenQuestionAi;
  createdAt?: string;
  updatedAt?: string;
}

export interface OpenQuestionQuery {
  scope?: "active-file" | "vault" | "folder";
  filePath?: string;
  folderPath?: string;
  status?: OpenQuestionStatus[];
  kind?: OpenQuestionKind[];
  lane?: OpenQuestionLane[];
  search?: string;
  limit?: number;
}

export interface ArticleSummary {
  filePath: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  ageDays?: number;
  oldestOpenAgeDays?: number;
  statusLabel?: string;
  tags?: string[];
  description?: string;
  typeId?: string;
  typeTitle?: string;
  typeColor?: OpenQuestionColor;
  stageId?: string;
  stageTitle?: string;
  stageColor?: OpenQuestionColor;
  stale?: boolean;
  open: number;
  candidate: number;
  resolved: number;
  ignored: number;
  think: number;
  write: number;
  needsWork: boolean;
  topIssues: OpenQuestion[];
}

export interface ExportIndexPayload {
  schemaVersion: 2;
  generatedAt: string;
  vaultName: string;
  questions: OpenQuestion[];
}

export interface ExportArticlesPayload {
  schemaVersion: 2;
  generatedAt: string;
  vaultName: string;
  articles: ArticleSummary[];
}

export interface ExportEinkPayload {
  schemaVersion: 2;
  generatedAt: string;
  summary: {
    open: number;
    candidate: number;
    blockedArticles: number;
  };
  focus: Array<{
    id: string;
    title: string;
    body: string;
    question: string;
    article: string;
    sourcePage?: number;
    sourceSelectedText?: string;
    lane: OpenQuestionLane;
    kind: OpenQuestionKind;
    nextAction?: string;
    relatedNotes?: Array<{
      file: string;
      title: string;
      reason?: string;
    }>;
    relatedConcepts?: string[];
    openUri?: string;
  }>;
}
