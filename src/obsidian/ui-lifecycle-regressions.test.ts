import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Obsidian UI lifecycle regressions", () => {
  it("removes stale ToWrite Ribbon elements before rebuilding enabled shortcuts", () => {
    const source = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
    const method = source.slice(
      source.indexOf("refreshRibbonIcons(): void"),
      source.indexOf("async exportNow", source.indexOf("refreshRibbonIcons(): void"))
    );

    expect(method).toContain('querySelectorAll<HTMLElement>("[data-towrite-ribbon]")');
    expect(method).toContain("element.dataset.towriteRibbon = descriptor.id");
  });

  it("keeps the complete Daily summary outside the sidebar shrink budget", () => {
    const source = readFileSync(new URL("../ui/DailySidebarSummary.svelte", import.meta.url), "utf8");
    expect(source).toMatch(/\.daily-sidebar-summary\s*\{[^}]*flex:\s*0 0 auto;/u);
    expect(source).toMatch(/\.current-task\s*\{[^}]*min-height:\s*40px;/u);
  });
});
