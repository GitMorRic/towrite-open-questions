import type { PushCandidate, PushDecision, PushDisplayCard, PushFeedPayload, PushPrivacySettings } from "./types";
import { buildDeviceInputUrl, deliveryIdFor, type DeviceInteractionAction } from "../device-interactions";

export interface PushFeedFormatOptions {
  privacy: PushPrivacySettings;
  context: {
    timeBucket: string;
    placeLabel?: string;
    mode?: string;
    activeFile?: string;
    preciseLocationIncluded?: boolean;
  };
}

export function formatPushFeed(decision: PushDecision, options: PushFeedFormatOptions): PushFeedPayload {
  const deliveryId = deliveryIdFor(decision.target.id, decision.candidate?.id, decision.generatedAt);
  const baseDisplay = decision.candidate ? displayForCandidate(decision.candidate, decision.reason) : emptyDisplay(decision.reason);
  const actions = decision.candidate ? actionsForCandidate(decision.candidate, decision.target.id, deliveryId) : [];
  const display = {
    ...baseDisplay,
    actions,
    link: actions.find((action) => action.id === "respond")?.url ?? baseDisplay.link
  };
  return {
    schemaVersion: 1,
    generatedAt: decision.generatedAt,
    target: {
      id: decision.target.id,
      name: decision.target.name,
      type: decision.target.type,
      profile: decision.target.profile,
      width: decision.target.width,
      height: decision.target.height,
      inches: decision.target.inches,
      capabilities: decision.target.capabilities
    },
    privacy: {
      level: options.privacy.level,
      preciseLocationIncluded: options.context.preciseLocationIncluded === true && options.privacy.allowPreciseLocation
    },
    context: {
      timeBucket: options.context.timeBucket,
      placeLabel: options.privacy.level === "no-location" ? undefined : options.context.placeLabel,
      mode: options.context.mode,
      activeFile: options.context.activeFile
    },
    decision: {
      candidateId: decision.candidate?.id,
      candidateType: decision.candidate?.type,
      deliveryId,
      score: Math.round(decision.score),
      reason: decision.reason,
      quiet: decision.quiet,
      suppressedReason: decision.suppressedReason
    },
    display,
    candidate: decision.candidate ? sanitizeCandidate(decision.candidate) : undefined
  };
}

export function displayForCandidate(candidate: PushCandidate, reason: string): PushDisplayCard {
  if (candidate.type === "home-summary") {
    return homeDisplay(candidate, reason);
  }
  if (candidate.type === "article") {
    return articleDisplay(candidate, reason);
  }
  if (candidate.type === "workflow-file") {
    return workflowDisplay(candidate, reason);
  }
  return questionDisplay(candidate, reason);
}

function homeDisplay(candidate: PushCandidate, reason: string): PushDisplayCard {
  const metrics = candidate.metrics ?? [];
  const secondaryLines = [
    metricsLine(metrics.slice(0, 3)),
    metricsLine(metrics.slice(3, 5)),
    candidate.badges?.join(" · ") || ""
  ].filter(Boolean);
  return buildDisplay({
    variant: "home-summary",
    icon: "▦",
    kicker: "Dashboard",
    title: "ToWrite Overview",
    primary: candidate.body,
    secondaryLines,
    metrics,
    badges: candidate.badges ?? [],
    footer: candidate.footer || compactReason(reason),
    link: candidate.answerUrl || candidate.openUri
  });
}

function questionDisplay(candidate: PushCandidate, reason: string): PushDisplayCard {
  const icon = candidate.lane === "write" ? "✎" : "?";
  const lane = candidate.lane === "write" ? "ToWrite" : "ToThink";
  const badges = [
    lane,
    candidate.status && candidate.status !== "open" ? candidate.status : "",
    candidate.reminderDue ? "due" : "",
    candidate.stale ? "stale" : ""
  ].filter(Boolean);
  const secondaryLines = [
    candidate.nextAction ? `Next: ${truncate(candidate.nextAction, 74)}` : "",
    candidate.note ? `Memo: ${truncate(cleanMemoryCue(candidate.note), 72)}` : "",
    candidate.reminderAt ? `Reminder: ${truncate(candidate.reminderNote || readableDate(candidate.reminderAt), 64)}` : ""
  ].filter(Boolean);

  return buildDisplay({
    variant: "question",
    icon,
    kicker: [candidate.workflowStageTitle, candidate.sourceTitle].filter(Boolean).join(" · "),
    title: candidate.title || candidate.body || "Question",
    primary: candidate.body,
    secondaryLines,
    metrics: [],
    badges,
    footer: [icon, lane, candidate.workflowStageTitle, compactAge(candidate.ageDays), compactReason(reason)].filter(Boolean).join(" · "),
    link: candidate.answerUrl || candidate.openUri
  });
}

