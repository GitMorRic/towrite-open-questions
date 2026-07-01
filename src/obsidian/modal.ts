import { Modal, Setting, type App } from "obsidian";
import {
  OPEN_QUESTION_COLORS,
  type OpenQuestionColor,
  type OpenQuestionKind,
  type OpenQuestionLane,
  type OpenQuestionPriority,
  type OpenQuestionStatus
} from "../core/types";
import type { ToWriteLanguage } from "../core/settings";

export interface QuestionModalResult {
  title?: string;
  lane: OpenQuestionLane;
  question: string;
  note?: string;
  kind: OpenQuestionKind;
  priority?: OpenQuestionPriority;
  tags: string[];
  color: OpenQuestionColor;
  status: OpenQuestionStatus;
}

interface QuestionModalOptions {
  language?: ToWriteLanguage;
  mode?: "create" | "edit";
}

export class AddQuestionModal extends Modal {
  private title = "";
  private lane: OpenQuestionLane = "think";
  private question = "";
  private note = "";
  private kind: OpenQuestionKind = "todo";
  private priority: OpenQuestionPriority | undefined;
  private tags = "";
  private color: OpenQuestionColor = "amber";
  private status: OpenQuestionStatus = "open";

  constructor(
    app: App,
    private readonly onSubmit: (result: QuestionModalResult) => void,
    initial?: Partial<QuestionModalResult>,
    private readonly options: QuestionModalOptions = {}
  ) {
    super(app);
    this.title = initial?.title ?? "";
    this.lane = initial?.lane ?? "think";
    this.question = initial?.question ?? "";
    this.note = initial?.note ?? "";
    this.kind = initial?.kind ?? "todo";
    this.priority = initial?.priority;
    this.tags = initial?.tags?.join(", ") ?? "";
    this.color = initial?.color ?? "amber";
    this.status = initial?.status ?? "open";
  }

