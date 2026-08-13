import { Modal, Setting, type App } from "obsidian";
import type {
  DailyPlanEnrichmentPatch,
  DailyPlanItem,
  DailyTaskTimingSnapshot,
  DailyTimerEvent,
  NoteTaskSchedulePatch
} from "../daily";
import {
  initialTaskPropertyDisclosureState,
  noteTaskPropertyPatch,
  noteTaskSchedulePatch,
  propertyPatch,
  type DailyTaskPropertyDraft,
  type NoteTaskScheduleDraft
} from "./daily-task-properties";
import { deriveNoteTaskTiming } from "./note-task-timing";

export type DailyTaskPropertiesModalResult =
  | {
    action: "save";
    patch: DailyPlanEnrichmentPatch;
    schedulePatch?: NoteTaskSchedulePatch;
  }
  | { action: "track-only" };

export type NoteTaskTimingAction = "start" | "pause" | "resume" | "complete";

export interface NoteTaskScheduleModalOptions {
  initial?: {
    plannedStartAt?: string;
    expectedFinishAt?: string;
    deadlineAt?: string;
  };
  timing?: DailyTaskTimingSnapshot;
  getTimingEvents?(): readonly DailyTimerEvent[];
  onTimingAction?(action: NoteTaskTimingAction): Promise<DailyTaskTimingSnapshot>;
}

export interface DailyTaskPropertiesModalOptions {
  taskText: string;
  resolvedTargetLabel: string;
  lineageLabel?: string;
  pending: boolean;
  initial?: Pick<
    DailyPlanItem,
    "category" | "target" | "dueDate" | "dueDateExplicit" | "estimateMinutes" | "nextStep"
  >;
  categorySuggestions?: readonly string[];
  /** Enables the richer lifecycle section used by ordinary tracked tasks. */
  schedule?: NoteTaskScheduleModalOptions;
}

/**
 * A deliberately small progressive form. A quick Markdown checkbox should
 * not turn into a project-management form unless the author asks for it.
 */
export class DailyTaskPropertiesModal extends Modal {
  private submitted = false;
  private draft: DailyTaskPropertyDraft;
  private scheduleDraft: NoteTaskScheduleDraft;
  private timing?: DailyTaskTimingSnapshot;
  private scheduleEl?: HTMLElement;
  private scheduleSummaryEl?: HTMLElement;

  constructor(
    app: App,
    private readonly options: DailyTaskPropertiesModalOptions,
    private readonly onResult: (result: DailyTaskPropertiesModalResult | undefined) => void
  ) {
    super(app);
    this.draft = {
      category: options.initial?.category ?? "",
      target: options.initial?.target ?? "",
      dueDate: options.initial?.dueDateExplicit ? options.initial.dueDate : "",
      estimateMinutes: options.initial?.estimateMinutes?.toString() ?? "",
      nextStep: options.initial?.nextStep ?? ""
    };
    this.scheduleDraft = {
      plannedStartAt: options.schedule?.initial?.plannedStartAt ?? "",
      expectedFinishAt: options.schedule?.initial?.expectedFinishAt ?? "",
      deadlineAt: options.schedule?.initial?.deadlineAt ?? ""
    };
    this.timing = options.schedule?.timing;
  }

