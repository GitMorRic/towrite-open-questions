<script lang="ts">
  import { Download, PanelTopOpen, RefreshCw } from "lucide-svelte";
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
  import type { DailyDashboardAdapter, DailyDashboardConfiguration } from "./daily-dashboard-types";
  import WorkPoolPanel from "./WorkPoolPanel.svelte";
  import type { ToWriteWorkbenchTab } from "./workbench-state";

  export let api: ToWriteUiApi;
  export let dailyApi: DailyDashboardAdapter | undefined = undefined;
  export let getFullWorkflowPayload: (() => WorkflowIndexPayload) | undefined = undefined;
  export let initialTab: ToWriteWorkbenchTab = dailyApi ? "today" : "status";
  export let onOpenFloatingToday: (() => void) | undefined = undefined;
  export let onActiveTabChange: ((tab: ToWriteWorkbenchTab) => void) | undefined = undefined;

  interface TypeAggregate {
    id: string;
    title: string;
    notes: number;
    active: number;
    stale: number;
  }

  let activeTab: ToWriteWorkbenchTab = initialTab;
  let summaries: ArticleSummary[] = [];
  let workflowPayload: WorkflowIndexPayload = readWorkflowPayload();
  let questions: OpenQuestion[] = [];
  let statusOptions = api.getStatusOptions();
  let search = "";
  let noteGrouping: "all" | "folder" | "workflow" | "type" = "all";
  let noteFolder = "";
  let noteStage = "";
  let noteType = "";
  let dailyConfiguration: DailyDashboardConfiguration = {
    categoryPresets: [],
    defaultView: "list",
    focusMessages: [],
    focusMessageIntervalSeconds: 30,
    taskPoolPath: "Planning/Task Pool.md",
    autoReturnUnfinished: true
  };

  function switchTab(tab: ToWriteWorkbenchTab): void {
    activeTab = tab;
    onActiveTabChange?.(tab);
  }

  function openWorkPool(): void {
    switchTab("pool");
  }

  const unsubscribe = api.subscribe(reload);
  onDestroy(unsubscribe);

  reload();
  void loadDailyConfiguration();

  $: noteFolders = [...new Set(summaries.map((summary) => topFolder(summary.filePath)))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  $: noteStages = uniqueNotePairs(summaries.map((summary) => ({ id: summary.stageId ?? "", label: summary.stageTitle ?? "未分阶段" })));
  $: noteTypes = uniqueNotePairs(summaries.map((summary) => ({ id: summary.typeId ?? "", label: summary.typeTitle ?? "未分类" })));
  $: filtered = summaries.filter((summary) => {
    if (noteFolder && topFolder(summary.filePath) !== noteFolder) return false;
    if (noteStage && (summary.stageId ?? "") !== noteStage) return false;
    if (noteType && (summary.typeId ?? "") !== noteType) return false;
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
  $: noteGroups = groupNoteSummaries(filtered, noteGrouping);
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

  async function loadDailyConfiguration(): Promise<void> {
    try {
      dailyConfiguration = await dailyApi?.getConfiguration?.() ?? dailyConfiguration;
    } catch {
      // The Today view remains usable with its compatibility defaults.
    }
  }

  function todayDate(): string {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("-");
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

  function topFolder(path: string): string {
    const normalized = path.replace(/\\/gu, "/");
    return normalized.includes("/") ? normalized.split("/")[0] : "根目录";
  }

  function uniqueNotePairs(values: Array<{ id: string; label: string }>): Array<{ id: string; label: string }> {
    return [...new Map(values.map((value) => [value.id, value])).values()]
      .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
  }

  function groupNoteSummaries(items: ArticleSummary[], grouping: typeof noteGrouping): Array<{ id: string; title: string; color: string; items: ArticleSummary[] }> {
    if (grouping === "all") return [{ id: "all", title: "全部笔记", color: "var(--interactive-accent)", items }];
    const groups = new Map<string, { title: string; items: ArticleSummary[] }>();
    for (const item of items) {
      const key = grouping === "folder"
        ? topFolder(item.filePath)
        : grouping === "workflow"
          ? item.stageId || "__none__"
          : item.typeId || "__none__";
      const title = grouping === "folder"
        ? key
        : grouping === "workflow"
          ? item.stageTitle || "未分阶段"
          : item.typeTitle || "未分类";
      const group = groups.get(key) ?? { title, items: [] };
      group.items.push(item);
      groups.set(key, group);
    }
    const colors = ["#4d8fd6", "#38a17a", "#8b6de8", "#d38a3e", "#cc6075", "#6e9347", "#4f98a6"];
    return [...groups.entries()]
      .map(([id, group], index) => ({ id, title: group.title, items: group.items, color: colors[index % colors.length] }))
      .sort((left, right) => right.items.length - left.items.length || left.title.localeCompare(right.title, "zh-CN"));
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
      <h2>ToWrite 工作台</h2>
      <p>{activeTab === "today"
        ? "守住今天最重要的事。任务从工作池安排，Markdown 始终是数据真源。"
        : activeTab === "pool"
          ? "在一个地方整理任务、问题和不同阶段的笔记。"
          : `${workflowPayload.counts.uniqueFiles} 篇笔记 · ${activeQuestions.length} 个待处理问题 · ${inboxCount} 条 Inbox`}</p>
    </div>
    <div class="dashboard-actions">
      {#if activeTab === "today" && onOpenFloatingToday}
        <button class="focus-now-launch" type="button" title="打开可固定的“现在专注”" aria-label="打开现在专注悬浮窗" on:click={() => onOpenFloatingToday?.()}>
          <PanelTopOpen size={16} />
          <span>现在专注</span>
        </button>
      {/if}
      {#if activeTab === "status"}
        <button type="button" title="刷新索引" aria-label="刷新索引" on:click={refresh}>
          <RefreshCw size={16} />
        </button>
      {/if}
      <button type="button" title="导出数据" aria-label="导出数据" on:click={() => api.exportNow()}>
        <Download size={16} />
      </button>
    </div>
  </header>

  <nav class="dashboard-tabs" aria-label="ToWrite 工作台视图">
    <button
      type="button"
      class:active={activeTab === "today"}
      aria-current={activeTab === "today" ? "page" : undefined}
      on:click={() => switchTab("today")}
    >
      今日
    </button>
    <button
      type="button"
      class:active={activeTab === "pool"}
      aria-current={activeTab === "pool" ? "page" : undefined}
      on:click={() => switchTab("pool")}
    >
      工作池
    </button>
    <button
      type="button"
      class:active={activeTab === "status"}
      aria-current={activeTab === "status" ? "page" : undefined}
      on:click={() => switchTab("status")}
    >
      状态
    </button>
  </nav>

  {#if activeTab === "today"}
    <DailyDashboardPanel
      {dailyApi}
      workspaceMode={true}
      onOpenCapture={() => api.openCapture()}
      {onOpenFloatingToday}
      onOpenWorkPool={openWorkPool}
    />
  {:else if activeTab === "pool" && dailyApi}
    <WorkPoolPanel
      {dailyApi}
      date={todayDate()}
      workflowStages={dailyConfiguration.workflowStages ?? []}
      articleTypes={dailyConfiguration.articleTypes ?? []}
      questionStatuses={dailyConfiguration.questionStatuses ?? []}
      initialSettings={dailyConfiguration.workPool}
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

      <details class="status-guide">
        <summary>这些状态分别表示什么？</summary>
        <div class="status-guide-grid">
          <article><strong>Workflow 阶段</strong><span>笔记所处的创作流程，例如 Raw、Sparks、Processing。显式 workflow_stage 优先。</span></article>
          <article><strong>Article Type</strong><span>笔记的内容类型，例如 Project、Tech、MindFlow；它与阶段相互独立。</span></article>
          <article><strong>问题状态</strong><span>只作用于 ToThink / ToWrite 批注，例如 Open、Resolved、Paused。</span></article>
          <article><strong>普通 tags</strong><span>可映射到 Workflow 阶段用于索引，不会改写原笔记。</span></article>
        </div>
        <footer>
          <button type="button" on:click={() => api.openPluginSettings?.("workflow")}>配置阶段</button>
          <button type="button" on:click={() => api.openPluginSettings?.("workflow")}>映射现有标签</button>
          <button type="button" on:click={openWorkPool}>返回工作池</button>
          <button type="button" on:click={refresh}><RefreshCw size={14} />刷新索引</button>
        </footer>
      </details>

      <section class="overview-card">
        <header class="section-heading">
          <div>
            <h3>阶段 × 问题状态</h3>
            <p>笔记数量来自 Workflow 增量索引；问题按当前状态和线路统计。</p>
          </div>
          <button type="button" on:click={openWorkPool}>返回工作池管理</button>
          {#if !workflowDetailsComplete}
            <span class="partial-badge" title="请为 Dashboard 接入不带 limit 的 Workflow payload">文件明细为局部</span>
          {/if}
        </header>
        {#if workflowRows.length === 0}
          <div class="empty-state status-empty">
            <strong>还没有可统计的 Workflow 笔记</strong>
            <span>可能尚未启用阶段、tag 映射未匹配，或索引还没有刷新。</span>
            <div><button type="button" on:click={() => api.openPluginSettings?.("workflow")}>配置阶段与标签映射</button><button type="button" on:click={refresh}>刷新索引</button></div>
          </div>
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

        <div class="note-view-controls">
          <nav aria-label="笔记分类方式">
            <button type="button" class:active={noteGrouping === "all"} on:click={() => noteGrouping = "all"}>全部</button>
            <button type="button" class:active={noteGrouping === "folder"} on:click={() => noteGrouping = "folder"}>目录 / 项目</button>
            <button type="button" class:active={noteGrouping === "workflow"} on:click={() => noteGrouping = "workflow"}>Workflow</button>
            <button type="button" class:active={noteGrouping === "type"} on:click={() => noteGrouping = "type"}>文章类型</button>
          </nav>
          <div class="note-filters">
            <select bind:value={noteFolder} aria-label="按目录筛选"><option value="">全部目录</option>{#each noteFolders as folder}<option value={folder}>{folder}</option>{/each}</select>
            <select bind:value={noteStage} aria-label="按 Workflow 筛选"><option value="">全部阶段</option>{#each noteStages as stage}<option value={stage.id}>{stage.label}</option>{/each}</select>
            <select bind:value={noteType} aria-label="按文章类型筛选"><option value="">全部类型</option>{#each noteTypes as type}<option value={type.id}>{type.label}</option>{/each}</select>
          </div>
        </div>

        <div class="notes-groups">
          {#each noteGroups as group (group.id)}
          <section class="note-group" style={`--note-group-color:${group.color}`}>
            {#if noteGrouping !== "all"}
              <header><span class="note-group-mark"></span><strong>{group.title}</strong><span>{group.items.length} 篇</span></header>
            {/if}
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
              {#each group.items as summary (summary.filePath)}
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
          {/each}
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

  .dashboard-actions .focus-now-launch {
    width: auto;
    gap: 6px;
    padding: 0 10px;
    font-size: 0.76rem;
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

  .status-guide {
    border: 1px solid var(--dashboard-border);
    border-radius: 12px;
    background: var(--dashboard-raised);
  }

  .status-guide > summary { padding: 12px 14px; cursor: pointer; font-weight: 650; }
  .status-guide-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 0 14px 12px; }
  .status-guide-grid article { display: grid; gap: 3px; padding: 10px; border-radius: 9px; background: var(--dashboard-soft); }
  .status-guide-grid span { color: var(--text-muted); font-size: .76rem; }
  .status-guide footer { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 14px; border-top: 1px solid var(--dashboard-border); }
  .status-guide footer button { display: inline-flex; align-items: center; gap: 5px; }
  .status-empty { display: grid; place-items: center; gap: 5px; min-height: 130px; padding: 20px; text-align: center; }
  .status-empty span { color: var(--text-muted); }
  .status-empty div { display: flex; flex-wrap: wrap; justify-content: center; gap: 7px; }

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

  .note-view-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 12px;
    border-bottom: 1px solid var(--dashboard-border);
    background: var(--dashboard-soft);
  }

  .note-view-controls nav,
  .note-filters {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    overflow-x: auto;
  }

  .note-view-controls button {
    flex: none;
    border: 0;
    box-shadow: none;
    background: transparent;
  }

  .note-view-controls button.active {
    color: var(--text-on-accent);
    background: var(--interactive-accent);
  }

  .note-filters select {
    min-width: 120px;
  }

  .notes-groups {
    display: grid;
    gap: 10px;
    padding: 10px;
  }

  .note-group {
    overflow: hidden;
    border: 1px solid var(--dashboard-border);
    border-radius: 10px;
  }

  .note-group > header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 11px;
    background: color-mix(in srgb, var(--note-group-color) 9%, var(--dashboard-soft));
  }

  .note-group > header strong { flex: 1; }
  .note-group > header span:last-child { color: var(--dashboard-muted); font-size: .72rem; }
  .note-group-mark { width: 9px; height: 9px; border-radius: 3px; background: var(--note-group-color); }

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

    .note-view-controls { align-items: stretch; flex-direction: column; }
    .note-filters select { flex: 1 0 120px; }

    .dashboard-tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
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
