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
  DailyTaskTimingSnapshot,
  NoteTaskCandidate,
  NoteTaskDocument,
  TaskPoolItem,
  TrackedNoteTask
} from "../daily";

export const refreshNoteTaskControls = StateEffect.define<void>();

export type NoteTaskControlUpdateStrategy = "keep" | "map" | "rebuild";

export function getNoteTaskControlUpdateStrategy(update: {
  docChanged: boolean;
  reconfigured: boolean;
  refreshRequested: boolean;
  selectionChanged?: boolean;
}): NoteTaskControlUpdateStrategy {
  if (update.reconfigured || update.refreshRequested) return "rebuild";
  if (update.docChanged) return "map";
  return update.selectionChanged ? "rebuild" : "keep";
}

export interface NoteTaskControlsOptions {
  isEnabled(): boolean;
  getActiveFilePath(): string | undefined;
  getDocument(): NoteTaskDocument | undefined;
  getTiming(item: TrackedNoteTask): DailyTaskTimingSnapshot;
  getPoolTask(item: TrackedNoteTask): TaskPoolItem | undefined;
  getPoolMatches(candidate: NoteTaskCandidate): readonly TaskPoolItem[];
  onEditProperties(item: TrackedNoteTask): void | Promise<void>;
  onToggleTiming(item: TrackedNoteTask): void | Promise<void>;
  onComplete(item: TrackedNoteTask): void | Promise<void>;
  onAddTrackedToPool(item: TrackedNoteTask): void | Promise<void>;
  onAddToPool(candidate: NoteTaskCandidate): void | Promise<void>;
  onLinkPoolTask(candidate: NoteTaskCandidate, item: TaskPoolItem): void | Promise<void>;
  onEnrich(candidate: NoteTaskCandidate): void | Promise<void>;
  onTrackOnly(candidate: NoteTaskCandidate): void | Promise<void>;
}

/**
 * Renders the already-inspected active-note cache. Document changes only map
 * existing decorations; Markdown parsing and Vault I/O stay off the typing
 * path.
 */
export function createNoteTaskControls(options: NoteTaskControlsOptions): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      atomic: DecorationSet;

      constructor(view: EditorView) {
        const built = buildControls(view, options);
        this.decorations = built.decorations;
        this.atomic = built.atomic;
      }

      update(update: ViewUpdate): void {
        const strategy = getNoteTaskControlUpdateStrategy({
          docChanged: update.docChanged,
          reconfigured: update.transactions.some((transaction) => transaction.reconfigured),
          refreshRequested: update.transactions.some((transaction) =>
            transaction.effects.some((effect) => effect.is(refreshNoteTaskControls))
          ),
          selectionChanged: update.selectionSet
        });
        if (strategy === "rebuild") {
          const built = buildControls(update.view, options);
          this.decorations = built.decorations;
          this.atomic = built.atomic;
        } else if (strategy === "map") {
          this.decorations = this.decorations.map(update.changes);
          this.atomic = this.atomic.map(update.changes);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations }
  );
  return [plugin, EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none)];
}

