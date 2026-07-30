<script lang="ts">
  import {
    ArrowDown,
    ArrowUp,
    ArchiveRestore,
    BarChart3,
    BookOpen,
    CalendarClock,
    CalendarDays,
    Check,
    ChevronDown,
    Columns3,
    Clock3,
    Circle,
    CirclePlay,
    FileDiff,
    FilePlus2,
    FolderTree,
    History,
    LayoutList,
    ListTodo,
    MoreHorizontal,
    MonitorUp,
    Pause,
    PenLine,
    Play,
    Plus,
    RefreshCw,
    RotateCcw,
    Save,
    Send,
    Settings2,
    Sparkles,
    Table2,
    Tag,
    Target,
    Trash2,
    Undo2
  } from "lucide-svelte";
  import { onDestroy, onMount } from "svelte";
  import { buildDailyDeckSnapshot } from "../hub/daily-cards";
  import type {
    DailyDashboardAdapter,
    DailyDashboardConfiguration,
    DailyDashboardSnapshot,
    DailyDashboardView,
    DailyDevicePolicy,
    DailyPlanHierarchy,
    DailyPlanItemKind,
    DailyPlanItem,
    DailyPlanItemPresentation,
    DailyPlanMetadataPresentation,
    DailyPlanNormalizationPreview,
    DailyPlanningCandidate,
    DailyPlanPriority,
    DailySummaryPresentation,
    DailyTaskTimingSnapshot,
    DailyTimerEvent,
    TaskPoolDocument,
    TaskPoolItem
  } from "./daily-dashboard-types";
  import {
    buildDailyCalendar,
    dailyCategories,
    dailyDateForPlanningDay,
    dailyDueDateForShortcut,
    dailyGroupLabel,
    dailyItemCategory,
    dailyItemDepth,
    dailySnapshotFingerprint,
    filterAvailableTaskPoolItems,
    filterDailyItemsByCategory,
    groupDailyItems,
    isDailySummaryCurrent,
    selectDailyOverview,
    type DailyPlanningDay
  } from "./daily-dashboard-state";

  export let dailyApi: DailyDashboardAdapter | undefined = undefined;
  export let onOpenCapture: (() => void) | undefined = undefined;
  export let initialSurface: "today" | "pool" | "review" = "today";

  let surface: "today" | "pool" | "review" = initialSurface;
  let planningDay: DailyPlanningDay = "today";
  let selectedDate = dailyDateForPlanningDay(planningDay);
  let snapshot: DailyDashboardSnapshot | undefined;
  let metadata: DailyPlanMetadataPresentation = {};
  let candidates: DailyPlanningCandidate[] = [];
  let configuration: DailyDashboardConfiguration = {
    categoryPresets: [],
    defaultView: "list",
    taskPoolPath: "Planning/Task Pool.md",
    autoReturnUnfinished: true
  };
  let configurationLoaded = false;
  let taskPool: TaskPoolDocument | undefined;
  let poolDraftText = "";
  let poolDraftCategory = "";
  let poolDraftDueDate = "";
  let poolDraftEstimate = "";
  let poolDraftTarget = "";
  let poolCategoryFilter = "";
  let poolPickerSearch = "";
  let loading = true;
  let error = "";
  let busy = "";
  let plannerExpanded = false;
  let previewExpanded = false;
  let candidatesExpanded = false;
  let previewItemId = "";
  let previewPage: "overview" | "item" | "result" = "overview";
  let themeDraft = "";
  let draftText = "";
  let draftKind: DailyPlanItemKind = "task";
  let draftPolicy: DailyDevicePolicy = "none";
  let draftSchedule = "";
  let draftDueDate = "";
  let draftCategory = "";
  let draftPriority: DailyPlanPriority = "normal";
  let draftTags = "";
  let draftGoal = "";
  let draftNextStep = "";
  let draftEstimate = "";
  let draftTarget = "";
  let draftPrimary = false;
  let draftMinimum = false;
  let editingItemId = "";
  let editText = "";
  let editGoal = "";
  let editNextStep = "";
  let editEstimate = "";
  let editTarget = "";
  let editPrimary = false;
  let editMinimum = false;
  let editDueDate = "";
  let editCategory = "";
  let editPriority: DailyPlanPriority = "normal";
  let editTags = "";
  let generatedSummary: DailySummaryPresentation | undefined;
  let generatedSummaryFingerprint = "";
  let summary: DailySummaryPresentation | undefined;
  let hierarchy: DailyPlanHierarchy | undefined;
  let normalizationPreview: DailyPlanNormalizationPreview | undefined;
  let normalizationUndoToken = "";
  let timingByItem: Record<string, DailyTaskTimingSnapshot> = {};
  let timerEventsByItem: Record<string, DailyTimerEvent[]> = {};
  let collapsedGroups = new Set<string>();
  let dashboardView: DailyDashboardView = "list";
  let selectedCategory = "";
  let correctionEventByItem: Record<string, string> = {};
  let correctionTimeByItem: Record<string, string> = {};
  let correctionReasonByItem: Record<string, string> = {};
  let unsubscribe: (() => void) | undefined;
  let refreshSequence = 0;

  onMount(() => {
    unsubscribe = dailyApi?.subscribe?.(() => {
      void refresh();
    });
    void refresh();
  });
  onDestroy(() => unsubscribe?.());

  $: selectedDate = dailyDateForPlanningDay(planningDay);
  $: items = (snapshot?.plan.items ?? []) as DailyPlanItemPresentation[];
  $: overview = selectDailyOverview(items);
  $: todoItems = items.filter((item) => item.status === "todo");
  $: inProgressItems = items.filter((item) => item.status === "in-progress");
  $: doneItems = items.filter((item) => item.status === "done");
  $: categories = dailyCategories(items);
  $: categoryChoices = [...new Set([
    ...configuration.categoryPresets.map((preset) => preset.label),
    ...categories,
    ...(taskPool?.items.map((item) => item.category).filter((value): value is string => Boolean(value)) ?? [])
  ])];
  $: poolItems = taskPool?.items ?? [];
  $: availablePoolItems = filterAvailableTaskPoolItems(poolItems);
  $: visiblePoolPickerItems = filterAvailableTaskPoolItems(poolItems, poolPickerSearch);
  $: otherCandidates = candidates.filter((candidate) => candidate.source !== "pool");
  $: filteredPoolItems = poolItems.filter((item) =>
    !poolCategoryFilter || item.category === poolCategoryFilter
  );
  $: filteredItems = filterDailyItemsByCategory(items, selectedCategory);
  $: groupedItems = groupDailyItems(filteredItems, hierarchy, items);
  $: unnormalizedTaskCount = hierarchy?.tasks.filter((task) => task.normalizationRequired).length ?? 0;
  $: boardColumns = [
    { status: "todo" as const, label: "待办", items: filteredItems.filter((item) => item.status === "todo") },
    { status: "in-progress" as const, label: "进行中", items: filteredItems.filter((item) => item.status === "in-progress") },
    { status: "done" as const, label: "已完成", items: filteredItems.filter((item) => item.status === "done") }
  ];
  $: calendarEntries = buildDailyCalendar(filteredItems, selectedDate);
  $: previewItem = items.find((item) => item.id === previewItemId)
    ?? overview.current
    ?? doneItems[0];
  $: deck = snapshot
    ? buildDailyDeckSnapshot({
        date: selectedDate,
        theme: metadata.theme,
        items: items.map((item) => ({
          id: item.id,
          text: item.text,
          kind: item.kind,
          status: item.status,
          taskRevision: item.revision.value,
          primary: Boolean(item.primary),
          minimum: Boolean(item.minimum),
          goal: item.goal,
          nextStep: item.nextStep,
          estimateMinutes: item.estimateMinutes,
          target: item.target,
          startedAt: item.startedAt,
           groupLabel: dailyGroupLabel(item.lineage?.groups.at(-1)),
          targetLabel: item.targetResolution?.displayLabel,
          targetProvenance: item.targetResolution?.source,
          lineageRevision: item.lineageRevision,
          timing: timingForDeck(timingByItem[item.id])
        }))
      })
    : undefined;
  $: previewTaskCard = deck?.planItems.find((card) => card.item.id === previewItem?.id)
    ?? deck?.planItems[0];
  $: summary = generatedSummary
    ?? (snapshot?.summary ? { ...snapshot.summary, source: "rules" } : undefined);

  async function switchDay(day: DailyPlanningDay): Promise<void> {
    if (planningDay === day) return;
    planningDay = day;
    previewItemId = "";
    previewPage = "overview";
    editingItemId = "";
    clearGeneratedSummary();
    await refresh(dailyDateForPlanningDay(day));
  }

  async function refresh(dateOverride?: string): Promise<void> {
    const sequence = ++refreshSequence;
    const date = dateOverride ?? selectedDate;
    if (!dailyApi) {
      loading = false;
      snapshot = undefined;
      metadata = {};
      candidates = [];
      taskPool = undefined;
      hierarchy = undefined;
      timingByItem = {};
      timerEventsByItem = {};
      clearGeneratedSummary();
      return;
    }
    loading = true;
    error = "";
    try {
      const [nextSnapshot, nextMetadata, nextCandidates, nextHierarchy, nextConfiguration, nextTaskPool] = await Promise.all([
        dailyApi.getSnapshot(date),
        dailyApi.getPlanMetadata?.(date) ?? Promise.resolve({}),
        candidatesExpanded
          ? dailyApi.listPlanningCandidates?.(date) ?? Promise.resolve([])
          : Promise.resolve(candidates),
        dailyApi.getPlanHierarchy?.(date) ?? Promise.resolve(undefined),
        dailyApi.getConfiguration?.() ?? Promise.resolve(configuration),
        dailyApi.getTaskPool?.() ?? Promise.resolve(undefined)
      ]);
      const nextTimingEntries = nextSnapshot && dailyApi.getItemTiming
        ? await Promise.all(nextSnapshot.plan.items.map(async (item) => [
            item.id,
            await dailyApi?.getItemTiming?.(item.id, item.estimateMinutes)
          ] as const))
        : [];
      if (sequence !== refreshSequence) return;
      if (
        generatedSummary
        && (
          !nextSnapshot
          || !isDailySummaryCurrent(
            generatedSummary,
            generatedSummaryFingerprint,
            nextSnapshot
          )
        )
      ) {
        clearGeneratedSummary();
      }
      snapshot = nextSnapshot;
      metadata = nextMetadata;
      candidates = nextCandidates;
      hierarchy = nextHierarchy;
      configuration = nextConfiguration;
      taskPool = nextTaskPool;
      if (!configurationLoaded) {
        dashboardView = nextConfiguration.defaultView;
        configurationLoaded = true;
      }
      timingByItem = Object.fromEntries(
        nextTimingEntries.filter((entry): entry is readonly [string, DailyTaskTimingSnapshot] => Boolean(entry[1]))
      );
      timerEventsByItem = Object.fromEntries(
        Object.entries(timerEventsByItem).filter(([itemId]) =>
          nextSnapshot?.plan.items.some((item) => item.id === itemId)
        )
      );
      themeDraft = metadata.theme ?? "";
      if (previewItemId && !snapshot?.plan.items.some((item) => item.id === previewItemId)) {
        previewItemId = "";
      }
    } catch (cause) {
      if (sequence !== refreshSequence) return;
      error = messageForError(cause);
    } finally {
      if (sequence === refreshSequence) loading = false;
    }
  }

  async function run(
    id: string,
    action: () => void | Promise<void>,
    refreshDate?: string
  ): Promise<void> {
    if (busy) return;
    busy = id;
    error = "";
    try {
      await action();
      await refresh(refreshDate);
    } catch (cause) {
      error = messageForError(cause);
    } finally {
      busy = "";
    }
  }

  async function saveTheme(): Promise<void> {
    if (!dailyApi?.updatePlanMetadata) return;
    await run("theme", () => dailyApi?.updatePlanMetadata?.(
      selectedDate,
      metadata.revision,
      {
        theme: themeDraft.trim() || null,
        primaryId: metadata.primaryId,
        minimumId: metadata.minimumId
      }
    ));
  }

  function directChildTasks(item: DailyPlanItemPresentation): DailyPlanItemPresentation[] {
    return items.filter((candidate) => candidate.parentTaskId === item.id);
  }

  async function toggleDailyCompletion(item: DailyPlanItemPresentation): Promise<void> {
    if (item.status === "done") {
      await run(`reopen:${item.id}`, () => dailyApi?.reopenItem?.(item.id, item.revision));
      return;
    }
    const unfinishedChildren = directChildTasks(item).filter((child) => child.status !== "done");
    if (
      unfinishedChildren.length > 0
      && !window.confirm(`还有 ${unfinishedChildren.length} 个直接子任务未完成。仍要完成父任务吗？`)
    ) {
      return;
    }
    await run(`complete:${item.id}`, () => dailyApi?.completeItem?.(item.id, item.revision));
  }

  async function createItem(): Promise<void> {
    const text = draftText.trim();
    if (!text || !dailyApi?.createItem) return;
    await run("create", async () => {
      await dailyApi?.createItem?.({
        date: selectedDate,
        text,
        kind: draftKind,
        devicePolicy: draftPolicy,
        scheduledFor: draftPolicy === "scheduled" && draftSchedule
          ? new Date(draftSchedule).toISOString()
          : undefined,
        dueDate: draftDueDate || undefined,
        category: draftCategory.trim() || undefined,
        priority: draftPriority,
        tags: parseTags(draftTags),
        goal: draftGoal.trim() || undefined,
        nextStep: draftNextStep.trim() || undefined,
        estimateMinutes: positiveNumber(draftEstimate),
        target: draftTarget.trim() || undefined,
        primary: draftPrimary,
        minimum: draftMinimum
      });
      resetDraft();
    });
  }

  function resetDraft(): void {
    draftText = "";
    draftGoal = "";
    draftNextStep = "";
    draftEstimate = "";
    draftTarget = "";
    draftDueDate = "";
    draftCategory = "";
    draftPriority = "normal";
    draftTags = "";
    draftPrimary = false;
    draftMinimum = false;
    if (draftPolicy !== "scheduled") draftSchedule = "";
  }

  async function createPoolTask(): Promise<void> {
    const text = poolDraftText.trim();
    if (!text || !dailyApi?.createPoolTask) return;
    await run("pool:create", async () => {
      await dailyApi?.createPoolTask?.({
        text,
        category: poolDraftCategory.trim() || undefined,
        target: poolDraftTarget.trim() || undefined,
        dueDate: poolDraftDueDate || undefined,
        estimateMinutes: positiveNumber(poolDraftEstimate)
      });
      poolDraftText = "";
      poolDraftCategory = "";
      poolDraftTarget = "";
      poolDraftDueDate = "";
      poolDraftEstimate = "";
    });
  }

  async function assignPoolTask(item: TaskPoolItem, day: DailyPlanningDay): Promise<void> {
    if (!dailyApi?.assignPoolTask) return;
    const date = dailyDateForPlanningDay(day);
    surface = "today";
    planningDay = day;
    await run(
      `pool:assign:${item.taskId}`,
      () => dailyApi?.assignPoolTask?.(item.taskId, item.revision, date),
      date
    );
  }

  function poolStateLabel(item: TaskPoolItem): string {
    return {
      pool: "任务池",
      planned: item.plannedDate ? `已安排 ${item.plannedDate}` : "已安排",
      returned: item.returnedDate ? `已回池 ${item.returnedDate}` : "已回池",
      dropped: "不再追踪",
      done: "已完成"
    }[item.state];
  }

  function beginEdit(item: DailyPlanItem): void {
    editingItemId = item.id;
    editText = item.text;
    editGoal = item.goal ?? "";
    editNextStep = item.nextStep ?? "";
    editEstimate = item.estimateMinutes ? String(item.estimateMinutes) : "";
    editTarget = item.target ?? "";
    editPrimary = Boolean(item.primary);
    editMinimum = Boolean(item.minimum);
    editDueDate = item.dueDateExplicit === false ? "" : (item.dueDate ?? "");
    editCategory = item.category ?? dailyItemCategory(item);
    editPriority = item.priority ?? "normal";
    editTags = item.tags.join(", ");
  }

  async function saveItem(item: DailyPlanItem): Promise<void> {
    if (!dailyApi?.updateItem || !editText.trim()) return;
    await run(`edit:${item.id}`, async () => {
      await dailyApi?.updateItem?.(item.id, item.revision, {
        text: editText.trim(),
        goal: editGoal.trim() || null,
        nextStep: editNextStep.trim() || null,
        estimateMinutes: positiveNumber(editEstimate) ?? null,
        target: editTarget.trim() || null,
        dueDate: editDueDate || null,
        category: editCategory.trim() || null,
        priority: editPriority,
        tags: parseTags(editTags),
        primary: editPrimary,
        minimum: editMinimum
      });
      editingItemId = "";
    });
  }

  async function updatePolicy(item: DailyPlanItem, policy: DailyDevicePolicy): Promise<void> {
    if (!dailyApi?.updateItem) return;
    await run(`policy:${item.id}`, () => dailyApi?.updateItem?.(item.id, item.revision, {
      devicePolicy: policy,
      scheduledFor: policy === "scheduled" ? item.scheduledFor : null
    }));
  }

  async function startOverviewItem(): Promise<void> {
    const item = overview.current;
    if (!item || !dailyApi?.startItem) return;
    await run(`start:${item.id}`, () => dailyApi?.startItem?.(item.id, item.revision));
  }

  function updatePolicyFromEvent(item: DailyPlanItem, event: Event): void {
    const policy = (event.currentTarget as HTMLSelectElement).value as DailyDevicePolicy;
    void updatePolicy(item, policy);
  }

  async function toggleCandidates(): Promise<void> {
    candidatesExpanded = !candidatesExpanded;
    if (candidatesExpanded) await refresh();
  }

  async function addCandidate(candidate: DailyPlanningCandidate): Promise<void> {
    if (!dailyApi?.addPlanningCandidate) return;
    await run(`candidate:${candidate.id}`, () => dailyApi?.addPlanningCandidate?.(
      selectedDate,
      candidate
    ));
  }

  async function previewNormalizationForPlan(): Promise<void> {
    if (!dailyApi?.getNormalizationPreview || busy) return;
    busy = "normalization-preview";
    error = "";
    try {
      normalizationPreview = await dailyApi.getNormalizationPreview(selectedDate);
      normalizationUndoToken = "";
    } catch (cause) {
      error = messageForError(cause);
    } finally {
      busy = "";
    }
  }

  async function applyNormalization(): Promise<void> {
    const preview = normalizationPreview;
    if (!preview || !dailyApi?.normalizePlan) return;
    await run("normalize", async () => {
      const result = await dailyApi?.normalizePlan?.(preview);
      normalizationUndoToken = result?.undoToken ?? "";
      normalizationPreview = undefined;
    });
  }

  async function undoNormalization(): Promise<void> {
    const token = normalizationUndoToken;
    if (!token || !dailyApi?.undoNormalization) return;
    await run("undo-normalization", async () => {
      await dailyApi?.undoNormalization?.(token);
      normalizationUndoToken = "";
    });
  }

  async function transitionTimer(
    item: DailyPlanItem,
    action: "start" | "pause" | "resume" | "complete"
  ): Promise<void> {
    const timing = timingByItem[item.id];
    if (action === "start" && dailyApi?.startItem) {
      await run(`start:${item.id}`, () => dailyApi?.startItem?.(item.id, item.revision));
      return;
    }
    if (action === "pause" && dailyApi?.pauseItem) {
      await run(`pause:${item.id}`, () => dailyApi?.pauseItem?.(
        item.id,
        item.revision,
        timing?.timingRevision
      ));
      return;
    }
    if (action === "resume" && dailyApi?.resumeItem) {
      await run(`resume:${item.id}`, () => dailyApi?.resumeItem?.(
        item.id,
        item.revision,
        timing?.timingRevision
      ));
      return;
    }
    if (action === "complete" && dailyApi?.completeItem) {
      await run(`complete:${item.id}`, () => dailyApi?.completeItem?.(item.id, item.revision));
    }
  }

  async function correctTiming(item: DailyPlanItem): Promise<void> {
    if (!dailyApi?.correctItemTiming) return;
    const targetEventId = correctionEventByItem[item.id]
      || recentTimerEvents(item.id)[0]?.eventId
      || "";
    const localDateTime = correctionTimeByItem[item.id] ?? "";
    const replacementAt = localDateTime ? new Date(localDateTime).toISOString() : "";
    const reason = correctionReasonByItem[item.id]?.trim() || "用户在今日 Dashboard 中修正";
    if (!targetEventId || !replacementAt) {
      error = "请选择要修正的时间事件，并填写新的日期时间。";
      return;
    }
    await run(`correct-timing:${item.id}`, () => dailyApi?.correctItemTiming?.(item.id, {
      targetEventId,
      replacementAt,
      reason,
      expectedTimingRevision: timingByItem[item.id]?.timingRevision ?? ""
    }));
  }

  function toggleGroup(groupKey: string): void {
    const next = new Set(collapsedGroups);
    if (next.has(groupKey)) next.delete(groupKey);
    else next.add(groupKey);
    collapsedGroups = next;
  }

  function recentTimerEvents(itemId: string): DailyTimerEvent[] {
    return [...(timerEventsByItem[itemId] ?? [])].slice(-5).reverse();
  }

  async function loadTimerEvents(itemId: string, event: Event): Promise<void> {
    if (!(event.currentTarget as HTMLDetailsElement).open) return;
    if (!dailyApi?.listItemTimerEvents || Object.hasOwn(timerEventsByItem, itemId)) return;
    try {
      timerEventsByItem = {
        ...timerEventsByItem,
        [itemId]: await dailyApi.listItemTimerEvents(itemId)
      };
    } catch (cause) {
      error = messageForError(cause);
    }
  }

  function setCorrectionEvent(itemId: string, event: Event): void {
    correctionEventByItem = {
      ...correctionEventByItem,
      [itemId]: (event.currentTarget as HTMLSelectElement).value
    };
  }

  function setCorrectionTime(itemId: string, event: Event): void {
    correctionTimeByItem = {
      ...correctionTimeByItem,
      [itemId]: (event.currentTarget as HTMLInputElement).value
    };
  }

  function setCorrectionReason(itemId: string, event: Event): void {
    correctionReasonByItem = {
      ...correctionReasonByItem,
      [itemId]: (event.currentTarget as HTMLInputElement).value
    };
  }

  async function generateSummary(mode: "rules" | "ai"): Promise<void> {
    if (!dailyApi?.generateSummary) return;
    await run(`summary:${mode}`, async () => {
      const before = await dailyApi?.getSnapshot(selectedDate);
      if (!before) throw new Error("今日快照暂不可用，请刷新后重试。");
      const basisFingerprint = dailySnapshotFingerprint(before);
      const generated = await dailyApi?.generateSummary?.(mode);
      if (!generated) throw new Error("未能生成今日总结。");
      const after = await dailyApi?.getSnapshot(selectedDate);
      if (
        !after
        || basisFingerprint !== dailySnapshotFingerprint(after)
        || !isDailySummaryCurrent(generated, basisFingerprint, after)
      ) {
        clearGeneratedSummary();
        snapshot = after;
        throw new Error("今日数据在生成总结时发生了变化，请重新生成。");
      }
      snapshot = after;
      generatedSummary = generated;
      generatedSummaryFingerprint = basisFingerprint;
    });
  }

  async function writeCurrentSummary(): Promise<void> {
    if (!dailyApi?.writeSummary) return;
    const latest = await dailyApi.getSnapshot(selectedDate);
    if (!latest) throw new Error("今日快照暂不可用，请刷新后重试。");
    snapshot = latest;
    const candidate = generatedSummary ?? {
      ...latest.summary,
      source: "rules" as const
    };
    const basisFingerprint = generatedSummary
      ? generatedSummaryFingerprint
      : dailySnapshotFingerprint(latest);
    if (!isDailySummaryCurrent(candidate, basisFingerprint, latest)) {
      clearGeneratedSummary();
      throw new Error("今日数据已变化，旧总结没有写回；请确认新摘要后重试。");
    }
    await dailyApi.writeSummary(candidate);
  }

  function clearGeneratedSummary(): void {
    generatedSummary = undefined;
    generatedSummaryFingerprint = "";
  }

  function kindLabel(kind: DailyPlanItemKind): string {
    return {
      task: "任务",
      create_note: "新建笔记",
      edit_note: "修改笔记",
      send_card: "发送内容"
    }[kind];
  }

  function candidateSourceLabel(source: DailyPlanningCandidate["source"]): string {
    return {
      pool: "任务池",
      tothink: "ToThink",
      towrite: "ToWrite",
      inbox: "Inbox",
      stale: "旧笔记",
      echo: "Echo",
      note: "笔记"
    }[source];
  }

  function policyLabel(policy: DailyDevicePolicy | undefined): string {
    return {
      none: "不发送",
      manual: "手动发送",
      scheduled: "一次定时",
      rotation: "加入轮播",
      agent: "Agent 选择"
    }[policy ?? "none"];
  }

  function setDraftDueDate(shortcut: "today" | "tomorrow" | "friday" | "next-week" | "clear"): void {
    draftDueDate = dailyDueDateForShortcut(shortcut);
  }

  function setEditDueDate(shortcut: "today" | "tomorrow" | "friday" | "next-week" | "clear"): void {
    editDueDate = dailyDueDateForShortcut(shortcut);
  }

  function parseTags(value: string): string[] {
    return [...new Set(value
      .split(/[\s,，]+/u)
      .map((tag) => tag.trim().replace(/^#/u, ""))
      .filter(Boolean))];
  }

  function priorityLabel(priority: DailyPlanPriority | undefined): string {
    return {
      highest: "最高",
      high: "高",
      normal: "普通",
      low: "低",
      lowest: "最低"
    }[priority ?? "normal"];
  }

  function formatCalendarDate(value: string): string {
    const timestamp = Date.parse(`${value}T12:00:00`);
    if (!Number.isFinite(timestamp)) return value;
    return new Intl.DateTimeFormat("zh-CN", {
      month: "long",
      day: "numeric",
      weekday: "short"
    }).format(new Date(timestamp));
  }

  function targetSourceLabel(item: DailyPlanItem): string {
    return {
      explicit: "显式设置",
      "task-link": "任务链接",
      "ancestor-link": "父分类继承",
      "task-block": "任务原文",
      dashboard: "今日 Dashboard"
    }[item.targetResolution?.source ?? "dashboard"];
  }

  function targetDisplayLabel(item: DailyPlanItem): string {
    return item.targetResolution?.displayLabel
      || item.target
      || item.linkedNotes[0]
      || `${item.sourcePath}#^${item.blockId}`;
  }

  function timingStatusLabel(timing: DailyTaskTimingSnapshot | undefined): string {
    if (!timing) return "未计时";
    if (timing.needsReview) return "待确认";
    return {
      "not-started": "未开始",
      running: "进行中",
      paused: "已暂停",
      completed: "已完成"
    }[timing.status];
  }

  function timerEventLabel(kind: DailyTimerEvent["kind"]): string {
    return {
      start: "开始",
      pause: "暂停",
      resume: "继续",
      complete: "完成",
      reopen: "重开",
      correct: "修正",
      reset: "重置"
    }[kind];
  }

  function formatDuration(milliseconds: number | undefined): string {
    const totalMinutes = Math.max(0, Math.round((milliseconds ?? 0) / 60_000));
    if (totalMinutes < 60) return `${totalMinutes} 分钟`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
  }

  function estimateDeltaLabel(value: number | undefined): string {
    if (value === undefined) return "未设置预计";
    if (value === 0) return "与预计一致";
    return value > 0 ? `超出 ${value} 分钟` : `少于预计 ${Math.abs(value)} 分钟`;
  }

  function timingForDeck(
    timing: DailyTaskTimingSnapshot | undefined
  ): {
    state: "idle" | "running" | "paused" | "completed" | "needs-review";
    activeSeconds: number;
    wallClockSeconds?: number;
    interruptionCount?: number;
    firstStartedAt?: string;
    activeSince?: string;
    completedAt?: string;
    timingRevision?: string;
  } | undefined {
    if (!timing) return undefined;
    return {
      state: timing.needsReview
        ? "needs-review"
        : timing.status === "not-started"
          ? "idle"
          : timing.status,
      activeSeconds: Math.floor(timing.activeMs / 1000),
      wallClockSeconds: Math.floor(timing.wallMs / 1000),
      interruptionCount: timing.interruptionCount,
      firstStartedAt: timing.firstStartedAt,
      activeSince: timing.activeSince,
      completedAt: timing.completedAt,
      timingRevision: timing.timingRevision
    };
  }

  function deckTimingStatusLabel(
    state: "idle" | "running" | "paused" | "completed" | "needs-review" | undefined
  ): string {
    if (!state) return "未计时";
    return {
      idle: "未开始",
      running: "进行中",
      paused: "已暂停",
      completed: "已完成",
      "needs-review": "待确认"
    }[state];
  }

  function deckTargetSourceLabel(
    source: "explicit" | "task-link" | "ancestor-link" | "task-block" | "dashboard"
  ): string {
    return {
      explicit: "显式",
      "task-link": "任务",
      "ancestor-link": "父分类",
      "task-block": "原文",
      dashboard: "Dashboard"
    }[source];
  }

  function formatDeckMinutes(seconds: number | undefined): string {
    return `${Math.max(0, Math.floor((seconds ?? 0) / 60))} 分钟`;
  }

  function positiveNumber(value: string): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
  }

  function formatSigned(value: number): string {
    return value > 0 ? `+${value}` : String(value);
  }

  function formatDateTime(value: string | undefined): string {
    const timestamp = Date.parse(value ?? "");
    if (!Number.isFinite(timestamp)) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(timestamp));
  }

  function messageForError(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
  }
