import { RangeSetBuilder, StateEffect, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate
} from "@codemirror/view";
import { taskPoolTrailingIdRange } from "./task-pool-preview";

const COMMENT_FIELD_RE = /^\s*%%\s*\[towrite-[a-z-]+::[\s\S]*\]\s*%%\s*$/iu;
const LEGACY_FIELD_RE = /^\s*\[towrite-[a-z-]+::[\s\S]*\]\s*$/iu;
const TASK_ID_RE = /^\s*\^task_[A-Za-z0-9_-]+\s*$/u;

export const refreshTaskPoolTechnicalMetadata = StateEffect.define<void>();

export interface TaskPoolTechnicalMetadataOptions {
  isEnabled(): boolean;
  getActiveFilePath(): string | undefined;
  getTaskPoolPath(): string;
  showTechnicalMetadata(): boolean;
}

export function isTaskPoolEditorTechnicalLine(value: string): boolean {
  const text = value.replace(/\u200b/gu, "").trim();
  return COMMENT_FIELD_RE.test(text) || LEGACY_FIELD_RE.test(text) || TASK_ID_RE.test(text);
}

/**
 * Task Pool metadata is still stored in Markdown, but its machine-owned lines
 * are presentation-only. This extension hides them in both Source Mode and
 * Live Preview and exposes atomic ranges so cursor navigation skips them.
 */
export function createTaskPoolTechnicalMetadataExtension(
  options: TaskPoolTechnicalMetadataOptions
): Extension {
  const plugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    atomic: DecorationSet;

    constructor(view: EditorView) {
      const built = buildMetadataDecorations(view, options);
      this.decorations = built.lines;
      this.atomic = built.atomic;
    }

    update(update: ViewUpdate): void {
      const refreshRequested = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(refreshTaskPoolTechnicalMetadata))
      );
      const reconfigured = update.transactions.some((transaction) => transaction.reconfigured);
      if (update.docChanged || reconfigured || refreshRequested) {
        const built = buildMetadataDecorations(update.view, options);
        this.decorations = built.lines;
        this.atomic = built.atomic;
      }
    }
  }, {
    decorations: (value) => value.decorations
  });

  return [
    plugin,
    EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none)
  ];
}

function buildMetadataDecorations(
  view: EditorView,
  options: TaskPoolTechnicalMetadataOptions
): { lines: DecorationSet; atomic: DecorationSet } {
  if (
    !options.isEnabled()
    || options.showTechnicalMetadata()
    || normalizePath(options.getActiveFilePath() ?? "") !== normalizePath(options.getTaskPoolPath())
  ) {
    return { lines: Decoration.none, atomic: Decoration.none };
  }
  const lineBuilder = new RangeSetBuilder<Decoration>();
  const atomicBuilder = new RangeSetBuilder<Decoration>();
  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    if (isTaskPoolEditorTechnicalLine(line.text)) {
      lineBuilder.add(line.from, line.from, Decoration.line({
        attributes: {
          class: "towrite-task-pool-technical-folded",
          "aria-hidden": "true"
        }
      }));
      if (line.to > line.from) {
        atomicBuilder.add(line.from, line.to, Decoration.mark({
          class: "towrite-task-pool-technical-atomic"
        }));
      }
      continue;
    }
    const trailingId = taskPoolTrailingIdRange(line.text);
    if (trailingId) {
      const from = line.from + trailingId.from;
      const to = line.from + trailingId.to;
      lineBuilder.add(from, to, Decoration.replace({ inclusive: false }));
      atomicBuilder.add(from, to, Decoration.mark({
        class: "towrite-task-pool-technical-atomic"
      }));
    }
  }
  return { lines: lineBuilder.finish(), atomic: atomicBuilder.finish() };
}

function normalizePath(value: string): string {
  return value.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "").toLocaleLowerCase();
}
