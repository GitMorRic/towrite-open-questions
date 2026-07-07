import type { OpenQuestionLane, OpenQuestionStatus } from "../core/types";
import type {
  PushCandidate,
  PushContextAnchor,
  PushDecision,
  PushDeliveryEvent,
  PushHabitRule,
  PushTargetSettings,
  ToWritePushSettings
} from "./types";

export interface PushPolicyInput {
  candidates: PushCandidate[];
  push: ToWritePushSettings;
  target: PushTargetSettings;
  context?: PushContextAnchor;
  events: PushDeliveryEvent[];
  now?: Date;
  activeFile?: string | null;
}

interface CandidateScore {
  candidate: PushCandidate;
  score: number;
  reasons: string[];
}

const SENT_COOLDOWN_MS = 1000 * 60 * 30;
const SKIP_COOLDOWN_MS = 1000 * 60 * 60 * 12;

export class PushPolicyEngine {
  select(input: PushPolicyInput): PushDecision {
    const now = input.now ?? new Date();
    const quiet = isTargetQuiet(input.target, now);
    const candidates = input.candidates.filter((candidate) => matchesTarget(candidate, input.target));
    const scored = candidates
      .map((candidate) => scoreCandidate(candidate, input, now))
      .filter((score) => score.score > -100)
      .sort((left, right) => right.score - left.score || candidateTimestamp(right.candidate).localeCompare(candidateTimestamp(left.candidate)));

    const selected = scored[0];
    const quietCanBreak = selected?.candidate.reminderDue === true;
    if (quiet && !quietCanBreak) {
      return {
        target: input.target,
        score: selected?.score ?? 0,
        reason: selected ? `quiet-hours; held ${selected.reasons.join(", ")}` : "quiet-hours",
        quiet: true,
        suppressedReason: "quiet-hours",
        generatedAt: now.toISOString()
      };
    }

    return {
      target: input.target,
      candidate: selected?.candidate,
      score: selected?.score ?? 0,
      reason: selected ? selected.reasons.join(", ") : "no-candidate",
      quiet,
      generatedAt: now.toISOString()
    };
  }
}

function scoreCandidate(candidate: PushCandidate, input: PushPolicyInput, now: Date): CandidateScore {
  const reasons: string[] = [];
  let score = candidate.type === "question" ? 20 : candidate.type === "workflow-file" ? 12 : 8;

  if (candidate.reminderDue) {
    score += 70;
    reasons.push("reminder due");
  }
  if (candidate.pinned) {
    score += 35;
    reasons.push("pinned");
  }
  if (candidate.stale) {
    score += 18;
    reasons.push("stale workflow");
  }
  if (candidate.nextAction) {
    score += 10;
    reasons.push("has next action");
  }
  if (candidate.note) {
    score += 6;
    reasons.push("has recent note");
  }
  if (candidate.status && candidate.status !== "open") {
    score += candidate.status === "blocked" ? 8 : 2;
    reasons.push(`status ${candidate.status}`);
  }

  const activeFile = input.context?.activeFile || input.activeFile || "";
  if (activeFile && candidate.sourceFile === activeFile) {
    score += 18;
    reasons.push("active note");
  }

  score += recencyBoost(candidate.updatedAt, now);
  applyTargetLane(candidate, input.target, reasons, (boost) => { score += boost; });
  const habitScore = scoreHabits(candidate, input.push.habits, input.target.id, input.context, now);
  score += habitScore.score;
  reasons.push(...habitScore.reasons);

  const feedbackPenalty = scoreFeedback(candidate, input.events, now);
  score += feedbackPenalty.score;
  reasons.push(...feedbackPenalty.reasons);

  if (reasons.length === 0) {
    reasons.push("default relevance");
  }

  return { candidate, score, reasons };
}

function applyTargetLane(candidate: PushCandidate, target: PushTargetSettings, reasons: string[], add: (value: number) => void): void {
  if (!target.defaultLane || !candidate.lane) {
    return;
  }
  if (candidate.lane === target.defaultLane) {
    add(12);
    reasons.push(`${target.defaultLane} lane`);
  } else {
    add(-20);
    reasons.push(`not ${target.defaultLane} lane`);
  }
}

