import type { DailyPlanItem, DailyTargetResolution } from "../daily";
import type { ObsidianNavigationLocation } from "./types";

export const NAVIGATION_CHECKPOINT_SCHEMA_VERSION = 1 as const;

export interface DailyNavigationCheckpoint {
  schemaVersion: typeof NAVIGATION_CHECKPOINT_SCHEMA_VERSION;
  taskId: string;
  targetKey: string;
  filePath: string;
  locations: ObsidianNavigationLocation[];
  capturedAt: string;
}

interface NavigationCheckpointDocument {
  schemaVersion: typeof NAVIGATION_CHECKPOINT_SCHEMA_VERSION;
  updatedAt: string;
  checkpoints: DailyNavigationCheckpoint[];
}

export interface NavigationCheckpointStorage {
  readText(): Promise<string | undefined>;
  writeText(content: string): Promise<void>;
}

/**
 * Local, content-minimal resume points. Checkpoints store a contextual anchor
 * and last-known line, but never a task body, device secret, or Hub reference.
 */
export class NavigationCheckpointService {
  private readonly checkpoints = new Map<string, DailyNavigationCheckpoint>();
  private loaded = false;

  constructor(
    private readonly storage: NavigationCheckpointStorage,
    private readonly maxEntries = 500
  ) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const raw = await this.storage.readText();
    if (!raw?.trim()) return;
    let parsed: Partial<NavigationCheckpointDocument>;
    try {
      parsed = JSON.parse(raw) as Partial<NavigationCheckpointDocument>;
    } catch {
      throw new Error("Navigation checkpoint data is not valid JSON.");
    }
    if (parsed.schemaVersion !== NAVIGATION_CHECKPOINT_SCHEMA_VERSION
      || !Array.isArray(parsed.checkpoints)) {
      return;
    }
    for (const value of parsed.checkpoints) {
      const checkpoint = normalizeCheckpoint(value);
      if (checkpoint) this.checkpoints.set(checkpoint.taskId, checkpoint);
    }
    this.trim();
  }

  get(taskId: string, targetKey: string): DailyNavigationCheckpoint | undefined {
    const value = this.checkpoints.get(taskId);
    if (!value || value.targetKey !== targetKey) return undefined;
    return cloneCheckpoint(value);
  }

  has(taskId: string, targetKey: string): boolean {
    return Boolean(this.get(taskId, targetKey));
  }

  async set(checkpoint: DailyNavigationCheckpoint): Promise<void> {
    await this.load();
    const normalized = normalizeCheckpoint(checkpoint);
    if (!normalized) throw new Error("Navigation checkpoint is invalid.");
    this.checkpoints.delete(normalized.taskId);
    this.checkpoints.set(normalized.taskId, normalized);
    this.trim();
    await this.persist();
  }

  async delete(taskId: string): Promise<void> {
    await this.load();
    if (!this.checkpoints.delete(taskId)) return;
    await this.persist();
  }

  private trim(): void {
    while (this.checkpoints.size > this.maxEntries) {
      const first = this.checkpoints.keys().next().value;
      if (!first) break;
      this.checkpoints.delete(first);
    }
  }

  private async persist(): Promise<void> {
    const document: NavigationCheckpointDocument = {
      schemaVersion: NAVIGATION_CHECKPOINT_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      checkpoints: [...this.checkpoints.values()].map(cloneCheckpoint)
    };
    await this.storage.writeText(`${JSON.stringify(document, null, 2)}\n`);
  }
}

export function dailyNavigationTargetKey(
  item: Pick<DailyPlanItem, "sourcePath" | "blockId">,
  resolution: DailyTargetResolution
): string {
  if (resolution.webTarget) return `web:${resolution.webTarget.url}`;
  if (resolution.target) {
    const target = resolution.target;
    return [
      "obsidian",
      target.path || target.linkText,
      target.heading ? `#${target.heading}` : "",
      target.blockId ? `#^${target.blockId}` : ""
    ].join(":");
  }
  if (resolution.source === "task-block") {
    return `obsidian:${resolution.sourcePath || item.sourcePath}:#^${resolution.blockId || item.blockId || ""}`;
  }
  return `dashboard:${item.sourcePath}`;
}

function normalizeCheckpoint(value: unknown): DailyNavigationCheckpoint | undefined {
  const source = value as Partial<DailyNavigationCheckpoint> | null;
  if (!source
    || source.schemaVersion !== NAVIGATION_CHECKPOINT_SCHEMA_VERSION
    || typeof source.taskId !== "string"
    || !source.taskId.trim()
    || typeof source.targetKey !== "string"
    || !source.targetKey.trim()
    || typeof source.filePath !== "string"
    || !source.filePath.trim()
    || typeof source.capturedAt !== "string"
    || Number.isNaN(Date.parse(source.capturedAt))
    || !Array.isArray(source.locations)) {
    return undefined;
  }
  const locations = source.locations
    .map(normalizeLocation)
    .filter((location): location is ObsidianNavigationLocation => Boolean(location));
  if (!locations.length) return undefined;
  return {
    schemaVersion: NAVIGATION_CHECKPOINT_SCHEMA_VERSION,
    taskId: source.taskId.slice(0, 180),
    targetKey: source.targetKey.slice(0, 700),
    filePath: source.filePath.slice(0, 700),
    locations,
    capturedAt: new Date(source.capturedAt).toISOString()
  };
}

function normalizeLocation(value: unknown): ObsidianNavigationLocation | undefined {
  const source = value as Partial<ObsidianNavigationLocation> | null;
  if (!source || typeof source.kind !== "string") return undefined;
  if (source.kind === "line") {
    const range = source.range;
    if (!range || !Number.isFinite(range.start)) return undefined;
    return {
      kind: "line",
      range: {
        start: Math.max(0, Math.floor(range.start)),
        end: Number.isFinite(range.end)
          ? Math.max(0, Math.floor(range.end as number))
          : undefined
      }
    };
  }
  if (source.kind === "text") {
    const anchor = source.anchor;
    if (!anchor
      || !Number.isFinite(anchor.startOffset)
      || !Number.isFinite(anchor.endOffset)
      || typeof anchor.selectedText !== "string"
      || typeof anchor.before !== "string"
      || typeof anchor.after !== "string") {
      return undefined;
    }
    return {
      kind: "text",
      anchor: {
        startOffset: Math.max(0, Math.floor(anchor.startOffset)),
        endOffset: Math.max(0, Math.floor(anchor.endOffset)),
        selectedText: anchor.selectedText.slice(0, 2_000),
        before: anchor.before.slice(-160),
        after: anchor.after.slice(0, 160)
      }
    };
  }
  if (source.kind === "block" && typeof source.blockId === "string" && source.blockId.trim()) {
    return { kind: "block", blockId: source.blockId.slice(0, 180) };
  }
  if (source.kind === "heading" && typeof source.heading === "string" && source.heading.trim()) {
    return { kind: "heading", heading: source.heading.slice(0, 500) };
  }
  if (source.kind === "pdf-page" && Number.isFinite(source.page) && (source.page ?? 0) > 0) {
    return { kind: "pdf-page", page: Math.floor(source.page as number) };
  }
  return undefined;
}

function cloneCheckpoint(value: DailyNavigationCheckpoint): DailyNavigationCheckpoint {
  return {
    ...value,
    locations: value.locations.map((location) => JSON.parse(JSON.stringify(location)) as ObsidianNavigationLocation)
  };
}
