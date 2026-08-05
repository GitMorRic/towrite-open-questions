import type { WorkPoolItem } from "./types";

export interface WorkPoolVisibilityRules {
  hiddenItemIds?: readonly string[];
  excludedSourcePaths?: readonly string[];
}

export function normalizeWorkPoolSourcePath(value: string): string {
  return value
    .trim()
    .replace(/\\/gu, "/")
    .replace(/^\/+|\/+$/gu, "")
    .replace(/\/{2,}/gu, "/");
}

export function isWorkPoolSourceExcluded(
  path: string | undefined,
  excludedSourcePaths: readonly string[]
): boolean {
  const normalized = path ? normalizeWorkPoolSourcePath(path).toLocaleLowerCase() : "";
  if (!normalized) return false;
  return excludedSourcePaths.some((candidate) => {
    const rule = normalizeWorkPoolSourcePath(candidate).toLocaleLowerCase();
    if (!rule) return false;
    return normalized === rule || normalized.startsWith(`${rule}/`);
  });
}

export function isWorkPoolItemVisible(
  item: WorkPoolItem,
  rules: WorkPoolVisibilityRules = {}
): boolean {
  const hidden = new Set((rules.hiddenItemIds ?? []).map((id) => id.trim()).filter(Boolean));
  if (hidden.has(item.id)) return false;
  return !isWorkPoolSourceExcluded(item.notePath, rules.excludedSourcePaths ?? []);
}
