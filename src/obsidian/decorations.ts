import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate
} from "@codemirror/view";
import type { OpenQuestion, OpenQuestionSuggestion } from "../core/types";

interface QuestionDecorationOptions {
  getActiveFileQuestions: () => OpenQuestion[];
  getActiveFileSuggestions: () => OpenQuestionSuggestion[];
  getCompactEditorDecorations: () => boolean;
  onAcceptSuggestion: (id: string) => void | Promise<void>;
  onIgnoreSuggestion: (id: string) => void | Promise<void>;
}

export function createQuestionDecorations(options: QuestionDecorationOptions): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, options);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view, options);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations
    }
  );
}

function buildDecorations(view: EditorView, options: QuestionDecorationOptions): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const ranges: Array<{ from: number; to: number; decoration: Decoration }> = [];
  const questions = options.getActiveFileQuestions();
  const suggestions = options.getActiveFileSuggestions();
  const compactAll = options.getCompactEditorDecorations();

  for (const question of questions) {
    if (question.status === "ignored") {
      continue;
    }

    const compactLineClass = compactAll || question.compactEditorDecoration ? " towrite-editor-line-compact" : "";

    if (question.anchor && !question.anchor.orphaned) {
      const from = clamp(question.anchor.startOffset, 0, view.state.doc.length);
      const to = clamp(question.anchor.endOffset, from, view.state.doc.length);
      if (to > from && !compactLineClass) {
        ranges.push({
          from,
          to,
          decoration: Decoration.mark({
            class: `towrite-mark towrite-mark-${question.color} towrite-mark-${question.status}`,
            attributes: {
              "data-towrite-id": question.id,
              "data-towrite-color": question.color
            }
          })
        });
        continue;
      }
    }

    const lineNumber = question.source.lineStart + 1;
    if (lineNumber < 1 || lineNumber > view.state.doc.lines) {
      continue;
    }

    const line = view.state.doc.line(lineNumber);
    const statusClass = question.status.replace(/[^a-z0-9_-]/giu, "-");
    ranges.push({
      from: line.from,
      to: line.from,
      decoration: Decoration.line({
        class: `towrite-editor-line-${statusClass} towrite-line-${question.color} towrite-line-lane-${question.lane}${compactLineClass}`
      })
    });
  }

  for (const suggestion of suggestions) {
    const compactLineClass = compactAll ? " towrite-editor-line-compact" : "";
    const lineNumber = suggestion.source.lineStart + 1;
    if (lineNumber < 1 || lineNumber > view.state.doc.lines) {
      continue;
    }

    const line = view.state.doc.line(lineNumber);
    ranges.push({
      from: line.from,
      to: line.from,
      decoration: Decoration.line({
        class: `towrite-editor-line-suggestion towrite-line-${suggestion.color} towrite-line-lane-${suggestion.lane}${compactLineClass}`
      })
    });
    ranges.push({
      from: line.to,
      to: line.to,
      decoration: Decoration.widget({
        side: 1,
        widget: new SuggestionActionsWidget(suggestion, options.onAcceptSuggestion, options.onIgnoreSuggestion)
      })
    });
  }

  ranges
    .sort((left, right) => left.from - right.from || left.to - right.to)
    .forEach((range) => builder.add(range.from, range.to, range.decoration));

  return builder.finish();
}

class SuggestionActionsWidget extends WidgetType {
  constructor(
    private readonly suggestion: OpenQuestionSuggestion,
    private readonly onAcceptSuggestion: (id: string) => void | Promise<void>,
    private readonly onIgnoreSuggestion: (id: string) => void | Promise<void>
  ) {
    super();
  }

  eq(other: SuggestionActionsWidget): boolean {
    return other.suggestion.id === this.suggestion.id && other.suggestion.lane === this.suggestion.lane;
  }

  toDOM(view: EditorView): HTMLElement {
    const doc = view.dom.ownerDocument;
    const win = doc.defaultView ?? window;
    const wrapper = doc.createElement("span");
    wrapper.className = "towrite-suggestion-actions";

    const button = doc.createElement("button");
    button.type = "button";
    button.className = `towrite-suggestion-add towrite-suggestion-add-${this.suggestion.lane}`;
    button.textContent = this.suggestion.lane === "write" ? "+ Write" : "+ Think";
    button.title = this.suggestion.lane === "write" ? "Add this line to ToWrite" : "Add this line to ToThink";
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      button.textContent = "Added";
      void Promise.resolve(this.onAcceptSuggestion(this.suggestion.id))
        .catch((error) => console.error("Failed to accept ToWrite suggestion", error))
        .finally(() => {
          win.setTimeout(() => view.dispatch({}), 0);
        });
    });

    const ignoreButton = doc.createElement("button");
    ignoreButton.type = "button";
    ignoreButton.className = "towrite-suggestion-ignore";
    ignoreButton.textContent = "×";
    ignoreButton.title = "Ignore this ToWrite suggestion";
    ignoreButton.setAttribute("aria-label", "Ignore this ToWrite suggestion");
    ignoreButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    ignoreButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      ignoreButton.disabled = true;
      button.disabled = true;
      void Promise.resolve(this.onIgnoreSuggestion(this.suggestion.id))
        .catch((error) => console.error("Failed to ignore ToWrite suggestion", error))
        .finally(() => {
          win.setTimeout(() => view.dispatch({}), 0);
        });
    });

    wrapper.append(button, ignoreButton);
    return wrapper;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
