<script lang="ts">
  import { Download, RefreshCw } from "lucide-svelte";
  import { onDestroy } from "svelte";
  import { mergeArticleSummariesWithWorkflow } from "../core/articles";
  import type { ArticleSummary, OpenQuestion } from "../core/types";
  import type { WorkflowFileSummary, WorkflowIndexPayload } from "../workflow";
  import type { ToWriteUiApi } from "./api";
  import {
    buildWorkflowMatrix,
    buildWorkflowStatusColumns
  } from "./dashboard-state";
  import DailyDashboardPanel from "./DailyDashboardPanel.svelte";
  import type { DailyDashboardAdapter } from "./daily-dashboard-types";

  export let api: ToWriteUiApi;
  export let dailyApi: DailyDashboardAdapter | undefined = undefined;
  export let getFullWorkflowPayload: (() => WorkflowIndexPayload) | undefined = undefined;
  export let initialTab: DashboardTab = dailyApi ? "today" : "all";
  export let initialDailySurface: "today" | "pool" | "review" = "today";

  type DashboardTab = "today" | "all";

  interface TypeAggregate {
    id: string;
    title: string;
    notes: number;
    active: number;
    stale: number;
  }

  let activeTab: DashboardTab = initialTab;
  let summaries: ArticleSummary[] = [];
  let workflowPayload: WorkflowIndexPayload = readWorkflowPayload();
  let questions: OpenQuestion[] = [];
  let statusOptions = api.getStatusOptions();
  let search = "";

  const unsubscribe = api.subscribe(reload);
  onDestroy(unsubscribe);

  reload();

  $: filtered = summaries.filter((summary) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [
      summary.filePath,
      summary.title,
      summary.typeTitle,
      summary.stageTitle,
      summary.tags?.join(" ")
    ].filter(Boolean).join(" ").toLowerCase().includes(needle);
  });
  $: workflowStatusColumns = buildWorkflowStatusColumns(statusOptions, questions);
  $: workflowRows = buildWorkflowMatrix(
    workflowPayload,
    summaries,
    questions,
    workflowStatusColumns
  );
  $: typeAggregates = buildTypeAggregates(workflowPayload, summaries);
  $: activeQuestions = questions.filter((question) => question.status === "open" || question.status === "candidate");
  $: staleNotes = summaries.filter((summary) => summary.stale).length;
  $: inboxCount = api.getInboxSnapshot().count;
  $: workflowDetailsComplete = (workflowPayload.files?.length ?? 0) >= workflowPayload.counts.uniqueFiles;

  function readWorkflowPayload(): WorkflowIndexPayload {
    try {
      return getFullWorkflowPayload?.() ?? api.getWorkflowPayload();
    } catch {
      return api.getWorkflowPayload();
    }
  }

  function reload() {
    workflowPayload = readWorkflowPayload();
    questions = api.getQuestions();
    statusOptions = api.getStatusOptions();
    summaries = mergeArticleSummariesWithWorkflow(
      api.getArticleSummaries(),
      workflowPayload,
      workflowPayload.generatedAt
    );
  }

  async function refresh(): Promise<void> {
    await api.refreshIndex();
    reload();
  }

  async function openFirst(summary: ArticleSummary) {
    const first = summary.topIssues[0];
    if (first) {
      await api.jumpToQuestion(first.id);
      return;
    }
    await api.openFile(summary.filePath);
  }

  function buildTypeAggregates(
    payload: WorkflowIndexPayload,
    articleSummaries: ArticleSummary[]
  ): TypeAggregate[] {
    const filesByPath = new Map<string, Pick<WorkflowFileSummary, "typeId" | "typeTitle" | "stale" | "openQuestionCount">>();
    for (const file of payload.files ?? []) {
      filesByPath.set(file.filePath, file);
    }
    for (const summary of articleSummaries) {
      if (!filesByPath.has(summary.filePath)) {
        filesByPath.set(summary.filePath, {
          typeId: summary.typeId,
          typeTitle: summary.typeTitle,
          stale: Boolean(summary.stale),
          openQuestionCount: summary.open
        });
      }
    }

    const aggregates = new Map<string, TypeAggregate>();
    for (const file of filesByPath.values()) {
      const id = file.typeId || "__unclassified__";
      const current = aggregates.get(id) ?? {
        id,
        title: file.typeTitle || "未分类",
        notes: 0,
        active: 0,
        stale: 0
      };
      current.notes += 1;
      current.active += file.openQuestionCount > 0 ? 1 : 0;
      current.stale += file.stale ? 1 : 0;
      aggregates.set(id, current);
    }
    return [...aggregates.values()].sort((left, right) => right.notes - left.notes || left.title.localeCompare(right.title));
  }
