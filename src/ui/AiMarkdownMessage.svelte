<script lang="ts">
  import { afterUpdate, onDestroy, onMount } from "svelte";

  export let markdown = "";
  export let sourcePath = "";
  export let renderMarkdown: (markdown: string, element: HTMLElement, sourcePath: string) => Promise<void>;

  let container: HTMLDivElement;
  let lastMarkdown = "";
  let lastSourcePath = "";
  let generation = 0;
  let destroyed = false;

  onMount(() => {
    void render();
  });

  afterUpdate(() => {
    if (markdown !== lastMarkdown || sourcePath !== lastSourcePath) {
      void render();
    }
  });

  onDestroy(() => {
    destroyed = true;
    container?.replaceChildren();
  });

  async function render() {
    if (!container) {
      return;
    }
    const currentGeneration = ++generation;
    lastMarkdown = markdown;
    lastSourcePath = sourcePath;
    const staging = document.createElement("div");
    try {
      await renderMarkdown(markdown, staging, sourcePath);
      if (destroyed || currentGeneration !== generation) {
        return;
      }
      container.replaceChildren(...staging.childNodes);
    } catch {
      if (destroyed || currentGeneration !== generation) {
        return;
      }
      container.textContent = markdown;
    }
  }
</script>

<div bind:this={container} class="towrite-ai-message-markdown markdown-rendered"></div>
