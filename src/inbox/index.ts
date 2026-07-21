import type { App, TFile } from "obsidian";
import { shortHash, slugify } from "../core/hash";
import type { ToWriteInboxSettings } from "../core/settings";
import { normalizeWorkflowStageId, readExplicitWorkflowStage } from "../core/workflow-metadata";
import type { InboxGroup, InboxItem, InboxSnapshot } from "./types";

const ROOT_GROUP = "__root__";

/**
 * Metadata-only incremental Inbox index. It deliberately never reads note bodies,
 * so editor events only update one in-memory record after the existing debounce.
 */
export class InboxIndex {
  private readonly itemsByPath = new Map<string, InboxItem>();
  private readonly itemsById = new Map<string, InboxItem>();
  private sortedItemsCache?: InboxItem[];
  private snapshotCache?: { key: string; value: InboxSnapshot };

  constructor(
    private readonly app: App,
    private readonly getSettings: () => ToWriteInboxSettings
  ) {}

  rebuild(): void {
    this.itemsByPath.clear();
    this.itemsById.clear();
    this.markDirty();
    if (!this.getSettings().enabled) return;
    for (const file of this.app.vault.getMarkdownFiles()) {
      this.upsert(file);
    }
  }

  upsert(file: TFile): boolean {
    return this.upsertInternal(file, false);
  }

  /** Update cached metadata without waking the whole sidebar for timestamp-only body edits. */
  upsertFromMetadata(file: TFile): boolean {
    return this.upsertInternal(file, true);
  }

  private upsertInternal(file: TFile, semanticSignalOnly: boolean): boolean {
    const path = normalizeVaultPath(file.path);
    const previous = this.itemsByPath.get(path);
    const settings = this.getSettings();
    if (!settings.enabled || file.extension.toLowerCase() !== "md") return this.remove(path);
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter && typeof cache.frontmatter === "object"
      ? cache.frontmatter as Record<string, unknown>
      : {};
    const membership = resolveInboxMembership(path, frontmatter, settings.folderPrefixes);
    if (!membership) return this.remove(path);
    const { sourceRoot, matchedBy } = membership;

    const relativePath = sourceRoot ? path.slice(sourceRoot.length + 1) : path;
    if (!relativePath) return this.remove(path);
    const parts = relativePath.split("/").filter(Boolean);
    const relativeFolder = parts.slice(0, -1).join("/");
    const explicitProject = normalizeTitle(frontmatter.project);
    const project = explicitProject
      || (sourceRoot
        ? (parts.length > 1 ? parts[0] : ROOT_GROUP)
        : (parts.length > 1 ? parts.at(-2) || ROOT_GROUP : ROOT_GROUP));
    const title = normalizeTitle(frontmatter.title)
      || file.basename
      || parts.at(-1)?.replace(/\.md$/iu, "")
      || "Untitled";
    const tags = uniqueTags([
      ...(cache?.tags ?? []).map((tag) => tag.tag),
      ...frontmatterTagValues(frontmatter.tags)
    ]);
    const createdAt = safeIso(file.stat?.ctime);
    const updatedAt = safeIso(file.stat?.mtime || file.stat?.ctime);

    const item: InboxItem = {
      id: `inb_${slugify(file.basename || path)}_${shortHash(path)}`,
      kind: "vault-note",
      source: matchedBy === "metadata" ? "vault-metadata" : "vault-folder",
      matchedBy,
      status: "pending",
      title,
      filePath: path,
      sourceRoot,
      project,
      folder: relativeFolder || ROOT_GROUP,
      tags,
      createdAt,
      updatedAt
    };
    const semanticChanged = !previous || !sameInboxMetadata(previous, item);
    const changed = semanticChanged
      || previous.createdAt !== item.createdAt
      || previous.updatedAt !== item.updatedAt;
    if (!changed) return false;
    if (previous && previous.id !== item.id) this.itemsById.delete(previous.id);
    this.itemsByPath.set(path, item);
    this.itemsById.set(item.id, item);
    this.markDirty();
    return semanticSignalOnly ? semanticChanged : true;
  }

  remove(path: string): boolean {
    const normalized = normalizeVaultPath(path);
    const previous = this.itemsByPath.get(normalized);
    if (!previous) return false;
    this.itemsByPath.delete(normalized);
    this.itemsById.delete(previous.id);
    this.markDirty();
    return true;
  }

  getItem(id: string): InboxItem | undefined {
    const item = this.itemsById.get(id);
    return item ? cloneItem(item) : undefined;
  }

  /** Candidate reads are intentionally independent from the UI display limit. */
  getCandidateItems(limit: number, preferredId?: string): InboxItem[] {
    const items = this.sortedItems();
    const preferred = preferredId ? this.itemsById.get(preferredId) : undefined;
    const ordered = preferred
      ? [preferred, ...items.filter((item) => item.id !== preferred.id)]
      : items;
    return ordered.slice(0, Math.max(0, limit)).map(cloneItem);
  }