function buildControls(
  view: EditorView,
  options: NoteTaskControlsOptions
): { decorations: DecorationSet; atomic: DecorationSet } {
  const builder = new RangeSetBuilder<Decoration>();
  const atomicBuilder = new RangeSetBuilder<Decoration>();
  if (!options.isEnabled()) return { decorations: builder.finish(), atomic: atomicBuilder.finish() };
  const activePath = options.getActiveFilePath();
  const document = options.getDocument();
  if (!activePath || !document || document.sourcePath !== activePath) {
    return { decorations: builder.finish(), atomic: atomicBuilder.finish() };
  }

  const entries: Array<{ from: number; to: number; decoration: Decoration }> = [];
  const atomicEntries: Array<{ from: number; to: number; decoration: Decoration }> = [];
  for (const item of document.tasks) {
    if (item.line < 1 || item.line > view.state.doc.lines) continue;
    const line = view.state.doc.line(item.line);
    if (line.text !== item.rawLine) continue;
    const timing = options.getTiming(item);
    const poolTask = options.getPoolTask(item);
    entries.push({
      from: line.from,
      to: line.from,
      decoration: Decoration.line({
        attributes: {
          class: `towrite-daily-task-card-line towrite-note-task-tracked-line towrite-daily-task-state-${timing.status}`,
          "data-towrite-task": item.taskId
        }
      })
    });
    const taskIdRange = trailingTaskIdRange(line.text);
    if (taskIdRange) {
      const from = line.from + taskIdRange.from;
      const to = line.from + taskIdRange.to;
      if (shouldHideTaskIdRange()) {
        entries.push({
          from,
          to,
          decoration: Decoration.replace({
            inclusive: false
          })
        });
        atomicEntries.push({ from, to, decoration: Decoration.mark({ class: "towrite-daily-technical-atomic" }) });
      }
    }
    entries.push({
      from: line.to,
      to: line.to,
      decoration: Decoration.widget({
        side: 12,
        widget: new TrackedNoteTaskWidget(item, timing, poolTask, options)
      })
    });
    for (const lineNumber of item.ownedMetadataLines) {
      if (
        lineNumber < 1
        || lineNumber > view.state.doc.lines
      ) {
        continue;
      }
      const metadataLine = view.state.doc.line(lineNumber);
      if (!isOwnedNoteTaskMetadataLine(metadataLine.text)) continue;
      entries.push({
        from: metadataLine.from,
        to: metadataLine.from,
        decoration: Decoration.line({
          attributes: {
            class: "towrite-daily-owned-metadata-folded",
            "data-towrite-task": item.taskId
          }
        })
      });
      if (metadataLine.to > metadataLine.from) {
        atomicEntries.push({
          from: metadataLine.from,
          to: metadataLine.to,
          decoration: Decoration.mark({ class: "towrite-daily-technical-atomic" })
        });
      }
    }
  }

  for (const candidate of document.candidates) {
    if (candidate.status === "done") continue;
    if (candidate.line < 1 || candidate.line > view.state.doc.lines) continue;
    const line = view.state.doc.line(candidate.line);
    if (line.text !== candidate.before) continue;
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
        side: 13,
        widget: new NoteTaskCandidateWidget(candidate, options.getPoolMatches(candidate), options)
      })
    });
  }

  entries.sort((left, right) => left.from - right.from || left.to - right.to);
  for (const entry of entries) builder.add(entry.from, entry.to, entry.decoration);
  atomicEntries.sort((left, right) => left.from - right.from || left.to - right.to);
  for (const entry of atomicEntries) atomicBuilder.add(entry.from, entry.to, entry.decoration);
  return { decorations: builder.finish(), atomic: atomicBuilder.finish() };
}

class TrackedNoteTaskWidget extends WidgetType {
  constructor(
    private readonly item: TrackedNoteTask,
    private readonly timing: DailyTaskTimingSnapshot,
    private readonly poolTask: TaskPoolItem | undefined,
    private readonly options: NoteTaskControlsOptions
  ) {
    super();
  }

  eq(other: TrackedNoteTaskWidget): boolean {
    return other.item.taskId === this.item.taskId
      && other.item.revision === this.item.revision
      && other.timing.timingRevision === this.timing.timingRevision
      && other.timing.status === this.timing.status
      && timingMinuteBucket(other.timing) === timingMinuteBucket(this.timing)
      && other.poolTask?.revision.value === this.poolTask?.revision.value;
  }

