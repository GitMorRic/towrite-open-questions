import {
  EditorSuggest,
  type App,
  type Editor,
  type EditorPosition,
  type EditorSuggestContext,
  type EditorSuggestTriggerInfo,
  type TFile
} from "obsidian";
import {
  matchMarkdownTaskInput,
  rankMarkdownTaskInputSuggestions,
  type MarkdownTaskInputSuggestion
} from "./task-input-suggest-core";

export type { MarkdownTaskInputSuggestion } from "./task-input-suggest-core";

export interface MarkdownTaskInputSuggestOptions {
  isEnabled(): boolean;
  getItems(): readonly MarkdownTaskInputSuggestion[];
}

/**
 * Fast, cache-only suggestions for an authored Markdown checkbox. No Vault
 * reads, index rebuilds, or network calls are performed on the typing path.
 */
export class MarkdownTaskInputSuggest extends EditorSuggest<MarkdownTaskInputSuggestion> {
  constructor(app: App, private readonly options: MarkdownTaskInputSuggestOptions) {
    super(app);
    this.limit = 8;
    this.setInstructions([
      { command: "↵", purpose: "填入待办或笔记" },
      { command: "Esc", purpose: "关闭" }
    ]);
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    _file: TFile | null
  ): EditorSuggestTriggerInfo | null {
    if (!this.options.isEnabled()) return null;
    const beforeCursor = editor.getLine(cursor.line).slice(0, cursor.ch);
    const match = matchMarkdownTaskInput(beforeCursor);
    if (!match) return null;
    return {
      start: { line: cursor.line, ch: match.startCh },
      end: cursor,
      query: match.query
    };
  }

  getSuggestions(context: EditorSuggestContext): MarkdownTaskInputSuggestion[] {
    return rankMarkdownTaskInputSuggestions(this.options.getItems(), context.query, this.limit);
  }

  renderSuggestion(value: MarkdownTaskInputSuggestion, el: HTMLElement): void {
    el.addClass("towrite-task-input-suggestion");
    const title = el.createDiv({ cls: "towrite-task-input-suggestion-title" });
    title.createSpan({ text: value.kind === "task" ? "待办" : "笔记", cls: "towrite-task-input-suggestion-kind" });
    title.createSpan({ text: value.label });
    el.createDiv({ text: value.detail, cls: "towrite-task-input-suggestion-detail" });
  }

  selectSuggestion(value: MarkdownTaskInputSuggestion): void {
    const context = this.context;
    if (!context) return;
    context.editor.replaceRange(value.replacement, context.start, context.end);
    const end = {
      line: context.start.line,
      ch: context.start.ch + value.replacement.length
    };
    context.editor.setCursor(end);
  }
}
