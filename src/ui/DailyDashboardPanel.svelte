<script lang="ts">
  import {
    ArrowDown,
    ArrowUp,
    BarChart3,
    BookOpen,
    CalendarClock,
    Check,
    ChevronDown,
    Clock3,
    Circle,
    CirclePlay,
    FileDiff,
    FilePlus2,
    FolderTree,
    History,
    MonitorUp,
    Pause,
    PenLine,
    Play,
    Plus,
    RefreshCw,
    RotateCcw,
    Save,
    Send,
    Sparkles,
    Target,
    Undo2
  } from "lucide-svelte";
  import { onDestroy, onMount } from "svelte";
  import { buildDailyDeckSnapshot } from "../hub/daily-cards";
  import type {
    DailyDashboardAdapter,
    DailyDashboardSnapshot,
    DailyDevicePolicy,
    DailyPlanGroup,
    DailyPlanHierarchy,
    DailyPlanItemKind,
    DailyPlanItem,
    DailyPlanMetadataPresentation,
    DailyPlanNormalizationPreview,
    DailyPlanningCandidate,
    DailySummaryPresentation,
    DailyTaskTimingSnapshot,
    DailyTimerEvent
  } from "./daily-dashboard-types";
  import {
    dailyDateForPlanningDay,
    dailySnapshotFingerprint,
    isDailySummaryCurrent,
    selectDailyOverview,
    type DailyPlanningDay
  } from "./daily-dashboard-state";

  export let dailyApi: DailyDashboardAdapter | undefined = undefined;
  export let onOpenCapture: (() => void) | undefined = undefined;

  let planningDay: DailyPlanningDay = "today";
  let selectedDate = dailyDateForPlanningDay(planningDay);
  let snapshot: DailyDashboardSnapshot | undefined;
  let metadata: DailyPlanMetadataPresentation = {};
  let candidates: DailyPlanningCandidate[] = [];
  let loading = true;
  let error = "";
  let busy = "";
  let plannerExpanded = true;
  let candidatesExpanded = false;
  let previewItemId = "";
  let previewPage: "overview" | "item" | "result" = "overview";
  let themeDraft = "";
  let draftText = "";
  let draftKind: DailyPlanItemKind = "task";
  let draftPolicy: DailyDevicePolicy = "none";
  let draftSchedule = "";
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
  let generatedSummary: DailySummaryPresentation | undefined;
  let generatedSummaryFingerprint = "";
  let summary: DailySummaryPresentation | undefined;
  let hierarchy: DailyPlanHierarchy | undefined;
  let normalizationPreview: DailyPlanNormalizationPreview | undefined;
  let normalizationUndoToken = "";
  let timingByItem: Record<string, DailyTaskTimingSnapshot> = {};
  let timerEventsByItem: Record<string, DailyTimerEvent[]> = {};
  let collapsedGroups = new Set<string>();
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
  $: items = snapshot?.plan.items ?? [];
  $: overview = selectDailyOverview(items);
  $: todoItems = items.filter((item) => item.status === "todo");
  $: inProgressItems = items.filter((item) => item.status === "in-progress");
  $: doneItems = items.filter((item) => item.status === "done");
  $: groupedItems = groupDailyItems(items);
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
          groupLabel: displayGroupLabel(item.lineage?.groups.at(-1)),
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
      hierarchy = undefined;
      timingByItem = {};
      timerEventsByItem = {};
      clearGeneratedSummary();
      return;
    }
    loading = true;
    error = "";
    try {
      const [nextSnapshot, nextMetadata, nextCandidates, nextHierarchy] = await Promise.all([
        dailyApi.getSnapshot(date),
        dailyApi.getPlanMetadata?.(date) ?? Promise.resolve({}),
        candidatesExpanded
          ? dailyApi.listPlanningCandidates?.(date) ?? Promise.resolve([])
          : Promise.resolve(candidates),
        dailyApi.getPlanHierarchy?.(date) ?? Promise.resolve(undefined)
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

  async function run(id: string, action: () => void | Promise<void>): Promise<void> {
    if (busy) return;
    busy = id;
    error = "";
    try {
      await action();
      await refresh();
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
    draftPrimary = false;
    draftMinimum = false;
    if (draftPolicy !== "scheduled") draftSchedule = "";
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

  function groupDailyItems(source: DailyPlanItem[]): Array<{
    key: string;
    label: string;
    path?: string;
    group?: DailyPlanGroup;
    items: Array<{ item: DailyPlanItem; index: number }>;
  }> {
    const result: Array<{
      key: string;
      label: string;
      path?: string;
      group?: DailyPlanGroup;
      items: Array<{ item: DailyPlanItem; index: number }>;
    }> = [];
    const byKey = new Map<string, (typeof result)[number]>();
    source.forEach((item, index) => {
      const groups = item.lineage?.groups ?? [];
      const group = groups.at(-1)
        ?? (item.groupId ? hierarchy?.groups.find((candidate) => candidate.id === item.groupId) : undefined);
      const key = group?.id ?? "__ungrouped";
      let bucket = byKey.get(key);
      if (!bucket) {
        bucket = {
          key,
          label: displayGroupLabel(group),
          path: groups.length > 1 ? groups.map((value) => displayGroupLabel(value)).join(" / ") : undefined,
          group,
          items: []
        };
        byKey.set(key, bucket);
        result.push(bucket);
      }
      bucket.items.push({ item, index });
    });
    return result;
  }

  function displayGroupLabel(group: DailyPlanGroup | undefined): string {
    if (!group) return "未分类";
    return group.text
      .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/gu, (_match, target: string, alias?: string) => alias?.trim() || target.trim())
      .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
      .trim() || group.links[0]?.label || group.links[0]?.linkText || "未分类";
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
      <span>{selectedDate}</span>
      {#if dailyApi.openPlanSource}
        <button class="source-button" type="button" on:click={() => dailyApi?.openPlanSource?.(selectedDate)}>
          <BookOpen size={14} />
          打开计划原文
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
          <CalendarClock size={17} />
          <span>
            <strong>编排{planningDay === "today" ? "今天" : "明天"}</strong>
            <small>用户负责承诺；Echo 和 AI 只提供候选。</small>
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
          <div class="planning-footer">
            <label class="check"><input bind:checked={draftPrimary} type="checkbox" />最重要的一件事</label>
            <label class="check"><input bind:checked={draftMinimum} type="checkbox" />再乱也至少完成</label>
            <button class="primary" type="submit" disabled={!draftText.trim() || !dailyApi.createItem || busy === "create"}>
              <Plus size={15} />
              添加到{planningDay === "today" ? "今天" : "明天"}
            </button>
          </div>
        </form>

        <section class="candidate-slot">
          <button type="button" aria-expanded={candidatesExpanded} on:click={toggleCandidates}>
            <Sparkles size={15} />
            也许值得重新捞回来
            <ChevronDown class={candidatesExpanded ? "" : "rotated"} size={15} />
          </button>
          {#if candidatesExpanded}
            {#if !dailyApi.listPlanningCandidates}
              <p>候选接口尚未接入。ToThink、ToWrite、Inbox 与旧笔记不会被自动加入计划。</p>
            {:else if candidates.length === 0}
              <p>目前没有新的规划候选。</p>
            {:else}
              <div class="candidate-list">
                {#each candidates as candidate (candidate.id)}
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

    <div class="daily-main-grid">
      <section class="plan-list-card">
        <header>
          <div>
            <h3>{planningDay === "today" ? "今日" : "明日"}清单</h3>
            <p>Markdown 顺序就是设备顺序；未完成项目不会自动迁移。</p>
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
            <button type="button" title="刷新计划" aria-label="刷新计划" on:click={() => refresh()}>
              <RefreshCw size={15} />
            </button>
          </div>
        </header>

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
                      <li><span>{displayGroupLabel(group)}</span><small>第 {group.line} 行</small></li>
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

        {#if items.length === 0}
          <div class="daily-empty">
            <Circle size={24} />
            <strong>这一天还没有计划</strong>
            <p>可先使用“规范化这份清单”，把现有普通叶子列表安全转换成任务。</p>
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
            <article class:current={item.status === "in-progress"} class:completed={item.status === "done"} class="plan-item">
              <button
                class="check-button"
                type="button"
                disabled={item.status === "done" ? !dailyApi.reopenItem || Boolean(busy) : !dailyApi.completeItem || Boolean(busy)}
                title={item.status === "done" ? "重新打开" : "标记完成"}
                on:click={() => item.status === "done"
                  ? run(`reopen:${item.id}`, () => dailyApi?.reopenItem?.(item.id, item.revision))
                  : run(`complete:${item.id}`, () => dailyApi?.completeItem?.(item.id, item.revision))}
              >
                {#if item.status === "done"}<Check size={17} />{:else}<Circle size={17} />{/if}
              </button>
              <button class="item-main" type="button" on:click={() => {
                previewItemId = item.id;
                previewPage = "item";
              }}>
                <span class="item-topline">
                  <span class={`kind kind-${item.kind}`}>{kindLabel(item.kind)}</span>
                  {#if item.primary}<span class="flag">主线</span>{/if}
                  {#if item.minimum}<span class="flag minimum">最低承诺</span>{/if}
                  {#if item.scheduledFor}<time datetime={item.scheduledFor}>{formatDateTime(item.scheduledFor)}</time>{/if}
                </span>
                <strong>{item.text}</strong>
                <small>{item.nextStep ? `下一步：${item.nextStep}` : policyLabel(item.devicePolicy)}</small>
                <span class="resolved-target">
                  <Target size={12} />
                  <span>{targetDisplayLabel(item)}</span>
                  <em>{targetSourceLabel(item)}</em>
                </span>
              </button>
              <div class="item-actions">
                {#if dailyApi.moveItem}
                  <button type="button" title="上移" disabled={index === 0 || Boolean(busy)} on:click={() => run(`up:${item.id}`, () => dailyApi?.moveItem?.(item.id, item.revision, "up"))}><ArrowUp size={14} /></button>
                  <button type="button" title="下移" disabled={index === items.length - 1 || Boolean(busy)} on:click={() => run(`down:${item.id}`, () => dailyApi?.moveItem?.(item.id, item.revision, "down"))}><ArrowDown size={14} /></button>
                {/if}
                {#if dailyApi.updateItem && item.status !== "done"}
                  <button type="button" title="编辑规划字段" on:click={() => beginEdit(item)}><PenLine size={14} /></button>
                {/if}
                {#if dailyApi.openItem}
                  <button type="button" title="打开目标" on:click={() => dailyApi?.openItem?.(item)}><BookOpen size={14} /></button>
                {/if}
                {#if dailyApi.sendItemToDevice && item.status !== "done"}
                  <button type="button" title="立即发送到墨水屏" on:click={() => run(`send:${item.id}`, () => dailyApi?.sendItemToDevice?.(item.id, item.revision))}><MonitorUp size={14} /></button>
                {/if}
              </div>
              {#if editingItemId === item.id}
                <form class="inline-editor" on:submit|preventDefault={() => saveItem(item)}>
                  <label class="wide"><span>内容</span><input bind:value={editText} required /></label>
                  <label><span>目标</span><input bind:value={editGoal} /></label>
                  <label><span>最小下一步</span><input bind:value={editNextStep} /></label>
                  <label><span>目标笔记</span><input bind:value={editTarget} /></label>
                  <label><span>预计分钟</span><input bind:value={editEstimate} type="number" min="1" /></label>
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
      </section>

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
    </div>

    {#if planningDay === "today"}
      <details class="review-card">
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
    gap: 14px;
    --daily-border: var(--background-modifier-border);
    --daily-soft: var(--background-secondary);
    --daily-raised: var(--background-primary);
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

  .day-switcher {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .day-switcher > button:not(.source-button) {
    padding: 6px 16px;
    border: 1px solid var(--daily-border);
    color: var(--text-muted);
    background: transparent;
  }

  .day-switcher > button.active {
    color: var(--text-normal);
    background: var(--daily-soft);
    font-weight: 700;
  }

  .day-switcher > span {
    margin-left: 6px;
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .source-button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: auto;
    color: var(--text-muted);
    background: transparent;
  }

  .focus-card,
  .planner-card,
  .plan-list-card,
  .eink-card,
  .review-card {
    border: 1px solid var(--daily-border);
    border-radius: 13px;
    background: var(--daily-raised);
  }

  .focus-card {
    padding: 16px;
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
    font-size: 1.2rem;
  }

  .focus-progress {
    text-align: right;
  }

  .focus-progress strong {
    font-size: 1.25rem;
  }

  .focus-current {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    margin-top: 16px;
    padding: 12px;
    border-radius: 10px;
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
    margin: 10px 0 0;
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
    margin-top: 14px;
    color: var(--text-muted);
  }

  .focus-progress-bar {
    overflow: hidden;
    height: 4px;
    margin-top: 14px;
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
    padding: 12px 15px;
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
    padding: 14px 15px;
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
    grid-template-columns: minmax(0, 1.45fr) minmax(250px, 0.75fr);
    gap: 12px;
    align-items: start;
  }

  .plan-list-card,
  .eink-card {
    overflow: hidden;
  }

  .plan-list-card > header,
  .eink-card > header,
  .summary-card > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
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
    padding: 5px;
    color: var(--text-muted);
    background: transparent;
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
    padding: 5px 8px;
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
    padding: 10px 12px;
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
    display: flex;
    align-items: flex-start;
    gap: 2px;
  }

  .item-actions button {
    padding: 5px;
    color: var(--text-muted);
    background: transparent;
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

  @media (max-width: 860px) {
    .daily-main-grid {
      grid-template-columns: 1fr;
    }

    .planning-fields,
    .daily-metrics,
    .timing-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 560px) {
    .day-switcher {
      flex-wrap: wrap;
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