  getSnapshot(): InboxSnapshot {
    const settings = this.getSettings();
    const key = JSON.stringify([
      settings.enabled,
      settings.folderPrefixes,
      settings.groupBy,
      settings.maxItems
    ]);
    if (this.snapshotCache?.key === key) return this.snapshotCache.value;
    const allItems = settings.enabled ? this.sortedItems() : [];
    const items = allItems.slice(0, settings.maxItems).map(cloneItem);
    const value = createSnapshot(items, allItems.length, settings.folderPrefixes, settings.groupBy);
    this.snapshotCache = { key, value };
    return value;
  }

  private sortedItems(): InboxItem[] {
    if (!this.sortedItemsCache) {
      this.sortedItemsCache = Array.from(this.itemsByPath.values()).sort(compareInboxItems);
    }
    return this.sortedItemsCache;
  }

  private markDirty(): void {
    this.sortedItemsCache = undefined;
    this.snapshotCache = undefined;
  }
}

export function filterInboxSnapshot(snapshot: InboxSnapshot, search: string): InboxSnapshot {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return snapshot;
  const items = snapshot.items.filter((item) => [
    item.title,
    item.filePath,
    item.project,
    item.folder,
    item.tags.join(" ")
  ].join(" ").toLocaleLowerCase().includes(needle));
  return createSnapshot(items, items.length, snapshot.sourceRoots, snapshot.groupBy, snapshot.generatedAt);
}

function createSnapshot(
  items: InboxItem[],
  totalCount: number,
  roots: readonly string[],
  groupBy: ToWriteInboxSettings["groupBy"],
  generatedAt = new Date().toISOString()
): InboxSnapshot {
  const groupsById = new Map<string, InboxItem[]>();
  for (const item of items) {
    const id = groupBy === "folder" ? item.folder : item.project;
    const group = groupsById.get(id);
    if (group) group.push(item);
    else groupsById.set(id, [item]);
  }
  const groups: InboxGroup[] = Array.from(groupsById.entries())
    .map(([id, groupedItems]) => ({ id, label: id, items: groupedItems.map(cloneItem) }))
    .sort((left, right) => {
      if (left.id === ROOT_GROUP) return -1;
      if (right.id === ROOT_GROUP) return 1;
      return left.label.localeCompare(right.label);
    });
  return {
    schemaVersion: 1,
    generatedAt,
    sourceRoots: roots.map(normalizeVaultPath).filter(Boolean),
    groupBy,
    count: totalCount,
    visibleCount: items.length,
    truncated: totalCount > items.length,
    items: items.map(cloneItem),
    groups
  };
}

export interface InboxMembership {
  matchedBy: "metadata" | "folder";
  sourceRoot: string;
}

/**
 * Explicit workflow metadata is authoritative. Folder roots are a compatibility
 * fallback for captured notes that have not been materialized yet.
 */
export function resolveInboxMembership(
  path: string,
  frontmatter: Record<string, unknown> | undefined,
  roots: readonly string[]
): InboxMembership | undefined {
  const explicitStage = readExplicitWorkflowStage(frontmatter);
  const sourceRoot = matchingInboxRoot(path, roots) ?? "";
  if (explicitStage) {
    return normalizeWorkflowStageId(explicitStage) === "inbox"
      ? { matchedBy: "metadata", sourceRoot }
      : undefined;
  }
  return sourceRoot ? { matchedBy: "folder", sourceRoot } : undefined;
}

export function matchingInboxRoot(path: string, roots: readonly string[]): string | undefined {
  const normalizedPath = path.toLocaleLowerCase();
  return roots
    .map(normalizeVaultPath)
    .filter(Boolean)
    .filter((root) => normalizedPath.startsWith(`${root.toLocaleLowerCase()}/`))
    .sort((left, right) => right.length - left.length)[0];
}

function normalizeVaultPath(value: string): string {
  return String(value ?? "").trim().replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
}

function normalizeTitle(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim().slice(0, 240);
  }
  return "";
}

function frontmatterTagValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(frontmatterTagValues);
  if (typeof value !== "string") return [];
  return value.split(/[,;\n|\uFF0C\u3001\uFF1B]+/u);
}

function uniqueTags(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of values) {
    const tag = String(value).trim().replace(/^#+/u, "").toLocaleLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function safeIso(value: number | undefined): string {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp).toISOString()
    : new Date(0).toISOString();
}

function compareInboxItems(left: InboxItem, right: InboxItem): number {
  return right.updatedAt.localeCompare(left.updatedAt)
    || left.title.localeCompare(right.title)
    || left.filePath.localeCompare(right.filePath);
}

function cloneItem(item: InboxItem): InboxItem {
  return { ...item, tags: [...item.tags] };
}

function sameInboxMetadata(left: InboxItem, right: InboxItem): boolean {
  return left.id === right.id
    && left.kind === right.kind
    && left.source === right.source
    && left.matchedBy === right.matchedBy
    && left.status === right.status
    && left.title === right.title
    && left.filePath === right.filePath
    && left.sourceRoot === right.sourceRoot
    && left.project === right.project
    && left.folder === right.folder
    && left.tags.length === right.tags.length
    && left.tags.every((tag, index) => tag === right.tags[index]);
}

export { ROOT_GROUP as INBOX_ROOT_GROUP };
