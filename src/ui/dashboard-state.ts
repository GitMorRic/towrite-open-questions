import type {
  ArticleSummary,
  OpenQuestion,
  OpenQuestionStatus,
  QuestionStatusOption
} from "../core/types";
import type { WorkflowIndexPayload } from "../workflow";

export interface WorkflowStatusColumn {
  id: OpenQuestionStatus;
  label: string;
}

export interface WorkflowMatrixRow {
  id: string;
  title: string;
  notes: number;
  statuses: Record<string, number>;
  think: number;
  write: number;
  stale: number;
}

/**
 * Preserve the configured status order, then append statuses already present
 * in the Vault so custom/legacy states are never silently folded into `open`.
 */
export function buildWorkflowStatusColumns(
  options: readonly QuestionStatusOption[],
  questions: readonly OpenQuestion[]
): WorkflowStatusColumn[] {
  const columns: WorkflowStatusColumn[] = [];
  const seen = new Set<string>();
  const append = (id: OpenQuestionStatus, label: string): void => {
    const normalized = String(id).trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    columns.push({ id, label: label.trim() || normalized });
  };
  for (const option of options) append(option.id, option.label);
  for (const question of questions) append(question.status, String(question.status));
  return columns;
}

export function buildWorkflowMatrix(
  payload: WorkflowIndexPayload,
  articleSummaries: readonly ArticleSummary[],
  questions: readonly OpenQuestion[],
  statusColumns: readonly WorkflowStatusColumn[]
): WorkflowMatrixRow[] {
  const stageByFile = new Map<string, string>();
  for (const file of payload.files ?? []) {
    if (file.stageId) stageByFile.set(file.filePath, file.stageId);
  }
  for (const summary of articleSummaries) {
    if (summary.stageId && !stageByFile.has(summary.filePath)) {
      stageByFile.set(summary.filePath, summary.stageId);
    }
  }

  const statusIds = statusColumns.map((column) => String(column.id));
  const rows = new Map<string, WorkflowMatrixRow>();
  for (const stage of payload.stages) {
    rows.set(stage.id, {
      id: stage.id,
      title: stage.title,
      notes: stage.count,
      statuses: emptyStatusCounts(statusIds),
      think: 0,
      write: 0,
      stale: stage.staleCount
    });
  }

  const knownFiles = payload.files ?? [];
  const unclassified: WorkflowMatrixRow = {
    id: "__unclassified__",
    title: "未分阶段",
    notes: knownFiles.filter((file) => !file.stageId).length,
    statuses: emptyStatusCounts(statusIds),
    think: 0,
    write: 0,
    stale: knownFiles.filter((file) => !file.stageId && file.stale).length
  };

  for (const question of questions) {
    const stageId = stageByFile.get(question.source.file);
    const row = stageId ? rows.get(stageId) : unclassified;
    if (!row) continue;
    const status = String(question.status);
    row.statuses[status] = (row.statuses[status] ?? 0) + 1;
    if (isActionableStatus(status)) {
      if (question.lane === "think") row.think += 1;
      if (question.lane === "write") row.write += 1;
    }
  }

  const ordered = payload.stages
    .map((stage) => rows.get(stage.id))
    .filter((row): row is WorkflowMatrixRow => Boolean(row));
  if (
    unclassified.notes > 0
    || unclassified.stale > 0
    || Object.values(unclassified.statuses).some((count) => count > 0)
  ) {
    ordered.push(unclassified);
  }
  return ordered;
}

function emptyStatusCounts(statusIds: readonly string[]): Record<string, number> {
  return Object.fromEntries(statusIds.map((id) => [id, 0]));
}

function isActionableStatus(status: string): boolean {
  return status !== "resolved" && status !== "ignored";
}
