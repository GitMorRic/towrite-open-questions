import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

describe("plugin startup ordering", () => {
  it("does not require Workflow or Inbox indexes while restoring the Task Pool", () => {
    const earlyTaskPoolRefresh = main.indexOf("await this.refreshActiveTaskPoolCache(false)");
    const workflowInitialization = main.indexOf("this.workflowIndex = new WorkflowIndex(");

    expect(earlyTaskPoolRefresh).toBeGreaterThan(-1);
    expect(workflowInitialization).toBeGreaterThan(earlyTaskPoolRefresh);
    expect(main).toContain("const workflowIndex = this.workflowIndex as WorkflowIndex | undefined;");
    expect(main).toContain("const inboxIndex = this.inboxIndex as InboxIndex | undefined;");
    expect(main).toContain("workflowIndex?.getPayload({ compact: true })");
    expect(main).toContain("inboxIndex?.getSnapshot().items ?? []");
  });
});
