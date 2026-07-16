import { describe, expect, it } from "vitest";
import { TFile, type App } from "obsidian";
import { LocalKnowledgeIndex, tokenize, type LocalKnowledgeDocument } from "./local-index";
import type { OpenQuestion } from "../core/types";

const documents: LocalKnowledgeDocument[] = [
  {
    file: "hardware/ws2812-voltage.md",
    title: "WS2812 voltage drop notes",
    headings: ["Power", "Measurements"],
    tags: ["ws2812", "led", "voltage"],
    frontmatter: { status: "reference" },
    content: "Measured voltage drop across a 16 LED WS2812 ring at full white current."
  },
  {
    file: "writing/essay-outline.md",
    title: "Essay outline",
    headings: ["Draft"],
    tags: ["writing"],
    content: "This note is about article structure and narrative flow."
  }
];

describe("LocalKnowledgeIndex", () => {
  it("recalls related notes from title, tags, headings, and body text", () => {
    const index = new LocalKnowledgeIndex();
    index.replaceDocuments(documents);

    const results = index.query(makeQuestion("inbox/current.md", "Need WS2812 voltage drop measurements for a 16 LED ring."), 5);

    expect(results[0]).toMatchObject({
      file: "hardware/ws2812-voltage.md",
      title: "WS2812 voltage drop notes"
    });
    expect(results[0]?.snippet).toContain("16 LED WS2812");
  });

  it("does not recommend the source note back to itself", () => {
    const index = new LocalKnowledgeIndex();
    index.replaceDocuments(documents);

    const results = index.query(makeQuestion("hardware/ws2812-voltage.md", "WS2812 voltage drop"), 5);

    expect(results.map((item) => item.file)).not.toContain("hardware/ws2812-voltage.md");
  });

  it("upserts only the changed document without re-indexing unchanged documents", async () => {
    const indexedFiles: string[] = [];
    const index = new LocalKnowledgeIndex({
      onDocumentIndexed: (filePath) => indexedFiles.push(filePath)
    });
    index.replaceDocuments(documents);
    expect(indexedFiles).toEqual(documents.map((document) => document.file));

    indexedFiles.length = 0;
    const file = markdownFile("hardware/ws2812-voltage.md");
    await index.upsert(fakeApp(file, "Updated WS2812 current and thermal measurements."), file, "ToWrite");

    expect(indexedFiles).toEqual([file.path]);
    expect(index.size()).toBe(2);
    expect(index.queryText("thermal measurements", 5)[0]).toMatchObject({ file: file.path });
    expect(index.queryText("narrative flow", 5)[0]).toMatchObject({ file: "writing/essay-outline.md" });
  });

  it("removes a document without re-indexing the remaining documents", () => {
    const indexedFiles: string[] = [];
    const index = new LocalKnowledgeIndex({
      onDocumentIndexed: (filePath) => indexedFiles.push(filePath)
    });
    index.replaceDocuments(documents);
    indexedFiles.length = 0;

    index.remove("hardware/ws2812-voltage.md");

    expect(indexedFiles).toEqual([]);
    expect(index.size()).toBe(1);
    expect(index.getSnippet("hardware/ws2812-voltage.md")).toBeUndefined();
  });

  it("preserves a newer upsert that finishes during a full rebuild", async () => {
    const file = markdownFile("hardware/ws2812-voltage.md");
    let readCount = 0;
    let resolveOlderRead!: (content: string) => void;
    const app = {
      vault: {
        getMarkdownFiles: () => [file],
        cachedRead: async () => {
          readCount += 1;
          if (readCount === 1) {
            return new Promise<string>((resolve) => {
              resolveOlderRead = resolve;
            });
          }
          return "Newer thermal calibration record";
        }
      },
      metadataCache: {
        getFileCache: () => ({ headings: [], tags: [] })
      }
    } as unknown as App;
    const index = new LocalKnowledgeIndex();

    const rebuild = index.rebuild(app, "ToWrite");
    await Promise.resolve();
    const upsert = index.upsert(app, file, "ToWrite");
    await upsert;
    resolveOlderRead("Older voltage record");
    await rebuild;

    expect(index.queryText("thermal calibration", 5)[0]?.file).toBe(file.path);
    expect(index.queryText("older voltage", 5)).toEqual([]);
  });

  it("tokenizes latin words and Chinese bigrams", () => {
    const tokens = tokenize("\u9700\u8981\u8865\u5145 WS2812 \u538b\u964d\u5b9e\u6d4b");

    expect(tokens).toContain("ws2812");
    expect(tokens).toContain("\u538b\u964d");
    expect(tokens).toContain("\u5b9e\u6d4b");
  });
});

function markdownFile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  file.basename = path.split("/").pop()?.replace(/\.md$/u, "") ?? path;
  return file;
}

function fakeApp(file: TFile, content: string): App {
  return {
    vault: {
      cachedRead: async () => content
    },
    metadataCache: {
      getFileCache: () => ({
        frontmatter: { status: "reference" },
        headings: [{ heading: "Measurements" }],
        tags: [{ tag: "#ws2812" }]
      })
    }
  } as unknown as App;
}

function makeQuestion(file: string, question: string): OpenQuestion {
  return {
    id: "oq_test",
    lane: "think",
    status: "open",
    kind: "research",
    tags: [],
    color: "amber",
    question,
    source: {
      file,
      headingPath: ["Power"],
      lineStart: 1,
      lineEnd: 1,
      rule: "selection"
    }
  };
}
