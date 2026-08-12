import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("settings definition layout", () => {
  it("turns Obsidian's horizontal SettingDefinition host into one vertical surface", () => {
    const source = readFileSync(new URL("./settings-tab.ts", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    expect(source).toContain('setting.settingEl.addClass("towrite-settings-definition")');
    expect(styles).toContain(".setting-item.towrite-settings-definition.towrite-settings");
    expect(styles).toContain("display: block !important");
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr)");
  });
});
