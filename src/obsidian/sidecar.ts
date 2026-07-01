import { TFile, type App } from "obsidian";
import { lineRangeForOffsets, resolveQuestionAnchor } from "../core/anchor";
import { shortHash, slugify } from "../core/hash";
import type { ToWriteSettings } from "../core/settings";
import type { OpenQuestion } from "../core/types";

interface SidecarQuestionFile {
  schemaVersion: 2;
  question: OpenQuestion;
}

export class QuestionSidecarRepository {
  constructor(
    private readonly app: App,
    private readonly getSettings: () => ToWriteSettings
  ) {}

  async loadAll(): Promise<OpenQuestion[]> {
    const directory = this.questionDirectory();
    if (!(await this.app.vault.adapter.exists(directory))) {
      return [];
    }

    const listed = await this.app.vault.adapter.list(directory);
    const questions: OpenQuestion[] = [];

    for (const path of listed.files.filter((file) => file.endsWith(".json"))) {
      try {
        const payload = JSON.parse(await this.app.vault.adapter.read(path)) as Partial<SidecarQuestionFile>;
        if (payload.question) {
          questions.push(await this.resolveQuestion(payload.question));
        }
      } catch {
        // Ignore malformed sidecar files so one bad note cannot break the index.
      }
    }

    return questions;
  }

  async upsert(question: OpenQuestion): Promise<void> {
    await ensureDirectory(this.app, this.questionDirectory());
    const payload: SidecarQuestionFile = {
      schemaVersion: 2,
      question
    };

    await this.app.vault.adapter.write(this.pathForQuestion(question), JSON.stringify(payload, null, 2));
  }

  async remove(question: OpenQuestion): Promise<void> {
    const path = this.pathForQuestion(question);
    if (await this.app.vault.adapter.exists(path)) {
      await this.app.vault.adapter.remove(path);
    }
  }

  async refreshResolvedQuestions(): Promise<OpenQuestion[]> {
    const questions = await this.loadAll();
    return questions;
  }

  private async resolveQuestion(question: OpenQuestion): Promise<OpenQuestion> {
    if (!question.anchor) {
      return question;
    }

    const file = this.app.vault.getAbstractFileByPath(question.source.file);
    if (file instanceof TFile && file.extension !== "md") {
      return question;
    }
    if (!(file instanceof TFile)) {
      return {
        ...question,
        anchor: {
          ...question.anchor,
          confidence: 0,
          orphaned: true
        }
      };
    }

    const content = await this.app.vault.cachedRead(file);
    const resolution = resolveQuestionAnchor(content, question.anchor);
    const lineRange = lineRangeForOffsets(content, resolution.startOffset, resolution.endOffset);

    return {
      ...question,
      anchor: resolution.anchor,
      source: {
        ...question.source,
        lineStart: lineRange.lineStart,
        lineEnd: lineRange.lineEnd
      }
    };
  }

  private questionDirectory(): string {
    return `${this.getSettings().exportDirectory.replace(/\\/gu, "/").replace(/\/+$/u, "")}/questions`;
  }

  private pathForQuestion(question: OpenQuestion): string {
    const fileSlug = slugify(question.source.file);
    const idSlug = slugify(question.id);
    const hash = shortHash(`${question.source.file}:${question.id}`);
    return `${this.questionDirectory()}/${fileSlug}-${idSlug}-${hash}.json`;
  }
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
