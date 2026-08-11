import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

describe("plugin startup ordering", () => {
  it("defers Vault-backed startup reads until layout ready and restores the Task Pool before full indexing", () => {
    const layoutReady = main.indexOf("this.app.workspace.onLayoutReady(() => {");
    const checkpointLoad = main.indexOf("await this.navigationCheckpointService.load()", layoutReady);
    const earlyTaskPoolRefresh = main.indexOf("await this.refreshActiveTaskPoolCache(false)");
    const fullIndexRefresh = main.indexOf("await this.refreshIndex()", earlyTaskPoolRefresh);

    expect(layoutReady).toBeGreaterThan(-1);
    expect(checkpointLoad).toBeGreaterThan(layoutReady);
    expect(earlyTaskPoolRefresh).toBeGreaterThan(-1);
    expect(earlyTaskPoolRefresh).toBeGreaterThan(layoutReady);
    expect(fullIndexRefresh).toBeGreaterThan(earlyTaskPoolRefresh);
    expect(main).toContain("const workflowIndex = this.workflowIndex as WorkflowIndex | undefined;");
    expect(main).toContain("const inboxIndex = this.inboxIndex as InboxIndex | undefined;");
    expect(main).toContain("workflowIndex?.getPayload({ compact: true })");
    expect(main).toContain("inboxIndex?.getSnapshot().items ?? []");
  });
});
