import { buildArticleSummaries, queryQuestions } from "./query";
import { stripQuestionRuleSyntax } from "./rule-text";
import type {
  ArticleSummary,
  OpenQuestion,
  OpenQuestionNote,
  OpenQuestionQuery,
  OpenQuestionSuggestion,
  StoredQuestionState
} from "./types";

type Listener = () => void;

export class OpenQuestionStore {
  private readonly parsedByFile = new Map<string, OpenQuestion[]>();
  private readonly sidecarByFile = new Map<string, OpenQuestion[]>();
  private readonly suggestionsByFile = new Map<string, OpenQuestionSuggestion[]>();
  private readonly stateById = new Map<string, StoredQuestionState>();
  private readonly listeners = new Set<Listener>();

  constructor(initialStates: Record<string, StoredQuestionState> = {}) {
    for (const state of Object.values(initialStates)) {
      this.stateById.set(state.id, state);
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  replaceFileQuestions(filePath: string, questions: OpenQuestion[]): void {
    this.parsedByFile.set(filePath, questions);
    this.notify();
  }

  replaceFileSuggestions(filePath: string, suggestions: OpenQuestionSuggestion[]): void {
    this.suggestionsByFile.set(filePath, suggestions);
    this.notify();
  }

  replaceSidecarQuestions(filePath: string, questions: OpenQuestion[]): void {
    this.sidecarByFile.set(filePath, questions);
    this.notify();
  }

  replaceAllSidecarQuestions(questions: OpenQuestion[]): void {
    this.sidecarByFile.clear();
    for (const question of questions) {
      const existing = this.sidecarByFile.get(question.source.file) ?? [];
      existing.push(question);
      this.sidecarByFile.set(question.source.file, existing);
    }
    this.notify();
  }

  removeFile(filePath: string): void {
    this.parsedByFile.delete(filePath);
    this.sidecarByFile.delete(filePath);
    this.suggestionsByFile.delete(filePath);
    this.notify();
  }

  getAllQuestions(): OpenQuestion[] {
    const merged = new Map<string, OpenQuestion>();

    for (const question of Array.from(this.parsedByFile.values()).flat()) {
      merged.set(question.id, question);
    }

    for (const question of Array.from(this.sidecarByFile.values()).flat()) {
      merged.set(question.id, question);
    }

    return Array.from(merged.values())
      .map((question) => this.applyState(question));
  }

  query(query: OpenQuestionQuery = {}): OpenQuestion[] {
    return queryQuestions(this.getAllQuestions(), query);
  }

  getQuestion(id: string): OpenQuestion | undefined {
    return this.getAllQuestions().find((question) => question.id === id);
  }

  getArticleSummaries(): ArticleSummary[] {
    return buildArticleSummaries(this.getAllQuestions());
  }

  getArticleSummary(filePath: string): ArticleSummary | undefined {
    return this.getArticleSummaries().find((summary) => summary.filePath === filePath);
  }

  getAllSuggestions(): OpenQuestionSuggestion[] {
    const existingQuestionIds = new Set(this.getAllQuestions().map((question) => question.id));
    const stateIds = new Set(this.stateById.keys());

    return Array.from(this.suggestionsByFile.values())
      .flat()
      .filter((suggestion) => !existingQuestionIds.has(suggestion.id))
      .filter((suggestion) => !stateIds.has(suggestion.id));
  }

  getSuggestions(filePath?: string): OpenQuestionSuggestion[] {
    const suggestions = this.getAllSuggestions();
    return filePath ? suggestions.filter((suggestion) => suggestion.source.file === filePath) : suggestions;
  }

  getSuggestion(id: string): OpenQuestionSuggestion | undefined {
    return this.getAllSuggestions().find((suggestion) => suggestion.id === id);
  }

  isSidecarQuestion(id: string): boolean {
    return Array.from(this.sidecarByFile.values())
      .flat()
      .some((question) => question.id === id);
  }

  patchQuestion(id: string, patch: Omit<Partial<StoredQuestionState>, "id">): StoredQuestionState {
    const existing = this.stateById.get(id);
    const now = new Date().toISOString();
    const next: StoredQuestionState = {
      id,
      createdAt: existing?.createdAt ?? now,
      ...existing,
      ...patch,
      updatedAt: now
    };

    this.stateById.set(id, next);
    this.notify();
    return next;
  }

  serializeStates(): Record<string, StoredQuestionState> {
    return Object.fromEntries(this.stateById.entries());
  }

  private applyState(question: OpenQuestion): OpenQuestion {
    const state = this.stateById.get(question.id);
    if (!state) {
      return cleanQuestionDisplayText(question);
    }

    return cleanQuestionDisplayText({
      ...question,
      status: state.status ?? question.status,
      lane: state.lane ?? question.lane ?? "think",
      kind: state.kind ?? question.kind,
      priority: state.priority ?? question.priority,
      title: state.title ?? question.title,
      question: state.question ?? question.question,
      note: state.note ?? question.note,
      notes: mergeNotes(question.notes, state.notes),
      reminderAt: state.reminderAt ?? question.reminderAt,
      reminderNote: state.reminderNote ?? question.reminderNote,
      reminderSource: state.reminderSource ?? question.reminderSource,
      reminderDismissedAt: state.reminderDismissedAt ?? question.reminderDismissedAt,
      tags: state.tags ?? question.tags ?? [],
      color: state.color ?? question.color ?? "amber",
      pinned: state.pinned ?? question.pinned,
      compactEditorDecoration: state.compactEditorDecoration ?? question.compactEditorDecoration,
      anchorText: state.anchorText ?? question.anchorText,
      anchor: state.anchor ?? question.anchor,
      ai: state.ai ?? question.ai,
      createdAt: state.createdAt ?? question.createdAt,
      updatedAt: state.updatedAt ?? question.updatedAt
    });
  }
}

function cleanQuestionDisplayText(question: OpenQuestion): OpenQuestion {
  if (question.source.rule !== "double-question" && question.source.rule !== "task-question") {
    return question;
  }

  return {
    ...question,
    title: question.title ? stripQuestionRuleSyntax(question.title, question.source.rule) : question.title,
    question: stripQuestionRuleSyntax(question.question, question.source.rule),
    anchorText: question.anchorText ? stripQuestionRuleSyntax(question.anchorText, question.source.rule) : question.anchorText
  };
}

function mergeNotes(base?: OpenQuestionNote[], patch?: OpenQuestionNote[]): OpenQuestionNote[] | undefined {
  const merged = new Map<string, OpenQuestionNote>();
  for (const note of [...(base ?? []), ...(patch ?? [])]) {
    merged.set(note.id, note);
  }
  const notes = Array.from(merged.values())
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return notes.length > 0 ? notes : undefined;
}
