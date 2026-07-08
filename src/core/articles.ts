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
  for (const file of workflowPayload.files ?? []) {
    if (!workflowByFile.has(file.filePath)) {
      workflowByFile.set(file.filePath, {
        stage: {
          id: file.stageId ?? "",
          title: file.stageTitle ?? "",
          description: "",
          color: file.stageColor ?? "slate",
          limit: 0,
          staleAfterDays: 0,
          count: 0,
          staleCount: 0,
          files: []
        },
        file
      });
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
      tags: match.file.tags,
      description: match.file.description,
      typeId: match.file.typeId,
      typeTitle: match.file.typeTitle,
      typeColor: match.file.typeColor,
      stageId: match.stage.id,
      stageTitle: match.stage.title,
      stageColor: match.stage.color,
      stale: match.file.stale,
      statusLabel: match.file.stale ? "stale" : article.statusLabel
    }, generatedAt);
  });
}

export function mergeArticleSummariesWithWorkflow(
  articles: ArticleSummary[],
  workflowPayload: WorkflowIndexPayload,
  generatedAt = new Date().toISOString()
): ArticleSummary[] {
  const byFile = new Map<string, ArticleSummary>();
  for (const article of enrichArticleSummariesWithWorkflow(articles, workflowPayload, generatedAt)) {
    byFile.set(article.filePath, article);
  }

  for (const file of workflowPayload.files ?? []) {
    if (byFile.has(file.filePath)) {
      continue;
    }
    byFile.set(file.filePath, workflowFileToArticleSummary(file, generatedAt));
  }

  return Array.from(byFile.values())
    .sort((left, right) =>
      Number(Boolean(right.needsWork || right.candidate > 0)) - Number(Boolean(left.needsWork || left.candidate > 0))
      || (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")
      || left.title.localeCompare(right.title)
    );
}

function workflowFileToArticleSummary(file: WorkflowFileSummary, generatedAt: string): ArticleSummary {
  return normalizeArticleTiming({
    filePath: file.filePath,
    title: file.title,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    ageDays: file.ageDays,
    statusLabel: file.stale ? "stale" : "clear",
    tags: file.tags,
    description: file.description,
    typeId: file.typeId,
    typeTitle: file.typeTitle,
    typeColor: file.typeColor,
    stageId: file.stageId,
    stageTitle: file.stageTitle,
    stageColor: file.stageColor,
    stale: file.stale,
    open: file.openQuestionCount,
    candidate: 0,
    resolved: 0,
    ignored: 0,
    think: file.thinkCount,
    write: file.writeCount,
    needsWork: file.openQuestionCount > 0,
    topIssues: []
  }, generatedAt);
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
