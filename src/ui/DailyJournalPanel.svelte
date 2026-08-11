<script lang="ts">
  import { BookOpenCheck, RefreshCw } from "lucide-svelte";
  import type { DailyJournalDaySnapshot, DailyJournalMonthSnapshot } from "../daily";
  import type { DailyDashboardAdapter } from "./daily-dashboard-types";

  export let dailyApi: DailyDashboardAdapter;

  const now = new Date();
  let date = localDate(now);
  let month = date.slice(0, 7);
  let day: DailyJournalDaySnapshot | undefined;
  let monthly: DailyJournalMonthSnapshot | undefined;
  let loading = false;
  let error = "";
  let notice = "";

  void reload();

  async function reload(): Promise<void> {
    if (!dailyApi.getJournalDay || !dailyApi.getJournalMonth) return;
    loading = true;
    error = "";
    try {
      [day, monthly] = await Promise.all([
        dailyApi.getJournalDay(date),
        dailyApi.getJournalMonth(month)
      ]);
    } catch (value) {
      error = value instanceof Error ? value.message : String(value);
    } finally {
      loading = false;
    }
  }

  async function writeBack(): Promise<void> {
    if (!dailyApi.writeJournal) return;
    error = "";
    notice = "";
    try {
      const result = await dailyApi.writeJournal(date);
      notice = result.idempotent ? "日记中的日志已经是最新版本。" : `已写入 ${result.sourcePath}`;
    } catch (value) {
      error = value instanceof Error ? value.message : String(value);
    }
  }

  function localDate(value: Date): string {
    return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
  }

  function duration(value: number): string {
    const minutes = Math.round(value / 60_000);
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  }
</script>

<section class="daily-journal-panel" aria-label="ToWrite 工作日志">
  <header>
    <div>
      <span class="eyebrow">本地工作账本</span>
      <h3>日志</h3>
      <p>查看完成、投入、暂停、迁移和回流；内容只保存在本地可读 JSONL。</p>
    </div>
    <button type="button" title="刷新日志" on:click={reload}><RefreshCw size={16} /></button>
  </header>

  <div class="journal-periods">
    <label>日期 <input type="date" bind:value={date} on:change={reload} /></label>
    <label>月份 <input type="month" bind:value={month} on:change={reload} /></label>
    <button type="button" on:click={writeBack}><BookOpenCheck size={15} />写回今日日记</button>
  </div>

  {#if error}<p class="journal-error">{error}</p>{/if}
  {#if notice}<p class="journal-notice">{notice}</p>{/if}
  {#if loading}
    <p class="journal-empty">正在读取本地账本…</p>
  {:else if day}
    <div class="journal-metrics">
      <article><span>完成</span><strong>{day.completed}/{day.planned}</strong><small>{Math.round(day.completionRate * 100)}%</small></article>
      <article><span>实际投入</span><strong>{duration(day.activeMs)}</strong><small>暂停 {duration(day.pausedMs)}</small></article>
      <article><span>流转</span><strong>{day.migratedIn + day.migratedOut}</strong><small>迁入 {day.migratedIn} · 迁出 {day.migratedOut}</small></article>
      <article><span>回流 / 放弃</span><strong>{day.returned} / {day.abandoned}</strong><small>中断 {day.interruptions}</small></article>
    </div>
    <section class="journal-timeline">
      <h4>{date} 的变化</h4>
      {#if day.transitions.length === 0}
        <p class="journal-empty">这一天还没有显式任务操作记录。</p>
      {:else}
        {#each [...day.transitions].reverse() as event (event.eventId)}
          <div class="journal-event">
            <time>{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
            <strong>{event.title}</strong>
            <span>{event.kind}</span>
          </div>
        {/each}
      {/if}
    </section>
  {/if}

  {#if monthly}
    <section class="journal-month">
      <h4>{monthly.month} 月度汇总</h4>
      <p>{monthly.totals.completed}/{monthly.totals.planned} 项完成 · 投入 {duration(monthly.totals.activeMs)} · 迁移 {monthly.totals.migratedOut} · 回流 {monthly.totals.returned}</p>
    </section>
  {/if}
</section>

<style>
  .daily-journal-panel { display:grid; gap:1rem; padding-block:1rem; }
  header { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
  h3,h4,p { margin:0; }
  header p { color:var(--text-muted); }
  .eyebrow { color:var(--text-accent); font-size:.72rem; font-weight:700; text-transform:uppercase; }
  button { display:inline-flex; align-items:center; gap:.4rem; }
  .journal-periods { display:flex; flex-wrap:wrap; gap:.65rem; align-items:end; }
  .journal-periods label { display:grid; gap:.25rem; color:var(--text-muted); font-size:.8rem; }
  .journal-metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:.7rem; }
  article,.journal-timeline,.journal-month { border:1px solid var(--background-modifier-border); border-radius:var(--radius-l); padding:.85rem; background:var(--background-primary-alt); }
  article { display:grid; gap:.2rem; }
  article span,article small { color:var(--text-muted); }
  article strong { font-size:1.35rem; }
  .journal-timeline { display:grid; gap:.4rem; }
  .journal-event { display:grid; grid-template-columns:4.5rem minmax(0,1fr) auto; gap:.6rem; padding:.5rem 0; border-top:1px solid var(--background-modifier-border); }
  .journal-event time,.journal-event span { color:var(--text-muted); }
  .journal-empty { color:var(--text-muted); padding:.75rem 0; }
  .journal-error { color:var(--text-error); }
  .journal-notice { color:var(--text-success); }
  @media (max-width:520px) { .journal-event { grid-template-columns:4rem minmax(0,1fr); } .journal-event span { grid-column:2; } }
</style>
