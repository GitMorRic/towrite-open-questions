<script lang="ts">
  import {
    CalendarClock,
    Check,
    ChevronDown,
    Circle,
    FilePlus2,
    Mic,
    MonitorUp,
    PenLine,
    Plus,
    RefreshCw,
    RotateCcw,
    Send,
    Sparkles
  } from "lucide-svelte";
  import { onDestroy, onMount } from "svelte";
  import type {
    DailyDashboardAdapter,
    DailyDashboardSnapshot,
    DailyDevicePolicy,
    DailyPlanItemKind,
    DailyPlanItem,
    DailySummaryPresentation
  } from "./daily-dashboard-types";
  import {
    dailySnapshotFingerprint,
    isDailySummaryCurrent
  } from "./daily-dashboard-state";

  export let dailyApi: DailyDashboardAdapter | undefined = undefined;
  export let onOpenCapture: (() => void) | undefined = undefined;

  let snapshot: DailyDashboardSnapshot | undefined;
  let loading = true;
  let error = "";
  let busy = "";
  let draftText = "";
  let draftKind: DailyPlanItemKind = "task";
  let draftPolicy: DailyDevicePolicy = "none";
  let draftSchedule = "";
  let plannerExpanded = true;
  let previewItemId = "";
  let generatedSummary: DailySummaryPresentation | undefined;
  let generatedSummaryFingerprint = "";
  let summary: DailySummaryPresentation | undefined;
  let unsubscribe: (() => void) | undefined;
  let refreshSequence = 0;

  onMount(() => {
    unsubscribe = dailyApi?.subscribe?.(() => {
      void refresh();
    });
    void refresh();
  });
  onDestroy(() => unsubscribe?.());

  $: items = snapshot?.plan.items ?? [];
  $: todoItems = items.filter((item) => item.status === "todo");
  $: inProgressItems = items.filter((item) => item.status === "in-progress");
  $: doneItems = items.filter((item) => item.status === "done");
  $: previewItem = items.find((item) => item.id === previewItemId)
    ?? inProgressItems[0]
    ?? todoItems[0]
    ?? doneItems[0];
  $: summary = generatedSummary ?? (snapshot?.summary ? { ...snapshot.summary, source: "rules" } : undefined);

  async function refresh(): Promise<void> {
    const sequence = ++refreshSequence;
    if (!dailyApi) {
      loading = false;
      snapshot = undefined;
      clearGeneratedSummary();
      return;
    }
    loading = true;
    error = "";
    try {
      const nextSnapshot = await dailyApi.getSnapshot();
      if (sequence !== refreshSequence) return;
      if (
        generatedSummary
        && (
          !nextSnapshot
          || !isDailySummaryCurrent(
            generatedSummary,
            generatedSummaryFingerprint,
            nextSnapshot
          )
        )
      ) {
        clearGeneratedSummary();
      }
      snapshot = nextSnapshot;
      if (previewItemId && !snapshot?.plan.items.some((item) => item.id === previewItemId)) {
        previewItemId = "";
      }
    } catch (cause) {
      if (sequence !== refreshSequence) return;
      error = messageForError(cause);
    } finally {
      if (sequence === refreshSequence) loading = false;
    }
  }

  async function run(id: string, action: () => void | Promise<void>): Promise<void> {
    if (busy) return;
    busy = id;
    error = "";
    try {
      await action();
      await refresh();
    } catch (cause) {
      error = messageForError(cause);
    } finally {
      busy = "";
    }
  }

  async function createItem(): Promise<void> {
    const text = draftText.trim();
    if (!text || !dailyApi?.createItem) return;
    await run("create", async () => {
      await dailyApi?.createItem?.({
        text,
        kind: draftKind,
        devicePolicy: draftPolicy,
        scheduledFor: draftPolicy === "scheduled" && draftSchedule ? new Date(draftSchedule).toISOString() : undefined
      });
      draftText = "";
      if (draftPolicy !== "scheduled") draftSchedule = "";
    });
  }

  async function updatePolicy(item: DailyPlanItem, policy: DailyDevicePolicy): Promise<void> {
    if (!dailyApi?.updateItem) return;
    await run(`policy:${item.id}`, () => dailyApi?.updateItem?.(item.id, item.revision, {
      devicePolicy: policy,
      scheduledFor: policy === "scheduled" ? item.scheduledFor : null
    }));
  }

  function updatePolicyFromEvent(item: DailyPlanItem, event: Event): void {
    const policy = (event.currentTarget as HTMLSelectElement).value as DailyDevicePolicy;
    void updatePolicy(item, policy);
  }

  async function generateSummary(mode: "rules" | "ai"): Promise<void> {
    if (!dailyApi?.generateSummary) return;
    await run(`summary:${mode}`, async () => {
      const before = await dailyApi?.getSnapshot();
      if (!before) throw new Error("今日快照暂不可用，请刷新后重试。");
      const basisFingerprint = dailySnapshotFingerprint(before);
      const generated = await dailyApi?.generateSummary?.(mode);
      if (!generated) throw new Error("未能生成今日总结。");
      const after = await dailyApi?.getSnapshot();
      if (
        !after
        || basisFingerprint !== dailySnapshotFingerprint(after)
        || !isDailySummaryCurrent(generated, basisFingerprint, after)
      ) {
        clearGeneratedSummary();
        snapshot = after;
        throw new Error("今日数据在生成总结时发生了变化，请重新生成。");
      }
      snapshot = after;
      generatedSummary = generated;
      generatedSummaryFingerprint = basisFingerprint;
    });
  }

  async function writeCurrentSummary(): Promise<void> {
    if (!dailyApi?.writeSummary) return;
    const latest = await dailyApi.getSnapshot();
    if (!latest) throw new Error("今日快照暂不可用，请刷新后重试。");
    snapshot = latest;
    const candidate = generatedSummary ?? {
      ...latest.summary,
      source: "rules" as const
    };
    const basisFingerprint = generatedSummary
      ? generatedSummaryFingerprint
      : dailySnapshotFingerprint(latest);
    if (!isDailySummaryCurrent(candidate, basisFingerprint, latest)) {
      clearGeneratedSummary();
      throw new Error("今日数据已变化，旧总结没有写回；请确认新摘要后重试。");
    }
    await dailyApi.writeSummary(candidate);
  }

  function clearGeneratedSummary(): void {
    generatedSummary = undefined;
    generatedSummaryFingerprint = "";
  }

  function kindLabel(kind: DailyPlanItemKind): string {
    return {
      task: "任务",
      create_note: "新建笔记",
      edit_note: "修改笔记",
      send_card: "发送内容"
    }[kind];
  }

  function policyLabel(policy: DailyDevicePolicy | undefined): string {
    return {
      none: "不发送",
      manual: "手动发送",
      scheduled: "一次定时",
      rotation: "加入轮播",
      agent: "Agent 选择"
    }[policy ?? "none"];
  }

  function formatSigned(value: number): string {
    return value > 0 ? `+${value}` : String(value);
  }

  function formatDateTime(value: string | undefined): string {
    const timestamp = Date.parse(value ?? "");
    if (!Number.isFinite(timestamp)) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(timestamp));
  }

  function messageForError(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
  }
