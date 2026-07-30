import type { OpenQuestion } from "../core/types";
import {
  NAVIGATION_TARGET_SCHEMA_VERSION,
  type ObsidianNavigationLocation,
  type ObsidianNavigationTarget
} from "./types";

/** Builds local-only, ordered anchors for a Markdown or PDF question card. */
export function navigationTargetForQuestion(
  question: Pick<OpenQuestion, "source" | "anchor" | "title">
): ObsidianNavigationTarget {
  const locations: ObsidianNavigationLocation[] = [];
  if (question.source.page && question.source.file.toLowerCase().endsWith(".pdf")) {
    locations.push({ kind: "pdf-page", page: question.source.page });
  } else {
    if (question.source.blockId) {
      locations.push({
        kind: "block",
        blockId: question.source.blockId
      });
    }
    if (question.anchor && !question.anchor.orphaned) {
      locations.push({
        kind: "text",
        anchor: {
          startOffset: question.anchor.startOffset,
          endOffset: question.anchor.endOffset,
          selectedText: question.anchor.selectedText,
          before: question.anchor.before,
          after: question.anchor.after
        }
      });
    }
    locations.push({
      kind: "line",
      range: {
        start: Math.max(0, question.source.lineStart),
        end: Math.max(0, question.source.lineEnd)
      }
    });
  }
  return {
    schemaVersion: NAVIGATION_TARGET_SCHEMA_VERSION,
    provider: "obsidian",
    filePath: question.source.file,
    sourcePath: question.source.file,
    locations,
    label: question.title
  };
}
