<script lang="ts">
  import {
    Bookmark,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Inbox,
    LayoutDashboard,
    Pause,
    Pin,
    PinOff,
    Play,
    RefreshCw
  } from "lucide-svelte";
  import { onDestroy, onMount } from "svelte";
  import type { DailyPlanItem } from "../daily/types";
  import type { TaskPoolDocument, TaskPoolItem } from "../daily/task-pool-types";
  import type { DailyTaskTimingSnapshot } from "../daily/task-timer-types";
  import { selectDailyOverview } from "./daily-dashboard-state";
  import { floatingTaskPoolSummary } from "./today-floating-state";
  import type {
    DailyDashboardAdapter,
    DailyDashboardSnapshot
  } from "./daily-dashboard-types";

  export let dailyApi: DailyDashboardAdapter;
  export let initialCollapsed = false;
  export let initialPinned = true;
  export let initialSurface: "today" | "pool" = "today";
  export let onCollapsedChange: ((collapsed: boolean) => void) | undefined = undefined;
  export let onPinnedChange: ((pinned: boolean) => void) | undefined = undefined;
  export let onSurfaceChange: ((surface: "today" | "pool") => void) | undefined = undefined;
  export let onOpenDashboard: (() => void) | undefined = undefined;
  export let onOpenTaskPool: (() => void) | undefined = undefined;

  let snapshot: DailyDashboardSnapshot | undefined;
  let taskPool: TaskPoolDocument | undefined;
  let collapsed = initialCollapsed;
  let pinned = initialPinned;
  let surface = initialSurface;
  let busy = "";
  let message = "";
  let error = "";
  let currentTiming: DailyTaskTimingSnapshot | undefined;
  let hasCheckpoint = false;
  let unsubscribe: (() => void) | undefined;
  let loadSerial = 0;
  const surfaceControlName = `towrite-today-surface-${Math.random().toString(36).slice(2)}`;

  $: overview = selectDailyOverview(snapshot?.plan.items ?? []);
  $: progress = overview.total ? Math.round((overview.done / overview.total) * 100) : 0;
  $: current = overview.current;
  $: poolSummary = floatingTaskPoolSummary(taskPool?.items ?? []);

  onMount(() => {
    unsubscribe = dailyApi.subscribe?.(() => {
      void reload();
    });
    void reload();
  });

  onDestroy(() => unsubscribe?.());

  async function reload(): Promise<void> {
    const serial = ++loadSerial;
    try {
      const next = await dailyApi.getSnapshot();
      if (serial !== loadSerial) return;
      snapshot = next;
      error = "";
      if (dailyApi.getTaskPool) {
        try {
          taskPool = await dailyApi.getTaskPool();
        } catch (cause) {
          if (serial !== loadSerial) return;
          error = cause instanceof Error ? cause.message : String(cause);
        }
      }
      const item = selectDailyOverview(next?.plan.items ?? []).current;
      const [timing, checkpoint] = item
        ? await Promise.all([
          dailyApi.getItemTiming?.(item.id, item.estimateMinutes),
          dailyApi.hasItemCheckpoint?.(item)
        ])
        : [undefined, false];
      if (serial !== loadSerial) return;
      currentTiming = timing;
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

  function switchSurface(next: "today" | "pool"): void {
    surface = next;
    onSurfaceChange?.(next);
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

  async function assignToToday(item: TaskPoolItem): Promise<void> {
    if (!dailyApi.assignPoolTask || !snapshot?.date) return;
    await run(
      `assign:${item.taskId}`,
      () => dailyApi.assignPoolTask?.(item.taskId, item.revision, snapshot!.date),
      "已加入今天"
    );
    surface = "today";
    onSurfaceChange?.("today");
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
  aria-label="ToWrite 今日悬浮卡"
  data-surface={surface}
>
  <header class="widget-header">
    <button
      class="header-summary"
      type="button"
      aria-expanded={!collapsed}
      aria-label={collapsed ? "展开今日悬浮卡" : "折叠今日悬浮卡"}
      on:click={toggleCollapsed}
    >
      <span class="date">{surface === "pool" ? "任务池" : snapshot?.date.slice(5).replace("-", ".") ?? "今日"}</span>
      <strong>{surface === "pool" ? poolSummary.availableCount : `${overview.done}/${overview.total}`}</strong>
      <span class="header-current">{surface === "pool"
        ? `${poolSummary.planned} 已安排 · ${poolSummary.done} 已完成`
        : current?.text ?? "今天还没有待办"}</span>
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

  {#if surface === "today"}
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
  {:else}
    <div class="progress pool-divider" aria-hidden="true"></div>
  {/if}

  {#if !collapsed}
    <div class="widget-body">
      <nav class="surface-switcher" aria-label="今日与任务池">
        <input
          id={`${surfaceControlName}-today`}
          class="surface-radio"
          type="radio"
          name={surfaceControlName}
          value="today"
          bind:group={surface}
          on:change={() => switchSurface("today")}
        />
        <label
          for={`${surfaceControlName}-today`}
          class:active={surface === "today"}
          on:pointerdown|stopPropagation={() => switchSurface("today")}
        >
          今日 <span>{overview.total}</span>
        </label>
        <input
          id={`${surfaceControlName}-pool`}
          class="surface-radio"
          type="radio"
          name={surfaceControlName}
          value="pool"
          bind:group={surface}
          on:change={() => switchSurface("pool")}
        />
        <label
          for={`${surfaceControlName}-pool`}
          class:active={surface === "pool"}
          on:pointerdown|stopPropagation={() => switchSurface("pool")}
        >
          任务池 <span>{poolSummary.availableCount}</span>
        </label>
      </nav>

      {#key surface}
      {#if surface === "today"}
      <div class="surface-content today-surface">
        <div class="theme-row">
        <span>今日主题</span>
        <strong>{snapshot?.plan.metadata?.theme || "守住今天最重要的一件事"}</strong>
        </div>

        {#if current}
        <article class="current-card">
          <div class="current-label">
            <span>{currentTiming?.status === "paused" ? "已暂停" : current.status === "in-progress" ? "进行中" : "当前"}</span>
            {#if current.lineage?.groups?.length}
              <small>{current.lineage.groups.map((group) => group.text).join(" / ")}</small>
            {/if}
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
        {:else}
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true"><CalendarDays size={20} /></span>
          <strong>{overview.total ? "今天的任务已经完成" : "今天还没有计划"}</strong>
          <small>{poolSummary.availableCount
            ? `任务池里有 ${poolSummary.availableCount} 条待安排事项`
            : "先在笔记里写一个待办，或打开完整计划进行编排"}</small>
          {#if poolSummary.availableCount}
            <button type="button" on:click={() => switchSurface("pool")}>从任务池选择</button>
          {/if}
          <button type="button" on:click={() => onOpenDashboard?.()}>打开今日计划</button>
        </div>
        {/if}

        {#if overview.upcoming.length}
        <section class="upcoming" aria-label="接下来">
          <h3>接下来</h3>
          {#each overview.upcoming as item, index (item.id)}
            <div class="upcoming-row">
              <span class="order">{index + 2}</span>
              <button type="button" disabled={Boolean(busy)} on:click={() => startAndOpen(item)}>
                <strong>{item.text}</strong>
                <small>{targetLabel(item)}</small>
              </button>
              <button
                class="icon-button"
                type="button"
                disabled={Boolean(busy)}
                aria-label={`打开 ${item.text}`}
                title="只打开"
                on:click={() => openOnly(item)}
              >
                <ExternalLink size={14} />
              </button>
            </div>
          {/each}
        </section>
        {/if}

        <footer>
        <button type="button" on:click={() => onOpenDashboard?.()}>
          <LayoutDashboard size={14} />打开完整今日计划
        </button>
        <button
          class="icon-button"
          type="button"
          aria-label="刷新"
          title="刷新"
          disabled={Boolean(busy)}
          on:click={() => reload()}
        >
          <RefreshCw size={14} />
        </button>
        </footer>
      </div>
      {:else}
      <div class="surface-content pool-surface">
        <section class="pool-panel" aria-label="总任务池">
          <header>
            <span>
              <Inbox size={16} />
              <strong>总任务池</strong>
            </span>
            <small>{poolSummary.availableCount} 待安排 · {poolSummary.planned} 已安排 · {poolSummary.done} 已完成</small>
          </header>

          {#if poolSummary.available.length}
            <div class="pool-list">
              {#each poolSummary.available as item (item.taskId)}
                <article>
                  <div>
                    <strong>{item.text}</strong>
                    <small>
                      {[item.category, item.project, item.dueDate ? `截止 ${item.dueDate}` : undefined]
                        .filter(Boolean)
                        .join(" · ") || "尚未安排日期"}
                    </small>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(busy) || !dailyApi.assignPoolTask}
                    on:click={() => assignToToday(item)}
                  >
                    加入今天
                  </button>
                </article>
              {/each}
            </div>
            {#if poolSummary.availableCount > poolSummary.available.length}
              <p class="pool-more">还有 {poolSummary.availableCount - poolSummary.available.length} 条，请在完整任务池中查看。</p>
            {/if}
          {:else}
            <div class="empty-state pool-empty">
              <span class="empty-icon" aria-hidden="true"><Inbox size={20} /></span>
              <strong>任务池中没有待安排项目</strong>
              <small>普通笔记里的未完成 checkbox 保存后会自动登记到这里。</small>
            </div>
          {/if}
        </section>

        <footer>
          <button type="button" on:click={() => onOpenTaskPool?.()}>
            <LayoutDashboard size={14} />打开完整任务池
          </button>
          <button
            class="icon-button"
            type="button"
            aria-label="刷新"
            title="刷新"
            disabled={Boolean(busy)}
            on:click={() => reload()}
          >
            <RefreshCw size={14} />
          </button>
        </footer>
      </div>
      {/if}
      {/key}

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
    color: var(--text-normal);
    background: var(--background-primary);
  }

  .today-floating.collapsed {
    height: auto;
  }

  button {
    font: inherit;
  }

  button:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  .widget-header {
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

  .pool-divider {
    background: var(--background-modifier-border);
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
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 12px;
    overflow: auto;
    min-height: 0;
    padding: 1px;
  }

  .surface-switcher {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3px;
    padding: 3px;
    border-radius: 9px;
    background: var(--background-secondary);
  }

  .surface-radio {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .surface-switcher label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 30px;
    border: 0;
    color: var(--text-muted);
    background: transparent;
    box-shadow: none;
    font-size: 0.72rem;
    cursor: pointer;
    user-select: none;
  }

  .surface-switcher label:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .surface-switcher label.active {
    color: var(--text-normal);
    background: var(--background-primary);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
    font-weight: 650;
  }

  .surface-radio:focus-visible + label {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 1px;
  }

  .surface-switcher label span {
    min-width: 18px;
    padding: 1px 5px;
    border-radius: 999px;
    color: var(--text-muted);
    background: var(--background-modifier-hover);
    font-size: 0.62rem;
    font-variant-numeric: tabular-nums;
  }

  .theme-row {
    display: grid;
    gap: 3px;
  }

  .theme-row span,
  .current-label span,
  .upcoming h3 {
    color: var(--text-muted);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .theme-row strong {
    font-size: 0.88rem;
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

  .upcoming {
    display: grid;
    gap: 6px;
  }

  .upcoming h3 {
    margin: 0;
  }

  .upcoming-row {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) 32px;
    align-items: center;
    gap: 5px;
    min-height: 46px;
    padding: 4px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
  }

  .upcoming-row .order {
    color: var(--text-faint);
    font-size: 0.7rem;
    text-align: center;
  }

  .upcoming-row > button:not(.icon-button) {
    display: grid;
    gap: 2px;
    min-width: 0;
    padding: 6px;
    border: 0;
    color: var(--text-normal);
    background: transparent;
    box-shadow: none;
    text-align: left;
  }

  .upcoming-row > button:not(.icon-button):hover {
    background: var(--background-modifier-hover);
  }

  .upcoming-row strong,
  .upcoming-row small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .upcoming-row strong {
    font-size: 0.76rem;
  }

  .upcoming-row small {
    color: var(--text-muted);
    font-size: 0.65rem;
  }

  .empty-state {
    display: grid;
    flex: 1;
    align-content: center;
    justify-items: center;
    gap: 8px;
    min-height: 190px;
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

  .pool-panel {
    display: grid;
    flex: 1;
    align-content: start;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 8px;
    min-height: 0;
  }

  .pool-panel > header {
    display: grid;
    gap: 3px;
  }

  .pool-panel > header > span {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .pool-panel > header small,
  .pool-list small,
  .pool-empty small {
    color: var(--text-muted);
    font-size: 0.66rem;
  }

  .pool-list {
    display: grid;
    align-content: start;
    gap: 6px;
    overflow: auto;
    min-height: 0;
  }

  .pool-more {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.66rem;
    text-align: center;
  }

  .pool-list article {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 8px 9px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
  }

  .pool-list article > div {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .pool-list strong,
  .pool-list small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pool-list strong {
    font-size: 0.76rem;
  }

  .pool-list button {
    min-height: 29px;
    padding: 4px 8px;
    white-space: nowrap;
    font-size: 0.68rem;
  }

  .pool-empty {
    padding: 30px 12px;
  }

  .empty-state button,
  footer > button:not(.icon-button) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 3px;
    border-top: 1px solid var(--background-modifier-border);
  }

  footer > button:not(.icon-button) {
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
</style>
