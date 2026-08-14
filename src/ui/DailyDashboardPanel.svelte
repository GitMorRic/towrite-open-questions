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
    EyeOff,
    LayoutList,
    ListTodo,
    MoreHorizontal,
    MonitorUp,
    PanelTopOpen,
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
    Target,
    Trash2,
    Undo2
  } from "lucide-svelte";
  import { onDestroy, onMount, tick } from "svelte";
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
    DailyAnalyticsRange,
    DailyMonthlySummary,
    DailyPlanningCandidate,
    DailyPlanPriority,
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
    filterAvailableTaskPoolItems,
    filterDailyItemsByCategory,
    groupDailyItems,
    groupPreviousDailyItems,
    isDailyItemComplete,
    selectDailyOverview,
    type DailyPlanningDay
  } from "./daily-dashboard-state";
  import WorkPoolPanel from "./WorkPoolPanel.svelte";
  import { dailyDisplayText } from "../daily/display-text";
  import { dailyMigrationSelectionKey } from "../daily/migration";

  export let dailyApi: DailyDashboardAdapter | undefined = undefined;
  export let onOpenCapture: (() => void) | undefined = undefined;
  export let onOpenFloatingToday: (() => void) | undefined = undefined;
  export let onOpenWorkPool: (() => void) | undefined = undefined;
  export let workspaceMode = false;
  export let onSurfaceChange: ((surface: "today" | "pool" | "review") => void) | undefined = undefined;
  export let initialSurface: "today" | "pool" | "review" = "today";
  export let focusPreviousMigration = false;
  let previousMigrationCard: HTMLDetailsElement | undefined;
  let previousMigrationFocused = false;

  interface DailyProjectProgressSegment {
    id: string;
    label: string;
    color: string;
    items: DailyPlanItemPresentation[];
    done: number;
  }

  let surface: "today" | "pool" | "review" = initialSurface;
  let planningDay: DailyPlanningDay = "today";
  let selectedDate = dailyDateForPlanningDay(planningDay);
  let snapshot: DailyDashboardSnapshot | undefined;
  let metadata: DailyPlanMetadataPresentation = {};
  let candidates: DailyPlanningCandidate[] = [];
  let configuration: DailyDashboardConfiguration = {
    categoryPresets: [],
    defaultView: "list",
    focusMessages: [],
    focusMessageIntervalSeconds: 30,
    taskPoolPath: "Planning/Task Pool.md",
    autoReturnUnfinished: true
  };
  let configurationLoaded = false;
  let taskPool: TaskPoolDocument | undefined;
  let poolPickerSearch = "";
  let loading = true;
  let error = "";
  let busy = "";
  let plannerExpanded = false;
  let previewExpanded = workspaceMode;
  let candidatesExpanded = false;
  let previewItemId = "";
  let previewPage: "overview" | "item" | "inbox" = "overview";
  let previewInboxIndex = 0;
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
  let originStageByItem: Record<string, string> = {};
  let editingProgressProjectId = "";
  let editingProgressProjectLabel = "";
  let editingProgressProjectColor = "#7c6ee6";
  let projectColorInput: HTMLInputElement | undefined;
  let hoveredProgressProjectId = "";
  let pinnedProgressProjectId = "";
  let projectColorPopover: HTMLElement | undefined;
  let previousUnfinished: DailyPlanItem[] = [];
  let selectedPreviousIds = new Set<string>();
  let previewPreviousItemId = "";
  let analyticsRange: DailyAnalyticsRange | undefined;
  let monthlySummary: DailyMonthlySummary | undefined;
  let unsubscribe: (() => void) | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshSequence = 0;
  let refreshPromise: Promise<void> | undefined;
  let refreshQueued = false;
  let queuedRefreshDate: string | undefined;

  function switchSurface(next: "today" | "pool" | "review"): void {
    surface = next;
    onSurfaceChange?.(next);
    if (next === "review") void loadAnalytics();
  }

  async function loadAnalytics(): Promise<void> {
    if (!dailyApi) return;
    const month = selectedDate.slice(0, 7);
    const [range, monthly] = await Promise.all([
      dailyApi.getAnalyticsRange?.(selectedDate, selectedDate),
      dailyApi.getMonthlySummary?.(month)
    ]);
    analyticsRange = range;
    monthlySummary = monthly;
  }

  function togglePreviousSelection(item: DailyPlanItem): void {
    const key = dailyMigrationSelectionKey(item);
    const next = new Set(selectedPreviousIds);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selectedPreviousIds = next;
  }

  async function migrateSelectedPrevious(): Promise<void> {
    const selected = previousUnfinished.filter((item) => selectedPreviousIds.has(dailyMigrationSelectionKey(item)));
    if (!selected.length || !dailyApi?.migratePreviousItems) return;
    await run("migrate-previous", () => dailyApi?.migratePreviousItems?.(
      selectedDate,
      selected.map((item) => ({ id: item.id, revision: item.revision }))
    ));
  }

  async function dismissPreviousItem(item: DailyPlanItem): Promise<void> {
    if (!dailyApi?.dismissPreviousItem) return;
    await run(`dismiss-previous:${item.id}`, () => dailyApi?.dismissPreviousItem?.(
      selectedDate,
      item.id,
      item.revision
    ));
  }

  function closeProjectColorPopover(): void {
    editingProgressProjectId = "";
    editingProgressProjectLabel = "";
  }

  function handleWindowPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (editingProgressProjectId) {
      if (!(target instanceof Node && projectColorPopover?.contains(target))) {
        closeProjectColorPopover();
      }
    }
    if (!pinnedProgressProjectId || !(target instanceof Element)) return;
    if (target.closest(".battery-project, .project-progress-legend, .project-progress-details")) return;
    hoveredProgressProjectId = "";
    pinnedProgressProjectId = "";
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    closeProjectColorPopover();
    hoveredProgressProjectId = "";
    pinnedProgressProjectId = "";
  }

  function timingFor(item: DailyPlanItem): DailyTaskTimingSnapshot | undefined {
    return timingByItem[item.id] ?? item.timing;
  }

  function primaryTimerAction(item: DailyPlanItem): "start" | "pause" | "resume" {
    const status = timingFor(item)?.status;
    if (status === "running") return "pause";
    if (status === "paused") return "resume";
    return "start";
  }

  function primaryTimerLabel(item: DailyPlanItem): string {
    const action = primaryTimerAction(item);
    return action === "pause" ? "暂停计时" : action === "resume" ? "继续计时" : "开始专注";
  }

  function focusActionLabel(item: DailyPlanItem): string {
    const status = timingFor(item)?.status;
    if (status === "running") return "暂停计时";
    if (status === "paused") return "继续计时";
    return "开始计时";
  }

  onMount(() => {
    unsubscribe = dailyApi?.subscribe?.(() => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void refresh();
      }, 80);
    });
    void refresh();
  });
  onDestroy(() => {
    if (refreshTimer) clearTimeout(refreshTimer);
    unsubscribe?.();
  });

  $: selectedDate = dailyDateForPlanningDay(planningDay);
  $: previousMigrationGroups = groupPreviousDailyItems(previousUnfinished);
  $: items = (snapshot?.plan.items ?? []) as DailyPlanItemPresentation[];
  $: overview = selectDailyOverview(items);
  $: todoItems = items.filter((item) => !isDailyItemComplete(item) && item.status === "todo");
  $: inProgressItems = items.filter((item) => !isDailyItemComplete(item) && item.status === "in-progress");
  $: doneItems = items.filter(isDailyItemComplete);
  $: categories = dailyCategories(items);
  $: categoryChoices = [...new Set([
    ...configuration.categoryPresets.map((preset) => preset.label),
    ...categories,
    ...(taskPool?.items.map((item) => item.category).filter((value): value is string => Boolean(value)) ?? [])
  ])];
  $: poolItems = taskPool?.items ?? [];
  $: poolTaskById = new Map(poolItems.map((item) => [item.taskId, item]));
  $: projectProgress = buildDailyProjectProgress(
    items,
    poolTaskById,
    configuration.workPool?.projectAppearances ?? []
  );
  $: inspectedProgressProject = projectProgress.find((segment) =>
    segment.id === (hoveredProgressProjectId || pinnedProgressProjectId)
  );
  $: availablePoolItems = filterAvailableTaskPoolItems(poolItems);
  $: visiblePoolPickerItems = filterAvailableTaskPoolItems(poolItems, poolPickerSearch);
  $: otherCandidates = candidates.filter((candidate) => candidate.source !== "pool");
  $: filteredItems = filterDailyItemsByCategory(items, selectedCategory);
  $: groupedItems = groupDailyItems(filteredItems, hierarchy, items);
  $: unnormalizedTaskCount = hierarchy?.tasks.filter((task) => task.normalizationRequired).length ?? 0;
  $: boardColumns = [
    { status: "todo" as const, label: "待办", items: filteredItems.filter((item) => !isDailyItemComplete(item) && item.status === "todo") },
    { status: "in-progress" as const, label: "进行中", items: filteredItems.filter((item) => !isDailyItemComplete(item) && item.status === "in-progress") },
    { status: "done" as const, label: "已完成", items: filteredItems.filter(isDailyItemComplete) }
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
          status: isDailyItemComplete(item) ? "done" : item.status,
          taskRevision: item.revision.value,
          primary: Boolean(item.primary),
          minimum: Boolean(item.minimum),
          goal: item.goal,
          nextStep: item.nextStep,
          estimateMinutes: item.estimateMinutes,
          target: item.target,
          startedAt: item.startedAt,
          groupLabel: dailyGroupLabel(item.lineage?.groups.at(-1)),
          projectId: normalizedProjectId(dailyProjectLabel(item, poolTaskById)),
          projectLabel: dailyProjectLabel(item, poolTaskById),
          projectColor: projectColorForId(normalizedProjectId(dailyProjectLabel(item, poolTaskById))),
          targetLabel: item.targetResolution?.displayLabel,
          targetProvenance: item.targetResolution?.source,
          lineageRevision: item.lineageRevision,
          timing: timingForDeck(timingFor(item))
        })),
        inboxItems: otherCandidates.slice(0, 12).map((candidate) => ({
          id: candidate.id,
          source: candidate.source === "inbox" ? "inbox" as const : "rule" as const,
          title: candidate.title,
          detail: candidate.description,
          reason: candidateSourceLabel(candidate.source)
        })),
        batteryPercent: configuration.deviceBatteryPercent
      })
    : undefined;
  $: previewTaskCard = deck?.planItems.find((card) => card.item.id === previewItem?.id)
    ?? deck?.planItems[0];
  $: previewInboxCard = deck?.inboxItems[Math.min(previewInboxIndex, Math.max(0, (deck?.inboxItems.length ?? 1) - 1))]
    ?? deck?.activeInboxItem;
  function buildDailyProjectProgress(
    planItems: DailyPlanItemPresentation[],
    poolById: Map<string, TaskPoolItem>,
    appearances: Array<{ projectId: string; color: string }>
  ): DailyProjectProgressSegment[] {
    const byProject = new Map<string, DailyProjectProgressSegment>();
    const appearanceById = new Map(appearances.map((appearance) => [appearance.projectId, appearance]));
    for (const item of planItems) {
      const label = dailyProjectLabel(item, poolById);
      const id = normalizedProjectId(label);
      const existing = byProject.get(id);
      if (existing) {
        existing.items.push(item);
        if (isDailyItemComplete(item)) existing.done += 1;
        continue;
      }
      byProject.set(id, {
        id,
        label,
        color: appearanceById.get(id)?.color?.trim() || projectFallbackColor(id),
        items: [item],
        done: isDailyItemComplete(item) ? 1 : 0
      });
    }
    return [...byProject.values()];
  }

  function dailyProjectLabel(item: DailyPlanItemPresentation, poolById: Map<string, TaskPoolItem>): string {
    const explicit = item.taskRef ? poolById.get(item.taskRef)?.project : undefined;
    const lineageGroup = item.lineage?.groups.at(-1);
    const lineage = lineageGroup ? dailyGroupLabel(lineageGroup) : undefined;
    return cleanProjectLabel(explicit) || cleanProjectLabel(lineage) || dailyItemCategory(item) || "未分类";
  }

  function cleanProjectLabel(value: string | undefined): string {
    return String(value ?? "")
      .trim()
      .replace(/^\[\[/u, "")
      .replace(/\]\]$/u, "")
      .split("|")[0]
      .trim();
  }

  function normalizedProjectId(value: string): string {
    return value.trim().toLocaleLowerCase()
      .replace(/^#+/u, "")
      .replace(/[\\/\s]+/gu, "-")
      .replace(/[^\p{Letter}\p{Number}_-]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 100) || "unclassified";
  }

  function projectFallbackColor(value: string): string {
    // Stable defaults keep projects distinguishable before the colour editor
    // is opened, without persisting derived settings merely by viewing Today.
    const palette = ["#6657d9", "#237db8", "#16845b", "#c96812", "#c43f61", "#657d20", "#914bb5", "#247f91"];
    let hash = 0;
    for (const character of value) hash = ((hash << 5) - hash + character.codePointAt(0)!) | 0;
    return palette[Math.abs(hash) % palette.length];
  }

  function projectColorForId(projectId: string): string {
    return configuration.workPool?.projectAppearances.find((appearance) => appearance.projectId === projectId)?.color?.trim()
      || projectFallbackColor(projectId);
  }

  async function beginProgressProjectColor(
    segment: DailyProjectProgressSegment,
    event: MouseEvent | KeyboardEvent
  ): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    hoveredProgressProjectId = "";
    pinnedProgressProjectId = "";
    editingProgressProjectId = segment.id;
    editingProgressProjectLabel = segment.label;
    editingProgressProjectColor = segment.color;
    await tick();
    projectColorInput?.focus();
  }

  function handleProgressProjectKeydown(
    segment: DailyProjectProgressSegment,
    event: KeyboardEvent
  ): void {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    void beginProgressProjectColor(segment, event);
  }

  async function saveProgressProjectColor(): Promise<void> {
    if (!editingProgressProjectId || !dailyApi?.updateWorkPoolSettings) return;
    const current = configuration.workPool?.projectAppearances ?? [];
    const existing = current.find((appearance) => appearance.projectId === editingProgressProjectId);
    const projectAppearances = [
      ...current.filter((appearance) => appearance.projectId !== editingProgressProjectId),
      {
        projectId: editingProgressProjectId,
        color: editingProgressProjectColor,
        icon: existing?.icon ?? "folder-kanban"
      }
    ];
    await run("project-color", async () => {
      await dailyApi?.updateWorkPoolSettings?.({ projectAppearances });
      editingProgressProjectId = "";
      editingProgressProjectLabel = "";
    });
  }

  async function switchDay(day: DailyPlanningDay): Promise<void> {
    if (planningDay === day) return;
    planningDay = day;
    previewItemId = "";
    previewPage = "overview";
    editingItemId = "";
    await refresh(dailyDateForPlanningDay(day));
  }

  async function refreshSupplemental(
    sequence: number,
    date: string,
    authoritativeSnapshot: DailyDashboardSnapshot
  ): Promise<void> {
    const [metadataResult, candidatesResult, hierarchyResult, configurationResult, taskPoolResult] = await Promise.allSettled([
      dailyApi?.getPlanMetadata?.(date) ?? Promise.resolve({}),
      workspaceMode || candidatesExpanded
        ? dailyApi?.listPlanningCandidates?.(date) ?? Promise.resolve([])
        : Promise.resolve(candidates),
      dailyApi?.getPlanHierarchy?.(date) ?? Promise.resolve(undefined),
      dailyApi?.getConfiguration?.() ?? Promise.resolve(configuration),
      dailyApi?.getTaskPool?.() ?? Promise.resolve(undefined)
    ]);
    if (sequence !== refreshSequence) return;
    if (metadataResult.status === "fulfilled") {
      metadata = metadataResult.value;
      themeDraft = metadata.theme ?? "";
    }
    if (candidatesResult.status === "fulfilled") candidates = candidatesResult.value;
    if (hierarchyResult.status === "fulfilled") hierarchy = hierarchyResult.value;
    if (taskPoolResult.status === "fulfilled") taskPool = taskPoolResult.value;
    if (configurationResult.status === "fulfilled") {
      configuration = configurationResult.value;
      if (!configurationLoaded) {
        dashboardView = workspaceMode ? "list" : configuration.defaultView;
        configurationLoaded = true;
      }
    }

    // Provisional tasks have no persisted id yet. Asking the timer ledger for
    // them can never succeed and used to leave the Today page waiting on a
    // sequence of avoidable failures during its first render.
    const missingTiming = authoritativeSnapshot.plan.items.filter((item) => !item.timing && !item.provisional);
    if (dailyApi?.getItemTiming && missingTiming.length > 0) {
      const entries = await Promise.all(missingTiming.map(async (item) => {
        try {
          return [item.id, await dailyApi!.getItemTiming!(item.id, item.estimateMinutes, date)] as const;
        } catch {
          return [item.id, undefined] as const;
        }
      }));
      if (sequence === refreshSequence) {
        timingByItem = {
          ...timingByItem,
          ...Object.fromEntries(entries.filter((entry): entry is readonly [string, DailyTaskTimingSnapshot] => Boolean(entry[1])))
        };
      }
    }
  }

  function showProgressProjectDetails(segment: DailyProjectProgressSegment): void {
    hoveredProgressProjectId = segment.id;
  }

  function hideProgressProjectDetails(segment: DailyProjectProgressSegment): void {
    if (hoveredProgressProjectId === segment.id) hoveredProgressProjectId = "";
  }

  function toggleProgressProjectDetails(segment: DailyProjectProgressSegment, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    closeProjectColorPopover();
    const wasPinned = pinnedProgressProjectId === segment.id;
    pinnedProgressProjectId = wasPinned ? "" : segment.id;
    // Clicking an already-pinned project is an explicit close request. Do not
    // let the same pointer/focus state immediately reopen its transient detail.
    hoveredProgressProjectId = wasPinned ? "" : segment.id;
  }

  function progressProjectTodoCount(segment: DailyProjectProgressSegment): number {
    return segment.items.filter((item) => !isDailyItemComplete(item) && item.status === "todo").length;
  }

  function progressProjectActiveCount(segment: DailyProjectProgressSegment): number {
    return segment.items.filter((item) => !isDailyItemComplete(item) && item.status === "in-progress").length;
  }

  async function refreshPreviousItems(sequence: number, date: string): Promise<void> {
    if (planningDay !== "today" || !dailyApi?.getPreviousUnfinished) {
      if (sequence === refreshSequence) {
        previousUnfinished = [];
        selectedPreviousIds = new Set();
      }
      return;
    }
    try {
      const previous = await dailyApi.getPreviousUnfinished(date);
      if (sequence !== refreshSequence) return;
      previousUnfinished = previous;
      const available = new Set(previous.map(dailyMigrationSelectionKey));
      selectedPreviousIds = new Set([...selectedPreviousIds].filter((key) => available.has(key)));
      if (focusPreviousMigration && previous.length > 0 && !previousMigrationFocused) {
        previousMigrationFocused = true;
        await tick();
        previousMigrationCard?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch {
      // Historical carry-over is optional enrichment. It must never block Today.
    }
  }

  async function performRefresh(dateOverride?: string): Promise<void> {
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
      return;
    }
    loading = true;
    error = "";
    try {
      const nextSnapshot = await dailyApi.getSnapshot(date);
      if (sequence !== refreshSequence) return;
      snapshot = nextSnapshot;
      timingByItem = Object.fromEntries(nextSnapshot.plan.items
        .filter((item): item is DailyPlanItem & { timing: DailyTaskTimingSnapshot } => Boolean(item.timing))
        .map((item) => [item.id, item.timing]));
      timerEventsByItem = Object.fromEntries(
        Object.entries(timerEventsByItem).filter(([itemId]) =>
          nextSnapshot?.plan.items.some((item) => item.id === itemId)
        )
      );
      if (previewItemId && !snapshot?.plan.items.some((item) => item.id === previewItemId)) {
        previewItemId = "";
      }
      loading = false;
      void refreshSupplemental(sequence, date, nextSnapshot);
      void refreshPreviousItems(sequence, date);
    } catch (cause) {
      if (sequence !== refreshSequence) return;
      error = messageForError(cause);
    } finally {
      if (sequence === refreshSequence) loading = false;
    }
  }

  function refresh(dateOverride?: string): Promise<void> {
    refreshQueued = true;
    if (dateOverride) queuedRefreshDate = dateOverride;
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      while (refreshQueued) {
        refreshQueued = false;
        const requestedDate = queuedRefreshDate;
        queuedRefreshDate = undefined;
        await performRefresh(requestedDate);
      }
    })().finally(() => {
      refreshPromise = undefined;
      // A subscriber can enqueue work between the final loop check and the
      // promise cleanup. Drain it in a new microtask instead of leaving the UI
      // stuck on its previous loading state.
      if (refreshQueued) void refresh();
    });
    return refreshPromise;
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
    return items.filter((candidate) => candidate.parentTaskId === item.id
      || (!candidate.parentTaskId
        && candidate.parentTaskLine === item.line
        && candidate.sourcePath === item.sourcePath));
  }

  async function toggleDailyCompletion(item: DailyPlanItemPresentation): Promise<void> {
    if (item.status === "done") {
      await run(`reopen:${item.id}`, () => dailyApi?.reopenItem?.(item.id, item.revision));
      return;
    }
    const unfinishedChildren = directChildTasks(item).filter((child) => !isDailyItemComplete(child));
    if (
      unfinishedChildren.length > 0
      && !window.confirm(`还有 ${unfinishedChildren.length} 个直接子任务未完成。仍要完成父任务吗？`)
    ) {
      return;
    }
    await run(`complete:${item.id}`, () => dailyApi?.completeItem?.(item.id, item.revision));
  }

  async function completeWithOrigin(item: DailyPlanItemPresentation): Promise<void> {
    if (!dailyApi?.completeItemAndApplyOrigin) return;
    const stageId = item.workKind === "note" || item.workKind === "inbox"
      ? originStageByItem[item.id]
      : undefined;
    if ((item.workKind === "note" || item.workKind === "inbox") && !stageId) {
      error = "先选择要推进到的 Workflow 阶段。";
      return;
    }
    await run(`complete-origin:${item.id}`, () =>
      dailyApi?.completeItemAndApplyOrigin?.(item.id, item.revision, { stageId })
    );
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

  async function assignPoolTask(item: TaskPoolItem, day: DailyPlanningDay): Promise<void> {
    if (!dailyApi?.assignPoolTask) return;
    const date = dailyDateForPlanningDay(day);
    switchSurface("today");
    planningDay = day;
    await run(
      `pool:assign:${item.taskId}`,
      () => dailyApi?.assignPoolTask?.(item.taskId, item.revision, date),
      date
    );
  }

  function closeItemPopovers(source?: EventTarget | null): void {
    const element = source instanceof HTMLElement ? source : null;
    const row = element?.closest(".plan-item");
    row?.querySelectorAll<HTMLDetailsElement>(".item-more[open]").forEach((details) => {
      details.open = false;
    });
  }

  function beginEdit(item: DailyPlanItem, event?: Event): void {
    closeItemPopovers(event?.currentTarget);
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
    if (!item) return;
    await transitionTimer(item, primaryTimerAction(item));
  }

  async function makeCurrent(item: DailyPlanItem): Promise<void> {
    await transitionTimer(item, primaryTimerAction(item));
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
    const timing = timingFor(item);
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
      expectedTimingRevision: timingFor(item)?.timingRevision ?? ""
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

  function handleItemMenuToggle(itemId: string, event: Event, loadTiming = false): void {
    const details = event.currentTarget as HTMLDetailsElement;
    if (!details.open) return;
    const row = details.closest(".plan-item");
    row?.querySelectorAll<HTMLDetailsElement>(".item-more[open]").forEach((candidate) => {
      if (candidate !== details) candidate.open = false;
    });
    if (loadTiming) void loadTimerEvents(itemId, event);
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
      pool: "工作池",
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

  function targetDisplayLabel(item: DailyPlanItem): string {
    return item.targetResolution?.displayLabel
      || item.target
      || item.linkedNotes[0]
      || `${item.sourcePath}#^${item.blockId}`;
  }

  function summaryCategory(item: DailyPlanItem): string | undefined {
    const value = dailyItemCategory(item).trim();
    if (!value || value === "任务" || value === "未分类") return undefined;
    const group = item.lineage?.groups.at(-1)?.text?.trim();
    return group && compactTaskText(group) === compactTaskText(value) ? undefined : value;
  }

  function userFacingTargetLabel(item: DailyPlanItem): string | undefined {
    if (item.targetResolution?.source === "task-block" || item.targetResolution?.source === "dashboard") {
      return undefined;
    }
    const value = item.targetResolution?.displayLabel || item.target || item.linkedNotes[0];
    if (!value || /(?:^|[#^])daily_[a-z0-9_-]+$/iu.test(value.trim())) return undefined;
    return compactTaskText(value);
  }

  function compactTaskText(value: string): string {
    return dailyDisplayText(value);
  }

  function normalizationDiagnosticLabel(
    diagnostic: DailyPlanNormalizationPreview["diagnostics"][number]
  ): string {
    if (diagnostic.code === "broken-target") {
      return `链接目标未找到：${diagnostic.target || "请检查原文链接"}`;
    }
    if (diagnostic.code === "unsafe-target") {
      return `链接目标不安全：${diagnostic.target || "请检查原文链接"}`;
    }
    if (diagnostic.code === "duplicate-block-id") return "任务标识重复，需要先修复";
    if (diagnostic.code === "multiple-block-ids") return "同一任务包含多个标识，需要先修复";
    return diagnostic.message;
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
    source: "action" | "explicit" | "task-link" | "ancestor-link" | "task-block" | "dashboard"
  ): string {
    return {
      action: "命名动作",
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

  function formatAnalyticsDuration(milliseconds: number): string {
    const minutes = Math.max(0, Math.round(milliseconds / 60_000));
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
  }

  function formatAnalyticsClock(value: string | undefined): string {
    if (!value) return "—";
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return "—";
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(timestamp));
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
    const value = cause instanceof Error ? cause.message : String(cause);
    if (value.includes("missing-block-id")) {
      return "有新写入的待办还没有稳定标识。已跟踪的任务仍可开始；请刷新，或在“整理任务”中补齐新任务标识。";
    }
    if (value.includes("historical Daily task changed")) {
      return "原日记任务在迁移列表打开后发生了变化。列表已刷新，请重新选择后再迁移。";
    }
    if (value.includes("Daily plan item id is already used")) {
      return "目标日期已有同一稳定任务，但内容不同，未自动覆盖。请先核对目标日记。";
    }
    return value;
  }
</script>

<svelte:window on:pointerdown|capture={handleWindowPointerDown} on:keydown={handleWindowKeydown} />

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

    {#if !workspaceMode}
    <nav class="surface-switcher" aria-label="每日工作区">
      <button type="button" class:active={surface === "today"} on:click={() => switchSurface("today")}>
        <CalendarDays size={14} />今日
      </button>
      <button type="button" class:active={surface === "pool"} on:click={() => switchSurface("pool")}>
        <ListTodo size={14} />工作池
        <em>{poolItems.filter((item) => item.state === "pool" || item.state === "returned").length}</em>
      </button>
      <button type="button" class:active={surface === "review"} on:click={() => switchSurface("review")}>
        <BarChart3 size={14} />复盘
      </button>
      {#if onOpenFloatingToday}
        <button class="surface-utility" type="button" on:click={() => onOpenFloatingToday?.()}>
          <PanelTopOpen size={14} />悬浮今日
        </button>
      {/if}
    </nav>
    {/if}

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
      {#if workspaceMode}
        <details class="source-utility">
          <summary><BookOpen size={14} />Markdown</summary>
          <div>
            <strong>{metadata.sourcePath || "计划来源"}</strong>
            <small>{metadata.sourceExists === false ? "文件尚未创建" : "与工作台双向同步"}</small>
            {#if configuration.dailyNoteIntegration?.source === "obsidian"}
              <small>跟随 Obsidian 日记 · {configuration.dailyNoteIntegration.folder}/{configuration.dailyNoteIntegration.format}.md</small>
              {#if configuration.dailyNoteIntegration.template && !configuration.dailyNoteIntegration.templateExists}
                <small class="source-warning">核心日记模板不存在：{configuration.dailyNoteIntegration.template}</small>
              {/if}
            {/if}
            {#if metadata.sourceExists === false && dailyApi.ensurePlanSource}<button type="button" on:click={() => run("ensure-source", () => dailyApi?.ensurePlanSource?.(selectedDate))}>创建计划页</button>{/if}
            {#if dailyApi.openPlanSource}<button type="button" disabled={metadata.sourceExists === false} on:click={() => dailyApi?.openPlanSource?.(selectedDate)}>打开原文</button>{/if}
            {#if dailyApi.openPlanSettings}<button type="button" on:click={() => dailyApi?.openPlanSettings?.()}>更改来源</button>{/if}
          </div>
        </details>
      {:else}
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
      {/if}
    </nav>

    {#if planningDay === "today" && previousUnfinished.length > 0 && dailyApi.migratePreviousItems}
      <details class="previous-tasks-card" bind:this={previousMigrationCard} open>
        <summary>
          <span><History size={15} /><strong>处理之前未完成</strong><small>更早日记中有 {previousUnfinished.length} 项可迁移；请勾选需要的任务，原日记会保留迁移记录</small></span>
          <ChevronDown size={15} />
        </summary>
        <div class="previous-task-list">
          {#each previousMigrationGroups as dateGroup (dateGroup.date)}
            <details class="previous-date-group" open>
              <summary>
                <span><CalendarDays size={14} /><strong>{dateGroup.date}</strong><em>{dateGroup.count} 项</em></span>
                <span class="previous-date-actions">
                  {#if dailyApi.openPlanSource}
                    <button
                      type="button"
                      title="打开这天的日记"
                      on:click|stopPropagation={() => dailyApi?.openPlanSource?.(dateGroup.date)}
                    >
                      <BookOpen size={14} />
                    </button>
                  {/if}
                  <span class="previous-date-chevron" aria-hidden="true"><ChevronDown size={14} /></span>
                </span>
              </summary>
              {#each dateGroup.projects as project (project.key)}
                <details class="previous-project-group" open>
                  <summary><FolderTree size={14} /><strong>{project.label}</strong><em>{project.items.length}</em><ChevronDown size={14} /></summary>
                  <div>
                    {#each project.items as item (dailyMigrationSelectionKey(item))}
                      <article class="previous-task-row" class:previewing={previewPreviousItemId === dailyMigrationSelectionKey(item)}>
                        <input
                          type="checkbox"
                          aria-label={`选择迁移：${compactTaskText(item.text)}`}
                          checked={selectedPreviousIds.has(dailyMigrationSelectionKey(item))}
                          on:change={() => togglePreviousSelection(item)}
                        />
                        <button
                          class="previous-task-title"
                          type="button"
                          aria-expanded={previewPreviousItemId === dailyMigrationSelectionKey(item)}
                          on:click={() => (previewPreviousItemId = previewPreviousItemId === dailyMigrationSelectionKey(item) ? "" : dailyMigrationSelectionKey(item))}
                        >{compactTaskText(item.text)}</button>
                        <div class="previous-task-actions">
                          <button
                            type="button"
                            title={previewPreviousItemId === dailyMigrationSelectionKey(item) ? "收起预览" : "预览任务"}
                            on:click={() => (previewPreviousItemId = previewPreviousItemId === dailyMigrationSelectionKey(item) ? "" : dailyMigrationSelectionKey(item))}
                          ><PanelTopOpen size={14} /></button>
                          {#if dailyApi.openItem}
                            <button type="button" title="打开任务目标" on:click={() => dailyApi?.openItem?.(item)}><BookOpen size={14} /></button>
                          {/if}
                          {#if dailyApi.dismissPreviousItem}
                            <button class="dismiss-previous-item" type="button" title="忽略这一项，不再提示迁移" on:click={() => dismissPreviousItem(item)}><EyeOff size={14} /><span>忽略</span></button>
                          {/if}
                        </div>
                        {#if previewPreviousItemId === dailyMigrationSelectionKey(item)}
                          <div class="previous-task-preview">
                            <span><strong>来源</strong>{item.sourcePath}</span>
                            {#if userFacingTargetLabel(item)}<span><strong>目标</strong>{userFacingTargetLabel(item)}</span>{/if}
                            {#if item.nextStep}<span><strong>下一步</strong>{item.nextStep}</span>{/if}
                            <footer>
                              {#if dailyApi.openPlanSource}<button type="button" on:click={() => dailyApi?.openPlanSource?.(dateGroup.date)}><CalendarDays size={13} />原日记</button>{/if}
                              {#if dailyApi.openItem}<button type="button" on:click={() => dailyApi?.openItem?.(item)}><BookOpen size={13} />打开目标</button>{/if}
                            </footer>
                          </div>
                        {/if}
                      </article>
                    {/each}
                  </div>
                </details>
              {/each}
            </details>
          {/each}
        </div>
        <footer>
          <button
            class="primary"
            type="button"
            disabled={Boolean(busy) || selectedPreviousIds.size === 0}
            on:click={migrateSelectedPrevious}
          >迁移所选 {selectedPreviousIds.size} 项到今天</button>
        </footer>
      </details>
    {/if}

    <section class="focus-card" aria-label={planningDay === "today" ? "今日概要" : "明日概要"}>
      <header>
        <div class="focus-heading">
          <span>{planningDay === "today" ? "今日进度" : "明日计划"}</span>
          <strong>{overview.total ? `${overview.total} 项安排` : "还没有安排任务"}</strong>
          {#if metadata.theme}<em title="可选的当日焦点">焦点 · {metadata.theme}</em>{/if}
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
            <strong>{compactTaskText(overview.current.text)}</strong>
            <small>{overview.current.nextStep ? `下一步：${overview.current.nextStep}` : "还没有写最小下一步"}</small>
          </button>
          {#if dailyApi.startItem || dailyApi.pauseItem || dailyApi.resumeItem}
            <button
              class="start-button"
              type="button"
              disabled={Boolean(busy)}
              on:click={startOverviewItem}
            >{#if primaryTimerAction(overview.current) === "pause"}<Pause size={14} />{:else}<CirclePlay size={14} />{/if}{primaryTimerLabel(overview.current)}</button>
          {/if}
        </div>
        {#if overview.upcoming.length > 0}
          <ol class="focus-upcoming">
            {#each overview.upcoming as item}
              <li>
                <span>○</span>
                <button type="button" on:click={() => (previewItemId = item.id)}>{compactTaskText(item.text)}</button>
                {#if dailyApi.startItem || dailyApi.pauseItem || dailyApi.resumeItem}<button class="make-current" type="button" title="将这项设为当前专注任务并开始计时" on:click={() => makeCurrent(item)}>{focusActionLabel(item)}</button>{/if}
              </li>
            {/each}
          </ol>
        {/if}
      {:else}
        <div class="focus-empty">这一天还没有待推进的计划。</div>
      {/if}
      <div class="progress-accessible" role="progressbar" aria-label={`${planningDay === "today" ? "今日" : "明日"}任务进度`} aria-valuemin="0" aria-valuemax={Math.max(1, overview.total)} aria-valuenow={overview.done}></div>
      <div class="project-progress-battery" role="group" aria-label="按项目查看任务进度；左键查看详情，右键设置项目颜色">
        {#each projectProgress as segment (segment.id)}
          <button
            type="button"
            class="battery-project"
            class:inspecting={inspectedProgressProject?.id === segment.id}
            style={`--project-color:${segment.color};--project-weight:${segment.items.length}`}
            aria-label={`${segment.label}，完成 ${segment.done}/${segment.items.length}；点击查看详情，右键设置颜色`}
            aria-pressed={pinnedProgressProjectId === segment.id}
            aria-describedby={inspectedProgressProject?.id === segment.id ? `project-progress-details-${segment.id}` : undefined}
            on:click={(event) => toggleProgressProjectDetails(segment, event)}
            on:contextmenu={(event) => beginProgressProjectColor(segment, event)}
            on:keydown={(event) => handleProgressProjectKeydown(segment, event)}
            on:mouseenter={() => showProgressProjectDetails(segment)}
            on:mouseleave={() => hideProgressProjectDetails(segment)}
            on:focus={() => showProgressProjectDetails(segment)}
            on:blur={() => hideProgressProjectDetails(segment)}
          >
            {#each segment.items as item (item.id)}<i class:done={isDailyItemComplete(item)}></i>{/each}
          </button>
        {:else}
          <span></span>
        {/each}
      </div>
      {#if projectProgress.length}
        <div class="project-progress-legend">
          {#each projectProgress as segment (segment.id)}
            <button
              type="button"
              class:inspecting={inspectedProgressProject?.id === segment.id}
              style={`--project-color:${segment.color}`}
              aria-pressed={pinnedProgressProjectId === segment.id}
              aria-describedby={inspectedProgressProject?.id === segment.id ? `project-progress-details-${segment.id}` : undefined}
              on:click={(event) => toggleProgressProjectDetails(segment, event)}
              aria-label={`${segment.label}，完成 ${segment.done}/${segment.items.length}；点击查看详情，右键设置颜色`}
              on:contextmenu={(event) => beginProgressProjectColor(segment, event)}
              on:keydown={(event) => handleProgressProjectKeydown(segment, event)}
              on:mouseenter={() => showProgressProjectDetails(segment)}
              on:mouseleave={() => hideProgressProjectDetails(segment)}
              on:focus={() => showProgressProjectDetails(segment)}
              on:blur={() => hideProgressProjectDetails(segment)}
            ><i></i>{segment.label}<em>{segment.done}/{segment.items.length}</em></button>
          {/each}
        </div>
        {#if inspectedProgressProject}
          <aside
            id={`project-progress-details-${inspectedProgressProject.id}`}
            class="project-progress-details"
            class:pinned={pinnedProgressProjectId === inspectedProgressProject.id}
            role={pinnedProgressProjectId === inspectedProgressProject.id ? "region" : "tooltip"}
            aria-live="polite"
            style={`--project-color:${inspectedProgressProject.color}`}
          >
            <header>
              <span><i></i><strong>{inspectedProgressProject.label}</strong></span>
              <em>完成 {inspectedProgressProject.done}/{inspectedProgressProject.items.length}</em>
            </header>
            <div class="project-progress-statuses">
              <span>待办 {progressProjectTodoCount(inspectedProgressProject)}</span>
              <span>进行中 {progressProjectActiveCount(inspectedProgressProject)}</span>
              <span>已完成 {inspectedProgressProject.done}</span>
            </div>
            <ul>
              {#each inspectedProgressProject.items as item (item.id)}
                <li class:done={isDailyItemComplete(item)} class:active={item.status === "in-progress"}>
                  <span>{isDailyItemComplete(item) ? "✓" : item.status === "in-progress" ? "▶" : "○"}</span>
                  <div>
                    <strong>{compactTaskText(item.text)}</strong>
                    {#if item.nextStep}<small>下一步：{item.nextStep}</small>{/if}
                    {#if timingFor(item)}<small>{timingStatusLabel(timingFor(item))} · {formatDuration(timingFor(item)?.activeMs)}</small>{/if}
                  </div>
                </li>
              {/each}
            </ul>
            <footer>
              <span>左键固定详情 · Shift+F10 设置颜色</span>
              {#if pinnedProgressProjectId === inspectedProgressProject.id}
                <button
                  type="button"
                  on:click={(event) => beginProgressProjectColor(inspectedProgressProject, event)}
                >设置颜色</button>
              {/if}
            </footer>
          </aside>
        {/if}
        {#if editingProgressProjectId}
          <button
            class="project-color-scrim"
            type="button"
            aria-label="关闭项目颜色设置"
            on:click={closeProjectColorPopover}
          ></button>
          <div
            bind:this={projectColorPopover}
            class="project-color-popover"
            role="dialog"
            aria-label={`设置 ${editingProgressProjectLabel} 的颜色`}
            on:pointerdown|stopPropagation
          >
            <strong>{editingProgressProjectLabel}</strong>
            <label>项目颜色 <input bind:this={projectColorInput} type="color" bind:value={editingProgressProjectColor} /></label>
            <div class="project-color-presets">
              {#each ["#6a5acd", "#2878b5", "#16845b", "#c46a16", "#bd3e5b", "#6b7f2b", "#8f4fb2", "#287f8d"] as color}
                <button type="button" style={`--swatch:${color}`} aria-label={`选择颜色 ${color}`} on:click={() => (editingProgressProjectColor = color)}></button>
              {/each}
            </div>
            <footer>
              <button type="button" on:click={closeProjectColorPopover}>取消</button>
              <button class="primary" type="button" on:click={saveProgressProjectColor}>保存</button>
            </footer>
          </div>
        {/if}
      {/if}
    </section>

    {#if !workspaceMode}
    <section class="planner-card">
      <button class="planner-heading" type="button" aria-expanded={plannerExpanded} on:click={() => (plannerExpanded = !plannerExpanded)}>
        <span>
          <Columns3 size={17} />
          <span>
            <strong>编排与任务池</strong>
            <small>从工作池搜索并安排到今天 / 明天。</small>
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

        <details class="planner-pool-picker" aria-label="从任务池选择">
          <summary>
            <span>
              <ListTodo size={15} />
              <span>
                <strong>从任务池选择</strong>
                <small>{availablePoolItems.length} 条尚未承诺日期的任务</small>
              </span>
            </span>
            <ChevronDown size={15} />
          </summary>
          <div class="pool-picker-body">
            <button class="open-pool-button" type="button" on:click={() => switchSurface("pool")}>打开完整任务池</button>
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
          </div>
        </details>

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
    {:else}
      <div class="workspace-arrange-bar">
        <div>
          <strong>{planningDay === "today" ? "今天要推进什么？" : "明天准备推进什么？"}</strong>
          <small>新任务统一进入工作池，再安排到具体日期。</small>
        </div>
        <button class="primary" type="button" on:click={() => onOpenWorkPool?.()}>
          <ListTodo size={15} />从工作池安排
        </button>
      </div>
    {/if}

    <div class="daily-main-grid" class:preview-open={previewExpanded}>
      <section class="plan-list-card">
        <header>
          <div>
            <h3>{planningDay === "today" ? "今日" : "明日"}清单</h3>
            <p>Markdown 顺序就是设备顺序；普通任务不自动迁移，任务池引用会在日期结束后回池。</p>
          </div>
          <div class="list-header-actions">
            {#if workspaceMode}
              <button class:active={previewExpanded} type="button" title={previewExpanded ? "收起 2.7 英寸墨水屏预览" : "打开 2.7 英寸墨水屏预览"} on:click={() => (previewExpanded = !previewExpanded)}><MonitorUp size={15} />2.7″ 预览</button>
              <button type="button" title="刷新计划" aria-label="刷新计划" on:click={() => refresh()}><RefreshCw size={15} /></button>
              <details class="list-more-actions">
                <summary aria-label="更多清单操作"><MoreHorizontal size={15} /></summary>
                <div>
                  {#if dailyApi.getNormalizationPreview}<button type="button" disabled={Boolean(busy)} on:click={previewNormalizationForPlan}><FileDiff size={15} />规范化清单</button>{/if}
                </div>
              </details>
            {:else}
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
            {/if}
          </div>
        </header>

        {#if !workspaceMode}
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

        {/if}

        {#if normalizationPreview}
          <section class="normalization-preview" aria-label="规范化预览">
            <header>
              <FileDiff size={18} />
              <div class="normalization-heading">
                <strong>整理为可跟踪任务</strong>
                <small>
                  找到 {normalizationPreview.tasks.length} 条任务，需补充 {normalizationPreview.edits.length} 处稳定标识
                </small>
              </div>
              <button class="normalization-close" type="button" aria-label="关闭规范化预览" title="关闭" on:click={() => (normalizationPreview = undefined)}>×</button>
            </header>
            <p class="normalization-explanation">
              只为普通 Markdown 任务补上 checkbox 与稳定标识，供完成、计时和双向同步使用；父分类、链接、缩进和手写说明保持不变。
            </p>
            <details class="normalization-technical-details">
              <summary>
                查看识别结果与 Markdown 变更
                {#if normalizationPreview.diagnostics.length > 0}<span>{normalizationPreview.diagnostics.length} 条链接提醒</span>{/if}
              </summary>
              <div class="normalization-technical-content">
                {#if normalizationPreview.diagnostics.length > 0}
                  <ul class="normalization-diagnostics">
                    {#each normalizationPreview.diagnostics as diagnostic}
                      <li class:error={diagnostic.severity === "error"}>
                        <strong>{diagnostic.severity === "error" ? "需要处理" : "链接提醒"} · 第 {diagnostic.line} 行</strong>
                        <span>{normalizationDiagnosticLabel(diagnostic)}</span>
                      </li>
                    {/each}
                  </ul>
                {/if}
                <div class="normalization-structure">
                  <section>
                    <strong>保留为分类</strong>
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
                    <strong>接管为任务</strong>
                    {#if normalizationPreview.tasks.length}
                      <ul>
                        {#each normalizationPreview.tasks as task}
                          <li>
                            <span>{compactTaskText(task.text)}</span>
                            <small>{task.targetResolution.displayLabel} · {task.checkbox ? "已有 checkbox" : "将补充 checkbox"}</small>
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      <small>没有可整理的任务</small>
                    {/if}
                  </section>
                </div>
                {#if normalizationPreview.diff}
                  <details class="normalization-diff-details">
                    <summary>查看 Markdown diff</summary>
                    <pre class="normalization-diff">{normalizationPreview.diff}</pre>
                  </details>
                {:else}
                  <p class="normalization-clean">这份清单已经规范，无需修改 Markdown。</p>
                {/if}
              </div>
            </details>
            <footer>
              <span>{normalizationPreview.changed ? "确认后才会修改原文，并可安全撤销。" : "当前原文无需改动。"}</span>
              {#if normalizationPreview.changed && dailyApi.normalizePlan && !normalizationPreview.diagnostics.some((diagnostic) => diagnostic.severity === "error")}
                <button class="primary" type="button" disabled={Boolean(busy)} on:click={applyNormalization}>
                  <Check size={14} />
                  整理这 {normalizationPreview.edits.length} 条任务
                </button>
              {:else if normalizationPreview.diagnostics.some((diagnostic) => diagnostic.severity === "error")}
                <strong class="normalization-blocked">请展开详情并先修复错误</strong>
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
                  {@const timing = timingFor(item)}
            <article
              class:current={item.status === "in-progress"}
              class:completed={isDailyItemComplete(item)}
              class="plan-item"
            >
              <button
                class="check-button"
                type="button"
                disabled={item.status === "done" ? !dailyApi.reopenItem || Boolean(busy) : !dailyApi.completeItem || Boolean(busy)}
                title={item.status === "done" ? "重新打开" : "标记完成"}
                on:click={() => toggleDailyCompletion(item)}
              >
                {#if isDailyItemComplete(item)}<Check size={17} />{:else}<Circle size={17} />{/if}
              </button>
              <button class="item-main" type="button" on:click={() => {
                previewItemId = item.id;
                previewPage = "item";
                previewExpanded = true;
              }}>
                <span class="item-title-line">
                  <strong>{compactTaskText(item.text)}</strong>
                  {#if item.primary}<span class="flag">主线</span>{/if}
                  {#if item.minimum}<span class="flag minimum">最低承诺</span>{/if}
                </span>
                {#if item.kind !== "task" || summaryCategory(item) || item.nextStep || item.scheduledFor || (item.priority && item.priority !== "normal") || (item.dueDateExplicit !== false && item.dueDate) || directChildTasks(item).length}
                <span class="item-summary-line">
                  {#if item.kind !== "task"}<em class={`kind kind-${item.kind}`}>{kindLabel(item.kind)}</em>{/if}
                  {#if summaryCategory(item)}<em>{summaryCategory(item)}</em>{/if}
                  {#if item.nextStep}<span class="next-step">下一步：{item.nextStep}</span>{/if}
                  {#if item.scheduledFor}<time datetime={item.scheduledFor}>{formatDateTime(item.scheduledFor)}</time>{/if}
                  {#if item.priority && item.priority !== "normal"}<em class={`priority priority-${item.priority}`}>{priorityLabel(item.priority)}</em>{/if}
                  {#if item.dueDateExplicit !== false && item.dueDate}<time datetime={item.dueDate}>截止 {item.dueDate}</time>{/if}
                  {#if directChildTasks(item).length}
                    <em>子任务 {directChildTasks(item).filter(isDailyItemComplete).length}/{directChildTasks(item).length}</em>
                  {/if}
                  {#if item.aggregate?.linkedTasks}
                    <em>子文档 {item.aggregate.linkedTasks} 项</em>
                  {/if}
                  {#if item.aggregate}
                    <em class="aggregate-progress">汇总 {item.aggregate.done}/{item.aggregate.total}</em>
                  {/if}
                </span>
                {/if}
              </button>
              {#if editingItemId !== item.id}
              <div class="item-actions">
                {#if dailyApi.openItem}
                  <button type="button" title="打开目标" on:click={() => dailyApi?.openItem?.(item)}><BookOpen size={14} /></button>
                {/if}
                {#if dailyApi.updateItem && item.status !== "done"}
                  <button type="button" title="编辑属性" on:click={(event) => beginEdit(item, event)}><PenLine size={14} /></button>
                {/if}
                {#if item.status !== "done" && (dailyApi.startItem || dailyApi.pauseItem || dailyApi.resumeItem)}
                  <button
                    class="timer-direct-action"
                    class:active={timing?.status === "running"}
                    type="button"
                    title={`${primaryTimerLabel(item)}任务`}
                    aria-label={`${primaryTimerLabel(item)}任务`}
                    disabled={Boolean(busy)}
                    on:click={() => transitionTimer(item, primaryTimerAction(item))}
                  >{#if primaryTimerAction(item) === "pause"}<Pause size={14} />{:else}<Play size={14} />{/if}<span>{primaryTimerLabel(item)}</span></button>
                {/if}
                {#if dailyApi.getItemTiming || dailyApi.startItem || dailyApi.pauseItem || dailyApi.resumeItem}
                  <details class="item-more item-timing" on:toggle={(event) => handleItemMenuToggle(item.id, event, true)}>
                    <summary class:active={timing?.status === "running"} title={`时间与进度：${timingStatusLabel(timing)}`} aria-label={`时间与进度：${timingStatusLabel(timing)}`}><Clock3 size={15} /></summary>
                    <div class="item-more-menu timing-popover">
                      <header>
                        <span><strong>时间与进度</strong><em class:review={timing?.needsReview}>{timingStatusLabel(timing)}</em></span>
                        <strong>{formatDuration(timing?.activeMs)} / {item.estimateMinutes ? `${item.estimateMinutes} 分钟` : "无预计"}</strong>
                      </header>
                      <div class="timing-content">
                        <div class="timing-metrics">
                          <span><small>实际投入</small><strong>{formatDuration(timing?.activeMs)}</strong></span>
                          <span><small>总跨度</small><strong>{formatDuration(timing?.wallMs)}</strong></span>
                          <span><small>中断</small><strong>{timing?.interruptionCount ?? 0} 次</strong></span>
                          <span><small>预计差值</small><strong>{estimateDeltaLabel(timing?.estimateDeltaMinutes)}</strong></span>
                        </div>
                        {#if timing?.needsReview}<p class="timing-review">此会话跨午夜或持续过久，请检查最近事件。</p>{/if}
                        <div class="timing-actions">
                          {#if (!timing || timing.status === "not-started") && dailyApi.startItem && item.status !== "done"}
                            <button class="primary" type="button" disabled={Boolean(busy)} on:click={() => transitionTimer(item, "start")}><Play size={14} />开始</button>
                          {:else if timing?.status === "running" && dailyApi.pauseItem}
                            <button type="button" disabled={Boolean(busy)} on:click={() => transitionTimer(item, "pause")}><Pause size={14} />暂停</button>
                          {:else if timing?.status === "paused" && dailyApi.resumeItem && item.status !== "done"}
                            <button class="primary" type="button" disabled={Boolean(busy)} on:click={() => transitionTimer(item, "resume")}><Play size={14} />继续</button>
                          {/if}
                          {#if item.status !== "done" && dailyApi.completeItem}<button type="button" disabled={Boolean(busy)} on:click={() => transitionTimer(item, "complete")}><Check size={14} />完成</button>{/if}
                        </div>
                        {#if recentTimerEvents(item.id).length > 0}
                          <section class="timer-history"><h4><History size={13} />最近事件</h4><ol>{#each recentTimerEvents(item.id) as event (event.eventId)}<li><span>{timerEventLabel(event.kind)}</span><time datetime={event.at}>{formatDateTime(event.at)}</time><small>{event.source}{event.automatic ? " · 自动" : ""}</small></li>{/each}</ol></section>
                        {/if}
                        {#if dailyApi.correctItemTiming && recentTimerEvents(item.id).length > 0}
                          <details class="timing-correction-details">
                            <summary>修正时间记录</summary>
                            <form class="timing-correction" on:submit|preventDefault={() => correctTiming(item)}>
                              <label><span>事件</span><select value={correctionEventByItem[item.id] || recentTimerEvents(item.id)[0]?.eventId} on:change={(event) => setCorrectionEvent(item.id, event)}>{#each recentTimerEvents(item.id) as event (event.eventId)}<option value={event.eventId}>{timerEventLabel(event.kind)} · {formatDateTime(event.at)}</option>{/each}</select></label>
                              <label><span>正确时间</span><input type="datetime-local" value={correctionTimeByItem[item.id] ?? ""} on:input={(event) => setCorrectionTime(item.id, event)} required /></label>
                              <label class="wide"><span>原因</span><input value={correctionReasonByItem[item.id] ?? ""} on:input={(event) => setCorrectionReason(item.id, event)} placeholder="例如：忘记暂停" /></label>
                              <button type="submit" disabled={Boolean(busy)}>保存修正</button>
                            </form>
                          </details>
                        {/if}
                      </div>
                    </div>
                  </details>
                {/if}
                <details class="item-more" on:toggle={(event) => handleItemMenuToggle(item.id, event)}>
                  <summary title="更多操作" aria-label="更多操作"><MoreHorizontal size={15} /></summary>
                  <div class="item-more-menu">
                    {#if userFacingTargetLabel(item) && dailyApi.openItem}
                      <button type="button" on:click={() => dailyApi?.openItem?.(item)}><Target size={14} />打开：{userFacingTargetLabel(item)}</button>
                    {/if}
                    {#if item.status !== "done" && dailyApi.updateItem}
                      <label class="menu-field">
                        <span>墨水屏策略</span>
                        <select aria-label={`更改 ${item.text} 的设备策略`} value={item.devicePolicy ?? "none"} disabled={Boolean(busy)} on:change={(event) => updatePolicyFromEvent(item, event)}>
                          <option value="none">不发送</option><option value="manual">手动</option><option value="scheduled">定时</option><option value="rotation">轮播</option><option value="agent">Agent</option>
                        </select>
                      </label>
                    {/if}
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
                    {#if item.status !== "done" && item.workKind && dailyApi.completeItemAndApplyOrigin}
                      {#if item.workKind === "note" || item.workKind === "inbox"}
                        <label class="origin-stage-picker">
                          <span>完成后推进到</span>
                          <select bind:value={originStageByItem[item.id]}>
                            <option value="">选择阶段</option>
                            {#each configuration.workflowStages ?? [] as stage}
                              <option value={stage.id}>{stage.label}</option>
                            {/each}
                          </select>
                        </label>
                      {/if}
                      <button class="primary" type="button" on:click={() => completeWithOrigin(item)}>
                        <Check size={14} />{item.workKind === "question" ? "完成并解决问题" : "完成并推进笔记"}
                      </button>
                    {/if}
                  </div>
                </details>
              </div>
              {/if}
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
                    <article class:current={item.status === "in-progress"} class:completed={isDailyItemComplete(item)}>
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
                  <tr class:completed={isDailyItemComplete(item)}>
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
                    <button class:completed={isDailyItemComplete(item)} type="button" on:click={() => {
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
            <span>2.7″ 墨水屏预览</span>
            <small>{deck?.pageOrder.length ?? 0} 页 · {deck?.planItems.length ?? 0} 张任务卡</small>
          </header>
          <nav class="preview-tabs" aria-label="设备页面预览">
            <button class:active={previewPage === "overview"} type="button" on:click={() => (previewPage = "overview")}>总览</button>
            <button class:active={previewPage === "item"} type="button" on:click={() => (previewPage = "item")}>任务</button>
            <button class:active={previewPage === "inbox"} type="button" on:click={() => (previewPage = "inbox")}>提醒</button>
          </nav>
          <div class="eink-screen">
            {#if previewPage === "overview" && deck}
              <div class="eink-meta">
                <strong>{deck.date.slice(5).replace("-", "月")}日 · 今日</strong>
                <span class="eink-battery">电量 {deck.overview.batteryPercent ?? "--"}%</span>
              </div>
              <div class="eink-total-progress" aria-label={`今日完成 ${deck.overview.progress.done} / ${deck.overview.progress.total}`}>
                <span style={`width:${deck.overview.progress.total > 0 ? (deck.overview.progress.done / deck.overview.progress.total) * 100 : 0}%`}></span>
              </div>
              <div class="eink-project-stats">
                {#each deck.overview.projects.slice(0, 4) as project}
                  <div><i style={`--project-color:${project.color || "#222"}`}></i><span>{project.label}</span><strong>{project.done}/{project.total}</strong></div>
                {/each}
              </div>
              {#if deck.overview.current}
                <small>当前</small>
                <p class="eink-current">{deck.overview.current.text}</p>
              {:else}
                <p class="eink-empty compact">今天没有待推进任务</p>
              {/if}
              <footer><span>左：页面</span><strong>{deck.overview.progress.done}/{deck.overview.progress.total}</strong><span>主键：开始</span></footer>
            {:else if previewPage === "item" && previewTaskCard}
              <div class="eink-meta">
                <strong>{previewTaskCard.item.groupLabel || "未分类"} · {previewTaskCard.position}/{previewTaskCard.total}</strong>
                <span>{deckTimingStatusLabel(previewTaskCard.item.timing?.state)}</span>
              </div>
              <h4>{previewTaskCard.item.text}</h4>
              {#if previewTaskCard.item.startedAt || previewTaskCard.item.timing?.firstStartedAt}
                <small class="eink-started">
                  开始 {formatAnalyticsClock(previewTaskCard.item.startedAt || previewTaskCard.item.timing?.firstStartedAt)}
                  · {deckTimingStatusLabel(previewTaskCard.item.timing?.state)}
                </small>
              {/if}
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
              <footer><span>左：页面</span><span>主键：打开</span><span>右长按：完成</span></footer>
            {:else if previewPage === "inbox" && previewInboxCard}
              <div class="eink-meta">
                <strong>提醒 · 收件箱</strong>
                <span>{previewInboxCard.total > 0 ? `${previewInboxCard.position}/${previewInboxCard.total}` : "0"}</span>
              </div>
              {#if previewInboxCard.item}
                <small class="eink-source-badge">
                  {previewInboxCard.item.source === "ai"
                    ? "AI 推测"
                    : previewInboxCard.item.source === "human"
                      ? "亲友留言"
                      : previewInboxCard.item.source === "inbox"
                        ? "Inbox"
                        : "规则建议"}
                </small>
                <h4>{previewInboxCard.item.title}</h4>
                {#if previewInboxCard.item.detail}<p>{previewInboxCard.item.detail}</p>{/if}
                {#if previewInboxCard.item.reason}<small>此刻出现：{previewInboxCard.item.reason}</small>{/if}
              {:else}
                <p class="eink-empty">现在没有新提醒</p>
              {/if}
              <footer><span>左：页面</span><span>右：下一条</span><span>主键：确认</span></footer>
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

    {#if workspaceMode}
      <details class="review-card workspace-review">
        <summary>
          <span><BarChart3 size={16} /><strong>今日复盘</strong><small>统计与总结默认收起，不占用当前任务的注意力。</small></span>
          <ChevronDown size={16} />
        </summary>
        <div class="daily-metrics compact-metrics">
          <article><span>新增写作单位</span><strong>{snapshot?.activity.positiveWritingUnits ?? 0}</strong></article>
          <article><span>净增</span><strong class:negative={(snapshot?.activity.netWritingUnits ?? 0) < 0}>{formatSigned(snapshot?.activity.netWritingUnits ?? 0)}</strong></article>
          <article><span>完成事项</span><strong>{Math.max(snapshot?.plan.done ?? 0, snapshot?.activity.tasksCompleted ?? 0)}</strong></article>
          <article><span>Capture</span><strong>{snapshot?.activity.capturesCommitted ?? 0}</strong></article>
        </div>
      </details>
    {/if}

    {:else if surface === "pool"}
      <WorkPoolPanel
        {dailyApi}
        date={selectedDate}
        workflowStages={configuration.workflowStages ?? []}
        articleTypes={configuration.articleTypes ?? []}
        questionStatuses={configuration.questionStatuses ?? []}
      />
    {:else}
      <details class="review-card" open>
        <summary>
          <span><BarChart3 size={16} /><strong>数据与复盘</strong><small>写作统计、活动和今日总结放在第二层</small></span>
          <ChevronDown size={16} />
        </summary>
        {#if analyticsRange}
          <section class="analytics-overview" aria-label="每日投入统计">
            <article><span>完成率</span><strong>{Math.round(analyticsRange.totals.completionRate * 100)}%</strong><small>{analyticsRange.totals.completed}/{analyticsRange.totals.planned} 项</small></article>
            <article><span>实际投入</span><strong>{formatAnalyticsDuration(analyticsRange.totals.activeMs)}</strong><small>暂停 {formatAnalyticsDuration(analyticsRange.totals.pausedMs)}</small></article>
            <article><span>首次开始</span><strong>{formatAnalyticsClock(analyticsRange.totals.firstStartedAt)}</strong><small>最后完成 {formatAnalyticsClock(analyticsRange.totals.lastCompletedAt)}</small></article>
            <article><span>中断</span><strong>{analyticsRange.totals.interruptions}</strong><small>{analyticsRange.totals.needsReview ? "有待确认会话" : "计时账本正常"}</small></article>
          </section>
        {/if}
        {#if monthlySummary}
          <section class="monthly-analytics" aria-label="月度统计">
            <header><strong>{monthlySummary.month} 月度</strong><span>{formatAnalyticsDuration(monthlySummary.totals.activeMs)} · 完成 {monthlySummary.totals.completed} 项</span></header>
            <div class="monthly-trend">
              {#each monthlySummary.days as day (day.date)}
                <i
                  title={`${day.date} · ${day.completed}/${day.planned} · ${formatAnalyticsDuration(day.activeMs)}`}
                  style={`--day-progress:${Math.max(4, Math.round(day.completionRate * 100))}%`}
                ></i>
              {/each}
            </div>
            {#if monthlySummary.byCategory.length > 0}
              <div class="analytics-breakdown">
                {#each monthlySummary.byCategory.slice(0, 8) as entry (entry.id)}
                  <span><b>{entry.label}</b><em>{entry.completed}/{entry.planned}</em><small>{formatAnalyticsDuration(entry.activeMs)}</small></span>
                {/each}
              </div>
            {/if}
          </section>
        {/if}
        <div class="daily-metrics">
          <article><span>新增写作单位</span><strong>{snapshot?.activity.positiveWritingUnits ?? 0}</strong><small>中文按字、拉丁文本按词</small></article>
          <article><span>净增</span><strong class:negative={(snapshot?.activity.netWritingUnits ?? 0) < 0}>{formatSigned(snapshot?.activity.netWritingUnits ?? 0)}</strong><small>{snapshot?.activity.trackingComplete === false ? "从启用统计后开始" : "今日可重建聚合"}</small></article>
          <article><span>笔记活动</span><strong>{snapshot?.activity.notesModified ?? 0}</strong><small>{snapshot?.activity.notesCreated ?? 0} 篇新建</small></article>
          <article><span>完成事项</span><strong>{Math.max(snapshot?.plan.done ?? 0, snapshot?.activity.tasksCompleted ?? 0)}</strong><small>{snapshot?.activity.questionsResolved ?? 0} 个问题已解决</small></article>
          <article><span>Capture</span><strong>{snapshot?.activity.capturesCommitted ?? 0}</strong><small>今日提交</small></article>
          <article><span>屏幕展示</span><strong>{snapshot?.activity.cardsDisplayed ?? 0}</strong><small>{snapshot?.activity.cardsSelected ?? 0} 次选择</small></article>
        </div>
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

  .previous-tasks-card {
    order: 2;
    border: 1px solid var(--daily-border);
    border-radius: 10px;
    background: var(--daily-soft);
  }

  .previous-tasks-card > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    cursor: pointer;
    list-style: none;
  }

  .previous-tasks-card > summary > span { display: flex; align-items: center; gap: 7px; }
  .previous-tasks-card > summary small { color: var(--text-muted); }
  .previous-task-list { display: grid; gap: 9px; padding: 0 12px 10px; }
  .previous-date-group { overflow: hidden; border: 1px solid var(--daily-border); border-radius: 9px; background: var(--daily-raised); }
  .previous-date-group > summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; cursor: pointer; list-style: none; background: var(--background-secondary); }
  .previous-date-group > summary::-webkit-details-marker { display: none; }
  .previous-date-group > summary > span { display: flex; align-items: center; gap: 7px; }
  .previous-date-group em { color: var(--text-muted); font-size: .65rem; font-style: normal; font-weight: 500; }
  .previous-date-group button { display: inline-grid; padding: 4px; place-items: center; color: var(--text-muted); background: transparent; }
  .previous-date-actions { margin-left: auto; }
  .previous-date-chevron { transition: transform 140ms ease; }
  .previous-date-group:not([open]) .previous-date-chevron { transform: rotate(-90deg); }
  .previous-project-group { border-top: 1px solid var(--daily-border); }
  .previous-project-group > summary { display: flex; align-items: center; gap: 7px; padding: 7px 10px; cursor: pointer; list-style: none; }
  .previous-project-group > summary strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .previous-project-group > summary em { margin-left: auto; }
  .previous-task-row { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: center; gap: 7px; padding: 6px 9px 6px 13px; border-top: 1px solid var(--daily-border); }
  .previous-task-row:hover,
  .previous-task-row.previewing { background: var(--background-modifier-hover); }
  .previous-task-row > input { margin: 0; justify-self: center; }
  .previous-task-title { min-width: 0; padding: 2px 0; overflow: hidden; border: 0; color: var(--text-normal); background: transparent; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
  .previous-task-actions { display: flex; align-items: center; gap: 2px; opacity: .55; }
  .previous-task-row:hover .previous-task-actions,
  .previous-task-row:focus-within .previous-task-actions { opacity: 1; }
  .previous-task-preview { grid-column: 2 / -1; display: grid; gap: 4px; padding: 8px 9px; border: 1px solid var(--daily-border); border-radius: 7px; background: var(--background-primary); }
  .previous-task-preview > span { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 7px; color: var(--text-muted); font-size: .68rem; overflow-wrap: anywhere; }
  .previous-task-preview > span strong { color: var(--text-normal); }
  .previous-task-preview footer { display: flex; justify-content: flex-start; gap: 6px; padding: 4px 0 0; }
  .previous-task-preview footer button { display: inline-flex; align-items: center; gap: 5px; padding: 5px 8px; border: 1px solid var(--daily-border); }
  .previous-tasks-card > footer { display: flex; justify-content: flex-end; gap: 7px; padding: 0 12px 12px; }

  .analytics-overview {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    padding: 12px;
  }

  .analytics-overview article {
    display: grid;
    gap: 2px;
    padding: 10px;
    border: 1px solid var(--daily-border);
    border-radius: 9px;
    background: var(--daily-raised);
  }

  .analytics-overview span,
  .analytics-overview small { color: var(--text-muted); }
  .monthly-analytics { display: grid; gap: 9px; margin: 0 12px 12px; padding: 12px; border: 1px solid var(--daily-border); border-radius: 10px; }
  .monthly-analytics > header { display: flex; justify-content: space-between; gap: 8px; }
  .monthly-trend { display: flex; align-items: end; gap: 3px; height: 42px; }
  .monthly-trend i { flex: 1 1 0; min-width: 3px; height: var(--day-progress); max-height: 100%; border-radius: 3px 3px 1px 1px; background: var(--interactive-accent); opacity: .72; }
  .monthly-trend i:hover { opacity: 1; transform: translateY(-2px); }
  .analytics-breakdown { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 12px; }
  .analytics-breakdown span { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 7px; align-items: baseline; }
  .analytics-breakdown b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .analytics-breakdown em,
  .analytics-breakdown small { color: var(--text-muted); font-style: normal; }

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

  .focus-card,
  .eink-card,
  .review-card {
    border: 1px solid var(--daily-border);
    border-radius: 13px;
    background: var(--daily-raised);
  }

  .focus-card {
    position: relative;
    padding: 12px 14px;
  }

  .focus-card > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .focus-heading,
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

  .focus-heading strong {
    font-size: 1.05rem;
  }

  .focus-heading em {
    color: var(--text-muted);
    font-size: 0.68rem;
    font-style: normal;
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
  .focus-upcoming li > button:not(.make-current) {
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

  .focus-upcoming .make-current {
    margin-left: auto;
    padding: 3px 7px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 999px;
    color: var(--text-muted);
    background: transparent;
    font-size: 0.64rem;
    opacity: 0;
    transition: opacity 120ms ease, border-color 120ms ease, color 120ms ease;
  }

  .focus-upcoming li:hover .make-current,
  .focus-upcoming .make-current:focus-visible {
    border-color: var(--interactive-accent);
    color: var(--text-accent);
    opacity: 1;
  }

  .focus-empty {
    margin-top: 8px;
    color: var(--text-muted);
  }

  .project-progress-battery {
    position: relative;
    display: flex;
    gap: 3px;
    min-height: 20px;
    margin: 12px 7px 0 0;
    padding: 3px;
    border: 1.5px solid var(--text-muted);
    border-radius: 5px;
    background: var(--background-primary);
  }

  .progress-accessible {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .project-progress-battery::after {
    position: absolute;
    top: 4px;
    right: -7px;
    width: 4px;
    height: calc(100% - 8px);
    border-radius: 0 3px 3px 0;
    background: var(--text-muted);
    content: "";
  }

  .project-progress-battery > span {
    flex: 1;
    border-radius: 2px;
    background: var(--daily-soft);
  }

  .battery-project {
    display: flex;
    flex: var(--project-weight) 1 24px;
    gap: 2px;
    min-width: 18px;
    padding: 2px;
    border: 1px solid var(--project-color);
    border-radius: 3px;
    background-color: var(--project-color) !important;
    background-image: linear-gradient(rgba(255,255,255,.78), rgba(255,255,255,.78));
    box-shadow: none;
    cursor: pointer;
    transition: background 120ms ease, transform 120ms ease;
  }

  .battery-project:hover,
  .battery-project.inspecting {
    background: color-mix(in srgb, var(--project-color) 22%, transparent);
    transform: translateY(-1px);
  }

  .battery-project i {
    flex: 1;
    min-width: 3px;
    border-radius: 2px;
    background-color: var(--project-color) !important;
    opacity: .42;
  }

  .battery-project i.done {
    background: var(--project-color);
    opacity: 1;
  }

  .summary-notice { margin: 6px 0 0; color: var(--text-success); font-size: .82rem; }

  .project-progress-legend {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
    gap: 5px 8px;
    margin-top: 7px;
    padding-bottom: 2px;
  }

  .project-progress-legend > button {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    width: 100%;
    padding: 5px 7px;
    border: 1px solid transparent;
    border-radius: 999px;
    color: var(--text-muted);
    background: transparent;
    font-size: 0.65rem;
    box-shadow: none;
    cursor: pointer;
  }

  .project-progress-legend > button:hover,
  .project-progress-legend > button:focus-visible,
  .project-progress-legend > button.inspecting {
    border-color: color-mix(in srgb, var(--project-color) 55%, var(--background-modifier-border));
    color: var(--text-normal);
    background: color-mix(in srgb, var(--project-color) 12%, transparent);
  }

  .project-progress-legend > button > i {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    background: var(--project-color);
  }

  .project-progress-legend em {
    margin-left: auto;
    font-style: normal;
    opacity: 0.75;
  }

  .project-progress-details {
    position: relative;
    display: grid;
    gap: 7px;
    max-height: 250px;
    margin-top: 8px;
    padding: 9px 10px;
    overflow: auto;
    border: 1px solid color-mix(in srgb, var(--project-color) 48%, var(--background-modifier-border));
    border-left: 3px solid var(--project-color);
    border-radius: 9px;
    background: color-mix(in srgb, var(--project-color) 7%, var(--background-primary));
    box-shadow: 0 8px 24px rgb(0 0 0 / 9%);
  }

  .project-progress-details > header,
  .project-progress-details > header > span,
  .project-progress-statuses,
  .project-progress-details > footer {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .project-progress-details > header { justify-content: space-between; }
  .project-progress-details > header i { width: 8px; height: 8px; border-radius: 2px; background: var(--project-color); }
  .project-progress-details > header em { color: var(--text-muted); font-size: .68rem; font-style: normal; }
  .project-progress-statuses { flex-wrap: wrap; color: var(--text-muted); font-size: .67rem; }
  .project-progress-statuses span { padding: 2px 6px; border-radius: 999px; background: var(--background-secondary); }
  .project-progress-details ul { display: grid; gap: 3px; margin: 0; padding: 0; list-style: none; }
  .project-progress-details li { display: grid; grid-template-columns: 18px 1fr; gap: 5px; padding: 5px 3px; border-top: 1px solid var(--daily-border); }
  .project-progress-details li > span { color: var(--text-muted); }
  .project-progress-details li.active > span { color: var(--interactive-accent); }
  .project-progress-details li.done strong { color: var(--text-muted); text-decoration: line-through; }
  .project-progress-details li div { display: grid; min-width: 0; gap: 2px; }
  .project-progress-details li strong { overflow: hidden; text-overflow: ellipsis; font-size: .73rem; white-space: nowrap; }
  .project-progress-details li small { overflow: hidden; color: var(--text-muted); font-size: .64rem; text-overflow: ellipsis; white-space: nowrap; }
  .project-progress-details > footer { justify-content: space-between; color: var(--text-faint); font-size: .61rem; }
  .project-progress-details > footer button { padding: 3px 7px; font-size: .64rem; }

  .project-color-scrim {
    position: fixed;
    inset: 0;
    z-index: 1001;
    width: auto;
    min-width: 0;
    height: auto;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: rgb(0 0 0 / 12%);
    box-shadow: none;
    cursor: default;
  }

  .project-color-scrim:hover,
  .project-color-scrim:focus-visible {
    background: rgb(0 0 0 / 12%);
    box-shadow: none;
  }

  .project-color-popover {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 1002;
    display: grid;
    grid-template-rows: auto auto auto auto;
    align-content: start;
    gap: 18px;
    width: min(440px, calc(100vw - 32px));
    min-width: 0;
    max-width: calc(100vw - 24px);
    min-height: min(300px, calc(100vh - 32px));
    max-height: min(440px, calc(100vh - 24px));
    overflow: auto;
    margin-top: 0;
    padding: 18px;
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 28%, var(--background-modifier-border));
    border-radius: 14px;
    background: var(--background-primary);
    box-shadow: 0 16px 44px rgb(0 0 0 / 22%);
  }

  .project-color-popover > strong {
    font-size: 1.05rem;
    line-height: 1.3;
  }

  .project-color-popover label,
  .project-color-popover footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .project-color-popover footer {
    align-self: start;
    margin-top: 2px;
    padding-top: 4px;
  }

  .project-color-popover input[type="color"] {
    width: 42px;
    height: 28px;
    padding: 2px;
  }

  .project-color-presets {
    display: grid;
    grid-template-columns: repeat(4, 34px);
    align-content: center;
    gap: 12px;
  }

  .project-color-presets button {
    width: 34px;
    height: 34px;
    min-width: 0;
    padding: 0;
    border: 2px solid var(--background-primary);
    border-radius: 50%;
    background: var(--swatch);
    box-shadow: 0 0 0 1px var(--background-modifier-border);
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
  .inline-editor label > span {
    color: var(--text-muted);
    font-size: 0.7rem;
  }

  .theme-editor button,
  .preview-actions button,
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

  .due-field {
    grid-column: span 2;
  }

  .date-shortcuts,
  .edit-date-shortcuts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

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
    padding: 11px 12px;
    border-top: 1px solid var(--daily-border);
    background: color-mix(in srgb, var(--background-secondary) 38%, transparent);
  }

  .planner-pool-picker > summary,
  .planner-pool-picker > summary > span {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .planner-pool-picker > summary {
    justify-content: space-between;
    cursor: pointer;
    list-style: none;
  }

  .planner-pool-picker > summary::-webkit-details-marker {
    display: none;
  }

  .planner-pool-picker > summary > span > span {
    display: grid;
    min-width: 0;
  }

  .planner-pool-picker > summary small,
  .pool-picker-body > p,
  .pool-picker-list small {
    color: var(--text-muted);
    font-size: 0.7rem;
  }

  .pool-picker-body > p {
    margin: 0;
  }

  .pool-picker-body {
    display: grid;
    gap: 8px;
    padding-top: 9px;
  }

  .open-pool-button {
    justify-self: end;
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
  .eink-card > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 4px;
    border-bottom: 1px solid var(--daily-border);
  }

  .plan-list-card h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  .plan-list-card header p {
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
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px 10px;
    margin: 8px 10px;
    padding: 10px 12px;
    border: 1px solid var(--daily-border);
    border-radius: 10px;
    background: var(--daily-soft);
  }

  .normalization-preview > header {
    display: contents;
  }

  .normalization-preview > header > :global(svg) {
    color: var(--interactive-accent);
  }

  .normalization-heading {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .normalization-preview > footer {
    grid-column: 2 / -1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }

  .normalization-preview > footer > span {
    margin-right: auto;
  }

  .normalization-preview small,
  .normalization-preview > footer > span,
  .normalization-clean {
    color: var(--text-muted);
    font-size: 0.7rem;
  }

  .normalization-close {
    width: 26px;
    min-height: 26px;
    padding: 0;
    border: 0;
    color: var(--text-muted);
    background: transparent;
    font-size: 1.05rem;
  }

  .normalization-explanation {
    grid-column: 2 / -1;
    margin: 0;
    color: var(--text-muted);
    font-size: 0.72rem;
    line-height: 1.5;
  }

  .normalization-technical-details {
    grid-column: 2 / -1;
    min-width: 0;
  }

  .normalization-technical-details > summary,
  .normalization-diff-details > summary {
    display: flex;
    align-items: center;
    gap: 7px;
    width: fit-content;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.7rem;
  }

  .normalization-technical-details > summary span {
    padding: 1px 6px;
    border-radius: 999px;
    color: var(--text-warning);
    background: color-mix(in srgb, var(--color-yellow) 12%, transparent);
    font-size: 0.62rem;
  }

  .normalization-technical-content {
    display: grid;
    gap: 9px;
    margin-top: 9px;
    padding-top: 9px;
    border-top: 1px solid var(--daily-border);
  }

  .normalization-diagnostics {
    display: grid;
    gap: 5px;
    margin: 0;
    padding: 0;
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
    padding: 0;
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
    margin: 7px 0 0;
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
    padding: 4px 0;
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
    align-items: center;
    gap: 6px;
    padding: 6px 4px;
    padding-left: 4px;
    border-bottom: 1px solid var(--daily-border);
    transition: background 120ms ease;
  }

  .plan-item:hover,
  .plan-item:focus-within {
    background: var(--background-modifier-hover);
  }

  .plan-item.current {
    box-shadow: inset 3px 0 0 var(--interactive-accent);
    background: var(--daily-soft);
  }

  .plan-item.completed {
    opacity: 0.65;
  }

  .check-button {
    display: grid;
    width: 34px;
    height: 34px;
    align-self: center;
    margin: 0;
    padding: 0;
    place-items: center;
    border: 0;
    color: var(--text-muted);
    background: transparent;
  }

  .item-main {
    display: grid;
    gap: 2px;
    min-width: 0;
    padding: 0;
    border: 0;
    color: var(--text-normal);
    background: transparent;
    text-align: left;
    align-items: start;
  }

  .item-main strong,
  .item-title-line,
  .item-summary-line,
  .next-step {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-summary-line .priority-high,
  .item-summary-line .priority-highest {
    color: var(--text-error);
  }

  .item-summary-line .priority-low,
  .item-summary-line .priority-lowest {
    color: var(--text-faint);
  }

  .item-title-line,
  .item-summary-line {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 5px;
  }

  .item-title-line > strong {
    flex: 1;
    min-width: 0;
    text-align: left;
  }

  .item-title-line .flag {
    flex: none;
  }

  .item-summary-line {
    color: var(--text-muted);
    font-size: 0.66rem;
  }

  .item-summary-line > em,
  .item-summary-line > time {
    flex: none;
    color: var(--text-muted);
    font-style: normal;
  }

  .item-summary-line .resolved-target,
  .item-summary-line .next-step {
    min-width: 0;
    max-width: 34%;
  }

  .item-summary-line .resolved-target {
    display: inline-flex;
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

  .kind {
    color: var(--text-muted);
    font-size: 0.65rem;
  }

  .flag.minimum {
    color: var(--text-warning);
    background: color-mix(in srgb, var(--color-yellow) 12%, transparent);
  }

  .item-actions {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 2px;
    opacity: 0.42;
    transition: opacity 120ms ease;
  }

  .plan-item:hover .item-actions,
  .plan-item:focus-within .item-actions {
    opacity: 1;
  }

  .item-actions button {
    padding: 5px;
    color: var(--text-muted);
    background: transparent;
  }

  .item-actions .timer-direct-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 26px;
    padding: 3px 7px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 999px;
    white-space: nowrap;
  }

  .item-actions .timer-direct-action.active {
    border-color: var(--interactive-accent);
    color: var(--text-accent);
  }

  .item-actions .timer-direct-action span {
    font-size: 0.64rem;
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
  .item-more[open] > summary,
  .item-more > summary.active {
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

  .menu-field {
    display: grid;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--daily-border);
    color: var(--text-muted);
    font-size: 0.68rem;
  }

  .menu-field select {
    width: 100%;
  }

  .timing-popover {
    width: min(360px, calc(100vw - 40px));
    padding: 0;
  }

  .timing-popover > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 10px;
    border-bottom: 1px solid var(--daily-border);
    font-size: 0.7rem;
  }

  .timing-popover > header > span {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .timing-popover > header em {
    padding: 1px 5px;
    border-radius: 999px;
    background: var(--daily-soft);
    font-size: 0.62rem;
    font-style: normal;
  }

  .timing-correction-details > summary {
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.68rem;
  }

  .timing-popover em.review {
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
    position: sticky;
    top: 8px;
  }

  .eink-card > header span {
    font-weight: 700;
  }

  .eink-card > header small {
    color: var(--text-muted);
  }

  .eink-started {
    display: block;
    margin: -2px 0 8px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
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
    aspect-ratio: 264 / 176;
    min-height: 0;
    overflow: hidden;
    padding: 13px;
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

  .eink-battery {
    white-space: nowrap;
  }

  .eink-total-progress {
    height: 7px;
    margin: 8px 0 6px;
    overflow: hidden;
    border: 1px solid #222;
    border-radius: 1px;
    background: transparent;
  }

  .eink-total-progress span {
    display: block;
    height: 100%;
    background: #222;
  }

  .eink-project-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3px 9px;
    margin-bottom: 7px;
  }

  .eink-project-stats div {
    display: grid;
    grid-template-columns: 5px minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px;
    min-width: 0;
    font-size: 0.62rem;
  }

  .eink-project-stats i {
    width: 5px;
    height: 10px;
    background: var(--project-color);
  }

  .eink-project-stats span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .eink-project-stats strong {
    font-variant-numeric: tabular-nums;
  }

  .eink-source-badge {
    align-self: flex-start;
    margin-top: 9px;
    padding: 2px 5px;
    border: 1px solid #555;
    border-radius: 2px;
    color: #222 !important;
    font-weight: 700;
  }

  .eink-current {
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
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

  .eink-empty.compact {
    min-height: 34px;
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

  .summary-text {
    display: grid;
    gap: 5px;
    padding: 13px 14px;
  }

  .workspace-arrange-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 11px 13px;
    border: 1px solid var(--daily-border);
    border-radius: 12px;
    background: var(--daily-soft);
  }

  .source-utility { position: relative; margin-left: auto; }
  .source-utility > summary { display:flex; align-items:center; gap:5px; cursor:pointer; list-style:none; color:var(--text-muted); }
  .source-utility > summary::-webkit-details-marker { display:none; }
  .source-utility > div { position:absolute; z-index:12; top:calc(100% + 7px); right:0; display:grid; gap:7px; min-width:220px; padding:11px; border:1px solid var(--daily-border); border-radius:11px; background:var(--background-primary); box-shadow:var(--shadow-s); }
  .source-utility small { color:var(--text-muted); }
  .source-utility .source-warning { color:var(--text-warning); }
  .list-more-actions { position:relative; }
  .list-more-actions > summary { display:grid; place-items:center; cursor:pointer; list-style:none; }
  .list-more-actions > summary::-webkit-details-marker { display:none; }
  .list-more-actions > div { position:absolute; z-index:12; top:calc(100% + 6px); right:0; display:grid; min-width:160px; padding:6px; border:1px solid var(--daily-border); border-radius:9px; background:var(--background-primary); box-shadow:var(--shadow-s); }
  .list-more-actions > div button { justify-content:flex-start; border:0; box-shadow:none; background:transparent; }

  .workspace-arrange-bar > div,
  .workspace-summary {
    display: grid;
    gap: 2px;
  }

  .workspace-arrange-bar small {
    color: var(--text-muted);
    font-size: 0.72rem;
  }

  .workspace-review { margin-top: 2px; }
  .compact-metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .workspace-summary { padding: 0 14px 12px; }
  .review-actions { display: flex; flex-wrap: wrap; gap: 7px; padding: 0 14px 14px; }

  @media (min-width: 900px) {
    .daily-main-grid.preview-open {
      grid-template-columns: minmax(0, 1fr) minmax(300px, 340px);
    }
  }

  @media (max-width: 860px) {

    .planning-fields,
    .daily-metrics,
    .analytics-overview,
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
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 560px) {
    .project-progress-legend {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .project-color-popover {
      width: min(320px, calc(100vw - 20px));
      min-width: 0;
    }

    .workspace-arrange-bar { align-items: stretch; flex-direction: column; }
    .compact-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .analytics-overview,
    .analytics-breakdown { grid-template-columns: 1fr; }
    .surface-switcher {
      display: grid;
      width: 100%;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
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
    .pool-toolbar {
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

    .theme-editor {
      grid-template-columns: 1fr;
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

  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }
</style>
