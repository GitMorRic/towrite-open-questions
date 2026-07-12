import { TFile, type App, type TAbstractFile } from "obsidian";
import { describe, expect, it } from "vitest";
import { captureContentRevision, captureFolderRevision, MISSING_TARGET_REVISION } from "./revision";
import { CaptureConflictError, CaptureService } from "./service";
import {
  CAPTURE_SCHEMA_VERSION,
  type CaptureDraft,
  type CaptureTargetCandidate
} from "./types";

describe("CaptureService", () => {
  it("creates an idempotent capture note with capture_id and safely undoes it", async () => {
    const vault = new FakeVault();
    const changes: string[] = [];
    const service = new CaptureService(fakeApp(vault), {
      defaultTags: ["capture"],
      now: () => new Date("2026-07-12T03:00:00.000Z"),
      onVaultChanged: (path, operation) => { changes.push(`${operation}:${path}`); }
    });
    const target = folderCandidate("Ideas");

    const preview = await service.preview(draft(), target);
    const first = await service.commit({ draft: draft(), candidate: target, targetRevision: preview.targetRevision });
    const second = await service.commit({ draft: draft(), candidate: target, targetRevision: preview.targetRevision });

    expect(first.idempotent).toBe(false);
    expect(second).toMatchObject({ idempotent: true, finalPath: first.finalPath });
    expect(vault.getMarkdownFiles()).toHaveLength(1);
    expect(vault.content(first.finalPath)).toContain('capture_id: "capture-test-1"');
    expect(vault.content(first.finalPath)).toContain("# A captured idea");
    expect(first.undoToken).toBeTruthy();

    const undone = await service.undo(first.undoToken!);

    expect(undone.undone).toBe(true);
    expect(vault.getFileByPath(first.finalPath)).toBeNull();
    expect(changes).toEqual([`commit:${first.finalPath}`, `undo:${first.finalPath}`]);
  });

  it("rejects an append when the note changed after preview", async () => {
    const vault = new FakeVault({ "Projects/Launch.md": "# Launch\n\nOriginal\n" });
    const service = new CaptureService(fakeApp(vault));
    const target = appendCandidate("Projects/Launch.md", captureContentRevision(vault.content("Projects/Launch.md")));
    const preview = await service.preview(draft(), target);
    await vault.modify(vault.getFileByPath("Projects/Launch.md")!, "# Launch\n\nChanged elsewhere\n");

    await expect(service.commit({ draft: draft(), candidate: target, targetRevision: preview.targetRevision }))
      .rejects.toMatchObject({ code: "target-changed" });
    expect(vault.content("Projects/Launch.md")).not.toContain("towrite-capture:start");
  });

  it("appends once, treats retries as idempotent, and undo preserves unrelated edits", async () => {
    const vault = new FakeVault({ "Projects/Launch.md": "# Launch\n\nOriginal\n" });
    const service = new CaptureService(fakeApp(vault), { now: () => new Date("2026-07-12T03:00:00.000Z") });
    const target = appendCandidate("Projects/Launch.md", captureContentRevision(vault.content("Projects/Launch.md")));
    const preview = await service.preview(draft(), target);

    const first = await service.commit({ draft: draft(), candidate: target, targetRevision: preview.targetRevision });
    const retry = await service.commit({ draft: draft(), candidate: target, targetRevision: preview.targetRevision });
    const afterRetry = vault.content("Projects/Launch.md");

    expect(first.idempotent).toBe(false);
    expect(retry.idempotent).toBe(true);
    expect(afterRetry.match(/towrite-capture:start/gu)).toHaveLength(1);
    expect(afterRetry).toContain("## Captures");

    await vault.modify(vault.getFileByPath("Projects/Launch.md")!, `${afterRetry}\nUnrelated later edit.\n`);
    const undone = await service.undo(first.undoToken!);

    expect(undone.undone).toBe(true);
    expect(vault.content("Projects/Launch.md")).toContain("Unrelated later edit.");
    expect(vault.content("Projects/Launch.md")).not.toContain("towrite-capture:start");
  });

  it("refuses undo when an appended block or created note was edited", async () => {
    const appendVault = new FakeVault({ "Note.md": "# Note\n" });
    const appendService = new CaptureService(fakeApp(appendVault));
    const appendTarget = appendCandidate("Note.md", captureContentRevision(appendVault.content("Note.md")));
    const appendResult = await appendService.commit({ draft: draft(), candidate: appendTarget });
    await appendVault.modify(
      appendVault.getFileByPath("Note.md")!,
      appendVault.content("Note.md").replace("Remember this detail", "Edited captured detail")
    );

    await expect(appendService.undo(appendResult.undoToken!)).rejects.toMatchObject({ code: "undo-conflict" });

    const createVault = new FakeVault();
    const createService = new CaptureService(fakeApp(createVault));
    const createResult = await createService.commit({ draft: draft({ id: "capture-test-2" }), candidate: folderCandidate("Ideas") });
    await createVault.modify(
      createVault.getFileByPath(createResult.finalPath)!,
      `${createVault.content(createResult.finalPath)}\nUser edit\n`
    );

    await expect(createService.undo(createResult.undoToken!)).rejects.toBeInstanceOf(CaptureConflictError);
    expect(createVault.getFileByPath(createResult.finalPath)).not.toBeNull();
  });

  it("checks the capture id before mutating an undo target", async () => {
    const vault = new FakeVault({ "Note.md": "# Note\n" });
    const service = new CaptureService(fakeApp(vault));
    const target = appendCandidate("Note.md", captureContentRevision(vault.content("Note.md")));
    const result = await service.commit({ draft: draft(), candidate: target });

    await expect(service.undo(result.undoToken!, "different-capture"))
      .rejects.toMatchObject({ code: "capture-id-mismatch" });
    expect(vault.content("Note.md")).toContain("towrite-capture:start");
  });

  it("creates a missing Inbox append target without reporting an idempotent first write", async () => {
    const vault = new FakeVault();
    const service = new CaptureService(fakeApp(vault));
    const target = appendCandidate("Inbox/Captures.md", MISSING_TARGET_REVISION, "inbox");

    const result = await service.commit({ draft: draft(), candidate: target });

    expect(result.idempotent).toBe(false);
    expect(vault.content("Inbox/Captures.md")).toContain("towrite-capture:start");
  });
});

