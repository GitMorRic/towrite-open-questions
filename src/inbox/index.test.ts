import type { App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import type { ToWriteInboxSettings } from "../core/settings";
import { INBOX_ROOT_GROUP, InboxIndex, filterInboxSnapshot } from "./index";

describe("InboxIndex", () => {
  it("indexes Markdown metadata recursively without reading note bodies", () => {
    const files = [
      file("00-Raw_Materials/Quick_Notes/index.md", 10),
      file("00-Raw_Materials/Quick_Notes/Project A/idea.md", 30),
      file("00-Raw_Materials/Quick_Notes2/not-inbox.md", 40),
      file("Elsewhere/no.md", 50)
    ];
    const app = fakeApp(files, new Map([
      [files[1], { frontmatter: { title: "Project idea", tags: ["capture"] }, tags: [{ tag: "#draft" }] }]
    ]));
    const index = new InboxIndex(app, () => settings());

    index.rebuild();
    const snapshot = index.getSnapshot();

    expect(snapshot.count).toBe(2);
    expect(snapshot.items.map((item) => item.title)).toEqual(["Project idea", "index"]);
    expect(snapshot.groups.map((group) => group.id)).toEqual([INBOX_ROOT_GROUP, "Project A"]);
    expect(snapshot.items[0].tags).toEqual(["draft", "capture"]);
    expect(app.vault.read).not.toHaveBeenCalled();
    expect(app.vault.cachedRead).not.toHaveBeenCalled();
  });

  it("uses the longest configured root and supports folder grouping", () => {
    const nested = file("Inbox/Quick/Project/Nested/note.md", 20);
    const app = fakeApp([nested]);
    const index = new InboxIndex(app, () => settings({
      folderPrefixes: ["Inbox", "Inbox/Quick"],
      groupBy: "folder"
    }));

    index.rebuild();
    const snapshot = index.getSnapshot();

    expect(snapshot.items[0]).toMatchObject({
      sourceRoot: "Inbox/Quick",
      project: "Project",
      folder: "Project/Nested"
    });
    expect(snapshot.groups[0].label).toBe("Project/Nested");
  });

  it("updates one item incrementally and never rescans on getSnapshot", () => {
    const first = file("00-Raw_Materials/Quick_Notes/first.md", 10);
    const second = file("00-Raw_Materials/Quick_Notes/second.md", 20);
    const app = fakeApp([first]);
    const index = new InboxIndex(app, () => settings({ maxItems: 10 }));
    index.rebuild();
    const scans = vi.mocked(app.vault.getMarkdownFiles).mock.calls.length;

    index.upsert(second);
    const snapshot = index.getSnapshot();
    expect(snapshot.items.map((item) => item.title)).toEqual(["second", "first"]);
    expect(index.getSnapshot()).toBe(snapshot);
    expect(app.vault.getMarkdownFiles).toHaveBeenCalledTimes(scans);

    index.remove(second.path);
    expect(index.getSnapshot().items.map((item) => item.title)).toEqual(["first"]);
  });

  it("keeps the local selection id stable when only frontmatter title changes", () => {
    const note = file("00-Raw_Materials/Quick_Notes/note.md", 10);
    const cache = { frontmatter: { title: "First title" } };
    const app = fakeApp([note], new Map([[note, cache]]));
    const index = new InboxIndex(app, () => settings());
    index.rebuild();
    const first = index.getSnapshot().items[0];

    cache.frontmatter.title = "Renamed title";
    note.stat.mtime = 20;
    index.upsert(note);
    const second = index.getSnapshot().items[0];

    expect(second.title).toBe("Renamed title");
    expect(second.id).toBe(first.id);
  });

  it("treats workflow_stage metadata as authoritative over watched folders", () => {
    const explicitAnywhere = file("Projects/Next/plan.md", 30);
    const processedInside = file("00-Raw_Materials/Quick_Notes/done.md", 20);
    const fallbackInside = file("00-Raw_Materials/Quick_Notes/new.md", 10);
    const caches = new Map([
      [explicitAnywhere, { frontmatter: { workflow_stage: "INBOX", project: "Next" } }],
      [processedInside, { frontmatter: { workflow_stage: "processing" } }]
    ]);
    const app = fakeApp([explicitAnywhere, processedInside, fallbackInside], caches);
    const index = new InboxIndex(app, () => settings());

    index.rebuild();
    const snapshot = index.getSnapshot();

    expect(snapshot.items.map((item) => item.filePath)).toEqual([
      "Projects/Next/plan.md",
      "00-Raw_Materials/Quick_Notes/new.md"
    ]);
    expect(snapshot.items[0]).toMatchObject({ matchedBy: "metadata", project: "Next", sourceRoot: "" });
    expect(snapshot.items[1]).toMatchObject({ matchedBy: "folder" });
  });

  it("moves a note in and out immediately when explicit metadata changes", () => {
    const note = file("Elsewhere/note.md", 10);
    const cache: { frontmatter: Record<string, unknown> } = { frontmatter: {} };
    const app = fakeApp([note], new Map([[note, cache]]));
    const index = new InboxIndex(app, () => settings());
    index.rebuild();
    expect(index.getSnapshot().count).toBe(0);

    cache.frontmatter.workflow_stage = "inbox";
    index.upsert(note);
    expect(index.getSnapshot().items[0]).toMatchObject({ filePath: note.path, matchedBy: "metadata" });

    cache.frontmatter.workflow_stage = "raw";
    index.upsert(note);
    expect(index.getSnapshot().count).toBe(0);
  });

  it("does not signal a sidebar refresh for timestamp-only metadata-cache updates", () => {
    const note = file("00-Raw_Materials/Quick_Notes/note.md", 10);
    const cache: { frontmatter: Record<string, unknown> } = { frontmatter: { title: "Note" } };
    const app = fakeApp([note], new Map([[note, cache]]));
    const index = new InboxIndex(app, () => settings());
    index.rebuild();

    note.stat.mtime = 20;
    expect(index.upsertFromMetadata(note)).toBe(false);

    cache.frontmatter.title = "Renamed";
    expect(index.upsertFromMetadata(note)).toBe(true);
    expect(index.getSnapshot().items[0].title).toBe("Renamed");
  });

  it("limits visible items and filters title, path, project, and tags", () => {
    const files = [
      file("Inbox/Alpha/one.md", 10),
      file("Inbox/Beta/two.md", 20),
      file("Inbox/Gamma/three.md", 30)
    ];
    const app = fakeApp(files, new Map([[files[1], { tags: [{ tag: "#important" }] }]]));
    const index = new InboxIndex(app, () => settings({ folderPrefixes: ["Inbox"], maxItems: 2 }));
    index.rebuild();

    const snapshot = index.getSnapshot();
    expect(snapshot).toMatchObject({ count: 3, visibleCount: 2, truncated: true });
    expect(index.getCandidateItems(3)).toHaveLength(3);
    expect(filterInboxSnapshot(snapshot, "important").items.map((item) => item.title)).toEqual(["two"]);
    expect(filterInboxSnapshot(snapshot, "gamma").items.map((item) => item.title)).toEqual(["three"]);
  });

  it("drops old descendants after a watched folder is renamed and rebuilt", () => {
    const files = [file("Inbox/Old Project/note.md", 10)];
    const app = fakeApp(files);
    const index = new InboxIndex(app, () => settings({ folderPrefixes: ["Inbox"] }));
    index.rebuild();
    expect(index.getSnapshot().items[0].project).toBe("Old Project");

    files.splice(0, 1, file("Inbox/New Project/note.md", 20));
    index.rebuild();

    expect(index.getSnapshot().items.map((item) => item.filePath)).toEqual(["Inbox/New Project/note.md"]);
    expect(index.getSnapshot().items[0].project).toBe("New Project");
  });
});

function settings(patch: Partial<ToWriteInboxSettings> = {}): ToWriteInboxSettings {
  return {
    enabled: true,
    folderPrefixes: ["00-Raw_Materials/Quick_Notes"],
    autoApplyStageOnCreate: false,
    groupBy: "project",
    maxItems: 200,
    includeInDeviceCandidates: true,
    ...patch
  };
}

function file(path: string, mtime: number): TFile {
  const basename = path.split("/").at(-1)?.replace(/\.md$/iu, "") ?? path;
  return {
    path,
    basename,
    extension: "md",
    stat: { ctime: mtime, mtime, size: 0 }
  } as TFile;
}

function fakeApp(
  files: TFile[],
  caches = new Map<TFile, { frontmatter?: Record<string, unknown>; tags?: Array<{ tag: string }> }>()
): App {
  return {
    vault: {
      getMarkdownFiles: vi.fn(() => files),
      read: vi.fn(),
      cachedRead: vi.fn()
    },
    metadataCache: {
      getFileCache: vi.fn((candidate: TFile) => caches.get(candidate) ?? null)
    }
  } as unknown as App;
}
