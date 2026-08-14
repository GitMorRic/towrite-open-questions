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
    expect(component).not.toMatch(/class="plan-item"[\s\S]{0,240}--task-depth:/u);
    expect(component).toMatch(/\.check-button\s*\{[^}]*width:\s*34px;[^}]*height:\s*34px;[^}]*place-items:\s*center;/su);
  });

  it("groups carry-over work by date and project with preview and open actions", () => {
    const component = readFileSync(new URL("./DailyDashboardPanel.svelte", import.meta.url), "utf8");
    const plugin = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
    expect(component).toContain("previousMigrationGroups");
    expect(component).toContain('<details class="previous-date-group" open>');
    expect(component).toContain('class="previous-date-chevron"');
    expect(component).toContain("on:click|stopPropagation");
    expect(component).toContain('class="previous-project-group"');
    expect(component).toContain('class="previous-task-preview"');
    expect(component).toContain("打开这天的日记");
    expect(component).toContain("打开任务目标");
    expect(component).toContain("togglePreviousGroup(dateItems)");
    expect(component).toContain("indeterminate={dateSelected > 0 && dateSelected < dateItems.length}");
    expect(component).toContain("合并完全重复项");
    expect(component).toContain("migrationFeedbackError");
    expect(component).toContain("正在迁移 ${selectedPreviousIds.size} 项");
    expect(component).toContain("buildDailyMigrationPreview");
    expect(component).toContain('class="migration-result-preview"');
    expect(component).toContain("合并后预览");
    expect(component).toContain("previousMigrationPreview.consolidatedSourceCount");
    expect(component).toMatch(/\.migration-result-preview\s*\{[^}]*position:\s*sticky;/su);
    expect(component).toContain("groupDailyMigrationPreviewUnits");
    expect(component).toContain('class="migration-preview-tree"');
    expect(component).toContain('class="migration-preview-group"');
    expect(component).toContain('class="migration-preview-children"');
    expect(component).toContain("在此类型内向上移动");
    expect(component).toContain('class="migration-preview-confirm"');
    expect(component).toContain("确认迁移 ${selectedPreviousIds.size} 项");
    expect(component).toContain('on:click={migrateSelectedPrevious}');
    expect(component).toContain('class="migration-preview-feedback"');
    expect(component).toContain("migrationPreviewTextDrafts");
    expect(component).toContain("dailyMigrationMergeUnitKey");
    expect(component).toContain("destinationTextByUnit");
    expect(component).toContain('draggable="true"');
    expect(component).toContain("moveMigrationPreviewUnit(unitKey, -1)");
    expect(component).toContain("编辑迁移后的标题");
    const sourcePreflight = plugin.indexOf("this.dailyPlanService.validateMigrationSource(");
    const migrationWrites = plugin.indexOf("const migrations: DailyTaskMigration[]", sourcePreflight);
    expect(sourcePreflight).toBeGreaterThan(-1);
    expect(migrationWrites).toBeGreaterThan(sourcePreflight);
  });

  it("uses left click and hover for project details while reserving right click for color", () => {
    const component = readFileSync(new URL("./DailyDashboardPanel.svelte", import.meta.url), "utf8");
    expect(component).toContain("toggleProgressProjectDetails(segment, event)");
    expect(component).toContain("showProgressProjectDetails(segment)");
    expect(component).toContain("hideProgressProjectDetails(segment)");
    expect(component).toContain('class="project-progress-details"');
    expect(component).toContain("右键设置颜色");
    expect(component).toContain('event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")');
    expect(component).toContain("on:keydown={(event) => handleProgressProjectKeydown(segment, event)}");
    expect(component).toContain("{#if pinnedProgressProjectId === inspectedProgressProject.id}");
    expect(component).toContain(">设置颜色</button>");
    expect(component).toContain("projectColorInput?.focus()");
    expect(component).not.toContain("on:click={(event) => beginProgressProjectColor(segment, event)}");
  });

  it("closes a pinned project immediately and keeps the empty progress range valid", () => {
    const component = readFileSync(new URL("./DailyDashboardPanel.svelte", import.meta.url), "utf8");
    expect(component).toContain("const wasPinned = pinnedProgressProjectId === segment.id");
    expect(component).toContain('hoveredProgressProjectId = wasPinned ? "" : segment.id');
    expect(component).toContain("aria-valuemax={Math.max(1, overview.total)}");
  });

  it("keys historical migration selections by date, id, and revision", () => {
    const component = readFileSync(new URL("./DailyDashboardPanel.svelte", import.meta.url), "utf8");
    expect(component).toContain("dailyMigrationSelectionKey(item)");
    expect(component).not.toContain("previous.map((item) => item.id)");
  });
});
