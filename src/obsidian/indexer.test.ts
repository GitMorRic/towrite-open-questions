import type { App, TFile } from "obsidian";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../core/settings";
import { OpenQuestionStore } from "../core/store";
import { OpenQuestionIndexer } from "./indexer";

describe("OpenQuestionIndexer", () => {
  it("publishes a full Vault rebuild with one store notification", async () => {
    const files = [fakeFile("first.md"), fakeFile("second.md")];
    const contents = new Map([
      ["first.md", "?? First question"],
      ["second.md", "?? Second question"]
    ]);
    const store = new OpenQuestionStore();
    store.replaceFileSnapshot("removed.md", [], []);
    let notifications = 0;
    store.subscribe(() => notifications += 1);
    const indexer = new OpenQuestionIndexer(fakeApp(files, contents), store, () => DEFAULT_SETTINGS);

    await indexer.rebuildVault();

    expect(notifications).toBe(1);
    expect(store.getQuestionsForFile("first.md")).toHaveLength(1);
    expect(store.getQuestionsForFile("second.md")).toHaveLength(1);
    expect(store.getQuestionsForFile("removed.md")).toEqual([]);
  });

  it("publishes a single-file parse with one store notification", async () => {
    const file = fakeFile("note.md");
    const store = new OpenQuestionStore();
    let notifications = 0;
    store.subscribe(() => notifications += 1);
    const indexer = new OpenQuestionIndexer(
      fakeApp([file], new Map([[file.path, "?? A question"]])),
      store,
      () => DEFAULT_SETTINGS
    );

    await indexer.indexFile(file);

    expect(notifications).toBe(1);
    expect(store.getQuestionsForFile(file.path)).toHaveLength(1);
  });

  it("does not publish a partial snapshot when a Vault read fails", async () => {
    const files = [fakeFile("ok.md"), fakeFile("broken.md")];
    const store = new OpenQuestionStore();
    const previous = fakeQuestionContent("Previous question");
    const previousFile = fakeFile("previous.md");
    const initialIndexer = new OpenQuestionIndexer(
      fakeApp([previousFile], new Map([[previousFile.path, previous]])),
      store,
      () => DEFAULT_SETTINGS
    );
    await initialIndexer.rebuildVault();
    let notifications = 0;
    store.subscribe(() => notifications += 1);
    const app = {
      vault: {
        getMarkdownFiles: () => files,
        cachedRead: async (file: TFile) => {
          if (file.path === "broken.md") {
            throw new Error("read failed");
          }
          return fakeQuestionContent("New question");
        }
      }
    } as unknown as App;
    const indexer = new OpenQuestionIndexer(app, store, () => DEFAULT_SETTINGS);

    await expect(indexer.rebuildVault()).rejects.toThrow("read failed");

    expect(notifications).toBe(0);
    expect(store.getQuestionsForFile("previous.md")).toHaveLength(1);
    expect(store.getQuestionsForFile("ok.md")).toEqual([]);
  });

  it("replays a newer file index after an in-flight full rebuild", async () => {
    const file = fakeFile("note.md");
    const store = new OpenQuestionStore();
    let resolveInitialRead!: (content: string) => void;
    let readCount = 0;
    const app = {
      vault: {
        getMarkdownFiles: () => [file],
        cachedRead: async () => {
          readCount += 1;
          if (readCount === 1) {
            return new Promise<string>((resolve) => {
              resolveInitialRead = resolve;
            });
          }
          return "?? Newer question";
        }
      }
    } as unknown as App;
    const indexer = new OpenQuestionIndexer(app, store, () => DEFAULT_SETTINGS);

    const rebuild = indexer.rebuildVault(false);
    await Promise.resolve();
    const incremental = indexer.indexFile(file, false);
    resolveInitialRead("?? Older question");
    await Promise.all([rebuild, incremental]);

    expect(store.getQuestionsForFile(file.path).map((question) => question.question)).toEqual(["Newer question"]);
    expect(readCount).toBe(2);
  });
});

function fakeApp(files: TFile[], contents: Map<string, string>): App {
  return {
    vault: {
      getMarkdownFiles: () => files,
      cachedRead: async (file: TFile) => contents.get(file.path) ?? ""
    }
  } as unknown as App;
}

function fakeFile(path: string): TFile {
  return { path } as TFile;
}

function fakeQuestionContent(question: string): string {
  return `?? ${question}`;
}
