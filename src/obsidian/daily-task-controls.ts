import { RangeSetBuilder, StateEffect, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate
} from "@codemirror/view";
import type {
  DailyPlanItem,
  DailyPlanNormalizationEdit,
  DailyPlanNormalizationPreview,
  DailyTaskTimingSnapshot
} from "../daily";

export const refreshDailyTaskControls = StateEffect.define<void>();

export type DailyTaskControlUpdateStrategy = "keep" | "map" | "rebuild";

export function getDailyTaskControlUpdateStrategy(update: {
  docChanged: boolean;
  reconfigured: boolean;
  refreshRequested: boolean;
  selectionChanged?: boolean;
}): DailyTaskControlUpdateStrategy {
  if (update.reconfigured || update.refreshRequested) return "rebuild";
  if (update.selectionChanged) return "rebuild";
  return update.docChanged ? "map" : "keep";
}

interface DailyTaskControlsOptions {
  isEnabled(): boolean;
  getActiveFilePath(): string | undefined;
  getItems(): readonly DailyPlanItem[];
  getNormalizationPreviews(): readonly DailyPlanNormalizationPreview[];
  getTiming(item: DailyPlanItem): DailyTaskTimingSnapshot;
  onToggle(item: DailyPlanItem): void | Promise<void>;
  onComplete(item: DailyPlanItem): void | Promise<void>;
  onEditProperties(item: DailyPlanItem): void | Promise<void>;
  onEnrich(edit: DailyPlanNormalizationEdit): void | Promise<void>;
  onTrackOnly(edit: DailyPlanNormalizationEdit): void | Promise<void>;
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
          ),
          selectionChanged: update.selectionSet
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
  const entries: Array<{ from: number; to: number; decoration: Decoration }> = [];
  const items = options.getItems()
    .filter((item) => item.sourcePath === activePath && item.line >= 1 && item.line <= view.state.doc.lines)
    .map((item) => ({ item, timing: options.getTiming(item) }));
  const selectedLines = new Set<number>();
  for (const selection of view.state.selection.ranges) {
    selectedLines.add(view.state.doc.lineAt(selection.anchor).number);
    selectedLines.add(view.state.doc.lineAt(selection.head).number);
  }
  for (const { item, timing } of items) {
    const taskLine = view.state.doc.line(item.line);
    entries.push({
      from: taskLine.from,
      to: taskLine.from,
      decoration: Decoration.line({
        attributes: {
          class: `towrite-daily-task-card-line towrite-daily-task-state-${timing.status}`,
          "data-towrite-task": item.id
        }
      })
    });
    entries.push({
      from: taskLine.to,
      to: taskLine.to,
      decoration: Decoration.widget({
      side: 10,
        widget: new DailyTaskControlWidget(item, timing, options)
      })
    });
    for (const lineNumber of ownedMetadataLineNumbers(view, item)) {
      if (selectedLines.has(lineNumber)) continue;
      const line = view.state.doc.line(lineNumber);
      entries.push({
        from: line.from,
        to: line.from,
        decoration: Decoration.line({
          attributes: {
            class: "towrite-daily-owned-metadata-folded",
            "data-towrite-task": item.id
          }
        })
      });
    }
  }

  for (const preview of options.getNormalizationPreviews()) {
    if (preview.sourcePath !== activePath) continue;
    for (const edit of preview.edits) {
      if (edit.line < 1 || edit.line > view.state.doc.lines) continue;
      const line = view.state.doc.line(edit.line);
      entries.push({
        from: line.from,
        to: line.from,
        decoration: Decoration.line({
          attributes: {
            class: "towrite-daily-task-card-line towrite-daily-task-candidate-line"
          }
        })
      });
      entries.push({
        from: line.to,
        to: line.to,
        decoration: Decoration.widget({
          side: 11,
          widget: new DailyTaskEnrichmentWidget(edit, options)
        })
      });
    }
  }

  entries.sort((left, right) => left.from - right.from || left.to - right.to);
  for (const entry of entries) {
    builder.add(entry.from, entry.to, entry.decoration);
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
    wrapper.dataset.enriched = hasVisibleProperties(this.item) ? "true" : "false";

    const state = doc.createElement("span");
    state.className = "towrite-daily-line-state";
    state.textContent = timingLabel(this.timing);
    wrapper.append(state);

    const summary = summarizeDailyProperties(this.item);
    if (summary) {
      const properties = doc.createElement("button");
      properties.type = "button";
      properties.className = "towrite-daily-property-summary";
      properties.textContent = summary;
      properties.title = "查看或编辑任务属性";
      properties.setAttribute("aria-label", `任务属性：${summary}`);
      properties.addEventListener("mousedown", stop);
      properties.addEventListener("click", (event) => {
        stop(event);
        void Promise.resolve(this.options.onEditProperties(this.item))
          .catch((error) => console.error("Daily task properties failed", error));
      });
      wrapper.append(properties);
    } else {
      const properties = actionButton(doc, "属性", () => this.options.onEditProperties(this.item));
      properties.classList.add("towrite-daily-line-properties");
      properties.title = "补充类别、目标、日期或预计时间";
      wrapper.append(properties);
    }

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

class DailyTaskEnrichmentWidget extends WidgetType {
  constructor(
    private readonly edit: DailyPlanNormalizationEdit,
    private readonly options: DailyTaskControlsOptions
  ) {
    super();
  }

  eq(other: DailyTaskEnrichmentWidget): boolean {
    return other.edit.line === this.edit.line
      && other.edit.before === this.edit.before
      && other.edit.proposedBlockId === this.edit.proposedBlockId;
  }

  toDOM(view: EditorView): HTMLElement {
    const doc = view.dom.ownerDocument;
    const wrapper = doc.createElement("span");
    wrapper.className = "towrite-daily-enrichment-controls";
    wrapper.setAttribute("role", "group");
    wrapper.setAttribute("aria-label", "ToWrite 新待办");

    const state = doc.createElement("span");
    state.className = "towrite-daily-enrichment-state";
    state.textContent = "新待办";
    wrapper.append(state);

    const enrich = actionButton(doc, "补充属性", () => this.options.onEnrich(this.edit));
    enrich.classList.add("towrite-daily-enrich");
    wrapper.append(enrich);

    const track = actionButton(doc, "跳过属性", () => this.options.onTrackOnly(this.edit));
    track.classList.add("towrite-daily-track-only");
    track.title = "只补稳定 ID，不添加任何属性";
    wrapper.append(track);
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

export function summarizeDailyProperties(
  item: Pick<
    DailyPlanItem,
    "category" | "dueDate" | "dueDateExplicit" | "estimateMinutes" | "target" | "nextStep"
  >
): string {
  const values = [
    item.category,
    item.dueDateExplicit ? item.dueDate : undefined,
    item.estimateMinutes ? `${item.estimateMinutes}m` : undefined,
    item.target ? "目标" : undefined,
    item.nextStep ? "下一步" : undefined
  ].filter((value): value is string => Boolean(value));
  return values.slice(0, 3).join(" · ");
}

function hasVisibleProperties(
  item: Pick<
    DailyPlanItem,
    "category" | "dueDateExplicit" | "estimateMinutes" | "target" | "nextStep"
  >
): boolean {
  return Boolean(
    item.category
    || item.dueDateExplicit
    || item.estimateMinutes
    || item.target
    || item.nextStep
  );
}

function ownedMetadataLineNumbers(view: EditorView, item: DailyPlanItem): number[] {
  const candidates = new Set<number>();
  const endLine = item.endLine ?? item.line;
  for (let line = item.line + 1; line <= Math.min(endLine, view.state.doc.lines); line += 1) {
    candidates.add(line);
  }
  for (const line of item.detachedOwnedLines ?? []) {
    if (line >= 1 && line <= view.state.doc.lines) candidates.add(line);
  }
  return [...candidates]
    .filter((line) => isOwnedDailyMetadataLine(view.state.doc.line(line).text))
    .sort((left, right) => left - right);
}

export function isOwnedDailyMetadataLine(value: string): boolean {
  const line = value.trim();
  if (/^\^daily_[a-f0-9]{32}$/u.test(line)) return true;
  return /^\[towrite-(?:kind|category|task-ref|pool-revision|device|at|scheduled|due|primary|minimum|goal|next|estimate|target|started)::/u.test(line)
    && line.endsWith("]");
}
