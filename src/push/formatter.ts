import type { PushCandidate, PushDecision, PushFeedPayload, PushPrivacySettings } from "./types";

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
  const display = decision.candidate ? displayForCandidate(decision.candidate, decision.reason) : emptyDisplay(decision.reason);
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
      score: Math.round(decision.score),
      reason: decision.reason,
      quiet: decision.quiet,
      suppressedReason: decision.suppressedReason
    },
    display,
    candidate: decision.candidate ? sanitizeCandidate(decision.candidate) : undefined
  };
}

export function displayForCandidate(candidate: PushCandidate, reason: string): PushFeedPayload["display"] {
  const message = [
    truncate(candidate.body, 120),
    candidate.nextAction ? `Next: ${truncate(candidate.nextAction, 80)}` : "",
    candidate.note ? `Memo: ${truncate(cleanMemoryCue(candidate.note), 80)}` : "",
    candidate.reminderAt ? `Reminder: ${truncate(candidate.reminderNote || candidate.reminderAt, 64)}` : ""
  ].filter(Boolean).slice(0, 4).join("\n");

  const signature = [
    candidate.workflowStageTitle,
    candidate.lane ? candidate.lane === "think" ? "Think" : "Write" : "",
    candidate.status && candidate.status !== "open" ? candidate.status : "",
    candidate.stale ? "stale" : "",
    compactReason(reason)
  ].filter(Boolean).join(" · ");

  return {
    title: truncate(candidate.title || candidate.body || "ToWrite", 42),
    message,
    signature: truncate(signature, 80),
    link: candidate.answerUrl || candidate.openUri
  };
}

function emptyDisplay(reason: string): PushFeedPayload["display"] {
  return {
    title: "ToWrite",
    message: "No push candidate is ready.",
    signature: reason
  };
}

function sanitizeCandidate(candidate: PushCandidate): PushCandidate {
  return {
    ...candidate,
    sourceFile: candidate.sourceFile,
    sourceTitle: candidate.sourceTitle
  };
}

function compactReason(reason: string): string {
  return reason.split(",").map((part) => part.trim()).filter(Boolean).slice(0, 2).join(", ");
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

