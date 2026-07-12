import { TFile, type App } from "obsidian";
import { describe, expect, it } from "vitest";
import { captureContentRevision } from "./revision";
import { CaptureTargetRecommender } from "./recommender";
import { CAPTURE_SCHEMA_VERSION, type CaptureDraft, type CaptureRecommendationSettings } from "./types";

describe("CaptureTargetRecommender", () => {
  it("returns a deterministic existing-note, workflow-folder, and Inbox trio", async () => {
    const app = fakeRecommendationApp([
      note("Projects/Launch.md", "# Launch", { tags: ["launch", "processing"] }),
      note("Reference/Other.md", "# Other", { tags: ["reference"] }),
      note("00-Raw/Device Inbox.md", "# Inbox")
    ]);
    const settings: CaptureRecommendationSettings = {
      inboxFile: "00-Raw/Device Inbox.md",
      targetFolders: ["00-Raw"],
      appendHeading: "Captures",
      settingsRevision: "7",
      workflowStages: [
        {
          id: "processing",
          title: "Processing",
          folderPrefixes: ["02-Processing"],
          tags: ["processing", "next"]
        }
      ]
    };
    const localIndex = {
      query: () => [
        { file: "Projects/Launch.md", title: "Launch", headings: [], tags: ["launch"], snippet: "", score: 12 }
      ]
    };
    const recommender = new CaptureTargetRecommender(app, settings, localIndex);

    const first = await recommender.recommend(draft({ tags: ["launch", "processing"] }));
    const second = await recommender.recommend(draft({ tags: ["launch", "processing"] }));

    expect(first).toEqual(second);
    expect(first.candidates.map((candidate) => [candidate.kind, candidate.action])).toEqual([
      ["existingNote", "append"],
      ["folder", "create"],
      ["inbox", "append"]
    ]);
    expect(first.candidates[0]).toMatchObject({
      path: "Projects/Launch.md",
      confidence: "strong",
      targetRevision: captureContentRevision("# Launch")
    });
    expect(first.candidates[1]).toMatchObject({ path: "02-Processing", stageId: "processing" });
    expect(first.candidates[2]).toMatchObject({ path: "00-Raw/Device Inbox.md" });
    expect(first.selectedCandidateId).toBe(first.candidates[0]?.id);
    expect(new Set(first.candidates.map((candidate) => candidate.id)).size).toBe(3);
    expect(first.candidates.every((candidate) => candidate.reason.length > 0 && candidate.targetRevision.length > 0)).toBe(true);
  });

  it("applies privacy scope before using local-index scores", async () => {
    const app = fakeRecommendationApp([
      note("Allowed/Public.md", "# Public launch", { tags: ["launch"] }),
      note("Allowed/NoAI.md", "# Secret launch", { tags: ["no-ai"] }),
      note("Allowed/Private.md", "# Private launch", { private: true, tags: ["launch"] }),
      note("Outside/Highly Relevant.md", "# Launch launch launch", { tags: ["launch"] })
    ]);
    const recommender = new CaptureTargetRecommender(app, {
      inboxFile: "Inbox.md",
      targetFolders: ["Allowed"],
      includeFolders: ["Allowed"],
      excludeFolders: ["Allowed/Excluded"],
      excludeTags: ["no-ai"],
      excludeFrontmatter: ["private"]
    }, {
      query: () => [
        { file: "Outside/Highly Relevant.md", title: "Outside", headings: [], tags: [], snippet: "", score: 999 },
        { file: "Allowed/Private.md", title: "Private", headings: [], tags: [], snippet: "", score: 998 }
      ]
    });

    const result = await recommender.recommend(draft());

    expect(result.candidates[0]?.path).toBe("Allowed/Public.md");
  });

  it("preselects Inbox when the existing-note recommendation is weak", async () => {
    const app = fakeRecommendationApp([note("Unrelated.md", "# Apples")]);
    const result = await new CaptureTargetRecommender(app, {
      inboxFile: "Inbox.md",
      targetFolders: ["Ideas"]
    }).recommend(draft({ body: "Quantum networking notes" }));

    expect(result.candidates[0]?.confidence).toBe("weak");
    expect(result.selectedCandidateId).toBe(result.candidates[2]?.id);
  });

  it("preselects a confident workflow folder when the existing note is weak", async () => {
    const app = fakeRecommendationApp([note("Unrelated.md", "# Apples")]);
    const result = await new CaptureTargetRecommender(app, {
      inboxFile: "Inbox.md",
      targetFolders: ["Ideas"],
      workflowStages: [{
        id: "processing",
        title: "Processing",
        folderPrefixes: ["02-Processing"],
        tags: ["processing"]
      }]
    }).recommend(draft({ body: "Continue the draft", tags: ["processing"] }));

    expect(result.candidates[0]?.confidence).toBe("weak");
    expect(result.candidates[1]?.confidence).not.toBe("weak");
    expect(result.selectedCandidateId).toBe(result.candidates[1]?.id);
  });

  it("lets an explicitly confirmed routing habit improve later ranking", async () => {
    const app = fakeRecommendationApp([note("Unrelated.md", "# Apples")]);
    const settings: CaptureRecommendationSettings = {
      inboxFile: "Inbox.md",
      targetFolders: ["Ideas"]
    };
    const recommender = new CaptureTargetRecommender(app, settings);
    const baseline = await recommender.recommend(draft({
      body: "Quantum networking notes",
      source: { entryPoint: "sidebar" }
    }));
    const folder = baseline.candidates.find((candidate) => candidate.kind === "folder")!;

    recommender.updateSettings({
      ...settings,
      confirmedRoutes: [{ targetId: folder.id, context: { entryPoint: "sidebar" } }]
    });
    const learned = await recommender.recommend(draft({
      body: "Another unrelated thought",
      source: { entryPoint: "sidebar" }
    }));

    expect(learned.candidates[0]).toMatchObject({ id: folder.id, confidence: "strong" });
    expect(learned.candidates[0]?.reason).toContain("previously confirmed");
    expect(learned.selectedCandidateId).toBe(folder.id);
  });

  it("uses source links and structured note context without requiring body matches", async () => {
    const app = fakeRecommendationApp([
      note("Projects/Linked.md", "# Linked", { type: "essay", tags: ["processing"] }),
      note("Reference/Other.md", "# Other")
    ]);
    (app.metadataCache.resolvedLinks as Record<string, Record<string, number>>) = {
      "Projects/Source.md": { "Projects/Linked.md": 1 }
    };
    const result = await new CaptureTargetRecommender(app, {
      inboxFile: "Inbox.md",
      targetFolders: ["Ideas"],
      workflowStages: [{
        id: "processing",
        title: "Processing",
        folderPrefixes: ["Projects"],
        tags: ["processing"]
      }]
    }).recommend(draft({
      body: "Unrelated words",
      source: {
        file: "Projects/Source.md",
        articleTypeId: "essay",
        workflowStageId: "processing"
      }
    }));

    expect(result.candidates[0]).toMatchObject({ path: "Projects/Linked.md", confidence: "strong" });
    expect(result.candidates[0]?.reason).toContain("links");
  });
});

