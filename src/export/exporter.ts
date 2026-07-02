import { Notice, TFile, type App } from "obsidian";
import type { OpenQuestionStore } from "../core/store";
import type {
  ArticleSummary,
  ExportArticlesPayload,
  ExportEinkPayload,
  ExportIndexPayload,
  OpenQuestion
} from "../core/types";
import type { ToWriteSettings } from "../core/settings";
import type { WorkflowIndexPayload } from "../workflow";

export class QuestionExporter {
  constructor(
    private readonly app: App,
    private readonly store: OpenQuestionStore,
    private readonly getSettings: () => ToWriteSettings,
    private readonly getWorkflowPayload: () => WorkflowIndexPayload
  ) {}

  async exportAll(): Promise<void> {
    const settings = this.getSettings();
    const directory = settings.exportDirectory.replace(/\\/gu, "/").replace(/\/+$/u, "");
    await ensureDirectory(this.app, directory);

    const vaultName = this.app.vault.getName();
    const generatedAt = new Date().toISOString();
    const questions = this.store.getAllQuestions();
    const articles = this.store.getArticleSummaries();

    const indexPayload: ExportIndexPayload = {
      schemaVersion: 2,
      generatedAt,
      vaultName,
      questions
    };

    const articlesPayload: ExportArticlesPayload = {
      schemaVersion: 2,
      generatedAt,
      vaultName,
      articles
    };

    const einkPayload = buildEinkPayload(generatedAt, questions, articles, vaultName);
    const workflowPayload = this.getWorkflowPayload();

    await this.app.vault.adapter.write(`${directory}/index.json`, JSON.stringify(indexPayload, null, 2));
    await this.app.vault.adapter.write(`${directory}/articles.json`, JSON.stringify(articlesPayload, null, 2));
    await this.app.vault.adapter.write(`${directory}/eink-compact.json`, JSON.stringify(einkPayload, null, 2));
    await this.app.vault.adapter.write(`${directory}/workflows.json`, JSON.stringify(workflowPayload, null, 2));

    if (settings.writeArticleProperties) {
      await this.writeArticleProperties(articles);
    }
  }

  private async writeArticleProperties(articles: ArticleSummary[]): Promise<void> {
    for (const article of articles) {
      const file = this.app.vault.getAbstractFileByPath(article.filePath);
      if (!(file instanceof TFile)) {
        continue;
      }

      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        const data: Record<string, unknown> = frontmatter;
        data.open_questions = article.open;
        data.candidate_questions = article.candidate;
        data.question_status = article.needsWork ? "blocked" : "clear";
      });
    }

    new Notice("ToWrite article properties updated.");
  }
}

export function buildEinkPayload(
  generatedAt: string,
  questions: OpenQuestion[],
  articles: ArticleSummary[],
  vaultName: string,
  limit = 12
): ExportEinkPayload {
  const focus = questions
    .filter((question) => isWorkStatus(question.status))
    .slice(0, limit)
    .map((question) => ({
      id: question.id,
      title: question.title ?? question.source.headingPath.at(-1) ?? question.question.slice(0, 20),
      body: question.question,
      question: question.question,
      article: question.source.file.replace(/\.md$/iu, ""),
      sourcePage: question.source.page,
      sourceSelectedText: question.source.pdfAnchor?.selectedText ?? question.anchorText,
      lane: question.lane,
      kind: question.kind,
      nextAction: question.ai?.nextAction,
      relatedNotes: question.ai?.relatedNotes?.slice(0, 3).map((note) => ({
        file: note.file,
        title: note.title,
        reason: note.reason
      })),
      relatedConcepts: question.ai?.relatedConcepts?.slice(0, 6),
      openUri: buildObsidianUri(vaultName, question)
    }));

  return {
    schemaVersion: 2,
    generatedAt,
    summary: {
      open: questions.filter((question) => isWorkStatus(question.status)).length,
      candidate: questions.filter((question) => question.status === "candidate").length,
      blockedArticles: articles.filter((article) => article.needsWork).length
    },
    focus
  };
}

function isWorkStatus(status: string): boolean {
  return status !== "candidate" && status !== "resolved" && status !== "ignored";
}

function buildObsidianUri(vaultName: string, question: OpenQuestion): string {
  const fragment = question.source.blockId ? `#^${question.source.blockId}` : "";
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(`${question.source.file}${fragment}`)}`;
}

async function ensureDirectory(app: App, directory: string): Promise<void> {
  const segments = directory.split("/").filter(Boolean);
  let current = "";

  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    if (!(await app.vault.adapter.exists(current))) {
      await app.vault.adapter.mkdir(current);
    }
  }
}
