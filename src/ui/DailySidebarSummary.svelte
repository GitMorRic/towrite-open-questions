<script lang="ts">
  import { CalendarDays, Check, ChevronRight, Target } from "lucide-svelte";
  import { onDestroy, onMount } from "svelte";
  import type {
    DailyDashboardAdapter,
    DailyDashboardSnapshot
  } from "./daily-dashboard-types";
  import { selectDailyOverview } from "./daily-dashboard-state";

  export let dailyApi: DailyDashboardAdapter | undefined = undefined;
  export let onOpenDashboard: (() => void) | undefined = undefined;

  let snapshot: DailyDashboardSnapshot | undefined;
  let unsubscribe: (() => void) | undefined;

  $: overview = selectDailyOverview(snapshot?.plan.items ?? []);

  onMount(() => {
    unsubscribe = dailyApi?.subscribe?.(() => {
      void reload();
    });
    void reload();
  });
  onDestroy(() => unsubscribe?.());

  async function reload(): Promise<void> {
    try {
      snapshot = await dailyApi?.getSnapshot();
    } catch {
      snapshot = undefined;
    }
  }
</script>

{#if dailyApi}
  <section class="daily-sidebar-summary" aria-label="今日摘要">
    <button class="summary-main" type="button" on:click={() => onOpenDashboard?.()}>
      <span class="summary-icon" aria-hidden="true"><CalendarDays size={16} /></span>
      <span class="summary-copy">
        <span>
          <strong>今日</strong>
          <small>{snapshot?.date.slice(5).replace("-", ".") ?? ""}</small>
        </span>
        <span class="summary-progress">
          <i style={`--progress: ${snapshot?.plan.total ? Math.round((snapshot.plan.done / snapshot.plan.total) * 100) : 0}%`}></i>
        </span>
      </span>
      <ChevronRight size={15} />
    </button>

    <div class="summary-metrics">
      <span title="已完成">
        <Check size={13} />
        <strong>{overview.done}</strong>
        完成
      </span>
      <span title="待推进">
        <strong>{overview.total - overview.done}</strong>
        待推进
      </span>
    </div>
    {#if overview.current}
      <button class="current-task" type="button" on:click={() => onOpenDashboard?.()}>
        <Target size={13} />
        <span><small>当前</small><strong>{overview.current.text}</strong></span>
      </button>
    {/if}
  </section>
{/if}

<style>
  .daily-sidebar-summary {
    overflow: hidden;
    margin: 8px 0;
    border: 1px solid var(--background-modifier-border);
    border-radius: 10px;
    background: var(--background-secondary);
  }

  .summary-main {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px;
    border: 0;
    color: var(--text-normal);
    background: transparent;
    box-shadow: none;
    text-align: left;
  }

  .summary-main:hover {
    background: var(--background-modifier-hover);
  }

  .summary-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    color: var(--text-accent);
    background: var(--background-primary);
  }

  .summary-copy {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .summary-copy > span:first-child {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .summary-copy small {
    color: var(--text-muted);
    font-size: 0.66rem;
  }

  .summary-progress {
    overflow: hidden;
    height: 3px;
    border-radius: 999px;
    background: var(--background-modifier-border);
  }

  .summary-progress i {
    display: block;
    width: var(--progress);
    height: 100%;
    background: var(--interactive-accent);
  }

  .summary-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-modifier-border);
  }

  .summary-metrics span {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-width: 0;
    padding: 7px 4px;
    color: var(--text-muted);
    background: var(--background-secondary);
    font-size: 0.64rem;
    white-space: nowrap;
  }

  .summary-metrics strong {
    color: var(--text-normal);
  }

  .current-task {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-top: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
    background: transparent;
    box-shadow: none;
    text-align: left;
  }

  .current-task:hover {
    background: var(--background-modifier-hover);
  }

  .current-task span {
    display: grid;
    min-width: 0;
  }

  .current-task small {
    font-size: 0.6rem;
  }

  .current-task strong {
    overflow: hidden;
    color: var(--text-normal);
    font-size: 0.7rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
