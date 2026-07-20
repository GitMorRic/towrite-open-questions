import { buildArticleSummaries, queryQuestions } from "./query";
import { stripQuestionRuleSyntax } from "./rule-text";
import { slugify } from "./hash";
import type {
  ArticleSummary,
  OpenQuestion,
  OpenQuestionNote,
  OpenQuestionQuery,
  OpenQuestionSuggestion,
  StoredQuestionState
} from "./types";

type Listener = () => void;

export interface OpenQuestionFileSnapshot {
  filePath: string;
  questions: OpenQuestion[];
  suggestions: OpenQuestionSuggestion[];
}

export class OpenQuestionStore {
  private readonly parsedByFile = new Map<string, OpenQuestion[]>();
  private readonly sidecarByFile = new Map<string, OpenQuestion[]>();
  private readonly suggestionsByFile = new Map<string, OpenQuestionSuggestion[]>();
  private readonly stateById = new Map<string, StoredQuestionState>();
  private readonly stateIdsByFile = new Map<string, Set<string>>();
  private readonly legacyStateIdsBySlug = new Map<string, Set<string>>();
  private readonly listeners = new Set<Listener>();

  constructor(initialStates: Record<string, StoredQuestionState> = {}) {
    for (const state of Object.values(initialStates)) {
      this.stateById.set(state.id, state);
      this.indexState(state);
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

  replaceFileSnapshot(
    filePath: string,
    questions: OpenQuestion[],
    suggestions: OpenQuestionSuggestion[],
    notify = true
  ): void {
    this.parsedByFile.set(filePath, questions);
    this.suggestionsByFile.set(filePath, suggestions);
    if (notify) {
      this.notify();
    }
  }

  replaceVaultSnapshot(snapshots: Iterable<OpenQuestionFileSnapshot>, notify = true): void {
    const parsedByFile = new Map<string, OpenQuestion[]>();
    const suggestionsByFile = new Map<string, OpenQuestionSuggestion[]>();

    for (const snapshot of snapshots) {
      parsedByFile.set(snapshot.filePath, snapshot.questions);
      suggestionsByFile.set(snapshot.filePath, snapshot.suggestions);
    }

    this.parsedByFile.clear();
    this.suggestionsByFile.clear();
    for (const [filePath, questions] of parsedByFile) {
      this.parsedByFile.set(filePath, questions);
    }
    for (const [filePath, suggestions] of suggestionsByFile) {
      this.suggestionsByFile.set(filePath, suggestions);
    }
    if (notify) {
      this.notify();
    }
  }

  replaceSidecarQuestions(filePath: string, questions: OpenQuestion[], notify = true): void {
    this.sidecarByFile.set(filePath, questions);
    if (notify) {
      this.notify();
    }
  }

  replaceAllSidecarQuestions(questions: OpenQuestion[], notify = true): void {
    this.sidecarByFile.clear();
    for (const question of questions) {
      const existing = this.sidecarByFile.get(question.source.file) ?? [];
      existing.push(question);
      this.sidecarByFile.set(question.source.file, existing);
    }
    if (notify) {
      this.notify();
    }
  }

  hasSidecarQuestionsForFile(filePath: string): boolean {
    return (this.sidecarByFile.get(filePath)?.length ?? 0) > 0;
  }

  getSidecarQuestionsForFile(filePath: string): OpenQuestion[] {
    return [...(this.sidecarByFile.get(filePath) ?? [])];
  }

  removeFile(filePath: string, notify = true): void {
    this.parsedByFile.delete(filePath);
    this.sidecarByFile.delete(filePath);
    this.suggestionsByFile.delete(filePath);
    if (notify) {
      this.notify();
    }
  }

  removeParsedFile(filePath: string, notify = true): void {
    this.parsedByFile.delete(filePath);
    this.suggestionsByFile.delete(filePath);
    if (notify) {
      this.notify();
    }
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

  getQuestionsForFile(filePath: string): OpenQuestion[] {
    const merged = new Map<string, OpenQuestion>();

    for (const question of this.parsedByFile.get(filePath) ?? []) {
      merged.set(question.id, question);
    }
    for (const question of this.sidecarByFile.get(filePath) ?? []) {
      merged.set(question.id, question);
    }

    return Array.from(merged.values(), (question) => this.applyState(question));
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
    const questions = this.getAllQuestions();
    const existingQuestionIds = new Set(questions.map((question) => question.id));
    const states = Array.from(this.stateById.values());
    const stateIds = new Set(states.map((state) => state.id));

    return Array.from(this.suggestionsByFile.values())
      .flat()
      .filter((suggestion) => !existingQuestionIds.has(suggestion.id))
      .filter((suggestion) => !stateIds.has(suggestion.id))
      .filter((suggestion) => !questions.some((question) => matchesSuggestionSignature(suggestion, question)))
      .filter((suggestion) => !states.some((state) => matchesIgnoredSuggestionSignature(suggestion, state)));
  }

  getSuggestions(filePath?: string): OpenQuestionSuggestion[] {
    return filePath ? this.getSuggestionsForFile(filePath) : this.getAllSuggestions();
  }

  getSuggestionsForFile(filePath: string): OpenQuestionSuggestion[] {
    const questions = this.getQuestionsForFile(filePath);
    const questionIds = new Set(questions.map((question) => question.id));
    const relevantStates = this.getStatesForFile(filePath);
    const questionSignatures = new Set(
      questions
        .filter((question) => question.status !== "ignored")
        .map((question) => candidateSignature(question.lane, question.question || question.anchorText))
    );
    const ignoredStateSignatures = new Set(
      relevantStates
        .filter((state) => state.status === "ignored" && state.lane)
        .map((state) => candidateSignature(state.lane!, state.question || state.anchorText))
        .filter((signature) => signature.endsWith(":") === false)
    );

    return (this.suggestionsByFile.get(filePath) ?? [])
      .filter((suggestion) => !questionIds.has(suggestion.id))
      .filter((suggestion) => !this.stateById.has(suggestion.id))
      .filter((suggestion) => !questionSignatures.has(candidateSignature(suggestion.lane, suggestion.question || suggestion.anchorText)))
      .filter((suggestion) => !ignoredStateSignatures.has(candidateSignature(suggestion.lane, suggestion.question || suggestion.anchorText)));
  }

  getSuggestion(id: string): OpenQuestionSuggestion | undefined {
    return this.getAllSuggestions().find((suggestion) => suggestion.id === id);
  }

  isSidecarQuestion(id: string): boolean {
    return Array.from(this.sidecarByFile.values())
      .flat()
      .some((question) => question.id === id);
  }

  patchQuestion(id: string, patch: Omit<Partial<StoredQuestionState>, "id">, notify = true): StoredQuestionState {
    const existing = this.stateById.get(id);
    const now = new Date().toISOString();
    const next: StoredQuestionState = {
      id,
      createdAt: existing?.createdAt ?? now,
      ...existing,
      ...patch,
      updatedAt: now
    };

    if (existing) {
      this.unindexState(existing);
    }
    this.stateById.set(id, next);
    this.indexState(next);
    if (notify) {
      this.notify();
    }
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
      deliveryPolicy: state.deliveryPolicy ?? question.deliveryPolicy,
      createdAt: state.createdAt ?? question.createdAt,
      updatedAt: state.updatedAt ?? question.updatedAt
    });
  }

  private getStatesForFile(filePath: string): StoredQuestionState[] {
    const slug = slugify(filePath.split(/[\\/]/u).pop() ?? filePath);
    const ids = new Set([
      ...(this.stateIdsByFile.get(filePath) ?? []),
      ...(this.legacyStateIdsBySlug.get(slug) ?? [])
    ]);

    return Array.from(ids, (id) => this.stateById.get(id))
      .filter((state): state is StoredQuestionState => state !== undefined);
  }

  private indexState(state: StoredQuestionState): void {
    if (state.source?.file) {
      addToSetMap(this.stateIdsByFile, state.source.file, state.id);
      return;
    }

    const slug = legacyStateSlug(state.id);
    if (slug) {
      addToSetMap(this.legacyStateIdsBySlug, slug, state.id);
    }
  }

  private unindexState(state: StoredQuestionState): void {
    if (state.source?.file) {
      removeFromSetMap(this.stateIdsByFile, state.source.file, state.id);
      return;
    }

    const slug = legacyStateSlug(state.id);
    if (slug) {
      removeFromSetMap(this.legacyStateIdsBySlug, slug, state.id);
    }
  }
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}

function removeFromSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key);
  if (!values) {
    return;
  }
  values.delete(value);
  if (values.size === 0) {
    map.delete(key);
  }
}

