import { Notice, TFile, type App } from "obsidian";
import type { OpenQuestion } from "../core/types";
import { navigationTargetForQuestion } from "../navigation";
import { ObsidianNavigationAdapter } from "./open-target";
import { jumpToPdfQuestion } from "./pdf-layer";

export async function jumpToQuestion(app: App, question: OpenQuestion): Promise<void> {
  const file = app.vault.getAbstractFileByPath(question.source.file);
  if (!(file instanceof TFile)) {
    new Notice(`ToWrite could not find ${question.source.file}`);
    return;
  }

  if (file.extension.toLowerCase() === "pdf") {
    await jumpToPdfQuestion(app, file, question);
    return;
  }

  const result = await new ObsidianNavigationAdapter(app).open(
    navigationTargetForQuestion(question),
    { displayedValidated: true }
  );
  if (result.status !== "opened") {
    new Notice(`ToWrite could not open the question location: ${result.message}`);
  } else if (!result.exact) {
    new Notice("ToWrite opened the note, but the exact question position is unavailable.");
  }
}
