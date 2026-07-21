import type { App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { applyInboxStageMetadata, materializeInboxStageMetadata } from "./metadata";

describe("Inbox metadata materialization", () => {
  it("adds workflow_stage: inbox only to watched notes without an explicit stage", async () => {
    const first = file("Inbox/first.md");
    const assigned = file("Inbox/assigned.md");
    const outside = file("Elsewhere/note.md");
    const frontmatter = new Map<TFile, Record<string, unknown>>([
      [first, { title: "First" }],
      [assigned, { workflow_stage: "processing" }],
      [outside, {}]
    ]);
    const app = fakeApp([first, assigned, outside], frontmatter);

    const result = await materializeInboxStageMetadata(app, {
      enabled: true,
      folderPrefixes: ["Inbox"]
    });

    expect(result).toEqual({
      updated: 1,
      alreadyExplicit: 1,
      outsideFolder: 1,
      updatedPaths: ["Inbox/first.md"]
    });
    expect(frontmatter.get(first)).toMatchObject({ title: "First", workflow_stage: "inbox" });
    expect(frontmatter.get(assigned)).toEqual({ workflow_stage: "processing" });
    expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
  });

  it("preserves a legacy explicit workflow_status", async () => {
    const note = file("Inbox/legacy.md");
    const frontmatter = new Map<TFile, Record<string, unknown>>([[note, { workflow_status: "raw" }]]);
    const app = fakeApp([note], frontmatter);

    await expect(applyInboxStageMetadata(app, note, {
      enabled: true,
      folderPrefixes: ["Inbox"]
    })).resolves.toBe("already-explicit");
    expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
  });
});

function file(path: string): TFile {
  return {
    path,
    basename: path.split("/").at(-1)?.replace(/\.md$/iu, "") ?? path,
    extension: "md"
  } as TFile;
}

function fakeApp(files: TFile[], frontmatter: Map<TFile, Record<string, unknown>>): App {
  return {
    vault: { getMarkdownFiles: vi.fn(() => files) },
    metadataCache: {
      getFileCache: vi.fn((candidate: TFile) => ({ frontmatter: frontmatter.get(candidate) ?? {} }))
    },
    fileManager: {
      processFrontMatter: vi.fn(async (candidate: TFile, update: (value: Record<string, unknown>) => void) => {
        const value = frontmatter.get(candidate) ?? {};
        update(value);
        frontmatter.set(candidate, value);
      })
    }
  } as unknown as App;
}
