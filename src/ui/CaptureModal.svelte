<script lang="ts">
  import {
    Archive,
    Check,
    CheckCircle2,
    FileInput,
    FilePlus2,
    FolderPlus,
    Inbox,
    Link2,
    LoaderCircle,
    MessageSquareReply,
    RotateCcw,
    Undo2,
    X
  } from "lucide-svelte";
  import { onDestroy, onMount, tick } from "svelte";
  import type { CaptureDraft, CapturePreview, CaptureTargetCandidate } from "../capture/types";
  import type { ToWriteLanguage } from "../core/settings";
  import type {
    CaptureModalCallbacks,
    CaptureModalContext,
    CaptureModalSubmitResult
  } from "./capture-modal-types";
  import {
    chooseDefaultCaptureCandidate,
    extractCaptureLinks,
    parseCaptureTags,
    reconcileCaptureCandidateId,
    visibleCaptureCandidates
  } from "./capture-modal-types";

  export let draft: CaptureDraft;
  export let callbacks: CaptureModalCallbacks;
  export let context: CaptureModalContext | undefined = undefined;
  export let initialCandidates: CaptureTargetCandidate[] = [];
  export let language: ToWriteLanguage = "en";
  export let autoFocus = true;
  export let onRequestClose: () => void = () => undefined;
  export let onBusyChange: (busy: boolean) => void = () => undefined;

  let body = draft.body;
  let title = draft.title ?? "";
  let tags = draft.tags.join(", ");
  let archiveAnswer = false;
  let candidates = visibleCaptureCandidates(initialCandidates);
  let selectedCandidateId = chooseDefaultCaptureCandidate(candidates)?.id ?? "";
  let selectionWasManual = false;
  let preview: CapturePreview | undefined;
  let result: CaptureModalSubmitResult | undefined;
  let bodyInput: HTMLTextAreaElement | undefined;
  let recommendationError: string | undefined;
  let previewError: string | undefined;
  let submitError: string | undefined;
  let resultActionError: string | undefined;
  let recommending = false;
  let previewing = false;
  let saving = false;
  let opening = false;
  let undoing = false;
  let undone = false;
  let recommendationTimer: number | undefined;
  let recommendationSequence = 0;
  let previewSequence = 0;
  let recommendationAbort: AbortController | undefined;
  let previewAbort: AbortController | undefined;
  let reportedBusy = false;

  $: copy = captureCopy(language);
  $: isAnswer = draft.intent === "answer";
  $: targetRequired = !isAnswer || archiveAnswer;
  $: activeCandidate = candidateById(selectedCandidateId);
  $: detectedLinks = extractCaptureLinks(body);
  $: sourceFile = context?.sourceFile ?? draft.source?.file;
  $: headingPath = context?.headingPath ?? draft.source?.headingPath ?? [];
  $: contextSelection = context?.selection ?? (draft.intent === "selection" ? draft.source?.selection : undefined);
  $: questionTitle = context?.questionTitle;
  $: questionText = context?.questionText;
  $: hasContext = Boolean(sourceFile || headingPath.length || contextSelection || questionTitle || questionText);
  $: busy = saving || opening || undoing;
  $: canSubmit = Boolean(body.trim())
    && (!targetRequired || (Boolean(activeCandidate) && Boolean(preview) && !recommending && !previewing))
    && !busy;
  $: if (busy !== reportedBusy) {
    reportedBusy = busy;
    onBusyChange(busy);
  }
  $: canOpenResult = Boolean(
    result
    && callbacks.openResult
    && !undone
    && (result.canOpen ?? Boolean(result.capture?.openUri || result.capture?.finalPath))
  );
  $: canUndoResult = Boolean(
    result
    && callbacks.undoResult
    && !undone
    && (result.canUndo ?? Boolean(result.capture?.undoToken))
  );

  onMount(() => {
    void initialise();
  });

  onDestroy(() => {
    clearRecommendationTimer();
    recommendationAbort?.abort();
    previewAbort?.abort();
    onBusyChange(false);
  });

  async function initialise() {
    if (autoFocus) {
      await tick();
      bodyInput?.focus();
      bodyInput?.setSelectionRange(body.length, body.length);
    }

    if (targetRequired && candidates.length > 0) {
      void refreshPreview(candidateById(selectedCandidateId));
    }
    if (targetRequired) {
      void refreshRecommendations();
    }
  }

  function currentDraft(): CaptureDraft {
    const nextTitle = title.trim();
    return {
      ...draft,
      body: body.trim(),
      title: nextTitle || undefined,
      tags: parseCaptureTags(tags),
      links: extractCaptureLinks(body),
      source: draft.source ? { ...draft.source } : undefined
    };
  }

  function candidateById(id: string): CaptureTargetCandidate | undefined {
    return candidates.find((candidate) => candidate.id === id);
  }

  function handleDraftInput() {
    submitError = undefined;
    recommendationError = undefined;
    previewError = undefined;
    result = undefined;
    undone = false;
    if (targetRequired) {
      recommendationAbort?.abort();
      recommendationSequence += 1;
      recommending = false;
      previewAbort?.abort();
      previewSequence += 1;
      previewing = false;
      preview = undefined;
      scheduleRecommendations();
    }
  }

  function scheduleRecommendations() {
    clearRecommendationTimer();
    recommendationTimer = window.setTimeout(() => {
      recommendationTimer = undefined;
      void refreshRecommendations();
    }, 180);
  }

  function clearRecommendationTimer() {
    if (recommendationTimer !== undefined) {
      window.clearTimeout(recommendationTimer);
      recommendationTimer = undefined;
    }
  }

  async function refreshRecommendations() {
    if (!targetRequired) {
      return;
    }

    clearRecommendationTimer();
    recommendationAbort?.abort();
    const controller = new AbortController();
    recommendationAbort = controller;
    const sequence = ++recommendationSequence;
    recommending = true;
    recommendationError = undefined;

    try {
      let initialApplied = false;
      let queuedUpdate: CaptureTargetCandidate[] | undefined;
      const publishUpdate = (update: CaptureTargetCandidate[]) => {
        if (controller.signal.aborted || sequence !== recommendationSequence) {
          return;
        }
        if (!initialApplied) {
          queuedUpdate = update;
          return;
        }
        applyRecommendationUpdate(update);
      };
      const recommended = await callbacks.recommend(currentDraft(), controller.signal, publishUpdate);
      if (controller.signal.aborted || sequence !== recommendationSequence) {
        return;
      }
      applyRecommendationUpdate(recommended);
      initialApplied = true;
      if (queuedUpdate) {
        applyRecommendationUpdate(queuedUpdate);
      }
    } catch (error) {
      if (!controller.signal.aborted && sequence === recommendationSequence) {
        recommendationError = errorMessage(error);
      }
    } finally {
      if (sequence === recommendationSequence) {
        recommending = false;
      }
    }
  }

  function applyRecommendationUpdate(update: CaptureTargetCandidate[]) {
    const recommended = visibleCaptureCandidates(update);
    candidates = recommended;
    const currentSelectedId = selectedCandidateId;
    selectedCandidateId = reconcileCaptureCandidateId(recommended, currentSelectedId, selectionWasManual);
    if (selectedCandidateId !== currentSelectedId) {
      selectionWasManual = false;
    }
    void refreshPreview(candidateById(selectedCandidateId));
  }

  function selectCandidate(candidate: CaptureTargetCandidate) {
    selectedCandidateId = candidate.id;
    selectionWasManual = true;
    void refreshPreview(candidate);
  }

  async function refreshPreview(candidate: CaptureTargetCandidate | undefined) {
    previewAbort?.abort();
    preview = undefined;
    previewError = undefined;
    if (!targetRequired || !candidate) {
      previewing = false;
      return;
    }

    const controller = new AbortController();
    previewAbort = controller;
    const sequence = ++previewSequence;
    previewing = true;
    try {
      const nextPreview = await callbacks.preview(currentDraft(), candidate, controller.signal);
      if (
        !controller.signal.aborted
        && sequence === previewSequence
        && candidate.id === selectedCandidateId
      ) {
        preview = nextPreview;
      }
    } catch (error) {
      if (!controller.signal.aborted && sequence === previewSequence) {
        previewError = errorMessage(error);
      }
    } finally {
      if (sequence === previewSequence) {
        previewing = false;
      }
    }
  }

  function handleArchiveChange(event: Event) {
    archiveAnswer = (event.currentTarget as HTMLInputElement).checked;
    submitError = undefined;
    if (archiveAnswer) {
      if (candidates.length > 0) {
        selectedCandidateId ||= chooseDefaultCaptureCandidate(candidates)?.id ?? "";
        void refreshPreview(candidateById(selectedCandidateId));
      }
      void refreshRecommendations();
    } else {
      recommendationAbort?.abort();
      recommendationSequence += 1;
      recommending = false;
      previewAbort?.abort();
      previewSequence += 1;
      previewing = false;
      preview = undefined;
      previewError = undefined;
    }
  }

  async function submit() {
    const candidate = candidateById(selectedCandidateId);
    if (!canSubmit || (targetRequired && !candidate)) {
      return;
    }

    clearRecommendationTimer();
    recommendationAbort?.abort();
    previewAbort?.abort();
    saving = true;
    submitError = undefined;
    resultActionError = undefined;
    try {
      result = await callbacks.submit({
        draft: currentDraft(),
        candidate: targetRequired ? candidate : undefined,
        preview: targetRequired ? preview : undefined,
        targetRevision: targetRequired ? (preview?.targetRevision ?? candidate?.targetRevision) : undefined,
        archiveAnswer
      });
      undone = false;
    } catch (error) {
      submitError = errorMessage(error);
    } finally {
      saving = false;
    }
  }

  async function openResult() {
    if (!result || !callbacks.openResult || busy) {
      return;
    }
    opening = true;
    resultActionError = undefined;
    let closeAfterOpen = false;
    try {
      await callbacks.openResult(result);
      closeAfterOpen = true;
    } catch (error) {
      resultActionError = errorMessage(error);
    } finally {
      opening = false;
    }
    if (closeAfterOpen) {
      requestClose();
    }
  }

  async function undoResult() {
    if (!result || !callbacks.undoResult || busy) {
      return;
    }
    undoing = true;
    resultActionError = undefined;
    try {
      await callbacks.undoResult(result);
      undone = true;
    } catch (error) {
      resultActionError = errorMessage(error);
    } finally {
      undoing = false;
    }
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    if (event.isComposing) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      requestClose();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      if (!result) {
        void submit();
      }
    }
  }

  function requestClose() {
    if (!busy) {
      onRequestClose();
    }
  }

  function modeLabel(intent: CaptureDraft["intent"]): string {
    if (intent === "selection") {
      return copy.modeSelection;
    }
    if (intent === "answer") {
      return copy.modeAnswer;
    }
    return copy.modeNew;
  }

  function targetTitle(candidate: CaptureTargetCandidate): string {
    if (candidate.kind === "existingNote") {
      return candidate.heading || copy.targetExisting;
    }
    if (candidate.kind === "folder") {
      return candidate.stageId ? `${copy.targetFolder} · ${candidate.stageId}` : copy.targetFolder;
    }
    return copy.targetInbox;
  }

  function targetAction(candidate: CaptureTargetCandidate): string {
    return candidate.action === "append" ? copy.actionAppend : copy.actionCreate;
  }

  function confidenceLabel(candidate: CaptureTargetCandidate): string {
    return copy.confidence[candidate.confidence];
  }

  function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function captureCopy(currentLanguage: ToWriteLanguage) {
    if (currentLanguage === "zh") {
      return {
        title: "记录到 ToWrite",
        modeNew: "新记录",
        modeSelection: "从选区记录",
        modeAnswer: "回答问题",
        close: "关闭",
        context: "来源上下文",
        source: "来源",
        question: "问题",
        selection: "选区",
        body: "记录内容",
        bodyPlaceholder: "写下想法、待办、链接或需要继续发展的内容…",
        optionalFields: "标题与标签",
        titleField: "标题",
        titlePlaceholder: "可选；留空时会从内容生成文件名",
        tagsField: "标签",
        tagsPlaceholder: "capture, project-a",
        detectedLinks: "已识别链接",
        archiveAnswer: "同时归档为笔记",
        archiveAnswerHint: "默认只追加到问题卡片；开启后再选择笔记位置。",
        answerDestination: "将追加到问题卡片活动流",
        destinations: "保存位置",
        destinationsHint: "确认后才会写入，不会自动移动现有笔记。",
        refreshing: "正在更新候选…",
        noDestinations: "暂时没有可用候选，请检查记录位置设置。",
        retry: "重试",
        targetExisting: "最相关的已有笔记",
        targetFolder: "推荐文件夹",
        targetInbox: "Inbox 兜底",
        actionAppend: "追加",
        actionCreate: "新建",
        confidence: { strong: "强匹配", medium: "中匹配", weak: "弱匹配" },
        preview: "写入预览",
        previewing: "正在生成安全预览…",
        previewFallback: "将写入以下内容",
        cardAppend: "卡片活动流",
        cancel: "取消",
        save: "保存记录",
        answer: "追加回答",
        answerAndArchive: "回答并归档",
        saving: "正在保存…",
        shortcut: "⌘/Ctrl + Enter 保存",
        saved: "记录已保存",
        answered: "回答已追加",
        savedPath: "实际写入位置",
        done: "完成",
        open: "打开笔记",
        undo: "撤销",
        undoing: "正在撤销…",
        undone: "已安全撤销，没有覆盖后续修改。"
      };
    }

    return {
      title: "Capture to ToWrite",
      modeNew: "New capture",
      modeSelection: "Capture selection",
      modeAnswer: "Answer question",
      close: "Close",
      context: "Source context",
      source: "Source",
      question: "Question",
      selection: "Selection",
      body: "Capture",
      bodyPlaceholder: "Write an idea, task, link, or something you want to develop…",
      optionalFields: "Title and tags",
      titleField: "Title",
      titlePlaceholder: "Optional; leave blank to derive a file name",
      tagsField: "Tags",
      tagsPlaceholder: "capture, project-a",
      detectedLinks: "Detected links",
      archiveAnswer: "Also archive as a note",
      archiveAnswerHint: "Answers append to the question card by default. Turn this on to also choose a note destination.",
      answerDestination: "Will append to the question card activity",
      destinations: "Save location",
      destinationsHint: "Nothing is written until you confirm, and existing notes are never moved.",
      refreshing: "Refreshing candidates…",
      noDestinations: "No destination is available. Check the capture location settings.",
      retry: "Retry",
      targetExisting: "Most relevant existing note",
      targetFolder: "Recommended folder",
      targetInbox: "Inbox fallback",
      actionAppend: "Append",
      actionCreate: "Create",
      confidence: { strong: "Strong", medium: "Medium", weak: "Weak" },
      preview: "Write preview",
      previewing: "Generating a safe preview…",
      previewFallback: "The following content will be written",
      cardAppend: "Question card activity",
      cancel: "Cancel",
      save: "Save capture",
      answer: "Add answer",
      answerAndArchive: "Answer and archive",
      saving: "Saving…",
      shortcut: "⌘/Ctrl + Enter to save",
      saved: "Capture saved",
      answered: "Answer appended",
      savedPath: "Written to",
      done: "Done",
      open: "Open note",
      undo: "Undo",
      undoing: "Undoing…",
      undone: "Safely undone without overwriting later changes."
    };
  }
