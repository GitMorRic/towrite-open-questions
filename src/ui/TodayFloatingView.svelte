<script lang="ts">
  import {
    Bookmark,
    Bell,
    CalendarDays,
    Check,
    ChevronLeft,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    ExternalLink,
    Focus,
    LayoutDashboard,
    ListTodo,
    Pause,
    Pin,
    PinOff,
    Play,
    RefreshCw,
    Rows3,
    Timer
  } from "lucide-svelte";
  import { onDestroy, onMount } from "svelte";
  import type { DailyPlanItem } from "../daily/types";
  import { dailyDisplayText } from "../daily/display-text";
  import type { DailyTaskTimingSnapshot } from "../daily/task-timer-types";
  import { selectDailyOverview } from "./daily-dashboard-state";
  import type {
    DailyDashboardAdapter,
    DailyDashboardConfiguration,
    DailyDashboardSnapshot,
    DailyPlanningCandidate
  } from "./daily-dashboard-types";
  import { buildFocusCarouselMessages, type FocusCarouselMessage } from "./focus-carousel";

  export let dailyApi: DailyDashboardAdapter;
  export let initialCollapsed = false;
  export let initialPinned = true;
  export let initialMode: "focus" | "list" = "focus";
  export let onCollapsedChange: ((collapsed: boolean) => void) | undefined = undefined;
  export let onPinnedChange: ((pinned: boolean) => void) | undefined = undefined;
  export let onModeChange: ((mode: "focus" | "list") => void) | undefined = undefined;
  export let onOpenDashboard: (() => void) | undefined = undefined;
  export let onOpenTaskPool: (() => void) | undefined = undefined;

  let snapshot: DailyDashboardSnapshot | undefined;
  let configuration: DailyDashboardConfiguration = {
    categoryPresets: [],
    defaultView: "list",
    focusMessages: [],
    focusMessageIntervalSeconds: 30,
    taskPoolPath: "Planning/Task Pool.md",
    autoReturnUnfinished: true
  };
  let candidates: DailyPlanningCandidate[] = [];
  let carouselMessages: FocusCarouselMessage[] = [];
  let collapsed = initialCollapsed;
  let pinned = initialPinned;
  let mode = initialMode;
  let syncedCollapsed = initialCollapsed;
  let syncedPinned = initialPinned;
  let syncedMode = initialMode;
  let messageIndex = 0;
  let clockNow = Date.now();
  let timingCapturedAt = Date.now();
  let busy = "";
  let message = "";
  let error = "";
  let currentTiming: DailyTaskTimingSnapshot | undefined;
  let hasCheckpoint = false;
  let unsubscribe: (() => void) | undefined;
  let loadSerial = 0;
  let carouselTimer = 0;
  let clockTimer = 0;

  interface CompactProjectGroup {
    id: string;
    label: string;
    items: DailyPlanItem[];
  }

  $: overview = selectDailyOverview(snapshot?.plan.items ?? []);
  $: if (initialCollapsed !== syncedCollapsed) {
    syncedCollapsed = initialCollapsed;
    collapsed = initialCollapsed;
  }
  $: if (initialPinned !== syncedPinned) {
    syncedPinned = initialPinned;
    pinned = initialPinned;
  }
  $: if (initialMode !== syncedMode) {
    syncedMode = initialMode;
    mode = initialMode;
  }
  $: progress = overview.total ? Math.round((overview.done / overview.total) * 100) : 0;
  $: current = overview.current;
  $: compactItems = snapshot?.plan.items ?? [];
  $: compactGroups = groupCompactItems(compactItems);
  $: currentMessage = carouselMessages[messageIndex % Math.max(1, carouselMessages.length)];
  $: activeSeconds = currentTiming
    ? Math.floor(currentTiming.activeMs / 1_000) + (currentTiming.status === "running"
      ? Math.max(0, Math.floor((clockNow - timingCapturedAt) / 1000))
      : 0)
    : 0;

  onMount(() => {
    unsubscribe = dailyApi.subscribe?.(() => {
      void reload();
    });
    clockTimer = window.setInterval(() => {
      clockNow = Date.now();
    }, 1_000);
    void reload(true);
  });

  onDestroy(() => {
    unsubscribe?.();
    window.clearInterval(carouselTimer);
    window.clearInterval(clockTimer);
  });

  async function reload(refreshMessages = false): Promise<void> {
    const serial = ++loadSerial;
    try {
      const next = await dailyApi.getSnapshot();
      if (serial !== loadSerial) return;
      snapshot = next;
      const [nextConfiguration, nextCandidates] = await Promise.all([
        dailyApi.getConfiguration?.() ?? configuration,
        refreshMessages || candidates.length === 0
          ? dailyApi.listPlanningCandidates?.(next.date) ?? []
          : candidates
      ]);
      if (serial !== loadSerial) return;
      configuration = nextConfiguration;
      candidates = nextCandidates;
      carouselMessages = buildFocusCarouselMessages({
        theme: next.plan.metadata?.theme,
        customMessages: configuration.focusMessages,
        candidates
      });
      messageIndex = Math.min(messageIndex, Math.max(0, carouselMessages.length - 1));
      resetCarouselTimer();
      error = "";
      const item = selectDailyOverview(next?.plan.items ?? []).current;
      const [timing, checkpoint] = item
        ? await Promise.all([
          item.timing ?? dailyApi.getItemTiming?.(item.id, item.estimateMinutes, next.date),
          dailyApi.hasItemCheckpoint?.(item)
        ])
        : [undefined, false];
      if (serial !== loadSerial) return;
      currentTiming = timing;
      timingCapturedAt = Date.now();
      hasCheckpoint = Boolean(checkpoint);
    } catch (cause) {
      if (serial !== loadSerial) return;
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  function toggleCollapsed(): void {
    collapsed = !collapsed;
    onCollapsedChange?.(collapsed);
  }

  function togglePinned(): void {
    pinned = !pinned;
    onPinnedChange?.(pinned);
  }

  function setMode(value: "focus" | "list"): void {
    mode = value;
    onModeChange?.(value);
  }

  function advanceMessage(direction: 1 | -1 = 1): void {
    if (carouselMessages.length < 2) return;
    messageIndex = (messageIndex + direction + carouselMessages.length) % carouselMessages.length;
    resetCarouselTimer();
  }

  async function openCurrentMessage(): Promise<void> {
    const candidateId = currentMessage?.candidateId;
    const candidate = candidateId ? candidates.find((item) => item.id === candidateId) : undefined;
    if (!candidate || !dailyApi.openPlanningCandidate) return;
    await run(`message:${candidate.id}`, () => dailyApi.openPlanningCandidate?.(candidate), "已打开提醒来源");
  }

  function resetCarouselTimer(): void {
    window.clearInterval(carouselTimer);
    carouselTimer = 0;
    const seconds = configuration.focusMessageIntervalSeconds;
    if (!seconds || carouselMessages.length < 2) return;
    carouselTimer = window.setInterval(() => {
      messageIndex = (messageIndex + 1) % carouselMessages.length;
    }, seconds * 1_000);
  }

  function formatFocusTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  function compactTaskText(value: string): string {
    return dailyDisplayText(value);
  }

  function compactProjectLabel(item: DailyPlanItem): string {
    const group = item.lineage?.groups?.at(-1)?.text;
    return compactTaskText(group || item.category || "未分类");
  }

  function groupCompactItems(items: DailyPlanItem[]): CompactProjectGroup[] {
    const groups = new Map<string, CompactProjectGroup>();
    for (const item of items) {
      const label = compactProjectLabel(item);
      const id = label.toLocaleLowerCase().replace(/[^\p{Letter}\p{Number}_-]+/gu, "-") || "unclassified";
      const group = groups.get(id) ?? { id, label, items: [] };
      group.items.push(item);
      groups.set(id, group);
    }
    return [...groups.values()];
  }


  async function run(key: string, action: () => void | Promise<void>, success: string): Promise<void> {
    if (busy) return;
    busy = key;
    error = "";
    message = "";
    try {
      await action();
      message = success;
      await reload();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = "";
    }
  }

  async function startAndOpen(item: DailyPlanItem): Promise<void> {
    await run(`primary:${item.id}`, async () => {
      if (dailyApi.startAndOpenItem) {
        await dailyApi.startAndOpenItem(item);
        return;
      }
      if (item.status === "todo") await dailyApi.startItem?.(item.id, item.revision);
      await dailyApi.openItem?.(item);
    }, hasCheckpoint && item.id === current?.id ? "已返回上次断点" : "已打开目标");
  }

  async function openOnly(item: DailyPlanItem): Promise<void> {
    await run(`open:${item.id}`, () => dailyApi.openItem?.(item), "已打开目标");
  }

  async function remember(item: DailyPlanItem): Promise<void> {
    await run(`remember:${item.id}`, async () => {
      if (dailyApi.pauseAndRememberItem) {
        await dailyApi.pauseAndRememberItem(item);
      } else if (currentTiming?.status === "running") {
        await dailyApi.pauseItem?.(item.id, item.revision, currentTiming.timingRevision);
      }
    }, "已暂停并记住当前位置");
  }

  async function complete(item: DailyPlanItem): Promise<void> {
    await run(`complete:${item.id}`, () => dailyApi.completeItem?.(item.id, item.revision), "已完成");
  }


  function targetLabel(item: DailyPlanItem): string {
    return item.targetResolution?.displayLabel || item.target || "计划原文";
  }

  function primaryLabel(item: DailyPlanItem): string {
    const target = item.targetResolution?.webTarget;
    if (target?.kind === "web") return item.status === "todo" ? "开始并打开网页" : "打开网页";
    if (hasCheckpoint && item.id === current?.id) return "返回阅读断点";
    if (item.kind === "create_note") return "继续记录";
    if (currentTiming?.status === "paused" && item.id === current?.id) return "继续并打开";
    return item.status === "todo" ? "开始并打开" : "继续工作";
  }

</script>

<section
  class:collapsed
  class="today-floating"
  aria-label="ToWrite 现在专注"
  data-surface="focus-now"
>
  <header class="widget-header">
    <button
      class="header-summary"
      type="button"
      aria-expanded={!collapsed}
      aria-label={collapsed ? "展开现在专注" : "折叠现在专注"}
      on:click={toggleCollapsed}
    >
      <span class="date">{snapshot?.date.slice(5).replace("-", ".") ?? "今日"}</span>
      <strong>{overview.done}/{overview.total}</strong>
      <span class="header-current">{current?.text ?? "今天还没有待办"}</span>
    </button>
    <button
      class:active={pinned}
      class="icon-button"
      type="button"
      aria-label={pinned ? "取消固定此小窗" : "固定此小窗"}
      aria-pressed={pinned}
      title={pinned ? "已固定：防止视图被替换" : "固定此小窗"}
      on:click={togglePinned}
    >
      {#if pinned}<Pin size={16} />{:else}<PinOff size={16} />{/if}
    </button>
    <button
      class="icon-button"
      type="button"
      aria-label={collapsed ? "展开" : "折叠"}
      aria-expanded={!collapsed}
      on:click={toggleCollapsed}
    >
      {#if collapsed}<ChevronDown size={17} />{:else}<ChevronUp size={17} />{/if}
    </button>
  </header>

  <div
      class="progress"
      role="progressbar"
      aria-label="今日进度"
      aria-valuemin="0"
      aria-valuemax={overview.total}
      aria-valuenow={overview.done}
    >
      <i style={`--today-progress:${progress}%`}></i>
  </div>

  {#if !collapsed}
    <div class="widget-body">
      <div class="surface-content today-surface">
        <nav class="focus-mode-switcher" aria-label="现在专注显示方式">
          <button class:active={mode === "focus"} type="button" on:click={() => setMode("focus")}>
            <Focus size={14} />现在专注
          </button>
          <button class:active={mode === "list"} type="button" on:click={() => setMode("list")}>
            <Rows3 size={14} />今日任务
          </button>
        </nav>

        {#if currentMessage}
          <section class="message-carousel" aria-label="焦点与提醒轮播">
            <button class="icon-button" type="button" disabled={carouselMessages.length < 2} aria-label="上一条提醒" on:click={() => advanceMessage(-1)}>
              <ChevronLeft size={15} />
            </button>
            <button class="message-content" type="button" disabled={!currentMessage.candidateId || !dailyApi.openPlanningCandidate} title={currentMessage.candidateId ? "打开这条提醒的来源" : undefined} on:click={openCurrentMessage}>
              <span><Bell size={12} />{currentMessage.source}{carouselMessages.length > 1 ? ` · ${messageIndex + 1}/${carouselMessages.length}` : ""}</span>
              <strong>{currentMessage.text}</strong>
              {#if currentMessage.detail}<small>{currentMessage.detail}</small>{/if}
            </button>
            <button class="icon-button" type="button" disabled={carouselMessages.length < 2} aria-label="下一条提醒" on:click={() => advanceMessage(1)}>
              <ChevronRight size={15} />
            </button>
          </section>
        {/if}

        <div class="focus-content">
        {#if mode === "focus" && current}
        <article class="current-card">
          <div class="current-label">
            <span>{currentTiming?.status === "paused" ? "已暂停" : current.status === "in-progress" ? "进行中" : "当前"}</span>
            {#if current.lineage?.groups?.length}
              <small>{current.lineage.groups.map((group) => group.text).join(" / ")}</small>
            {/if}
          </div>

          <div class="focus-clock" aria-label="当前任务投入时间">
            <Timer size={16} />
            <strong>{formatFocusTime(activeSeconds)}</strong>
            <small>{current.estimateMinutes ? `预计 ${current.estimateMinutes} 分钟` : "未设置预计时间"}</small>
          </div>

          <button
            class="task-primary"
            type="button"
            disabled={Boolean(busy)}
            on:click={() => startAndOpen(current)}
          >
            <strong>{current.text}</strong>
            {#if current.nextStep}<small>下一步 · {current.nextStep}</small>{/if}
            <span><Play size={14} />{primaryLabel(current)}</span>
          </button>

          <div class="target-row">
            <button
              class="target-chip"
              type="button"
              disabled={Boolean(busy)}
              title="只打开目标，不改变任务状态"
              on:click={() => openOnly(current)}
            >
              <ExternalLink size={13} />
              <span>{targetLabel(current)}</span>
            </button>
            {#if dailyApi.pauseAndRememberItem}
              <button
                class="icon-button"
                type="button"
                disabled={Boolean(busy)}
                aria-label="稍后继续并记住当前位置"
                title="稍后继续：暂停并保存当前阅读断点"
                on:click={() => remember(current)}
              >
                {#if currentTiming?.status === "running"}<Pause size={15} />{:else}<Bookmark size={15} />{/if}
              </button>
            {/if}
            {#if dailyApi.completeItem && current.status !== "done"}
              <button
                class="icon-button"
                type="button"
                disabled={Boolean(busy)}
                aria-label="完成当前任务"
                title="完成"
                on:click={() => complete(current)}
              >
                <Check size={16} />
              </button>
            {/if}
          </div>
        </article>
        {:else if mode === "list"}
          {#if compactGroups.length}
            <section class="compact-tasks" aria-label="按项目分组的今日任务">
              <p class="compact-description">今天的全部任务，按项目折叠；点击任务会设为当前并打开。</p>
              {#each compactGroups as group (group.id)}
                <details class="compact-project" open>
                  <summary><span>{group.label}</span><em>{group.items.filter((item) => item.status === "done").length}/{group.items.length}</em><ChevronDown size={13} /></summary>
                  <div>
                    {#each group.items as item, index (item.id)}
                      <button
                        class:done={item.status === "done"}
                        type="button"
                        disabled={Boolean(busy)}
                        on:click={() => item.status === "done" ? openOnly(item) : startAndOpen(item)}
                      >
                        <span class="compact-status">{item.status === "done" ? "✓" : item.status === "in-progress" ? "●" : index + 1}</span>
                        <span><strong>{compactTaskText(item.text)}</strong><small>{item.nextStep || targetLabel(item)}</small></span>
                        <ExternalLink size={13} />
                      </button>
                    {/each}
                  </div>
                </details>
              {/each}
            </section>
          {:else}
            <div class="empty-state compact-empty"><strong>今天还没有计划</strong></div>
          {/if}
        {:else}
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true"><CalendarDays size={20} /></span>
          <strong>{overview.total ? "今天的任务已经完成" : "今天还没有计划"}</strong>
          <small>可以前往工作池，从任务、问题和笔记中安排今天。</small>
          {#if onOpenTaskPool}<button type="button" on:click={() => onOpenTaskPool?.()}>从工作池安排</button>{/if}
          <button type="button" on:click={() => onOpenDashboard?.()}>打开今日计划</button>
        </div>
        {/if}
        </div>

        <div class="focus-footer" role="navigation" aria-label="现在专注快捷操作">
        <button type="button" on:click={() => onOpenDashboard?.()}>
          <LayoutDashboard size={14} />打开工作台
        </button>
        {#if onOpenTaskPool}<button type="button" on:click={() => onOpenTaskPool?.()}><ListTodo size={14} />工作池</button>{/if}
        <button
          class="icon-button"
          type="button"
          aria-label="刷新"
          title="刷新"
          disabled={Boolean(busy)}
          on:click={() => reload(true)}
        >
          <RefreshCw size={14} />
        </button>
        </div>
      </div>

      <div class="status-region" aria-live="polite">
        {#if error}<span class="error" role="alert">{error}</span>{:else if message}<span>{message}</span>{/if}
      </div>
    </div>
  {/if}
</section>

<style>
  :global(.towrite-today-floating-host) {
    height: 100%;
    padding: 0 !important;
    background: var(--background-primary);
  }

  .today-floating {
    display: flex;
    flex-direction: column;
    min-width: 280px;
    height: 100%;
    isolation: isolate;
    color: var(--text-normal);
    background: var(--background-primary);
    pointer-events: auto;
    -webkit-app-region: no-drag;
  }

  .today-floating.collapsed {
    height: auto;
  }

  button {
    font: inherit;
    pointer-events: auto;
    -webkit-app-region: no-drag;
  }

  button:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  .widget-header {
    position: relative;
    z-index: 5;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34px 34px;
    align-items: center;
    gap: 4px;
    padding: 8px 10px 6px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .header-summary {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: baseline;
    gap: 7px;
    min-width: 0;
    padding: 5px 4px;
    border: 0;
    color: inherit;
    background: transparent;
    box-shadow: none;
    text-align: left;
  }

  .header-summary:hover {
    background: var(--background-modifier-hover);
  }

  .header-summary .date {
    color: var(--text-muted);
    font-size: 0.72rem;
  }

  .header-summary strong {
    font-variant-numeric: tabular-nums;
    font-size: 0.76rem;
  }

  .header-current {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 0.72rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    min-width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid transparent;
    color: var(--text-muted);
    background: transparent;
    box-shadow: none;
  }

  .icon-button:hover,
  .icon-button.active {
    border-color: var(--background-modifier-border);
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .progress {
    height: 3px;
    background: var(--background-modifier-border);
  }

  .progress i {
    display: block;
    width: var(--today-progress);
    height: 100%;
    background: var(--interactive-accent);
    transition: width 180ms ease;
  }

  .widget-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
    min-height: 0;
    padding: 12px;
  }

  .surface-content {
    display: grid;
    flex: 1;
    grid-template-areas:
      "modes"
      "messages"
      "content"
      "actions";
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    gap: 10px;
    overflow: hidden;
    min-height: 0;
    padding: 1px;
  }

  .focus-content {
    position: relative;
    z-index: 1;
    grid-area: content;
    display: flex;
    flex-direction: column;
    overflow: auto;
    min-height: 0;
    padding: 1px;
    scrollbar-gutter: stable;
  }

  .focus-mode-switcher {
    position: relative;
    z-index: 4;
    grid-area: modes;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3px;
    padding: 3px;
    border-radius: 9px;
    background: var(--background-secondary);
  }

  .focus-mode-switcher button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-height: 31px;
    border: 0;
    color: var(--text-muted);
    background: transparent;
    box-shadow: none;
    font-size: 0.72rem;
  }

  .focus-mode-switcher button.active {
    color: var(--text-normal);
    background: var(--background-primary);
    box-shadow: 0 1px 3px rgb(0 0 0 / 9%);
  }

  .message-carousel {
    position: relative;
    z-index: 3;
    grid-area: messages;
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) 32px;
    align-items: center;
    gap: 6px;
    min-height: 72px;
    padding: 8px 4px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 10px;
    background: var(--background-secondary-alt);
    overflow: hidden;
  }

  .message-content {
    display: grid;
    gap: 3px;
    min-width: 0;
    padding: 0;
    border: 0;
    box-shadow: none;
    color: inherit;
    background: transparent;
    text-align: center;
  }

  .message-content:disabled { opacity: 1; cursor: default; }

  .message-carousel span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: var(--text-muted);
    font-size: 0.64rem;
  }

  .message-carousel strong,
  .message-carousel small {
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  .message-carousel strong {
    -webkit-line-clamp: 2;
    font-size: 0.83rem;
    line-height: 1.35;
  }

  .message-carousel small {
    -webkit-line-clamp: 1;
    color: var(--text-faint);
    font-size: 0.65rem;
  }

  .current-label span {
    color: var(--text-muted);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .current-card {
    display: grid;
    gap: 8px;
    padding: 11px;
    border: 1px solid var(--background-modifier-border);
    border-left: 3px solid var(--interactive-accent);
    border-radius: 10px;
    background: var(--background-secondary);
  }

  .focus-clock {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: center;
    gap: 6px;
    padding: 7px 9px;
    border-radius: 8px;
    color: var(--text-muted);
    background: var(--background-primary);
  }

  .focus-clock strong {
    color: var(--text-normal);
    font-variant-numeric: tabular-nums;
    font-size: 1rem;
  }

  .focus-clock small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .compact-tasks {
    display: grid;
    gap: 5px;
  }

  .compact-description {
    margin: 0 2px 3px;
    color: var(--text-muted);
    font-size: 0.66rem;
  }

  .compact-project {
    overflow: hidden;
    border: 1px solid var(--background-modifier-border);
    border-radius: 9px;
    background: var(--background-primary);
  }

  .compact-project > summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 16px;
    align-items: center;
    gap: 6px;
    padding: 7px 9px;
    cursor: pointer;
    list-style: none;
    font-size: 0.72rem;
    font-weight: 700;
  }

  .compact-project > summary::-webkit-details-marker {
    display: none;
  }

  .compact-project > summary:hover {
    background: var(--background-modifier-hover);
  }

  .compact-project > summary em {
    color: var(--text-muted);
    font-style: normal;
    font-size: 0.64rem;
  }

  .compact-project[open] > summary :global(svg) {
    transform: rotate(180deg);
  }

  .compact-project > div {
    display: grid;
    gap: 4px;
    padding: 0 5px 5px;
  }

  .compact-project > div > button {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) 18px;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-height: 48px;
    padding: 6px 8px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    color: var(--text-normal);
    background: var(--background-primary);
    box-shadow: none;
    text-align: left;
  }

  .compact-project > div > button:hover {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .compact-project > div > button.done {
    opacity: 0.58;
  }

  .compact-project > div > button > span:not(.compact-status) {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .compact-tasks strong,
  .compact-tasks small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .compact-tasks strong {
    font-size: 0.76rem;
  }

  .compact-tasks small,
  .compact-status {
    color: var(--text-muted);
    font-size: 0.65rem;
  }

  .compact-status {
    text-align: center;
  }

  .compact-empty {
    min-height: 120px;
  }

  .current-label {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .current-label small {
    overflow: hidden;
    color: var(--text-faint);
    font-size: 0.65rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .task-primary {
    display: grid;
    gap: 6px;
    width: 100%;
    min-height: 62px;
    padding: 9px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    color: var(--text-normal);
    background: var(--background-primary);
    box-shadow: none;
    text-align: left;
  }

  .task-primary:hover {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .task-primary strong {
    line-height: 1.4;
  }

  .task-primary small {
    color: var(--text-muted);
    line-height: 1.35;
  }

  .task-primary span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--text-accent);
    font-size: 0.72rem;
    font-weight: 600;
  }

  .target-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .target-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    overflow: hidden;
    min-width: 0;
    height: 32px;
    padding: 0 9px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 999px;
    color: var(--text-muted);
    background: transparent;
    box-shadow: none;
    font-size: 0.7rem;
  }

  .target-chip span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .target-row .target-chip {
    flex: 1;
  }

  .empty-state {
    display: grid;
    flex: 1;
    align-content: center;
    justify-items: center;
    gap: 8px;
    min-height: 210px;
    padding: 24px 12px;
    color: var(--text-muted);
    text-align: center;
  }

  .empty-state strong {
    color: var(--text-normal);
  }

  .empty-state small {
    max-width: 260px;
    line-height: 1.45;
  }

  .empty-icon {
    display: grid;
    width: 38px;
    height: 38px;
    place-items: center;
    border-radius: 11px;
    color: var(--text-muted);
    background: var(--background-secondary);
  }

  .empty-state button,
  .focus-footer > button:not(.icon-button) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .focus-footer {
    position: relative;
    z-index: 4;
    grid-area: actions;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 36px;
    padding-top: 3px;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
  }

  .focus-footer > button:not(.icon-button) {
    min-height: 32px;
    color: var(--text-muted);
    background: transparent;
    box-shadow: none;
  }

  .status-region {
    min-height: 18px;
    color: var(--text-muted);
    font-size: 0.68rem;
  }

  .status-region .error {
    color: var(--text-error);
  }

  @media (prefers-reduced-motion: reduce) {
    .progress i {
      transition: none;
    }
  }

  @media (max-height: 680px) {
    .widget-body {
      gap: 7px;
      padding: 8px;
    }

    .surface-content {
      gap: 7px;
    }

    .message-carousel {
      min-height: 58px;
      padding-block: 5px;
    }

    .message-carousel small {
      display: none;
    }

    .empty-state {
      min-height: 132px;
      padding: 12px 8px;
    }
  }

  @media (max-height: 500px) {
    .message-carousel {
      min-height: 48px;
    }

    .message-carousel strong {
      -webkit-line-clamp: 1;
    }

    .empty-icon,
    .empty-state small {
      display: none;
    }

    .empty-state {
      min-height: 88px;
      grid-template-columns: repeat(2, minmax(0, auto));
      align-content: start;
    }

    .empty-state strong {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 340px) {
    .today-floating {
      min-width: 240px;
    }

    .focus-mode-switcher button,
    .focus-footer > button:not(.icon-button) {
      font-size: 0.66rem;
    }

    .focus-footer {
      gap: 2px;
    }
  }
</style>