  toDOM(view: EditorView): HTMLElement {
    const doc = view.dom.ownerDocument;
    const wrapper = createSpan();
    wrapper.className = "towrite-daily-line-controls towrite-note-task-line-controls";
    wrapper.dataset.enriched = hasVisibleProperties(this.item) ? "true" : "false";
    wrapper.dataset.state = this.timing.status;

    const disclosure = createEl("details");
    disclosure.className = "towrite-note-task-disclosure";
    const disposeDisclosure = installTaskDisclosureDismiss(disclosure);
    const disclosureToggle = createEl("summary");
    disclosureToggle.className = "towrite-note-task-disclosure-toggle";
    disclosureToggle.textContent = this.timing.status === "running"
      ? `${timingMinuteBucket(this.timing)}m`
      : "···";
    disclosureToggle.title = this.timing.status === "running"
      ? "任务正在计时；点击查看操作"
      : "点击查看任务状态、属性和操作";
    disclosureToggle.setAttribute("aria-label", "展开 ToWrite 任务操作");
    disclosure.append(disclosureToggle);
    const details = createSpan();
    details.className = "towrite-note-task-disclosure-content";

    const timingLabel = noteTimingLabel(this.item, this.timing);
    if (timingLabel) {
      const state = createSpan();
      state.className = "towrite-daily-line-state";
      state.textContent = timingLabel;
      details.append(state);
    }

    if (this.poolTask) {
      const poolLabel = visiblePoolStateLabel(this.poolTask);
      if (poolLabel) {
        const pool = createSpan();
        pool.className = "towrite-note-task-pool-state";
        pool.textContent = poolLabel;
        pool.title = "任务当前的安排状态";
        details.append(pool);
      }
    } else if (this.item.status !== "done") {
      const addToPool = actionButton(
        doc,
        "重试同步",
        () => this.options.onAddTrackedToPool(this.item)
      );
      addToPool.classList.add("towrite-note-task-add-pool");
      addToPool.title = "自动任务池同步尚未完成，点击立即重试";
      details.append(addToPool);
    }

    const properties = actionButton(
      doc,
      "属性",
      () => this.options.onEditProperties(this.item)
    );
    properties.classList.add("towrite-daily-line-properties");
    const propertySummary = summarizeNoteTaskProperties(this.item);
    properties.title = propertySummary
      ? `查看或编辑任务属性：${propertySummary}`
      : "按需补充类别、目标、日期、预计时间或下一步";
    details.append(properties);
    if (this.item.status !== "done" && this.timing.status !== "completed") {
      const toggle = actionButton(
        doc,
        this.timing.status === "running" ? "暂停" : this.timing.status === "paused" ? "继续" : "开始",
        () => this.options.onToggleTiming(this.item)
      );
      toggle.classList.add("towrite-daily-line-toggle");
      details.append(toggle);
      const complete = actionButton(doc, "完成", () => this.options.onComplete(this.item));
      complete.classList.add("towrite-note-task-complete");
      details.append(complete);
    }
    disclosure.append(details);
    wrapper.append(disclosure);
    taskDisclosureCleanup.set(wrapper, disposeDisclosure);
    return wrapper;
  }

  destroy(dom: HTMLElement): void {
    disposeTaskDisclosure(dom);
  }

  ignoreEvent(): boolean {
    return false;
  }
}

export function timingMinuteBucket(timing: Pick<DailyTaskTimingSnapshot, "activeMs">): number {
  return Math.floor(Math.max(0, timing.activeMs) / 60_000);
}

export interface NoteTaskTextRange {
  from: number;
  to: number;
}

/** Exact trailing technical block ID, including the separating whitespace. */
export function trailingTaskIdRange(value: string): NoteTaskTextRange | undefined {
  const match = /\s+\^task_[0-9a-f]{32}\s*$/u.exec(value);
  return match
    ? { from: match.index, to: value.length }
    : undefined;
}

export function shouldHideTaskIdRange(
  _livePreview?: boolean
): boolean {
  return true;
}

class NoteTaskCandidateWidget extends WidgetType {
  constructor(
    private readonly candidate: NoteTaskCandidate,
    private readonly matches: readonly TaskPoolItem[],
    private readonly options: NoteTaskControlsOptions
  ) {
    super();
  }

  eq(other: NoteTaskCandidateWidget): boolean {
    return other.candidate.sourcePath === this.candidate.sourcePath
      && other.candidate.line === this.candidate.line
      && other.candidate.before === this.candidate.before
      && other.candidate.documentRevision === this.candidate.documentRevision
      && poolMatchIdentity(other.matches) === poolMatchIdentity(this.matches);
  }