  onOpen(): void {
    const { contentEl } = this;
    this.modalEl.addClass("towrite-daily-properties-modal-shell");
    contentEl.empty();
    contentEl.addClass("towrite-daily-properties-modal");

    const header = contentEl.createDiv({ cls: "towrite-daily-properties-header" });
    header.createSpan({ cls: "towrite-daily-properties-kicker", text: "任务属性" });
    header.createEl("h2", { text: this.options.taskText });
    const context = header.createDiv({ cls: "towrite-daily-properties-context" });
    context.createSpan({ text: `打开：${this.options.resolvedTargetLabel}` });
    if (this.options.lineageLabel) context.createSpan({ text: `分类：${this.options.lineageLabel}` });

    const helper = contentEl.createEl("p", {
      cls: "towrite-daily-properties-helper",
      text: "没有必填项。先补最常用的信息；打开目标、下一步和时间安排需要时再展开。"
    });
    helper.id = "towrite-daily-properties-helper";

    const storage = contentEl.createEl("details", { cls: "towrite-task-property-storage" });
    storage.createEl("summary", { text: "这些内容存在哪里？" });
    const storageBody = storage.createDiv();
    storageBody.createEl("p", {
      text: "稳定任务 ID 和可选属性保存在当前 Markdown 任务块中；Live Preview 会隐藏技术 ID 与属性续行，Source mode 仍可检查。"
    });
    storageBody.createEl("p", {
      text: "正文中的笔记链接仍留在正文；只有明确覆盖目标时才写入 towrite-target。统一任务状态保存在配置的 Task Pool Markdown，详细计时进入本地 JSONL 账本。"
    });

    const commonHeading = contentEl.createDiv({ cls: "towrite-daily-properties-section-heading" });
    commonHeading.createEl("strong", { text: "常用属性" });
    commonHeading.createSpan({ text: "类别和预计投入；都可以留空。" });

    const form = contentEl.createDiv({ cls: "towrite-daily-properties-grid" });
    new Setting(form)
      .setName("类别")
      .setDesc("用于 Dashboard 筛选；不填写时仍可使用父分类。")
      .addText((text) => {
        text.setValue(this.draft.category)
          .setPlaceholder(this.options.lineageLabel || "项目 / 写作和发布")
          .onChange((value) => {
            this.draft.category = value;
          });
        const suggestions = [...new Set(this.options.categorySuggestions ?? [])].filter(Boolean);
        if (suggestions.length) {
          const listId = `towrite-daily-category-${Math.random().toString(36).slice(2)}`;
          text.inputEl.setAttr("list", listId);
          const datalist = form.createEl("datalist");
          datalist.id = listId;
          for (const value of suggestions) datalist.createEl("option", { value });
        }
      });

    if (!this.options.schedule) {
      const dueSetting = new Setting(form)
        .setName("截止日期")
        .setDesc("日期属于任务属性，不会塞进待办标题。");
      dueSetting.addText((text) => {
        text.inputEl.type = "date";
        text.setValue(this.draft.dueDate).onChange((value) => {
          this.draft.dueDate = value;
        });
      });
      dueSetting.addExtraButton((button) => button
        .setIcon("calendar-plus")
        .setTooltip("设为今天")
        .onClick(() => {
          this.draft.dueDate = localDate(0);
          this.refreshDateInputs();
        }));
      dueSetting.addExtraButton((button) => button
        .setIcon("calendar-clock")
        .setTooltip("设为明天")
        .onClick(() => {
          this.draft.dueDate = localDate(1);
          this.refreshDateInputs();
        }));
      dueSetting.addExtraButton((button) => button
        .setIcon("x")
        .setTooltip("清除日期")
        .onClick(() => {
          this.draft.dueDate = "";
          this.refreshDateInputs();
        }));
    }

    const estimateSetting = new Setting(form)
      .setName("预计时间")
      .setDesc("只记录预计投入分钟；真实计时仍在独立账本中。");
    estimateSetting.addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "1";
      text.inputEl.max = "1440";
      text.setValue(this.draft.estimateMinutes)
        .setPlaceholder("15")
        .onChange((value) => {
          this.draft.estimateMinutes = value;
        });
    });
    for (const minutes of [15, 30, 60]) {
      estimateSetting.addExtraButton((button) => button
        .setIcon("timer")
        .setTooltip(`${minutes} 分钟`)
        .onClick(() => {
          this.draft.estimateMinutes = minutes.toString();
          this.refreshEstimateInputs();
        }));
    }

    const disclosureState = initialTaskPropertyDisclosureState({
      target: this.draft.target,
      nextStep: this.draft.nextStep,
      plannedStartAt: this.scheduleDraft.plannedStartAt,
      expectedFinishAt: this.scheduleDraft.expectedFinishAt,
      deadlineAt: this.scheduleDraft.deadlineAt,
      timingStatus: this.timing?.status
    });
    const optional = contentEl.createDiv({ cls: "towrite-task-property-sections" });

    const targetSection = createOptionalPropertySection(optional, {
      label: "指定打开目标",
      description: "留空时自动使用任务链接、父分类链接或当前笔记。",
      value: this.draft.target,
      open: disclosureState.targetOpen,
      emptyLabel: "自动解析"
    });
    new Setting(targetSection.body)
      .setName("打开目标")
      .setDesc("仅在需要覆盖自动解析结果时填写。")
      .addText((text) => text
        .setValue(this.draft.target)
        .setPlaceholder("[[笔记#标题]] 或 https://…")
        .onChange((value) => {
          this.draft.target = value;
          targetSection.value.textContent = compactPropertyValue(value, "自动解析");
        }));

    const nextSection = createOptionalPropertySection(optional, {
      label: "补充最小下一步",
      description: "让桌面小窗或墨水屏只提示一个能立即开始的动作。",
      value: this.draft.nextStep,
      open: disclosureState.nextStepOpen,
      emptyLabel: "未设置"
    });
    new Setting(nextSection.body)
      .setName("最小下一步")
      .setDesc("可选；不填写时只显示任务正文。")
      .addTextArea((text) => {
        text.inputEl.rows = 2;
        text.setValue(this.draft.nextStep)
          .setPlaceholder("例如：先列出三个判断指标")
          .onChange((value) => {
            this.draft.nextStep = value;
            nextSection.value.textContent = compactPropertyValue(value, "未设置");
          });
      });

    if (this.options.schedule) {
      const scheduleSection = createOptionalPropertySection(optional, {
        label: "时间与进度",
        description: "计划时间、DDL、开始/暂停/继续和历史记录。",
        value: scheduleDisclosureSummary(this.scheduleDraft, this.timing),
        open: disclosureState.scheduleOpen,
        emptyLabel: "按需设置"
      });
      scheduleSection.details.classList.add("towrite-task-property-schedule-disclosure");
      this.scheduleSummaryEl = scheduleSection.value;
      this.scheduleEl = scheduleSection.body.createDiv({ cls: "towrite-note-task-schedule" });
      this.renderSchedulePanel();
    }

    const actions = contentEl.createDiv({ cls: "towrite-daily-properties-actions" });
    if (this.options.pending) {
      const track = actions.createEl("button", {
        cls: "mod-muted",
        text: "暂不补充",
        attr: { type: "button" }
      });
      track.addEventListener("click", () => this.submit({ action: "track-only" }));
    }
    const cancel = actions.createEl("button", {
      text: "取消",
      attr: { type: "button" }
    });
    cancel.addEventListener("click", () => this.close());
    const save = actions.createEl("button", {
      cls: "mod-cta",
      text: this.options.schedule && this.options.pending ? "保存并自动同步" : "保存属性",
      attr: { type: "button", "aria-describedby": "towrite-daily-properties-helper" }
    });
    save.addEventListener("click", () => {
      try {
        this.submit({
          action: "save",
          patch: this.options.schedule
            ? noteTaskPropertyPatch(this.draft)
            : propertyPatch(this.draft),
          ...(this.options.schedule
            ? { schedulePatch: noteTaskSchedulePatch(this.scheduleDraft) }
            : {})
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.contentEl.querySelector(".towrite-daily-properties-error")?.remove();
        this.contentEl.createEl("p", {
          cls: "towrite-daily-properties-error",
          text: message,
          attr: { role: "alert" }
        });
      }
    });

    window.setTimeout(() => {
      this.contentEl.querySelector<HTMLInputElement>("input")?.focus();
    }, 0);
  }

  onClose(): void {
    this.modalEl.removeClass("towrite-daily-properties-modal-shell");
    this.contentEl.empty();
    if (!this.submitted) this.onResult(undefined);
  }

  private submit(result: DailyTaskPropertiesModalResult): void {
    this.submitted = true;
    this.onResult(result);
    this.close();
  }

  private refreshDateInputs(): void {
    const input = this.contentEl.querySelector<HTMLInputElement>('input[type="date"]');
    if (input) input.value = this.draft.dueDate;
  }

  private refreshEstimateInputs(): void {
    const input = this.contentEl.querySelector<HTMLInputElement>('input[type="number"]');
    if (input) input.value = this.draft.estimateMinutes;
  }

  private renderSchedulePanel(): void {
    const panel = this.scheduleEl;
    if (!panel || !this.options.schedule) return;
    panel.empty();
    this.refreshScheduleSummary();

    const heading = panel.createDiv({ cls: "towrite-note-task-schedule-heading" });
    heading.createEl("small", {
      text: this.timing
        ? `实际投入 ${formatDuration(this.timing.activeMs)}；只有状态切换时才写入账本。`
        : "计划时间写入折叠属性；真实计时只进入本地事件账本。"
    });
    heading.createSpan({
      cls: "towrite-note-task-timing-state",
      text: timingStatusLabel(this.timing)
    });

    if (this.timing && this.options.schedule.onTimingAction) {
      const actions = panel.createDiv({ cls: "towrite-note-task-timing-actions" });
      const status = this.timing.status;
      if (status === "not-started") {
        this.addTimingButton(actions, "开始", "start", true);
      } else if (status === "running") {
        this.addTimingButton(actions, "暂停", "pause");
      } else if (status === "paused") {
        this.addTimingButton(actions, "继续", "resume", true);
      }
      if (status !== "completed") {
        this.addTimingButton(actions, "完成", "complete");
      }
    }

    const plan = panel.createEl("details", { cls: "towrite-note-task-plan-fields" });
    plan.open = Boolean(
      this.scheduleDraft.plannedStartAt
      || this.scheduleDraft.expectedFinishAt
      || this.scheduleDraft.deadlineAt
    );
    plan.createEl("summary", {
      text: `计划时间与 DDL · ${scheduleDisclosureSummary(this.scheduleDraft, undefined) || "未设置"}`
    });
    const fields = plan.createDiv({ cls: "towrite-note-task-schedule-fields" });
    this.addDateTimeSetting(fields, "计划开始", "准备从什么时候开始", "plannedStartAt");
    this.addDateTimeSetting(fields, "预计完成", "预计什么时候完成，不等同于 DDL", "expectedFinishAt");
    this.addDateTimeSetting(fields, "DDL", "真正不能再晚于这个时间", "deadlineAt");

    if (!this.timing) {
      panel.createEl("p", {
        cls: "towrite-note-task-timing-hint",
        text: this.options.pending
          ? "保存并跟踪这条待办后，即可开始、暂停、继续和完成计时。"
          : "计时账本尚未加载。"
      });
      return;
    }

    const derived = deriveNoteTaskTiming(this.timing, {
      plannedStartAt: this.scheduleDraft.plannedStartAt,
      expectedFinishAt: this.scheduleDraft.expectedFinishAt,
      deadlineAt: this.scheduleDraft.deadlineAt
    });
    const stats = panel.createEl("details", { cls: "towrite-note-task-timing-stats" });
    stats.createEl("summary", {
      text: `执行统计 · 实际投入 ${formatDuration(this.timing.activeMs)}`
    });
    const metrics = stats.createDiv({ cls: "towrite-note-task-timing-metrics" });
    metric(metrics, "实际投入", formatDuration(this.timing.activeMs));
    metric(metrics, "总历时", formatDuration(derived.spanMs));
    metric(metrics, "暂停/等待", formatDuration(derived.inactiveMs));
    metric(metrics, "当前滞留", formatDuration(derived.stalledMs));
    metric(metrics, "计划滞后", formatDuration(derived.scheduleDelayMs));
    metric(metrics, "超期", formatDuration(derived.overdueMs));
    metric(metrics, "中断", `${this.timing.interruptionCount} 次`);

    const timingEvents = this.options.schedule.getTimingEvents?.() ?? [];
    if (timingEvents.length > 0) this.renderTimingEvents(panel, timingEvents);
  }

  private addDateTimeSetting(
    parent: HTMLElement,
    label: string,
    description: string,
    key: keyof NoteTaskScheduleDraft
  ): void {
    const setting = new Setting(parent).setName(label).setDesc(description);
    setting.addText((text) => {
      text.inputEl.type = "datetime-local";
      text.setValue(this.scheduleDraft[key]).onChange((value) => {
        this.scheduleDraft[key] = value;
        this.refreshScheduleSummary();
      });
    });
    setting.addExtraButton((button) => button
      .setIcon("clock")
      .setTooltip("使用现在")
      .onClick(() => {
        this.scheduleDraft[key] = localDateTime(new Date());
        this.renderSchedulePanel();
      }));
    setting.addExtraButton((button) => button
      .setIcon("x")
      .setTooltip("清除")
      .onClick(() => {
        this.scheduleDraft[key] = "";
        this.renderSchedulePanel();
      }));
  }

  private renderTimingEvents(parent: HTMLElement, events: readonly DailyTimerEvent[]): void {
    const details = parent.createEl("details", { cls: "towrite-note-task-timing-history" });
    details.createEl("summary", { text: `时间记录 · ${events.length} 条` });
    const list = details.createDiv({ cls: "towrite-note-task-timing-history-list" });
    for (const event of [...events].reverse().slice(0, 12)) {
      const row = list.createDiv({ cls: "towrite-note-task-timing-history-row" });
      row.createSpan({
        cls: `towrite-note-task-timing-event is-${event.kind}`,
        text: timingEventLabel(event)
      });
      row.createEl("time", {
        text: formatEventTime(event.at),
        attr: { datetime: event.at }
      });
      row.createSpan({
        cls: "towrite-note-task-timing-source",
        text: timingSourceLabel(event.source)
      });
    }
  }

  private addTimingButton(
    parent: HTMLElement,
    label: string,
    action: NoteTaskTimingAction,
    primary = false
  ): void {
    const button = parent.createEl("button", {
      text: label,
      cls: primary ? "mod-cta" : undefined,
      attr: { type: "button" }
    });
    button.addEventListener("click", () => {
      void this.runTimingAction(button, action);
    });
  }

  private async runTimingAction(button: HTMLButtonElement, action: NoteTaskTimingAction): Promise<void> {
    if (!this.options.schedule?.onTimingAction) return;
    button.disabled = true;
    try {
      this.timing = await this.options.schedule.onTimingAction(action);
      this.renderSchedulePanel();
    } catch (error) {
      button.disabled = false;
      this.showError(error);
    }
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.contentEl.querySelector(".towrite-daily-properties-error")?.remove();
    this.contentEl.createEl("p", {
      cls: "towrite-daily-properties-error",
      text: message,
      attr: { role: "alert" }
    });
  }

  private refreshScheduleSummary(): void {
    if (!this.scheduleSummaryEl) return;
    this.scheduleSummaryEl.textContent = compactPropertyValue(
      scheduleDisclosureSummary(this.scheduleDraft, this.timing),
      "按需设置"
    );
  }
}

