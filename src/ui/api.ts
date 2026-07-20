import type {
  ArticleSummary,
  OpenQuestion,
  OpenQuestionAi,
  OpenQuestionColor,
  OpenQuestionLane,
  OpenQuestionQuery,
  OpenQuestionStatus,
  QuestionStatusOption,
  StoredQuestionState
} from "../core/types";
import type { ArticleTypeSettings, ToWriteLanguage, ToWriteReminderPreset, WorkflowStageSettings } from "../core/settings";
import type { WorkflowIndexPayload } from "../workflow";
import type { ProactiveSuggestion, ProactiveSuggestionAction } from "../suggestions";
import type { HubDeviceState, HubFeedbackAction } from "../hub";

export interface ActiveLineRange {
  filePath: string;
  from: number;
  to: number;
}

export interface LinkSuggestion {
  title: string;
  path: string;
  linktext: string;
}

export interface ToWriteUiApi {
  getActiveFile(): string | null;
  getActiveLineRange(): ActiveLineRange | null;
  getQuestions(query?: OpenQuestionQuery): OpenQuestion[];
  getArticleSummaries(): ArticleSummary[];
  getArticleTypes(): ArticleTypeSettings[];
  getWorkflowStages(): WorkflowStageSettings[];
  getWorkflowPayload(): WorkflowIndexPayload;
  getStatusOptions(): QuestionStatusOption[];
  getLanguage(): ToWriteLanguage;
  getGroupCurrentByHeading(): boolean;
  getCompactEditorDecorations(): boolean;
  getReminderPresets(): ToWriteReminderPreset[];
  getProactiveSuggestions(): ProactiveSuggestion[];
  getDeviceHubState(): HubDeviceState | undefined;
  getDefaultColor(lane: OpenQuestionLane): OpenQuestionColor;
  renderMarkdown(markdown: string, element: HTMLElement, sourcePath: string): Promise<void>;
  getLinkSuggestions(query: string, sourcePath: string): LinkSuggestion[];
  jumpToQuestion(id: string): Promise<void>;
  openFile(filePath: string): Promise<void>;
  openObsidianLink(linktext: string, sourcePath: string): Promise<void>;
  updateQuestion(id: string, patch: Omit<Partial<StoredQuestionState>, "id">): Promise<void>;
  createQuestionFromSelection(lane: OpenQuestionLane, color?: OpenQuestionColor): Promise<void>;
  openCapture(): void;
  openAiAssistant(): void;
  openCaptureForQuestion(id: string): void;
  actOnSuggestion(id: string, action: ProactiveSuggestionAction): Promise<void>;
  syncDeviceHub(): Promise<HubDeviceState | undefined>;
  sendQuestionToDeviceHub(id: string): Promise<HubDeviceState | undefined>;
  sendDeviceHubFeedback(action: HubFeedbackAction): Promise<void>;
  openDeviceHubTap(): void;
  acceptSuggestion(id: string): Promise<void>;
  editQuestion(id: string): Promise<void>;
  deleteQuestion(id: string): Promise<void>;
  pinQuestionToBlock(id: string): Promise<void>;
  refreshAi(id: string): Promise<OpenQuestionAi | undefined>;
  refreshIndex(): Promise<void>;
  exportNow(): Promise<void>;
  toggleCompactEditorDecorations(): Promise<void>;
  subscribe(listener: () => void): () => void;
  subscribeActiveContext(listener: () => void): () => void;
}

export const ACTIVE_STATUSES: OpenQuestionStatus[] = ["open", "candidate"];