function scoreHabits(
  candidate: PushCandidate,
  habits: PushHabitRule[],
  targetId: string,
  context: PushContextAnchor | undefined,
  now: Date
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  for (const habit of habits) {
    if (!habit.enabled || (habit.targetIds.length > 0 && !habit.targetIds.includes(targetId))) {
      continue;
    }
    if (!timeInRange(formatTime(now), habit.timeStart, habit.timeEnd)) {
      continue;
    }
    if (habit.placeLabel && habit.placeLabel !== context?.placeLabel) {
      continue;
    }
    if (habit.mode && habit.mode !== context?.mode) {
      continue;
    }
    if (habit.stageIds.length > 0 && (!candidate.workflowStageId || !habit.stageIds.includes(candidate.workflowStageId))) {
      continue;
    }
    if (habit.lanes.length > 0 && (!candidate.lane || !habit.lanes.includes(candidate.lane))) {
      continue;
    }
    if (habit.statuses.length > 0 && (!candidate.status || !habit.statuses.includes(candidate.status))) {
      continue;
    }
    score += habit.boost;
    reasons.push(`habit ${habit.label || habit.id}`);
  }
  return { score, reasons };
}

function scoreFeedback(candidate: PushCandidate, events: PushDeliveryEvent[], now: Date): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const matching = events
    .filter((event) => event.candidateId === candidate.id)
    .sort((left, right) => eventTime(right).localeCompare(eventTime(left)));
  const latest = matching[0];
  if (!latest) {
    return { score, reasons };
  }

  const latestSentMs = latest.sentAt ? Date.parse(latest.sentAt) : 0;
  if (latestSentMs && now.getTime() - latestSentMs < SENT_COOLDOWN_MS) {
    score -= 120;
    reasons.push("recently sent");
  }
  const skippedMs = latest.skippedAt ? Date.parse(latest.skippedAt) : 0;
  if (skippedMs && now.getTime() - skippedMs < SKIP_COOLDOWN_MS) {
    score -= 35;
    reasons.push("recently skipped");
  }
  if (latest.feedback === "useful" || latest.feedback === "answered") {
    score += 8;
    reasons.push("positive feedback");
  }
  if (latest.feedback === "opened-no-write") {
    score += 4;
    reasons.push("opened before");
  }

  return { score, reasons };
}

function matchesTarget(candidate: PushCandidate, target: PushTargetSettings): boolean {
  if (target.defaultPage === "workflow") {
    return candidate.type === "workflow-file";
  }
  if (target.defaultPage === "articles") {
    return candidate.type === "article";
  }
  if (target.defaultPage === "cards") {
    return candidate.type === "question";
  }
  return true;
}

export function isTargetQuiet(target: Pick<PushTargetSettings, "quietHoursStart" | "quietHoursEnd">, now = new Date()): boolean {
  return timeInRange(formatTime(now), target.quietHoursStart, target.quietHoursEnd);
}

function timeInRange(current: string, start: string, end: string): boolean {
  if (!isTime(start) || !isTime(end) || start === end) {
    return false;
  }
  if (start < end) {
    return current >= start && current < end;
  }
  return current >= start || current < end;
}

function recencyBoost(updatedAt: string | undefined, now: Date): number {
  if (!updatedAt) {
    return 0;
  }
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) {
    return 0;
  }
  const ageDays = Math.max(0, (now.getTime() - timestamp) / 86_400_000);
  return Math.max(0, Math.round(14 - ageDays));
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/u.test(value);
}

function candidateTimestamp(candidate: PushCandidate): string {
  return candidate.updatedAt || "";
}

function eventTime(event: PushDeliveryEvent): string {
  return event.respondedAt || event.skippedAt || event.openedAt || event.sentAt || "";
}

export function normalizeLaneList(values: unknown[]): OpenQuestionLane[] {
  return values.filter((value): value is OpenQuestionLane => value === "think" || value === "write");
}

export function normalizeStatusList(values: unknown[]): OpenQuestionStatus[] {
  return values.map((value) => String(value).trim()).filter(Boolean) as OpenQuestionStatus[];
}

