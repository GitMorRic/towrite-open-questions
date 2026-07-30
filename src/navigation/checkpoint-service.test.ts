import { describe, expect, it } from "vitest";
import type { DailyPlanItem, DailyTargetResolution } from "../daily";
import {
  NAVIGATION_CHECKPOINT_SCHEMA_VERSION,
  NavigationCheckpointService,
  dailyNavigationTargetKey
} from "./checkpoint-service";

function memoryStorage(initial?: string) {
  let content = initial;
  return {
    readText: async () => content,
    writeText: async (value: string) => {
      content = value;
    },
    value: () => content
  };
}

describe("NavigationCheckpointService", () => {
  it("persists and reloads a content-minimal text and line checkpoint", async () => {
    const storage = memoryStorage();
    const service = new NavigationCheckpointService(storage);
    await service.set({
      schemaVersion: NAVIGATION_CHECKPOINT_SCHEMA_VERSION,
      taskId: "daily_echo",
      targetKey: "obsidian:Projects/Echo.md::",
      filePath: "Projects/Echo.md",
      capturedAt: "2026-07-27T10:00:00.000Z",
      locations: [
        {
          kind: "text",
          anchor: {
            startOffset: 10,
            endOffset: 22,
            selectedText: "reading line",
            before: "before ",
            after: " after"
          }
        },
        { kind: "line", range: { start: 3, end: 3 } }
      ]
    });

    expect(storage.value()).not.toContain("task body");
    const restored = new NavigationCheckpointService(storage);
    await restored.load();
    expect(restored.get("daily_echo", "obsidian:Projects/Echo.md::")).toMatchObject({
      filePath: "Projects/Echo.md",
      locations: [{ kind: "text" }, { kind: "line" }]
    });
  });

  it("does not reuse a checkpoint after the resolved target changes", async () => {
    const storage = memoryStorage();
    const service = new NavigationCheckpointService(storage);
    await service.set({
      schemaVersion: NAVIGATION_CHECKPOINT_SCHEMA_VERSION,
      taskId: "daily_echo",
      targetKey: "obsidian:Projects/Echo.md::",
      filePath: "Projects/Echo.md",
      capturedAt: "2026-07-27T10:00:00.000Z",
      locations: [{ kind: "line", range: { start: 3 } }]
    });
    expect(service.has("daily_echo", "obsidian:Projects/Other.md::")).toBe(false);
  });

  it("keys web, exact note and source-block targets independently", () => {
    const item = {
      sourcePath: "Daily/2026-07-27.md",
      blockId: "daily_echo"
    } as Pick<DailyPlanItem, "sourcePath" | "blockId">;
    expect(dailyNavigationTargetKey(item, {
      source: "explicit",
      webTarget: {
        kind: "web",
        raw: "https://example.com/read",
        url: "https://example.com/read",
        label: "example.com/read"
      },
      displayLabel: "example.com/read",
      lineageRevision: "dlr"
    })).toBe("web:https://example.com/read");
    expect(dailyNavigationTargetKey(item, {
      source: "task-link",
      target: {
        kind: "wikilink",
        raw: "[[Echo#Part]]",
        linkText: "Echo",
        heading: "Part"
      },
      displayLabel: "Echo",
      lineageRevision: "dlr"
    })).toBe("obsidian:Echo:#Part:");
    expect(dailyNavigationTargetKey(item, {
      source: "task-block",
      sourcePath: item.sourcePath,
      blockId: item.blockId,
      displayLabel: "^daily_echo",
      lineageRevision: "dlr"
    } as DailyTargetResolution)).toBe("obsidian:Daily/2026-07-27.md:#^daily_echo");
  });
});
