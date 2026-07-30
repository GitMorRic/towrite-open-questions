import { describe, expect, it } from "vitest";
import type { DailyPlanItem, DailyTargetResolution } from "../daily";
import {
  navigationTargetForDailyItem,
  navigationTargetForMarkdownTarget
} from "./daily-target";

describe("daily navigation targets", () => {
  it("preserves an exact heading or block from the resolved task target", () => {
    expect(navigationTargetForMarkdownTarget({
      kind: "wikilink",
      raw: "[[Echo MVP#Metrics]]",
      linkText: "Echo MVP",
      heading: "Metrics"
    }, "Daily/2026-07-27.md")).toMatchObject({
      provider: "obsidian",
      linkText: "Echo MVP",
      sourcePath: "Daily/2026-07-27.md",
      locations: [{ kind: "heading", heading: "Metrics" }]
    });

    expect(navigationTargetForMarkdownTarget({
      kind: "markdown",
      raw: "[source](../Projects/Echo.md#^decision)",
      linkText: "Projects/Echo.md",
      path: "Projects/Echo.md",
      blockId: "decision"
    }, "Daily/2026-07-27.md")).toMatchObject({
      filePath: "Projects/Echo.md",
      locations: [{ kind: "block", blockId: "decision" }]
    });
  });

  it("falls back to the frozen task block and a zero-based line range", () => {
    const resolution: DailyTargetResolution = {
      source: "task-block",
      sourcePath: "Daily/2026-07-27.md",
      blockId: "daily_abc123",
      displayLabel: "^daily_abc123",
      lineageRevision: "dlr_one"
    };
    const item = {
      sourcePath: "Daily/2026-07-27.md",
      line: 12,
      endLine: 14,
      blockId: "daily_abc123",
      targetResolution: resolution
    } as Pick<
      DailyPlanItem,
      "sourcePath" | "line" | "endLine" | "blockId" | "targetResolution"
    >;

    expect(navigationTargetForDailyItem(item, resolution)).toMatchObject({
      filePath: "Daily/2026-07-27.md",
      locations: [
        { kind: "block", blockId: "daily_abc123" },
        { kind: "line", range: { start: 11, end: 13 } }
      ]
    });
  });

  it("returns no executable target for the Dashboard fallback", () => {
    const resolution: DailyTargetResolution = {
      source: "dashboard",
      displayLabel: "ToWrite Today",
      lineageRevision: "dlr_empty"
    };
    expect(navigationTargetForDailyItem({
      sourcePath: "Daily/2026-07-27.md",
      line: 1,
      blockId: "daily_abc123",
      targetResolution: resolution
    }, resolution)).toBeUndefined();
  });

  it("converts an explicit web resolution without exposing a local path", () => {
    const resolution: DailyTargetResolution = {
      source: "explicit",
      webTarget: {
        kind: "web",
        raw: "https://example.com/read#resume",
        url: "https://example.com/read#resume",
        label: "example.com/read"
      },
      displayLabel: "example.com/read",
      lineageRevision: "dlr_web"
    };
    expect(navigationTargetForDailyItem({
      sourcePath: "Daily/2026-07-27.md",
      line: 2,
      blockId: "daily_web",
      targetResolution: resolution
    }, resolution)).toEqual({
      schemaVersion: 1,
      provider: "web",
      url: "https://example.com/read#resume",
      label: "example.com/read"
    });
  });
});