</script>

{#if loading && !snapshot}
  <div class="daily-loading" aria-live="polite">
    <RefreshCw class="spin" size={17} />
    <span>正在读取今日计划…</span>
  </div>
{:else if !dailyApi}
  <section class="daily-unavailable">
    <div>
      <strong>今日计划服务尚未启用</strong>
      <p>接入 DailyPlanService 后，这里会显示计划、写作统计和墨水屏预览；现有全库 Dashboard 不受影响。</p>
    </div>
    {#if onOpenCapture}
      <button type="button" on:click={() => onOpenCapture?.()}>
        <PenLine size={15} />
        先记录一条
      </button>
    {/if}
  </section>
{:else}
  <section class="daily-dashboard" aria-label="今日计划 Dashboard">
    {#if error}
      <div class="daily-error" role="alert">{error}</div>
    {/if}

    <div class="today-strip">
      <div>
        <span>Today</span>
        <strong>{snapshot?.date ?? new Date().toISOString().slice(0, 10)}</strong>
      </div>
      <div class="progress">
        <span style={`--progress: ${snapshot?.plan.total ? Math.round((snapshot.plan.done / snapshot.plan.total) * 100) : 0}%`}></span>
      </div>
      <p>
        {snapshot?.plan.done ?? 0} 已完成
        <span>·</span>
        {(snapshot?.plan.todo ?? 0) + (snapshot?.plan.inProgress ?? 0)} 待推进
      </p>
    </div>

    <div class="daily-metrics">
      <article>
        <span>新增写作单位</span>
        <strong>{snapshot?.activity.positiveWritingUnits ?? 0}</strong>
        <small>中文按字、拉丁文本按词</small>
      </article>
      <article>
        <span>净增</span>
        <strong class:negative={(snapshot?.activity.netWritingUnits ?? 0) < 0}>{formatSigned(snapshot?.activity.netWritingUnits ?? 0)}</strong>
        <small>{snapshot?.activity.trackingComplete === false ? "从启用统计后开始" : "今日可重建聚合"}</small>
      </article>
      <article>
        <span>笔记活动</span>
        <strong>{snapshot?.activity.notesModified ?? 0}</strong>
        <small>{snapshot?.activity.notesCreated ?? 0} 篇新建</small>
      </article>
      <article>
        <span>完成事项</span>
        <strong>{Math.max(snapshot?.plan.done ?? 0, snapshot?.activity.tasksCompleted ?? 0)}</strong>
        <small>{snapshot?.activity.questionsResolved ?? 0} 个问题已解决</small>
      </article>
      <article>
        <span>记录</span>
        <strong>{snapshot?.activity.capturesCommitted ?? 0}</strong>
        <small>Capture 提交</small>
      </article>
      <article>
        <span>屏幕展示</span>
        <strong>{snapshot?.activity.cardsDisplayed ?? 0}</strong>
        <small>{snapshot?.activity.cardsSelected ?? 0} 次选择</small>
      </article>
    </div>

    <section class="planner-card">
      <button class="planner-heading" type="button" aria-expanded={plannerExpanded} on:click={() => (plannerExpanded = !plannerExpanded)}>
        <span>
          <CalendarClock size={17} />
          <span>
            <strong>早晨计划</strong>
            <small>提前写下今天要完成、创建、修改或发送的内容</small>
          </span>
        </span>
        <ChevronDown class={plannerExpanded ? "" : "rotated"} size={17} />
      </button>

      {#if plannerExpanded}
        <form class="planner-form" on:submit|preventDefault={createItem}>
          <input bind:value={draftText} type="text" placeholder="今天想推进什么？可使用 [[笔记链接]]" aria-label="计划内容" />
          <div class="planner-options">
            <label>
              <span>类型</span>
              <select bind:value={draftKind}>
                <option value="task">任务</option>
                <option value="create_note">新建笔记</option>
                <option value="edit_note">修改笔记</option>
                <option value="send_card">发送内容</option>
              </select>
            </label>
            <label>
              <span>墨水屏</span>
              <select bind:value={draftPolicy}>
                <option value="none">不发送</option>
                <option value="manual">手动发送</option>
                <option value="scheduled">一次性定时</option>
                <option value="rotation">加入轮播</option>
                <option value="agent">允许 Agent 选择</option>
              </select>
            </label>
            {#if draftPolicy === "scheduled"}
              <label>
                <span>显示时间</span>
                <input bind:value={draftSchedule} type="datetime-local" required />
              </label>
            {/if}
            <button class="primary" type="submit" disabled={!draftText.trim() || !dailyApi.createItem || busy === "create"}>
              <Plus size={15} />
              添加
            </button>
          </div>
        </form>
      {/if}
    </section>

    <div class="daily-main-grid">
      <section class="plan-list-card">
        <header>
          <div>
            <h3>今日清单</h3>
            <p>完成只更新任务本身，不会自动推进关联笔记的 Workflow。</p>
          </div>
          <button type="button" title="刷新今日计划" aria-label="刷新今日计划" on:click={refresh}>
            <RefreshCw size={15} />
          </button>
        </header>

        {#if items.length === 0}
          <div class="daily-empty">
            <Circle size={24} />
            <strong>今天还没有计划</strong>
            <p>从上面的早晨计划开始，或把问题、Inbox 笔记加入今天。</p>
          </div>
        {:else}
          {#if inProgressItems.length > 0}
            <div class="plan-group">
              <h4>进行中 <span>{inProgressItems.length}</span></h4>
              {#each inProgressItems as item (item.id)}
                <article class:selected={previewItem?.id === item.id} class="plan-item">
                  <button class="check-button" type="button" disabled={!dailyApi.completeItem || Boolean(busy)} title="标记完成" on:click={() => run(`complete:${item.id}`, () => dailyApi?.completeItem?.(item.id, item.revision))}>
                    <Circle size={17} />
                  </button>
                  <button class="item-main" type="button" on:click={() => (previewItemId = item.id)}>
                    <span class="item-topline">
                      <span class={`kind kind-${item.kind}`}>{kindLabel(item.kind)}</span>
                      {#if item.scheduledFor}<time datetime={item.scheduledFor}>{formatDateTime(item.scheduledFor)}</time>{/if}
                    </span>
                    <strong>{item.text}</strong>
                    <small>{policyLabel(item.devicePolicy)}{item.linkedNotes[0] ? ` · ${item.linkedNotes[0]}` : ""}</small>
                  </button>
                  <div class="item-actions">
                    {#if dailyApi.sendItemToDevice}
                      <button type="button" title="立即发送到墨水屏" on:click={() => run(`send:${item.id}`, () => dailyApi?.sendItemToDevice?.(item.id, item.revision))}><MonitorUp size={14} /></button>
                    {/if}
                  </div>
                </article>
              {/each}
            </div>
          {/if}

          {#if todoItems.length > 0}
            <div class="plan-group">
              <h4>待处理 <span>{todoItems.length}</span></h4>
              {#each todoItems as item (item.id)}
                <article class:selected={previewItem?.id === item.id} class="plan-item">
                  <button class="check-button" type="button" disabled={!dailyApi.completeItem || Boolean(busy)} title="标记完成" on:click={() => run(`complete:${item.id}`, () => dailyApi?.completeItem?.(item.id, item.revision))}>
                    <Circle size={17} />
                  </button>
                  <button class="item-main" type="button" on:click={() => (previewItemId = item.id)}>
                    <span class="item-topline">
                      <span class={`kind kind-${item.kind}`}>{kindLabel(item.kind)}</span>
                      {#if item.scheduledFor}<time datetime={item.scheduledFor}>{formatDateTime(item.scheduledFor)}</time>{/if}
                    </span>
                    <strong>{item.text}</strong>
                    <small>{policyLabel(item.devicePolicy)}{item.linkedNotes[0] ? ` · ${item.linkedNotes[0]}` : ""}</small>
                  </button>
                  <div class="item-actions">
                    {#if dailyApi.updateItem}
                      <select
                        aria-label={`更改 ${item.text} 的设备策略`}
                        value={item.devicePolicy ?? "none"}
                        disabled={Boolean(busy)}
                        on:change={(event) => updatePolicyFromEvent(item, event)}
                      >
                        <option value="none">不发送</option>
                        <option value="manual">手动</option>
                        <option value="scheduled">定时</option>
                        <option value="rotation">轮播</option>
                        <option value="agent">Agent</option>
                      </select>
                    {/if}
                    {#if dailyApi.sendItemToDevice}
                      <button type="button" title="立即发送到墨水屏" on:click={() => run(`send:${item.id}`, () => dailyApi?.sendItemToDevice?.(item.id, item.revision))}><MonitorUp size={14} /></button>
                    {/if}
                  </div>
                </article>
              {/each}
            </div>
          {/if}

          {#if doneItems.length > 0}
            <details class="done-group">
              <summary>已完成 <span>{doneItems.length}</span></summary>
              {#each doneItems as item (item.id)}
                <article class="plan-item completed">
                  <button class="check-button" type="button" disabled={!dailyApi.reopenItem || Boolean(busy)} title="重新打开" on:click={() => run(`reopen:${item.id}`, () => dailyApi?.reopenItem?.(item.id, item.revision))}>
                    <Check size={17} />
                  </button>
                  <button class="item-main" type="button" on:click={() => (previewItemId = item.id)}>
                    <strong>{item.text}</strong>
                    <small>{item.completionDate ? `完成于 ${formatDateTime(item.completionDate)}` : kindLabel(item.kind)}</small>
                  </button>
                  {#if dailyApi.reopenItem}
                    <button class="reopen" type="button" title="重新打开" on:click={() => run(`reopen:${item.id}`, () => dailyApi?.reopenItem?.(item.id, item.revision))}><RotateCcw size={14} /></button>
                  {/if}
                </article>
              {/each}
            </details>
          {/if}
        {/if}
      </section>

      <aside class="preview-column">
        <section class="eink-card">
          <header>
            <span>2.7″ E-ink preview</span>
            <small>{previewItem ? kindLabel(previewItem.kind) : "暂无内容"}</small>
          </header>
          <div class="eink-screen">
            {#if previewItem}
              <div class="eink-meta">
                <strong>今日计划</strong>
                <span>{snapshot?.date.slice(5).replace("-", ".")}</span>
              </div>
              <p>{previewItem.text}</p>
              <small>{previewItem.scheduledFor ? `计划 ${formatDateTime(previewItem.scheduledFor)}` : policyLabel(previewItem.devicePolicy)}</small>
              <footer>
                <span>记录</span>
                <span>完成</span>
                <span>稍后</span>
              </footer>
            {:else}
              <div class="eink-placeholder">
                <MonitorUp size={22} />
                <span>选择一项计划进行预览</span>
              </div>
            {/if}
          </div>
          {#if previewItem}
            <div class="preview-actions">
              {#if onOpenCapture}
                <button type="button" on:click={() => onOpenCapture?.()}><Mic size={14} />记录</button>
              {/if}
              {#if dailyApi.openItem}
                <button type="button" on:click={() => dailyApi?.openItem?.(previewItem)}><PenLine size={14} />打开</button>
              {/if}
              {#if dailyApi.sendItemToDevice}
                <button class="primary" type="button" disabled={Boolean(busy)} on:click={() => run(`send:${previewItem.id}`, () => dailyApi?.sendItemToDevice?.(previewItem.id, previewItem.revision))}><Send size={14} />发送</button>
              {/if}
            </div>
          {/if}
        </section>
      </aside>
    </div>

    <section class="summary-card">
      <header>
        <div>
          <h3>今日总结</h3>
          <p>先使用可核对的本地统计生成；AI 只改写表述，写回前仍需确认。</p>
        </div>
        <span class:ai={summary?.source === "ai"}>{summary?.source === "ai" ? "AI 草稿" : "规则生成"}</span>
      </header>
      {#if summary}
        <div class="summary-text">
          <strong>{summary.headline}</strong>
          {#each summary.lines as line}
            <span>{line}</span>
          {/each}
        </div>
      {:else}
        <div class="daily-empty compact">今天还没有足够的数据生成总结。</div>
      {/if}
      <footer>
        {#if dailyApi.generateSummary}
          <button type="button" disabled={Boolean(busy)} on:click={() => generateSummary("rules")}><RefreshCw size={14} />重新生成</button>
          <button type="button" disabled={Boolean(busy)} on:click={() => generateSummary("ai")}><Sparkles size={14} />AI 改写</button>
        {/if}
        {#if dailyApi.writeSummary && summary}
          <button class="primary" type="button" disabled={Boolean(busy)} on:click={() => run("write-summary", writeCurrentSummary)}>
            <FilePlus2 size={14} />
            写回今日日记
          </button>
        {/if}
        {#if dailyApi.sendSummaryToDevice && summary}
          <button type="button" disabled={Boolean(busy)} on:click={() => run("send-summary", () => dailyApi?.sendSummaryToDevice?.())}>
            <MonitorUp size={14} />
            发送总结
          </button>
        {/if}
      </footer>
    </section>
  </section>
{/if}

<style>
  .daily-dashboard {
    display: grid;
    gap: 14px;
  }

  .daily-loading,
  .daily-unavailable {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 220px;
    border: 1px dashed var(--background-modifier-border);
    border-radius: 12px;
    color: var(--text-muted);
  }

  .daily-unavailable {
    align-items: flex-start;
    justify-content: space-between;
    min-height: 0;
    padding: 22px;
  }

  .daily-unavailable strong {
    color: var(--text-normal);
  }

  .daily-unavailable p {
    max-width: 68ch;
    margin: 4px 0 0;
    font-size: 0.82rem;
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  button.primary {
    color: var(--text-on-accent);
    background: var(--interactive-accent);
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .daily-error {
    padding: 9px 12px;
    border: 1px solid var(--background-modifier-error);
    border-radius: 8px;
    color: var(--text-error);
    background: color-mix(in srgb, var(--background-modifier-error) 8%, transparent);
    font-size: 0.8rem;
  }

  .today-strip {
    display: grid;
    grid-template-columns: auto minmax(120px, 1fr) auto;
    align-items: center;
    gap: 16px;
    padding: 13px 16px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    background: var(--background-secondary);
  }

  .today-strip > div:first-child {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .today-strip > div:first-child span {
    color: var(--text-accent);
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .today-strip p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.78rem;
  }

  .progress {
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--background-modifier-border);
  }

  .progress span {
    display: block;
    width: var(--progress);
    height: 100%;
    border-radius: inherit;
    background: var(--interactive-accent);
    transition: width 180ms ease;
  }

  .daily-metrics {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
  }

  .daily-metrics article {
    display: grid;
    gap: 2px;
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 10px;
    background: var(--background-primary);
  }

  .daily-metrics span,
  .daily-metrics small {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 0.69rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .daily-metrics strong {
    margin: 3px 0;
    font-size: 1.4rem;
    line-height: 1;
  }

  .daily-metrics strong.negative {
    color: var(--text-error);
  }

  .planner-card,
  .plan-list-card,
  .eink-card,
  .summary-card {
    overflow: hidden;
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    background: var(--background-primary);
  }

  .planner-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 13px 15px;
    border: 0;
    background: transparent;
    box-shadow: none;
    text-align: left;
  }

  .planner-heading > span {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .planner-heading > span > span {
    display: grid;
  }

  .planner-heading small {
    color: var(--text-muted);
    font-weight: 400;
  }

  .planner-heading :global(.rotated) {
    transform: rotate(-90deg);
  }

  .planner-form {
    display: grid;
    gap: 10px;
    padding: 0 15px 15px;
  }

  .planner-form > input {
    width: 100%;
    margin: 0;
  }

  .planner-options {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }

  .planner-options label {
    display: grid;
    gap: 3px;
    min-width: 145px;
  }

  .planner-options label > span {
    color: var(--text-muted);
    font-size: 0.68rem;
  }

  .planner-options select,
  .planner-options input {
    width: 100%;
    margin: 0;
  }

  .daily-main-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.65fr) minmax(260px, 0.85fr);
    align-items: start;
    gap: 14px;
  }

  .plan-list-card > header,
  .summary-card > header,
  .eink-card > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 15px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  h3 {
    margin: 0;
    font-size: 0.96rem;
  }

  .plan-list-card header p,
  .summary-card header p {
    margin: 2px 0 0;
    color: var(--text-muted);
    font-size: 0.72rem;
  }

  .plan-list-card header button {
    width: 30px;
    height: 30px;
    padding: 0;
  }

  .plan-group {
    padding: 12px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .plan-group h4,
  .done-group summary {
    margin: 0 0 7px;
    color: var(--text-muted);
    font-size: 0.72rem;
    font-weight: 650;
    text-transform: uppercase;
  }

  .plan-group h4 span,
  .done-group summary span {
    margin-left: 4px;
    color: var(--text-faint);
  }

  .plan-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    margin-top: 5px;
    padding: 8px;
    border: 1px solid transparent;
    border-radius: 9px;
  }

  .plan-item:hover,
  .plan-item.selected {
    border-color: var(--background-modifier-border);
    background: var(--background-secondary);
  }

  .check-button,
  .item-main,
  .item-actions button,
  .reopen {
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .check-button {
    width: 28px;
    height: 28px;
    padding: 0;
    color: var(--text-muted);
  }

  .item-main {
    display: grid;
    justify-items: start;
    min-width: 0;
    padding: 1px 3px;
    text-align: left;
  }

  .item-main strong,
  .item-main small {
    overflow: hidden;
    max-width: 100%;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-main small {
    margin-top: 2px;
    color: var(--text-muted);
    font-size: 0.68rem;
  }

  .item-topline {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 3px;
  }

  .item-topline time {
    color: var(--text-muted);
    font-size: 0.66rem;
  }

  .kind {
    padding: 2px 5px;
    border-radius: 5px;
    color: var(--text-muted);
    background: var(--background-modifier-border);
    font-size: 0.62rem;
    font-weight: 600;
  }

  .kind-create_note { color: var(--color-green); }
  .kind-edit_note { color: var(--color-blue); }
  .kind-send_card { color: var(--color-orange); }

  .item-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .item-actions select {
    max-width: 88px;
    height: 28px;
    margin: 0;
    font-size: 0.68rem;
  }

  .item-actions button,
  .reopen {
    width: 28px;
    height: 28px;
    padding: 0;
  }

  .done-group {
    padding: 12px;
  }

  .done-group summary {
    cursor: pointer;
  }

  .completed .item-main strong {
    color: var(--text-muted);
    text-decoration: line-through;
  }

  .daily-empty {
    display: grid;
    justify-items: center;
    gap: 5px;
    padding: 40px 18px;
    color: var(--text-muted);
    text-align: center;
  }

  .daily-empty p {
    margin: 0;
    font-size: 0.75rem;
  }

  .daily-empty.compact {
    padding: 22px;
  }

  .preview-column {
    position: sticky;
    top: 12px;
  }

  .eink-card > header span {
    font-weight: 650;
  }

  .eink-card > header small {
    color: var(--text-muted);
  }

  .eink-screen {
    display: flex;
    flex-direction: column;
    aspect-ratio: 3 / 2;
    min-height: 190px;
    margin: 14px;
    padding: 15px;
    border: 2px solid #1e1e1e;
    border-radius: 4px;
    color: #161616;
    background: #f3f1e9;
    font-family: var(--font-text);
  }

  .eink-meta,
  .eink-screen footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.66rem;
  }

  .eink-screen > p {
    display: -webkit-box;
    overflow: hidden;
    margin: auto 0;
    font-size: clamp(1rem, 2vw, 1.35rem);
    font-weight: 700;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
  }

  .eink-screen > small {
    overflow: hidden;
    margin-bottom: 10px;
    color: #555;
    font-size: 0.65rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .eink-screen footer {
    padding-top: 8px;
    border-top: 1px solid #333;
    font-weight: 650;
  }

  .eink-placeholder {
    display: grid;
    place-items: center;
    gap: 8px;
    height: 100%;
    color: #555;
    font-size: 0.76rem;
  }

  .preview-actions,
  .summary-card > footer {
    display: flex;
    justify-content: flex-end;
    gap: 7px;
    padding: 0 14px 14px;
  }

  .summary-card > header > span {
    padding: 3px 7px;
    border-radius: 999px;
    color: var(--text-muted);
    background: var(--background-secondary);
    font-size: 0.68rem;
  }

  .summary-card > header > span.ai {
    color: var(--text-accent);
  }

  .summary-text {
    display: grid;
    gap: 4px;
    padding: 16px;
    color: var(--text-normal);
    white-space: pre-line;
    line-height: 1.65;
  }

  .summary-text span {
    color: var(--text-muted);
    font-size: 0.82rem;
  }

  @media (max-width: 980px) {
    .daily-metrics {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .daily-main-grid {
      grid-template-columns: 1fr;
    }

    .preview-column {
      position: static;
    }

    .eink-screen {
      max-width: 480px;
    }
  }

  @media (max-width: 560px) {
    .today-strip {
      grid-template-columns: 1fr auto;
    }

    .progress {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .daily-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .daily-unavailable {
      flex-direction: column;
    }

    .item-actions select {
      display: none;
    }
  }
</style>