</script>

<svelte:window on:keydown={handleGlobalKeydown} />

<div class="towrite-capture-root" data-capture-intent={draft.intent} aria-busy={busy}>
  <header class="towrite-capture-header">
    <div>
      <span class="towrite-capture-eyebrow">{modeLabel(draft.intent)}</span>
      <h2>{copy.title}</h2>
    </div>
    <button type="button" class="towrite-capture-icon-button" title={copy.close} aria-label={copy.close} disabled={busy} on:click={requestClose}>
      <X size={18} />
    </button>
  </header>

  {#if result}
    <section class:towrite-capture-success-undone={undone} class="towrite-capture-success" aria-live="polite">
      <div class="towrite-capture-success-icon" aria-hidden="true">
        {#if undone}
          <RotateCcw size={28} />
        {:else}
          <CheckCircle2 size={28} />
        {/if}
      </div>
      <h3>{undone ? copy.undone : (result.message || (isAnswer ? copy.answered : copy.saved))}</h3>
      {#if result.capture?.finalPath && !undone}
        <div class="towrite-capture-result-path">
          <span>{copy.savedPath}</span>
          <strong>{result.capture.finalPath}</strong>
        </div>
      {/if}
      {#if resultActionError}
        <p class="towrite-capture-error" role="alert">{resultActionError}</p>
      {/if}
      <div class="towrite-capture-success-actions">
        {#if canOpenResult}
          <button type="button" disabled={busy} on:click={openResult}>
            <FileInput size={15} />
            <span>{opening ? `${result.openLabel || copy.open}…` : (result.openLabel || copy.open)}</span>
          </button>
        {/if}
        {#if canUndoResult}
          <button type="button" disabled={busy} on:click={undoResult}>
            {#if undoing}<LoaderCircle class="towrite-capture-spin" size={15} />{:else}<Undo2 size={15} />{/if}
            <span>{undoing ? copy.undoing : copy.undo}</span>
          </button>
        {/if}
        <button type="button" class="mod-cta" disabled={busy} on:click={requestClose}>{copy.done}</button>
      </div>
    </section>
  {:else}
    <div class="towrite-capture-scroll">
      {#if hasContext}
        <section class="towrite-capture-context" aria-label={copy.context}>
          <div class="towrite-capture-section-heading">
            <span>{context?.sourceLabel || copy.context}</span>
            {#if sourceFile}<code title={sourceFile}>{sourceFile}</code>{/if}
          </div>
          {#if headingPath.length > 0}
            <div class="towrite-capture-breadcrumbs" aria-label={copy.source}>
              {#each headingPath as heading, index}
                {#if index > 0}<span aria-hidden="true">/</span>{/if}<span>{heading}</span>
              {/each}
            </div>
          {/if}
          {#if questionTitle || questionText}
            <div class="towrite-capture-context-quote">
              <span class="towrite-capture-context-icon" aria-hidden="true"><MessageSquareReply size={15} /></span>
              <div><strong>{questionTitle || copy.question}</strong>{#if questionText}<p>{questionText}</p>{/if}</div>
            </div>
          {:else if contextSelection}
            <div class="towrite-capture-context-quote">
              <span class="towrite-capture-context-icon" aria-hidden="true"><FileInput size={15} /></span>
              <div><strong>{copy.selection}</strong><p>{contextSelection}</p></div>
            </div>
          {/if}
        </section>
      {/if}

      <section class="towrite-capture-editor">
        <label for="towrite-capture-body">{copy.body}</label>
        <textarea
          id="towrite-capture-body"
          bind:this={bodyInput}
          bind:value={body}
          rows="7"
          placeholder={copy.bodyPlaceholder}
          disabled={busy}
          on:input={handleDraftInput}
        />
        {#if detectedLinks.length > 0}
          <div class="towrite-capture-links" aria-label={copy.detectedLinks}>
            <Link2 size={12} /><span>{copy.detectedLinks}</span>
            {#each detectedLinks.slice(0, 3) as link}
              <code title={link}>{link}</code>
            {/each}
            {#if detectedLinks.length > 3}<span>+{detectedLinks.length - 3}</span>{/if}
          </div>
        {/if}
      </section>

      {#if !isAnswer || archiveAnswer}
        <details class="towrite-capture-optional">
          <summary>
            <span>{copy.optionalFields}</span>
            {#if title || parseCaptureTags(tags).length > 0}
              <small>{[title.trim(), ...parseCaptureTags(tags).map((tag) => `#${tag}`)].filter(Boolean).join(" · ")}</small>
            {/if}
          </summary>
          <div class="towrite-capture-optional-fields">
            <label for="towrite-capture-title">
              <span>{copy.titleField}</span>
              <input id="towrite-capture-title" bind:value={title} placeholder={copy.titlePlaceholder} disabled={busy} on:input={handleDraftInput} />
            </label>
            <label for="towrite-capture-tags">
              <span>{copy.tagsField}</span>
              <input id="towrite-capture-tags" bind:value={tags} placeholder={copy.tagsPlaceholder} disabled={busy} on:input={handleDraftInput} />
            </label>
          </div>
        </details>
      {/if}

      {#if isAnswer}
        <section class="towrite-capture-answer-option">
          <label>
            <input type="checkbox" checked={archiveAnswer} disabled={busy} on:change={handleArchiveChange} />
            <span><strong>{copy.archiveAnswer}</strong><small>{copy.archiveAnswerHint}</small></span>
            <span class="towrite-capture-answer-icon" aria-hidden="true"><Archive size={17} /></span>
          </label>
        </section>
      {/if}

      {#if targetRequired}
        <section class="towrite-capture-targets">
          <div class="towrite-capture-targets-heading">
            <div><h3>{copy.destinations}</h3><p>{copy.destinationsHint}</p></div>
            {#if recommending}
              <span class="towrite-capture-loading" role="status"><LoaderCircle class="towrite-capture-spin" size={13} />{copy.refreshing}</span>
            {/if}
          </div>

          {#if candidates.length > 0}
            <div class="towrite-capture-target-grid" role="radiogroup" aria-label={copy.destinations}>
              {#each candidates as candidate, index (candidate.id)}
                <label class:towrite-capture-target-selected={candidate.id === selectedCandidateId} class="towrite-capture-target">
                  <input
                    type="radio"
                    name={`towrite-capture-target-${draft.id}`}
                    value={candidate.id}
                    checked={candidate.id === selectedCandidateId}
                    disabled={busy}
                    on:change={() => selectCandidate(candidate)}
                  />
                  <span class="towrite-capture-target-number">{index + 1}</span>
                  <span class="towrite-capture-target-icon" aria-hidden="true">
                    {#if candidate.kind === "existingNote"}
                      <FilePlus2 size={17} />
                    {:else if candidate.kind === "folder"}
                      <FolderPlus size={17} />
                    {:else}
                      <Inbox size={17} />
                    {/if}
                  </span>
                  <span class="towrite-capture-target-body">
                    <span class="towrite-capture-target-topline">
                      <strong>{targetTitle(candidate)}</strong>
                      <em class={`towrite-capture-confidence-${candidate.confidence}`}>{confidenceLabel(candidate)}</em>
                    </span>
                    <code title={candidate.path}>{candidate.path}</code>
                    <small>{targetAction(candidate)} · {candidate.reason}</small>
                  </span>
                  {#if candidate.id === selectedCandidateId}<Check size={15} />{/if}
                </label>
              {/each}
            </div>
          {:else if recommending}
            <div class="towrite-capture-target-grid" aria-hidden="true">
              {#each [0, 1, 2] as _}
                <div class="towrite-capture-target towrite-capture-target-skeleton"><span></span><span></span><span></span></div>
              {/each}
            </div>
          {:else}
            <div class="towrite-capture-empty">
              <p>{copy.noDestinations}</p>
              <button type="button" disabled={busy} on:click={refreshRecommendations}>{copy.retry}</button>
            </div>
          {/if}
          {#if recommendationError}<p class="towrite-capture-error" role="alert">{recommendationError}</p>{/if}
        </section>
      {/if}

      <section class="towrite-capture-preview">
        <div class="towrite-capture-preview-heading">
          <h3>{copy.preview}</h3>
          {#if targetRequired && activeCandidate}
            <span>{targetAction(activeCandidate)} · <code>{activeCandidate.path}</code></span>
          {:else if isAnswer}
            <span>{copy.answerDestination}</span>
          {/if}
        </div>
        {#if targetRequired && previewing}
          <div class="towrite-capture-preview-loading" role="status"><LoaderCircle class="towrite-capture-spin" size={15} />{copy.previewing}</div>
        {:else if targetRequired && previewError}
          <p class="towrite-capture-error" role="alert">{previewError}</p>
        {:else if targetRequired && preview}
          <pre>{preview.excerpt}</pre>
        {:else if isAnswer && !archiveAnswer}
          <div class="towrite-capture-card-preview">
            <span class="towrite-capture-context-icon" aria-hidden="true"><MessageSquareReply size={15} /></span>
            <div><strong>{questionTitle || copy.cardAppend}</strong><p>{body || copy.bodyPlaceholder}</p></div>
          </div>
        {:else}
          <pre class:towrite-capture-preview-empty={!body.trim()}>{body.trim() || copy.previewFallback}</pre>
        {/if}
      </section>
    </div>

    {#if submitError}<p class="towrite-capture-error towrite-capture-submit-error" role="alert">{submitError}</p>{/if}
    <footer class="towrite-capture-footer">
      <span>{copy.shortcut}</span>
      <div>
        <button type="button" disabled={busy} on:click={requestClose}>{copy.cancel}</button>
        <button type="button" class="mod-cta towrite-capture-submit" disabled={!canSubmit} on:click={submit}>
          {#if saving}<LoaderCircle class="towrite-capture-spin" size={15} />{/if}
          <span>{saving ? copy.saving : (isAnswer ? (archiveAnswer ? copy.answerAndArchive : copy.answer) : copy.save)}</span>
        </button>
      </div>
    </footer>
  {/if}
</div>

<style>
  .towrite-capture-root {
    color: var(--text-normal);
    display: flex;
    flex-direction: column;
    font-family: var(--font-interface);
    max-height: min(82dvh, 820px);
    width: min(720px, calc(100vw - 3rem));
  }

  .towrite-capture-header,
  .towrite-capture-footer,
  .towrite-capture-targets-heading,
  .towrite-capture-preview-heading,
  .towrite-capture-section-heading,
  .towrite-capture-target-topline {
    align-items: center;
    display: flex;
    justify-content: space-between;
  }

  .towrite-capture-header {
    border-bottom: 1px solid var(--background-modifier-border);
    padding: 0 0 14px;
  }

  .towrite-capture-header h2 {
    font-size: 1.35rem;
    line-height: 1.25;
    margin: 2px 0 0;
  }

  .towrite-capture-eyebrow {
    color: var(--text-accent);
    font-size: var(--font-ui-smaller);
    font-weight: 650;
    letter-spacing: .035em;
    text-transform: uppercase;
  }

  .towrite-capture-icon-button {
    align-items: center;
    border: 0;
    border-radius: 50%;
    box-shadow: none;
    display: inline-flex;
    height: 32px;
    justify-content: center;
    padding: 0;
    width: 32px;
  }

  .towrite-capture-scroll {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
    overflow: auto;
    padding: 16px 3px 18px 0;
  }

  .towrite-capture-context,
  .towrite-capture-preview,
  .towrite-capture-answer-option {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 10px;
    padding: 11px 12px;
  }

  .towrite-capture-section-heading > span,
  .towrite-capture-editor > label {
    font-size: var(--font-ui-small);
    font-weight: 650;
  }

  .towrite-capture-section-heading code,
  .towrite-capture-preview-heading code {
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
    max-width: 62%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .towrite-capture-breadcrumbs {
    color: var(--text-muted);
    display: flex;
    flex-wrap: wrap;
    font-size: var(--font-ui-smaller);
    gap: 5px;
    margin-top: 7px;
  }

  .towrite-capture-context-quote,
  .towrite-capture-card-preview {
    align-items: flex-start;
    display: flex;
    gap: 9px;
    margin-top: 9px;
    min-width: 0;
  }

  .towrite-capture-context-icon {
    color: var(--text-accent);
    flex: 0 0 auto;
    margin-top: 2px;
  }

  .towrite-capture-context-quote div,
  .towrite-capture-card-preview div {
    min-width: 0;
  }

  .towrite-capture-context-quote strong,
  .towrite-capture-card-preview strong {
    font-size: var(--font-ui-small);
  }

  .towrite-capture-context-quote p,
  .towrite-capture-card-preview p {
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    display: -webkit-box;
    font-size: var(--font-ui-small);
    margin: 3px 0 0;
    overflow: hidden;
    white-space: pre-wrap;
  }

  .towrite-capture-editor {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .towrite-capture-editor textarea {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 10px;
    box-shadow: none;
    box-sizing: border-box;
    color: var(--text-normal);
    font-family: var(--font-text);
    font-size: var(--font-text-size);
    line-height: 1.55;
    min-height: 148px;
    padding: 12px;
    resize: vertical;
    width: 100%;
  }

  .towrite-capture-editor textarea:focus,
  .towrite-capture-optional input:focus {
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 18%, transparent);
  }

  .towrite-capture-links {
    align-items: center;
    color: var(--text-muted);
    display: flex;
    flex-wrap: wrap;
    font-size: var(--font-ui-smaller);
    gap: 5px;
  }

  .towrite-capture-links code {
    background: var(--background-secondary);
    border-radius: 4px;
    max-width: 180px;
    overflow: hidden;
    padding: 2px 5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .towrite-capture-optional {
    border-bottom: 1px solid var(--background-modifier-border);
    padding-bottom: 11px;
  }

  .towrite-capture-optional summary {
    align-items: center;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    font-size: var(--font-ui-small);
    gap: 8px;
  }

  .towrite-capture-optional summary small {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .towrite-capture-optional-fields {
    display: grid;
    gap: 10px;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    padding: 11px 2px 1px;
  }

  .towrite-capture-optional-fields label {
    display: flex;
    flex-direction: column;
    font-size: var(--font-ui-smaller);
    gap: 5px;
  }

  .towrite-capture-optional-fields input {
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
  }

  .towrite-capture-answer-option label {
    align-items: center;
    cursor: pointer;
    display: flex;
    gap: 10px;
  }

  .towrite-capture-answer-option label > span {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
  }

  .towrite-capture-answer-option small {
    color: var(--text-muted);
  }

  .towrite-capture-answer-icon {
    color: var(--text-muted);
    display: inline-flex;
  }

  .towrite-capture-targets-heading {
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 9px;
  }

  .towrite-capture-targets h3,
  .towrite-capture-preview h3 {
    font-size: var(--font-ui-medium);
    margin: 0;
  }

  .towrite-capture-targets-heading p {
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
    margin: 2px 0 0;
  }

  .towrite-capture-loading,
  .towrite-capture-preview-loading {
    align-items: center;
    color: var(--text-muted);
    display: inline-flex;
    font-size: var(--font-ui-smaller);
    gap: 5px;
  }

  .towrite-capture-target-grid {
    display: grid;
    gap: 7px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .towrite-capture-target {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 9px;
    cursor: pointer;
    display: grid;
    gap: 8px;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    min-height: 100px;
    padding: 10px;
    position: relative;
  }

  .towrite-capture-target:hover {
    border-color: var(--background-modifier-border-hover);
  }

  .towrite-capture-target-selected {
    background: color-mix(in srgb, var(--interactive-accent) 7%, var(--background-secondary));
    border-color: var(--interactive-accent);
  }

  .towrite-capture-target input {
    height: 1px;
    opacity: 0;
    pointer-events: none;
    position: absolute;
    width: 1px;
  }

  .towrite-capture-target:focus-within {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 22%, transparent);
  }

  .towrite-capture-target-number {
    color: var(--text-faint);
    font-size: var(--font-ui-smaller);
  }

  .towrite-capture-target-icon {
    color: var(--text-accent);
  }

  .towrite-capture-target-body {
    display: flex;
    flex-direction: column;
    gap: 5px;
    grid-column: 1 / -1;
    min-width: 0;
  }

  .towrite-capture-target-topline {
    align-items: flex-start;
    gap: 5px;
  }

  .towrite-capture-target-topline strong {
    font-size: var(--font-ui-small);
    line-height: 1.25;
  }

  .towrite-capture-target-topline em {
    border-radius: 999px;
    flex: 0 0 auto;
    font-size: 10px;
    font-style: normal;
    padding: 1px 5px;
  }

  .towrite-capture-confidence-strong {
    background: color-mix(in srgb, var(--color-green) 16%, transparent);
    color: var(--color-green);
  }

  .towrite-capture-confidence-medium {
    background: color-mix(in srgb, var(--color-orange) 16%, transparent);
    color: var(--color-orange);
  }

  .towrite-capture-confidence-weak {
    background: var(--background-modifier-hover);
    color: var(--text-muted);
  }

  .towrite-capture-target-body code {
    color: var(--text-muted);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .towrite-capture-target-body small {
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    color: var(--text-muted);
    display: -webkit-box;
    line-height: 1.3;
    overflow: hidden;
  }

  .towrite-capture-target-skeleton {
    cursor: default;
    display: flex;
    flex-direction: column;
  }

  .towrite-capture-target-skeleton span {
    animation: towrite-capture-pulse 1.2s ease-in-out infinite alternate;
    background: var(--background-modifier-hover);
    border-radius: 4px;
    display: block;
    height: 12px;
  }

  .towrite-capture-target-skeleton span:nth-child(2) { width: 72%; }
  .towrite-capture-target-skeleton span:nth-child(3) { width: 88%; }

  .towrite-capture-empty {
    align-items: center;
    background: var(--background-secondary);
    border-radius: 8px;
    display: flex;
    justify-content: space-between;
    padding: 8px 10px;
  }

  .towrite-capture-empty p {
    color: var(--text-muted);
    font-size: var(--font-ui-small);
    margin: 0;
  }

  .towrite-capture-preview-heading {
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 7px;
  }

  .towrite-capture-preview-heading > span {
    color: var(--text-muted);
    display: flex;
    font-size: var(--font-ui-smaller);
    gap: 4px;
    max-width: 70%;
  }

  .towrite-capture-preview pre {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 7px;
    font-family: var(--font-monospace);
    font-size: var(--font-ui-smaller);
    line-height: 1.45;
    margin: 0;
    max-height: 150px;
    overflow: auto;
    padding: 9px;
    white-space: pre-wrap;
  }

  .towrite-capture-preview-empty {
    color: var(--text-faint);
  }

  .towrite-capture-card-preview {
    margin-top: 0;
  }

  .towrite-capture-error {
    color: var(--text-error);
    font-size: var(--font-ui-small);
    margin: 7px 0 0;
  }

  .towrite-capture-submit-error {
    padding: 0 3px;
  }

  .towrite-capture-footer {
    border-top: 1px solid var(--background-modifier-border);
    gap: 12px;
    padding-top: 13px;
  }

  .towrite-capture-footer > span {
    color: var(--text-faint);
    font-size: var(--font-ui-smaller);
  }

  .towrite-capture-footer > div,
  .towrite-capture-success-actions {
    display: flex;
    gap: 7px;
  }

  .towrite-capture-submit,
  .towrite-capture-success-actions button {
    align-items: center;
    display: inline-flex;
    gap: 6px;
  }

  .towrite-capture-success {
    align-items: center;
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    min-height: 330px;
    padding: 34px 20px 20px;
    text-align: center;
  }

  .towrite-capture-success-icon {
    align-items: center;
    background: color-mix(in srgb, var(--color-green) 13%, transparent);
    border-radius: 50%;
    color: var(--color-green);
    display: flex;
    height: 58px;
    justify-content: center;
    width: 58px;
  }

  .towrite-capture-success-undone .towrite-capture-success-icon {
    background: var(--background-secondary);
    color: var(--text-muted);
  }

  .towrite-capture-success h3 {
    margin: 14px 0 0;
  }

  .towrite-capture-result-path {
    background: var(--background-secondary);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin: 12px 0 18px;
    max-width: 100%;
    padding: 8px 13px;
  }

  .towrite-capture-result-path span {
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
  }

  .towrite-capture-result-path strong {
    overflow-wrap: anywhere;
  }

  .towrite-capture-success-actions {
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 18px;
  }

  .towrite-capture-spin {
    animation: towrite-capture-spin .8s linear infinite;
  }

  @keyframes towrite-capture-spin {
    to { transform: rotate(360deg); }
  }

  @keyframes towrite-capture-pulse {
    from { opacity: .45; }
    to { opacity: .9; }
  }

  @media (max-width: 700px) {
    .towrite-capture-root {
      max-height: 85dvh;
      width: calc(100vw - 2rem);
    }

    .towrite-capture-target-grid,
    .towrite-capture-optional-fields {
      grid-template-columns: 1fr;
    }

    .towrite-capture-target {
      min-height: auto;
    }

    .towrite-capture-footer > span {
      display: none;
    }

    .towrite-capture-footer > div {
      display: grid;
      flex: 1;
      grid-template-columns: 1fr 1fr;
    }

    .towrite-capture-footer button {
      justify-content: center;
    }

    .towrite-capture-section-heading {
      align-items: flex-start;
      flex-direction: column;
    }

    .towrite-capture-section-heading code {
      max-width: 100%;
    }
  }

  @media (max-width: 480px) {
    .towrite-capture-editor textarea {
      min-height: 112px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .towrite-capture-spin,
    .towrite-capture-target-skeleton span {
      animation: none;
    }
  }
</style>
