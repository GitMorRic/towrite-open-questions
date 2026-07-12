import type {
  ActivityEvent,
  CaptureRouteActivityEvent,
  HabitEvidence,
  HabitRule,
  SessionSummary,
  ThreeHourTimeWindow
} from "./types";
import { formatTimeWindow, localDateFor, timeWindowKey } from "./sessions";

export const MIN_HABIT_SAMPLES = 5;
export const MIN_HABIT_DAYS = 3;
export const TIME_STAGE_MIN_RATIO = 0.7;
export const ROUTING_MIN_RATIO = 0.8;

export interface InferredHabitPattern {
  fingerprint: string;
  label: string;
  description: string;
  rule: HabitRule;
  evidence: HabitEvidence;
}

export function inferHabitPatterns(
  sessions: readonly SessionSummary[],
  events: readonly ActivityEvent[]
): InferredHabitPattern[] {
  return [
    ...inferTimeStagePatterns(sessions),
    ...inferRoutingPatterns(events)
  ].sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
}

export function inferTimeStagePatterns(sessions: readonly SessionSummary[]): InferredHabitPattern[] {
  const groups = new Map<string, SessionSummary[]>();
  for (const session of sessions.filter((item) => item.hadEdit)) {
    const key = session.workflowStageId
      ? `stage:${session.workflowStageId}`
      : session.articleTypeId
        ? `type:${session.articleTypeId}`
        : "";
    if (!key) {
      continue;
    }
    const existing = groups.get(key) ?? [];
    existing.push(session);
    groups.set(key, existing);
  }

  const patterns: InferredHabitPattern[] = [];
  for (const [groupKey, samples] of groups) {
    if (samples.length < MIN_HABIT_SAMPLES) {
      continue;
    }
    const byWindow = new Map<string, SessionSummary[]>();
    for (const sample of samples) {
      const key = timeWindowKey(sample.timeWindow);
      const existing = byWindow.get(key) ?? [];
      existing.push(sample);
      byWindow.set(key, existing);
    }
    const winner = Array.from(byWindow.values())
      .sort((left, right) => right.length - left.length || left[0].timeWindow.startHour - right[0].timeWindow.startHour)[0];
    if (!winner) {
      continue;
    }
    const distinctDays = new Set(winner.map((sample) => sample.localDate)).size;
    const ratio = winner.length / samples.length;
    if (distinctDays < MIN_HABIT_DAYS || ratio < TIME_STAGE_MIN_RATIO) {
      continue;
    }

    const [classification, id] = splitGroupKey(groupKey);
    const window = winner[0].timeWindow;
    const rule: HabitRule = classification === "stage"
      ? { kind: "time-stage", workflowStageId: id, timeWindow: window }
      : { kind: "time-stage", articleTypeId: id, timeWindow: window };
    const subject = classification === "stage" ? `stage ${id}` : `article type ${id}`;
    patterns.push({
      fingerprint: timeStageFingerprint(rule),
      label: `Continue ${id} around ${formatTimeWindow(window)}`,
      description: `${winner.length} of ${samples.length} editing sessions for ${subject} occurred in this time window across ${distinctDays} days.`,
      rule,
      evidence: evidenceFor(samples, winner, distinctDays)
    });
  }
  return patterns;
}

export function inferRoutingPatterns(events: readonly ActivityEvent[]): InferredHabitPattern[] {
  const groups = new Map<string, CaptureRouteActivityEvent[]>();
  for (const event of comparableRouteEvents(events)) {
    const key = routingContextKey(event);
    const existing = groups.get(key) ?? [];
    existing.push(event);
    groups.set(key, existing);
  }

  const patterns: InferredHabitPattern[] = [];
  for (const [contextKey, samples] of groups) {
    if (samples.length < MIN_HABIT_SAMPLES) {
      continue;
    }
    const byTarget = new Map<string, CaptureRouteActivityEvent[]>();
    for (const sample of samples) {
      const key = `${sample.selectedTargetKind}|${sample.selectedTargetId}`;
      const existing = byTarget.get(key) ?? [];
      existing.push(sample);
      byTarget.set(key, existing);
    }
    const winner = Array.from(byTarget.values())
      .sort((left, right) => right.length - left.length
        || left[0].selectedTargetId.localeCompare(right[0].selectedTargetId))[0];
    if (!winner) {
      continue;
    }
    const distinctDays = new Set(winner.map((event) => localDateFor(event.at, event.timezoneOffsetMinutes))).size;
    const ratio = winner.length / samples.length;
    if (distinctDays < MIN_HABIT_DAYS || ratio < ROUTING_MIN_RATIO) {
      continue;
    }

    const context = contextFromKey(contextKey);
    const rule: HabitRule = {
      kind: "routing",
      context,
      targetId: winner[0].selectedTargetId,
      targetKind: winner[0].selectedTargetKind
    };
    const contextLabel = context.workflowStageId
      ? `stage ${context.workflowStageId}`
      : context.articleTypeId
        ? `article type ${context.articleTypeId}`
        : `entry point ${context.entryPoint}`;
    patterns.push({
      fingerprint: routingFingerprint(rule),
      label: `Route ${contextLabel} captures to ${rule.targetId}`,
      description: `${winner.length} of ${samples.length} comparable captures used this confirmed target across ${distinctDays} days.`,
      rule,
      evidence: evidenceForEvents(samples, winner, distinctDays)
    });
  }
  return patterns;
}