  toDOM(view: EditorView): HTMLElement {
    const doc = view.dom.ownerDocument;
    const wrapper = createSpan();
    wrapper.className = "towrite-daily-line-controls towrite-note-task-line-controls towrite-note-task-candidate-controls";
    wrapper.setAttribute("role", "group");
    wrapper.setAttribute("aria-label", "ToWrite 自动任务池同步");

    const disclosure = createEl("details");
    disclosure.className = "towrite-note-task-disclosure";
    const disposeDisclosure = installTaskDisclosureDismiss(disclosure);
    const disclosureToggle = createEl("summary");
    disclosureToggle.className = "towrite-note-task-disclosure-toggle";
    disclosureToggle.textContent = "···";
    disclosureToggle.title = "这条待办会自动登记；点击查看同步状态";
    disclosureToggle.setAttribute("aria-label", "展开自动任务池同步状态");
    disclosure.append(disclosureToggle);
    const details = createSpan();
    details.className = "towrite-note-task-disclosure-content";
    const state = createSpan();
    state.className = "towrite-daily-enrichment-state";
    state.textContent = "等待自动同步";
    details.append(state);

    const add = actionButton(doc, "立即重试", () => this.options.onAddToPool(this.candidate));
    add.classList.add("towrite-daily-enrich");
    add.title = "立即重试自动任务池登记";
    details.append(add);

    const enrich = actionButton(doc, "设置属性", () => this.options.onEnrich(this.candidate));
    enrich.classList.add("towrite-daily-enrich");
    enrich.title = "在自动登记前补充类别、目标或日期";
    details.append(enrich);

    if (this.matches.length > 0) {
      const suggestions = createSpan();
      suggestions.className = "towrite-note-task-pool-suggestions";
      suggestions.setAttribute("role", "list");
      const label = createSpan();
      label.className = "towrite-note-task-pool-suggestions-label";
      label.textContent = "任务池中可能已有：";
      suggestions.append(label);
      for (const item of this.matches.slice(0, 3)) {
        const suggestion = actionButton(doc, item.text, () =>
          this.options.onLinkPoolTask(this.candidate, item)
        );
        suggestion.classList.add("towrite-note-task-pool-suggestion");
        suggestion.title = [
          item.category,
          item.project,
          item.target,
          poolStateLabel(item)
        ].filter(Boolean).join(" · ");
        suggestion.setAttribute("role", "listitem");
        suggestions.append(suggestion);
      }
      details.append(suggestions);
    }
    disclosure.append(details);
    wrapper.append(disclosure);
    taskDisclosureCleanup.set(wrapper, disposeDisclosure);
    return wrapper;
  }

