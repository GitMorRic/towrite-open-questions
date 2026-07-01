import { MarkdownView, Notice, TFile, type App } from "obsidian";
import type { OpenQuestion } from "../core/types";
import { jumpToPdfQuestion } from "./pdf-layer";

export async function jumpToQuestion(app: App, question: OpenQuestion): Promise<void> {
  const file = app.vault.getAbstractFileByPath(question.source.file);
  if (!(file instanceof TFile)) {
    new Notice(`ToWrite could not find ${question.source.file}`);
    return;
  }

  const leaf = app.workspace.getLeaf(false);
  if (file.extension.toLowerCase() === "pdf") {
    await jumpToPdfQuestion(app, file, question);
    return;
  }

  await leaf.openFile(file, {
    active: true,
    state: question.source.page ? { page: question.source.page } : undefined,
    eState: question.source.page ? { page: question.source.page } : undefined
  });

  const view = app.workspace.getActiveViewOfType(MarkdownView);
  const editor = view?.editor;

  if (!editor) {
    return;
  }

  const line = Math.max(0, question.source.lineStart);
  const ch = 0;
  const from = { line, ch };
  const to = { line: Math.max(line, question.source.lineEnd), ch: editor.getLine(Math.max(line, question.source.lineEnd)).length };

  editor.setCursor(from);
  editor.scrollIntoView({ from, to }, true);
  flashActiveMarkdownLine(view);
}

function flashActiveMarkdownLine(view: MarkdownView): void {
  window.setTimeout(() => {
    const line = view.containerEl.querySelector<HTMLElement>(".cm-line.cm-active")
      ?? view.containerEl.querySelector<HTMLElement>(".cm-active");
    if (!line) {
      return;
    }

    line.addClass("towrite-editor-line-flash");
    window.setTimeout(() => {
      line.removeClass("towrite-editor-line-flash");
    }, 1500);
  }, 80);
}
