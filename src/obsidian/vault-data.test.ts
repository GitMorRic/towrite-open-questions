import type { App, Stat } from "obsidian";
import { describe, expect, it } from "vitest";
import { writeVaultDataText } from "./vault-data";

describe("writeVaultDataText", () => {
  it("writes into an adapter-visible dot directory that is absent from the Vault index", async () => {
    const entries = new Map<string, { type: "file" | "folder"; content?: string }>([
      [".obsidian-open-questions", { type: "folder" }]
    ]);
    const app = fakeApp(entries);

    await writeVaultDataText(
      app,
      ".obsidian-open-questions/capture-targets.json",
      "{\"schemaVersion\":1}\n"
    );

    expect(entries.get(".obsidian-open-questions/capture-targets.json")).toEqual({
      type: "file",
      content: "{\"schemaVersion\":1}\n"
    });
  });

  it("creates nested adapter directories for learning exports", async () => {
    const entries = new Map<string, { type: "file" | "folder"; content?: string }>();
    const app = fakeApp(entries);

    await writeVaultDataText(app, ".obsidian-open-questions/learning/events.jsonl", "");

    expect(entries.get(".obsidian-open-questions")?.type).toBe("folder");
    expect(entries.get(".obsidian-open-questions/learning")?.type).toBe("folder");
    expect(entries.get(".obsidian-open-questions/learning/events.jsonl")?.type).toBe("file");
  });
});

function fakeApp(entries: Map<string, { type: "file" | "folder"; content?: string }>): App {
  return {
    vault: {
      adapter: {
        stat: async (path: string) => {
          const entry = entries.get(path);
          return entry ? { type: entry.type } as Stat : null;
        },
        mkdir: async (path: string) => {
          entries.set(path, { type: "folder" });
        },
        write: async (path: string, content: string) => {
          entries.set(path, { type: "file", content });
        }
      }
    }
  } as unknown as App;
}
