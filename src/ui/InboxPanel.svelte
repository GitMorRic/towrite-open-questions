<script lang="ts">
  import { ExternalLink, Inbox, MonitorUp } from "lucide-svelte";
  import { INBOX_ROOT_GROUP, filterInboxSnapshot } from "../inbox";
  import type { InboxItem, InboxSnapshot } from "../inbox/types";
  import type { ToWriteUiApi } from "./api";
  import { compactPath } from "./path";

  export let api: ToWriteUiApi;
  export let snapshot: InboxSnapshot;
  export let search = "";
  export let compact = false;

  let busyId = "";
  let error = "";

  $: language = api.getLanguage();
  $: filtered = filterInboxSnapshot(snapshot, search);

  function groupLabel(label: string): string {
    if (label !== INBOX_ROOT_GROUP) return label;
    return language === "zh" ? "未分类" : "Unsorted";
  }

  function updatedLabel(item: InboxItem): string {
    const timestamp = Date.parse(item.updatedAt);
    if (!Number.isFinite(timestamp)) return "";
    return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(timestamp));
  }

  function itemMetadataLabel(item: InboxItem): string {
    const parts: string[] = [];
    if (item.matchedBy === "metadata") {
      parts.push(language === "zh" ? "属性" : "Metadata");
    } else {
      parts.push(language === "zh" ? "目录规则" : "Folder rule");
    }
    if (item.tags.length > 0) {
      parts.push(`#${item.tags.slice(0, 3).join(" #")}`);
    }
    return parts.join(" · ");
  }

  async function sendToScreen(item: InboxItem): Promise<void> {
    if (busyId) return;
    busyId = item.id;
    error = "";
    try {
      await api.sendInboxItemToDeviceHub(item.id);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busyId = "";
    }
  }
</script>

<section class="towrite-inbox-panel" aria-labelledby="towrite-inbox-heading">
  <header class="towrite-inbox-header">
    <div class="towrite-inbox-heading">
      <span class="towrite-inbox-icon" aria-hidden="true"><Inbox size={16} /></span>
      <div>
        <h3 id="towrite-inbox-heading">Inbox</h3>
        {#if !compact}
          <p>{language === "zh"
            ? "workflow_stage: inbox 是显式状态；没有该属性时，监控目录作为兼容规则收拢待整理笔记。"
            : "workflow_stage: inbox is explicit; watched folders collect unmarked notes as a compatibility fallback."}</p>
        {/if}
      </div>
    </div>
    <span class="towrite-inbox-total">{snapshot.count}</span>
  </header>

  {#if !compact && snapshot.sourceRoots.length > 0}
    <div class="towrite-inbox-roots" aria-label={language === "zh" ? "监控目录" : "Watched folders"}>
      {#each snapshot.sourceRoots as root (root)}
        <span title={root}>{compactPath(root, 3)}</span>
      {/each}
    </div>
  {/if}

  {#if error}<p class="towrite-suggestion-error" role="alert">{error}</p>{/if}

  {#if filtered.items.length === 0}
    <div class="towrite-empty">
      {search.trim()
        ? (language === "zh" ? "没有匹配的 Inbox 笔记。" : "No matching Inbox notes.")
        : (language === "zh" ? "Inbox 已经清空。" : "Inbox is clear.")}
    </div>
  {:else}
    <div class="towrite-inbox-groups">
      {#each filtered.groups as group (group.id)}
        <section class="towrite-inbox-group">
          <header>
            <strong>{groupLabel(group.label)}</strong>
            <small>{group.items.length}</small>
          </header>
          <div class="towrite-inbox-list">
            {#each group.items as item (item.id)}
              {@const deviceEligibility = api.getInboxItemDeviceEligibility(item.id)}
              <article class="towrite-inbox-item">
                <button class="towrite-inbox-item-main" type="button" title={item.filePath} on:click={() => api.openFile(item.filePath)}>
                  <strong>{item.title}</strong>
                  <span>{compactPath(item.filePath, 4)}</span>
                  <small>
                    {#if itemMetadataLabel(item)}<span>{itemMetadataLabel(item)}</span>{/if}
                    <time datetime={item.updatedAt}>{updatedLabel(item)}</time>
                  </small>
                </button>
                <div class="towrite-inbox-actions">
                  <button type="button" title={language === "zh" ? "打开笔记" : "Open note"} aria-label={`${language === "zh" ? "打开" : "Open"}: ${item.title}`} on:click={() => api.openFile(item.filePath)}>
                    <ExternalLink size={14} />
                  </button>
                  <button type="button" disabled={Boolean(busyId) || !deviceEligibility.eligible} title={deviceEligibility.reason || (language === "zh" ? "设为墨水屏与 NFC 当前内容" : "Use for e-ink and NFC")} aria-label={`${language === "zh" ? "发送到墨水屏" : "Send to e-ink"}: ${item.title}`} on:click={() => sendToScreen(item)}>
                    <MonitorUp size={14} />
                  </button>
                </div>
              </article>
            {/each}
          </div>
        </section>
      {/each}
    </div>
    {#if snapshot.truncated}
      <p class="towrite-inbox-truncated">{language === "zh"
        ? `当前显示最近 ${snapshot.visibleCount} 条；可在设置中提高上限。`
        : `Showing the latest ${snapshot.visibleCount}; raise the limit in settings to see more.`}</p>
    {/if}
  {/if}
</section>
