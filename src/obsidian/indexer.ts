import type { App, TFile } from "obsidian";
import { mapInBatches } from "../core/async-batch";
import { parseOpenQuestionDocument } from "../core/parser";
import type { ToWriteSettings } from "../core/settings";
import type { OpenQuestionFileSnapshot, OpenQuestionStore } from "../core/store";

export class OpenQuestionIndexer {
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly app: App,
    private readonly store: OpenQuestionStore,
    private readonly getSettings: () => ToWriteSettings
  ) {}

  async rebuildVault(notify = true): Promise<void> {
    return this.enqueue(async () => {
      const files = this.app.vault.getMarkdownFiles();
      const settings = this.getSettings();
      const snapshots = await mapInBatches(files, async (file) => {
        const content = await this.app.vault.cachedRead(file);
        return this.parseFile(file, content, settings);
      });

      this.store.replaceVaultSnapshot(snapshots, notify);
    });
  }

  async indexFile(file: TFile, notify = true): Promise<void> {
    return this.enqueue(async () => {
      const content = await this.app.vault.cachedRead(file);
      const settings = this.getSettings();
      const snapshot = this.parseFile(file, content, settings);

      this.store.replaceFileSnapshot(file.path, snapshot.questions, snapshot.suggestions, notify);
    });
  }

  async removeFile(path: string, notify = true): Promise<void> {
    return this.enqueue(() => {
      this.store.removeParsedFile(path, notify);
    });
  }

  private enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private parseFile(file: TFile, content: string, settings: ToWriteSettings): OpenQuestionFileSnapshot {
    const parsed = parseOpenQuestionDocument(content, file.path, {
      enableCandidateDetection: settings.enableCandidateDetection,
      candidateTriggerWords: settings.candidateTriggerWords,
      defaultThinkColor: settings.defaultThinkColor,
      defaultWriteColor: settings.defaultWriteColor
    });

    return {
      filePath: file.path,
      questions: parsed.questions,
      suggestions: parsed.suggestions
    };
  }
}