</script>

<section class="towrite-dashboard">
  <header class="dashboard-header">
    <div>
      <span class="eyebrow">ToWrite workspace</span>
      <h2>{activeTab === "today" ? "今日状态" : "全部状态"}</h2>
      <p>{activeTab === "today"
        ? "直接编辑绑定的 Markdown 待办；计划原文与 Dashboard 会保持双向同步。"
        : `${workflowPayload.counts.uniqueFiles} 篇笔记 · ${activeQuestions.length} 个待处理问题 · ${inboxCount} 条 Inbox`}</p>
    </div>
    <div class="dashboard-actions">
      <button type="button" title="刷新索引" aria-label="刷新索引" on:click={refresh}>
        <RefreshCw size={16} />
      </button>
      <button type="button" title="导出数据" aria-label="导出数据" on:click={() => api.exportNow()}>
        <Download size={16} />
      </button>
    </div>
  </header>

  <nav class="dashboard-tabs" aria-label="Dashboard 视图">
    <button
      type="button"
      class:active={activeTab === "today"}
      aria-current={activeTab === "today" ? "page" : undefined}
      on:click={() => (activeTab = "today")}
    >
      今日
    </button>
    <button
      type="button"
      class:active={activeTab === "all"}
      aria-current={activeTab === "all" ? "page" : undefined}
      on:click={() => (activeTab = "all")}
    >
      全部状态
    </button>
  </nav>

  {#if activeTab === "today"}
    <DailyDashboardPanel
      {dailyApi}
      initialSurface={initialDailySurface}
      onOpenCapture={() => api.openCapture()}
    />
  {:else}
    <section class="all-status" aria-label="全部状态">
      <div class="metric-grid" aria-label="全库摘要">
        <article>
          <span>索引笔记</span>
          <strong>{workflowPayload.counts.uniqueFiles}</strong>
          <small>{workflowPayload.counts.stages} 个 Workflow 阶段</small>
        </article>
        <article>
          <span>待处理问题</span>
          <strong>{activeQuestions.length}</strong>
          <small>{activeQuestions.filter((question) => question.lane === "think").length} ToThink · {activeQuestions.filter((question) => question.lane === "write").length} ToWrite</small>
        </article>
        <article>
          <span>陈旧笔记</span>
          <strong>{staleNotes}</strong>
          <small>超过阶段设定的停留时间</small>
        </article>
        <article>
          <span>Inbox</span>
          <strong>{inboxCount}</strong>
          <small>等待整理或归档</small>
        </article>
      </div>

      <section class="overview-card">
        <header class="section-heading">
          <div>
            <h3>阶段 × 问题状态</h3>
            <p>笔记数量来自 Workflow 增量索引；问题按当前状态和线路统计。</p>
          </div>
          {#if !workflowDetailsComplete}
            <span class="partial-badge" title="请为 Dashboard 接入不带 limit 的 Workflow payload">文件明细为局部</span>
          {/if}
        </header>
        {#if workflowRows.length === 0}
          <div class="empty-state">尚未配置 Workflow 阶段，或索引中还没有匹配的笔记。</div>
        {:else}
          <div class="matrix-wrap">
            <table class="matrix">
              <thead>
                <tr>
                  <th>阶段</th>
                  <th>笔记</th>
                  {#each workflowStatusColumns as status (status.id)}
                    <th title={`状态：${status.id}`}>{status.label}</th>
                  {/each}
                  <th>ToThink</th>
                  <th>ToWrite</th>
                  <th>陈旧</th>
                </tr>
              </thead>
              <tbody>
                {#each workflowRows as row (row.id)}
                  <tr>
                    <th>{row.title}</th>
                    <td>{row.notes}</td>
                    {#each workflowStatusColumns as status (status.id)}
                      <td>{row.statuses[status.id] ?? 0}</td>
                    {/each}
                    <td>{row.think}</td>
                    <td>{row.write}</td>
                    <td>{row.stale}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>

      {#if typeAggregates.length > 0}
        <section class="overview-card">
          <header class="section-heading">
            <div>
              <h3>文章类型</h3>
              <p>查看不同内容类型当前的规模和需要关注的数量。</p>
            </div>
          </header>
          <div class="type-grid">
            {#each typeAggregates as type (type.id)}
              <article>
                <strong>{type.title}</strong>
                <span>{type.notes} 篇</span>
                <small>{type.active} 篇有未解决问题 · {type.stale} 篇陈旧</small>
              </article>
            {/each}
          </div>
        </section>
      {/if}

      <section class="notes-section">
        <header class="section-heading">
          <div>
            <h3>笔记明细</h3>
            <p>{filtered.length} / {summaries.length} 篇</p>
          </div>
          <input bind:value={search} type="search" placeholder="搜索标题、路径、标签或阶段" aria-label="筛选笔记" />
        </header>

        <div class="notes-table-wrap">
          <table class="notes-table">
            <thead>
              <tr>
                <th>笔记</th>
                <th>未完成</th>
                <th>候选</th>
                <th>ToThink</th>
                <th>ToWrite</th>
                <th>已解决</th>
                <th>类型</th>
                <th>Workflow</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {#each filtered as summary (summary.filePath)}
                <tr class:blocked={summary.needsWork} on:click={() => openFirst(summary)}>
                  <td>
                    <strong>{summary.title}</strong>
                    <span>{summary.filePath}</span>
                  </td>
                  <td>{summary.open}</td>
                  <td>{summary.candidate}</td>
                  <td>{summary.think}</td>
                  <td>{summary.write}</td>
                  <td>{summary.resolved}</td>
                  <td>{summary.typeTitle ?? "—"}</td>
                  <td>{summary.stageTitle ?? "—"}</td>
                  <td>{summary.statusLabel ?? (summary.needsWork ? "blocked" : "clear")}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  {/if}
</section>

<style>
  :global(.towrite-dashboard) {
    --dashboard-border: var(--background-modifier-border);
    --dashboard-muted: var(--text-muted);
    --dashboard-soft: var(--background-secondary);
    --dashboard-raised: var(--background-primary);
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(100%, 1240px);
    min-height: 100%;
    margin: 0 auto;
    padding: clamp(14px, 2vw, 22px);
    color: var(--text-normal);
    background: var(--background-primary);
  }

  .dashboard-header,
  .section-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .eyebrow {
    color: var(--text-muted);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .dashboard-header h2 {
    margin: 4px 0 2px;
    font-size: clamp(1.4rem, 2.4vw, 1.75rem);
    line-height: 1.2;
  }

  .dashboard-header p,
  .section-heading p {
    margin: 0;
    color: var(--dashboard-muted);
    font-size: 0.84rem;
  }

  .dashboard-actions {
    display: flex;
    gap: 6px;
  }

  .dashboard-actions button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid var(--dashboard-border);
    border-radius: 9px;
    color: var(--text-muted);
    background: transparent;
    box-shadow: none;
  }

  .dashboard-actions button:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .dashboard-tabs {
    display: inline-flex;
    align-self: flex-start;
    gap: 4px;
    padding: 0;
    border: 0;
    border-bottom: 1px solid var(--dashboard-border);
    border-radius: 0;
    background: transparent;
  }

  .dashboard-tabs button {
    min-width: 112px;
    padding: 7px 14px;
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    color: var(--text-muted);
    background: transparent;
    box-shadow: none;
    font-weight: 600;
  }

  .dashboard-tabs button.active {
    color: var(--text-normal);
    border-bottom-color: var(--interactive-accent);
    background: transparent;
    box-shadow: none;
  }

  .all-status {
    display: grid;
    gap: 16px;
  }

  .metric-grid,
  .type-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .metric-grid article,
  .type-grid article,
  .overview-card,
  .notes-section {
    border: 1px solid var(--dashboard-border);
    border-radius: 12px;
    background: var(--dashboard-raised);
  }

  .metric-grid article {
    display: grid;
    gap: 3px;
    padding: 14px;
  }

  .metric-grid span,
  .metric-grid small,
  .type-grid span,
  .type-grid small {
    color: var(--dashboard-muted);
  }

  .metric-grid strong {
    font-size: 1.65rem;
    line-height: 1.15;
  }

  .metric-grid small,
  .type-grid small {
    font-size: 0.72rem;
  }

  .overview-card,
  .notes-section {
    overflow: hidden;
  }

  .section-heading {
    padding: 14px 16px;
    border-bottom: 1px solid var(--dashboard-border);
  }

  .section-heading h3 {
    margin: 0 0 2px;
    font-size: 1rem;
  }

  .partial-badge {
    padding: 3px 7px;
    border-radius: 999px;
    color: var(--text-warning);
    background: color-mix(in srgb, var(--color-yellow) 14%, transparent);
    font-size: 0.7rem;
    font-weight: 600;
  }

  .matrix-wrap,
  .notes-table-wrap {
    overflow-x: auto;
  }

  .matrix,
  .notes-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  .matrix th,
  .matrix td,
  .notes-table th,
  .notes-table td {
    padding: 9px 12px;
    border-bottom: 1px solid var(--dashboard-border);
    text-align: right;
    white-space: nowrap;
  }

  .matrix th:first-child,
  .notes-table th:first-child,
  .notes-table td:first-child {
    text-align: left;
  }

  .matrix thead th,
  .notes-table thead th {
    color: var(--dashboard-muted);
    background: var(--dashboard-soft);
    font-size: 0.7rem;
    font-weight: 600;
  }

  .matrix tbody tr:last-child th,
  .matrix tbody tr:last-child td,
  .notes-table tbody tr:last-child td {
    border-bottom: 0;
  }

  .type-grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    padding: 12px;
  }

  .type-grid article {
    display: grid;
    gap: 3px;
    padding: 11px 12px;
    background: var(--dashboard-soft);
  }

  .section-heading input {
    width: min(320px, 45%);
    min-width: 180px;
    margin: 0;
  }

  .notes-table tbody tr {
    cursor: pointer;
  }

  .notes-table tbody tr:hover {
    background: var(--background-modifier-hover);
  }

  .notes-table tbody tr.blocked {
    box-shadow: inset 3px 0 0 var(--color-orange);
  }

  .notes-table td:first-child {
    display: grid;
    min-width: 220px;
  }

  .notes-table td:first-child span {
    overflow: hidden;
    max-width: 38ch;
    color: var(--dashboard-muted);
    font-size: 0.7rem;
    text-overflow: ellipsis;
  }

  .empty-state {
    padding: 30px 18px;
    color: var(--dashboard-muted);
    text-align: center;
  }

  @media (max-width: 760px) {
    :global(.towrite-dashboard) {
      padding: 14px;
    }

    .metric-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .dashboard-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      align-self: stretch;
    }

    .dashboard-tabs button {
      min-width: 0;
    }

    .section-heading {
      align-items: stretch;
      flex-direction: column;
    }

    .section-heading input {
      width: 100%;
    }
  }
</style>