class FakeVault {
  private readonly files = new Map<string, { file: TFile; content: string }>();
  private readonly folders = new Map<string, TAbstractFile>();

  constructor(initial: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initial)) {
      this.seedFile(path, content);
    }
  }

  getName(): string {
    return "Test Vault";
  }

  getFileByPath(path: string): TFile | null {
    return this.files.get(path)?.file ?? null;
  }

  getAbstractFileByPath(path: string): TAbstractFile | null {
    return this.getFileByPath(path) ?? this.folders.get(path) ?? null;
  }

  getMarkdownFiles(): TFile[] {
    return Array.from(this.files.values()).map((entry) => entry.file);
  }

  async read(file: TFile): Promise<string> {
    const entry = this.files.get(file.path);
    if (!entry) throw new Error(`Missing file ${file.path}`);
    return entry.content;
  }

  async cachedRead(file: TFile): Promise<string> {
    return this.read(file);
  }

  async create(path: string, content: string): Promise<TFile> {
    if (this.getAbstractFileByPath(path)) throw new Error(`Already exists: ${path}`);
    return this.seedFile(path, content);
  }

  async createFolder(path: string): Promise<TAbstractFile> {
    if (this.getAbstractFileByPath(path)) throw new Error(`Already exists: ${path}`);
    const folder = { path, name: path.split("/").pop() ?? path, parent: null, children: [] } as unknown as TAbstractFile;
    this.folders.set(path, folder);
    return folder;
  }

  async process(file: TFile, update: (content: string) => string): Promise<string> {
    const content = await this.read(file);
    const next = update(content);
    await this.modify(file, next);
    return next;
  }

  async modify(file: TFile, content: string): Promise<void> {
    const entry = this.files.get(file.path);
    if (!entry) throw new Error(`Missing file ${file.path}`);
    entry.content = content;
    Object.assign(entry.file, { stat: { ctime: 1, mtime: Date.now(), size: content.length } });
  }

  async delete(file: TAbstractFile): Promise<void> {
    this.files.delete(file.path);
    this.folders.delete(file.path);
  }

  content(path: string): string {
    const entry = this.files.get(path);
    if (!entry) throw new Error(`Missing file ${path}`);
    return entry.content;
  }

  private seedFile(path: string, content: string): TFile {
    const file = new TFile();
    file.path = path;
    file.basename = path.split("/").pop()?.replace(/\.md$/u, "") ?? path;
    Object.assign(file, {
      name: `${file.basename}.md`,
      stat: { ctime: 1, mtime: 1, size: content.length }
    });
    this.files.set(path, { file, content });
    const parts = path.split("/").slice(0, -1);
    let folder = "";
    for (const part of parts) {
      folder = folder ? `${folder}/${part}` : part;
      if (!this.folders.has(folder)) {
        this.folders.set(folder, { path: folder, name: part, parent: null, children: [] } as unknown as TAbstractFile);
      }
    }
    return file;
  }
}

function fakeApp(vault: FakeVault): App {
  return { vault } as unknown as App;
}

function draft(patch: Partial<CaptureDraft> = {}): CaptureDraft {
  return {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    id: "capture-test-1",
    intent: "new",
    title: "A captured idea",
    body: "Remember this detail",
    tags: ["idea"],
    links: ["https://example.com"],
    source: { file: "Projects/Source.md", headingPath: ["Context"] },
    createdAt: "2026-07-12T03:00:00.000Z",
    ...patch
  };
}

function folderCandidate(path: string): CaptureTargetCandidate {
  return {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    id: "folder-target",
    kind: "folder",
    action: "create",
    path,
    reason: "Configured folder",
    confidence: "medium",
    score: 5,
    targetRevision: captureFolderRevision(path)
  };
}

function appendCandidate(path: string, revision: string, kind: "existingNote" | "inbox" = "existingNote"): CaptureTargetCandidate {
  return {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    id: `${kind}-target`,
    kind,
    action: "append",
    path,
    heading: "Captures",
    reason: "Related note",
    confidence: "strong",
    score: 10,
    targetRevision: revision
  };
}
