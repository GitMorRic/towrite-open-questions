import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Workbench navigation resilience", () => {
  it("keeps all four top-level pages available without Workflow configuration", () => {
    const source = readFileSync("src/ui/DashboardView.svelte", "utf8");

    expect(source).toContain('switchTab("today")');
    expect(source).toContain('switchTab("pool")');
    expect(source).toContain('switchTab("status")');
    expect(source).toContain('switchTab("journal")');
    expect(source).toContain("grid-template-columns: repeat(4, 1fr)");
    expect(source).toContain("这不会影响“今日”“工作池”或“日志”");
  });

  it("does not let layout persistence failure interrupt page switching", () => {
    const dashboard = readFileSync("src/ui/DashboardView.svelte", "utf8");
    const views = readFileSync("src/obsidian/views.ts", "utf8");

    expect(dashboard).toContain("queueMicrotask(() =>");
    expect(views).toContain("requestSaveLayoutSafely");
    expect(views).not.toContain("this.app.workspace.requestSaveLayout();");
  });
});