/**
 * An undo with the same captureId supersedes the earlier commit feedback. Raw
 * events without a captureId remain independently comparable, except that an
 * undone event is never positive routing evidence.
 */
function comparableRouteEvents(events: readonly ActivityEvent[]): CaptureRouteActivityEvent[] {
  const latestByCapture = new Map<string, CaptureRouteActivityEvent>();
  const independent: CaptureRouteActivityEvent[] = [];
  const routes = events
    .filter((event): event is CaptureRouteActivityEvent => event.kind === "capture-route" && Boolean(event.selectedTargetId))
    .sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id));
  for (const event of routes) {
    if (event.captureId) {
      latestByCapture.set(event.captureId, event);
    } else if (event.selection !== "undone") {
      independent.push(event);
    }
  }
  return [...independent, ...Array.from(latestByCapture.values()).filter((event) => event.selection !== "undone")];
}

export function habitFingerprint(rule: HabitRule): string {
  return rule.kind === "time-stage" ? timeStageFingerprint(rule) : routingFingerprint(rule);
}

function timeStageFingerprint(rule: Extract<HabitRule, { kind: "time-stage" }>): string {
  return [
    "time-stage",
    `stage=${rule.workflowStageId ?? ""}`,
    `type=${rule.articleTypeId ?? ""}`,
    `window=${timeWindowKey(rule.timeWindow)}`
  ].join("|");
}

function routingFingerprint(rule: Extract<HabitRule, { kind: "routing" }>): string {
  return [
    "routing",
    `stage=${rule.context.workflowStageId ?? ""}`,
    `type=${rule.context.articleTypeId ?? ""}`,
    `entry=${rule.context.entryPoint ?? ""}`,
    `target-kind=${rule.targetKind}`,
    `target=${rule.targetId}`
  ].join("|");
}

function routingContextKey(event: CaptureRouteActivityEvent): string {
  if (event.workflowStageId) {
    return `stage:${event.workflowStageId}`;
  }
  if (event.articleTypeId) {
    return `type:${event.articleTypeId}`;
  }
  return `entry:${event.entryPoint}`;
}

function contextFromKey(key: string): Extract<HabitRule, { kind: "routing" }>["context"] {
  const [kind, value] = splitGroupKey(key);
  if (kind === "stage") {
    return { workflowStageId: value };
  }
  if (kind === "type") {
    return { articleTypeId: value };
  }
  return { entryPoint: value };
}

function splitGroupKey(key: string): [string, string] {
  const separator = key.indexOf(":");
  return separator < 0 ? [key, ""] : [key.slice(0, separator), key.slice(separator + 1)];
}

function evidenceFor(
  all: readonly SessionSummary[],
  matching: readonly SessionSummary[],
  distinctDays: number
): HabitEvidence {
  const ordered = [...matching].sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  return {
    sampleSize: all.length,
    matchingSamples: matching.length,
    distinctDays,
    ratio: roundedRatio(matching.length / all.length),
    firstSeenAt: ordered[0].startedAt,
    lastSeenAt: ordered.at(-1)?.endedAt ?? ordered[0].endedAt
  };
}

function evidenceForEvents(
  all: readonly CaptureRouteActivityEvent[],
  matching: readonly CaptureRouteActivityEvent[],
  distinctDays: number
): HabitEvidence {
  const ordered = [...matching].sort((left, right) => left.at.localeCompare(right.at));
  return {
    sampleSize: all.length,
    matchingSamples: matching.length,
    distinctDays,
    ratio: roundedRatio(matching.length / all.length),
    firstSeenAt: ordered[0].at,
    lastSeenAt: ordered.at(-1)?.at ?? ordered[0].at
  };
}

function roundedRatio(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function normalizeTimeWindow(value: ThreeHourTimeWindow): ThreeHourTimeWindow {
  const startHour = Math.max(0, Math.min(21, Math.floor(value.startHour / 3) * 3));
  return { startHour, endHour: startHour + 3 };
}
