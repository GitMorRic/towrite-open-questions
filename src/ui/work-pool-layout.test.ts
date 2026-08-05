import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync(new URL("./WorkPoolPanel.svelte", import.meta.url), "utf8");
const floating = readFileSync(new URL("./TodayFloatingView.svelte", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("./DashboardView.svelte", import.meta.url), "utf8");

describe("single Workbench and configurable Work Pool", () => {
  it("offers native sources, saved two-level grouping, and progressive loading", () => {
    for (const source of ["all", "task", "tothink", "towrite", "inbox", "note"]) {
      expect(panel).toContain(`id: "${source}"`);
    }
    for (const dimension of ["workType", "project", "source", "stage", "articleType", "note", "status", "category"]) {
      expect(panel).toContain(`id: "${dimension}"`);
    }
    expect(panel).toContain("groupWorkPoolItemsBy(");
    expect(panel).toContain("viewPrimary");
    expect(panel).toContain("viewSecondary");
    expect(panel).toContain("visibleLimit += settings.pageSize");
    expect(panel).toContain('class:pool-board={activeView?.layout === "board"}');
    expect(panel).toContain('bind:value={viewLayout}');
    expect(panel).toContain("overflow-x:auto");
    expect(panel).toContain("projectAppearances");
    expect(panel).toContain("beginProjectAppearance");
    expect(panel).toContain("project-style-dialog");
    expect(panel).toContain("@media (max-width:760px)");
  });

  it("keeps native source actions explicit and task creation pool-first", () => {
    expect(panel).toContain('"complete-task"');
    expect(panel).toContain('"change-question-status"');
    expect(panel).toContain('"change-stage"');
    expect(panel).toContain('draftSchedule: "pool" | "today" | "tomorrow" = "pool"');
    expect(panel).toContain("createPoolTask");
    expect(panel).toContain("showTechnicalMetadata");
    expect(panel).toContain("syncMarkdownTasks");
    expect(panel).toContain("隐藏此条");
    expect(panel).toContain("不整理此来源");
    expect(panel).toContain("隐藏与不整理名单");
  });

  it("uses one three-tab Workbench and keeps the floating card compact", () => {
    expect(dashboard).toContain("ToWriteWorkbenchTab");
    expect(dashboard).toContain('<WorkPoolPanel');
    expect(dashboard).toContain("ToWrite 工作台");
    expect(floating).toContain("onOpenTaskPool");
    expect(floating).not.toContain("dailyApi.actOnWorkPoolItem");
    expect(floating).not.toContain("getWorkPool");
  });
});
