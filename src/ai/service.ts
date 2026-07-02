import { TFile, type App } from "obsidian";
import type { ToWriteSettings } from "../core/settings";
import type { OpenQuestionAi } from "../core/types";
import type { OpenQuestionStore } from "../core/store";
import type { LocalKnowledgeIndex } from "./local-index";
import type { AiContextInput, AiQuestionProvider, AiRefreshResult } from "./types";

interface AiQuestionServiceOptions {
  app: App;
  store: OpenQuestionStore;
  localIndex: LocalKnowledgeIndex;
  provider: AiQuestionProvider;
  getSettings: () => ToWriteSettings;
  onQuestionUpdated: () => Promise<void>;
}

export class AiQuestionService {
  private queue: string[] = [];
  private processing = false;
  private autoRuns = 0;

  constructor(private readonly options: AiQuestionServiceOptions) {}

  async refreshQuestion(id: string, mode: "manual" | "auto"): Promise<AiRefreshResult | undefined> {
    const question = this.options.store.getQuestion(id);
    if (!question || question.status === "ignored" || question.status === "resolved") {
      return undefined;
    }

    const settings = this.options.getSettings();
    validateAiSettings(settings);

    const context = await this.buildContext(question.id);
    if (!context) {
      return undefined;
    }

    try {
      const providerContext = settings.ai.rerankLocalNotes ? context : { ...context, localCandidates: [] };
      const ai = await this.options.provider.summarize(providerContext);
      const localRelatedNotes = context.localCandidates.slice(0, 5).map((candidate) => ({
        file: candidate.file,
        title: candidate.title,
        snippet: candidate.snippet,
        score: candidate.score
      }));
      const withFallback: OpenQuestionAi = {
        ...ai,
        relatedNotes: settings.ai.rerankLocalNotes && ai.relatedNotes && ai.relatedNotes.length > 0
          ? ai.relatedNotes
          : localRelatedNotes,
        generatedAt: ai.generatedAt ?? new Date().toISOString(),
        error: undefined
      };
      this.options.store.patchQuestion(id, { ai: withFallback });
      await this.options.onQuestionUpdated();
      return { ai: withFallback, mode };
    } catch (error) {
      const previous = this.options.store.getQuestion(id)?.ai;
      const ai: OpenQuestionAi = {
        ...previous,
        relatedNotes: previous?.relatedNotes,
        generatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      };
      this.options.store.patchQuestion(id, { ai });
      await this.options.onQuestionUpdated();
      if (mode === "manual") {
        throw error;
      }
      return { ai, mode };
    }
  }

  refreshMissingForActiveNote(filePath: string | null): void {
    if (!filePath) {
      return;
    }
    const ids = this.options.store
      .query({ filePath })
      .filter((question) => shouldAutoRefresh(question.ai, question.status))
      .map((question) => question.id);
    this.enqueueAutoRefresh(ids);
  }

  enqueueAutoRefresh(questionIds: string[]): void {
    const settings = this.options.getSettings();
    if (!settings.ai.enabled || !settings.ai.autoRun) {
      return;
    }

    for (const id of questionIds) {
      if (this.queue.includes(id)) {
        continue;
      }
      if (this.autoRuns + this.queue.length >= settings.ai.maxAutoRunsPerSession) {
        break;
      }
      this.queue.push(id);
    }

    void this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const settings = this.options.getSettings();
        if (!settings.ai.enabled || !settings.ai.autoRun || this.autoRuns >= settings.ai.maxAutoRunsPerSession) {
          this.queue = [];
          break;
        }
        const id = this.queue.shift();
        if (!id) {
          continue;
        }
        this.autoRuns += 1;
        await this.refreshQuestion(id, "auto");
      }
    } finally {
      this.processing = false;
    }
  }

  private async buildContext(id: string): Promise<AiContextInput | undefined> {
    const question = this.options.store.getQuestion(id);
    if (!question) {
      return undefined;
    }

    const file = this.options.app.vault.getAbstractFileByPath(question.source.file);
    if (!(file instanceof TFile)) {
      return undefined;
    }

    const localCandidates = this.options.localIndex.query(question, 20);
    if (file.extension !== "md") {
      const fallbackText = question.note
        ? `${question.anchorText ?? question.question}\n${question.note}`
        : question.anchorText ?? question.question;
      return {
        noteTitle: file.basename,
        frontmatter: {},
        headingPath: question.source.headingPath,
        question,
        anchorText: question.anchorText,
        beforeLines: [],
        afterLines: [],
        fullNote: fallbackText,
        localCandidates
      };
    }

    const content = await this.options.app.vault.cachedRead(file);
    const lines = content.replace(/\r\n?/gu, "\n").split("\n");
    const cache = this.options.app.metadataCache.getFileCache(file);

    return {
      noteTitle: file.basename,
      frontmatter: cache?.frontmatter,
      headingPath: question.source.headingPath,
      question,
      anchorText: question.anchorText,
      beforeLines: sliceLines(lines, question.source.lineStart - 8, question.source.lineStart),
      afterLines: sliceLines(lines, question.source.lineEnd + 1, question.source.lineEnd + 9),
      fullNote: content.length <= 12000 ? content : undefined,
      localCandidates
    };
  }
}

function validateAiSettings(settings: ToWriteSettings): void {
  if (!settings.ai.enabled) {
    throw new Error("AI is disabled in ToWrite settings.");
  }
  if (!settings.ai.baseUrl.trim()) {
    throw new Error("AI Base URL is missing.");
  }
  if (!settings.ai.apiKey.trim()) {
    throw new Error("AI API Key is missing.");
  }
  if (!settings.ai.model.trim()) {
    throw new Error("AI model is missing.");
  }
}

function shouldAutoRefresh(ai: OpenQuestionAi | undefined, status: string): boolean {
  if (status === "candidate" || status === "resolved" || status === "ignored") {
    return false;
  }
  if (!ai?.generatedAt || ai.error) {
    return true;
  }
  const ageMs = Date.now() - Date.parse(ai.generatedAt);
  return Number.isFinite(ageMs) && ageMs > 1000 * 60 * 60 * 24 * 7;
}

function sliceLines(lines: string[], start: number, end: number): string[] {
  return lines.slice(Math.max(0, start), Math.min(lines.length, end)).map((line) => line.trim()).filter(Boolean);
}
