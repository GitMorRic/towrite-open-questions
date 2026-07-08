<script lang="ts">
  import { Download, RefreshCw } from "lucide-svelte";
  import { onDestroy } from "svelte";
  import { mergeArticleSummariesWithWorkflow } from "../core/articles";
  import type { ArticleSummary } from "../core/types";
  import type { WorkflowIndexPayload } from "../workflow";
  import type { ToWriteUiApi } from "./api";

  export let api: ToWriteUiApi;

  let summaries: ArticleSummary[] = [];
  let workflowPayload: WorkflowIndexPayload = api.getWorkflowPayload();
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

  function reload() {
    workflowPayload = api.getWorkflowPayload();
    summaries = mergeArticleSummariesWithWorkflow(api.getArticleSummaries(), workflowPayload, workflowPayload.generatedAt)
      .filter((summary) => summary.needsWork || summary.candidate > 0 || Boolean(summary.typeId || summary.stageId));
  }

  async function openFirst(summary: ArticleSummary) {
    const first = summary.topIssues[0];
    if (first) {
      await api.jumpToQuestion(first.id);
    }
  }
</script>

<section class="towrite-dashboard">
  <header class="towrite-dashboard-header">
    <div>
      <h2>Question Dashboard</h2>
      <p>
        {summaries.filter((summary) => summary.needsWork).length} blocked articles ·
        {summaries.length} indexed notes ·
        {workflowPayload.counts.uniqueFiles} workflow files
      </p>
    </div>
    <div class="towrite-dashboard-actions">
      <button type="button" title="Refresh index" on:click={() => api.refreshIndex()}>
        <RefreshCw size={15} />
      </button>
      <button type="button" title="Export JSON" on:click={() => api.exportNow()}>
        <Download size={15} />
      </button>
    </div>
  </header>

  <input class="towrite-dashboard-search" bind:value={search} type="search" placeholder="Filter articles" />

  <div class="towrite-table-wrap">
    <table class="towrite-table">
      <thead>
        <tr>
          <th>Article</th>
          <th>Open</th>
          <th>Candidate</th>
          <th>ToThink</th>
          <th>ToWrite</th>
          <th>Resolved</th>
          <th>Type</th>
          <th>Workflow</th>
          <th>Status</th>
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
            <td>{summary.typeTitle ?? ""}</td>
            <td>{summary.stageTitle ?? ""}</td>
            <td>{summary.statusLabel ?? (summary.needsWork ? "blocked" : "clear")}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
