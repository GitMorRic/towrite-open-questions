import type { WorkflowIndexPayload, WorkflowFileSummary, WorkflowStageSummary } from "../workflow";
import type { ArticleSummary } from "./types";

export function enrichArticleSummariesWithWorkflow(
  articles: ArticleSummary[],
  workflowPayload: WorkflowIndexPayload,
  generatedAt = new Date().toISOString()
): ArticleSummary[] {
  if (!workflowPayload.enabled) {
    return articles.map((article) => normalizeArticleTiming(article, generatedAt));
  }

  const workflowByFile = new Map<string, { stage: WorkflowStageSummary; file: WorkflowFileSummary }>();
  for (const stage of workflowPayload.stages) {
    for (const file of stage.files) {
      workflowByFile.set(file.filePath, { stage, file });
    }
  }

  return articles.map((article) => {
    const match = workflowByFile.get(article.filePath);
    if (!match) {
      return normalizeArticleTiming(article, generatedAt);
    }

    return normalizeArticleTiming({
      ...article,
      createdAt: match.file.createdAt || article.createdAt,
      updatedAt: match.file.updatedAt || article.updatedAt,
      ageDays: match.file.ageDays,
      stageId: match.stage.id,
      stageTitle: match.stage.title,
      stale: match.file.stale,
      statusLabel: match.file.stale ? "stale" : article.statusLabel
    }, generatedAt);
  });
}

function normalizeArticleTiming(article: ArticleSummary, generatedAt: string): ArticleSummary {
  const createdAt = normalizeIso(article.createdAt);
  const updatedAt = normalizeIso(article.updatedAt);
  const statusLabel = article.statusLabel || (article.open > 0 ? "blocked" : article.candidate > 0 ? "candidate" : "clear");
  return {
    ...article,
    createdAt,
    updatedAt,
    ageDays: article.ageDays ?? daysBetween(createdAt, generatedAt),
    oldestOpenAgeDays: article.oldestOpenAgeDays ?? daysBetween(createdAt, generatedAt),
    statusLabel,
    stale: article.stale === true
  };
}

function normalizeIso(value: string | undefined): string | undefined {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function daysBetween(earlier: string | undefined, later: string): number | undefined {
  const start = Date.parse(earlier ?? "");
  const end = Date.parse(later);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return undefined;
  }
  return Math.floor((end - start) / 86_400_000);
}

