<script lang="ts">
  import { Menu } from "obsidian";
  import { onDestroy, tick } from "svelte";
  import {
    ArrowRight,
    AlertTriangle,
    Bell,
    BellOff,
    Brain,
    CalendarClock,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Circle,
    CircleHelp,
    Copy,
    Eye,
    EyeOff,
    ExternalLink,
    FileCheck2,
    FlaskConical,
    Hash,
    Lightbulb,
    ListTodo,
    MessageCircleQuestion,
    MessageSquarePlus,
    PauseCircle,
    Pencil,
    PenLine,
    Pin,
    PinOff,
    Quote,
    RotateCcw,
    Search,
    Sparkles,
    ThumbsUp,
    Trash2
  } from "lucide-svelte";
  import type { OpenQuestion, OpenQuestionKind, OpenQuestionLane } from "../core/types";
  import { stripQuestionRuleSyntax } from "../core/rule-text";
  import type { LinkSuggestion, ToWriteUiApi } from "./api";
  import MarkdownPreview from "./MarkdownPreview.svelte";
  import { compactPath } from "./path";

  type LinkSuggestionItem = LinkSuggestion & { create?: boolean };
  interface WikiLinkToken {
    key: string;
    target: string;
    label: string;
  }

  export let question: OpenQuestion;
  export let api: ToWriteUiApi;
  export let globalCompactEditorDecorations = false;

  const KINDS: OpenQuestionKind[] = ["research", "experiment", "explanation", "citation", "todo", "evidence", "other"];
  const KIND_LABEL_ZH: Record<OpenQuestionKind, string> = {
    research: "查资料",
    experiment: "实验",
    explanation: "解释",
    citation: "引用",
    todo: "待办",
    evidence: "证据",
    other: "其他"
  };
  const STATUS_LABEL_ZH: Record<string, string> = {
    open: "未完成",
    resolved: "已解决",
    blocked: "阻塞",
    paused: "暂停",
    ignored: "已隐藏",
    candidate: "候选"
  };

  let copied = false;
  let aiLoading = false;
  let aiError: string | undefined;
  let pathExpanded = false;
  let titleDraft = "";
  let noteDraft = "";
  let reminderDraft = "";
  let titleQuestionId = "";
  let noteQuestionId = "";
  let reminderQuestionId = "";
  let lastTitle: string | undefined;
  let lastNote: string | undefined;
  let lastReminderAt: string | undefined;
  let collapsed = false;
  let titleEditing = false;
  let noteEditing = false;
  let titleSaveTimer: number | undefined;
  let noteSaveTimer: number | undefined;
  let titleInput: HTMLInputElement | undefined;
  let noteTextarea: HTMLTextAreaElement | undefined;
  let noteEditorRoot: HTMLDivElement | undefined;
  let showLinkSuggestions = false;
  let linkSuggestions: LinkSuggestionItem[] = [];
  let linkQuery = "";
  let linkStart = -1;
  let linkEnd = -1;

  onDestroy(() => {
    clearTitleTimer();
    clearNoteTimer();
  });

  $: heading = question.source.headingPath.at(-1) ?? "Untitled";
  $: language = api.getLanguage();
  $: copy = cardCopy(language);
  $: sourceLine = question.source.page ? `P${question.source.page}` : `L${question.source.lineStart + 1}`;
  $: isMarkdownSource = question.source.file.toLowerCase().endsWith(".md");
  $: isOrphaned = question.anchor?.orphaned;
  $: statusClass = question.status.replace(/[^a-z0-9_-]/giu, "-");
  $: sourcePath = pathExpanded ? question.source.file : compactPath(question.source.file);
  $: originalText = stripQuestionRuleSyntax(question.source.pdfAnchor?.selectedText ?? question.anchorText ?? question.question, question.source.rule);
  $: summaryTitle = stripQuestionRuleSyntax(titleDraft || question.title || originalText, question.source.rule);
  $: displayTitle = stripQuestionRuleSyntax(titleDraft || question.title || "", question.source.rule);
  $: hasDifferentSummarySource = originalText.trim() !== summaryTitle.trim();
  $: showContextSummary = Boolean(question.contextSummary && !question.source.page);
  $: noteLinks = extractWikiLinks(noteDraft);
  $: effectiveCompactEditorDecoration = globalCompactEditorDecorations || Boolean(question.compactEditorDecoration);
  $: reminderDue = isReminderDue(question.reminderAt);
  $: reminderPresets = api.getReminderPresets();
  $: {
    const isNewQuestion = titleQuestionId !== question.id;
    if (isNewQuestion || lastTitle !== question.title) {
      titleDraft = stripQuestionRuleSyntax(question.title ?? "", question.source.rule);
      titleQuestionId = question.id;
      lastTitle = question.title;
      if (isNewQuestion) {
        titleEditing = false;
      }
    }
  }
  $: {
    const isNewQuestion = noteQuestionId !== question.id;
    if (isNewQuestion || lastNote !== question.note) {
      noteDraft = question.note ?? "";
      noteQuestionId = question.id;
      lastNote = question.note;
      if (isNewQuestion) {
        noteEditing = false;
        clearLinkSuggestions();
      }
    }
  }
  $: {
    const isNewQuestion = reminderQuestionId !== question.id;
    if (isNewQuestion || lastReminderAt !== question.reminderAt) {
      reminderDraft = isoToLocalInput(question.reminderAt);
      reminderQuestionId = question.id;
      lastReminderAt = question.reminderAt;
    }
  }

  function laneLabel(lane: OpenQuestionLane) {
    return lane === "write" ? "ToWrite" : "ToThink";
  }

  function laneIcon(lane: OpenQuestionLane) {
    return lane === "write" ? PenLine : Brain;
  }

  function statusLabel(status: OpenQuestion["status"]) {
    const configured = api.getStatusOptions().find((option) => option.id === status)?.label ?? status;
    return language === "zh" ? STATUS_LABEL_ZH[status] ?? configured : configured;
  }

  function statusIcon(status: OpenQuestion["status"]) {
    switch (status) {
      case "resolved":
        return CheckCircle2;
      case "blocked":
        return AlertTriangle;
      case "paused":
        return PauseCircle;
      case "ignored":
        return EyeOff;
      case "candidate":
        return Lightbulb;
      case "open":
        return Circle;
      default:
        return CircleHelp;
    }
  }

  function kindLabel(kind: OpenQuestionKind) {
    return language === "zh" ? KIND_LABEL_ZH[kind] : kind;
  }

  function kindIcon(kind: OpenQuestionKind) {
    switch (kind) {
      case "research":
        return Search;
      case "experiment":
        return FlaskConical;
      case "explanation":
        return MessageCircleQuestion;
      case "citation":
        return Quote;
      case "todo":
        return ListTodo;
      case "evidence":
        return FileCheck2;
      default:
        return CircleHelp;
    }
  }

  async function setStatus(status: OpenQuestion["status"]) {
    await api.updateQuestion(question.id, { status });
  }

  async function togglePinned() {
    await api.updateQuestion(question.id, { pinned: !question.pinned });
  }

  async function toggleQuestionDecorationMode() {
    if (globalCompactEditorDecorations) {
      return;
    }
    await api.updateQuestion(question.id, { compactEditorDecoration: !question.compactEditorDecoration });
  }

  async function saveTitle() {
    clearTitleTimer();
    const nextTitle = stripQuestionRuleSyntax(titleDraft, question.source.rule);
    if (nextTitle === (question.title ?? "")) {
      return;
    }
    await api.updateQuestion(question.id, { title: nextTitle });
    lastTitle = nextTitle || undefined;
  }

  async function saveNote() {
    clearNoteTimer();
    const nextNote = noteDraft.trim();
    if (nextNote === (question.note ?? "")) {
      return;
    }
    await api.updateQuestion(question.id, { note: nextNote });
    lastNote = nextNote || undefined;
  }

  async function updateReminder(value: string) {
    reminderDraft = value;
    const reminderAt = localInputToIso(value);
    await api.updateQuestion(question.id, {
      reminderAt,
      reminderSource: reminderAt ? "manual" : undefined,
      reminderDismissedAt: ""
    });
    lastReminderAt = reminderAt || undefined;
  }

  async function setReminderPreset(rule: string) {
    const date = resolveReminderPreset(rule);
    if (!date) {
      return;
    }
    await updateReminder(dateToLocalInput(date));
  }

  function showReminderPresetMenu(event: MouseEvent) {
    event.preventDefault();
    const menu = new Menu();
    for (const preset of reminderPresets) {
      menu.addItem((item) => {
        item.setTitle(preset.label).onClick(() => {
          void setReminderPreset(preset.value);
        });
      });
    }
    menu.showAtMouseEvent(event);
  }

  async function clearReminder() {
    reminderDraft = "";
    await api.updateQuestion(question.id, {
      reminderAt: "",
      reminderNote: "",
      reminderSource: "manual",
      reminderDismissedAt: ""
    });
    lastReminderAt = undefined;
  }

  function queueTitleSave() {
    clearTitleTimer();
    titleSaveTimer = window.setTimeout(() => {
      titleSaveTimer = undefined;
      void saveTitle();
    }, 700);
  }

  function queueNoteSave() {
    clearNoteTimer();
    noteSaveTimer = window.setTimeout(() => {
      noteSaveTimer = undefined;
      void saveNote();
    }, 900);
  }

  function clearTitleTimer() {
    if (titleSaveTimer !== undefined) {
      window.clearTimeout(titleSaveTimer);
      titleSaveTimer = undefined;
    }
  }

  function clearNoteTimer() {
    if (noteSaveTimer !== undefined) {
      window.clearTimeout(noteSaveTimer);
      noteSaveTimer = undefined;
    }
  }

  function isoToLocalInput(value: string | undefined) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return "";
    }
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }

  function dateToLocalInput(date: Date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }

  function localInputToIso(value: string) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : "";
  }

  function isReminderDue(value: string | undefined) {
    if (!value) {
      return false;
    }
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp <= Date.now();
  }

  function formatReminder(value: string | undefined) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return value;
    }
    return formatFriendlyDateTime(date, language);
  }

  function resolveReminderPreset(rule: string) {
    const now = new Date();
    const value = rule.trim().toLowerCase();
    if (!value) {
      return undefined;
    }

    const relative = value.match(/^\+?\s*(\d+)\s*(m|min|minute|minutes|分钟|h|hr|hour|hours|小时|d|day|days|天)$/u);
    if (relative) {
      const amount = Number(relative[1]);
      const unit = relative[2];
      if (!Number.isFinite(amount) || amount <= 0) {
        return undefined;
      }
      if (unit === "m" || unit === "min" || unit === "minute" || unit === "minutes" || unit === "分钟") {
        return roundedFutureDate(now, amount * 60_000);
      }
      if (unit === "h" || unit === "hr" || unit === "hour" || unit === "hours" || unit === "小时") {
        return roundedFutureDate(now, amount * 60 * 60_000);
      }
      return roundedFutureDate(now, amount * 24 * 60 * 60_000);
    }

    const compactClock = value.match(/^(today|今天|tomorrow|明天|nextweek|next-week|下周)(\d{1,2})(?::?(\d{2}))?$/u);
    const spacedClock = value.match(/^(today|今天|tomorrow|明天|nextweek|next-week|下周)\s+(\d{1,2})(?::(\d{1,2}))?$/u);
    const clock = spacedClock ?? compactClock;
    if (!clock) {
      return undefined;
    }

    const target = clock[1];
    const hour = Number(clock[2]);
    const minute = Number(clock[3] ?? 0);
    if (!isValidClock(hour, minute)) {
      return undefined;
    }
    if (target === "today" || target === "今天") {
      return todayOrTomorrowAt(now, hour, minute);
    }
    if (target === "tomorrow" || target === "明天") {
      return dayOffsetAt(now, 1, hour, minute);
    }
    return dayOffsetAt(now, 7, hour, minute);
  }

  function roundedFutureDate(now: Date, offsetMs: number) {
    const date = new Date(now.getTime() + offsetMs);
    date.setSeconds(0, 0);
    return date;
  }

  function todayOrTomorrowAt(now: Date, hour: number, minute: number) {
    const date = new Date(now);
    date.setHours(hour, minute, 0, 0);
    if (date.getTime() <= now.getTime()) {
      date.setDate(date.getDate() + 1);
    }
    return date;
  }

  function dayOffsetAt(now: Date, days: number, hour: number, minute: number) {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    date.setHours(hour, minute, 0, 0);
    return date;
  }

  function isValidClock(hour: number, minute: number) {
    return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
  }

  function formatFriendlyDateTime(date: Date, currentLanguage: "zh" | "en") {
    const now = new Date();
    const tomorrow = dayOffsetAt(now, 1, 0, 0);
    const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    if (isSameLocalDate(date, now)) {
      return currentLanguage === "zh" ? `今天 ${time}` : `Today ${time}`;
    }
    if (isSameLocalDate(date, tomorrow)) {
      return currentLanguage === "zh" ? `明天 ${time}` : `Tomorrow ${time}`;
    }
    const sameYear = date.getFullYear() === now.getFullYear();
    if (currentLanguage === "zh") {
      return sameYear
        ? `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
        : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
    }
    return date.toLocaleString([], sameYear
      ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
      : { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function isSameLocalDate(left: Date, right: Date) {
    return left.getFullYear() === right.getFullYear()
      && left.getMonth() === right.getMonth()
      && left.getDate() === right.getDate();
  }

  function pad2(value: number) {
    return String(value).padStart(2, "0");
  }

  function handleTitleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      void finishTitleEditing();
    }
  }

  function handleNoteKeydown(event: KeyboardEvent) {
    if (showLinkSuggestions && linkSuggestions.length > 0 && (event.key === "Enter" || event.key === "Tab")) {
      event.preventDefault();
      void insertLinkSuggestion(linkSuggestions[0]);
      return;
    }
    if (event.key === "Escape" && showLinkSuggestions) {
      event.preventDefault();
      clearLinkSuggestions();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void finishNoteEditing();
      (event.currentTarget as HTMLTextAreaElement).blur();
    }
  }

  async function finishNoteEditing() {
    await saveNote();
    clearLinkSuggestions();
    noteEditing = false;
  }

  async function startTitleEditing() {
    titleDraft = stripQuestionRuleSyntax(titleDraft || question.title || "", question.source.rule);
    titleEditing = true;
    await tick();
    titleInput?.focus();
    titleInput?.select();
  }

  async function finishTitleEditing() {
    await saveTitle();
    titleEditing = false;
  }

  async function startNoteEditing() {
    noteEditing = true;
    await tick();
    noteTextarea?.focus();
    updateLinkSuggestions();
  }

  function handleNoteInput() {
    queueNoteSave();
    void tick().then(updateLinkSuggestions);
  }

  function handleReminderInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    void updateReminder(input.value);
  }

  function handleNoteCursorMove() {
    void tick().then(updateLinkSuggestions);
  }

  function handleNoteBlur(event: FocusEvent) {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && noteEditorRoot?.contains(nextTarget)) {
      return;
    }
    void finishNoteEditing();
  }

  function clearLinkSuggestions() {
    showLinkSuggestions = false;
    linkSuggestions = [];
    linkQuery = "";
    linkStart = -1;
    linkEnd = -1;
  }

  function normalizeWikiTarget(value: string) {
    return value.split("|")[0].split("#")[0].trim();
  }

  function currentWikiQuery() {
    const cursor = noteTextarea?.selectionStart ?? noteDraft.length;
    const beforeCursor = noteDraft.slice(0, cursor);
    const openIndex = beforeCursor.lastIndexOf("[[");
    if (openIndex < 0) {
      return undefined;
    }

    const closeIndex = beforeCursor.lastIndexOf("]]");
    if (closeIndex > openIndex) {
      return undefined;
    }

    const fragment = beforeCursor.slice(openIndex + 2);
    if (fragment.includes("\n") || fragment.includes("[")) {
      return undefined;
    }

    return {
      start: openIndex,
      end: cursor,
      query: normalizeWikiTarget(fragment)
    };
  }

  function updateLinkSuggestions() {
    if (!noteEditing) {
      clearLinkSuggestions();
      return;
    }

    const activeQuery = currentWikiQuery();
    if (!activeQuery) {
      clearLinkSuggestions();
      return;
    }

    linkStart = activeQuery.start;
    linkEnd = activeQuery.end;
    linkQuery = activeQuery.query;

    const existing = api.getLinkSuggestions(linkQuery, question.source.file);
    const normalized = linkQuery.toLowerCase();
    const hasExactMatch =
      normalized.length > 0 &&
      existing.some((suggestion) => {
        const pathWithoutExtension = suggestion.path.replace(/\.md$/iu, "");
        return [suggestion.title, suggestion.linktext, pathWithoutExtension].some((value) => value.toLowerCase() === normalized);
      });
    const createSuggestion: LinkSuggestionItem[] =
      normalized.length > 0 && !hasExactMatch
        ? [{ title: linkQuery, path: "", linktext: linkQuery, create: true }]
        : [];

    linkSuggestions = [...existing, ...createSuggestion];
    showLinkSuggestions = true;
  }

  async function insertLinkSuggestion(suggestion: LinkSuggestionItem) {
    const textarea = noteTextarea;
    if (!textarea || linkStart < 0) {
      return;
    }

    const replaceEnd = textarea.selectionStart ?? linkEnd;
    const before = noteDraft.slice(0, linkStart);
    const after = noteDraft.slice(replaceEnd);
    const inserted = `[[${suggestion.linktext}]]`;
    noteDraft = `${before}${inserted}${after}`;
    clearLinkSuggestions();
    queueNoteSave();

    await tick();
    const nextCursor = before.length + inserted.length;
    noteTextarea?.focus();
    noteTextarea?.setSelectionRange(nextCursor, nextCursor);
  }

  function extractWikiLinks(markdown: string): WikiLinkToken[] {
    const links: WikiLinkToken[] = [];
    const pattern = /\[\[([^\]\n]+?)\]\]/gu;
    for (const match of markdown.matchAll(pattern)) {
      const raw = match[1]?.trim();
      if (!raw) {
        continue;
      }
      const [targetPart, aliasPart] = raw.split("|");
      const target = targetPart.trim();
      if (!target) {
        continue;
      }
      links.push({
        key: `${match.index ?? links.length}-${raw}`,
        target,
        label: aliasPart?.trim() || target
      });
    }
    return links;
  }

  async function openWikiLink(target: string) {
    await saveNote();
    await api.openObsidianLink(target, question.source.file);
  }

  function showLaneMenu(event: MouseEvent) {
    event.preventDefault();
    const menu = new Menu();
    const lanes: Array<{ id: OpenQuestionLane; label: string }> = [
      { id: "think", label: laneLabel("think") },
      { id: "write", label: laneLabel("write") }
    ];

    for (const lane of lanes) {
      menu.addItem((item) => {
        item
          .setTitle(lane.label)
          .setChecked(question.lane === lane.id)
          .onClick(() => {
            void api.updateQuestion(question.id, {
              lane: lane.id,
              color: api.getDefaultColor(lane.id),
              kind: lane.id === "write" && question.kind === "other" ? "todo" : question.kind
            });
          });
      });
    }

    menu.showAtMouseEvent(event);
  }

  function showStatusMenu(event: MouseEvent) {
    event.preventDefault();
    const menu = new Menu();
    for (const status of api.getStatusOptions()) {
      menu.addItem((item) => {
        item
          .setTitle(statusLabel(status.id))
          .setChecked(question.status === status.id)
          .onClick(() => {
            void setStatus(status.id);
          });
      });
    }
    menu.showAtMouseEvent(event);
  }

  function showKindMenu(event: MouseEvent) {
    event.preventDefault();
    const menu = new Menu();
    for (const kind of KINDS) {
      menu.addItem((item) => {
        item
          .setTitle(kindLabel(kind))
          .setChecked(question.kind === kind)
          .onClick(() => {
            void api.updateQuestion(question.id, { kind });
          });
      });
    }
    menu.showAtMouseEvent(event);
  }

  async function copyQuestion() {
    const lines = [
      displayTitle ? `${copy.titleLabel}: ${displayTitle}` : "",
      `${copy.originalLabel}: ${originalText}`,
      `Lane: ${question.lane}`,
      `Status: ${question.status}`,
      `Kind: ${question.kind}`,
      question.priority ? `Priority: ${question.priority}` : "",
      question.tags.length > 0 ? `Tags: ${question.tags.map((tag) => `#${tag}`).join(" ")}` : "",
      `Source: ${question.source.file}:${question.source.lineStart + 1}`,
      heading ? `Heading: ${heading}` : "",
      question.contextSummary ? `Context: ${question.contextSummary}` : "",
      question.note ? `${copy.noteLabel}: ${question.note}` : "",
      question.notes?.length
        ? `Notes:\n${question.notes.map((note) => `- ${note.text}`).join("\n")}`
        : "",
      question.ai?.summary ? `AI Summary: ${question.ai.summary}` : "",
      question.ai?.nextAction ? `Next Action: ${question.ai.nextAction}` : "",
      question.ai?.relatedNotes?.length
        ? `Related Notes: ${question.ai.relatedNotes.map((note) => `${note.title} (${note.file})`).join(", ")}`
        : "",
      question.ai?.relatedConcepts?.length ? `Related Concepts: ${question.ai.relatedConcepts.join(", ")}` : ""
    ].filter(Boolean);

    await navigator.clipboard?.writeText(lines.join("\n"));
    copied = true;
    window.setTimeout(() => {
      copied = false;
    }, 1200);
  }

  async function refreshAi() {
    if (aiLoading) {
      return;
    }
    aiLoading = true;
    aiError = undefined;
    try {
      const ai = await api.refreshAi(question.id);
      aiError = ai?.error;
    } catch (error) {
      aiError = error instanceof Error ? error.message : String(error);
    } finally {
      aiLoading = false;
    }
  }

  function cardCopy(currentLanguage: "zh" | "en") {
    if (currentLanguage === "zh") {
      return {
        titleLabel: "标题",
        titlePlaceholder: "填写标题",
        originalLabel: "原文",
        noteLabel: "批注",
        notePlaceholder: "写下你的批注或下一步想法",
        reminderLabel: "提醒",
        reminderDue: "已到期",
        reminderScheduled: "已设置",
        clearReminder: "清除提醒",
        reminderExact: "选择具体时间",
        reminderPreset: "快捷设置",
        titleEdit: "编辑标题",
        editNote: "编辑批注",
        finishNote: "收起批注编辑",
        linkSuggestions: "双链候选",
        linkedReferences: "已识别双链",
        createLinkedNote: "新建笔记",
        noLinkSuggestions: "没有匹配的笔记",
        saveTitle: "保存标题",
        saveNote: "保存批注",
        collapse: "折叠卡片",
        expand: "展开卡片",
        changeLane: "更改类型",
        changeStatus: "更改状态",
        changeKind: "更改分类",
        sourceMoved: "原文可能已经移动或消失",
        jump: "跳转到原文",
        pin: "在侧栏置顶",
        unpin: "取消侧栏置顶",
        pinBlock: "固定原文锚点",
        blockPinned: "原文锚点已固定",
        edit: "完整编辑",
        copied: "已复制",
        copyCard: "复制卡片",
        confirmCandidate: "确认候选",
        resolve: "标记已解决",
        reopen: "重新打开",
        refreshAi: "刷新 AI",
        refreshingAi: "正在刷新 AI",
        answerCapture: "回答并可归档为笔记",
        compactHighlights: "隐藏这条的整行高亮，仅保留左侧竖线",
        fullHighlights: "恢复这条的整行高亮",
        globalCompactActive: "顶部整体隐藏已开启，先用顶部按钮恢复全部",
        delete: "删除"
      };
    }

    return {
      titleLabel: "Title",
      titlePlaceholder: "Add title",
      originalLabel: "Source text",
      noteLabel: "Note",
      notePlaceholder: "Write an annotation or next thought",
      reminderLabel: "Reminder",
      reminderDue: "Due",
      reminderScheduled: "Scheduled",
      clearReminder: "Clear reminder",
      reminderExact: "Pick exact time",
      reminderPreset: "Quick set",
      titleEdit: "Edit title",
      editNote: "Edit note",
      finishNote: "Collapse note editor",
      linkSuggestions: "Link suggestions",
      linkedReferences: "Detected wikilinks",
      createLinkedNote: "Create note",
      noLinkSuggestions: "No matching notes",
      saveTitle: "Save title",
      saveNote: "Save note",
      collapse: "Collapse card",
      expand: "Expand card",
      changeLane: "Change lane",
      changeStatus: "Change status",
      changeKind: "Change kind",
      sourceMoved: "Source text moved or disappeared",
      jump: "Jump",
      pin: "Pin in sidebar",
      unpin: "Unpin in sidebar",
      pinBlock: "Pin source anchor",
      blockPinned: "Source anchor pinned",
      edit: "Full edit",
      copied: "Copied",
      copyCard: "Copy card",
      confirmCandidate: "Confirm candidate",
      resolve: "Resolve",
      reopen: "Reopen",
      refreshAi: "Refresh AI",
      refreshingAi: "Refreshing AI",
      answerCapture: "Answer and optionally archive as a note",
      compactHighlights: "Hide this card's full-row highlight",
      fullHighlights: "Restore this card's full-row highlight",
      globalCompactActive: "Global compact highlights are active; use the top button to restore all",
      delete: "Delete"
    };
  }
</script>

<article class:towrite-card-pinned={question.pinned} class:towrite-card-collapsed={collapsed} class={`towrite-card towrite-card-${statusClass} towrite-card-${question.color} towrite-card-lane-${question.lane}`}>
  <div class="towrite-card-top">
    <div class="towrite-card-head">
      <button type="button" class="towrite-collapse-toggle" title={collapsed ? copy.expand : copy.collapse} on:click={() => (collapsed = !collapsed)}>
        {#if collapsed}
          <ChevronRight size={13} />
        {:else}
          <ChevronDown size={13} />
        {/if}
      </button>
      <button type="button" class={`towrite-chip-button towrite-lane towrite-lane-${question.lane}`} title={copy.changeLane} aria-haspopup="menu" aria-label={`${copy.changeLane}: ${laneLabel(question.lane)}`} on:click={showLaneMenu} on:contextmenu={showLaneMenu}>
        <svelte:component this={laneIcon(question.lane)} size={12} />
        <span>{laneLabel(question.lane)}</span>
      </button>
      <button type="button" class={`towrite-chip-button towrite-status towrite-status-${statusClass}`} title={copy.changeStatus} aria-haspopup="menu" aria-label={`${copy.changeStatus}: ${statusLabel(question.status)}`} on:click={showStatusMenu} on:contextmenu={showStatusMenu}>
        <svelte:component this={statusIcon(question.status)} size={12} />
        <span>{statusLabel(question.status)}</span>
      </button>
      <button type="button" class="towrite-chip-button towrite-kind" title={copy.changeKind} aria-haspopup="menu" aria-label={`${copy.changeKind}: ${kindLabel(question.kind)}`} on:click={showKindMenu} on:contextmenu={showKindMenu}>
        <svelte:component this={kindIcon(question.kind)} size={12} />
        <span>{kindLabel(question.kind)}</span>
      </button>
      {#if question.priority}
        <span class="towrite-priority">{question.priority}</span>
      {/if}
      {#if isOrphaned}
        <span class="towrite-orphan" title={copy.sourceMoved}>
          <AlertTriangle size={12} />
        </span>
      {/if}
    </div>
    <span class="towrite-card-line">{sourceLine}</span>
  </div>

  {#if collapsed}
    <button type="button" class="towrite-card-summary" title={copy.jump} on:click={() => api.jumpToQuestion(question.id)}>
      <strong>{summaryTitle}</strong>
      {#if hasDifferentSummarySource}
        <span class="towrite-card-summary-source">
          <span>{originalText}</span>
          <ExternalLink size={12} />
        </span>
      {:else}
        <span class="towrite-card-summary-source towrite-card-summary-jump">
        <ExternalLink size={12} />
        </span>
      {/if}
    </button>
  {:else}
  <div class="towrite-card-question">
    <div class:towrite-title-editing={titleEditing} class="towrite-inline-title">
      <span>{copy.titleLabel}</span>
      {#if titleEditing}
        <input
          bind:this={titleInput}
          bind:value={titleDraft}
          placeholder={copy.titlePlaceholder}
          aria-label={copy.titleLabel}
          on:input={queueTitleSave}
          on:blur={finishTitleEditing}
          on:keydown={handleTitleKeydown}
        />
      {:else}
        <button
          type="button"
          class:towrite-title-preview-empty={!displayTitle}
          class="towrite-title-preview"
          title={copy.titleEdit}
          on:click={startTitleEditing}
        >
          <span>{displayTitle || copy.titlePlaceholder}</span>
          <Pencil size={12} />
        </button>
      {/if}
    </div>

    <div class="towrite-original-text">
      <span>{copy.originalLabel}</span>
      <button type="button" title={copy.jump} on:click={() => api.jumpToQuestion(question.id)}>
        <span>{originalText}</span>
        <ExternalLink size={12} />
      </button>
    </div>
  </div>

  <div class:towrite-note-editing={noteEditing} class="towrite-inline-note">
    <span>{copy.noteLabel}</span>
    {#if noteEditing}
      <div bind:this={noteEditorRoot} class="towrite-note-editor">
        <textarea
          bind:this={noteTextarea}
          bind:value={noteDraft}
          rows="2"
          placeholder={copy.notePlaceholder}
          aria-label={copy.noteLabel}
          on:input={handleNoteInput}
          on:click={handleNoteCursorMove}
          on:keyup={handleNoteCursorMove}
          on:blur={handleNoteBlur}
          on:keydown={handleNoteKeydown}
        />
        {#if showLinkSuggestions}
          <div class="towrite-note-link-suggestions" role="listbox" aria-label={copy.linkSuggestions}>
            {#if linkSuggestions.length > 0}
              {#each linkSuggestions as suggestion}
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  class:towrite-link-create={suggestion.create}
                  on:mousedown|preventDefault
                  on:click={() => insertLinkSuggestion(suggestion)}
                >
                  <strong>{suggestion.create ? copy.createLinkedNote : suggestion.title}</strong>
                  <span>{suggestion.create ? `[[${suggestion.linktext}]]` : suggestion.path}</span>
                </button>
              {/each}
            {:else}
              <span>{copy.noLinkSuggestions}</span>
            {/if}
          </div>
        {/if}
        {#if noteLinks.length > 0}
          <div class="towrite-note-live-links" aria-label={copy.linkedReferences}>
            {#each noteLinks as link}
              <button
                type="button"
                title={`[[${link.target}]]`}
                on:mousedown|preventDefault
                on:click={() => openWikiLink(link.target)}
              >
                <span>[[{link.label}]]</span>
                <ExternalLink size={10} />
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {:else if question.note}
      <div class="towrite-note-preview-row">
        <div class="towrite-note-preview-content">
          <MarkdownPreview {api} markdown={question.note} sourcePath={question.source.file} />
        </div>
        <button type="button" class="towrite-note-edit-button" title={copy.editNote} on:click={startNoteEditing}>
          <Pencil size={13} />
        </button>
      </div>
    {:else}
      <button
        type="button"
        class:towrite-note-preview-empty={true}
        class="towrite-note-preview"
        title={copy.editNote}
        on:click={startNoteEditing}
      >
        <span>{question.note || copy.notePlaceholder}</span>
        <Pencil size={12} />
      </button>
    {/if}
  </div>

  <div class:towrite-reminder-due={reminderDue} class="towrite-inline-reminder">
    <span>{copy.reminderLabel}</span>
    <div class="towrite-reminder-controls">
      <div class="towrite-reminder-row">
        <label class="towrite-reminder-input" title={copy.reminderExact}>
          <Bell size={13} />
          <input
            type="datetime-local"
            step="60"
            bind:value={reminderDraft}
            aria-label={copy.reminderExact}
            on:change={handleReminderInput}
            on:blur={handleReminderInput}
          />
        </label>
        <button
          type="button"
          class="towrite-reminder-preset-trigger"
          title={copy.reminderPreset}
          aria-label={copy.reminderPreset}
          aria-haspopup="menu"
          on:click={showReminderPresetMenu}
        >
          <CalendarClock size={15} />
        </button>
      </div>
      {#if question.reminderAt}
        <span class="towrite-reminder-status">{reminderDue ? copy.reminderDue : copy.reminderScheduled}: {formatReminder(question.reminderAt)}</span>
        <button type="button" class="towrite-reminder-clear" title={copy.clearReminder} on:click={clearReminder}>
          <BellOff size={13} />
        </button>
      {/if}
    </div>
  </div>

  {#if question.tags.length > 0}
    <div class="towrite-tags">
      {#each question.tags as tag}
        <span>#{tag}</span>
      {/each}
    </div>
  {/if}

  <div class="towrite-card-meta">
    <span>{heading}</span>
    <button
      type="button"
      class:towrite-path-expanded={pathExpanded}
      title={question.source.file}
      on:click={() => (pathExpanded = !pathExpanded)}
    >
      {sourcePath}
    </button>
  </div>

  {#if showContextSummary}
    <p class="towrite-context">{question.contextSummary}</p>
  {/if}

  {#if question.notes?.length}
    <div class="towrite-note-list">
      {#each question.notes as note}
        <div class="towrite-note-item">
          <p>{note.text}</p>
          <small>{note.clientId ?? note.source} - {new Date(note.createdAt).toLocaleString()}</small>
        </div>
      {/each}
    </div>
  {/if}

  {#if question.ai?.summary || question.ai?.nextAction || question.ai?.relatedNotes?.length || question.ai?.relatedConcepts?.length || question.ai?.error || aiError}
    <div class="towrite-ai">
      {#if question.ai?.summary}
        <p class="towrite-ai-summary">{question.ai.summary}</p>
      {/if}
      {#if question.ai?.nextAction}
        <p class="towrite-ai-next"><strong>Next</strong> {question.ai.nextAction}</p>
      {/if}
      {#if question.ai?.relatedNotes?.length}
        <div class="towrite-ai-related">
          <span>Related notes</span>
          {#each question.ai.relatedNotes as note}
            <button type="button" title={note.file} on:click={() => api.openFile(note.file)}>
              <strong>{note.title}</strong>
              {#if note.reason}<em>{note.reason}</em>{/if}
              {#if note.snippet}<small>{note.snippet}</small>{/if}
            </button>
          {/each}
        </div>
      {/if}
      {#if question.ai?.relatedConcepts?.length}
        <div class="towrite-ai-concepts">
          {#each question.ai.relatedConcepts as concept}
            <span>{concept}</span>
          {/each}
        </div>
      {/if}
      {#if question.ai?.error || aiError}
        <p class="towrite-ai-error">{aiError ?? question.ai?.error}</p>
      {/if}
    </div>
  {/if}

  <div class="towrite-card-actions">
    <button type="button" title={copy.jump} on:click={() => api.jumpToQuestion(question.id)}>
      <ArrowRight size={15} />
    </button>
    <button type="button" title={copy.answerCapture} aria-label={copy.answerCapture} aria-haspopup="dialog" on:click={() => api.openCaptureForQuestion(question.id)}>
      <MessageSquarePlus size={15} />
    </button>
    <button type="button" class:towrite-action-active={question.pinned} title={question.pinned ? copy.unpin : copy.pin} on:click={togglePinned}>
      {#if question.pinned}
        <PinOff size={15} />
      {:else}
        <Pin size={15} />
      {/if}
    </button>
    {#if isMarkdownSource}
      <button type="button" title={question.source.blockId ? copy.blockPinned : copy.pinBlock} on:click={() => api.pinQuestionToBlock(question.id)}>
        <Hash size={15} />
      </button>
    {/if}
    <button type="button" title={copy.edit} on:click={() => api.editQuestion(question.id)}>
      <Pencil size={15} />
    </button>
    <button type="button" title={copied ? copy.copied : copy.copyCard} on:click={copyQuestion}>
      {#if copied}
        <Check size={15} />
      {:else}
        <Copy size={15} />
      {/if}
    </button>
    <button
      type="button"
      class:towrite-action-active={effectiveCompactEditorDecoration}
      title={globalCompactEditorDecorations ? copy.globalCompactActive : effectiveCompactEditorDecoration ? copy.fullHighlights : copy.compactHighlights}
      on:click={toggleQuestionDecorationMode}
      disabled={globalCompactEditorDecorations}
    >
      {#if effectiveCompactEditorDecoration}
        <Eye size={15} />
      {:else}
        <EyeOff size={15} />
      {/if}
    </button>
    {#if question.status === "candidate"}
      <button type="button" title={copy.confirmCandidate} on:click={() => setStatus("open")}>
        <ThumbsUp size={15} />
      </button>
    {/if}
    {#if question.status !== "resolved"}
      <button type="button" title={copy.resolve} on:click={() => setStatus("resolved")}>
        <Check size={15} />
      </button>
    {:else}
      <button type="button" title={copy.reopen} on:click={() => setStatus("open")}>
        <RotateCcw size={15} />
      </button>
    {/if}
    <button type="button" class:towrite-ai-loading={aiLoading} title={aiLoading ? copy.refreshingAi : copy.refreshAi} on:click={refreshAi} disabled={aiLoading}>
      <Sparkles size={15} />
    </button>
    <button type="button" title={copy.delete} on:click={() => api.deleteQuestion(question.id)}>
      <Trash2 size={15} />
    </button>
  </div>
  {/if}
</article>
