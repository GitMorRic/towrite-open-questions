import type { ArticleSummary, OpenQuestion } from "../core/types";
import { stripQuestionRuleSyntax } from "../core/rule-text";
import type { WorkflowFileSummary, WorkflowIndexPayload, WorkflowStageSummary } from "../workflow";
import type { PushCandidate } from "./types";

export interface PushCandidateSourceInput {
  vaultName: string;
  questions: OpenQuestion[];
  articles: ArticleSummary[];
  workflowPayload: WorkflowIndexPayload;
  publicBaseUrl?: string;
  token?: string;
  now?: string;
}

export class PushCandidateSource {
  build(input: PushCandidateSourceInput): PushCandidate[] {
    const nowMs = Date.parse(input.now ?? new Date().toISOString());
    const workflowContexts = workflowContextByFile(input.workflowPayload);
    const candidates: PushCandidate[] = [];

    for (const question of input.questions) {
      if (!isWorkStatus(question.status)) {
        continue;
      }
      const context = workflowContexts.get(question.source.file);
      candidates.push(questionToCandidate(question, input.vaultName, context, input.publicBaseUrl, input.token, nowMs));
    }

    for (const stage of input.workflowPayload.enabled ? input.workflowPayload.stages : []) {
      for (const file of stage.files) {
        candidates.push(workflowFileToCandidate(stage, file));
      }
    }

    for (const article of input.articles) {
      if (article.needsWork || article.candidate > 0) {
        candidates.push(articleToCandidate(article, input.vaultName, input.publicBaseUrl, input.token));
      }
    }

    return dedupeCandidates(candidates);
  }
}

function questionToCandidate(
  question: OpenQuestion,
  vaultName: string,
  workflowContext: { stage: WorkflowStageSummary; file: WorkflowFileSummary } | undefined,
  publicBaseUrl: string | undefined,
  token: string | undefined,
  nowMs: number
): PushCandidate {
  const body = stripQuestionRuleSyntax(question.question, question.source.rule);
  const latestNote = question.notes?.at(-1)?.text ?? question.note;
  const sourceTitle = workflowContext?.file.title || question.source.headingPath.at(-1) || displayNameForPath(question.source.file);
  return {
    id: question.id,
    type: "question",
    title: question.title || body || sourceTitle,
    body,
    note: latestNote,
    nextAction: question.ai?.nextAction || workflowContext?.file.nextAction,
    sourceFile: question.source.file,
    sourceTitle,
    workflowStageId: workflowContext?.stage.id,
    workflowStageTitle: workflowContext?.stage.title,
    lane: question.lane,
    status: question.status,
    tags: question.tags,
    reminderAt: question.reminderAt || undefined,
    reminderNote: question.reminderNote || undefined,
    reminderDue: isReminderDue(question.reminderAt, nowMs),
    stale: workflowContext?.file.stale,
    pinned: question.pinned,
    updatedAt: question.updatedAt ?? question.createdAt,
    openUri: buildObsidianUri(vaultName, question.source.file, question.source.blockId),
    answerUrl: buildInputUrl(publicBaseUrl, token, question.id),
    questionId: question.id
  };
}

function workflowFileToCandidate(stage: WorkflowStageSummary, file: WorkflowFileSummary): PushCandidate {
  return {
    id: `workflow:${file.filePath}`,
    type: "workflow-file",
    title: file.title || displayNameForPath(file.filePath),
    body: file.description,
    nextAction: file.nextAction,
    sourceFile: file.filePath,
    sourceTitle: file.title,
    workflowStageId: stage.id,
    workflowStageTitle: stage.title,
    tags: file.tags,
    stale: file.stale,
    updatedAt: file.updatedAt,
    openUri: file.openUri
  };
}

function articleToCandidate(article: ArticleSummary, vaultName: string, publicBaseUrl: string | undefined, token: string | undefined): PushCandidate {
  const top = article.topIssues.find((question) => isWorkStatus(question.status));
  return {
    id: `article:${article.filePath}`,
    type: "article",
    title: article.title || displayNameForPath(article.filePath),
    body: top?.title || top?.question || `${article.open} open questions, ${article.candidate} candidates`,
    nextAction: top?.ai?.nextAction,
    sourceFile: article.filePath,
    sourceTitle: article.title,
    lane: top?.lane,
    status: top?.status,
    tags: top?.tags ?? [],
    updatedAt: top?.updatedAt ?? top?.createdAt,
    openUri: buildObsidianUri(vaultName, article.filePath),
    answerUrl: top ? buildInputUrl(publicBaseUrl, token, top.id) : buildCardsUrl(publicBaseUrl, token, article.filePath),
    questionId: top?.id
  };
}

function workflowContextByFile(payload: WorkflowIndexPayload): Map<string, { stage: WorkflowStageSummary; file: WorkflowFileSummary }> {
  const output = new Map<string, { stage: WorkflowStageSummary; file: WorkflowFileSummary }>();
  if (!payload.enabled) {
    return output;
  }
  for (const stage of payload.stages) {
    for (const file of stage.files) {
      output.set(file.filePath, { stage, file });
    }
  }
  return output;
}

function dedupeCandidates(candidates: PushCandidate[]): PushCandidate[] {
  const seen = new Set<string>();
  const output: PushCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      continue;
    }
    seen.add(candidate.id);
    output.push(candidate);
  }
  return output;
}

function buildObsidianUri(vaultName: string, filePath: string, blockId?: string): string {
  const fragment = blockId ? `#^${blockId}` : "";
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(`${filePath}${fragment}`)}`;
}

function buildInputUrl(baseUrl: string | undefined, token: string | undefined, questionId?: string): string | undefined {
  const base = baseUrl?.trim().replace(/\/+$/u, "");
  const normalizedToken = token?.trim();
  if (!base || !normalizedToken) {
    return undefined;
  }
  const params = new URLSearchParams();
  params.set("token", normalizedToken);
  if (questionId) {
    params.set("questionId", questionId);
  }
  return `${base}/device/input?${params.toString()}`;
}

function buildCardsUrl(baseUrl: string | undefined, token: string | undefined, sourceFile: string): string | undefined {
  const base = baseUrl?.trim().replace(/\/+$/u, "");
  const normalizedToken = token?.trim();
  if (!base || !normalizedToken) {
    return undefined;
  }
  const params = new URLSearchParams();
  params.set("token", normalizedToken);
  params.set("page", "cards");
  params.set("sourceFile", sourceFile);
  return `${base}/device?${params.toString()}`;
}

function isReminderDue(value: string | undefined, nowMs: number): boolean {
  if (!value) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= nowMs;
}

function isWorkStatus(status: string): boolean {
  return status !== "candidate" && status !== "resolved" && status !== "ignored";
}

function displayNameForPath(value: string): string {
  const normalized = value.replace(/\\/gu, "/").replace(/\.md$/iu, "");
  const parts = normalized.split("/").filter(Boolean);
  const leaf = parts.at(-1) || normalized;
  return leaf.toLowerCase() === "index" && parts.length > 1 ? parts.at(-2) || leaf : leaf;
}

