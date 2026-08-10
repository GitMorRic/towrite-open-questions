import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");

describe("editor input performance contract", () => {
  it("keeps editor-change free of Vault, parsing, indexing, and network work", () => {
    const marker = 'this.app.workspace.on("editor-change"';
    const start = mainSource.indexOf(marker);
    expect(start).toBeGreaterThanOrEqual(0);
    const handler = mainSource.slice(start, start + 500);

    expect(handler).toContain("this.lastEditorActivityAt = Date.now()");
    expect(handler).toContain("notifyActiveContext()");
    expect(handler).not.toMatch(/refreshActiveNoteTaskCache|syncMarkdownTasksForFile|vault\.|fetch\(|refreshIndex/u);
  });

  it("uses non-recursive, idle-debounced synchronization for edited Markdown", () => {
    expect(mainSource).toContain(
      "syncMarkdownTasksForFile(path, new Set<string>(), taskSourceAllowlist, false)"
    );
    expect(mainSource).toContain("}, 2_200, true);");
  });
});
