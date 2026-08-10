import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard viewport layout", () => {
  it("keeps task menus mutually exclusive and hides them while editing", () => {
    const component = readFileSync(new URL("./DailyDashboardPanel.svelte", import.meta.url), "utf8");
    expect(component).toContain("handleItemMenuToggle(item.id, event, true)");
    expect(component).toContain("handleItemMenuToggle(item.id, event)");
    expect(component).toContain("editingItemId !== item.id");
    expect(component).toContain("closeItemPopovers(event?.currentTarget)");
  });

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
    expect(component).toContain("beginProgressProjectColor");
    expect(component).toContain('class="project-color-popover"');
    expect(component).toContain("右键设置项目颜色");
  });

  it("keeps normalization diagnostics and task utilities out of the default reading flow", () => {
    const component = readFileSync(new URL("./DailyDashboardPanel.svelte", import.meta.url), "utf8");
    expect(component).toContain('class="normalization-technical-details"');
    expect(component).toContain("查看识别结果与 Markdown 变更");
    expect(component).toContain('class="item-more item-timing"');
    expect(component).toContain('class="menu-field"');
    expect(component).not.toContain('class="policy-select"');
    expect(component).not.toContain('class="timing-panel"');
  });

  it("renders daily tasks as compact title and summary rows", () => {
    const component = readFileSync(new URL("./DailyDashboardPanel.svelte", import.meta.url), "utf8");
    expect(component).toContain('class="item-title-line"');
    expect(component).toContain('class="item-summary-line"');
    expect(component).toContain("compactTaskText(item.text)");
    expect(component).toContain("userFacingTargetLabel(item)");
    expect(component).not.toContain('<span class="resolved-target"><Target size={11} />{targetDisplayLabel(item)}</span>');
    expect(component).toMatch(/\.plan-item\s*\{[^}]*align-items:\s*center;[^}]*padding:\s*6px 4px;/su);
  });
});
