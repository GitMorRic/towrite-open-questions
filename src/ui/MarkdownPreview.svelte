<script lang="ts">
  import { afterUpdate, onDestroy, onMount } from "svelte";
  import type { ToWriteUiApi } from "./api";

  export let api: ToWriteUiApi;
  export let markdown = "";
  export let sourcePath = "";

  let container: HTMLDivElement;
  let lastMarkdown = "";
  let lastSourcePath = "";
  let renderGeneration = 0;
  let destroyed = false;

  onMount(() => {
    container?.addEventListener("click", handleClick, true);
    void renderPreview();
    return () => {
      container?.removeEventListener("click", handleClick, true);
    };
  });

  afterUpdate(() => {
    if (markdown !== lastMarkdown || sourcePath !== lastSourcePath) {
      void renderPreview();
    }
  });

  onDestroy(() => {
    destroyed = true;
  });

  async function renderPreview() {
    if (!container) {
      return;
    }

    const currentMarkdown = markdown.trim();
    const currentSourcePath = sourcePath;
    const generation = ++renderGeneration;
    lastMarkdown = markdown;
    lastSourcePath = sourcePath;

    if (!currentMarkdown) {
      container.replaceChildren();
      return;
    }

    await api.renderMarkdown(currentMarkdown, container, currentSourcePath);
    if (destroyed || generation !== renderGeneration) {
      return;
    }
  }

  async function handleClick(event: Event) {
    if (!(event.target instanceof Element)) {
      return;
    }

    const link = event.target.closest<HTMLAnchorElement>("a.internal-link, a[data-href]");
    if (!link || !container.contains(link)) {
      return;
    }

    const linktext = link.getAttribute("data-href") ?? link.getAttribute("href") ?? "";
    if (!linktext || /^[a-z][a-z0-9+.-]*:/iu.test(linktext)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    await api.openObsidianLink(linktext, sourcePath);
  }
</script>

<div bind:this={container} class="towrite-markdown-preview"></div>
