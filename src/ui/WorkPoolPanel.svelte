<script lang="ts">
  import {
    Archive,
    BookOpen,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Filter,
    FlaskConical,
    FolderKanban,
    Cpu,
    Lightbulb,
    MoreHorizontal,
    Package,
    Palette,
    PenLine,
    Plus,
    RefreshCw,
    Rocket,
    RotateCcw,
    Save,
    Settings2,
    Trash2,
    Wrench,
    X
  } from "lucide-svelte";
  import { onDestroy, onMount } from "svelte";
  import {
    filterWorkPoolItems,
    groupWorkPoolItemsBy
  } from "../work-pool";
  import type {
    DailyDashboardAdapter,
    WorkPoolAction,
    WorkPoolGroupingDimension,
    WorkPoolHistoryMode,
    WorkPoolItem,
    WorkPoolPresentationSettings,
    WorkPoolProjectAppearance,
    WorkPoolProjectRule,
    WorkPoolSnapshot,
    WorkPoolSourceTab,
    WorkPoolViewPreset
  } from "./daily-dashboard-types";

  export let dailyApi: DailyDashboardAdapter;
  export let date: string;
  export let workflowStages: Array<{ id: string; label: string }> = [];
  export let articleTypes: Array<{ id: string; label: string }> = [];
  export let questionStatuses: Array<{ id: string; label: string }> = [];
  export let initialSettings: WorkPoolPresentationSettings | undefined = undefined;

  const dimensions: Array<{ id: WorkPoolGroupingDimension; label: string }> = [
    { id: "workType", label: "工作类型" },
    { id: "project", label: "具体项目" },
    { id: "subproject", label: "父级任务 / 子项目" },
    { id: "source", label: "来源" },
    { id: "stage", label: "Workflow 阶段" },
    { id: "articleType", label: "文章类型" },
    { id: "note", label: "关联笔记" },
    { id: "status", label: "原生状态" },
    { id: "category", label: "任务类别" },
    { id: "none", label: "不分组" }
  ];
  const sources: Array<{ id: WorkPoolSourceTab; label: string }> = [
    { id: "all", label: "全部" },
    { id: "task", label: "任务" },
    { id: "tothink", label: "ToThink" },
    { id: "towrite", label: "ToWrite" },
    { id: "inbox", label: "Inbox" },
    { id: "note", label: "笔记" }
  ];
  const projectIcons: Record<string, typeof FolderKanban> = {
    "folder-kanban": FolderKanban,
    cpu: Cpu,
    book: BookOpen,
    pen: PenLine,
    idea: Lightbulb,
    wrench: Wrench,
    rocket: Rocket,
    package: Package,
    lab: FlaskConical
  };

  let snapshot: WorkPoolSnapshot | undefined;
  let settings = initialSettings ?? fallbackSettings();
  let activeViewId = settings.defaultViewId;
  let source: WorkPoolSourceTab = "all";
  let history: WorkPoolHistoryMode = "active";
  let stageId = "";
  let typeId = "";
  let category = "";
  let status = "";
  let workType = "";
  let project = "";
  let search = "";
  let loading = true;
  let busy = "";
  let error = "";
  let notice = "";
  let visibleLimit = settings.pageSize;
  let unsubscribe: (() => void) | undefined;
  let loadedDate = "";
  let draftText = "";
  let draftCategory = "";
  let draftProject = "";
  let draftTarget = "";
  let draftSchedule: "pool" | "today" | "tomorrow" = "pool";
  let draftFocused = false;
  let selectedExisting: WorkPoolItem | undefined;
  let viewLabel = "";
  let viewLayout: "list" | "board" = "board";
  let viewPrimary: WorkPoolGroupingDimension = "workType";
  let viewSecondary: WorkPoolGroupingDimension = "project";
  let viewExpanded = true;
  let projectKeys = settings.projectFrontmatterKeys.join(", ");
  let projectPrefixes = settings.projectTagPrefixes.join(", ");
  let projectRulesText = formatProjectRules(settings.projectRules);
  let showTechnicalMetadata = settings.showTechnicalMetadata;
  let editingProjectId = "";
  let editingProjectLabel = "";
  let editingProjectColor = "#7c6ee6";
  let editingProjectIcon = "folder-kanban";

  onMount(() => {
    unsubscribe = dailyApi.subscribe?.(() => void reload(false));
    void initialize();
  });
  onDestroy(() => unsubscribe?.());

  $: if (date && date !== loadedDate) {
    loadedDate = date;
    void reload(false);
  }
  $: activeView = settings.views.find((view) => view.id === activeViewId) ?? settings.views[0];
  $: allItems = snapshot?.items ?? [];
  $: filteredItems = filterWorkPoolItems(allItems, {
    source,
    history,
    stageId: stageId || undefined,
    typeId: typeId || undefined,
    category: category || undefined,
    status: status || undefined,
    workType: workType || undefined,
    project: project || undefined,
    search: search || undefined
  });
  $: visibleItems = filteredItems.slice(0, visibleLimit);
  $: groups = groupWorkPoolItemsBy(
    visibleItems,
    activeView?.primary ?? "workType",
    activeView?.secondary ?? "project"
  );
  $: categories = uniqueValues(allItems.map((item) => item.category));
  $: statuses = uniqueValues(allItems.map(nativeStatus));
  $: workTypes = uniquePairs(allItems.map((item) => ({
    id: item.classification.workTypeId,
    label: item.classification.workTypeLabel
  })));
  $: projects = uniquePairs(allItems
    .filter((item) => item.classification.projectId && item.classification.projectLabel)
    .map((item) => ({
      id: item.classification.projectId!,
      label: item.classification.projectLabel!
    })));
  $: draftSuggestions = rankDraftSuggestions(allItems, draftText, selectedExisting?.id);

  async function initialize(): Promise<void> {
    try {
      const configuration = await dailyApi.getConfiguration?.();
      if (configuration?.workPool) {
        settings = cloneSettings(configuration.workPool);
        activeViewId = settings.defaultViewId;
        projectKeys = settings.projectFrontmatterKeys.join(", ");
        projectPrefixes = settings.projectTagPrefixes.join(", ");
        projectRulesText = formatProjectRules(settings.projectRules);
        showTechnicalMetadata = settings.showTechnicalMetadata;
      }
      applyView(settings.views.find((view) => view.id === activeViewId) ?? settings.views[0]);
    } catch (cause) {
      error = message(cause);
    }
    await reload();
  }

  async function reload(showLoading = true): Promise<void> {
    if (!dailyApi.getWorkPool) {
      loading = false;
      return;
    }
    if (showLoading) loading = true;
    error = "";
    try {
      snapshot = await dailyApi.getWorkPool({ history: "all" });
    } catch (cause) {
      error = message(cause);
    } finally {
      loading = false;
    }
  }

  async function syncMarkdownTasks(): Promise<void> {
    if (!dailyApi.syncMarkdownTasks || busy) return;
    busy = "scan-markdown";
    error = "";
    notice = "正在后台扫描 Markdown 待办…";
    try {
      const result = await dailyApi.syncMarkdownTasks();
      notice = `已扫描 ${result.filesScanned} 篇笔记，新增汇总 ${result.tasksRegistered} 条待办${result.filesFailed ? `；${result.filesFailed} 篇需检查` : ""}`;
      await reload(false);
    } catch (cause) {
      error = message(cause);
      notice = "";
    } finally {
      busy = "";
    }
  }

  async function refreshWorkPool(): Promise<void> {
    if (busy) return;
    if (dailyApi.syncMarkdownTasks) await syncMarkdownTasks();
    else await reload();
  }

  function chooseView(view: WorkPoolViewPreset): void {
    activeViewId = view.id;
    visibleLimit = settings.pageSize;
    applyView(view);
    void saveSettings({ defaultViewId: view.id });
  }

  function applyView(view: WorkPoolViewPreset | undefined): void {
    if (!view) return;
    source = view.source ?? "all";
    history = view.history ?? "active";
    stageId = view.stageId ?? "";
    typeId = view.typeId ?? "";
    status = view.status ?? "";
    workType = view.workType ?? "";
    project = view.project ?? "";
    loadViewEditor(view);
  }

  function loadViewEditor(view: WorkPoolViewPreset): void {
    viewLabel = view.label;
    viewLayout = view.layout ?? (view.primary === "project" ? "board" : "list");
    viewPrimary = view.primary;
    viewSecondary = view.secondary;
    viewExpanded = view.defaultExpanded ?? settings.defaultGroupsExpanded;
  }

  async function createTask(): Promise<void> {
    if (!draftText.trim() || !dailyApi.createPoolTask || busy) return;
    if (selectedExisting) {
      if (draftSchedule === "today" || draftSchedule === "tomorrow") {
        await act(selectedExisting, draftSchedule === "today" ? "add-today" : "add-tomorrow", {
          date: draftSchedule === "today" ? date : offsetDate(date, 1)
        });
      } else {
        notice = "这条内容已经在工作池中；可以直接打开，或选择加入今天/明天。";
      }
      selectedExisting = undefined;
      draftText = "";
      return;
    }
    busy = "create";
    error = "";
    try {
      const created = await dailyApi.createPoolTask({
        text: draftText.trim(),
        category: draftCategory.trim() || undefined,
        project: draftProject.trim() || undefined,
        target: draftTarget.trim() || undefined
      });
      if (created && draftSchedule !== "pool" && dailyApi.assignPoolTask) {
        await dailyApi.assignPoolTask(
          created.taskId,
          created.revision,
          draftSchedule === "today" ? date : offsetDate(date, 1)
        );
      }
      draftText = "";
      draftCategory = "";
      draftProject = "";
      draftTarget = "";
      draftSchedule = "pool";
      selectedExisting = undefined;
      await reload(false);
    } catch (cause) {
      error = message(cause);
    } finally {
      busy = "";
    }
  }

  function chooseDraftSuggestion(item: WorkPoolItem): void {
    if (item.kind === "task") {
      selectedExisting = item;
      draftText = item.title;
      draftCategory = item.category ?? "";
      draftProject = item.classification.projectLabel ?? item.project ?? "";
      draftTarget = item.target ?? "";
      return;
    }
    selectedExisting = undefined;
    draftTarget = item.notePath ? `[[${item.notePath.replace(/\.md$/iu, "")}]]` : item.target ?? "";
    if (!draftProject) draftProject = item.classification.projectLabel ?? "";
  }

  function rankDraftSuggestions(items: WorkPoolItem[], query: string, selectedId?: string): WorkPoolItem[] {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle || selectedId) return [];
    return items
      .filter((item) => item.active)
      .map((item) => {
        const title = item.title.toLocaleLowerCase();
        const haystack = [item.title, item.notePath, item.project, item.classification.projectLabel, item.tags.join(" ")]
          .filter(Boolean).join(" ").toLocaleLowerCase();
        const score = title === needle ? 100 : title.startsWith(needle) ? 80 : title.includes(needle) ? 60 : haystack.includes(needle) ? 35 : 0;
        return { item, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title, "zh-CN"))
      .slice(0, 6)
      .map((entry) => entry.item);
  }

  async function act(
    item: WorkPoolItem,
    action: WorkPoolAction,
    options: { date?: string; stageId?: string; status?: string } = {}
  ): Promise<void> {
    if (!dailyApi.actOnWorkPoolItem || busy) return;
    busy = `${item.id}:${action}`;
    error = "";
    try {
      await dailyApi.actOnWorkPoolItem(item, action, options);
      await reload(false);
    } catch (cause) {
      error = message(cause);
    } finally {
      busy = "";
    }
  }

  async function saveCurrentView(): Promise<void> {
    if (!activeView || !viewLabel.trim()) return;
    const secondary = viewSecondary === viewPrimary ? "none" : viewSecondary;
    const views = settings.views.map((view) => view.id === activeView.id
      ? {
          ...view,
          label: viewLabel.trim(),
          layout: viewLayout,
          primary: viewPrimary,
          secondary,
          defaultExpanded: viewExpanded,
          source,
          history,
          stageId: stageId || undefined,
          typeId: typeId || undefined,
          status: status || undefined,
          workType: workType || undefined,
          project: project || undefined
        }
      : view);
    await saveSettings({ views });
  }

  async function addView(): Promise<void> {
    const id = uniqueViewId("custom-view", settings.views);
    const view: WorkPoolViewPreset = {
      id,
      label: "新视图",
      layout: "board",
      primary: "workType",
      secondary: "project",
      history: "active",
      defaultExpanded: true
    };
    await saveSettings({ views: [...settings.views, view], defaultViewId: id });
    activeViewId = id;
    applyView(view);
  }

  async function removeView(): Promise<void> {
    if (!activeView || settings.views.length <= 1) return;
    const views = settings.views.filter((view) => view.id !== activeView.id);
    const next = views[0];
    await saveSettings({ views, defaultViewId: next.id });
    activeViewId = next.id;
    applyView(next);
  }

  async function moveView(direction: -1 | 1): Promise<void> {
    if (!activeView) return;
    const index = settings.views.findIndex((view) => view.id === activeView.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= settings.views.length) return;
    const views = [...settings.views];
    [views[index], views[nextIndex]] = [views[nextIndex], views[index]];
    await saveSettings({ views });
  }

  async function saveProjectRecognition(): Promise<void> {
    const projectFrontmatterKeys = splitList(projectKeys);
    const projectTagPrefixes = splitList(projectPrefixes).map((value) => value.replace(/^#+/u, ""));
    const projectRules = parseProjectRules(projectRulesText);
    await saveSettings({
      projectFrontmatterKeys,
      projectTagPrefixes,
      projectRules,
      showTechnicalMetadata
    });
    await reload(false);
  }

  function projectAppearance(projectId: string): WorkPoolProjectAppearance | undefined {
    return settings.projectAppearances.find((appearance) => appearance.projectId === projectId);
  }

  function projectIcon(projectId: string): typeof FolderKanban {
    return projectIcons[projectAppearance(projectId)?.icon ?? "folder-kanban"] ?? FolderKanban;
  }

  function groupColor(dimension: WorkPoolGroupingDimension, key: string): string {
    if (dimension === "project") return projectAppearance(key)?.color ?? colorFromKey(key);
    return colorFromKey(`${dimension}:${key}`);
  }

  function colorFromKey(value: string): string {
    const palette = ["#7c6ee6", "#3f8fcf", "#35a078", "#d68b35", "#cf5c74", "#6f8f3d", "#a660c2", "#4b96a6"];
    let hash = 0;
    for (const character of value) hash = ((hash << 5) - hash + character.codePointAt(0)!) | 0;
    return palette[Math.abs(hash) % palette.length];
  }

  function beginProjectAppearance(projectId: string, event?: MouseEvent, label?: string): void {
    event?.preventDefault();
    event?.stopPropagation();
    const current = projectAppearance(projectId);
    editingProjectId = projectId;
    editingProjectLabel = label ?? projects.find((candidate) => candidate.id === projectId)?.label ?? projectId;
    editingProjectColor = current?.color ?? "#7c6ee6";
    editingProjectIcon = current?.icon ?? "folder-kanban";
  }

  async function saveProjectAppearance(projectId: string): Promise<void> {
    const next: WorkPoolProjectAppearance = {
      projectId,
      color: editingProjectColor,
      icon: editingProjectIcon
    };
    const projectAppearances = [
      ...settings.projectAppearances.filter((appearance) => appearance.projectId !== projectId),
      next
    ];
    await saveSettings({ projectAppearances });
    editingProjectId = "";
    editingProjectLabel = "";
  }

  async function saveSettings(patch: Partial<WorkPoolPresentationSettings>): Promise<void> {
    if (!dailyApi.updateWorkPoolSettings || busy) return;
    busy = "settings";
    try {
      await dailyApi.updateWorkPoolSettings(patch);
      const configuration = await dailyApi.getConfiguration?.();
      if (configuration?.workPool) settings = cloneSettings(configuration.workPool);
      else settings = cloneSettings({ ...settings, ...patch });
      if (!settings.views.some((view) => view.id === activeViewId)) {
        activeViewId = settings.defaultViewId;
      }
    } catch (cause) {
      error = message(cause);
    } finally {
      busy = "";
    }
  }

  async function hideItem(item: WorkPoolItem): Promise<void> {
    if (busy) return;
    await saveSettings({ hiddenItemIds: uniqueValues([...settings.hiddenItemIds, item.id]) });
    notice = `已隐藏“${item.title}”；原文没有修改，可在“不整理名单”中恢复。`;
    await reload(false);
  }

  async function excludeSource(item: WorkPoolItem): Promise<void> {
    if (!item.notePath || busy) return;
    await saveSettings({
      excludedSourcePaths: uniqueValues([...settings.excludedSourcePaths, item.notePath])
    });
    notice = `已将 ${item.notePath} 加入不整理名单；该来源不会再被自动扫描。`;
    await reload(false);
  }

  async function restoreHiddenItem(itemId: string): Promise<void> {
    await saveSettings({ hiddenItemIds: settings.hiddenItemIds.filter((candidate) => candidate !== itemId) });
    notice = "已恢复隐藏条目。";
    await reload(false);
  }

  async function restoreExcludedSource(path: string): Promise<void> {
    await saveSettings({
      excludedSourcePaths: settings.excludedSourcePaths.filter((candidate) => candidate !== path)
    });
    notice = `已移除 ${path}；后续更新时会重新纳入工作池。`;
    await reload(false);
  }

  async function clearVisibilityRules(): Promise<void> {
    await saveSettings({ hiddenItemIds: [], excludedSourcePaths: [] });
    notice = "已清空隐藏和不整理名单。";
    await reload(false);
  }

  function selectStage(item: WorkPoolItem, event: Event): void {
    const next = (event.currentTarget as HTMLSelectElement).value;
    if (next && next !== item.stageId) void act(item, "change-stage", { stageId: next });
  }

  function selectQuestionStatus(item: WorkPoolItem, event: Event): void {
    const next = (event.currentTarget as HTMLSelectElement).value;
    if (next && next !== item.questionStatus) void act(item, "change-question-status", { status: next });
  }

  function kindLabel(item: WorkPoolItem): string {
    if (item.kind === "task") return "任务";
    if (item.kind === "question") return item.lane === "write" ? "ToWrite" : "ToThink";
    return item.inbox ? "Inbox" : "笔记";
  }

  function nativeStatus(item: WorkPoolItem): string | undefined {
    return item.taskState ?? item.questionStatus ?? item.stageId;
  }

  function itemMeta(item: WorkPoolItem): string {
    return [
      kindLabel(item),
      item.classification.projectLabel,
      item.classification.subprojectLabel,
      item.stageTitle,
      item.typeTitle,
      item.dueDate ? `DDL ${item.dueDate}` : ""
    ].filter(Boolean).join(" · ");
  }

  function fallbackSettings(): WorkPoolPresentationSettings {
    return {
      defaultViewId: "all-work",
      views: [{ id: "all-work", label: "全部工作", layout: "board", primary: "workType", secondary: "project", history: "active", defaultExpanded: true }],
      projectFrontmatterKeys: ["project", "projects"],
      projectTagPrefixes: ["project/"],
      projectRules: [],
      projectAppearances: [],
      pageSize: 80,
      defaultGroupsExpanded: true,
      showTechnicalMetadata: false,
      hiddenItemIds: [],
      includedSourcePaths: [],
      autoIncludeDailyLinks: true,
      autoIncludeWorkflowNotes: true,
      autoIncludeQuestionNotes: true,
      excludedSourcePaths: []
    };
  }

  function cloneSettings(value: WorkPoolPresentationSettings): WorkPoolPresentationSettings {
    return {
      ...value,
      views: value.views.map((view) => ({ ...view })),
      projectFrontmatterKeys: [...value.projectFrontmatterKeys],
      projectTagPrefixes: [...value.projectTagPrefixes],
      projectRules: value.projectRules.map((rule) => ({ ...rule, tags: [...rule.tags], folderPrefixes: [...rule.folderPrefixes] })),
      projectAppearances: value.projectAppearances.map((appearance) => ({ ...appearance })),
      hiddenItemIds: [...(value.hiddenItemIds ?? [])],
      includedSourcePaths: [...(value.includedSourcePaths ?? [])],
      excludedSourcePaths: [...(value.excludedSourcePaths ?? [])]
    };
  }

  function uniqueValues(values: Array<string | undefined>): string[] {
    return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, "zh-CN"));
  }

  function uniquePairs(values: Array<{ id: string; label: string }>): Array<{ id: string; label: string }> {
    return [...new Map(values.map((value) => [value.id, value])).values()]
      .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
  }

  function splitList(value: string): string[] {
    return [...new Set(value.split(/[\n,，]/u).map((item) => item.trim()).filter(Boolean))];
  }

  function formatProjectRules(rules: WorkPoolProjectRule[]): string {
    return rules.map((rule) => `${rule.label} | ${rule.folderPrefixes.join(",")} | ${rule.tags.join(",")}`).join("\n");
  }

  function parseProjectRules(value: string): WorkPoolProjectRule[] {
    return value.split(/\r?\n/u).map((line) => {
      const [label = "", folders = "", tags = ""] = line.split("|").map((part) => part.trim());
      return {
        id: label.toLocaleLowerCase().replace(/[^\p{Letter}\p{Number}_-]+/gu, "-").replace(/^-+|-+$/gu, ""),
        label,
        folderPrefixes: splitList(folders),
        tags: splitList(tags)
      };
    }).filter((rule) => Boolean(rule.id && rule.label));
  }

  function uniqueViewId(base: string, views: WorkPoolViewPreset[]): string {
    const used = new Set(views.map((view) => view.id));
    let index = 1;
    while (used.has(`${base}-${index}`)) index += 1;
    return `${base}-${index}`;
  }

  function offsetDate(value: string, days: number): string {
    const dateValue = new Date(`${value}T12:00:00`);
    dateValue.setDate(dateValue.getDate() + days);
    return [dateValue.getFullYear(), String(dateValue.getMonth() + 1).padStart(2, "0"), String(dateValue.getDate()).padStart(2, "0")].join("-");
  }

  function message(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
  }
