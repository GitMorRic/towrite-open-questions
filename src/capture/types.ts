/**
 * The capture contract is deliberately versioned independently from the plugin.
 * External clients may persist drafts and candidates between plugin upgrades.
 */
export const CAPTURE_SCHEMA_VERSION = 1 as const;

export type CaptureSchemaVersion = typeof CAPTURE_SCHEMA_VERSION;
export type CaptureIntent = "new" | "selection" | "answer";
export type CaptureTargetKind = "existingNote" | "folder" | "inbox";
export type CaptureTargetAction = "append" | "create";
export type CaptureConfidence = "strong" | "medium" | "weak";

export interface CaptureSourceContext {
  file?: string;
  headingPath?: string[];
  selection?: string;
  questionId?: string;
  entryPoint?: string;
  articleTypeId?: string;
  workflowStageId?: string;
}

export interface CaptureDraft {
  schemaVersion: CaptureSchemaVersion;
  id: string;
  intent: CaptureIntent;
  body: string;
  title?: string;
  tags: string[];
  links: string[];
  source?: CaptureSourceContext;
  createdAt?: string;
}

export interface CaptureTargetCandidate {
  schemaVersion: CaptureSchemaVersion;
  id: string;
  kind: CaptureTargetKind;
  action: CaptureTargetAction;
  /** A Markdown path for append targets, or a folder path for create targets. */
  path: string;
  reason: string;
  confidence: CaptureConfidence;
  /** Stable local score. Remote rerankers may reorder, but must not alter candidates. */
  score: number;
  /** Revision observed while the recommendation was built. */
  targetRevision: string;
  heading?: string;
  stageId?: string;
}

export interface CapturePreview {
  schemaVersion: CaptureSchemaVersion;
  captureId: string;
  candidateId: string;
  action: CaptureTargetAction;
  /** Final note path for append, proposed note path for create. */
  path: string;
  targetRevision: string;
  excerpt: string;
}

export interface CaptureCommitRequest {
  draft: CaptureDraft;
  candidate: CaptureTargetCandidate;
  /**
   * Prefer the revision returned by preview. If omitted, the candidate revision is
   * used, which keeps non-interactive/legacy clients safe as well.
   */
  targetRevision?: string;
}

export interface CaptureCommitResult {
  schemaVersion: CaptureSchemaVersion;
  captureId: string;
  candidateId: string;
  finalPath: string;
  action: CaptureTargetAction;
  createdAt: string;
  openUri: string;
  /** Omitted when an idempotent retry finds a note that the user already changed. */
  undoToken?: string;
  idempotent: boolean;
  /** Revision immediately after the commit (or observed during an idempotent retry). */
  targetRevision: string;
}

export interface CaptureUndoResult {
  schemaVersion: CaptureSchemaVersion;
  captureId: string;
  finalPath: string;
  undone: boolean;
}

export interface CaptureWorkflowStage {
  id: string;
  title: string;
  folderPrefixes: string[];
  tags: string[];
}

export interface CaptureRecommendationSettings {
  inboxFile: string;
  targetFolders: string[];
  workflowStages?: CaptureWorkflowStage[];
  appendHeading?: string;
  /** Bump when target configuration changes. Included in create-target revisions. */
  settingsRevision?: string;
  /** Empty means the full vault. These filters apply before local or AI ranking. */
  includeFolders?: string[];
  excludeFolders?: string[];
  excludeTags?: string[];
  /** Exclude a note when any listed frontmatter property has a truthy value. */
  excludeFrontmatter?: string[];
  /** Only explicitly accepted local routing habits may appear here. */
  confirmedRoutes?: Array<{
    targetId: string;
    context: {
      workflowStageId?: string;
      articleTypeId?: string;
      entryPoint?: string;
    };
  }>;
}

export interface CaptureRecommendationSet {
  schemaVersion: CaptureSchemaVersion;
  draftId: string;
  candidates: CaptureTargetCandidate[];
  selectedCandidateId: string;
}

/** Capability handshake returned by the optional Obsidian AI Backend. */
export interface BackendCapabilities {
  protocolVersion: string;
  recommendTargets: boolean;
  suggestHabits: boolean;
  mobileCapture?: boolean;
}