interface NoteFixture {
  file: TFile;
  content: string;
  frontmatter?: Record<string, unknown>;
}

function note(path: string, content: string, frontmatter?: Record<string, unknown>): NoteFixture {
  const file = new TFile();
  file.path = path;
  file.basename = path.split("/").pop()?.replace(/\.md$/u, "") ?? path;
  Object.assign(file, { stat: { ctime: 1, mtime: 1, size: content.length }, name: `${file.basename}.md` });
  return { file, content, frontmatter };
}

function fakeRecommendationApp(notes: NoteFixture[]): App {
  const byPath = new Map(notes.map((item) => [item.file.path, item]));
  return {
    vault: {
      getMarkdownFiles: () => notes.map((item) => item.file),
      getFileByPath: (path: string) => byPath.get(path)?.file ?? null,
      cachedRead: async (file: TFile) => byPath.get(file.path)?.content ?? ""
    },
    metadataCache: {
      getFileCache: (file: TFile) => {
        const frontmatter = byPath.get(file.path)?.frontmatter;
        const tags = Array.isArray(frontmatter?.tags)
          ? frontmatter.tags.map((tag) => ({ tag: `#${String(tag)}` }))
          : [];
        return { frontmatter, tags, headings: [] };
      }
    }
  } as unknown as App;
}

function draft(patch: Partial<CaptureDraft> = {}): CaptureDraft {
  return {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    id: "capture-test-1",
    intent: "new",
    body: "Launch processing notes",
    title: "Launch note",
    tags: ["launch"],
    links: [],
    ...patch
  };
}