</script>

<section class="work-pool" aria-label="统一工作池">
  <header class="pool-toolbar">
    <div>
      <span>工作池</span>
      <strong>{filteredItems.length} 项可管理工作</strong>
      <small>这是 Markdown 任务池、普通笔记待办、问题和 Workflow 笔记的统一视图；原文仍是数据真源。</small>
    </div>
    <div class="toolbar-actions">
      {#if dailyApi.openTaskPoolSource}
        <button type="button" title="打开保存未安排任务的 Markdown 原文" on:click={() => dailyApi.openTaskPoolSource?.()}><BookOpen size={14} />打开任务池原文</button>
      {/if}
      <button type="button" title="重新读取索引与 Markdown 待办" aria-label="刷新工作池" on:click={refreshWorkPool}><RefreshCw size={15} />刷新</button>
    </div>
  </header>

  {#if error}<div class="error" role="alert">{error}</div>{/if}
  {#if notice}<div class="notice" role="status">{notice}</div>{/if}

  <div class="view-bar">
    <nav aria-label="保存的工作池视图">
      {#each settings.views as view (view.id)}
        <button type="button" class:active={activeViewId === view.id} on:click={() => chooseView(view)}>{view.label}</button>
      {/each}
    </nav>
    <details class="view-manager">
      <summary><Settings2 size={14} />管理视图</summary>
      <div class="manager-panel">
        <div class="manager-row">
          <label><span>名称</span><input bind:value={viewLabel} /></label>
          <label><span>布局</span><select bind:value={viewLayout}><option value="board">横向看板</option><option value="list">纵向列表</option></select></label>
          <label><span>一级分组</span><select bind:value={viewPrimary}>{#each dimensions as dimension}<option value={dimension.id}>{dimension.label}</option>{/each}</select></label>
          <label><span>二级分组</span><select bind:value={viewSecondary}>{#each dimensions as dimension}<option value={dimension.id}>{dimension.label}</option>{/each}</select></label>
        </div>
        <div class="manager-actions">
          <label class="check"><input type="checkbox" bind:checked={viewExpanded} />默认展开分组</label>
          <button type="button" on:click={() => moveView(-1)}><ChevronLeft size={14} />前移</button>
          <button type="button" on:click={() => moveView(1)}>后移<ChevronRight size={14} /></button>
          <button type="button" on:click={addView}><Plus size={14} />新视图</button>
          <button type="button" disabled={settings.views.length <= 1} on:click={removeView}><Trash2 size={14} />删除</button>
          <button class="primary" type="button" on:click={saveCurrentView}><Save size={14} />保存视图</button>
        </div>
        <details class="project-recognition">
          <summary>项目识别规则</summary>
          <div>
            <label><span>Frontmatter 字段</span><input bind:value={projectKeys} placeholder="project, projects" /></label>
            <label><span>项目标签前缀</span><input bind:value={projectPrefixes} placeholder="project/" /></label>
            <label class="wide"><span>文件夹/标签规则（项目名 | 文件夹 | 标签）</span><textarea rows="3" bind:value={projectRulesText} placeholder="外骨骼 | Projects/Exoskeleton | project/exoskeleton"></textarea></label>
            <label class="wide debug-toggle"><input type="checkbox" bind:checked={showTechnicalMetadata} /><span>调试：在 Task Pool 中显示技术字段</span></label>
            <button type="button" on:click={saveProjectRecognition}>保存识别规则</button>
          </div>
        </details>
        <details class="visibility-manager">
          <summary>
            隐藏与不整理名单
            <span>{settings.hiddenItemIds.length + settings.excludedSourcePaths.length}</span>
          </summary>
          <div>
            <p>这里只影响工作池、推荐和自动整理；不会删除原文待办，也不会把任务标成完成。</p>
            {#if settings.excludedSourcePaths.length > 0}
              <section>
                <strong>不整理的文件或文件夹</strong>
                {#each settings.excludedSourcePaths as path (path)}
                  <div class="visibility-rule"><code>{path}</code><button type="button" on:click={() => restoreExcludedSource(path)}>重新纳入</button></div>
                {/each}
              </section>
            {/if}
            {#if settings.hiddenItemIds.length > 0}
              <section>
                <strong>单独隐藏的条目</strong>
                {#each settings.hiddenItemIds as itemId (itemId)}
                  <div class="visibility-rule"><code>{itemId}</code><button type="button" on:click={() => restoreHiddenItem(itemId)}>恢复</button></div>
                {/each}
              </section>
            {/if}
            {#if settings.hiddenItemIds.length + settings.excludedSourcePaths.length === 0}
              <small>当前没有隐藏或排除规则。</small>
            {:else}
              <button type="button" class="clear-visibility" on:click={clearVisibilityRules}>清空名单</button>
            {/if}
          </div>
        </details>
      </div>
    </details>
  </div>

  <details class="quick-create">
    <summary><span><Plus size={15} /><strong>新建任务</strong><small>统一先进入工作池</small></span><ChevronDown size={15} /></summary>
    <form on:submit|preventDefault={createTask}>
      <div class="task-typeahead">
        <input
          class="task-input"
          bind:value={draftText}
          placeholder="准备推进什么？输入时会搜索已有任务和笔记"
          required
          on:focus={() => draftFocused = true}
          on:blur={() => setTimeout(() => draftFocused = false, 120)}
        />
        {#if selectedExisting}
          <div class="selected-suggestion"><span>将安排已有条目：{selectedExisting.title}</span><button type="button" on:click={() => selectedExisting = undefined}>改为新任务</button></div>
        {:else if draftFocused && draftSuggestions.length > 0}
          <div class="typeahead-menu" role="listbox" aria-label="匹配的工作池任务和笔记">
            <small>工作池中可能已有；选择任务可直接安排，选择笔记可作为打开目标</small>
            {#each draftSuggestions as suggestion (suggestion.id)}
              <button type="button" role="option" aria-selected="false" on:mousedown|preventDefault on:click={() => chooseDraftSuggestion(suggestion)}>
                <strong>{suggestion.title}</strong>
                <span>{suggestion.kind === "task" ? "已有任务" : "设为目标笔记"}{suggestion.classification.projectLabel ? ` · ${suggestion.classification.projectLabel}` : ""}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <input bind:value={draftCategory} placeholder="工作类型（可选）" />
      <input bind:value={draftProject} placeholder="具体项目（可选）" />
      <input bind:value={draftTarget} placeholder="[[打开目标]]（可选）" />
      <select bind:value={draftSchedule} aria-label="新任务安排日期">
        <option value="pool">仅放入工作池</option>
        <option value="today">创建后加入今日</option>
        <option value="tomorrow">创建后加入明日</option>
      </select>
      <button class="primary" type="submit" disabled={!draftText.trim() || Boolean(busy)}>创建</button>
    </form>
  </details>

  <div class="search-row">
    <input type="search" bind:value={search} placeholder="搜索标题、项目、路径或标签…" aria-label="搜索工作池" />
    <details class="filters">
      <summary><Filter size={14} />筛选</summary>
      <div>
        <label><span>来源</span><select bind:value={source}>{#each sources as option}<option value={option.id}>{option.label}</option>{/each}</select></label>
        <label><span>范围</span><select bind:value={history}><option value="active">活跃</option><option value="history">历史</option><option value="all">全部</option></select></label>
        <label><span>工作类型</span><select bind:value={workType}><option value="">全部类型</option>{#each workTypes as option}<option value={option.id}>{option.label}</option>{/each}</select></label>
        <label><span>项目</span><select bind:value={project}><option value="">全部项目</option>{#each projects as option}<option value={option.id}>{option.label}</option>{/each}</select></label>
        <label><span>阶段</span><select bind:value={stageId}><option value="">全部阶段</option>{#each workflowStages as option}<option value={option.id}>{option.label}</option>{/each}</select></label>
        <label><span>文章类型</span><select bind:value={typeId}><option value="">全部类型</option>{#each articleTypes as option}<option value={option.id}>{option.label}</option>{/each}</select></label>
        <label><span>任务类别</span><select bind:value={category}><option value="">全部类别</option>{#each categories as option}<option value={option}>{option}</option>{/each}</select></label>
        <label><span>原生状态</span><select bind:value={status}><option value="">全部状态</option>{#each statuses as option}<option value={option}>{option}</option>{/each}</select></label>
      </div>
    </details>
  </div>

  {#if loading && !snapshot}
    <div class="empty"><RefreshCw class="spin" size={20} />正在组合本地索引…</div>
  {:else if !dailyApi.getWorkPool}
    <div class="empty">当前插件版本尚未接入工作池。</div>
  {:else if groups.length === 0}
    <div class="empty"><Archive size={22} /><strong>这个视图下没有内容</strong><span>可切换视图或打开筛选器。</span></div>
  {:else}
    {#key activeViewId}
      <div class:pool-board={activeView?.layout === "board"} class="groups">
        {#each groups as group (group.id)}
          <details
            class:board-column={activeView?.layout === "board"}
            class:project-column={group.dimension === "project"}
            class="group"
            style={`--group-color:${groupColor(group.dimension, group.key)}`}
            open={activeView?.defaultExpanded ?? settings.defaultGroupsExpanded}
          >
            <summary on:contextmenu={(event) => group.dimension === "project" && beginProjectAppearance(group.key, event, group.title)}>
              {#if group.dimension === "project"}
                <button
                  class="project-icon"
                  type="button"
                  title="点击或右键设置项目颜色和图标"
                  aria-label={`设置 ${group.title} 的颜色和图标`}
                  on:click={(event) => beginProjectAppearance(group.key, event, group.title)}
                  on:contextmenu={(event) => beginProjectAppearance(group.key, event, group.title)}
                ><svelte:component this={projectIcon(group.key)} size={15} /></button>
              {:else}
                <FolderKanban size={15} />
              {/if}
              <strong>{group.title}</strong>
              <span>{group.counts.total}</span>
              {#if group.dimension === "project"}<span class="project-palette-hint"><Palette size={13} /></span>{/if}
              <ChevronDown size={15} />
            </summary>
            {#if group.children.length}
              <div class="subgroups">
                {#each group.children as child (child.id)}
                  <details class="subgroup" open={activeView?.defaultExpanded ?? settings.defaultGroupsExpanded}>
                    <summary><strong>{child.title}</strong><span>{child.counts.total}</span><ChevronDown size={14} /></summary>
                    {#each child.items as item (item.id)}
                      <article class="work-row">
                        <button class="item-main" type="button" on:click={() => act(item, "open")}>
                          <strong>{item.title}</strong><small>{itemMeta(item)}</small>
                        </button>
                        <div class="actions">
                          {#if item.active && !item.dailyDate}<button class="primary" type="button" on:click={() => act(item, "add-today", { date })}>+ 今日</button>{/if}
                          <details><summary aria-label="更多操作"><MoreHorizontal size={15} /></summary><div>{#if item.active && !item.dailyDate}<button type="button" on:click={() => act(item, "add-tomorrow", { date: offsetDate(date, 1) })}>加入明日</button>{/if}<button type="button" on:click={() => act(item, "open")}>打开</button>{#if item.kind === "task" && item.active}<button type="button" on:click={() => act(item, "complete-task")}><Check size={13} />完成</button>{#if !item.dailyDate}<button type="button" on:click={() => act(item, "drop-task")}>放弃</button>{/if}{/if}{#if item.kind === "task" && item.taskState === "done"}<button type="button" on:click={() => act(item, "reopen-task")}><RotateCcw size={13} />重新打开</button>{/if}{#if item.kind === "task" && item.taskState === "planned" && !item.dailyDate}<button type="button" on:click={() => act(item, "return-task")}><RotateCcw size={13} />退回池中</button>{/if}{#if item.kind === "question"}<button type="button" on:click={() => act(item, item.lane === "think" ? "move-to-write" : "move-to-think")}>转为 {item.lane === "think" ? "ToWrite" : "ToThink"}</button>{/if}<button type="button" on:click={() => hideItem(item)}>隐藏此条</button>{#if item.notePath}<button type="button" on:click={() => excludeSource(item)}>不整理此来源</button>{/if}</div></details>
                          {#if item.kind === "note" && workflowStages.length}<select aria-label="修改 Workflow 阶段" value={item.stageId ?? ""} on:change={(event) => selectStage(item, event)}><option value="" disabled>阶段</option>{#each workflowStages as option}<option value={option.id}>{option.label}</option>{/each}</select>{/if}
                          {#if item.kind === "question" && questionStatuses.length}<select aria-label="修改问题状态" value={item.questionStatus ?? ""} on:change={(event) => selectQuestionStatus(item, event)}>{#each questionStatuses as option}<option value={option.id}>{option.label}</option>{/each}</select>{/if}
                        </div>
                      </article>
                    {/each}
                  </details>
                {/each}
              </div>
            {:else}
              {#each group.items as item (item.id)}
                <article class="work-row">
                  <button class="item-main" type="button" on:click={() => act(item, "open")}><strong>{item.title}</strong><small>{itemMeta(item)}</small></button>
                  <div class="actions">
                    {#if item.active && !item.dailyDate}<button class="primary" type="button" on:click={() => act(item, "add-today", { date })}>+ 今日</button>{/if}
                    <details><summary aria-label="更多操作"><MoreHorizontal size={15} /></summary><div>{#if item.active && !item.dailyDate}<button type="button" on:click={() => act(item, "add-tomorrow", { date: offsetDate(date, 1) })}>加入明日</button>{/if}<button type="button" on:click={() => act(item, "open")}>打开</button>{#if item.kind === "task" && item.active}<button type="button" on:click={() => act(item, "complete-task")}>完成</button>{#if !item.dailyDate}<button type="button" on:click={() => act(item, "drop-task")}>放弃</button>{/if}{/if}{#if item.kind === "task" && item.taskState === "done"}<button type="button" on:click={() => act(item, "reopen-task")}><RotateCcw size={13} />重新打开</button>{/if}{#if item.kind === "question"}<button type="button" on:click={() => act(item, item.lane === "think" ? "move-to-write" : "move-to-think")}>转为 {item.lane === "think" ? "ToWrite" : "ToThink"}</button>{/if}<button type="button" on:click={() => hideItem(item)}>隐藏此条</button>{#if item.notePath}<button type="button" on:click={() => excludeSource(item)}>不整理此来源</button>{/if}</div></details>
                    {#if item.kind === "note" && workflowStages.length}<select aria-label="修改 Workflow 阶段" value={item.stageId ?? ""} on:change={(event) => selectStage(item, event)}><option value="" disabled>阶段</option>{#each workflowStages as option}<option value={option.id}>{option.label}</option>{/each}</select>{/if}
                    {#if item.kind === "question" && questionStatuses.length}<select aria-label="修改问题状态" value={item.questionStatus ?? ""} on:change={(event) => selectQuestionStatus(item, event)}>{#each questionStatuses as option}<option value={option.id}>{option.label}</option>{/each}</select>{/if}
                  </div>
                </article>
              {/each}
            {/if}
          </details>
        {/each}
      </div>
    {/key}
    {#if visibleLimit < filteredItems.length}
      <button class="load-more" type="button" on:click={() => (visibleLimit += settings.pageSize)}>再显示 {Math.min(settings.pageSize, filteredItems.length - visibleLimit)} 项</button>
    {/if}
  {/if}

  {#if editingProjectId}
    <div class="project-style-backdrop">
      <button class="project-style-dismiss" type="button" aria-label="关闭项目外观设置" on:click={() => (editingProjectId = "")}></button>
      <section class="project-style-dialog" role="dialog" aria-modal="true" aria-label={`设置 ${editingProjectLabel} 的外观`}>
        <header>
          <div><Palette size={17} /><span><small>项目外观</small><strong>{editingProjectLabel}</strong></span></div>
          <button type="button" title="关闭" aria-label="关闭项目外观设置" on:click={() => (editingProjectId = "")}><X size={16} /></button>
        </header>
        <form on:submit|preventDefault={() => saveProjectAppearance(editingProjectId)}>
          <label class="color-field"><span>颜色</span><input type="color" bind:value={editingProjectColor} /></label>
          <div class="color-presets" aria-label="常用颜色">
            {#each ["#7c6ee6", "#3f8fcf", "#35a078", "#d68b35", "#cf5c74", "#6f8f3d", "#a660c2", "#4b96a6"] as color}
              <button type="button" class:active={editingProjectColor === color} style={`--swatch:${color}`} aria-label={`选择颜色 ${color}`} on:click={() => (editingProjectColor = color)}></button>
            {/each}
          </div>
          <span class="field-label">图标</span>
          <div class="icon-presets">
            {#each Object.entries(projectIcons) as [icon, component]}
              <button type="button" class:active={editingProjectIcon === icon} title={icon} aria-label={`选择图标 ${icon}`} on:click={() => (editingProjectIcon = icon)}><svelte:component this={component} size={17} /></button>
            {/each}
          </div>
          <footer><button type="button" on:click={() => (editingProjectId = "")}>取消</button><button class="primary" type="submit"><Save size={14} />保存外观</button></footer>
        </form>
      </section>
    </div>
  {/if}
</section>

<style>
  .work-pool { display:grid; gap:12px; min-width:0; }
  .pool-toolbar,.view-bar,.search-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .pool-toolbar>div:first-child { display:grid; gap:2px; }
  .pool-toolbar span { color:var(--text-accent); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; }
  .pool-toolbar strong { font-size:18px; }
  .pool-toolbar small { color:var(--text-muted); }
  .toolbar-actions,.manager-actions { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
  .actions { display:flex; align-items:center; flex-wrap:nowrap; gap:4px; }
  button,select,input,textarea { font:inherit; }
  button { display:inline-flex; align-items:center; justify-content:center; gap:5px; }
  .primary,.view-bar nav button.active { color:var(--text-on-accent); background:var(--interactive-accent); }
  .view-bar { padding:4px; border-radius:12px; background:var(--background-secondary); }
  .view-bar nav { display:flex; min-width:0; gap:4px; overflow-x:auto; scrollbar-width:none; }
  .view-bar nav button { border:0; box-shadow:none; background:transparent; white-space:nowrap; }
  .view-manager { position:relative; flex:none; }
  .view-manager>summary,.filters>summary { display:flex; align-items:center; gap:5px; cursor:pointer; list-style:none; white-space:nowrap; }
  .view-manager>summary::-webkit-details-marker,.filters>summary::-webkit-details-marker,.actions details>summary::-webkit-details-marker { display:none; }
  .manager-panel { position:absolute; z-index:20; top:calc(100% + 8px); right:0; width:min(680px,calc(100vw - 48px)); padding:14px; border:1px solid var(--background-modifier-border); border-radius:14px; background:var(--background-primary); box-shadow:var(--shadow-l); }
  .manager-row { display:grid; grid-template-columns:1.2fr .8fr 1fr 1fr; gap:8px; }
  label { display:grid; gap:4px; min-width:0; }
  label>span { color:var(--text-muted); font-size:11px; }
  label input,label select,label textarea { width:100%; min-width:0; box-sizing:border-box; }
  .manager-actions { margin-top:10px; }
  .manager-actions .check { display:flex; flex-direction:row; align-items:center; margin-right:auto; }
  .project-recognition { margin-top:10px; border-top:1px solid var(--background-modifier-border); padding-top:10px; }
  .project-recognition>summary { cursor:pointer; }
  .project-recognition>div { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; }
  .project-recognition .wide { grid-column:1/-1; }
  .project-recognition .debug-toggle { display:flex; flex-direction:row; align-items:center; gap:7px; }
  .project-recognition .debug-toggle input { width:auto; }
  .visibility-manager { margin-top:10px; border-top:1px solid var(--background-modifier-border); padding-top:10px; }
  .visibility-manager>summary { display:flex; align-items:center; gap:7px; cursor:pointer; }
  .visibility-manager>summary span { min-width:20px; padding:1px 6px; border-radius:999px; background:var(--background-modifier-hover); text-align:center; font-size:var(--font-ui-smaller); }
  .visibility-manager>div { display:grid; gap:10px; margin-top:10px; }
  .visibility-manager p { margin:0; color:var(--text-muted); font-size:var(--font-ui-smaller); }
  .visibility-manager section { display:grid; gap:5px; }
  .visibility-rule { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:8px; }
  .visibility-rule code { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .visibility-rule button,.clear-visibility { justify-self:start; }
  .quick-create,.group,.subgroup { overflow:hidden; border:1px solid var(--background-modifier-border); border-radius:12px; background:var(--background-primary); }
  .quick-create>summary,.group>summary,.subgroup>summary { display:flex; align-items:center; gap:8px; padding:10px 12px; cursor:pointer; list-style:none; }
  .quick-create>summary::-webkit-details-marker,.group>summary::-webkit-details-marker,.subgroup>summary::-webkit-details-marker { display:none; }
  .quick-create>summary>span { display:flex; align-items:center; flex:1; gap:7px; }
  .quick-create>summary small { color:var(--text-muted); font-weight:400; }
  .quick-create form { display:grid; grid-template-columns:minmax(180px,2fr) repeat(3,minmax(110px,1fr)) minmax(130px,auto) auto; gap:7px; padding:0 12px 12px; }
  .task-typeahead { position:relative; min-width:0; }
  .task-typeahead>.task-input { width:100%; box-sizing:border-box; }
  .typeahead-menu { position:absolute; z-index:30; top:calc(100% + 5px); left:0; right:0; display:grid; gap:2px; min-width:min(420px,calc(100vw - 48px)); padding:6px; border:1px solid var(--background-modifier-border); border-radius:10px; background:var(--background-primary); box-shadow:var(--shadow-l); }
  .typeahead-menu>small { padding:5px 7px; color:var(--text-muted); }
  .typeahead-menu>button { display:grid; justify-items:start; gap:2px; padding:7px 8px; border:0; box-shadow:none; background:transparent; text-align:left; }
  .typeahead-menu>button:hover { background:var(--background-modifier-hover); }
  .typeahead-menu>button span { color:var(--text-muted); font-size:11px; }
  .selected-suggestion { display:flex; align-items:center; justify-content:space-between; gap:7px; margin-top:5px; padding:5px 7px; border-radius:7px; color:var(--text-muted); background:var(--background-secondary); font-size:11px; }
  .selected-suggestion button { border:0; box-shadow:none; color:var(--text-accent); background:transparent; }
  .search-row>input { flex:1; min-width:0; }
  .filters { position:relative; }
  .filters>div { position:absolute; z-index:15; top:calc(100% + 7px); right:0; display:grid; grid-template-columns:repeat(2,minmax(150px,1fr)); gap:8px; width:min(430px,calc(100vw - 48px)); padding:12px; border:1px solid var(--background-modifier-border); border-radius:12px; background:var(--background-primary); box-shadow:var(--shadow-s); }
  .groups,.subgroups { display:grid; gap:8px; }
  .groups.pool-board { display:flex; align-items:flex-start; gap:10px; overflow-x:auto; overflow-y:hidden; padding:2px 2px 12px; scroll-snap-type:x proximity; scrollbar-gutter:stable; }
  .pool-board>.board-column { flex:0 0 clamp(250px,29vw,310px); min-width:250px; max-height:min(720px,calc(100vh - 250px)); overflow:auto; scroll-snap-align:start; border-top:3px solid var(--group-color); }
  .group>summary { background:var(--background-secondary); }
  .board-column>summary { position:sticky; top:0; z-index:2; background:color-mix(in srgb,var(--group-color) 10%,var(--background-secondary)); }
  .project-icon { display:grid; place-items:center; width:27px; height:27px; padding:0; border:0; border-radius:7px; color:var(--group-color); background:color-mix(in srgb,var(--group-color) 14%,transparent); box-shadow:none; }
  .project-icon:hover { background:color-mix(in srgb,var(--group-color) 26%,transparent); transform:translateY(-1px); }
  .project-palette-hint { display:grid; place-items:center; color:var(--group-color); opacity:.55; }
  .project-column>summary:hover .project-palette-hint { opacity:1; }
  .group>summary strong,.subgroup>summary strong { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .group>summary span,.subgroup>summary span { min-width:24px; text-align:center; color:var(--text-muted); font-size:11px; }
  .group>summary :global(svg:last-child),.subgroup>summary :global(svg:last-child) { transition:transform .15s ease; }
  .group[open]>summary :global(svg:last-child),.subgroup[open]>summary :global(svg:last-child) { transform:rotate(180deg); }
  .subgroups { padding:8px; }
  .subgroup { border-radius:9px; }
  .subgroup>summary { padding:8px 10px; background:color-mix(in srgb,var(--background-secondary) 62%,transparent); }
  .work-row { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:7px; min-height:42px; padding:6px 8px; border-top:1px solid var(--background-modifier-border); }
  .item-main { display:grid; justify-items:start; min-width:0; padding:0; border:0; box-shadow:none; background:transparent; text-align:left; }
  .item-main strong,.item-main small { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .item-main small { color:var(--text-muted); font-size:11px; }
  .actions details { position:relative; }
  .actions details>summary { display:grid; place-items:center; width:28px; height:28px; cursor:pointer; list-style:none; border-radius:6px; }
  .actions details>div { position:absolute; z-index:12; top:calc(100% + 4px); right:0; display:grid; min-width:130px; padding:5px; border:1px solid var(--background-modifier-border); border-radius:9px; background:var(--background-primary); box-shadow:var(--shadow-s); }
  .actions details>div button { justify-content:flex-start; border:0; box-shadow:none; background:transparent; }
  .actions select,.actions button { max-width:88px; height:27px; padding-inline:7px; font-size:11px; }
  .pool-board .subgroups { padding:5px; }
  .pool-board .subgroup>summary { padding:7px 8px; }
  .pool-board .work-row { padding:6px; }
  .pool-board .item-main strong { font-size:12px; }
  .project-style-backdrop { position:fixed; z-index:1000; inset:0; display:grid; place-items:center; padding:20px; background:color-mix(in srgb,#000 28%,transparent); }
  .project-style-dismiss { position:absolute; inset:0; width:100%; height:100%; padding:0; border:0; border-radius:0; background:transparent; box-shadow:none; }
  .project-style-dialog { position:relative; z-index:1; width:min(390px,calc(100vw - 32px)); overflow:hidden; border:1px solid var(--background-modifier-border); border-radius:15px; background:var(--background-primary); box-shadow:var(--shadow-l); }
  .project-style-dialog>header { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:13px 14px; border-bottom:1px solid var(--background-modifier-border); }
  .project-style-dialog>header>div,.project-style-dialog>header span { display:flex; align-items:center; gap:8px; }
  .project-style-dialog>header span { display:grid; gap:1px; }
  .project-style-dialog>header small { color:var(--text-muted); font-size:10px; text-transform:uppercase; letter-spacing:.08em; }
  .project-style-dialog>header button { padding:5px; border:0; box-shadow:none; background:transparent; }
  .project-style-dialog form { display:grid; gap:11px; padding:14px; }
  .color-field { grid-template-columns:auto 1fr; align-items:center; }
  .color-field input { height:34px; padding:2px; }
  .color-presets,.icon-presets { display:flex; flex-wrap:wrap; gap:7px; }
  .color-presets button { width:28px; height:28px; padding:0; border:2px solid transparent; border-radius:8px; background:var(--swatch); }
  .color-presets button.active { border-color:var(--text-normal); box-shadow:0 0 0 2px var(--background-primary) inset; }
  .field-label { color:var(--text-muted); font-size:11px; }
  .icon-presets button { width:36px; height:34px; padding:0; color:var(--text-muted); background:var(--background-secondary); }
  .icon-presets button.active { color:var(--text-on-accent); background:var(--interactive-accent); }
  .project-style-dialog footer { display:flex; justify-content:flex-end; gap:7px; padding-top:3px; }
  .load-more { justify-self:center; }
  .empty { min-height:170px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:7px; border:1px dashed var(--background-modifier-border); border-radius:14px; color:var(--text-muted); }
  .error { padding:9px 11px; border-radius:9px; color:var(--text-error); background:color-mix(in srgb,var(--background-modifier-error) 14%,transparent); }
  .notice { padding:8px 10px; border-radius:9px; color:var(--text-muted); background:var(--background-secondary); font-size:12px; }
  :global(.work-pool .spin) { animation:spin 1s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @media (max-width:760px) {
    .pool-toolbar { align-items:flex-start; }
    .pool-toolbar small { display:none; }
    .quick-create form,.manager-row,.project-recognition>div { grid-template-columns:1fr; }
    .project-recognition .wide { grid-column:auto; }
    .manager-panel { position:fixed; inset:52px 12px auto; width:auto; max-height:calc(100vh - 72px); overflow:auto; }
  }
  @media (max-width:420px) {
    .work-row:not(.pool-board .work-row) { grid-template-columns:minmax(0,1fr); }
    .actions { justify-content:flex-start; }
  }
</style>
