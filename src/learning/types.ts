export const HABIT_LEARNING_SCHEMA_VERSION = 1 as const;

export type ActivityEventKind =
  | "file-switched"
  | "edit-presence"
  | "capture-route"
  | "question-action"
  | "suggestion-feedback";

export type CaptureEntryPoint =
  | "command"
  | "ribbon"
  | "sidebar"
  | "selection"
  | "question-card"
  | "device"
  | "external-api"
  | (string & {});

export type CaptureTargetKind = "existing-note" | "folder" | "inbox";
export type CaptureRouteSelection = "accepted" | "reselected" | "inbox" | "undone";
export type QuestionActivityAction = "opened" | "answered" | "resolved" | "ignored" | "reminded";
export type SuggestionFeedbackAction = "accepted" | "edited" | "dismissed" | "later" | "opened";

export interface ActivityEventBase {
  /** A locally generated opaque identifier. */
  id: string;
  kind: ActivityEventKind;
  at: string;
  /** Minutes east of UTC, for example 480 for Asia/Shanghai. */
  timezoneOffsetMinutes: number;
  articleTypeId?: string;
  workflowStageId?: string;
}

/**
 * The precise path intentionally exists only on raw, local events. It is not
 * copied into SessionSummary or inferred habit rules.
 */
export interface FileSwitchedActivityEvent extends ActivityEventBase {
  kind: "file-switched";
  filePath: string;
}

/**
 * One coarse presence record represents an editing period. Repeated editor
 * changes extend lastActiveAt instead of creating a keystroke-like event log.
 */
export interface EditPresenceActivityEvent extends ActivityEventBase {
  kind: "edit-presence";
  filePath: string;
  lastActiveAt?: string;
}

export interface CaptureRouteActivityEvent extends ActivityEventBase {
  kind: "capture-route";
  captureId?: string;
  entryPoint: CaptureEntryPoint;
  suggestedTargetId?: string;
  selectedTargetId: string;
  selectedTargetKind: CaptureTargetKind;
  selection: CaptureRouteSelection;
  sourceFilePath?: string;
}

export interface QuestionActivityEvent extends ActivityEventBase {
  kind: "question-action";
  questionId: string;
  action: QuestionActivityAction;
  sourceFilePath?: string;
}

export interface SuggestionFeedbackActivityEvent extends ActivityEventBase {
  kind: "suggestion-feedback";
  suggestionId: string;
  action: SuggestionFeedbackAction;
  habitId?: string;
}

/**
 * Deliberately content-free. There are no body, selection, clipboard,
 * keystroke-count, contact, network, or location fields in this union.
 */
export type ActivityEvent =
  | FileSwitchedActivityEvent
  | EditPresenceActivityEvent
  | CaptureRouteActivityEvent
  | QuestionActivityEvent
  | SuggestionFeedbackActivityEvent;

export type NewActivityEvent = ActivityEvent extends infer Event
  ? Event extends ActivityEvent
    ? Omit<Event, "id"> & { id?: string }
    : never
  : never;

export interface ThreeHourTimeWindow {
  startHour: number;
  endHour: number;
}

/** A derived, content-free work session. Precise file paths are omitted. */
export interface SessionSummary {
  id: string;
  startedAt: string;
  endedAt: string;
  activeDurationMs: number;
  hadEdit: boolean;
  localDate: string;
  timeWindow: ThreeHourTimeWindow;
  timezoneOffsetMinutes: number;
  articleTypeId?: string;
  workflowStageId?: string;
}

export type HabitCandidateStatus = "pending" | "accepted" | "dismissed";
export type HabitCandidateOrigin = "rules" | "manual";

export interface TimeStageHabitRule {
  kind: "time-stage";
  timeWindow: ThreeHourTimeWindow;
  workflowStageId?: string;
  articleTypeId?: string;
}

export interface RoutingHabitContext {
  workflowStageId?: string;
  articleTypeId?: string;
  entryPoint?: CaptureEntryPoint;
}

export interface RoutingHabitRule {
  kind: "routing";
  context: RoutingHabitContext;
  targetId: string;
  targetKind: CaptureTargetKind;
}

export type HabitRule = TimeStageHabitRule | RoutingHabitRule;

export interface HabitEvidence {
  sampleSize: number;
  matchingSamples: number;
  distinctDays: number;
  ratio: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

/**
 * Inference can create only pending candidates. A candidate affects routing or
 * notification behavior only after acceptCandidate() changes it to accepted.
 */
export interface HabitCandidate {
  id: string;
  fingerprint: string;
  label: string;
  description: string;
  rule: HabitRule;
  evidence: HabitEvidence;
  status: HabitCandidateStatus;
  origin: HabitCandidateOrigin;
  createdAt: string;
  updatedAt: string;
  lastDetectedAt: string;
  lastPresentedAt?: string;
  acceptedAt?: string;
  dismissedAt?: string;
  suppressedUntil?: string;
  /** Evidence snapshot used to decide whether a dismissed pattern changed materially. */
  dismissedEvidence?: HabitEvidence;
  copyEditedByAiAt?: string;
}

export interface HabitLearningState {
  schemaVersion: typeof HABIT_LEARNING_SCHEMA_VERSION;
  collectionPaused: boolean;
  events: ActivityEvent[];
  habits: HabitCandidate[];
}

export interface HabitLearningExportBundle {
  schemaVersion: typeof HABIT_LEARNING_SCHEMA_VERSION;
  generatedAt: string;
  files: {
    events: "learning/events.jsonl";
    habits: "learning/habits.json";
  };
  eventsJsonl: string;
  habitsJson: string;
}
