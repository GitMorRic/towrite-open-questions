import {
  type EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Extension
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType
} from "@codemirror/view";
import type {
  DailyPlanItem,
  DailyPlanNormalizationEdit,
  DailyPlanNormalizationPreview,
  DailyTaskTimingSnapshot,
  TrackedNoteTask
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

export interface DailyLinkedTaskProjection {
  id: string;
  sourcePath: string;
  line: number;
  targetPath: string;
  targetTitle: string;
  relationRevision: string;
  tasks: TrackedNoteTask[];
}

interface DailyTaskControlsOptions {
  isEnabled(): boolean;
  getActiveFilePath(): string | undefined;
  getItems(): readonly DailyPlanItem[];
  getNormalizationPreviews(): readonly DailyPlanNormalizationPreview[];
  getLinkedTaskProjections(): readonly DailyLinkedTaskProjection[];
  getPreviousUnfinished(): readonly DailyPlanItem[];
  getTodaySourcePath(): string | undefined;
  getTiming(item: DailyPlanItem): DailyTaskTimingSnapshot;
  onToggle(item: DailyPlanItem): void | Promise<void>;
  onComplete(item: DailyPlanItem): void | Promise<void>;
  onOpen(item: DailyPlanItem): void | Promise<void>;
  onEditProperties(item: DailyPlanItem): void | Promise<void>;
  onEnrich(edit: DailyPlanNormalizationEdit): void | Promise<void>;
  onTrackOnly(edit: DailyPlanNormalizationEdit): void | Promise<void>;
  onOpenPending(edit: DailyPlanNormalizationEdit): void | Promise<void>;
  onToggleLinkedTask(projection: DailyLinkedTaskProjection, item: TrackedNoteTask): void | Promise<void>;
  onOpenLinkedNote(projection: DailyLinkedTaskProjection): void | Promise<void>;
  onOpenPreviousMigration(): void | Promise<void>;
}

/**
 * Uses only the plugin's already-built Daily cache. CodeMirror document
 * changes map existing widgets and never parse Markdown, touch disk, or call
 * the network on the typing path.
 */
export function createDailyTaskControls(options: DailyTaskControlsOptions): Extension {
  const controls = StateField.define<{ decorations: DecorationSet; atomic: DecorationSet }>({
    create(state) {
      return buildControls(state, options);
    },
    update(value, transaction) {
      const strategy = getDailyTaskControlUpdateStrategy({
        docChanged: transaction.docChanged,
        reconfigured: transaction.reconfigured,
        refreshRequested: transaction.effects.some((effect) => effect.is(refreshDailyTaskControls)),
        selectionChanged: transaction.selection !== undefined
      });
      if (strategy === "rebuild") return buildControls(transaction.state, options);
      if (strategy === "map") {
        return {
          decorations: value.decorations.map(transaction.changes),
          atomic: value.atomic.map(transaction.changes)
        };
      }
      return value;
    },
    provide: (field) => [
      EditorView.decorations.from(field, (value) => value.decorations),
      EditorView.atomicRanges.from(field, (value) => () => value.atomic)
    ]
  });
  return controls;
}

function buildControls(
  state: EditorState,
  options: DailyTaskControlsOptions
): { decorations: DecorationSet; atomic: DecorationSet } {
  const builder = new RangeSetBuilder<Decoration>();
  const atomicBuilder = new RangeSetBuilder<Decoration>();
  if (!options.isEnabled()) return { decorations: builder.finish(), atomic: atomicBuilder.finish() };
  const activePath = options.getActiveFilePath();
  if (!activePath) return { decorations: builder.finish(), atomic: atomicBuilder.finish() };
  const entries: Array<{ from: number; to: number; decoration: Decoration }> = [];
  const atomicEntries: Array<{ from: number; to: number; decoration: Decoration }> = [];
  const items = options.getItems()
    .filter((item) => item.sourcePath === activePath && item.line >= 1 && item.line <= state.doc.lines)
    .map((item) => ({ item, timing: options.getTiming(item) }));
  const previousUnfinished = options.getPreviousUnfinished();
  if (activePath === options.getTodaySourcePath() && previousUnfinished.length > 0) {
    entries.push({
      from: 0,
      to: 0,
      decoration: Decoration.widget({
        block: true,
        side: -100,
        widget: new DailyPreviousMigrationWidget(previousUnfinished.length, options)
      })
    });
  }
  const selectedLines = new Set<number>();
  for (const selection of state.selection.ranges) {
    selectedLines.add(state.doc.lineAt(selection.anchor).number);
    selectedLines.add(state.doc.lineAt(selection.head).number);
  }
  for (const { item, timing } of items) {
    const taskLine = state.doc.line(item.line);
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
    const trailingId = dailyTaskTrailingIdRange(taskLine.text);
    if (trailingId) {
      const from = taskLine.from + trailingId.from;
      const to = taskLine.from + trailingId.to;
      entries.push({
        from,
        to,
        decoration: Decoration.replace({ inclusive: false })
      });
      atomicEntries.push({ from, to, decoration: Decoration.mark({ class: "towrite-daily-technical-atomic" }) });
    }
    // Do not interrupt the line currently being authored. Existing tasks keep
    // a zero-layout hover affordance on every other line.
    if (!selectedLines.has(item.line)) {
      entries.push({
        from: taskLine.to,
        to: taskLine.to,
        decoration: Decoration.widget({
          side: 10,
          widget: new DailyTaskControlWidget(item, timing, options)
        })
      });
    }
    for (const lineNumber of ownedMetadataLineNumbers(state, item)) {
      const line = state.doc.line(lineNumber);
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
      if (line.to > line.from) {
        atomicEntries.push({
          from: line.from,
          to: line.to,
          decoration: Decoration.mark({ class: "towrite-daily-technical-atomic" })
        });
      }
    }
  }

  for (const projection of options.getLinkedTaskProjections()) {
    if (
      projection.sourcePath !== activePath
      || projection.line < 1
      || projection.line > state.doc.lines
      || projection.tasks.length === 0
    ) continue;
    const line = state.doc.line(projection.line);
    entries.push({
      from: line.to,
      to: line.to,
      decoration: Decoration.widget({
        side: 20,
        widget: new DailyLinkedTaskProjectionWidget(projection, options)
      })
    });
  }

  entries.sort((left, right) => left.from - right.from || left.to - right.to);
  for (const entry of entries) {
    builder.add(entry.from, entry.to, entry.decoration);
  }
  atomicEntries.sort((left, right) => left.from - right.from || left.to - right.to);
  for (const entry of atomicEntries) atomicBuilder.add(entry.from, entry.to, entry.decoration);
  return { decorations: builder.finish(), atomic: atomicBuilder.finish() };
}

class DailyPreviousMigrationWidget extends WidgetType {
  constructor(
    private readonly count: number,
    private readonly options: DailyTaskControlsOptions
  ) {
    super();
  }

  eq(other: DailyPreviousMigrationWidget): boolean {
    return other.count === this.count;
  }

  toDOM(_view: EditorView): HTMLElement {
    const wrapper = createEl("aside");
    wrapper.className = "towrite-daily-previous-migration";
    const text = createSpan();
    text.textContent = `昨日还有 ${this.count} 项未完成`;
    const button = createEl("button");
    button.type = "button";
    button.textContent = "选择迁移";
    button.addEventListener("mousedown", stop);
    button.addEventListener("click", (event) => {
      stop(event);
      void Promise.resolve(this.options.onOpenPreviousMigration())
        .catch((error) => console.error("Opening previous Daily migration failed", error));
    });
    wrapper.append(text, button);
    return wrapper;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class DailyLinkedTaskProjectionWidget extends WidgetType {
  constructor(
    private readonly projection: DailyLinkedTaskProjection,
    private readonly options: DailyTaskControlsOptions
  ) {
    super();
  }

  eq(other: DailyLinkedTaskProjectionWidget): boolean {
    return other.projection.id === this.projection.id
      && other.projection.relationRevision === this.projection.relationRevision
      && other.projection.tasks.map((task) => `${task.taskId}:${task.revision}:${task.status}`).join("|")
        === this.projection.tasks.map((task) => `${task.taskId}:${task.revision}:${task.status}`).join("|");
  }

  toDOM(_view: EditorView): HTMLElement {
    const details = createEl("details");
    details.className = "towrite-daily-linked-task-projection";
    const completed = this.projection.tasks.filter((task) => task.status === "done").length;
    const summary = createEl("summary");
    summary.textContent = `子任务 ${completed}/${this.projection.tasks.length}`;
    summary.title = `显示 ${this.projection.targetTitle} 中的待办`;
    details.append(summary);

    const content = createSpan();
    content.className = "towrite-daily-linked-task-projection-content";
    for (const task of this.projection.tasks) {
      const row = createSpan();
      row.className = "towrite-daily-linked-task-row";
      row.dataset.state = task.status;
      const toggle = createEl("button");
      toggle.type = "button";
      toggle.className = "towrite-daily-linked-task-toggle";
      toggle.textContent = task.status === "done" ? "☑" : task.status === "in-progress" ? "◩" : "☐";
      toggle.setAttribute("aria-label", `${task.status === "done" ? "重新打开" : "完成"}：${task.text}`);
      toggle.addEventListener("mousedown", stop);
      toggle.addEventListener("click", (event) => {
        stop(event);
        toggle.disabled = true;
        void Promise.resolve(this.options.onToggleLinkedTask(this.projection, task))
          .catch((error) => console.error("Linked Daily task toggle failed", error))
          .finally(() => { toggle.disabled = false; });
      });
      const label = createSpan();
      label.className = "towrite-daily-linked-task-label";
      label.textContent = task.text;
      row.append(toggle, label);
      content.append(row);
    }
    const open = createEl("button");
    open.type = "button";
    open.className = "towrite-daily-linked-note-open";
    open.textContent = `打开 ${this.projection.targetTitle}`;
    open.addEventListener("mousedown", stop);
    open.addEventListener("click", (event) => {
      stop(event);
      void Promise.resolve(this.options.onOpenLinkedNote(this.projection))
        .catch((error) => console.error("Linked Daily note open failed", error));
    });
    content.append(open);
    details.append(content);
    return details;
  }

  ignoreEvent(): boolean {
    return true;
  }
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
    const wrapper = createSpan();
    wrapper.className = "towrite-daily-line-controls towrite-daily-task-line-controls";
    wrapper.dataset.state = this.timing.status;
    wrapper.dataset.enriched = hasVisibleProperties(this.item) ? "true" : "false";

    const disclosure = createEl("details");
    disclosure.className = "towrite-note-task-disclosure";
    const disposeDisclosure = installDailyTaskDisclosureDismiss(disclosure);
    const disclosureToggle = createEl("summary");
    disclosureToggle.className = "towrite-note-task-disclosure-toggle";
    const minutes = Math.floor(Math.max(0, this.timing.activeMs) / 60_000);
    disclosureToggle.textContent = this.timing.status === "running" ? `${minutes}m` : "···";
    disclosureToggle.title = "查看任务状态、属性和操作";
    disclosureToggle.setAttribute("aria-label", "展开 ToWrite 今日任务操作");
    disclosure.append(disclosureToggle);
    const details = createSpan();
    details.className = "towrite-note-task-disclosure-content";

    const state = createSpan();
    state.className = "towrite-daily-line-state";
    state.textContent = timingLabel(this.timing);
    details.append(state);

    const summary = summarizeDailyProperties(this.item);
    if (summary) {
      const properties = createEl("button");
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
      details.append(properties);
    } else {
      const properties = actionButton(doc, "属性", () => this.options.onEditProperties(this.item));
      properties.classList.add("towrite-daily-line-properties");
      properties.title = "补充类别、目标、日期或预计时间";
      details.append(properties);
    }

    if (this.item.status !== "done") {
      const toggle = actionButton(doc, toggleLabel(this.timing), () => this.options.onToggle(this.item));
      toggle.classList.add("towrite-daily-line-toggle");
      toggle.textContent = toggleActionLabel(this.timing);
      details.append(toggle);
      const complete = actionButton(doc, "完成", () => this.options.onComplete(this.item));
      complete.title = "完成今日任务";
      details.append(complete);
    }
    disclosure.append(details);
    if (hasNavigableTarget(this.item.targetResolution)) {
      const open = iconActionButton(doc, "↗", "打开关联文档", () => this.options.onOpen(this.item));
      wrapper.append(open);
    }
    wrapper.append(disclosure);
    dailyTaskDisclosureCleanup.set(wrapper, disposeDisclosure);
    return wrapper;
  }

  destroy(dom: HTMLElement): void {
    disposeDailyTaskDisclosure(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function actionButton(
  doc: Document,
  label: string,
  action: () => void | Promise<void>
): HTMLButtonElement {
  const button = createEl("button");
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

function iconActionButton(
  doc: Document,
  label: string,
  title: string,
  action: () => void | Promise<void>
): HTMLButtonElement {
  const button = actionButton(doc, label, action);
  button.classList.add("towrite-daily-inline-open");
  button.title = title;
  button.setAttribute("aria-label", title);
  return button;
}


function hasNavigableTarget(resolution: DailyPlanItem["targetResolution"]): boolean {
  return Boolean(
    resolution?.target
    && resolution.source !== "task-block"
    && resolution.source !== "dashboard"
  );
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
  if (timing.status === "completed") return "已完成";
  const minutes = Math.floor(timing.activeMs / 60_000);
  if (timing.status === "running") return `${minutes}m · 进行中`;
  if (timing.status === "paused") return `${minutes}m · 已暂停`;
  return "未开始";
}

function toggleActionLabel(timing: DailyTaskTimingSnapshot): string {
  if (timing.status === "running") return "暂停";
  if (timing.status === "paused") return "继续";
  return "开始";
}

export function dailyTaskTrailingIdRange(value: string): { from: number; to: number } | undefined {
  const match = /\s+\^daily_[0-9a-f]{32}\s*$/u.exec(value);
  return match ? { from: match.index, to: value.length } : undefined;
}

const dailyTaskDisclosureCleanup = new WeakMap<HTMLElement, () => void>();

function disposeDailyTaskDisclosure(dom: HTMLElement): void {
  dailyTaskDisclosureCleanup.get(dom)?.();
  dailyTaskDisclosureCleanup.delete(dom);
}

function installDailyTaskDisclosureDismiss(disclosure: HTMLDetailsElement): () => void {
  const doc = disclosure.ownerDocument;
  const onDocumentPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (target instanceof Node && disclosure.contains(target)) return;
    disclosure.open = false;
  };
  const onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    disclosure.open = false;
    disclosure.querySelector("summary")?.focus();
  };
  const onToggle = (): void => {
    if (disclosure.open) {
      doc.addEventListener("pointerdown", onDocumentPointerDown, true);
      doc.addEventListener("keydown", onDocumentKeyDown, true);
    } else {
      doc.removeEventListener("pointerdown", onDocumentPointerDown, true);
      doc.removeEventListener("keydown", onDocumentKeyDown, true);
    }
  };
  disclosure.addEventListener("toggle", onToggle);
  return () => {
    disclosure.removeEventListener("toggle", onToggle);
    doc.removeEventListener("pointerdown", onDocumentPointerDown, true);
    doc.removeEventListener("keydown", onDocumentKeyDown, true);
  };
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

function ownedMetadataLineNumbers(state: EditorState, item: DailyPlanItem): number[] {
  const candidates = new Set<number>();
  const endLine = item.endLine ?? item.line;
  for (let line = item.line + 1; line <= Math.min(endLine, state.doc.lines); line += 1) {
    candidates.add(line);
  }
  for (const line of item.detachedOwnedLines ?? []) {
    if (line >= 1 && line <= state.doc.lines) candidates.add(line);
  }
  return [...candidates]
    .filter((line) => isOwnedDailyMetadataLine(state.doc.line(line).text))
    .sort((left, right) => left - right);
}

export function isOwnedDailyMetadataLine(value: string): boolean {
  const line = value.trim().replace(/^%%\s*/u, "").replace(/\s*%%$/u, "").trim();
  if (/^\^daily_[a-f0-9]{32}$/u.test(line)) return true;
  return /^\[towrite-(?:kind|category|task-ref|pool-revision|work-kind|work-ref|work-revision|device|at|scheduled|due|primary|minimum|goal|next|estimate|target|started)::/u.test(line)
    && line.endsWith("]");
}
