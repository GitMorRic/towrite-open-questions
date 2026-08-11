export type ToWriteWorkbenchTab = "today" | "pool" | "status" | "journal";

export function migrateWorkbenchTab(
  state: unknown,
  fallback: ToWriteWorkbenchTab = "today"
): ToWriteWorkbenchTab {
  if (!state || typeof state !== "object") return fallback;
  const value = state as { activeTab?: unknown; dailySurface?: unknown };
  if (value.activeTab === "status" || value.activeTab === "all") return "status";
  if (value.activeTab === "journal") return "journal";
  if (value.activeTab === "pool" || value.dailySurface === "pool") return "pool";
  if (value.activeTab === "today") return "today";
  return fallback;
}