  onOpen(): void {
    const { contentEl } = this;
    const copy = modalCopy(this.options.language ?? "en", this.options.mode ?? "create");
    contentEl.empty();
    contentEl.addClass("towrite-modal");
    contentEl.createEl("h2", { text: copy.title });

    new Setting(contentEl)
      .setName(copy.titleField)
      .addText((text) => {
        text
          .setPlaceholder(copy.titlePlaceholder)
          .setValue(this.title)
          .onChange((value) => {
            this.title = value.trim();
          });
      });

    new Setting(contentEl)
      .setName(copy.questionField)
      .addTextArea((text) => {
        text.setPlaceholder(copy.questionPlaceholder);
        text.setValue(this.question);
        text.inputEl.rows = 4;
        text.onChange((value) => {
          this.question = value.trim();
        });
        text.inputEl.focus();
      });

    new Setting(contentEl)
      .setName(copy.noteField)
      .addTextArea((text) => {
        text.setPlaceholder(copy.notePlaceholder);
        text.setValue(this.note);
        text.inputEl.rows = 3;
        text.onChange((value) => {
          this.note = value.trim();
        });
      });

    new Setting(contentEl)
      .setName(copy.tagsField)
      .addText((text) => {
        text
          .setPlaceholder(copy.tagsPlaceholder)
          .setValue(this.tags)
          .onChange((value) => {
            this.tags = value;
          });
      });

    new Setting(contentEl)
      .setName(copy.laneField)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("think", copy.laneThink)
          .addOption("write", copy.laneWrite)
          .setValue(this.lane)
          .onChange((value) => {
            this.lane = value as OpenQuestionLane;
          });
      });

    new Setting(contentEl)
      .setName(copy.colorField)
      .addDropdown((dropdown) => {
        for (const color of OPEN_QUESTION_COLORS) {
          dropdown.addOption(color, copy.colors[color]);
        }
        dropdown
          .setValue(this.color)
          .onChange((value) => {
            this.color = value as OpenQuestionColor;
          });
      });

    new Setting(contentEl)
      .setName(copy.statusField)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("open", copy.status.open)
          .addOption("candidate", copy.status.candidate)
          .addOption("resolved", copy.status.resolved)
          .addOption("ignored", copy.status.ignored)
          .setValue(this.status)
          .onChange((value) => {
            this.status = value as OpenQuestionStatus;
          });
      });

    new Setting(contentEl)
      .setName(copy.kindField)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("todo", copy.kind.todo)
          .addOption("research", copy.kind.research)
          .addOption("experiment", copy.kind.experiment)
          .addOption("explanation", copy.kind.explanation)
          .addOption("citation", copy.kind.citation)
          .addOption("evidence", copy.kind.evidence)
          .addOption("other", copy.kind.other)
          .setValue(this.kind)
          .onChange((value) => {
            this.kind = value as OpenQuestionKind;
          });
      });

    new Setting(contentEl)
      .setName(copy.priorityField)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("", copy.priorityNone)
          .addOption("P1", "P1")
          .addOption("P2", "P2")
          .addOption("P3", "P3")
          .onChange((value) => {
            this.priority = value ? (value as OpenQuestionPriority) : undefined;
          });
      });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText(copy.submit)
          .setCta()
          .onClick(() => {
            if (!this.question) {
              return;
            }
            this.onSubmit({
              title: this.title || undefined,
              lane: this.lane,
              question: this.question,
              note: this.note || undefined,
              kind: this.kind,
              priority: this.priority,
              tags: this.tags
                .split(/[,\s\uFF0C\u3001\uFF1B]+/u)
                .map((tag) => tag.replace(/^#/u, "").trim())
                .filter(Boolean),
              color: this.color,
              status: this.status
            });
            this.close();
          });
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function modalCopy(language: ToWriteLanguage, mode: "create" | "edit") {
  if (language === "zh") {
    return {
      title: mode === "edit" ? "编辑批注卡片" : "添加批注卡片",
      titleField: "标题",
      titlePlaceholder: "一句话标题",
      questionField: "原文内容",
      questionPlaceholder: "当前选中的原文内容",
      noteField: "批注",
      notePlaceholder: "你的想法、判断、后续要补的内容",
      tagsField: "标签",
      tagsPlaceholder: "证据, pdf",
      laneField: "类型",
      laneThink: "ToThink",
      laneWrite: "ToWrite",
      colorField: "颜色",
      statusField: "状态",
      kindField: "分类",
      priorityField: "优先级",
      priorityNone: "无",
      submit: mode === "edit" ? "保存" : "添加",
      colors: {
        amber: "琥珀",
        mint: "薄荷",
        sky: "天空蓝",
        rose: "玫瑰",
        violet: "紫罗兰",
        slate: "石板灰"
      },
      status: {
        open: "未完成",
        candidate: "候选",
        resolved: "已解决",
        ignored: "已隐藏"
      },
      kind: {
        todo: "待办",
        research: "查资料",
        experiment: "实验",
        explanation: "解释",
        citation: "引用",
        evidence: "证据",
        other: "其他"
      }
    };
  }

  return {
    title: mode === "edit" ? "Edit Annotation Card" : "Add Annotation Card",
    titleField: "Title",
    titlePlaceholder: "Short label",
    questionField: "Source text",
    questionPlaceholder: "Selected source text",
    noteField: "Note",
    notePlaceholder: "Your thought, comment, or follow-up idea",
    tagsField: "Tags",
    tagsPlaceholder: "research, pdf",
    laneField: "Lane",
    laneThink: "ToThink",
    laneWrite: "ToWrite",
    colorField: "Color",
    statusField: "Status",
    kindField: "Kind",
    priorityField: "Priority",
    priorityNone: "None",
    submit: mode === "edit" ? "Save" : "Add",
    colors: {
      amber: "amber",
      mint: "mint",
      sky: "sky",
      rose: "rose",
      violet: "violet",
      slate: "slate"
    },
    status: {
      open: "Open",
      candidate: "Candidate",
      resolved: "Resolved",
      ignored: "Ignored"
    },
    kind: {
      todo: "Todo",
      research: "Research",
      experiment: "Experiment",
      explanation: "Explanation",
      citation: "Citation",
      evidence: "Evidence",
      other: "Other"
    }
  };
}
