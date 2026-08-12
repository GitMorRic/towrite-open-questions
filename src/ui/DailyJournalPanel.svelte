<script lang="ts">
  import { onMount } from "svelte";
  import { BookOpenCheck, ChevronLeft, ChevronRight, RefreshCw } from "lucide-svelte";
  import type { DailyJournalDaySnapshot, DailyJournalMonthSnapshot } from "../daily";
  import type { DailyDashboardAdapter } from "./daily-dashboard-types";

  export let dailyApi: DailyDashboardAdapter;

  const today = localDate(new Date());
  let date = today;
  let month = date.slice(0, 7);
  let day: DailyJournalDaySnapshot | undefined;
  let monthly: DailyJournalMonthSnapshot | undefined;
  let loading = false;
  let error = "";
  let notice = "";

  onMount(() => { void reload(); });

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

  async function chooseDate(next: string): Promise<void> {
    date = next;
    const nextMonth = next.slice(0, 7);
    if (nextMonth !== month) month = nextMonth;
    await reload();
  }

  async function moveMonth(offset: number): Promise<void> {
    const cursor = new Date(`${month}-01T12:00:00`);
    cursor.setMonth(cursor.getMonth() + offset);
    month = localDate(cursor).slice(0, 7);
    if (!date.startsWith(month)) date = `${month}-01`;
    await reload();
  }

  async function writeBack(): Promise<void> {
    if (!dailyApi.writeJournal) return;
    error = "";
    notice = "";
    try {
      const result = await dailyApi.writeJournal(date);
      notice = result.idempotent ? "日记中的工作日志已经是最新版本。" : `已写入 ${result.sourcePath}`;
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

  function calendarDates(value: string): Array<string | undefined> {
    const [year, monthNumber] = value.split("-").map(Number);
    const first = new Date(year, monthNumber - 1, 1, 12);
    const prefix = (first.getDay() + 6) % 7;
    const count = new Date(year, monthNumber, 0, 12).getDate();
    return [
      ...Array.from({ length: prefix }, () => undefined),
      ...Array.from({ length: count }, (_, index) => `${value}-${String(index + 1).padStart(2, "0")}`)
    ];
  }

  function monthDay(value: string): DailyJournalDaySnapshot | undefined {
    return monthly?.days.find((entry) => entry.date === value);
  }

  function eventLabel(kind: string): string {
    return ({
      schedule: "安排", start: "开始", pause: "暂停", resume: "继续", complete: "完成",
      reopen: "重开", migrate: "迁移", return: "回流任务池", abandon: "放弃"
    } as Record<string, string>)[kind] ?? kind;
  }

  $: calendar = calendarDates(month);
</script>

<section class="daily-journal-panel" aria-label="ToWrite 工作日志">
  <header>
    <div>
      <span class="eyebrow">本地工作账本</span>
      <h3>日志</h3>
      <p>用日历回看完成、投入、迁移与回流；内容只保存在本地可读 JSONL。</p>
    </div>
    <button type="button" title="刷新日志" on:click={reload}><RefreshCw size={16} /></button>
  </header>

  <div class="journal-layout">
    <section class="journal-calendar" aria-label={`${month} 月工作日历`}>
      <header class="calendar-header">
        <button type="button" aria-label="上个月" on:click={() => moveMonth(-1)}><ChevronLeft size={16} /></button>
        <strong>{month.replace("-", " 年 ")} 月</strong>
        <button type="button" aria-label="下个月" on:click={() => moveMonth(1)}><ChevronRight size={16} /></button>
      </header>
      <div class="calendar-weekdays">{#each ["一", "二", "三", "四", "五", "六", "日"] as label}<span>{label}</span>{/each}</div>
      <div class="calendar-grid">
        {#each calendar as calendarDate}
          {#if calendarDate}
            {@const entry = monthDay(calendarDate)}
            <button
              type="button"
              class:selected={calendarDate === date}
              class:today={calendarDate === today}
              class:active={Boolean(entry && (entry.planned || entry.transitions.length))}
              title={entry ? `${entry.completed}/${entry.planned} 完成 · ${duration(entry.activeMs)}` : "没有工作记录"}
              on:click={() => chooseDate(calendarDate)}
            >
              <b>{Number(calendarDate.slice(-2))}</b>
              {#if entry && (entry.planned || entry.transitions.length)}
                <i style={`--completion:${Math.round(entry.completionRate * 100)}%`}></i>
                <small>{entry.completed}/{entry.planned}</small>
              {/if}
            </button>
          {:else}<span class="calendar-blank"></span>{/if}
        {/each}
      </div>
      {#if monthly}
        <footer>{monthly.totals.completed}/{monthly.totals.planned} 项完成 · 投入 {duration(monthly.totals.activeMs)} · 迁移 {monthly.totals.migratedOut} · 回流 {monthly.totals.returned}</footer>
      {/if}
    </section>

    <section class="journal-detail">
      <div class="journal-periods">
        <label>日期 <input type="date" bind:value={date} on:change={() => chooseDate(date)} /></label>
        <button type="button" on:click={writeBack}><BookOpenCheck size={15} />写回这天日记</button>
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
                <span>{eventLabel(event.kind)}</span>
              </div>
            {/each}
          {/if}
        </section>
      {/if}
    </section>
  </div>
</section>

<style>
  .daily-journal-panel { display:grid; gap:1rem; padding-block:1rem; }
  header { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
  h3,h4,p { margin:0; } header p { color:var(--text-muted); }
  .eyebrow { color:var(--text-accent); font-size:.72rem; font-weight:700; text-transform:uppercase; }
  button { display:inline-flex; align-items:center; justify-content:center; gap:.4rem; }
  .journal-layout { display:grid; grid-template-columns:minmax(260px, .8fr) minmax(360px, 1.2fr); gap:1rem; align-items:start; }
  .journal-calendar,.journal-detail { border:1px solid var(--background-modifier-border); border-radius:var(--radius-l); padding:.85rem; background:var(--background-primary-alt); }
  .calendar-header { align-items:center; } .calendar-header button { padding:.25rem; }
  .calendar-weekdays,.calendar-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
  .calendar-weekdays { margin:.65rem 0 .25rem; color:var(--text-muted); text-align:center; font-size:.72rem; }
  .calendar-grid > button { position:relative; display:grid; min-height:48px; padding:5px; border:1px solid transparent; background:transparent; box-shadow:none; }
  .calendar-grid > button:hover { border-color:var(--interactive-accent); background:var(--background-modifier-hover); }
  .calendar-grid > button.selected { outline:2px solid var(--interactive-accent); background:var(--background-primary); }
  .calendar-grid > button.today b { color:var(--text-accent); }
  .calendar-grid i { width:100%; height:3px; border-radius:2px; background:linear-gradient(90deg,var(--interactive-accent) var(--completion),var(--background-modifier-border) var(--completion)); }
  .calendar-grid small { color:var(--text-muted); font-size:.62rem; }
  .journal-calendar footer { margin-top:.75rem; color:var(--text-muted); font-size:.78rem; }
  .journal-periods { display:flex; flex-wrap:wrap; gap:.65rem; align-items:end; margin-bottom:.8rem; }
  .journal-periods label { display:grid; gap:.25rem; color:var(--text-muted); font-size:.8rem; }
  .journal-metrics { display:grid; grid-template-columns:repeat(2,minmax(120px,1fr)); gap:.7rem; }
  article,.journal-timeline { border:1px solid var(--background-modifier-border); border-radius:var(--radius-l); padding:.85rem; background:var(--background-primary); }
  article { display:grid; gap:.2rem; } article span,article small { color:var(--text-muted); } article strong { font-size:1.25rem; }
  .journal-timeline { display:grid; gap:.4rem; margin-top:.8rem; }
  .journal-event { display:grid; grid-template-columns:4.5rem minmax(0,1fr) auto; gap:.6rem; padding:.5rem 0; border-top:1px solid var(--background-modifier-border); }
  .journal-event time,.journal-event span { color:var(--text-muted); }
  .journal-empty { color:var(--text-muted); padding:.75rem 0; } .journal-error { color:var(--text-error); } .journal-notice { color:var(--text-success); }
  @media (max-width:760px) { .journal-layout { grid-template-columns:1fr; } }
  @media (max-width:520px) { .journal-event { grid-template-columns:4rem minmax(0,1fr); } .journal-event span { grid-column:2; } }
</style>