interface OptionalPropertySectionOptions {
  label: string;
  description: string;
  value: string;
  emptyLabel: string;
  open: boolean;
}

function createOptionalPropertySection(
  parent: HTMLElement,
  options: OptionalPropertySectionOptions
): {
  details: HTMLDetailsElement;
  body: HTMLElement;
  value: HTMLElement;
} {
  const details = parent.createEl("details", {
    cls: `towrite-task-property-section ${options.value.trim() ? "has-value" : "is-empty"}`
  });
  details.open = options.open;
  const summary = details.createEl("summary");
  const copy = summary.createDiv();
  copy.createEl("strong", { text: options.label });
  copy.createEl("small", { text: options.description });
  const value = summary.createSpan({
    cls: "towrite-task-property-section-value",
    text: compactPropertyValue(options.value, options.emptyLabel)
  });
  const body = details.createDiv({ cls: "towrite-task-property-section-body" });
  return { details, body, value };
}

function compactPropertyValue(value: string, emptyLabel: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) return emptyLabel;
  return normalized.length > 42 ? `${normalized.slice(0, 39)}…` : normalized;
}

function scheduleDisclosureSummary(
  schedule: NoteTaskScheduleDraft,
  timing: DailyTaskTimingSnapshot | undefined
): string {
  if (timing?.status === "running") return `${formatDuration(timing.activeMs)} · 进行中`;
  if (timing?.status === "paused") return `${formatDuration(timing.activeMs)} · 已暂停`;
  if (timing?.status === "completed") return `${formatDuration(timing.activeMs)} · 已完成`;
  if (schedule.deadlineAt) return `DDL ${formatCompactDateTime(schedule.deadlineAt)}`;
  if (schedule.plannedStartAt) return `计划 ${formatCompactDateTime(schedule.plannedStartAt)}`;
  if (schedule.expectedFinishAt) return `预计 ${formatCompactDateTime(schedule.expectedFinishAt)}`;
  return "";
}

