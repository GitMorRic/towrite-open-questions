<script lang="ts">
  import {
    Check,
    ChevronRight,
    ExternalLink,
    LayoutDashboard,
    MonitorUp
  } from "lucide-svelte";
  import { onDestroy, onMount } from "svelte";
  import type { DailyPlanItem } from "../daily/types";
  import { selectDailyOverview } from "./daily-dashboard-state";
  import type {
    DailyDashboardAdapter,
    DailyDashboardSnapshot
  } from "./daily-dashboard-types";
  import {
    parseTodayEmbedOptions,
    selectTodayEmbedItems
  } from "./today-embed-state";

  export let dailyApi: DailyDashboardAdapter;
  export let source = "";
  export let onOpenDashboard: (() => void) | undefined = undefined;
  export let onOpenFloating: (() => void) | undefined = undefined;

  const options = parseTodayEmbedOptions(source);
  let snapshot: DailyDashboardSnapshot | undefined;
  let busy = "";
  let error = "";
  let unsubscribe: (() => void) | undefined;

  $: overview = selectDailyOverview(snapshot?.plan.items ?? []);
  $: items = selectTodayEmbedItems(snapshot?.plan.items ?? [], options);
  $: progress = overview.total ? Math.round((overview.done / overview.total) * 100) : 0;

  onMount(() => {
    unsubscribe = dailyApi.subscribe?.(() => void reload());
    void reload();
  });

  onDestroy(() => unsubscribe?.());

  async function reload(): Promise<void> {
    try {
      snapshot = await dailyApi.getSnapshot();
      error = "";
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  async function openItem(item: DailyPlanItem): Promise<void> {
    if (busy) return;
    busy = item.id;
    error = "";
    try {
      if (dailyApi.startAndOpenItem) {
        await dailyApi.startAndOpenItem(item);
      } else {
        await dailyApi.openItem?.(item);
      }
      await reload();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = "";
    }
  }

  async function completeItem(item: DailyPlanItem): Promise<void> {
    if (busy || !dailyApi.completeItem) return;
    busy = item.id;
    error = "";
    try {
      await dailyApi.completeItem(item.id, item.revision);
      await reload();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = "";
    }
  }
</script>

<section class:compact={options.mode === "compact"} class="today-embed-card" aria-label="ToWrite 今日卡片">
  <header>
    <div>
      <span>ToWrite · {snapshot?.date.slice(5).replace("-", ".") ?? "今日"}</span>
      <strong>{snapshot?.plan.metadata?.theme || "守住今天最重要的一件事"}</strong>
    </div>
    <b>{overview.done} / {overview.total}</b>
  </header>

  <div
    class="today-embed-progress"
    role="progressbar"
    aria-label="今日任务进度"
    aria-valuemin="0"
    aria-valuemax={overview.total}
    aria-valuenow={overview.done}
  >
    <i style={`--today-embed-progress:${progress}%`}></i>
  </div>

  {#if items.length}
    <div class="today-embed-items">
      {#each items as item (item.id)}
        <article class:active={item.status === "in-progress"} class:done={item.status === "done"}>
          <button
            class="today-embed-open"
            type="button"
            disabled={Boolean(busy)}
            title="开始或继续，并打开对应目标"
            on:click={() => openItem(item)}
          >
            <span class="status-dot" aria-hidden="true"></span>
            <span>
              <strong>{item.text}</strong>
              {#if item.nextStep}<small>下一步 · {item.nextStep}</small>{/if}
            </span>
            <ChevronRight size={15} />
          </button>
          {#if dailyApi.completeItem && item.status !== "done"}
            <button
              class="today-embed-complete"
              type="button"
              disabled={Boolean(busy)}
              title="完成任务"
              aria-label={`完成：${item.text}`}
              on:click={() => completeItem(item)}
            >
              <Check size={14} />
            </button>
          {/if}
        </article>
      {/each}
    </div>
  {:else}
    <button class="today-embed-empty" type="button" on:click={() => onOpenDashboard?.()}>
      今天还没有计划，打开今日面板进行编排
      <ExternalLink size={14} />
    </button>
  {/if}

  <footer>
    <button type="button" on:click={() => onOpenDashboard?.()}>
      <LayoutDashboard size={14} />完整今日
    </button>
    <button type="button" on:click={() => onOpenFloating?.()}>
      <MonitorUp size={14} />桌面小窗
    </button>
  </footer>

  {#if error}<p class="today-embed-error">{error}</p>{/if}
</section>

<style>
  .today-embed-card {
    overflow: hidden;
    margin: 0.75rem 0;
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
    color: var(--text-normal);
    background: var(--background-primary);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.06);
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 15px 16px 12px;
  }

  header > div,
  .today-embed-open > span:nth-child(2) {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  header span,
  .today-embed-open small {
    color: var(--text-muted);
    font-size: 0.72rem;
  }

  header strong {
    font-size: 1rem;
    line-height: 1.35;
  }

  header b {
    flex: 0 0 auto;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }

  .today-embed-progress {
    height: 4px;
    background: var(--background-modifier-border);
  }

  .today-embed-progress i {
    display: block;
    width: var(--today-embed-progress);
    height: 100%;
    border-radius: 999px;
    background: var(--interactive-accent);
    transition: width 180ms ease;
  }

  .today-embed-items {
    display: grid;
    gap: 1px;
    padding: 8px;
    background: var(--background-secondary);
  }

  article {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: stretch;
    overflow: hidden;
    border: 1px solid transparent;
    border-radius: 9px;
    background: var(--background-primary);
  }

  article.active {
    border-color: color-mix(in srgb, var(--interactive-accent) 42%, var(--background-modifier-border));
  }

  article.done {
    opacity: 0.62;
  }

  button {
    box-shadow: none;
  }

  .today-embed-open {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 10px 11px;
    border: 0;
    color: inherit;
    background: transparent;
    text-align: left;
  }

  .today-embed-open:hover,
  .today-embed-complete:hover,
  footer button:hover,
  .today-embed-empty:hover {
    background: var(--background-modifier-hover);
  }

  .today-embed-open strong,
  .today-embed-open small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border: 2px solid var(--text-muted);
    border-radius: 50%;
  }

  article.active .status-dot {
    border-color: var(--interactive-accent);
    background: var(--interactive-accent);
  }

  article.done .status-dot {
    border-color: var(--text-success);
    background: var(--text-success);
  }

  .today-embed-complete {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    margin: 5px;
    border: 0;
    border-left: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
    background: transparent;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    padding: 8px;
    border-top: 1px solid var(--background-modifier-border);
  }

  footer button,
  .today-embed-empty {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 30px;
    border: 0;
    color: var(--text-muted);
    background: transparent;
    font-size: 0.75rem;
  }

  .today-embed-empty {
    width: calc(100% - 16px);
    margin: 8px;
    padding: 18px;
    border-radius: 9px;
  }

  .today-embed-error {
    margin: 0;
    padding: 8px 12px;
    color: var(--text-error);
    background: var(--background-modifier-error);
    font-size: 0.72rem;
  }

  .compact header {
    padding-bottom: 9px;
  }

  .compact footer {
    display: none;
  }

  @media (max-width: 420px) {
    header {
      padding-inline: 12px;
    }

    footer {
      justify-content: stretch;
    }

    footer button {
      flex: 1;
    }
  }
</style>
