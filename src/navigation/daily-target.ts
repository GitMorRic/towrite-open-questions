import type {
  DailyMarkdownTarget,
  DailyPlanItem,
  DailyTargetResolution
} from "../daily";
import {
  NAVIGATION_TARGET_SCHEMA_VERSION,
  type NavigationTarget,
  type ObsidianNavigationLocation,
  type ObsidianNavigationTarget,
  type WebNavigationTarget
} from "./types";

export function navigationTargetForDailyItem(
  item: Pick<
    DailyPlanItem,
    "sourcePath" | "line" | "endLine" | "blockId" | "targetResolution"
  >,
  resolution: DailyTargetResolution
): NavigationTarget | undefined {
  if (resolution.webTarget) {
    return navigationTargetForWebTarget(resolution.webTarget);
  }
  if (resolution.target) {
    return navigationTargetForMarkdownTarget(resolution.target, item.sourcePath);
  }
  if (resolution.source === "task-block") {
    const sourcePath = resolution.sourcePath || item.sourcePath;
    const blockId = resolution.blockId || item.blockId;
    if (!sourcePath || !blockId) return undefined;
    return {
      schemaVersion: NAVIGATION_TARGET_SCHEMA_VERSION,
      provider: "obsidian",
      filePath: sourcePath,
      sourcePath: item.sourcePath,
      locations: [
        {
          kind: "block",
          blockId
        },
        {
          kind: "line",
          range: {
          start: Math.max(0, item.line - 1),
          end: Math.max(0, (item.endLine ?? item.line) - 1)
          }
        }
      ],
      label: resolution.displayLabel
    };
  }
  return undefined;
}

export function navigationTargetForWebTarget(
  target: NonNullable<DailyTargetResolution["webTarget"]>
): WebNavigationTarget {
  return {
    schemaVersion: NAVIGATION_TARGET_SCHEMA_VERSION,
    provider: "web",
    url: target.url,
    label: target.label
  };
}

export function navigationTargetForMarkdownTarget(
  target: DailyMarkdownTarget,
  sourcePath: string
): ObsidianNavigationTarget {
  return {
    schemaVersion: NAVIGATION_TARGET_SCHEMA_VERSION,
    provider: "obsidian",
    filePath: target.path,
    linkText: target.linkText,
    sourcePath,
    locations: markdownTargetLocation(target),
    label: target.label || target.linkText
  };
}

function markdownTargetLocation(
  target: DailyMarkdownTarget
): ObsidianNavigationLocation[] | undefined {
  if (target.blockId) {
    return [{ kind: "block", blockId: target.blockId }];
  }
  if (target.heading) {
    return [{ kind: "heading", heading: target.heading }];
  }
  return undefined;
}
