import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  new URL("./TodayFloatingView.svelte", import.meta.url),
  "utf8"
);

describe("Today floating card", () => {
  it("separates Focus Now from the full Workbench and offers a compact list", () => {
    expect(component).not.toContain('class="surface-switcher"');
    expect(component).not.toContain("dailyApi.getWorkPool");
    expect(component).not.toContain("dailyApi.actOnWorkPoolItem");
    expect(component).toContain("onOpenTaskPool");
    expect(component).toContain("现在专注");
    expect(component).toContain("今日缩略");
    expect(component).toContain("compactItems");
    expect(component).toContain("focusMessages");
    expect(component).toContain("message-carousel");
    expect(component).not.toContain("overview.upcoming");
    expect(component).toContain('role="progressbar"');
  });

  it("keeps the scrollable content and shortcut bar in separate layout rows", () => {
    expect(component).toContain('class="focus-content"');
    expect(component).toContain('class="focus-footer"');
    expect(component).not.toContain("<footer>");
    expect(component).toContain("grid-template-rows: auto auto minmax(0, 1fr) auto");
    expect(component).toContain("overflow: hidden;");
    expect(component).toContain("scrollbar-gutter: stable;");
  });
});