</script>

{#if loading && !snapshot}
  <div class="daily-loading" aria-live="polite">
    <RefreshCw class="spin" size={17} />
    <span>正在读取计划…</span>
  </div>
{:else if !dailyApi}
  <section class="daily-unavailable">
    <div>
      <strong>每日计划服务尚未启用</strong>
      <p>接入 DailyPlanService 后，这里会显示今日概要、可编辑计划和墨水屏预览。</p>
    </div>
    {#if onOpenCapture}
      <button type="button" on:click={() => onOpenCapture?.()}>
        <PenLine size={15} />
        先记录一条
      </button>
    {/if}
  </section>
{:else}
  <section class="daily-dashboard" aria-label="每日计划 Dashboard">
    {#if error}
      <div class="daily-error" role="alert">{error}</div>
    {/if}

    <nav class="surface-switcher" aria-label="每日工作区">
      <button type="button" class:active={surface === "today"} on:click={() => (surface = "today")}>
        <CalendarDays size={14} />今日
      </button>
      <button type="button" class:active={surface === "pool"} on:click={() => (surface = "pool")}>
        <ListTodo size={14} />任务池
        <em>{poolItems.filter((item) => item.state === "pool" || item.state === "returned").length}</em>
      </button>
      <button type="button" class:active={surface === "review"} on:click={() => (surface = "review")}>
        <BarChart3 size={14} />复盘
      </button>
    </nav>

    {#if surface === "today"}
    <nav class="day-switcher" aria-label="计划日期">
      <button
        type="button"
        class:active={planningDay === "today"}
        aria-pressed={planningDay === "today"}
        on:click={() => switchDay("today")}
      >今日</button>
      <button
        type="button"
        class:active={planningDay === "tomorrow"}
        aria-pressed={planningDay === "tomorrow"}
        on:click={() => switchDay("tomorrow")}
      >明日</button>
      <span class="selected-date">{selectedDate}</span>
      <div
        class="source-state"
        class:missing={metadata.sourceExists === false}
        class:saving={Boolean(busy)}
        role="status"
        aria-live="polite"
        title="这里显示唯一的 Markdown 计划真源。要同步已有清单，可在插件设置中把“每日计划来源”切换为固定规划文档。"
      >
        <i></i>
        <span>
          <strong>{metadata.sourcePath || "正在解析计划来源"}</strong>
          <small>
            {#if busy}
              正在写回 Markdown…
            {:else if metadata.sourceExists === false}
              {metadata.sourceKind === "fixed-document" ? "固定规划文档" : "每日笔记"} · 文件尚未创建
            {:else if unnormalizedTaskCount > 0}
              {metadata.sourceKind === "fixed-document" ? "固定规划文档" : "每日笔记"} · {unnormalizedTaskCount} 条待规范化
            {:else if (metadata.diagnostics?.length ?? 0) > 0}
              {metadata.sourceKind === "fixed-document" ? "固定规划文档" : "每日笔记"} · {metadata.diagnostics?.length ?? 0} 个格式问题
            {:else}
              {metadata.sourceKind === "fixed-document" ? "固定规划文档" : "每日笔记"} · Markdown 双向同步
            {/if}
          </small>
        </span>
      </div>
      {#if metadata.sourceExists === false && dailyApi.ensurePlanSource}
        <button
          class="source-button create-source"
          type="button"
          disabled={Boolean(busy)}
          on:click={() => run("ensure-source", () => dailyApi?.ensurePlanSource?.(selectedDate))}
        >
          <FilePlus2 size={14} />
          创建计划页
        </button>
      {/if}
      {#if dailyApi.openPlanSource}
        <button
          class="source-button"
          type="button"
          disabled={metadata.sourceExists === false}
          on:click={() => dailyApi?.openPlanSource?.(selectedDate)}
        >
          <BookOpen size={14} />
          打开原文
        </button>
      {/if}
      {#if dailyApi.openPlanSettings}
        <button class="source-button" type="button" on:click={() => dailyApi?.openPlanSettings?.()}>
          <Settings2 size={14} />
          更改来源
        </button>
      {/if}
    </nav>

    <section class="focus-card" aria-label={planningDay === "today" ? "今日概要" : "明日概要"}>
      <header>
        <div>
          <span>{planningDay === "today" ? "今日主题" : "明日主题"}</span>
          <strong>{metadata.theme || "还没有设定主题"}</strong>
        </div>
        <div class="focus-progress">
          <strong>{overview.done} / {overview.total}</strong>
          <span>已完成</span>
        </div>
      </header>
      {#if overview.current}
        <div class="focus-current">
          <span class="focus-marker">● 当前</span>
          <button type="button" on:click={() => (previewItemId = overview.current?.id ?? "")}>
            <strong>{overview.current.text}</strong>
            <small>{overview.current.nextStep ? `下一步：${overview.current.nextStep}` : "还没有写最小下一步"}</small>
          </button>
          {#if dailyApi.startItem && overview.current.status !== "in-progress"}
            <button
              class="start-button"
              type="button"
              disabled={Boolean(busy)}
              on:click={startOverviewItem}
            ><CirclePlay size={14} />开始</button>
          {/if}
        </div>
        {#if overview.upcoming.length > 0}
          <ol class="focus-upcoming">
            {#each overview.upcoming as item}
              <li>
                <span>○</span>
                <button type="button" on:click={() => (previewItemId = item.id)}>{item.text}</button>
              </li>
            {/each}
          </ol>
        {/if}
      {:else}
        <div class="focus-empty">这一天还没有待推进的计划。</div>
      {/if}
      <div class="focus-progress-bar"><i style={`--progress: ${overview.total ? Math.round((overview.done / overview.total) * 100) : 0}%`}></i></div>
    </section>

    <section class="planner-card">
      <button class="planner-heading" type="button" aria-expanded={plannerExpanded} on:click={() => (plannerExpanded = !plannerExpanded)}>
        <span>
          <Columns3 size={17} />
          <span>
            <strong>编排与任务池</strong>
            <small>新建任务，或从任务池搜索并安排到今天 / 明天。</small>
          </span>
        </span>
        <ChevronDown class={plannerExpanded ? "" : "rotated"} size={17} />
      </button>

      {#if plannerExpanded}
        <div class="theme-editor">
          <label for="daily-theme">这一天的主题</label>
          <input id="daily-theme" bind:value={themeDraft} placeholder="例如：推进 Echo MVP" />
          {#if dailyApi.updatePlanMetadata}
            <button type="button" disabled={busy === "theme"} on:click={saveTheme}><Save size={14} />保存主题</button>
          {/if}
        </div>

        <form class="planner-form" on:submit|preventDefault={createItem}>
          <label class="wide">
            <span>计划内容</span>
            <input bind:value={draftText} placeholder="想推进什么？可使用 [[笔记链接]]" aria-label="计划内容" />
          </label>
          <div class="planning-fields">
            <label>
              <span>目标</span>
              <input bind:value={draftGoal} placeholder="完成后能判断什么？" />
            </label>
            <label>
              <span>最小下一步</span>
              <input bind:value={draftNextStep} placeholder="下一步能在 15 分钟内开始" />
            </label>
            <label>
              <span>目标笔记</span>
              <input bind:value={draftTarget} placeholder="[[Echo MVP]]" />
            </label>
            <label>
              <span>预计分钟</span>
              <input bind:value={draftEstimate} type="number" min="1" step="1" placeholder="15" />
            </label>
            <label>
              <span>类别</span>
              <input bind:value={draftCategory} list="daily-category-options" placeholder="项目 / 写作与发布" />
            </label>
            <label>
              <span>优先级</span>
              <select bind:value={draftPriority}>
                <option value="highest">最高</option>
                <option value="high">高</option>
                <option value="normal">普通</option>
                <option value="low">低</option>
                <option value="lowest">最低</option>
              </select>
            </label>
            <label>
              <span>标签</span>
              <input bind:value={draftTags} placeholder="研究, 发布" />
            </label>
            <label class="due-field">
              <span>截止日期</span>
              <input bind:value={draftDueDate} type="date" />
              <span class="date-shortcuts" aria-label="截止日期快捷选择">
                <button type="button" on:click={() => setDraftDueDate("today")}>今天</button>
                <button type="button" on:click={() => setDraftDueDate("tomorrow")}>明天</button>
                <button type="button" on:click={() => setDraftDueDate("friday")}>本周五</button>
                <button type="button" on:click={() => setDraftDueDate("next-week")}>下周</button>
                <button type="button" on:click={() => setDraftDueDate("clear")}>清除</button>
              </span>
            </label>
            <label>
              <span>类型</span>
              <select bind:value={draftKind}>
                <option value="task">任务</option>
                <option value="create_note">新建笔记</option>
                <option value="edit_note">修改笔记</option>
                <option value="send_card">发送内容</option>
              </select>
            </label>
            <label>
              <span>墨水屏</span>
              <select bind:value={draftPolicy}>
                <option value="none">不发送</option>
                <option value="manual">手动发送</option>
                <option value="scheduled">一次性定时</option>
                <option value="rotation">加入轮播</option>
                <option value="agent">允许 Agent 选择</option>
              </select>
            </label>
            {#if draftPolicy === "scheduled"}
              <label>
                <span>显示时间</span>
                <input bind:value={draftSchedule} type="datetime-local" required />
              </label>
            {/if}
          </div>
          <datalist id="daily-category-options">
            {#each categoryChoices as category}<option value={category}></option>{/each}
          </datalist>
          <div class="planning-footer">
            <label class="check"><input bind:checked={draftPrimary} type="checkbox" />最重要的一件事</label>
            <label class="check"><input bind:checked={draftMinimum} type="checkbox" />再乱也至少完成</label>
            <button class="primary" type="submit" disabled={!draftText.trim() || !dailyApi.createItem || busy === "create"}>
              <Plus size={15} />
              添加到{planningDay === "today" ? "今天" : "明天"}
            </button>
          </div>
        </form>

        <section class="planner-pool-picker" aria-label="从任务池选择">
          <header>
            <span>
              <ListTodo size={15} />
              <span>
                <strong>从任务池选择</strong>
                <small>{availablePoolItems.length} 条尚未承诺日期的任务</small>
              </span>
            </span>
            <button type="button" on:click={() => (surface = "pool")}>打开完整任务池</button>
          </header>
          {#if availablePoolItems.length === 0}
            <p>任务池目前为空。长期任务先放进任务池，需要时再安排到今天或明天。</p>
          {:else}
            <div class="pool-picker-filter">
              <input
                type="search"
                bind:value={poolPickerSearch}
                placeholder="搜索任务、类别或目标…"
                aria-label="搜索任务池"
              />
            </div>
            <div class="pool-picker-list">
              {#each visiblePoolPickerItems.slice(0, 8) as item (item.taskId)}
                <article>
                  <div>
                    <strong>{item.text}</strong>
                    <small>
                      {[item.category, item.project, item.dueDate ? `DDL ${item.dueDate}` : "", item.estimateMinutes ? `${item.estimateMinutes}m` : ""]
                        .filter(Boolean).join(" · ") || "未分类"}
                    </small>
                  </div>
                  <button
                    class="primary"
                    type="button"
                    disabled={Boolean(busy)}
                    on:click={() => assignPoolTask(item, planningDay)}
                  >加入{planningDay === "today" ? "今天" : "明天"}</button>
                </article>
              {/each}
            </div>
            {#if visiblePoolPickerItems.length > 8}
              <p>还有 {visiblePoolPickerItems.length - 8} 条；可搜索或打开完整任务池查看。</p>
            {:else if visiblePoolPickerItems.length === 0}
              <p>没有匹配的任务。</p>
            {/if}
          {/if}
        </section>

        <section class="candidate-slot">
          <button type="button" aria-expanded={candidatesExpanded} on:click={toggleCandidates}>
            <Sparkles size={15} />
            从 ToThink、Inbox 与 Echo 选择
            <ChevronDown class={candidatesExpanded ? "" : "rotated"} size={15} />
          </button>
          {#if candidatesExpanded}
            {#if !dailyApi.listPlanningCandidates}
              <p>候选接口尚未接入。ToThink、ToWrite、Inbox 与旧笔记不会被自动加入计划。</p>
            {:else if otherCandidates.length === 0}
              <p>目前没有新的规划候选。</p>
            {:else}
              <div class="candidate-list">
                {#each otherCandidates as candidate (candidate.id)}
                  <article>
                    <span>{candidateSourceLabel(candidate.source)}</span>
                    <div><strong>{candidate.title}</strong>{#if candidate.description}<small>{candidate.description}</small>{/if}</div>
                    <button type="button" disabled={!dailyApi.addPlanningCandidate || Boolean(busy)} on:click={() => addCandidate(candidate)}>加入</button>
                  </article>
                {/each}
              </div>
            {/if}
          {/if}
        </section>
      {/if}
    </section>

    <div class="daily-main-grid" class:preview-open={previewExpanded}>
      <section class="plan-list-card">
        <header>
          <div>
            <h3>{planningDay === "today" ? "今日" : "明日"}清单</h3>
            <p>Markdown 顺序就是设备顺序；普通任务不自动迁移，任务池引用会在日期结束后回池。</p>
          </div>
          <div class="list-header-actions">
            {#if normalizationUndoToken && dailyApi.undoNormalization}
              <button type="button" title="安全撤销刚才的规范化" disabled={Boolean(busy)} on:click={undoNormalization}>
                <Undo2 size={15} />
                撤销规范化
              </button>
            {/if}
            {#if dailyApi.getNormalizationPreview}
              <button type="button" title="先预览分类、任务与 Markdown diff" disabled={Boolean(busy)} on:click={previewNormalizationForPlan}>
                <FileDiff size={15} />
                规范化这份清单
              </button>
            {/if}
            <button
              type="button"
              class:active={previewExpanded}
              title={previewExpanded ? "收起墨水屏预览" : "打开墨水屏预览"}
              on:click={() => (previewExpanded = !previewExpanded)}
            >
              <MonitorUp size={15} />
              设备预览
            </button>
            <button type="button" title="刷新计划" aria-label="刷新计划" on:click={() => refresh()}>
              <RefreshCw size={15} />
            </button>
          </div>
        </header>

        <div class="dashboard-view-toolbar">
          <div class="view-switcher" role="group" aria-label="清单视图">
            <button class:active={dashboardView === "list"} type="button" title="列表视图" on:click={() => (dashboardView = "list")}><LayoutList size={14} />列表</button>
            <button class:active={dashboardView === "board"} type="button" title="看板视图" on:click={() => (dashboardView = "board")}><Columns3 size={14} />看板</button>
            <button class:active={dashboardView === "table"} type="button" title="表格视图" on:click={() => (dashboardView = "table")}><Table2 size={14} />表格</button>
            <button class:active={dashboardView === "calendar"} type="button" title="日历视图" on:click={() => (dashboardView = "calendar")}><CalendarDays size={14} />日历</button>
          </div>
          <label class="category-filter">
            <span>类别</span>
            <select bind:value={selectedCategory}>
              <option value="">全部类别</option>
              {#each categories as category}<option value={category}>{category}</option>{/each}
            </select>
          </label>
          <span class="filtered-count">{filteredItems.length} / {items.length}</span>
        </div>

        <form class="quick-add" on:submit|preventDefault={createItem}>
          <Plus size={16} />
          <input
            bind:value={draftText}
            placeholder={`新建${planningDay === "today" ? "今日" : "明日"}任务，可直接写 [[笔记链接]]`}
            aria-label={`新建${planningDay === "today" ? "今日" : "明日"}任务`}
          />
          <button type="button" on:click={() => (plannerExpanded = true)}>
            属性
          </button>
          <button
            class="primary"
            type="submit"
            disabled={!draftText.trim() || !dailyApi.createItem || busy === "create"}
          >
            添加
          </button>
        </form>

        {#if normalizationPreview}
          <section class="normalization-preview" aria-label="规范化预览">
            <header>
              <div>
                <strong>规范化预览</strong>
                <small>
                  {normalizationPreview.groups.length} 个分类 ·
                  {normalizationPreview.tasks.length} 个叶子任务 ·
                  {normalizationPreview.edits.length} 处改动
                </small>
              </div>
              <button type="button" on:click={() => (normalizationPreview = undefined)}>关闭</button>
            </header>
            {#if normalizationPreview.diagnostics.length > 0}
              <ul class="normalization-diagnostics">
                {#each normalizationPreview.diagnostics as diagnostic}
                  <li class:error={diagnostic.severity === "error"}>
                    <strong>{diagnostic.severity === "error" ? "错误" : "提示"} · 第 {diagnostic.line} 行</strong>
                    <span>{diagnostic.message}</span>
                  </li>
                {/each}
              </ul>
            {/if}
            <div class="normalization-structure">
              <section>
                <strong>分类</strong>
                {#if normalizationPreview.groups.length}
                  <ul>
                    {#each normalizationPreview.groups as group}
                      <li><span>{dailyGroupLabel(group)}</span><small>第 {group.line} 行</small></li>
                    {/each}
                  </ul>
                {:else}
                  <small>没有分类节点</small>
                {/if}
              </section>
              <section>
                <strong>叶子任务</strong>
                {#if normalizationPreview.tasks.length}
                  <ul>
                    {#each normalizationPreview.tasks as task}
                      <li>
                        <span>{task.text}</span>
                        <small>{task.targetResolution.displayLabel} · {task.checkbox ? "已规范" : "待转换"}</small>
                      </li>
                    {/each}
                  </ul>
                {:else}
                  <small>没有可规范化的叶子任务</small>
                {/if}
              </section>
            </div>
            {#if normalizationPreview.diff}
              <pre class="normalization-diff">{normalizationPreview.diff}</pre>
            {:else}
              <p class="normalization-clean">这份清单已经规范，无需修改 Markdown。</p>
            {/if}
            <footer>
              <span>父分类、链接、缩进和未知说明会原样保留。</span>
              {#if normalizationPreview.changed && dailyApi.normalizePlan && !normalizationPreview.diagnostics.some((diagnostic) => diagnostic.severity === "error")}
                <button class="primary" type="button" disabled={Boolean(busy)} on:click={applyNormalization}>
                  <Check size={14} />
                  确认并规范化
                </button>
              {:else if normalizationPreview.diagnostics.some((diagnostic) => diagnostic.severity === "error")}
                <strong class="normalization-blocked">请先修复错误，再规范化</strong>
              {/if}
            </footer>
          </section>
        {/if}

        <div class:view-hidden={dashboardView !== "list"}>
        {#if filteredItems.length === 0}
          <div class="daily-empty">
            <Circle size={24} />
            <strong>
              {#if items.length}
                这个类别里还没有任务
              {:else if metadata.sourceExists === false}
                这一天的计划笔记还没有创建
              {:else if unnormalizedTaskCount > 0}
                发现 {unnormalizedTaskCount} 条笔记待办，尚未纳入 Dashboard
              {:else}
                计划原文的 ToDo 区段还是空的
              {/if}
            </strong>
            <p>
              {#if items.length}
                切换到“全部类别”查看完整计划。
              {:else if metadata.sourceExists === false}
                当前真源是 {metadata.sourcePath}。在上方添加第一条任务，或先创建计划页。
              {:else if unnormalizedTaskCount > 0}
                普通列表或缺少稳定 block ID 的 checkbox 需要先预览并规范化；原有缩进、链接和说明不会被覆盖。
              {:else}
                Dashboard 与 {metadata.sourcePath} 双向同步；在任一边修改都会更新另一边。
              {/if}
            </p>
            <div class="empty-actions">
              {#if metadata.sourceExists === false && dailyApi.ensurePlanSource}
                <button class="primary" type="button" disabled={Boolean(busy)} on:click={() => run("ensure-source", () => dailyApi?.ensurePlanSource?.(selectedDate))}>
                  <FilePlus2 size={14} />创建 Markdown 计划页
                </button>
              {/if}
              {#if unnormalizedTaskCount > 0 && dailyApi.getNormalizationPreview}
                <button class="primary" type="button" disabled={Boolean(busy)} on:click={previewNormalizationForPlan}>
                  <FileDiff size={14} />预览并规范化
                </button>
              {/if}
            </div>
          </div>
        {:else}
          {#each groupedItems as group (group.key)}
            <section class="plan-group">
              <header class="group-heading">
                <button
                  class="group-toggle"
                  type="button"
                  aria-expanded={!collapsedGroups.has(group.key)}
                  on:click={() => toggleGroup(group.key)}
                >
                  <ChevronDown class={collapsedGroups.has(group.key) ? "rotated" : ""} size={15} />
                  <FolderTree size={15} />
                  <span>
                    <strong>{group.label}</strong>
                    {#if group.path && group.path !== group.label}<small>{group.path}</small>{/if}
                  </span>
                  <em>{group.items.length}</em>
                </button>
                {#if group.group && dailyApi.openGroup}
                  <button type="button" title="打开分类目标" on:click={() => group.group && dailyApi?.openGroup?.(group.group)}>
                    <BookOpen size={14} />
                  </button>
                {/if}
              </header>
              {#if !collapsedGroups.has(group.key)}
                {#each group.items as row (row.item.id)}
                  {@const item = row.item}
                  {@const index = row.index}
            <article
              class:current={item.status === "in-progress"}
              class:completed={item.status === "done"}
              class="plan-item"
              style={`--task-depth: ${dailyItemDepth(item)}`}
            >
              <button
                class="check-button"
                type="button"
                disabled={item.status === "done" ? !dailyApi.reopenItem || Boolean(busy) : !dailyApi.completeItem || Boolean(busy)}
                title={item.status === "done" ? "重新打开" : "标记完成"}
                on:click={() => toggleDailyCompletion(item)}
              >
                {#if item.status === "done"}<Check size={17} />{:else}<Circle size={17} />{/if}
              </button>
              <button class="item-main" type="button" on:click={() => {
                previewItemId = item.id;
                previewPage = "item";
                previewExpanded = true;
              }}>
                <span class="item-topline">
                  <span class={`kind kind-${item.kind}`}>{kindLabel(item.kind)}</span>
                  {#if item.primary}<span class="flag">主线</span>{/if}
                  {#if item.minimum}<span class="flag minimum">最低承诺</span>{/if}
                  {#if item.scheduledFor}<time datetime={item.scheduledFor}>{formatDateTime(item.scheduledFor)}</time>{/if}
                </span>
                <strong>{item.text}</strong>
                <span class="item-properties">
                  <em>{dailyItemCategory(item)}</em>
                  {#if item.priority && item.priority !== "normal"}<em class={`priority priority-${item.priority}`}>{priorityLabel(item.priority)}</em>{/if}
                  {#if item.dueDateExplicit !== false && item.dueDate}<time datetime={item.dueDate}>截止 {item.dueDate}</time>{/if}
                  {#if directChildTasks(item).length}
                    <em>子任务 {directChildTasks(item).filter((child) => child.status === "done").length}/{directChildTasks(item).length}</em>
                  {/if}
                  {#each item.tags.slice(0, 3) as tag}<em class="tag"><Tag size={10} />{tag}</em>{/each}
                </span>
                <small>{item.nextStep ? `下一步：${item.nextStep}` : policyLabel(item.devicePolicy)}</small>
                <span class="resolved-target">
                  <Target size={12} />
                  <span>{targetDisplayLabel(item)}</span>
                  <em>{targetSourceLabel(item)}</em>
                </span>
              </button>
              <div class="item-actions">
                {#if dailyApi.openItem}
                  <button type="button" title="打开目标" on:click={() => dailyApi?.openItem?.(item)}><BookOpen size={14} /></button>
                {/if}
                {#if dailyApi.updateItem && item.status !== "done"}
                  <button type="button" title="编辑属性" on:click={() => beginEdit(item)}><PenLine size={14} /></button>
                {/if}
                <details class="item-more">
                  <summary title="更多操作" aria-label="更多操作"><MoreHorizontal size={15} /></summary>
                  <div class="item-more-menu">
                    {#if dailyApi.moveItem}
                      <button type="button" disabled={index === 0 || Boolean(busy)} on:click={() => run(`up:${item.id}`, () => dailyApi?.moveItem?.(item.id, item.revision, "up"))}><ArrowUp size={14} />上移</button>
                      <button type="button" disabled={index === items.length - 1 || Boolean(busy)} on:click={() => run(`down:${item.id}`, () => dailyApi?.moveItem?.(item.id, item.revision, "down"))}><ArrowDown size={14} />下移</button>
                    {/if}
                    {#if dailyApi.sendItemToDevice && item.status !== "done"}
                      <button type="button" on:click={() => run(`send:${item.id}`, () => dailyApi?.sendItemToDevice?.(item.id, item.revision))}><MonitorUp size={14} />发送到墨水屏</button>
                    {/if}
                    {#if item.status !== "done" && directChildTasks(item).length === 0 && dailyApi.moveItemToTomorrow}
                      <button type="button" on:click={() => run(`tomorrow:${item.id}`, () => dailyApi?.moveItemToTomorrow?.(item.id, item.revision))}><CalendarDays size={14} />移到明天</button>
                    {/if}
                    {#if item.status !== "done" && directChildTasks(item).length === 0 && dailyApi.returnItemToPool}
                      <button
                        type="button"
                        title={item.taskRef
                          ? "取消这一天的安排，保留任务池中的任务本体"
                          : "转入任务池会保留任务、类别、目标、截止日期和预计时间；当天下一步不会自动沿用"}
                        on:click={() => run(`return:${item.id}`, () => dailyApi?.returnItemToPool?.(item.id, item.revision))}
                      ><ArchiveRestore size={14} />{item.taskRef ? "放回任务池" : "转入任务池"}</button>
                    {/if}
                    {#if item.status !== "done" && directChildTasks(item).length === 0 && dailyApi.dropDailyItem}
                      <button type="button" class="danger" on:click={() => run(`drop:${item.id}`, () => dailyApi?.dropDailyItem?.(item.id, item.revision))}><Trash2 size={14} />不再追踪</button>
                    {/if}
                  </div>
                </details>
              </div>
              {#if editingItemId === item.id}
                <form class="inline-editor" on:submit|preventDefault={() => saveItem(item)}>
                  <label class="wide"><span>内容</span><input bind:value={editText} required /></label>
                  <label><span>目标</span><input bind:value={editGoal} /></label>
                  <label><span>最小下一步</span><input bind:value={editNextStep} /></label>
                  <label><span>目标笔记</span><input bind:value={editTarget} /></label>
                  <label><span>预计分钟</span><input bind:value={editEstimate} type="number" min="1" /></label>
                  <label><span>类别</span><input bind:value={editCategory} list="daily-category-options" /></label>
                  <label><span>优先级</span>
                    <select bind:value={editPriority}>
                      <option value="highest">最高</option>
                      <option value="high">高</option>
                      <option value="normal">普通</option>
                      <option value="low">低</option>
                      <option value="lowest">最低</option>
                    </select>
                  </label>
                  <label><span>标签</span><input bind:value={editTags} placeholder="研究, 发布" /></label>
                  <label class="due-field"><span>截止日期</span><input bind:value={editDueDate} type="date" /></label>
                  <div class="edit-date-shortcuts">
                    <button type="button" on:click={() => setEditDueDate("today")}>今天</button>
                    <button type="button" on:click={() => setEditDueDate("tomorrow")}>明天</button>
                    <button type="button" on:click={() => setEditDueDate("friday")}>本周五</button>
                    <button type="button" on:click={() => setEditDueDate("next-week")}>下周</button>
                    <button type="button" on:click={() => setEditDueDate("clear")}>清除</button>
                  </div>
                  <label class="check"><input bind:checked={editPrimary} type="checkbox" />主线</label>
                  <label class="check"><input bind:checked={editMinimum} type="checkbox" />最低承诺</label>
                  <div class="inline-actions">
                    <button type="button" on:click={() => (editingItemId = "")}>取消</button>
                    <button class="primary" type="submit" disabled={Boolean(busy)}><Save size={14} />保存</button>
                  </div>
                </form>
              {/if}
              {#if item.status !== "done" && dailyApi.updateItem}
                <select
                  class="policy-select"
                  aria-label={`更改 ${item.text} 的设备策略`}
                  value={item.devicePolicy ?? "none"}
                  disabled={Boolean(busy)}
                  on:change={(event) => updatePolicyFromEvent(item, event)}
                >
                  <option value="none">不发送</option>
                  <option value="manual">手动</option>
                  <option value="scheduled">定时</option>
                  <option value="rotation">轮播</option>
                  <option value="agent">Agent</option>
                </select>
              {/if}
              {#if dailyApi.getItemTiming || dailyApi.startItem || dailyApi.pauseItem || dailyApi.resumeItem}
                {@const timing = timingByItem[item.id]}
                <details class="timing-panel" on:toggle={(event) => loadTimerEvents(item.id, event)}>
                  <summary>
                    <span>
                      <Clock3 size={14} />
                      <strong>时间与进度</strong>
                      <em class:review={timing?.needsReview}>{timingStatusLabel(timing)}</em>
                    </span>
                    <span>{formatDuration(timing?.activeMs)} / {item.estimateMinutes ? `${item.estimateMinutes} 分钟` : "无预计"}</span>
                  </summary>
                  <div class="timing-content">
                    <div class="timing-metrics">
                      <span><small>实际投入</small><strong>{formatDuration(timing?.activeMs)}</strong></span>
                      <span><small>总跨度</small><strong>{formatDuration(timing?.wallMs)}</strong></span>
                      <span><small>中断</small><strong>{timing?.interruptionCount ?? 0} 次</strong></span>
                      <span><small>预计差值</small><strong>{estimateDeltaLabel(timing?.estimateDeltaMinutes)}</strong></span>
                    </div>
                    {#if timing?.needsReview}
                      <p class="timing-review">
                        此会话跨午夜或连续打开超过安全阈值，暂不把无限时长计入统计。请检查最近事件。
                      </p>
                    {/if}
                    <div class="timing-actions">
                      {#if (!timing || timing.status === "not-started") && dailyApi.startItem && item.status !== "done"}
                        <button class="primary" type="button" disabled={Boolean(busy)} on:click={() => transitionTimer(item, "start")}><Play size={14} />开始</button>
                      {:else if timing?.status === "running" && dailyApi.pauseItem}
                        <button type="button" disabled={Boolean(busy)} on:click={() => transitionTimer(item, "pause")}><Pause size={14} />暂停</button>
                      {:else if timing?.status === "paused" && dailyApi.resumeItem && item.status !== "done"}
                        <button class="primary" type="button" disabled={Boolean(busy)} on:click={() => transitionTimer(item, "resume")}><Play size={14} />继续</button>
                      {/if}
                      {#if item.status !== "done" && dailyApi.completeItem}
                        <button type="button" disabled={Boolean(busy)} on:click={() => transitionTimer(item, "complete")}><Check size={14} />完成</button>
                      {/if}
                    </div>
                    {#if recentTimerEvents(item.id).length > 0}
                      <section class="timer-history">
                        <h4><History size={13} />最近事件</h4>
                        <ol>
                          {#each recentTimerEvents(item.id) as event (event.eventId)}
                            <li>
                              <span>{timerEventLabel(event.kind)}</span>
                              <time datetime={event.at}>{formatDateTime(event.at)}</time>
                              <small>{event.source}{event.automatic ? " · 自动" : ""}</small>
                            </li>
                          {/each}
                        </ol>
                      </section>
                    {/if}
                    {#if dailyApi.correctItemTiming && recentTimerEvents(item.id).length > 0}
                      <form class="timing-correction" on:submit|preventDefault={() => correctTiming(item)}>
                        <label>
                          <span>修正事件</span>
                          <select value={correctionEventByItem[item.id] || recentTimerEvents(item.id)[0]?.eventId} on:change={(event) => setCorrectionEvent(item.id, event)}>
                            {#each recentTimerEvents(item.id) as event (event.eventId)}
                              <option value={event.eventId}>{timerEventLabel(event.kind)} · {formatDateTime(event.at)}</option>
                            {/each}
                          </select>
                        </label>
                        <label>
                          <span>正确时间</span>
                          <input type="datetime-local" value={correctionTimeByItem[item.id] ?? ""} on:input={(event) => setCorrectionTime(item.id, event)} required />
                        </label>
                        <label class="wide">
                          <span>修正原因</span>
                          <input value={correctionReasonByItem[item.id] ?? ""} on:input={(event) => setCorrectionReason(item.id, event)} placeholder="例如：忘记暂停" />
                        </label>
                        <button type="submit" disabled={Boolean(busy)}>保存修正</button>
                      </form>
                    {/if}
                  </div>
                </details>
              {/if}
            </article>
                {/each}
              {/if}
            </section>
          {/each}
        {/if}
        </div>

        {#if dashboardView === "board"}
          <div class="daily-board" aria-label="任务看板">
            {#each boardColumns as column (column.status)}
              <section>
                <header><strong>{column.label}</strong><span>{column.items.length}</span></header>
                <div>
                  {#each column.items as item (item.id)}
                    <article class:current={item.status === "in-progress"} class:completed={item.status === "done"}>
                      <button type="button" on:click={() => {
                        previewItemId = item.id;
                        previewPage = "item";
                      }}>
                        <small>{dailyItemCategory(item)}{item.parentTaskId ? " · 子任务" : ""}</small>
                        <strong>{item.text}</strong>
                        {#if item.nextStep}<span>下一步：{item.nextStep}</span>{/if}
                        <footer>
                          {#if item.dueDateExplicit !== false && item.dueDate}<time datetime={item.dueDate}>{item.dueDate}</time>{/if}
                          <em>{priorityLabel(item.priority)}</em>
                        </footer>
                      </button>
                      <div>
                        {#if dailyApi.openItem}<button type="button" title="打开目标" on:click={() => dailyApi?.openItem?.(item)}><BookOpen size={13} /></button>{/if}
                        {#if dailyApi.updateItem && item.status !== "done"}<button type="button" title="编辑" on:click={() => {
                          dashboardView = "list";
                          beginEdit(item);
                        }}><PenLine size={13} /></button>{/if}
                      </div>
                    </article>
                  {:else}
                    <p>暂无任务</p>
                  {/each}
                </div>
              </section>
            {/each}
          </div>
        {:else if dashboardView === "table"}
          <div class="daily-table-wrap">
            <table class="daily-table">
              <thead><tr><th>任务</th><th>类别</th><th>状态</th><th>优先级</th><th>截止</th><th>预计</th><th>标签</th><th></th></tr></thead>
              <tbody>
                {#each filteredItems as item (item.id)}
                  <tr class:completed={item.status === "done"}>
                    <td style={`--task-depth: ${dailyItemDepth(item)}`}><button type="button" on:click={() => {
                      previewItemId = item.id;
                      previewPage = "item";
                    }}>{item.text}</button></td>
                    <td>{dailyItemCategory(item)}</td>
                    <td>{item.status === "todo" ? "待办" : item.status === "in-progress" ? "进行中" : "已完成"}</td>
                    <td>{priorityLabel(item.priority)}</td>
                    <td>{item.dueDateExplicit !== false ? item.dueDate : ""}</td>
                    <td>{item.estimateMinutes ? `${item.estimateMinutes} 分钟` : "—"}</td>
                    <td>{item.tags.join(" · ")}</td>
                    <td>{#if dailyApi.openItem}<button type="button" title="打开目标" on:click={() => dailyApi?.openItem?.(item)}><BookOpen size={13} /></button>{/if}</td>
                  </tr>
                {:else}
                  <tr><td colspan="8">这个类别里还没有任务。</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else if dashboardView === "calendar"}
          <div class="daily-calendar" aria-label="任务日历">
            {#each calendarEntries as entry (entry.date)}
              <section>
                <header><CalendarDays size={15} /><strong>{formatCalendarDate(entry.date)}</strong><span>{entry.items.length}</span></header>
                <div>
                  {#each entry.items as item (item.id)}
                    <button class:completed={item.status === "done"} type="button" on:click={() => {
                      previewItemId = item.id;
                      previewPage = "item";
                    }}>
                      <small>{dailyItemCategory(item)}</small>
                      <strong>{item.text}</strong>
                      <span>{item.status === "todo" ? "待办" : item.status === "in-progress" ? "进行中" : "已完成"} · {priorityLabel(item.priority)}</span>
                    </button>
                  {/each}
                </div>
              </section>
            {:else}
              <div class="daily-empty">这个类别里还没有任务。</div>
            {/each}
          </div>
        {/if}
      </section>

      {#if previewExpanded}
      <aside class="preview-column">
        <section class="eink-card">
          <header>
            <span>2.7″ E-ink preview</span>
            <small>{deck?.pageOrder.length ?? 0} 页 · {deck?.planItems.length ?? 0} 张任务卡</small>
          </header>
          <nav class="preview-tabs" aria-label="设备页面预览">
            <button class:active={previewPage === "overview"} type="button" on:click={() => (previewPage = "overview")}>概要</button>
            <button class:active={previewPage === "item"} type="button" on:click={() => (previewPage = "item")}>任务</button>
            <button class:active={previewPage === "result"} type="button" on:click={() => (previewPage = "result")}>结果</button>
          </nav>
          <div class="eink-screen">
            {#if previewPage === "overview" && deck}
              <div class="eink-meta"><strong>{deck.date.slice(5).replace("-", "月")}日</strong><span>今日概要</span></div>
              <h4>{deck.theme || "今天最重要的是什么？"}</h4>
              {#if deck.overview.current}
                <p class="eink-current">● {deck.overview.current.text}</p>
                <small>{deck.overview.current.nextStep ? `下一步：${deck.overview.current.nextStep}` : "还没有最小下一步"}</small>
                {#each deck.overview.upcoming as item}<p class="eink-next">○ {item.text}</p>{/each}
              {:else}
                <p class="eink-empty">今天没有待推进项目</p>
              {/if}
              <footer><span>◀ 切换</span><strong>{deck.overview.progress.done} / {deck.overview.progress.total}</strong><span>开始</span></footer>
            {:else if previewPage === "item" && previewTaskCard}
              <div class="eink-meta">
                <strong>{previewTaskCard.item.groupLabel || "未分类"} · {previewTaskCard.position}/{previewTaskCard.total}</strong>
                <span>{deckTimingStatusLabel(previewTaskCard.item.timing?.state)}</span>
              </div>
              <h4>{previewTaskCard.item.text}</h4>
              {#if previewTaskCard.item.targetLabel}
                <small>打开目标 · {previewTaskCard.item.targetProvenance ? deckTargetSourceLabel(previewTaskCard.item.targetProvenance) : ""}</small>
                <p class="eink-target">{previewTaskCard.item.targetLabel}</p>
              {/if}
              {#if previewTaskCard.item.goal}<small>目标</small><p>{previewTaskCard.item.goal}</p>{/if}
              {#if previewTaskCard.item.nextStep}<small>下一步{previewTaskCard.item.estimateMinutes ? ` · ${previewTaskCard.item.estimateMinutes}分钟` : ""}</small><p>{previewTaskCard.item.nextStep}</p>{/if}
              {#if previewTaskCard.item.timing || previewTaskCard.item.estimateMinutes}
                <p class="eink-timing">
                  已投入 {formatDeckMinutes(previewTaskCard.item.timing?.activeSeconds)}
                  / {previewTaskCard.item.estimateMinutes ? `${previewTaskCard.item.estimateMinutes} 分钟` : "无预计"}
                </p>
              {/if}
              <footer><span>切换</span><span>打开</span><span>✓ 完成</span></footer>
            {:else if previewPage === "result" && deck}
              <div class="eink-meta"><strong>今日结果</strong><span>{deck.result.progress.done}/{deck.result.progress.total}</span></div>
              {#each deck.result.completed.slice(0, 3) as item}<p class="eink-next">✓ {item.text}</p>{/each}
              {#each deck.result.remaining.slice(0, 3) as item}<p class="eink-next">→ {item.text}</p>{/each}
              {#if deck.result.progress.total === 0}<p class="eink-empty">还没有计划</p>{/if}
              <footer><span>◀ 切换</span><span>打开计划</span><span>继续</span></footer>
            {:else}
              <div class="eink-placeholder"><MonitorUp size={22} /><span>暂无设备页面</span></div>
            {/if}
          </div>
          {#if previewItem}
            <div class="preview-actions">
              {#if onOpenCapture}<button type="button" on:click={() => onOpenCapture?.()}><Plus size={14} />新建记录</button>{/if}
              {#if dailyApi.openItem}<button type="button" on:click={() => dailyApi?.openItem?.(previewItem)}><PenLine size={14} />打开</button>{/if}
              {#if dailyApi.sendItemToDevice}
                <button class="primary" type="button" disabled={Boolean(busy)} on:click={() => run(`send:${previewItem.id}`, () => dailyApi?.sendItemToDevice?.(previewItem.id, previewItem.revision))}><Send size={14} />发送</button>
              {/if}
            </div>
          {/if}
        </section>
      </aside>
      {/if}
    </div>

    {:else if surface === "pool"}
      <section class="task-pool-card">
        <header class="task-pool-heading">
          <div>
            <span>Markdown 任务池</span>
            <h2>先收集，再决定哪天承诺</h2>
            <p>{configuration.taskPoolPath} · 今日只保存稳定引用；计时仍在独立 JSONL 账本。</p>
          </div>
          <div>
            {#if dailyApi.openTaskPoolSource}
              <button type="button" on:click={() => dailyApi?.openTaskPoolSource?.()}><BookOpen size={14} />打开原文</button>
            {/if}
            <button type="button" on:click={() => refresh()}><RefreshCw size={14} />刷新</button>
          </div>
        </header>

        <form class="pool-create-form" on:submit|preventDefault={createPoolTask}>
          <label class="wide"><span>任务</span><input bind:value={poolDraftText} placeholder="准备推进什么？可以绑定 [[笔记]]" required /></label>
          <label><span>类别</span><input bind:value={poolDraftCategory} list="daily-category-options" placeholder="项目" /></label>
          <label><span>目标笔记</span><input bind:value={poolDraftTarget} placeholder="[[Echo MVP]]" /></label>
          <label class="pool-due">
            <span>截止日期</span>
            <input bind:value={poolDraftDueDate} type="date" />
            <span class="date-shortcuts">
              <button type="button" on:click={() => (poolDraftDueDate = dailyDueDateForShortcut("today"))}>今天</button>
              <button type="button" on:click={() => (poolDraftDueDate = dailyDueDateForShortcut("tomorrow"))}>明天</button>
              <button type="button" on:click={() => (poolDraftDueDate = dailyDueDateForShortcut("friday"))}>本周五</button>
              <button type="button" on:click={() => (poolDraftDueDate = "")}>清除</button>
            </span>
          </label>
          <label><span>预计分钟</span><input bind:value={poolDraftEstimate} type="number" min="1" max="1440" placeholder="30" /></label>
          <button class="primary" type="submit" disabled={!poolDraftText.trim() || !dailyApi.createPoolTask || Boolean(busy)}>
            <Plus size={14} />加入任务池
          </button>
        </form>
        <datalist id="daily-category-options">
          {#each categoryChoices as category}<option value={category}></option>{/each}
        </datalist>

        <div class="pool-toolbar">
          <div>
            <strong>{filteredPoolItems.length}</strong>
            <span>条任务</span>
            <small>{poolItems.filter((item) => item.state === "pool" || item.state === "returned").length} 条可安排</small>
          </div>
          <label>
            <span>类别</span>
            <select bind:value={poolCategoryFilter}>
              <option value="">全部类别</option>
              {#each categoryChoices as category}<option value={category}>{category}</option>{/each}
            </select>
          </label>
        </div>

        {#if taskPool?.diagnostics.some((diagnostic) => diagnostic.severity === "error")}
          <div class="daily-error" role="alert">
            任务池存在重复 ID 或无效字段，请先打开原文修复；为避免覆盖，写入已暂停。
          </div>
        {/if}

        <div class="pool-grid">
          {#each ["pool", "returned", "planned", "done", "dropped"] as state}
            {@const stateItems = filteredPoolItems.filter((item) => item.state === state)}
            {#if stateItems.length}
              <section class={`pool-column state-${state}`}>
                <header><strong>{poolStateLabel(stateItems[0])}</strong><span>{stateItems.length}</span></header>
                <div>
                  {#each stateItems as item (item.taskId)}
                    <article>
                      <span class="pool-state">{poolStateLabel(item)}</span>
                      <strong>{item.text}</strong>
                      <small>{[item.category, item.project].filter(Boolean).join(" · ") || "未分类"}</small>
                      <div class="pool-properties">
                        {#if item.dueDate}<time datetime={item.dueDate}>截止 {item.dueDate}</time>{/if}
                        {#if item.estimateMinutes}<span>预计 {item.estimateMinutes} 分钟</span>{/if}
                        {#if item.target}<span>{item.target}</span>{/if}
                        {#if item.source && item.source !== item.target}<span>来源 {item.source}</span>{/if}
                      </div>
                      {#if (item.state === "pool" || item.state === "returned") && dailyApi.assignPoolTask}
                        <footer>
                          <button class="primary" type="button" disabled={Boolean(busy)} on:click={() => assignPoolTask(item, "today")}>加入今天</button>
                          <button type="button" disabled={Boolean(busy)} on:click={() => assignPoolTask(item, "tomorrow")}>加入明天</button>
                        </footer>
                      {/if}
                    </article>
                  {/each}
                </div>
              </section>
            {/if}
          {/each}
          {#if filteredPoolItems.length === 0}
            <div class="daily-empty">
              <ListTodo size={24} />
              <strong>任务池还是空的</strong>
              <p>先在上方写一条，或把 ToThink、ToWrite、Inbox 候选加入今天。</p>
            </div>
          {/if}
        </div>
      </section>
    {:else}
      <details class="review-card" open>
        <summary>
          <span><BarChart3 size={16} /><strong>数据与复盘</strong><small>写作统计、活动和今日总结放在第二层</small></span>
          <ChevronDown size={16} />
        </summary>
        <div class="daily-metrics">
          <article><span>新增写作单位</span><strong>{snapshot?.activity.positiveWritingUnits ?? 0}</strong><small>中文按字、拉丁文本按词</small></article>
          <article><span>净增</span><strong class:negative={(snapshot?.activity.netWritingUnits ?? 0) < 0}>{formatSigned(snapshot?.activity.netWritingUnits ?? 0)}</strong><small>{snapshot?.activity.trackingComplete === false ? "从启用统计后开始" : "今日可重建聚合"}</small></article>
          <article><span>笔记活动</span><strong>{snapshot?.activity.notesModified ?? 0}</strong><small>{snapshot?.activity.notesCreated ?? 0} 篇新建</small></article>
          <article><span>完成事项</span><strong>{Math.max(snapshot?.plan.done ?? 0, snapshot?.activity.tasksCompleted ?? 0)}</strong><small>{snapshot?.activity.questionsResolved ?? 0} 个问题已解决</small></article>
          <article><span>Capture</span><strong>{snapshot?.activity.capturesCommitted ?? 0}</strong><small>今日提交</small></article>
          <article><span>屏幕展示</span><strong>{snapshot?.activity.cardsDisplayed ?? 0}</strong><small>{snapshot?.activity.cardsSelected ?? 0} 次选择</small></article>
        </div>
        <section class="summary-card">
          <header>
            <div><h3>今日总结</h3><p>规则先生成，AI 只改写表述；写回前仍需确认。</p></div>
            <span class:ai={summary?.source === "ai"}>{summary?.source === "ai" ? "AI 草稿" : "规则生成"}</span>
          </header>
          {#if summary}
            <div class="summary-text">
              <strong>{summary.headline}</strong>
              {#each summary.lines as line}<span>{line}</span>{/each}
            </div>
          {:else}
            <div class="daily-empty compact">今天还没有足够的数据生成总结。</div>
          {/if}
          <footer>
            {#if dailyApi.generateSummary}
              <button type="button" disabled={Boolean(busy)} on:click={() => generateSummary("rules")}><RefreshCw size={14} />重新生成</button>
              <button type="button" disabled={Boolean(busy)} on:click={() => generateSummary("ai")}><Sparkles size={14} />AI 改写</button>
            {/if}
            {#if dailyApi.writeSummary && summary}
              <button class="primary" type="button" disabled={Boolean(busy)} on:click={() => run("write-summary", writeCurrentSummary)}><FilePlus2 size={14} />写回今日日记</button>
            {/if}
            {#if dailyApi.sendSummaryToDevice && summary}
              <button type="button" disabled={Boolean(busy)} on:click={() => run("send-summary", () => dailyApi?.sendSummaryToDevice?.())}><MonitorUp size={14} />发送总结</button>
            {/if}
          </footer>
        </section>
      </details>
    {/if}
  </section>
{/if}

<style>
  .daily-dashboard {
    display: grid;
    gap: 9px;
    --daily-border: var(--background-modifier-border);
    --daily-soft: color-mix(in srgb, var(--background-secondary) 72%, transparent);
    --daily-raised: var(--background-primary);
  }

  .surface-switcher {
    order: 0;
  }

  .day-switcher {
    order: 1;
  }

  .focus-card {
    order: 2;
  }

  .daily-main-grid {
    order: 3;
  }

  .planner-card {
    order: 4;
  }

  .review-card {
    order: 5;
  }

  button {
    box-shadow: none;
  }

  .daily-loading,
  .daily-unavailable,
  .daily-error {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 16px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
  }

  .daily-unavailable {
    justify-content: space-between;
  }

  .daily-unavailable p,
  .daily-empty p,
  .candidate-slot p {
    margin: 3px 0 0;
    color: var(--text-muted);
    font-size: 0.78rem;
  }

  .daily-error {
    color: var(--text-error);
    background: color-mix(in srgb, var(--background-modifier-error) 16%, transparent);
  }

  .surface-switcher {
    display: inline-flex;
    width: fit-content;
    padding: 0;
    border: 0;
    border-bottom: 1px solid var(--daily-border);
    border-radius: 0;
    background: transparent;
  }

  .surface-switcher button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    color: var(--text-muted);
    background: transparent;
  }

  .surface-switcher button.active {
    color: var(--text-normal);
    border-bottom-color: var(--interactive-accent);
    background: transparent;
    font-weight: 700;
  }

  .surface-switcher em {
    min-width: 18px;
    padding: 1px 5px;
    border-radius: 999px;
    color: var(--text-muted);
    background: var(--background-modifier-hover);
    font-size: 0.66rem;
    font-style: normal;
    text-align: center;
  }

  .day-switcher {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    padding: 4px 0 7px;
    border-bottom: 1px solid var(--daily-border);
  }

  .day-switcher > button:not(.source-button) {
    padding: 5px 11px;
    border: 0;
    border-radius: 6px;
    color: var(--text-muted);
    background: transparent;
  }

  .day-switcher > button.active {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
    font-weight: 700;
  }

  .selected-date {
    margin: 0 4px;
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .source-state {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 7px;
    margin-left: auto;
    padding: 4px 8px;
    border-radius: 7px;
    color: var(--text-muted);
    background: var(--daily-soft);
  }

  .source-state > i {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--color-green);
  }

  .source-state.missing > i {
    background: var(--color-orange);
  }

  .source-state.saving > i {
    background: var(--interactive-accent);
    animation: source-pulse 1s ease-in-out infinite alternate;
  }

  .source-state > span {
    display: grid;
    min-width: 0;
    line-height: 1.25;
  }

  .source-state strong,
  .source-state small {
    overflow: hidden;
    max-width: 260px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-state strong {
    color: var(--text-normal);
    font-size: 0.68rem;
    font-weight: 600;
  }

  .source-state small {
    font-size: 0.6rem;
  }

  .source-button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: none;
    color: var(--text-muted);
    background: transparent;
  }

  .source-button.create-source {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  @keyframes source-pulse {
    from { opacity: 0.4; }
    to { opacity: 1; }
  }

  .task-pool-card {
    display: grid;
    gap: 14px;
    padding: 16px;
  }

  .task-pool-heading,
  .pool-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .task-pool-heading h2,
  .task-pool-heading p {
    margin: 2px 0 0;
  }

  .task-pool-heading > div:last-child,
  .pool-toolbar > div,
  .pool-toolbar label,
  .pool-create-form > button,
  .pool-column article footer {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .task-pool-heading button,
  .pool-column button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .pool-create-form {
    display: grid;
    grid-template-columns: minmax(220px, 2fr) repeat(4, minmax(120px, 1fr)) auto;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--daily-border);
    border-radius: 11px;
    background: var(--daily-soft);
  }

  .pool-create-form label,
  .pool-toolbar label {
    display: grid;
    gap: 4px;
    min-width: 0;
    color: var(--text-muted);
    font-size: 0.7rem;
  }

  .pool-create-form input,
  .pool-toolbar select {
    width: 100%;
  }

  .pool-due .date-shortcuts {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .pool-due .date-shortcuts button {
    padding: 2px 5px;
    font-size: 0.64rem;
  }

  .pool-toolbar {
    padding-top: 2px;
  }

  .pool-toolbar > div strong {
    font-size: 1.15rem;
  }

  .pool-toolbar small {
    color: var(--text-muted);
  }

  .pool-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(210px, 1fr));
    gap: 10px;
    align-items: start;
  }

  .pool-column {
    overflow: hidden;
    border: 1px solid var(--daily-border);
    border-radius: 11px;
    background: var(--daily-soft);
  }

  .pool-column > header {
    display: flex;
    justify-content: space-between;
    padding: 9px 10px;
    border-bottom: 1px solid var(--daily-border);
  }

  .pool-column > header span,
  .pool-state {
    color: var(--text-muted);
    font-size: 0.68rem;
  }

  .pool-column > div {
    display: grid;
    gap: 7px;
    padding: 7px;
  }

  .pool-column article {
    display: grid;
    gap: 5px;
    padding: 9px;
    border: 1px solid var(--daily-border);
    border-radius: 9px;
    background: var(--daily-raised);
  }

  .pool-column article > small,
  .pool-properties {
    color: var(--text-muted);
    font-size: 0.7rem;
  }

  .pool-properties {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 9px;
  }

  .pool-column.state-done,
  .pool-column.state-dropped {
    opacity: 0.72;
  }

  .focus-card,
  .eink-card,
  .task-pool-card,
  .review-card {
    border: 1px solid var(--daily-border);
    border-radius: 13px;
    background: var(--daily-raised);
  }

  .focus-card {
    padding: 12px 14px;
  }

  .focus-card > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .focus-card > header > div:first-child,
  .focus-progress {
    display: grid;
    gap: 2px;
  }

  .focus-card > header span,
  .focus-current small,
  .focus-progress span {
    color: var(--text-muted);
    font-size: 0.72rem;
  }

  .focus-card > header > div:first-child strong {
    font-size: 1.05rem;
  }

  .focus-progress {
    text-align: right;
  }

  .focus-progress strong {
    font-size: 1.05rem;
  }

  .focus-current {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
    padding: 9px 10px;
    border-radius: 7px;
    background: var(--daily-soft);
  }

  .focus-marker {
    color: var(--text-accent);
    font-size: 0.72rem;
    font-weight: 700;
  }

  .focus-current > button:not(.start-button),
  .focus-upcoming button {
    display: grid;
    gap: 3px;
    padding: 0;
    border: 0;
    color: var(--text-normal);
    background: transparent;
    text-align: left;
  }

  .start-button,
  .primary {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--text-on-accent);
    background: var(--interactive-accent);
  }

  .focus-upcoming {
    display: grid;
    gap: 7px;
    margin: 7px 0 0;
    padding: 0 12px;
    list-style: none;
  }

  .focus-upcoming li {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .focus-upcoming li > span {
    color: var(--text-muted);
  }

  .focus-empty {
    margin-top: 8px;
    color: var(--text-muted);
  }

  .focus-progress-bar {
    overflow: hidden;
    height: 4px;
    margin-top: 9px;
    border-radius: 999px;
    background: var(--daily-border);
  }

  .focus-progress-bar i {
    display: block;
    width: var(--progress);
    height: 100%;
    background: var(--interactive-accent);
  }

  .planner-heading,
  .candidate-slot > button,
  .review-card > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 13px 15px;
    border: 0;
    color: var(--text-normal);
    background: transparent;
    text-align: left;
  }

  .planner-card {
    border-top: 1px solid var(--daily-border);
    border-bottom: 1px solid var(--daily-border);
    background: transparent;
  }

  .planner-heading > span,
  .review-card > summary > span {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .planner-heading > span > span,
  .review-card > summary > span {
    min-width: 0;
  }

  .planner-heading strong,
  .planner-heading small,
  .review-card summary strong,
  .review-card summary small {
    display: block;
  }

  .planner-heading small,
  .review-card summary small {
    margin-top: 2px;
    color: var(--text-muted);
    font-size: 0.72rem;
  }

  .rotated {
    transform: rotate(-90deg);
  }

  .theme-editor {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--daily-border);
    background: var(--daily-soft);
  }

  .theme-editor label,
  .planner-form label > span,
  .inline-editor label > span {
    color: var(--text-muted);
    font-size: 0.7rem;
  }

  .theme-editor button,
  .preview-actions button,
  .summary-card button,
  .candidate-list button,
  .inline-actions button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .planner-form {
    display: grid;
    gap: 10px;
    padding: 11px 12px;
    border-top: 1px solid var(--daily-border);
  }

  .planner-form label,
  .inline-editor label {
    display: grid;
    gap: 4px;
  }

  .planning-fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .planning-footer {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  label.check {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  label.check input {
    margin: 0;
  }

  .planning-footer .primary {
    margin-left: auto;
  }

  .due-field {
    grid-column: span 2;
  }

  .date-shortcuts,
  .edit-date-shortcuts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .date-shortcuts button,
  .edit-date-shortcuts button {
    min-height: 24px;
    padding: 2px 7px;
    color: var(--text-muted);
    background: var(--background-primary);
    font-size: 0.65rem;
  }

  .edit-date-shortcuts {
    align-self: end;
  }

  .planner-pool-picker {
    display: grid;
    gap: 8px;
    padding: 11px 12px;
    border-top: 1px solid var(--daily-border);
    background: color-mix(in srgb, var(--background-secondary) 38%, transparent);
  }

  .planner-pool-picker > header,
  .planner-pool-picker > header > span {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .planner-pool-picker > header {
    justify-content: space-between;
  }

  .planner-pool-picker > header > span > span {
    display: grid;
    min-width: 0;
  }

  .planner-pool-picker > header small,
  .planner-pool-picker > p,
  .pool-picker-list small {
    color: var(--text-muted);
    font-size: 0.7rem;
  }

  .planner-pool-picker > p {
    margin: 0;
  }

  .planner-pool-picker > header button {
    flex: 0 0 auto;
    min-height: 28px;
    color: var(--text-muted);
    background: transparent;
  }

  .pool-picker-filter input {
    width: 100%;
  }

  .pool-picker-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .pool-picker-list article {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 8px 9px;
    border: 1px solid var(--daily-border);
    border-radius: 9px;
    background: var(--daily-raised);
  }

  .pool-picker-list article > div {
    display: grid;
    min-width: 0;
  }

  .pool-picker-list strong,
  .pool-picker-list small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pool-picker-list button {
    min-height: 28px;
    white-space: nowrap;
  }

  .candidate-slot {
    border-top: 1px solid var(--daily-border);
  }

  .candidate-slot > button {
    justify-content: flex-start;
  }

  .candidate-slot > button :global(svg:last-child) {
    margin-left: auto;
  }

  .candidate-slot > p {
    padding: 0 15px 13px;
  }

  .candidate-list {
    display: grid;
    gap: 6px;
    padding: 0 12px 12px;
  }

  .candidate-list article {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 9px;
    border: 1px solid var(--daily-border);
    border-radius: 9px;
  }

  .candidate-list article > span,
  .flag {
    padding: 2px 6px;
    border-radius: 999px;
    color: var(--text-accent);
    background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
    font-size: 0.65rem;
  }

  .candidate-list article > div {
    display: grid;
    min-width: 0;
  }

  .candidate-list small {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 0.68rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .daily-main-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    align-items: start;
  }

  .daily-main-grid.preview-open {
    grid-template-columns: minmax(0, 1fr);
  }

  .eink-card {
    overflow: hidden;
  }

  .plan-list-card {
    overflow: visible;
    border-top: 1px solid var(--daily-border);
    border-bottom: 1px solid var(--daily-border);
    background: var(--daily-raised);
  }

  .plan-list-card > header,
  .eink-card > header,
  .summary-card > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 4px;
    border-bottom: 1px solid var(--daily-border);
  }

  .plan-list-card h3,
  .summary-card h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  .plan-list-card header p,
  .summary-card header p {
    margin: 2px 0 0;
    color: var(--text-muted);
    font-size: 0.7rem;
  }

  .plan-list-card > header button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 7px;
    color: var(--text-muted);
    background: transparent;
  }

  .dashboard-view-toolbar {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 4px;
    border-bottom: 1px solid var(--daily-border);
    background: transparent;
  }

  .view-switcher {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 7px;
    background: var(--daily-soft);
  }

  .view-switcher button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 27px;
    padding: 3px 7px;
    border: 0;
    color: var(--text-muted);
    background: transparent;
    font-size: 0.67rem;
  }

  .view-switcher button.active {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
    font-weight: 650;
  }

  .category-filter {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    color: var(--text-muted);
    font-size: 0.68rem;
  }

  .category-filter select {
    width: auto;
    min-width: 110px;
    height: 28px;
  }

  .filtered-count {
    color: var(--text-faint);
    font-size: 0.66rem;
    white-space: nowrap;
  }

  .quick-add {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 6px;
    padding: 8px 4px;
    border-bottom: 1px solid var(--daily-border);
  }

  .quick-add > :global(svg) {
    color: var(--text-muted);
  }

  .quick-add input {
    width: 100%;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }

  .quick-add input:focus {
    border-color: var(--background-modifier-border-focus);
    background: var(--background-primary);
  }

  .quick-add button {
    min-height: 28px;
    padding: 4px 9px;
  }

  .view-hidden {
    display: none;
  }

  .list-header-actions,
  .list-header-actions button {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .normalization-preview {
    margin: 10px;
    border: 1px solid var(--daily-border);
    border-radius: 10px;
    background: var(--daily-soft);
  }

  .normalization-preview > header,
  .normalization-preview > footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
  }

  .normalization-preview > header > div {
    display: grid;
    gap: 2px;
  }

  .normalization-preview small,
  .normalization-preview > footer > span,
  .normalization-clean {
    color: var(--text-muted);
    font-size: 0.7rem;
  }

  .normalization-diagnostics {
    display: grid;
    gap: 5px;
    margin: 0;
    padding: 0 12px 10px;
    list-style: none;
  }

  .normalization-diagnostics li {
    display: grid;
    gap: 2px;
    padding: 7px 9px;
    border-left: 3px solid var(--text-warning);
    background: var(--background-primary);
    font-size: 0.72rem;
  }

  .normalization-diagnostics li.error {
    border-left-color: var(--text-error);
  }

  .normalization-structure {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 0 12px 10px;
  }

  .normalization-structure > section {
    display: grid;
    align-content: start;
    gap: 6px;
    min-width: 0;
    padding: 9px;
    border: 1px solid var(--daily-border);
    border-radius: 7px;
    background: var(--background-primary);
  }

  .normalization-structure > section > strong {
    font-size: 0.72rem;
  }

  .normalization-structure ul {
    display: grid;
    gap: 4px;
    overflow: auto;
    max-height: 150px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .normalization-structure li {
    display: grid;
    min-width: 0;
  }

  .normalization-structure li > span {
    overflow: hidden;
    font-size: 0.7rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .normalization-structure small {
    color: var(--text-muted);
    font-size: 0.62rem;
  }

  .normalization-diff {
    overflow: auto;
    max-height: 240px;
    margin: 0 12px;
    padding: 10px;
    border: 1px solid var(--daily-border);
    border-radius: 7px;
    color: var(--text-normal);
    background: var(--background-primary);
    font-size: 0.68rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .normalization-clean {
    margin: 0;
    padding: 8px 12px;
  }

  .normalization-blocked {
    color: var(--text-error);
    font-size: 0.7rem;
  }

  .plan-group {
    border-bottom: 1px solid var(--daily-border);
  }

  .plan-group:last-child {
    border-bottom: 0;
  }

  .group-heading {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px;
    padding: 5px 4px;
    background: var(--daily-soft);
  }

  .group-heading > button {
    border: 0;
    color: var(--text-muted);
    background: transparent;
  }

  .group-toggle {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 6px;
    text-align: left;
  }

  .group-toggle > span {
    display: grid;
    min-width: 0;
    color: var(--text-normal);
  }

  .group-toggle strong,
  .group-toggle small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-toggle small {
    color: var(--text-muted);
    font-size: 0.65rem;
  }

  .group-toggle em {
    margin-left: auto;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--background-primary);
    font-size: 0.65rem;
    font-style: normal;
  }

  .plan-item {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
    padding: 9px 4px;
    padding-left: calc(4px + var(--task-depth, 0) * 14px);
    border-bottom: 1px solid var(--daily-border);
  }

  .plan-item.current {
    box-shadow: inset 3px 0 0 var(--interactive-accent);
    background: var(--daily-soft);
  }

  .plan-item.completed {
    opacity: 0.65;
  }

  .check-button {
    align-self: start;
    padding: 5px;
    border: 0;
    color: var(--text-muted);
    background: transparent;
  }

  .item-main {
    display: grid;
    gap: 4px;
    min-width: 0;
    padding: 0;
    border: 0;
    color: var(--text-normal);
    background: transparent;
    text-align: left;
  }

  .item-main strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-main small {
    color: var(--text-muted);
    font-size: 0.7rem;
  }

  .item-properties {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .item-properties em,
  .item-properties time {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 5px;
    border-radius: 999px;
    color: var(--text-muted);
    background: var(--daily-soft);
    font-size: 0.61rem;
    font-style: normal;
  }

  .item-properties .priority-high,
  .item-properties .priority-highest {
    color: var(--text-error);
  }

  .item-properties .priority-low,
  .item-properties .priority-lowest {
    color: var(--text-faint);
  }

  .daily-board {
    display: grid;
    grid-template-columns: repeat(3, minmax(180px, 1fr));
    gap: 8px;
    overflow-x: auto;
    padding: 10px;
  }

  .daily-board > section {
    min-width: 0;
    border: 1px solid var(--daily-border);
    border-radius: 9px;
    background: var(--daily-soft);
  }

  .daily-board > section > header,
  .daily-calendar > section > header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 9px;
    border-bottom: 1px solid var(--daily-border);
  }

  .daily-board > section > header span,
  .daily-calendar > section > header span {
    margin-left: auto;
    color: var(--text-muted);
    font-size: 0.65rem;
  }

  .daily-board > section > div {
    display: grid;
    gap: 6px;
    padding: 7px;
  }

  .daily-board > section > div > p {
    margin: 8px;
    color: var(--text-muted);
    font-size: 0.68rem;
    text-align: center;
  }

  .daily-board article {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px;
    padding: 8px;
    border: 1px solid var(--daily-border);
    border-radius: 7px;
    background: var(--daily-raised);
  }

  .daily-board article.current {
    box-shadow: inset 3px 0 0 var(--interactive-accent);
  }

  .daily-board article.completed {
    opacity: 0.62;
  }

  .daily-board article > button:first-child {
    display: grid;
    gap: 4px;
    padding: 0;
    border: 0;
    color: var(--text-normal);
    background: transparent;
    text-align: left;
  }

  .daily-board article small,
  .daily-board article span,
  .daily-board article footer {
    color: var(--text-muted);
    font-size: 0.63rem;
  }

  .daily-board article footer {
    display: flex;
    justify-content: space-between;
    gap: 5px;
  }

  .daily-board article footer em {
    font-style: normal;
  }

  .daily-board article > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .daily-board article > div button {
    padding: 4px;
    color: var(--text-muted);
    background: transparent;
  }

  .daily-table-wrap {
    overflow: auto;
    padding: 8px;
  }

  .daily-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.68rem;
  }

  .daily-table th,
  .daily-table td {
    padding: 7px 8px;
    border-bottom: 1px solid var(--daily-border);
    text-align: left;
    white-space: nowrap;
  }

  .daily-table th {
    color: var(--text-muted);
    background: var(--daily-soft);
    font-weight: 600;
  }

  .daily-table td:first-child {
    min-width: 220px;
    padding-left: calc(8px + var(--task-depth, 0) * 14px);
    white-space: normal;
  }

  .daily-table td button {
    padding: 0;
    border: 0;
    color: var(--text-normal);
    background: transparent;
    text-align: left;
  }

  .daily-table tr.completed {
    opacity: 0.6;
  }

  .daily-calendar {
    display: grid;
    gap: 8px;
    padding: 10px;
  }

  .daily-calendar > section {
    border: 1px solid var(--daily-border);
    border-radius: 9px;
  }

  .daily-calendar > section > div {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 6px;
    padding: 8px;
  }

  .daily-calendar > section > div > button {
    display: grid;
    gap: 3px;
    padding: 8px;
    color: var(--text-normal);
    background: var(--daily-raised);
    text-align: left;
  }

  .daily-calendar > section > div > button.completed {
    opacity: 0.58;
  }

  .daily-calendar small,
  .daily-calendar span {
    color: var(--text-muted);
    font-size: 0.63rem;
  }

  .resolved-target {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 4px;
    color: var(--text-muted);
    font-size: 0.67rem;
  }

  .resolved-target > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resolved-target em {
    flex: none;
    padding: 1px 5px;
    border-radius: 999px;
    color: var(--text-accent);
    background: color-mix(in srgb, var(--interactive-accent) 9%, transparent);
    font-size: 0.62rem;
    font-style: normal;
  }

  .item-topline {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .kind {
    color: var(--text-muted);
    font-size: 0.65rem;
  }

  .flag.minimum {
    color: var(--text-warning);
    background: color-mix(in srgb, var(--color-yellow) 12%, transparent);
  }

  .item-topline time {
    margin-left: auto;
    color: var(--text-muted);
    font-size: 0.65rem;
  }

  .item-actions {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 2px;
  }

  .item-actions button {
    padding: 5px;
    color: var(--text-muted);
    background: transparent;
  }

  .item-more {
    position: relative;
  }

  .item-more > summary {
    display: grid;
    width: 26px;
    height: 26px;
    place-items: center;
    border-radius: 6px;
    color: var(--text-muted);
    cursor: pointer;
    list-style: none;
  }

  .item-more > summary:hover,
  .item-more[open] > summary {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .item-more-menu {
    position: absolute;
    z-index: 20;
    top: 30px;
    right: 0;
    display: grid;
    min-width: 170px;
    padding: 5px;
    border: 1px solid var(--daily-border);
    border-radius: 8px;
    background: var(--background-primary);
    box-shadow: var(--shadow-s);
  }

  .item-more-menu button {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 7px;
    width: 100%;
    padding: 6px 8px;
    border: 0;
    color: var(--text-normal);
    background: transparent;
    text-align: left;
  }

  .item-more-menu button:hover {
    background: var(--background-modifier-hover);
  }

  .item-more-menu button.danger {
    color: var(--text-error);
  }

  .policy-select {
    grid-column: 2;
    justify-self: start;
    width: auto;
    height: 27px;
    font-size: 0.68rem;
  }

  .timing-panel {
    grid-column: 1 / -1;
    margin: 2px 0 0 32px;
    border: 1px solid var(--daily-border);
    border-radius: 8px;
    background: var(--background-primary);
  }

  .timing-panel > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.7rem;
    list-style: none;
  }

  .timing-panel > summary > span,
  .timing-panel > summary > span:first-child {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .timing-panel > summary em {
    padding: 1px 5px;
    border-radius: 999px;
    background: var(--daily-soft);
    font-size: 0.62rem;
    font-style: normal;
  }

  .timing-panel > summary em.review {
    color: var(--text-warning);
  }

  .timing-content {
    display: grid;
    gap: 9px;
    padding: 10px;
    border-top: 1px solid var(--daily-border);
  }

  .timing-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }

  .timing-metrics > span {
    display: grid;
    gap: 2px;
    padding: 7px;
    border-radius: 7px;
    background: var(--daily-soft);
  }

  .timing-metrics small {
    color: var(--text-muted);
    font-size: 0.62rem;
  }

  .timing-metrics strong {
    font-size: 0.72rem;
  }

  .timing-review {
    margin: 0;
    padding: 7px 9px;
    border-left: 3px solid var(--text-warning);
    color: var(--text-muted);
    background: var(--daily-soft);
    font-size: 0.7rem;
  }

  .timing-actions,
  .timing-actions button {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .timer-history h4 {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 0 0 5px;
    font-size: 0.72rem;
  }

  .timer-history ol {
    display: grid;
    gap: 3px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .timer-history li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 7px;
    color: var(--text-muted);
    font-size: 0.66rem;
  }

  .timer-history time {
    color: var(--text-normal);
  }

  .timing-correction {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
    align-items: end;
    gap: 6px;
    padding-top: 8px;
    border-top: 1px solid var(--daily-border);
  }

  .timing-correction label {
    display: grid;
    gap: 3px;
    color: var(--text-muted);
    font-size: 0.65rem;
  }

  .timing-correction .wide {
    grid-column: 1 / 3;
  }

  .inline-editor {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-column: 1 / -1;
    gap: 8px;
    padding: 10px;
    border-radius: 9px;
    background: var(--daily-soft);
  }

  .inline-editor .wide,
  .inline-actions {
    grid-column: 1 / -1;
  }

  .inline-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }

  .daily-empty {
    display: grid;
    justify-items: center;
    gap: 5px;
    padding: 28px 14px;
    color: var(--text-muted);
    text-align: center;
  }

  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin-top: 4px;
  }

  .empty-actions button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .preview-column {
    min-width: 0;
  }

  .eink-card > header span {
    font-weight: 700;
  }

  .eink-card > header small {
    color: var(--text-muted);
  }

  .preview-tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    padding: 5px;
    background: var(--daily-soft);
  }

  .preview-tabs button {
    border: 0;
    color: var(--text-muted);
    background: transparent;
    font-size: 0.7rem;
  }

  .preview-tabs button.active {
    color: var(--text-normal);
    background: var(--daily-raised);
  }

  .eink-screen {
    display: flex;
    flex-direction: column;
    min-height: 280px;
    padding: 16px;
    color: #151515;
    background: #f4f2e9;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .eink-meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid #777;
    padding-bottom: 7px;
    font-size: 0.7rem;
  }

  .eink-screen h4 {
    margin: 14px 0 8px;
    font-size: 1rem;
  }

  .eink-screen p {
    margin: 5px 0;
    font-size: 0.8rem;
  }

  .eink-screen small {
    color: #555;
    font-size: 0.68rem;
  }

  .eink-current {
    font-weight: 700;
  }

  .eink-next {
    color: #333;
  }

  .eink-target {
    overflow: hidden;
    padding-bottom: 5px;
    border-bottom: 1px dotted #999;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .eink-timing {
    margin-top: auto !important;
    padding: 6px 0;
    border-top: 1px solid #999;
    font-weight: 700;
  }

  .eink-empty,
  .eink-placeholder {
    display: grid;
    flex: 1;
    place-items: center;
    color: #555;
    text-align: center;
  }

  .eink-screen footer {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid #777;
    font-size: 0.68rem;
  }

  .preview-actions {
    display: flex;
    gap: 6px;
    padding: 10px;
  }

  .review-card > summary {
    cursor: pointer;
    list-style: none;
  }

  .review-card[open] > summary {
    border-bottom: 1px solid var(--daily-border);
  }

  .review-card[open] > summary :global(svg:last-child) {
    transform: rotate(180deg);
  }

  .daily-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    padding: 12px;
  }

  .daily-metrics article {
    display: grid;
    gap: 2px;
    padding: 11px;
    border-radius: 9px;
    background: var(--daily-soft);
  }

  .daily-metrics span,
  .daily-metrics small {
    color: var(--text-muted);
    font-size: 0.7rem;
  }

  .daily-metrics strong {
    font-size: 1.3rem;
  }

  .daily-metrics strong.negative {
    color: var(--text-error);
  }

  .summary-card {
    margin: 0 12px 12px;
    border: 1px solid var(--daily-border);
    border-radius: 10px;
  }

  .summary-card > header > span {
    padding: 3px 7px;
    border-radius: 999px;
    color: var(--text-muted);
    background: var(--daily-soft);
    font-size: 0.68rem;
  }

  .summary-card > header > span.ai {
    color: var(--text-accent);
  }

  .summary-text {
    display: grid;
    gap: 5px;
    padding: 13px 14px;
  }

  .summary-text span {
    color: var(--text-muted);
    font-size: 0.78rem;
  }

  .summary-card > footer {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 14px;
    border-top: 1px solid var(--daily-border);
  }

  @media (min-width: 1100px) {
    .daily-main-grid.preview-open {
      grid-template-columns: minmax(0, 1.45fr) minmax(280px, 0.72fr);
    }
  }

  @media (max-width: 860px) {

    .planning-fields,
    .daily-metrics,
    .timing-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .daily-board {
      grid-template-columns: repeat(3, minmax(210px, 1fr));
    }

    .pool-create-form {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .pool-grid {
      grid-template-columns: repeat(2, minmax(210px, 1fr));
    }
  }

  @media (max-width: 560px) {
    .surface-switcher {
      display: grid;
      width: 100%;
      grid-template-columns: repeat(3, 1fr);
    }

    .surface-switcher button {
      justify-content: center;
    }

    .day-switcher {
      flex-wrap: wrap;
    }

    .source-state {
      order: 3;
      width: 100%;
      margin-left: 0;
    }

    .source-state strong,
    .source-state small {
      max-width: none;
    }

    .dashboard-view-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .quick-add {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }

    .quick-add > button:first-of-type {
      display: none;
    }

    .view-switcher {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
    }

    .view-switcher button {
      justify-content: center;
    }

    .category-filter {
      margin-left: 0;
    }

    .category-filter select {
      flex: 1;
    }

    .source-button {
      margin-left: 0;
    }

    .focus-current {
      grid-template-columns: 1fr;
    }

    .planning-fields,
    .daily-metrics,
    .inline-editor,
    .timing-metrics,
    .timing-correction,
    .normalization-structure {
      grid-template-columns: 1fr;
    }

    .pool-create-form,
    .pool-grid,
    .pool-picker-list {
      grid-template-columns: 1fr;
    }

    .task-pool-heading,
    .pool-toolbar,
    .planner-pool-picker > header {
      align-items: stretch;
      flex-direction: column;
    }

    .due-field {
      grid-column: 1;
    }

    .planning-footer {
      align-items: stretch;
      flex-direction: column;
    }

    .planning-footer .primary {
      justify-content: center;
      margin-left: 0;
    }

    .theme-editor {
      grid-template-columns: 1fr;
    }

    .plan-item {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .item-actions {
      grid-column: 2;
    }

    .inline-editor .wide,
    .inline-actions,
    .timing-correction .wide {
      grid-column: 1;
    }

    .list-header-actions {
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .timing-panel {
      margin-left: 0;
    }
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }
</style>