  destroy(dom: HTMLElement): void {
    disposeTaskDisclosure(dom);
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
  const button = createEl("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("mousedown", stop);
  button.addEventListener("click", (event) => {
    stop(event);
    button.disabled = true;
    void Promise.resolve(action()).catch((error) => {
      console.error("Ordinary note task action failed", error);
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

export function summarizeNoteTaskProperties(
  item: Pick<
    TrackedNoteTask,
    "category" | "dueDate" | "estimateMinutes" | "target" | "nextStep"
    | "plannedStartAt" | "expectedFinishAt" | "deadlineAt"
  >
): string {
  return [
    item.category,
    item.plannedStartAt ? `计划 ${shortDateTime(item.plannedStartAt)}` : undefined,
    item.expectedFinishAt ? `预计 ${shortDateTime(item.expectedFinishAt)}` : undefined,
    item.deadlineAt ? `DDL ${shortDateTime(item.deadlineAt)}` : item.dueDate,
    item.estimateMinutes ? `${item.estimateMinutes}m` : undefined,
    item.target ? "目标" : undefined,
    item.nextStep ? "下一步" : undefined
  ].filter((value): value is string => Boolean(value)).slice(0, 3).join(" · ");
}

function hasVisibleProperties(
  item: Pick<
    TrackedNoteTask,
    "category" | "dueDate" | "estimateMinutes" | "target" | "nextStep"
    | "plannedStartAt" | "expectedFinishAt" | "deadlineAt"
  >
): boolean {
  return Boolean(
    item.category
    || item.dueDate
    || item.estimateMinutes
    || item.target
    || item.nextStep
    || item.plannedStartAt
    || item.expectedFinishAt
    || item.deadlineAt
  );
}

export function isOwnedNoteTaskMetadataLine(value: string): boolean {
  const line = value.trim();
  return /^\[towrite-(?:category|target|due|estimate|next|planned-start|expected-finish|deadline|pool-ref)::\s*(?:\[\[[^\]]+\]\]|[^\]]*)\]$/u.test(line);
}

export function rankNoteTaskPoolMatches(
  query: string,
  items: readonly TaskPoolItem[],
  limit = 3
): TaskPoolItem[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length < 2) return [];
  return items
    .filter((item) =>
      (item.state === "pool" || item.state === "returned")
      && !item.source
    )
    .map((item) => ({
      item,
      score: taskPoolMatchScore(normalizedQuery, normalizeSearchText([
        item.text,
        item.category,
        item.project,
        item.target
      ].filter(Boolean).join(" ")))
    }))
    .filter((entry) => entry.score >= 0.2)
    .sort((left, right) =>
      right.score - left.score
      || left.item.text.localeCompare(right.item.text, "zh-CN")
      || left.item.taskId.localeCompare(right.item.taskId)
    )
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.item);
}

function taskPoolMatchScore(query: string, candidate: string): number {
  if (!candidate) return 0;
  if (candidate === query) return 1;
  if (candidate.includes(query)) return 0.9;
  if (query.includes(candidate) && candidate.length >= 3) return 0.78;
  const queryPairs = characterPairs(query);
  const candidatePairs = characterPairs(candidate);
  if (queryPairs.size === 0 || candidatePairs.size === 0) return 0;
  let overlap = 0;
  for (const pair of queryPairs) if (candidatePairs.has(pair)) overlap += 1;
  return overlap / Math.max(queryPairs.size, candidatePairs.size);
}

function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase("zh-CN")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/gu, "$1")
    .replace(/\^task_[0-9a-f]{32}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function characterPairs(value: string): Set<string> {
  const characters = [...value];
  const pairs = new Set<string>();
  for (let index = 0; index + 1 < characters.length; index += 1) {
    pairs.add(`${characters[index]}${characters[index + 1]}`);
  }
  return pairs;
}

function poolMatchIdentity(items: readonly TaskPoolItem[]): string {
  return items.map((item) => `${item.taskId}:${item.revision.value}`).join("|");
}

function poolStateLabel(item: TaskPoolItem): string {
  if (item.state === "returned") return "任务池 · 已返回";
  if (item.state === "planned") return `任务池 · ${item.plannedDate ?? "已安排"}`;
  if (item.state === "done") return "任务池 · 已完成";
  if (item.state === "dropped") return "任务池 · 不再追踪";
  return "任务池 · 待安排";
}

function visiblePoolStateLabel(item: TaskPoolItem): string | undefined {
  if (item.state === "returned") return "已退回任务池";
  if (item.state === "planned") return item.plannedDate ? `已安排 · ${item.plannedDate}` : "已安排";
  if (item.state === "dropped") return "不再追踪";
  return undefined;
}

export function noteTimingLabel(
  item: Pick<TrackedNoteTask, "status">,
  timing: Pick<DailyTaskTimingSnapshot, "status" | "activeMs">
): string | undefined {
  if (item.status === "done" || timing.status === "completed") return "已完成";
  const minutes = Math.floor(timing.activeMs / 60_000);
  if (timing.status === "running") return `${minutes}m · 进行中`;
  if (timing.status === "paused") return `${minutes}m · 已暂停`;
  return undefined;
}

const taskDisclosureCleanup = new WeakMap<HTMLElement, () => void>();

function disposeTaskDisclosure(dom: HTMLElement): void {
  taskDisclosureCleanup.get(dom)?.();
  taskDisclosureCleanup.delete(dom);
}

function installTaskDisclosureDismiss(disclosure: HTMLDetailsElement): () => void {
  const doc = disclosure.ownerDocument;
  let listening = false;

  const stopListening = (): void => {
    if (!listening) return;
    listening = false;
    doc.removeEventListener("pointerdown", onDocumentPointerDown, true);
    doc.removeEventListener("keydown", onDocumentKeyDown, true);
  };
  const startListening = (): void => {
    if (listening) return;
    listening = true;
    doc.addEventListener("pointerdown", onDocumentPointerDown, true);
    doc.addEventListener("keydown", onDocumentKeyDown, true);
  };
  const onDocumentPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    const interactionInside = target instanceof Node && disclosure.contains(target);
    if (shouldDismissTaskDisclosure("outside-pointer", interactionInside)) {
      disclosure.open = false;
      stopListening();
    }
  };
  const onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    if (shouldDismissTaskDisclosure("escape", disclosure.contains(event.target as Node))) {
      disclosure.open = false;
      stopListening();
      disclosure.querySelector("summary")?.focus();
    }
  };
  const onToggle = (): void => {
    if (disclosure.open) startListening();
    else stopListening();
  };

  disclosure.addEventListener("toggle", onToggle);
  return () => {
    disclosure.removeEventListener("toggle", onToggle);
    stopListening();
  };
}

export function shouldDismissTaskDisclosure(
  reason: "outside-pointer" | "escape",
  interactionInside: boolean
): boolean {
  return reason === "escape" || !interactionInside;
}

function shortDateTime(value: string): string {
  const match = /^\d{4}-(?<month>\d{2})-(?<day>\d{2})T(?<time>\d{2}:\d{2})$/u.exec(value);
  return match?.groups
    ? `${match.groups.month}-${match.groups.day} ${match.groups.time}`
    : value;
}
