import type { App, TFile } from "obsidian";
import type { ToWriteInboxSettings } from "../core/settings";
import { WORKFLOW_STAGE_PROPERTY, readExplicitWorkflowStage } from "../core/workflow-metadata";
import { matchingInboxRoot } from "./index";

export type InboxMetadataApplyResult = "updated" | "already-explicit" | "outside-folder" | "not-markdown";

export interface InboxMetadataBatchResult {
  updated: number;
  alreadyExplicit: number;
  outsideFolder: number;
  updatedPaths: string[];
}

/**
 * Materialize the folder fallback as visible Obsidian Properties metadata.
 * Existing workflow assignments are never overwritten.
 */
export async function applyInboxStageMetadata(
  app: App,
  file: TFile,
  settings: Pick<ToWriteInboxSettings, "enabled" | "folderPrefixes">
): Promise<InboxMetadataApplyResult> {
  if (!settings.enabled || file.extension.toLocaleLowerCase() !== "md") return "not-markdown";
  if (!matchingInboxRoot(file.path, settings.folderPrefixes)) return "outside-folder";
  const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
  if (readExplicitWorkflowStage(frontmatter && typeof frontmatter === "object"
    ? frontmatter as Record<string, unknown>
    : undefined)) {
    return "already-explicit";
  }

  let updated = false;
  await app.fileManager.processFrontMatter(file, (next) => {
    if (readExplicitWorkflowStage(next)) return;
    next[WORKFLOW_STAGE_PROPERTY] = "inbox";
    updated = true;
  });
  return updated ? "updated" : "already-explicit";
}

export async function materializeInboxStageMetadata(
  app: App,
  settings: Pick<ToWriteInboxSettings, "enabled" | "folderPrefixes">,
  files = app.vault.getMarkdownFiles()
): Promise<InboxMetadataBatchResult> {
  const result: InboxMetadataBatchResult = { updated: 0, alreadyExplicit: 0, outsideFolder: 0, updatedPaths: [] };
  for (const file of files) {
    const status = await applyInboxStageMetadata(app, file, settings);
    if (status === "updated") {
      result.updated += 1;
      result.updatedPaths.push(file.path);
    }
    else if (status === "already-explicit") result.alreadyExplicit += 1;
    else if (status === "outside-folder") result.outsideFolder += 1;
  }
  return result;
}
