<script lang="ts">
  import {
    ChevronDown,
    ChevronRight,
    Download,
    Eye,
    EyeOff,
    FolderTree,
    List,
    Plus,
    RefreshCw,
    Search
  } from "lucide-svelte";
  import { onDestroy } from "svelte";
  import type { ArticleSummary, OpenQuestion, OpenQuestionLane } from "../core/types";
  import type { ActiveLineRange, ToWriteUiApi } from "./api";
  import ArticleSummaryCard from "./ArticleSummaryCard.svelte";
  import QuestionCard from "./QuestionCard.svelte";
  import { compactPath } from "./path";

  export let api: ToWriteUiApi;

  type OtherMode = "list" | "tree";
  type LaneFilter = "all" | OpenQuestionLane;

  let search = "";
  let otherMode: OtherMode = "list";
  let laneFilter: LaneFilter = "all";
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
  $: visibleOtherArticles = otherArticles.filter(matchesArticleLaneFilter);
  $: folderGroups = groupArticlesByFolder(visibleOtherArticles);
  $: activePathLabel = activeFile ? (activePathExpanded ? activeFile : compactPath(activeFile, 3)) : "";
  $: language = api.getLanguage();
  $: copy = sidebarCopy(language);

  function reload() {
    activeFile = api.getActiveFile();
    activeLineRange = api.getActiveLineRange();
    compactEditorDecorations = api.getCompactEditorDecorations();
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
    otherArticles = api
      .getArticleSummaries()
      .filter((summary) => summary.filePath !== activeFile)
      .filter((summary) => summary.needsWork || summary.candidate > 0)
      .filter((summary) => {
        if (!needle) return true;
        return `${summary.title} ${summary.filePath}`.toLowerCase().includes(needle);
      });
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
    if (laneFilter === "think") {
      return article.think > 0;
    }
    if (laneFilter === "write") {
      return article.write > 0;
    }
    return true;
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

  <main class="towrite-card-list">
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