function articleDisplay(candidate: PushCandidate, reason: string): PushDisplayCard {
  const metrics = [
    { label: "open", value: candidate.articleOpen ?? 0 },
    { label: "candidate", value: candidate.articleCandidate ?? 0 },
    { label: "resolved", value: candidate.articleResolved ?? 0 }
  ];
  const badges = [
    candidate.statusLabel,
    candidate.workflowStageTitle,
    candidate.stale ? "stale" : "",
    candidate.oldestOpenAgeDays !== undefined ? `${candidate.oldestOpenAgeDays}d open` : ""
  ].filter(Boolean) as string[];
  const secondaryLines = [
    metricsLine(metrics),
    candidate.oldestOpenAgeDays !== undefined ? `Oldest open: ${candidate.oldestOpenAgeDays}d` : "",
    candidate.ageDays !== undefined ? `Updated: ${candidate.ageDays}d ago` : "",
    candidate.body ? `Top: ${truncate(candidate.body, 70)}` : ""
  ].filter(Boolean);

  return buildDisplay({
    variant: "article",
    icon: "§",
    kicker: candidate.workflowStageTitle || "Article",
    title: candidate.title || candidate.sourceTitle || "Article",
    primary: candidate.body || `${candidate.articleOpen ?? 0} open questions`,
    secondaryLines,
    metrics,
    badges,
    footer: [candidate.statusLabel, candidate.workflowStageTitle, compactAge(candidate.ageDays), compactReason(reason)].filter(Boolean).join(" · "),
    link: candidate.answerUrl || candidate.openUri
  });
}

function workflowDisplay(candidate: PushCandidate, reason: string): PushDisplayCard {
  const metrics = [
    { label: "open", value: candidate.articleOpen ?? 0 },
    { label: "ToThink", value: candidate.articleThink ?? 0 },
    { label: "ToWrite", value: candidate.articleWrite ?? 0 }
  ];
  const badges = [
    candidate.workflowStageTitle,
    candidate.stale ? "stale" : "",
    candidate.ageDays !== undefined ? `${candidate.ageDays}d` : ""
  ].filter(Boolean) as string[];
  const secondaryLines = [
    candidate.body ? truncate(candidate.body, 86) : "",
    metricsLine(metrics)
  ].filter(Boolean);

  return buildDisplay({
    variant: "workflow-file",
    icon: "↻",
    kicker: candidate.workflowStageTitle || "Workflow",
    title: candidate.title || candidate.sourceTitle || "Workflow",
    primary: candidate.nextAction ? `Next: ${candidate.nextAction}` : candidate.body || candidate.title,
    secondaryLines,
    metrics,
    badges,
    footer: [candidate.workflowStageTitle, candidate.stale ? `${candidate.ageDays ?? 0}d stale` : compactAge(candidate.ageDays), compactReason(reason)].filter(Boolean).join(" · "),
    link: candidate.openUri
  });
}

function buildDisplay(input: {
  variant: PushDisplayCard["variant"];
  icon: string;
  kicker?: string;
  title: string;
  primary: string;
  secondaryLines: string[];
  metrics: PushDisplayCard["metrics"];
  badges: string[];
  footer: string;
  link?: string;
  actions?: DeviceInteractionAction[];
}): PushDisplayCard {
  const title = truncate(input.title, 48);
  const primary = truncate(input.primary, 120);
  const secondaryLines = input.secondaryLines.map((line) => truncate(line, 90)).filter(Boolean).slice(0, 4);
  const signature = truncate([input.kicker, input.footer].filter(Boolean).join(" · "), 96);
  return {
    variant: input.variant,
    icon: input.icon,
    kicker: input.kicker,
    title,
    primary,
    secondaryLines,
    metrics: input.metrics,
    badges: input.badges,
    footer: truncate(input.footer, 90),
    link: input.link,
    actions: input.actions ?? [],
    titleText: `${input.icon} ${title}`,
    message: [primary, ...secondaryLines].filter(Boolean).join("\n"),
    signature
  };
}

function emptyDisplay(reason: string): PushDisplayCard {
  return buildDisplay({
    variant: "empty",
    icon: "·",
    kicker: "ToWrite",
    title: "ToWrite",
    primary: "No push candidate is ready.",
    secondaryLines: [],
    metrics: [],
    badges: [],
    footer: reason
  });
}