function formatCompactDateTime(value: string): string {
  return value.replace(/^\d{4}-/u, "").replace("T", " ");
}

function localDate(offset: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear().toString().padStart(4, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

function localDateTime(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}T${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function timingStatusLabel(timing: DailyTaskTimingSnapshot | undefined): string {
  if (!timing) return "未计时";
  return {
    "not-started": "未开始",
    running: "进行中",
    paused: "已暂停",
    completed: "已完成"
  }[timing.status];
}

function metric(parent: HTMLElement, label: string, value: string): void {
  const item = parent.createDiv();
  item.createEl("small", { text: label });
  item.createEl("strong", { text: value });
}

function timingEventLabel(event: DailyTimerEvent): string {
  const labels: Record<DailyTimerEvent["kind"], string> = {
    start: "开始",
    pause: event.automatic ? "自动暂停" : "暂停",
    resume: "继续",
    complete: "完成",
    reopen: "重新打开",
    correct: "修正",
    reset: "重置"
  };
  return labels[event.kind];
}

function timingSourceLabel(source: DailyTimerEvent["source"]): string {
  return {
    obsidian: "Obsidian",
    device: "设备",
    nfc: "NFC",
    backend: "Backend"
  }[source];
}

function formatEventTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatDuration(value: number): string {
  const minutes = Math.max(0, Math.floor(value / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} 分钟`;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}
