import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

describe("plugin startup ordering", () => {
  it("keeps full-Vault work and data migration writes out of plugin onload", () => {
    const onloadStart = main.indexOf("async onload(): Promise<void> {");
    const layoutReady = main.indexOf("this.app.workspace.onLayoutReady(() => {", onloadStart);
    const onloadBody = main.slice(onloadStart, layoutReady);
    const layoutReadyBody = main.slice(layoutReady, main.indexOf("onunload(): void", layoutReady));

    expect(onloadStart).toBeGreaterThan(-1);
    expect(layoutReady).toBeGreaterThan(onloadStart);
    expect(onloadBody).not.toContain("this.rebuildMarkdownTaskNoteSuggestions();");
    expect(onloadBody).not.toContain("await this.refreshIndex();");
    expect(layoutReadyBody).toContain("void this.restoreStartupCaches()");
    expect(layoutReadyBody).toContain("this.scheduleStartupReconciliation();");
    expect(layoutReadyBody).toContain("ToWrite could not persist the deferred security migration");
    expect(main).not.toContain([
      "if (this.securityMigrationVersion < 1) {",
      "      this.securityMigrationVersion = 1;",
      "      await this.savePluginData();",
      "    }"
    ].join("\n"));
    expect(main).not.toContain("}, 1_200);");
  });

  it("restores small caches before an idle full index and delayed Markdown reconciliation", () => {
    const restore = main.indexOf("private async restoreStartupCaches(): Promise<void>");
    const taskPool = main.indexOf("await this.runStartupStep(\"Task Pool cache\"", restore);
    const daily = main.indexOf("await this.runStartupStep(\"Daily plan cache\"", restore);
    const ready = main.indexOf("this.startupCachesReady = true", restore);
    const schedule = main.indexOf("private scheduleStartupReconciliation", ready);
    const idle = main.indexOf("requestIdleCallback", schedule);
    const fullIndex = main.indexOf("await this.refreshIndex()", idle);
    const markdownSchedule = main.indexOf("this.scheduleStartupMarkdownReconciliation()", fullIndex);

    expect(restore).toBeGreaterThan(-1);
    expect(taskPool).toBeGreaterThan(restore);
    expect(daily).toBeGreaterThan(taskPool);
    expect(ready).toBeGreaterThan(daily);
    expect(idle).toBeGreaterThan(schedule);
    expect(fullIndex).toBeGreaterThan(idle);
    expect(markdownSchedule).toBeGreaterThan(fullIndex);
    expect(main).toContain("if (this.indexRefreshPromise) return this.indexRefreshPromise;");
    expect(main).toContain("if (this.markdownTaskSyncPromise) return this.markdownTaskSyncPromise;");
    expect(main).toContain("this.enqueueFullVaultMaintenance(() => this.runFullIndexRefresh())");
    expect(main).toContain("this.enqueueFullVaultMaintenance(() => this.runMarkdownTaskSync())");
    expect(main).toContain("if (Date.now() - this.lastEditorActivityAt < 5_000)");
    expect(main).toContain("getWorkPool: async (query) => this.getCachedWorkPoolSnapshot(query)");
  });
});