function actionsForCandidate(candidate: PushCandidate, targetId: string, deliveryId: string | undefined): DeviceInteractionAction[] {
  const output: DeviceInteractionAction[] = [];
  const respondUrl = candidate.questionId
    ? withQueryParams(candidate.answerUrl, {
      targetId,
      candidateId: candidate.id,
      deliveryId,
      sourceFile: candidate.sourceRef?.filePath,
      sourceLine: candidate.sourceRef?.lineStart !== undefined ? String(candidate.sourceRef.lineStart) : undefined,
      sourceEndLine: candidate.sourceRef?.lineEnd !== undefined ? String(candidate.sourceRef.lineEnd) : undefined,
      sourceBlockId: candidate.sourceRef?.blockId,
      sourcePage: candidate.sourceRef?.page !== undefined ? String(candidate.sourceRef.page) : undefined
    })
    : undefined;
  if (candidate.questionId && respondUrl) {
    output.push({
      id: "respond",
      label: candidate.lane === "write" ? "回答 ToWrite" : "回答 ToThink",
      kind: "respond",
      enabled: true,
      questionId: candidate.questionId,
      candidateId: candidate.id,
      candidateType: candidate.type,
      deliveryId,
      sourceRef: candidate.sourceRef,
      url: respondUrl,
      uri: respondUrl,
      qrText: respondUrl
    });
  }

  const captureUrl = captureUrlFromAnswerUrl(candidate.answerUrl, targetId, candidate.id, deliveryId);
  if (captureUrl) {
    output.push({
      id: "capture",
      label: "新想法",
      kind: "capture",
      enabled: true,
      candidateId: candidate.id,
      candidateType: candidate.type,
      deliveryId,
      sourceRef: candidate.sourceRef,
      url: captureUrl,
      uri: captureUrl,
      qrText: captureUrl
    });
  }

  if (candidate.openUri) {
    output.push({
      id: "openSource",
      label: "打开来源",
      kind: "open-source",
      enabled: true,
      candidateId: candidate.id,
      candidateType: candidate.type,
      deliveryId,
      sourceRef: candidate.sourceRef,
      url: candidate.openUri,
      uri: candidate.openUri,
      obsidianUri: candidate.openUri
    });
  }

  for (const feedback of ["later", "skipped"] as const) {
    output.push({
      id: feedback,
      label: feedback === "later" ? "稍后" : "跳过",
      kind: "feedback",
      enabled: true,
      candidateId: candidate.id,
      candidateType: candidate.type,
      deliveryId,
      feedbackAction: feedback
    });
  }

  return output;
}

function captureUrlFromAnswerUrl(answerUrl: string | undefined, targetId: string, candidateId: string, deliveryId: string | undefined): string | undefined {
  if (!answerUrl) {
    return undefined;
  }
  const params = new URLSearchParams(queryPart(answerUrl));
  const token = params.get("token") ?? undefined;
  const base = basePart(answerUrl).replace(/\/device\/input$/u, "");
  return buildDeviceInputUrl(base || undefined, {
    token,
    targetId,
    candidateId,
    deliveryId,
    intent: "capture"
  });
}

function withQueryParams(value: string | undefined, params: Record<string, string | undefined>): string | undefined {
  if (!value) {
    return undefined;
  }
  const base = basePart(value);
  const search = new URLSearchParams(queryPart(value));
  for (const [key, param] of Object.entries(params)) {
    if (param) {
      search.set(key, param);
    }
  }
  return `${base}?${search.toString()}`;
}

function basePart(value: string): string {
  return value.split("?")[0] ?? value;
}

function queryPart(value: string): string {
  const index = value.indexOf("?");
  return index >= 0 ? value.slice(index + 1) : "";
}

function sanitizeCandidate(candidate: PushCandidate): PushCandidate {
  return {
    ...candidate,
    sourceFile: candidate.sourceFile,
    sourceTitle: candidate.sourceTitle
  };
}

function metricsLine(metrics: Array<{ label: string; value: number | string }>): string {
  return metrics.length > 0 ? metrics.map((metric) => `${metric.label} ${metric.value}`).join(" · ") : "";
}

function compactReason(reason: string): string {
  return reason.split(",").map((part) => part.trim()).filter(Boolean).slice(0, 2).join(", ");
}

function compactAge(ageDays: number | undefined): string {
  return ageDays === undefined ? "" : `${ageDays}d`;
}

function readableDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Date(timestamp).toLocaleString();
}

function truncate(value: string | undefined, maxLength: number): string {
  const compact = String(value ?? "").replace(/\s+/gu, " ").trim();
  const chars = Array.from(compact);
  if (chars.length <= maxLength) {
    return compact;
  }
  return chars.slice(0, Math.max(0, maxLength - 3)).join("") + "...";
}

function cleanMemoryCue(value: string): string {
  return value
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/gu, "$2")
    .replace(/\[\[([^\]]+)\]\]/gu, (_match, path: string) => displayNameForPath(path))
    .replace(/`+/gu, "")
    .trim();
}

function displayNameForPath(value: string): string {
  const normalized = value.replace(/\\/gu, "/").replace(/\.md$/iu, "");
  const parts = normalized.split("/").filter(Boolean);
  const leaf = parts.at(-1) || normalized;
  const display = leaf.toLowerCase() === "index" && parts.length > 1 ? parts.at(-2) || leaf : leaf;
  return display.replace(/[_-]+/gu, " ");
}
