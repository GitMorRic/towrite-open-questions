import { TFile, type App } from "obsidian";
import { parseOpenQuestionDocument } from "../core/parser";
import type { ToWriteSettings } from "../core/settings";
import type { OpenQuestionStore } from "../core/store";

export class OpenQuestionIndexer {
  constructor(
    private readonly app: App,
    private readonly store: OpenQuestionStore,
    private readonly getSettings: () => ToWriteSettings
  ) {}

  async rebuildVault(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();
    await Promise.all(files.map((file) => this.indexFile(file)));
  }

  async indexFile(file: TFile): Promise<void> {
    const content = await this.app.vault.cachedRead(file);
    const settings = this.getSettings();
    const parsed = parseOpenQuestionDocument(content, file.path, {
      enableCandidateDetection: settings.enableCandidateDetection,
      candidateTriggerWords: settings.candidateTriggerWords,
      defaultThinkColor: settings.defaultThinkColor,
      defaultWriteColor: settings.defaultWriteColor
    });

    this.store.replaceFileQuestions(file.path, parsed.questions);
    this.store.replaceFileSuggestions(file.path, parsed.suggestions);
  }

  removeFile(path: string): void {
    this.store.removeFile(path);
  }
}
