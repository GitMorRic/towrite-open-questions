/** Canonical frontmatter property used to place a note in a workflow stage. */
export const WORKFLOW_STAGE_PROPERTY = "workflow_stage";

/** Legacy property written by earlier ToWrite releases. */
export const LEGACY_WORKFLOW_STAGE_PROPERTY = "workflow_status";

/**
 * Read the explicitly assigned workflow stage from note frontmatter.
 *
 * `workflow_stage` is authoritative. `workflow_status` is read only when the
 * canonical property has no usable value so existing notes remain compatible.
 * Returned IDs are trimmed but otherwise preserved; callers should compare IDs
 * case-insensitively.
 */
export function readExplicitWorkflowStage(frontmatter?: Record<string, unknown>): string | undefined {
  if (!frontmatter) {
    return undefined;
  }

  return readStageValue(frontmatter[WORKFLOW_STAGE_PROPERTY])
    ?? readStageValue(frontmatter[LEGACY_WORKFLOW_STAGE_PROPERTY]);
}

/** Normalize a workflow stage ID for comparisons without changing stored data. */
export function normalizeWorkflowStageId(value: string): string {
  return value.trim().toLowerCase();
}

function readStageValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) {
        return item.trim();
      }
    }
  }
  return undefined;
}
