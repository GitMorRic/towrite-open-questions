import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard viewport layout", () => {
  it("keeps the full workspace vertically scrollable in compact Obsidian windows", () => {
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.towrite-dashboard\s*\{[^}]*overflow-y:\s*auto;/su);
    expect(css).not.toMatch(/\.towrite-sidebar,\s*\.towrite-dashboard\s*\{[^}]*overflow:\s*hidden;/su);
  });

  it("stacks task-pool lifecycle sections at the compact breakpoint", () => {
    const component = readFileSync(new URL("./DailyDashboardPanel.svelte", import.meta.url), "utf8");
    expect(component).toMatch(/@media \(max-width: 860px\)[\s\S]*?\.pool-grid\s*\{\s*grid-template-columns:\s*1fr;/u);
  });

  it("shows project-weighted progress and the real three-page 2.7 inch preview", () => {
    const component = readFileSync(new URL("./DailyDashboardPanel.svelte", import.meta.url), "utf8");
    expect(component).toContain("project-progress-battery");
    expect(component).toContain("--project-weight:${segment.items.length}");
    expect(component).toContain('previewExpanded = workspaceMode');
    expect(component).toContain("2.7″ 墨水屏预览");
    expect(component).toContain('previewPage === "overview"');
    expect(component).toContain('previewPage === "item"');
    expect(component).toContain('previewPage === "inbox"');
    expect(component).toContain("deck.overview.batteryPercent");
    expect(component).toContain("eink-project-stats");
  });
});
