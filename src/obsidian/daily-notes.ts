import type { App } from "obsidian";

export interface ObsidianDailyNotesConfiguration {
  enabled: boolean;
  folder: string;
  format: string;
  template: string;
}

export interface ToWriteDailyNotePreference {
  source: "obsidian" | "custom";
  folder: string;
  format: string;
}

/** Reads the core Daily Notes plugin without taking a dependency on its private classes. */
export function readObsidianDailyNotesConfiguration(app: App): ObsidianDailyNotesConfiguration {
  const internal = app as unknown as {
    internalPlugins?: {
      getPluginById?(id: string): unknown;
      plugins?: Record<string, unknown>;
    };
  };
  const registry = internal.internalPlugins;
  const plugin = registry?.getPluginById?.("daily-notes")
    ?? registry?.plugins?.["daily-notes"];
  const record = asRecord(plugin);
  const instance = asRecord(record.instance);
  const options = asRecord(instance.options ?? record.options);
  return {
    enabled: record.enabled !== false && Boolean(plugin),
    folder: normalizeFolder(options.folder),
    format: normalizeFormat(options.format),
    template: normalizeTemplate(options.template)
  };
}

/**
 * Older ToWrite builds persisted the placeholder `Daily/YYYY-MM-DD` as a
 * custom source even when the user was already using Obsidian Daily Notes.
 * Treat that untouched placeholder as migration state, while preserving any
 * genuinely customised ToWrite path.
 */
export function shouldUseObsidianDailyNotes(
  preference: ToWriteDailyNotePreference,
  core: ObsidianDailyNotesConfiguration
): boolean {
  if (!core.enabled) return false;
  if (preference.source === "obsidian") return true;
  return normalizeFolder(preference.folder) === "Daily"
    && normalizeFormat(preference.format) === "YYYY-MM-DD";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function normalizeFolder(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\\/gu, "/")
    .replace(/^\/+|\/+$/gu, "");
}

function normalizeFormat(value: unknown): string {
  const format = String(value ?? "YYYY-MM-DD").trim().replace(/\.md$/iu, "");
  return format && !/[\\/:*?"<>|]/u.test(format) ? format : "YYYY-MM-DD";
}

function normalizeTemplate(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\\/gu, "/")
    .replace(/^\/+|\/+$/gu, "")
    .replace(/\.md$/iu, "");
}
