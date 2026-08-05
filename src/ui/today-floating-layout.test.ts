import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  new URL("./TodayFloatingView.svelte", import.meta.url),
  "utf8"
);
const view = readFileSync(
  new URL("../obsidian/views.ts", import.meta.url),
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
    expect(component).toContain("openCurrentMessage");
    expect(component).toContain("dailyApi.openPlanningCandidate");
    expect(component).not.toContain("overview.upcoming");
    expect(component).toContain('role="progressbar"');
  });

  it("keeps the scrollable content and shortcut bar in separate layout rows", () => {
    expect(component).toContain('class="focus-content"');
    expect(component).toContain('class="focus-footer"');
    expect(component).not.toContain("<footer>");
    expect(component).toContain("grid-template-rows: auto auto minmax(0, 1fr) auto");
    expect(component).toContain('"modes"');
    expect(component).toContain('"messages"');
    expect(component).toContain('"content"');
    expect(component).toContain('"actions"');
    expect(component).toContain("overflow: hidden;");
    expect(component).toContain("scrollbar-gutter: stable;");
    expect(component).toContain("-webkit-app-region: no-drag");
    expect(component).toContain("@media (max-height: 500px)");
  });

  it("updates persisted pop-out state without destroying the clicked component", () => {
    expect(view).toContain('this.component?.$set({ initialPinned: pinned })');
    expect(view).not.toContain('leaf.on("pinned-change", (pinned) => {\n      this.pinned = pinned;\n      this.mount();');
    expect(view).toContain("initialMode: this.state.mode ?? \"focus\"");
    expect(component).not.toContain("syncedMode = value");
    expect(component).not.toContain("syncedPinned = pinned");
  });
});
