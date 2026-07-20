<script lang="ts">
  import { ChevronDown, ChevronRight, FileText } from "lucide-svelte";
  import type { ArticleSummary, OpenQuestion, OpenQuestionLane } from "../core/types";
  import type { DeviceLibraryEntry } from "../hub";
  import type { ToWriteUiApi } from "./api";
  import QuestionCard from "./QuestionCard.svelte";
  import { compactPath } from "./path";

  export let article: ArticleSummary;
  export let api: ToWriteUiApi;
  export let laneFilter: "all" | OpenQuestionLane = "all";
  export let questions: OpenQuestion[] = [];
  export let deviceLibraryById: Map<string, DeviceLibraryEntry> = new Map();

  let expanded = false;

  $: unresolved = questions
    .filter((question) => question.status !== "resolved" && question.status !== "ignored")
    .filter((question) => laneFilter === "all" || question.lane === laneFilter);
  $: visibleOpen = unresolved.length;
  $: language = api.getLanguage();
  $: copy = language === "zh"
    ? { open: "未完成", think: "ToThink", write: "ToWrite", candidate: "候选", empty: "没有未完成问题。" }
    : { open: "open", think: "ToThink", write: "ToWrite", candidate: "candidate", empty: "No active questions." };

</script>

<article class:expanded class="towrite-article-card">
  <button class="towrite-article-summary" type="button" on:click={() => (expanded = !expanded)}>
    <span class="towrite-article-main">
      {#if expanded}
        <ChevronDown class="towrite-article-toggle-icon" size={14} />
      {:else}
        <ChevronRight class="towrite-article-toggle-icon" size={14} />
      {/if}
      <FileText class="towrite-article-file-icon" size={14} />
      <span class="towrite-article-title">
        <strong>{article.title}</strong>
        <small title={article.filePath}>{compactPath(article.filePath, 2)}</small>
      </span>
    </span>
    <span class="towrite-article-counts">
      <em>{visibleOpen}</em>
      <small>{copy.open}</small>
    </span>
  </button>

  <div class="towrite-article-badges">
    {#if article.typeTitle}
      <span class={`towrite-article-taxonomy towrite-article-taxonomy-${article.typeColor ?? "slate"}`}>{article.typeTitle}</span>
    {/if}
    {#if article.stageTitle}
      <span class={`towrite-article-stage towrite-article-stage-${article.stageColor ?? "slate"}`}>{article.stageTitle}</span>
    {/if}
    <span>{article.think} {copy.think}</span>
    <span>{article.write} {copy.write}</span>
    <span>{article.candidate} {copy.candidate}</span>
  </div>

  {#if expanded}
    <div class="towrite-article-details">
      {#if unresolved.length === 0}
        <div class="towrite-article-empty">{copy.empty}</div>
      {:else}
        {#each unresolved as question (question.id)}
          <QuestionCard {question} {api} deviceLibraryEntry={deviceLibraryById.get(question.id)} />
        {/each}
      {/if}
    </div>
  {/if}
</article>
