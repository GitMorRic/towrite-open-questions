import { MarkdownView, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { resolveQuestionAnchor } from "../core/anchor";
import {
  NAVIGATION_TARGET_SCHEMA_VERSION,
  type ObsidianNavigationTarget
} from "../navigation";
import { ObsidianNavigationAdapter } from "./open-target";

function fixture(content = "# Echo\n\nBody\n") {
  const file = Object.assign(Object.create(TFile.prototype) as TFile, {
    path: "Projects/Echo.md",
    basename: "Echo",
    extension: "md"
  });
  const editor = {
    lineCount: vi.fn(() => content.split(/\r?\n/u).length),
    getLine: vi.fn((line: number) => content.split(/\r?\n/u)[line] ?? ""),
    setCursor: vi.fn(),
    scrollIntoView: vi.fn()
  };
  const view = Object.assign(Object.create(MarkdownView.prototype) as MarkdownView, {
    editor,
    containerEl: { querySelector: () => null }
  });
  const leaf = {
    view,
    openFile: vi.fn(async () => undefined)
  };
  const app = {
    vault: {
      getFileByPath: vi.fn((path: string) => path === file.path ? file : null),
      cachedRead: vi.fn(async () => content)
    },
    metadataCache: {
      getFirstLinkpathDest: vi.fn(() => file),
      getFileCache: vi.fn(() => ({ headings: [] }))
    },
    workspace: {
      getLeaf: vi.fn(() => leaf),
      setActiveLeaf: vi.fn()
    }
  };
  return { app, file, leaf, view, editor };
}

function target(
  patch: Partial<ObsidianNavigationTarget> = {}
): ObsidianNavigationTarget {
  return {
    schemaVersion: NAVIGATION_TARGET_SCHEMA_VERSION,
    provider: "obsidian",
    filePath: "Projects/Echo.md",
    sourcePath: "Daily/2026-07-27.md",
    ...patch
  };
}

describe("ObsidianNavigationAdapter", () => {
  it("validates and opens an exact block in the target leaf", async () => {
    const { app, leaf, editor } = fixture();
    const adapter = new ObsidianNavigationAdapter(app as never, {
      focusWindow: () => true,
      resolveSubpath: (_cache, subpath) => subpath === "#^decision"
        ? {
            start: { line: 2, col: 0, offset: 8 },
            end: { line: 2, col: 4, offset: 12 }
          }
        : null
    });
    const result = await adapter.open(target({
      locations: [{ kind: "block", blockId: "decision" }]
    }), {
      eventId: "evt_primary_single",
      displayedValidated: true
    });

    expect(result).toMatchObject({
      status: "opened",
      exact: true,
      focused: true
    });
    expect(leaf.openFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "Projects/Echo.md" }),
      expect.objectContaining({
        active: true,
        eState: { subpath: "#^decision" }
      })
    );
    expect(editor.setCursor).toHaveBeenCalledWith({ line: 2, ch: 0 });
  });

  it("does not silently open the top of a note when a heading is gone", async () => {
    const { app, leaf } = fixture();
    const adapter = new ObsidianNavigationAdapter(app as never, {
      focusWindow: () => true,
      resolveSubpath: () => null
    });
    await expect(adapter.open(target({
      locations: [{ kind: "heading", heading: "Missing" }]
    }), {
      displayedValidated: true
    })).resolves.toMatchObject({
      status: "not-found",
      exact: false
    });
    expect(leaf.openFile).not.toHaveBeenCalled();
  });

  it("uses a revision-checked line fallback when a Daily block cache is not ready", async () => {
    const { app, editor } = fixture("# Plan\n\n- [ ] Task ^daily_echo\n");
    const adapter = new ObsidianNavigationAdapter(app as never, {
      focusWindow: () => true,
      resolveSubpath: () => null
    });
    await expect(adapter.open(target({
      locations: [
        { kind: "block", blockId: "daily_echo" },
        { kind: "line", range: { start: 2, end: 2 } }
      ]
    }), {
      eventId: "evt_displayed_revision_checked",
      displayedValidated: true
    })).resolves.toMatchObject({
      status: "opened",
      exact: true
    });
    expect(editor.setCursor).toHaveBeenCalledWith({ line: 2, ch: 0 });
  });

  it("relocates a moved text anchor before using its last-known line", async () => {
    const content = "intro\nnew line\nbefore selected text after\nend";
    const anchor = {
      startOffset: 0,
      endOffset: 13,
      selectedText: "selected text",
      before: "before ",
      after: " after"
    };
    expect(resolveQuestionAnchor(content, anchor)).toMatchObject({
      startOffset: content.indexOf("selected text"),
      orphaned: false
    });
    const { app, editor } = fixture(content);
    const adapter = new ObsidianNavigationAdapter(app as never, {
      focusWindow: () => false
    });
    const result = await adapter.open(target({
      locations: [
        {
          kind: "text",
          anchor
        },
        { kind: "line", range: { start: 99 } }
      ]
    }), {
      displayedValidated: true
    });

    expect(result).toMatchObject({
      status: "opened",
      exact: true,
      focused: false
    });
    expect(editor.setCursor).toHaveBeenCalledWith({ line: 2, ch: 0 });
  });
});
