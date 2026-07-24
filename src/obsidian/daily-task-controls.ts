import { RangeSetBuilder, StateEffect, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate
} from "@codemirror/view";
import type { DailyPlanItem, DailyTaskTimingSnapshot } from "../daily";

export const refreshDailyTaskControls = StateEffect.define<void>();

export type DailyTaskControlUpdateStrategy = "keep" | "map" | "rebuild";

export function getDailyTaskControlUpdateStrategy(update: {
  docChanged: boolean;
  reconfigured: boolean;
  refreshRequested: boolean;
}): DailyTaskControlUpdateStrategy {
  if (update.reconfigured || update.refreshRequested) return "rebuild";
  return update.docChanged ? "map" : "keep";
}

interface DailyTaskControlsOptions {
  isEnabled(): boolean;
  getActiveFilePath(): string | undefined;
  getItems(): readonly DailyPlanItem[];
  getTiming(item: DailyPlanItem): DailyTaskTimingSnapshot;
  onToggle(item: DailyPlanItem): void | Promise<void>;
  onComplete(item: DailyPlanItem): void | Promise<void>;
}

/**
 * Uses only the plugin's already-built Daily cache. CodeMirror document
 * changes map existing widgets and never parse Markdown, touch disk, or call
 * the network on the typing path.
 */
export function createDailyTaskControls(options: DailyTaskControlsOptions): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildControls(view, options);
      }

      update(update: ViewUpdate): void {
        const strategy = getDailyTaskControlUpdateStrategy({
          docChanged: update.docChanged,
          reconfigured: update.transactions.some((transaction) => transaction.reconfigured),
          refreshRequested: update.transactions.some((transaction) =>
            transaction.effects.some((effect) => effect.is(refreshDailyTaskControls))
          )
        });
        if (strategy === "rebuild") {
          this.decorations = buildControls(update.view, options);
        } else if (strategy === "map") {
          this.decorations = this.decorations.map(update.changes);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations }
  );
}

function buildControls(view: EditorView, options: DailyTaskControlsOptions): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  if (!options.isEnabled()) return builder.finish();
  const activePath = options.getActiveFilePath();
  if (!activePath) return builder.finish();
  const ranges = options.getItems()
    .filter((item) => item.sourcePath === activePath && item.line >= 1 && item.line <= view.state.doc.lines)
    .map((item) => ({
      at: view.state.doc.line(item.line).to,
      item,
      timing: options.getTiming(item)
    }))
    .sort((left, right) => left.at - right.at);
  for (const range of ranges) {
    builder.add(range.at, range.at, Decoration.widget({
      side: 10,
      widget: new DailyTaskControlWidget(range.item, range.timing, options)
    }));
  }
  return builder.finish();
}

class DailyTaskControlWidget extends WidgetType {
  constructor(
    private readonly item: DailyPlanItem,
    private readonly timing: DailyTaskTimingSnapshot,
    private readonly options: DailyTaskControlsOptions
  ) {
    super();
  }

  eq(other: DailyTaskControlWidget): boolean {
    return other.item.id === this.item.id
      && other.item.revision.value === this.item.revision.value
      && other.timing.timingRevision === this.timing.timingRevision
      && other.item.status === this.item.status;
  }

  toDOM(view: EditorView): HTMLElement {
    const doc = view.dom.ownerDocument;
    const wrapper = doc.createElement("span");
    wrapper.className = "towrite-daily-line-controls";
    wrapper.dataset.state = this.timing.status;

    const state = doc.createElement("span");
    state.className = "towrite-daily-line-state";
    state.textContent = timingLabel(this.timing);
    wrapper.append(state);

    if (this.item.status !== "done") {
      const toggle = actionButton(doc, toggleLabel(this.timing), () => this.options.onToggle(this.item));
      toggle.classList.add("towrite-daily-line-toggle");
      wrapper.append(toggle);
      const complete = actionButton(doc, "✓", () => this.options.onComplete(this.item));
      complete.title = "Complete Daily task";
      wrapper.append(complete);
    }
    return wrapper;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function actionButton(
  doc: Document,
  label: string,
  action: () => void | Promise<void>
): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("mousedown", stop);
  button.addEventListener("click", (event) => {
    stop(event);
    button.disabled = true;
    void Promise.resolve(action()).catch((error) => {
      console.error("Daily task line action failed", error);
    }).finally(() => {
      button.disabled = false;
    });
  });
  return button;
}

function stop(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

function toggleLabel(timing: DailyTaskTimingSnapshot): string {
  if (timing.status === "running") return "Ⅱ";
  return "▶";
}

function timingLabel(timing: DailyTaskTimingSnapshot): string {
  if (timing.status === "completed") return "done";
  const minutes = Math.floor(timing.activeMs / 60_000);
  if (timing.status === "running") return `${minutes}m · running`;
  if (timing.status === "paused") return `${minutes}m · paused`;
  return "not started";
}
