<script lang="ts">
  import { Download, RefreshCw } from "lucide-svelte";
  import { onDestroy } from "svelte";
  import type { ArticleSummary } from "../core/types";
  import type { ToWriteUiApi } from "./api";

  export let api: ToWriteUiApi;

  let summaries: ArticleSummary[] = [];
  let search = "";

  const unsubscribe = api.subscribe(reload);
  onDestroy(unsubscribe);

  reload();

  $: filtered = summaries.filter((summary) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return summary.filePath.toLowerCase().includes(needle) || summary.title.toLowerCase().includes(needle);
  });

  function reload() {
    summaries = api.getArticleSummaries();
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
      <p>{summaries.filter((summary) => summary.needsWork).length} blocked articles · {summaries.length} indexed articles</p>
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
            <td>{summary.needsWork ? "blocked" : "clear"}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
