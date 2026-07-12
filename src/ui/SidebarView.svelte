<script lang="ts">
  import {
    Bell,
    Brain,
    Check,
    ChevronDown,
    ChevronRight,
    Clock3,
    Download,
    Eye,
    EyeOff,
    FolderTree,
    FilePenLine,
    List,
    Plus,
    RefreshCw,
    Search
  } from "lucide-svelte";
  import { onDestroy } from "svelte";
  import type { ArticleTypeSettings } from "../core/settings";
  import { mergeArticleSummariesWithWorkflow } from "../core/articles";
  import type { ArticleSummary, OpenQuestion, OpenQuestionLane } from "../core/types";
  import type { WorkflowIndexPayload } from "../workflow";
  import type { ProactiveSuggestion, ProactiveSuggestionAction } from "../suggestions";
  import type { ActiveLineRange, ToWriteUiApi } from "./api";
  import ArticleSummaryCard from "./ArticleSummaryCard.svelte";
  import QuestionCard from "./QuestionCard.svelte";
  import { compactPath } from "./path";

  export let api: ToWriteUiApi;

  type OtherMode = "list" | "tree";
  type LaneFilter = "all" | OpenQuestionLane;
  type ArticleFilterTab = {
    id: string;
    label: string;
    count: number;
    color?: string;
    tag?: string;
  };

  let search = "";
  let otherMode: OtherMode = "list";
  let laneFilter: LaneFilter = "all";
  let typeFilter = "";
  let stageFilter = "";
  let activeFile: string | null = null;
  let activeLineRange: ActiveLineRange | null = null;
  let activePathExpanded = false;
  let compactEditorDecorations = false;
  let collapsedLaneSections: Record<OpenQuestionLane, boolean> = {
    think: false,
    write: false
  };
  let currentQuestions: OpenQuestion[] = [];
  let otherArticles: ArticleSummary[] = [];
  let articleTypes: ArticleTypeSettings[] = api.getArticleTypes();
  let workflowPayload: WorkflowIndexPayload = api.getWorkflowPayload();
  let suggestions: ProactiveSuggestion[] = [];
  let busySuggestionId = "";
  let suggestionError = "";

  const unsubscribe = api.subscribe(reload);
  onDestroy(unsubscribe);

  reload();

  $: search, reload();
  $: currentOpen = currentQuestions.filter((question) => isWorkStatus(question.status)).length;
  $: currentCandidate = currentQuestions.filter((question) => question.status === "candidate").length;
  $: currentResolved = currentQuestions.filter((question) => question.status === "resolved").length;
  $: currentThink = currentQuestions.filter((question) => question.lane === "think").length;
  $: currentWrite = currentQuestions.filter((question) => question.lane === "write").length;
  $: filteredCurrentQuestions = currentQuestions.filter(matchesLaneFilter);
  $: currentLaneSections = buildLaneSections(filteredCurrentQuestions);
  $: groupCurrentByHeading = api.getGroupCurrentByHeading();
  $: typeTabs = buildTypeTabs(otherArticles, articleTypes, language);
  $: typeFilteredOtherArticles = otherArticles.filter(matchesArticleTypeFilter);
  $: stageTabs = buildStageTabs(typeFilteredOtherArticles, workflowPayload.stages, language);
  $: if (typeFilter && !typeTabs.some((tab) => tab.id === typeFilter)) typeFilter = "";
  $: if (stageFilter && !stageTabs.some((tab) => tab.id === stageFilter)) stageFilter = "";
  $: visibleOtherArticles = typeFilteredOtherArticles.filter(matchesArticleStageFilter).filter(matchesArticleLaneFilter);
  $: folderGroups = groupArticlesByFolder(visibleOtherArticles);
  $: activePathLabel = activeFile ? (activePathExpanded ? activeFile : compactPath(activeFile, 3)) : "";
  $: language = api.getLanguage();
  $: copy = sidebarCopy(language);

  function reload() {
    activeFile = api.getActiveFile();
    activeLineRange = api.getActiveLineRange();
    compactEditorDecorations = api.getCompactEditorDecorations();
    articleTypes = api.getArticleTypes();
    workflowPayload = api.getWorkflowPayload();
    suggestions = api.getProactiveSuggestions();
    currentQuestions = activeFile
      ? sortCurrentQuestions(
          api
            .getQuestions({
              filePath: activeFile,
              search
            })
            .filter((question) => question.status !== "ignored"),
          activeLineRange
        )
      : [];

    const needle = search.trim().toLowerCase();
    otherArticles = mergeArticleSummariesWithWorkflow(api.getArticleSummaries(), workflowPayload, workflowPayload.generatedAt)
      .filter((summary) => summary.filePath !== activeFile)
      .filter((summary) => summary.needsWork || summary.candidate > 0 || Boolean(summary.typeId || summary.stageId))
      .filter((summary) => {
        if (!needle) return true;
        return [
          summary.title,
          summary.filePath,
          summary.description,
          summary.typeTitle,
          summary.stageTitle,
          summary.tags?.join(" ")
        ].filter(Boolean).join(" ").toLowerCase().includes(needle);
      });
  }

  async function actOnSuggestion(suggestion: ProactiveSuggestion, action: ProactiveSuggestionAction) {
    if (busySuggestionId) {
      return;
    }
    busySuggestionId = suggestion.id;
    suggestionError = "";
    try {
      await api.actOnSuggestion(suggestion.id, action);
      reload();
    } catch (error) {
      suggestionError = error instanceof Error ? error.message : String(error);
    } finally {
      busySuggestionId = "";
    }
  }

  function suggestionSourceLabel(suggestion: ProactiveSuggestion) {
    if (suggestion.source === "due-reminder") return language === "zh" ? "到期" : "Due";
    if (suggestion.source === "active-question") return language === "zh" ? "当前笔记" : "Current note";
    if (suggestion.source === "confirmed-habit") return language === "zh" ? "已确认习惯" : "Confirmed habit";
    return language === "zh" ? "习惯候选" : "Habit candidate";
  }

  function groupByHeading(items: OpenQuestion[]) {
    const groups = new Map<string, OpenQuestion[]>();
    for (const question of items) {
      const key = question.source.headingPath.at(-1) ?? "Untitled";
      groups.set(key, [...(groups.get(key) ?? []), question]);
    }
    return Array.from(groups.entries());
  }

  function groupArticlesByFolder(items: ArticleSummary[]) {
    const groups = new Map<string, ArticleSummary[]>();
    for (const article of items) {
      const parts = article.filePath.split("/");
      const key = parts.length > 1 ? parts.slice(0, -1).join("/") : "Vault root";
      groups.set(key, [...(groups.get(key) ?? []), article]);
    }
    return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
  }

  function laneLabel(lane: OpenQuestionLane) {
    return lane === "write" ? "ToWrite" : "ToThink";
  }

  function buildLaneSections(items: OpenQuestion[]) {
    const sections: Array<{ lane: OpenQuestionLane; label: string; items: OpenQuestion[] }> = [
      { lane: "think", label: laneLabel("think"), items: items.filter((question) => question.lane === "think") },
      { lane: "write", label: laneLabel("write"), items: items.filter((question) => question.lane === "write") }
    ];

    if (laneFilter === "all") {
      return sections.filter((section) => section.items.length > 0);
    }
    return sections.filter((section) => section.lane === laneFilter);
  }

  function matchesLaneFilter(question: OpenQuestion) {
    return laneFilter === "all" || question.lane === laneFilter;
  }

  function matchesArticleLaneFilter(article: ArticleSummary) {
    return true;
  }

  function matchesArticleTypeFilter(article: ArticleSummary) {
    return !typeFilter || article.typeId === typeFilter;
  }

  function matchesArticleStageFilter(article: ArticleSummary) {
    return !stageFilter || article.stageId === stageFilter;
  }

  function buildTypeTabs(
    items: ArticleSummary[],
    configuredTypes: ArticleTypeSettings[],
    currentLanguage: "zh" | "en"
  ): ArticleFilterTab[] {
    const counts = countBy(items, (article) => article.typeId);
    const tabs: ArticleFilterTab[] = configuredTypes.map((type) => ({
      id: type.id,
      label: type.title || type.id,
      count: counts.get(type.id) ?? 0,
      color: type.color,
      tag: firstTagLabel(type.tags)
    }));
    const seen = new Set(tabs.map((tab) => tab.id));

    for (const article of items) {
      if (!article.typeId || seen.has(article.typeId)) continue;
      seen.add(article.typeId);
      tabs.push({
        id: article.typeId,
        label: article.typeTitle || article.typeId,
        count: counts.get(article.typeId) ?? 0,
        color: article.typeColor
      });
    }

    return [
      {
        id: "",
        label: currentLanguage === "zh" ? "全部分类" : "All types",
        count: items.length
      },
      ...tabs
    ];
  }

  function buildStageTabs(
    items: ArticleSummary[],
    stages: WorkflowIndexPayload["stages"],
    currentLanguage: "zh" | "en"
  ): ArticleFilterTab[] {
    const counts = countBy(items, (article) => article.stageId);
    const tabs: ArticleFilterTab[] = stages.map((stage) => ({
      id: stage.id,
      label: stage.title || stage.id,
      count: counts.get(stage.id) ?? 0,
      color: stage.color
    }));
    const seen = new Set(tabs.map((tab) => tab.id));

    for (const article of items) {
      if (!article.stageId || seen.has(article.stageId)) continue;
      seen.add(article.stageId);
      tabs.push({
        id: article.stageId,
        label: article.stageTitle || article.stageId,
        count: counts.get(article.stageId) ?? 0,
        color: article.stageColor
      });
    }

    return [
      {
        id: "",
        label: currentLanguage === "zh" ? "全部阶段" : "All stages",
        count: items.length
      },
      ...tabs
    ];
  }

  function countBy(items: ArticleSummary[], getId: (article: ArticleSummary) => string | undefined): Map<string, number> {
    const counts = new Map<string, number>();
    for (const article of items) {
      const id = getId(article);
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }

  function firstTagLabel(tags: string[]): string | undefined {
    const tag = tags.find(Boolean);
    return tag ? `#${tag.replace(/^#+/u, "")}` : undefined;
  }

  function sortCurrentQuestions(items: OpenQuestion[], focus: ActiveLineRange | null): OpenQuestion[] {
    return items
      .map((question, index) => ({ question, index }))
      .sort((left, right) => {
        const byPinned = Number(Boolean(right.question.pinned)) - Number(Boolean(left.question.pinned));
        if (byPinned !== 0) {
          return byPinned;
        }

        const byFocus = questionDistance(left.question, focus) - questionDistance(right.question, focus);
        if (byFocus !== 0) {
          return byFocus;
        }

        return left.index - right.index;
      })
      .map((item) => item.question);
  }

  function questionDistance(question: OpenQuestion, focus: ActiveLineRange | null): number {
    if (!focus || focus.filePath !== question.source.file) {
      return Number.MAX_SAFE_INTEGER;
    }
    if (focus.to < question.source.lineStart) {
      return question.source.lineStart - focus.to;
    }
    if (focus.from > question.source.lineEnd) {
      return focus.from - question.source.lineEnd;
    }
    return 0;
  }

  function isWorkStatus(status: string) {
    return status !== "candidate" && status !== "resolved" && status !== "ignored";
  }

  function isLaneSectionCollapsed(lane: OpenQuestionLane) {
    return collapsedLaneSections[lane];
  }

  function toggleLaneSection(lane: OpenQuestionLane) {
    collapsedLaneSections = {
      ...collapsedLaneSections,
      [lane]: !collapsedLaneSections[lane]
    };
  }

  function laneSectionToggleTitle(lane: OpenQuestionLane) {
    if (language === "zh") {
      return isLaneSectionCollapsed(lane) ? "展开分区" : "折叠分区";
    }
    return isLaneSectionCollapsed(lane) ? "Expand section" : "Collapse section";
  }

  async function toggleCompactEditorDecorations() {
    await api.toggleCompactEditorDecorations();
    compactEditorDecorations = api.getCompactEditorDecorations();
  }

  function sidebarCopy(language: "zh" | "en") {
    if (language === "zh") {
      return {
        title: "开放问题",
        think: "ToThink",
        write: "ToWrite",
        all: "全部",
        open: "未完成",
        candidate: "候选",
        resolved: "已解决",
        createThink: "从选区创建 ToThink 卡片",
        refresh: "刷新索引",
        exportJson: "导出 JSON",
        compactHighlights: "隐藏整行高亮，仅保留左侧竖线",
        fullHighlights: "恢复整行高亮",
        searchPlaceholder: "搜索问题和文件",
        currentNote: "当前笔记",
        otherNotes: "其他笔记",
        emptyCurrent: "当前笔记还没有问题。",
        emptyFilter: "当前筛选下没有问题。",
        emptyOther: "没有其他未完成问题。",
        listView: "列表视图",
        folderView: "文件夹视图"
      };
    }

    return {
      title: "Open Questions",
      think: "ToThink",
      write: "ToWrite",
      all: "All",
      open: "open",
      candidate: "candidate",
      resolved: "resolved",
      createThink: "Create ToThink from selection",
      refresh: "Refresh index",
      exportJson: "Export JSON",
      compactHighlights: "Hide full-row highlights",
      fullHighlights: "Restore full-row highlights",
      searchPlaceholder: "Search questions and files",
      currentNote: "Current note",
      otherNotes: "Other notes",
      emptyCurrent: "No questions in this note yet.",
      emptyFilter: "No questions match this lane.",
      emptyOther: "No other open questions.",
      listView: "List view",
      folderView: "Folder view"
    };
  }
</script>

<section class="towrite-sidebar">
  <header class="towrite-sidebar-header">
    <div>
      <h2>{copy.title}</h2>
      <p>{currentThink} {copy.think} · {currentWrite} {copy.write} · {currentOpen} {copy.open} · {currentCandidate} {copy.candidate} · {currentResolved} {copy.resolved}</p>
    </div>
  </header>

  <div class="towrite-toolbar">
    <button
      type="button"
      title={language === "zh" ? "智能记录" : "Smart capture"}
      aria-label={language === "zh" ? "智能记录" : "Smart capture"}
      aria-haspopup="dialog"
      on:click={() => api.openCapture()}
    >
      <FilePenLine size={15} />
    </button>
    <button type="button" title={copy.createThink} on:click={() => api.createQuestionFromSelection("think")}>
      <Plus size={15} />
    </button>
    <button type="button" title={copy.refresh} on:click={() => api.refreshIndex()}>
      <RefreshCw size={15} />
    </button>
    <button type="button" title={copy.exportJson} on:click={() => api.exportNow()}>
      <Download size={15} />
    </button>
    <button
      type="button"
      class:towrite-action-active={compactEditorDecorations}
      title={compactEditorDecorations ? copy.fullHighlights : copy.compactHighlights}
      on:click={toggleCompactEditorDecorations}
    >
      {#if compactEditorDecorations}
        <Eye size={15} />
      {:else}
        <EyeOff size={15} />
      {/if}
    </button>
  </div>

  <label class="towrite-search">
    <Search size={15} />
    <input bind:value={search} type="search" placeholder={copy.searchPlaceholder} />
  </label>

  <div class="towrite-segmented towrite-lane-filter" role="group" aria-label="Lane filter">
    <button type="button" class:active={laneFilter === "all"} on:click={() => (laneFilter = "all")}>
      <span>{copy.all}</span>
      <small>{currentQuestions.length}</small>
    </button>
    <button type="button" class:active={laneFilter === "think"} on:click={() => (laneFilter = "think")}>
      <span>{copy.think}</span>
      <small>{currentThink}</small>
    </button>
    <button type="button" class:active={laneFilter === "write"} on:click={() => (laneFilter = "write")}>
      <span>{copy.write}</span>
      <small>{currentWrite}</small>
    </button>
  </div>

  {#if typeTabs.length > 1 || stageTabs.length > 1}
    <div class="towrite-filter-stack">
      {#if typeTabs.length > 1}
        <div class="towrite-filter-row">
          <span>{language === "zh" ? "分类" : "Types"}</span>
          <div class="towrite-filter-tabs" role="group" aria-label={language === "zh" ? "文章分类筛选" : "Article type filter"}>
            {#each typeTabs as tab (tab.id)}
              <button
                type="button"
                class={`towrite-filter-chip towrite-filter-chip-${tab.color ?? "slate"}`}
                class:active={typeFilter === tab.id}
                title={`${tab.label}${tab.tag ? ` ${tab.tag}` : ""} ${tab.count}`}
                on:click={() => {
                  typeFilter = tab.id;
                  stageFilter = "";
                }}
              >
                <span>{tab.label}</span>
                {#if tab.tag}
                  <small class="towrite-filter-tag">{tab.tag}</small>
                {/if}
                <small class="towrite-filter-count">{tab.count}</small>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if stageTabs.length > 1}
        <div class="towrite-filter-row">
          <span>{language === "zh" ? "Workflow" : "Workflow"}</span>
          <div class="towrite-filter-tabs" role="group" aria-label={language === "zh" ? "Workflow 阶段筛选" : "Workflow stage filter"}>
            {#each stageTabs as tab (tab.id)}
              <button
                type="button"
                class={`towrite-filter-chip towrite-filter-chip-${tab.color ?? "slate"}`}
                class:active={stageFilter === tab.id}
                title={`${tab.label} ${tab.count}`}
                on:click={() => (stageFilter = tab.id)}
              >
                <span>{tab.label}</span>
                <small class="towrite-filter-count">{tab.count}</small>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <main class="towrite-card-list">
    <section class="towrite-now-section" aria-labelledby="towrite-now-heading">
      <div class="towrite-section-title">
        <span id="towrite-now-heading">{language === "zh" ? "现在" : "Now"}</span>
        <small>{suggestions.length}</small>
      </div>
      {#if suggestionError}<p class="towrite-suggestion-error" role="alert">{suggestionError}</p>{/if}
      {#if suggestions.length === 0}
        <div class="towrite-empty">{language === "zh" ? "当前没有需要提醒或确认的建议。" : "Nothing needs attention right now."}</div>
      {:else}
        <div class="towrite-suggestion-list">
          {#each suggestions.slice(0, 8) as suggestion (suggestion.id)}
            <article
              class={`towrite-suggestion towrite-suggestion-${suggestion.source}`}
              aria-busy={busySuggestionId === suggestion.id}
            >
              <div class="towrite-suggestion-icon" aria-hidden="true">
                {#if suggestion.source === "due-reminder"}
                  <Bell size={15} />
                {:else if suggestion.source === "habit-candidate" || suggestion.source === "confirmed-habit"}
                  <Brain size={15} />
                {:else}
                  <Clock3 size={15} />
                {/if}
              </div>
              <div class="towrite-suggestion-main">
                <small>{suggestionSourceLabel(suggestion)}</small>
                <strong>{suggestion.title}</strong>
                <p>{suggestion.triggerReason}</p>
                {#if suggestion.detail && suggestion.detail !== suggestion.title}
                  <p class="towrite-suggestion-detail">{suggestion.detail}</p>
                {/if}
                <div class="towrite-suggestion-actions">
                  {#if suggestion.allowedActions.includes("accept")}
                    <button type="button" disabled={Boolean(busySuggestionId)} aria-label={`${language === "zh" ? "接受" : "Accept"}: ${suggestion.title}`} on:click={() => actOnSuggestion(suggestion, "accept")}><Check size={12} />{language === "zh" ? "接受" : "Accept"}</button>
                  {/if}
                  {#if suggestion.allowedActions.includes("open-source")}
                    <button type="button" disabled={Boolean(busySuggestionId)} aria-label={`${language === "zh" ? "打开" : "Open"}: ${suggestion.title}`} on:click={() => actOnSuggestion(suggestion, "open-source")}>{language === "zh" ? "打开" : "Open"}</button>
                  {/if}
                  {#if suggestion.allowedActions.includes("view-evidence")}
                    <button type="button" disabled={Boolean(busySuggestionId)} aria-label={`${language === "zh" ? "证据" : "Evidence"}: ${suggestion.title}`} on:click={() => actOnSuggestion(suggestion, "view-evidence")}>{language === "zh" ? "证据" : "Evidence"}</button>
                  {/if}
                  {#if suggestion.allowedActions.includes("edit")}
                    <button type="button" disabled={Boolean(busySuggestionId)} aria-label={`${language === "zh" ? "编辑" : "Edit"}: ${suggestion.title}`} on:click={() => actOnSuggestion(suggestion, "edit")}>{language === "zh" ? "编辑" : "Edit"}</button>
                  {/if}
                  {#if suggestion.allowedActions.includes("later") || suggestion.allowedActions.includes("snooze")}
                    <button type="button" disabled={Boolean(busySuggestionId)} aria-label={`${language === "zh" ? "稍后" : "Later"}: ${suggestion.title}`} on:click={() => actOnSuggestion(suggestion, suggestion.allowedActions.includes("snooze") ? "snooze" : "later")}>{language === "zh" ? "稍后" : "Later"}</button>
                  {/if}
                  {#if suggestion.allowedActions.includes("dismiss")}
                    <button type="button" disabled={Boolean(busySuggestionId)} aria-label={`${language === "zh" ? "忽略" : "Dismiss"}: ${suggestion.title}`} on:click={() => actOnSuggestion(suggestion, "dismiss")}>{language === "zh" ? "忽略" : "Dismiss"}</button>
                  {/if}
                </div>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>

    <section class="towrite-current-note">
      <div class="towrite-section-title">
        <span>{copy.currentNote}</span>
        {#if activeFile}
          <button
            type="button"
            class="towrite-section-path"
            class:towrite-path-expanded={activePathExpanded}
            title={activeFile}
            on:click={() => (activePathExpanded = !activePathExpanded)}
          >
            {activePathLabel}
          </button>
        {/if}
      </div>

      {#if currentQuestions.length === 0}
        <div class="towrite-empty">{copy.emptyCurrent}</div>
      {:else if filteredCurrentQuestions.length === 0}
        <div class="towrite-empty">{copy.emptyFilter}</div>
      {:else}
        {#each currentLaneSections as section (section.lane)}
          <section class:towrite-lane-section-collapsed={isLaneSectionCollapsed(section.lane)} class={`towrite-lane-section towrite-lane-section-${section.lane}`}>
            <h3 class="towrite-lane-section-title">
              <button
                type="button"
                title={laneSectionToggleTitle(section.lane)}
                aria-expanded={!isLaneSectionCollapsed(section.lane)}
                on:click={() => toggleLaneSection(section.lane)}
              >
                {#if isLaneSectionCollapsed(section.lane)}
                  <ChevronRight size={13} />
                {:else}
                  <ChevronDown size={13} />
                {/if}
                <span>{section.label}</span>
              </button>
              <small>{section.items.length}</small>
            </h3>
            {#if !isLaneSectionCollapsed(section.lane)}
              {#if groupCurrentByHeading}
                {#each groupByHeading(section.items) as [heading, items]}
                  <section class="towrite-group">
                    <h4>{heading}</h4>
                    {#each items as question (question.id)}
                      <QuestionCard {question} {api} globalCompactEditorDecorations={compactEditorDecorations} />
                    {/each}
                  </section>
                {/each}
              {:else}
                {#each section.items as question (question.id)}
                  <QuestionCard {question} {api} globalCompactEditorDecorations={compactEditorDecorations} />
                {/each}
              {/if}
            {/if}
          </section>
        {/each}
      {/if}
    </section>

    <section class="towrite-other-notes">
      <div class="towrite-section-title">
        <span>{copy.otherNotes}</span>
        <div class="towrite-view-toggle">
          <button class:active={otherMode === "list"} type="button" title={copy.listView} on:click={() => (otherMode = "list")}>
            <List size={14} />
          </button>
          <button class:active={otherMode === "tree"} type="button" title={copy.folderView} on:click={() => (otherMode = "tree")}>
            <FolderTree size={14} />
          </button>
        </div>
      </div>

      {#if visibleOtherArticles.length === 0}
        <div class="towrite-empty">{copy.emptyOther}</div>
      {:else if otherMode === "list"}
        <div class="towrite-article-list">
          {#each visibleOtherArticles as article (article.filePath)}
            <ArticleSummaryCard {article} {api} {laneFilter} />
          {/each}
        </div>
      {:else}
        {#each folderGroups as [folder, articles]}
          <section class="towrite-folder-group">
            <h3>{folder}</h3>
            {#each articles as article (article.filePath)}
              <ArticleSummaryCard {article} {api} {laneFilter} />
            {/each}
          </section>
        {/each}
      {/if}
    </section>
  </main>
</section>
