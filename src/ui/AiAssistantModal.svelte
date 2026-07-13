<script lang="ts">
  import {
    Bot,
    BrainCircuit,
    Check,
    ChevronDown,
    Code2,
    Eraser,
    Eye,
    LoaderCircle,
    Send,
    Sparkles,
    UserRound,
    X
  } from "lucide-svelte";
  import { onMount, tick } from "svelte";
  import type { AiAssistantMessage } from "../ai/chat";
  import type { ToWriteLanguage } from "../core/settings";
  import AiMarkdownMessage from "./AiMarkdownMessage.svelte";
  import type {
    AiAssistantCallbacks,
    AiAssistantCatalog,
    AiAssistantSkillOption
  } from "./ai-assistant-types";

  type PickerKind = "skill" | "agent";

  interface PickerOption {
    id: string;
    label: string;
    detail?: string;
    kind: PickerKind;
  }

  export let language: ToWriteLanguage = "zh";
  export let initialMessages: AiAssistantMessage[] = [];
  export let callbacks: AiAssistantCallbacks;
  export let onRequestClose: () => void = () => undefined;
  export let onBusyChange: (busy: boolean) => void = () => undefined;

  let messages = [...initialMessages];
  let catalog: AiAssistantCatalog | undefined;
  let selectedModelId = "";
  let selectedSkillPath = "";
  let selectedAgentIds: string[] = [];
  let input = "";
  let loadingCatalog = true;
  let sending = false;
  let clearing = false;
  let error = "";
  let messageList: HTMLDivElement | undefined;
  let composer: HTMLTextAreaElement | undefined;
  let rawMessageIds = new Set<string>();
  let choosingMessageIds = new Set<string>();
  let pickerKind: PickerKind | undefined;
  let pickerQuery = "";
  let pickerTokenStart = 0;
  let pickerTokenEnd = 0;
  let pickerIndex = 0;

  $: copy = assistantCopy(language);
  $: busy = loadingCatalog || sending || clearing || choosingMessageIds.size > 0;
  $: onBusyChange(busy);
  $: canSend = Boolean(input.trim() && selectedModelId && !busy);
  $: selectedSkill = catalog?.skills.find((skill) => skill.skillPath === selectedSkillPath);
  $: pickerOptions = getPickerOptions(pickerKind, pickerQuery);

  onMount(() => {
    void loadCatalog();
  });

  async function loadCatalog() {
    loadingCatalog = true;
    error = "";
    try {
      catalog = await callbacks.loadCatalog();
      selectedModelId = catalog.selectedModelId || catalog.models[0]?.id || "";
      setSelectedSkill(catalog.selectedSkillPath);
      selectedAgentIds = [...catalog.selectedAgentIds];
      await scrollToLatest(false);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loadingCatalog = false;
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || !selectedModelId || sending) {
      return;
    }
    input = "";
    closePicker();
    sending = true;
    error = "";
    try {
      messages = await callbacks.send({
        message: text,
        modelId: selectedModelId,
        skillPath: selectedSkillPath,
        agentIds: selectedAgentIds
      });
      await scrollToLatest();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      input = text;
    } finally {
      sending = false;
    }
  }

  async function clearHistory() {
    if (clearing || messages.length === 0) {
      return;
    }
    clearing = true;
    error = "";
    try {
      messages = await callbacks.clearHistory();
      rawMessageIds = new Set();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      clearing = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void send();
      return;
    }

    if (!pickerKind || pickerOptions.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      pickerIndex = (pickerIndex + 1) % pickerOptions.length;
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      pickerIndex = (pickerIndex - 1 + pickerOptions.length) % pickerOptions.length;
    } else if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
      event.preventDefault();
      void choosePickerOption(pickerOptions[pickerIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closePicker();
    }
  }

  function handleComposerInput(event: Event) {
    const textarea = event.currentTarget as HTMLTextAreaElement;
    const cursor = textarea.selectionStart;
    const beforeCursor = textarea.value.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|\s)([/@])([^\s/@]*)$/u);
    if (!match) {
      closePicker();
      return;
    }
    pickerKind = match[1] === "/" ? "skill" : "agent";
    pickerQuery = match[2] ?? "";
    pickerTokenStart = cursor - pickerQuery.length - 1;
    pickerTokenEnd = cursor;
    pickerIndex = 0;
  }

  function openPicker(kind: PickerKind) {
    if (!composer) {
      return;
    }
    const cursor = composer.selectionStart;
    pickerKind = kind;
    pickerQuery = "";
    pickerTokenStart = cursor;
    pickerTokenEnd = cursor;
    pickerIndex = 0;
    composer.focus();
  }

  function closePicker() {
    pickerKind = undefined;
    pickerQuery = "";
    pickerIndex = 0;
  }

  function getPickerOptions(kind: PickerKind | undefined, query: string): PickerOption[] {
    if (!catalog || !kind) {
      return [];
    }
    const needle = query.trim().toLocaleLowerCase();
    if (kind === "skill") {
      return catalog.skills
        .filter((skill) => matchesPickerQuery(needle, skill.name, skill.role, skill.agentId))
        .map((skill) => ({
          id: skill.skillPath,
          label: skill.name,
          detail: [skill.role, skill.agentId, skill.skillPath].filter(Boolean).join(" · "),
          kind
        }));
    }

    return catalog.agents
      .map((agent) => ({
        id: agent.agentId,
        label: agent.name,
        detail: [agent.role, agent.category, agent.status].filter(Boolean).join(" · ")
      }))
      .filter((agent) => matchesPickerQuery(needle, agent.label, agent.detail))
      .map((agent) => ({ ...agent, kind }));
  }

  function matchesPickerQuery(needle: string, ...values: Array<string | undefined>) {
    return !needle || values.some((value) => value?.toLocaleLowerCase().includes(needle));
  }

  async function choosePickerOption(option: PickerOption | undefined) {
    if (!option) {
      return;
    }
    if (option.kind === "skill") {
      setSelectedSkill(option.id);
    } else {
      selectedAgentIds = selectedAgentIds.includes(option.id)
        ? selectedAgentIds.filter((agentId) => agentId !== option.id)
        : [...selectedAgentIds, option.id];
    }

    input = `${input.slice(0, pickerTokenStart)}${input.slice(pickerTokenEnd)}`;
    const caret = pickerTokenStart;
    closePicker();
    await tick();
    composer?.focus();
    composer?.setSelectionRange(caret, caret);
  }

  function setSelectedSkill(skillPath: string) {
    selectedSkillPath = skillPath;
  }

  function removeAgent(agentId: string) {
    selectedAgentIds = selectedAgentIds.filter((item) => item !== agentId);
  }

  function agentLabel(agentId: string) {
    return catalog?.agents.find((agent) => agent.agentId === agentId)?.name ?? agentId;
  }

  async function chooseInteraction(messageId: string, optionId: string) {
    if (choosingMessageIds.has(messageId)) {
      return;
    }
    choosingMessageIds = new Set([...choosingMessageIds, messageId]);
    error = "";
    try {
      messages = await callbacks.choose({
        messageId,
        optionId,
        modelId: selectedModelId,
        skillPath: selectedSkillPath,
        agentIds: selectedAgentIds
      });
      await scrollToLatest();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      const next = new Set(choosingMessageIds);
      next.delete(messageId);
      choosingMessageIds = next;
    }
  }

  function toggleRawMessage(messageId: string) {
    const next = new Set(rawMessageIds);
    if (next.has(messageId)) {
      next.delete(messageId);
    } else {
      next.add(messageId);
    }
    rawMessageIds = next;
  }

  async function scrollToLatest(smooth = true) {
    await tick();
    messageList?.scrollTo({ top: messageList.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }

  function assistantCopy(currentLanguage: ToWriteLanguage) {
    return currentLanguage === "zh"
      ? {
          title: "ToWrite AI 助手",
          direct: "插件直连",
          backend: "Backend / LiteLLM",
          model: "模型",
          skill: "Skill",
          noSkill: "普通对话（不加载 Skill）",
          context: "查看本次对话上下文",
          activeFile: "当前笔记",
          selection: "选区",
          questions: "相关未解决问题",
          sentFields: "发送字段",
          empty: "可以围绕当前笔记、选区或未解决问题直接提问。",
          placeholder: "输入问题，使用 / 选择 Skill、@ 选择 Agent…",
          send: "发送",
          clear: "新对话 / 清空历史",
          loading: "正在加载模型、Skills 和上下文…",
          you: "你",
          ai: "AI",
          rendered: "渲染",
          source: "原文",
          composerHint: "Ctrl/Cmd+Enter 发送 · Shift+Enter 换行",
          chooseSkill: "Skill 仓库",
          chooseAgent: "选择 Agent",
          noMatches: "没有匹配项",
          activeSkill: "当前 Skill",
          activeAgent: "当前 Agent",
          remove: "移除"
        }
      : {
          title: "ToWrite AI assistant",
          direct: "Direct provider",
          backend: "Backend / LiteLLM",
          model: "Model",
          skill: "Skill",
          noSkill: "Regular chat (no Skill)",
          context: "Inspect conversation context",
          activeFile: "Active note",
          selection: "Selection",
          questions: "Related unresolved questions",
          sentFields: "Fields sent",
          empty: "Ask about the active note, selection, or unresolved questions.",
          placeholder: "Ask a question; use / for Skills or @ for Agents…",
          send: "Send",
          clear: "New chat / clear history",
          loading: "Loading models, Skills, and context…",
          you: "You",
          ai: "AI",
          rendered: "Rendered",
          source: "Source",
          composerHint: "Ctrl/Cmd+Enter to send · Shift+Enter for a new line",
          chooseSkill: "Skill library",
          chooseAgent: "Choose Agent",
          noMatches: "No matches",
          activeSkill: "Active Skill",
          activeAgent: "Active Agent",
          remove: "Remove"
        };
  }
</script>

<section class="towrite-ai-assistant">
  <header class="towrite-ai-assistant-header">
    <div class="towrite-ai-assistant-heading">
      <span class="towrite-ai-assistant-avatar"><Bot size={17} /></span>
      <div>
        <strong>{copy.title}</strong>
        {#if catalog}<small>{catalog.mode === "backend" ? copy.backend : copy.direct}</small>{/if}
      </div>
    </div>
    <div class="towrite-ai-assistant-header-actions">
      <button type="button" title={copy.clear} aria-label={copy.clear} disabled={busy || messages.length === 0} on:click={clearHistory}>
        <Eraser size={15} />
      </button>
      <button type="button" title="Close" aria-label="Close" disabled={busy} on:click={onRequestClose}>
        <X size={16} />
      </button>
    </div>
  </header>

  {#if loadingCatalog}
    <div class="towrite-ai-assistant-loading"><LoaderCircle size={18} />{copy.loading}</div>
  {:else if catalog}
    <div class="towrite-ai-assistant-controls">
      <label>
        <span>{copy.model}</span>
        <select bind:value={selectedModelId} disabled={sending}>
          {#each catalog.models as model}
            <option value={model.id}>{model.label}{model.provider ? ` · ${model.provider}` : ""}</option>
          {/each}
        </select>
      </label>
      {#if catalog.mode === "backend"}
        <label>
          <span>{copy.skill}</span>
          <select value={selectedSkillPath} disabled={sending} on:change={(event) => setSelectedSkill(event.currentTarget.value)}>
            <option value="">{copy.noSkill}</option>
            {#each catalog.skills as skill}
              <option value={skill.skillPath}>{skill.name}{skill.role ? ` · ${skill.role}` : ""}</option>
            {/each}
          </select>
        </label>
      {/if}
    </div>

    <details class="towrite-ai-context-inspector">
      <summary><BrainCircuit size={15} />{copy.context}<ChevronDown size={14} /></summary>
      <div>
        {#if catalog.context.activeFile}<p><strong>{copy.activeFile}</strong><span>{catalog.context.activeFile}</span></p>{/if}
        {#if catalog.context.selection}<p><strong>{copy.selection}</strong><span>{catalog.context.selection}</span></p>{/if}
        {#if catalog.context.questionSummaries.length}
          <p><strong>{copy.questions}</strong><span>{catalog.context.questionSummaries.join("\n")}</span></p>
        {/if}
        <p><strong>{copy.sentFields}</strong><span>{catalog.context.sentFields.join(" · ")}</span></p>
      </div>
    </details>

    {#if catalog.warning}<p class="towrite-ai-assistant-warning">{catalog.warning}</p>{/if}
  {/if}

  <div class="towrite-ai-message-list" bind:this={messageList} aria-live="polite">
    {#if messages.length === 0}
      <div class="towrite-ai-message-empty">
        <Sparkles size={22} />
        <span>{copy.empty}</span>
      </div>
    {:else}
      {#each messages as message (message.id)}
        <article class:towrite-ai-message-user={message.role === "user"} class="towrite-ai-message">
          <header class="towrite-ai-message-header">
            <span>{message.role === "user" ? copy.you : copy.ai}{message.modelId ? ` · ${message.modelId}` : ""}</span>
            {#if message.role === "assistant"}
              <button
                type="button"
                class:active={rawMessageIds.has(message.id)}
                title={rawMessageIds.has(message.id) ? copy.rendered : copy.source}
                aria-label={rawMessageIds.has(message.id) ? copy.rendered : copy.source}
                on:click={() => toggleRawMessage(message.id)}
              >
                {#if rawMessageIds.has(message.id)}<Eye size={13} />{:else}<Code2 size={13} />{/if}
                <span>{rawMessageIds.has(message.id) ? copy.rendered : copy.source}</span>
              </button>
            {/if}
          </header>
          {#if message.role === "assistant" && !rawMessageIds.has(message.id)}
            <AiMarkdownMessage
              markdown={message.content}
              sourcePath={catalog?.context.activeFile ?? ""}
              renderMarkdown={callbacks.renderMarkdown}
            />
          {:else if message.role === "assistant"}
            <pre class="towrite-ai-message-source"><code>{message.content}</code></pre>
          {:else}
            <p>{message.content}</p>
          {/if}
          {#if message.interaction?.kind === "choice"}
            <section class="towrite-ai-choice" aria-label={message.interaction.question}>
              <strong>{message.interaction.question}</strong>
              <div>
                {#each message.interaction.options as option (option.id)}
                  <button
                    type="button"
                    class:selected={message.interaction.selectedOptionId === option.id}
                    disabled={message.interaction.status === "answered" || choosingMessageIds.has(message.id)}
                    on:click={() => chooseInteraction(message.id, option.id)}
                  >
                    <span>
                      <strong>{option.label}</strong>
                      {#if option.description}<small>{option.description}</small>{/if}
                    </span>
                    {#if message.interaction.selectedOptionId === option.id}
                      <Check size={15} />
                    {:else if choosingMessageIds.has(message.id)}
                      <LoaderCircle size={15} />
                    {/if}
                  </button>
                {/each}
              </div>
            </section>
          {/if}
        </article>
      {/each}
    {/if}
    {#if sending}<div class="towrite-ai-assistant-loading"><LoaderCircle size={16} />AI…</div>{/if}
  </div>

  {#if error}<p class="towrite-ai-assistant-error" role="alert">{error}</p>{/if}

  <footer class="towrite-ai-composer-shell">
    {#if selectedSkill || selectedAgentIds.length > 0}
      <div class="towrite-ai-composer-selections">
        {#each selectedAgentIds as agentId (agentId)}
          <span>
            <UserRound size={12} />{copy.activeAgent}: {agentLabel(agentId)}
            <button type="button" title={copy.remove} aria-label={`${copy.remove} ${agentLabel(agentId)}`} on:click={() => removeAgent(agentId)}><X size={11} /></button>
          </span>
        {/each}
        {#if selectedSkill}
          <span>
            <Sparkles size={12} />{copy.activeSkill}: {selectedSkill.name}
            <button type="button" title={copy.remove} aria-label={copy.remove} on:click={() => setSelectedSkill("")}><X size={11} /></button>
          </span>
        {/if}
      </div>
    {/if}

    <div class="towrite-ai-composer-wrap">
      {#if pickerKind}
        <div class="towrite-ai-command-picker" role="listbox" aria-label={pickerKind === "skill" ? copy.chooseSkill : copy.chooseAgent}>
          <header>
            {#if pickerKind === "skill"}<Sparkles size={14} />{:else}<UserRound size={14} />{/if}
            <strong>{pickerKind === "skill" ? copy.chooseSkill : copy.chooseAgent}</strong>
            {#if pickerQuery}<code>{pickerKind === "skill" ? "/" : "@"}{pickerQuery}</code>{/if}
          </header>
          {#if pickerOptions.length === 0}
            <div class="towrite-ai-command-empty">{copy.noMatches}</div>
          {:else}
            {#each pickerOptions as option, index (option.id)}
              <button
                type="button"
                class:active={index === pickerIndex}
                role="option"
                aria-selected={index === pickerIndex}
                on:mouseenter={() => (pickerIndex = index)}
                on:mousedown|preventDefault={() => choosePickerOption(option)}
              >
                <span>{#if option.kind === "skill"}<Sparkles size={14} />{:else}<UserRound size={14} />{/if}</span>
                <span><strong>{option.label}</strong>{#if option.detail}<small>{option.detail}</small>{/if}</span>
                {#if (option.kind === "skill" && option.id === selectedSkillPath) || (option.kind === "agent" && selectedAgentIds.includes(option.id))}
                  <Check size={14} />
                {/if}
              </button>
            {/each}
          {/if}
        </div>
      {/if}

      <div class="towrite-ai-composer">
        <textarea
          bind:this={composer}
          bind:value={input}
          rows="3"
          placeholder={copy.placeholder}
          disabled={busy || !catalog}
          on:input={handleComposerInput}
          on:keydown={handleKeydown}
        ></textarea>
        <div class="towrite-ai-composer-actions">
          {#if catalog?.mode === "backend"}
            <button type="button" title={copy.chooseSkill} aria-label={copy.chooseSkill} disabled={busy} on:click={() => openPicker("skill")}>/</button>
            <button type="button" title={copy.chooseAgent} aria-label={copy.chooseAgent} disabled={busy} on:click={() => openPicker("agent")}>@</button>
          {/if}
          <button type="button" class="mod-cta towrite-ai-send" title={copy.send} aria-label={copy.send} disabled={!canSend} on:click={send}>
            {#if sending}<LoaderCircle size={17} />{:else}<Send size={17} />{/if}
          </button>
        </div>
      </div>
    </div>
    <small class="towrite-ai-composer-hint">{copy.composerHint}</small>
  </footer>
</section>