function legacyStateSlug(id: string): string | undefined {
  return /^oq_(.+)_[a-z0-9]{7}$/u.exec(id)?.[1];
}

function matchesSuggestionSignature(suggestion: OpenQuestionSuggestion, question: OpenQuestion): boolean {
  if (question.status === "ignored") {
    return false;
  }
  if (question.lane !== suggestion.lane || question.source.file !== suggestion.source.file) {
    return false;
  }
  return normalizedCandidateText(question.question || question.anchorText) === normalizedCandidateText(suggestion.question || suggestion.anchorText);
}

function matchesIgnoredSuggestionSignature(suggestion: OpenQuestionSuggestion, state: StoredQuestionState): boolean {
  if (state.status !== "ignored" || state.lane !== suggestion.lane) {
    return false;
  }
  const stateText = normalizedCandidateText(state.question || state.anchorText);
  const suggestionText = normalizedCandidateText(suggestion.question || suggestion.anchorText);
  if (!stateText || stateText !== suggestionText) {
    return false;
  }

  if (state.source?.file) {
    return state.source.file === suggestion.source.file;
  }

  return state.id.startsWith(`oq_${slugify(suggestion.source.file.split(/[\\/]/u).pop() ?? suggestion.source.file)}_`);
}

function normalizedCandidateText(text?: string): string {
  return stripQuestionRuleSyntax(text ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

function candidateSignature(lane: OpenQuestion["lane"], text?: string): string {
  return `${lane}:${normalizedCandidateText(text)}`;
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
