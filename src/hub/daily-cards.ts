import type { LocalHubCandidate } from "./privacy";
import {
  dailyDevicePagingLocalId,
  type DailyDevicePagingItem,
  type DailyDevicePolicy
} from "./device-paging";
import type {
  HubContentAction,
  HubContextState,
  HubPolicyBasis
} from "./types";

export type DailyPlanDeviceKind = "task" | "create_note" | "edit_note" | "send_card";

export type DailyDeckPageKind =
  | "daily_overview"
  | "daily_plan_item"
  | "daily_inbox"
  | "daily_result";

export interface DailyDeckTimingInput {
  state: "idle" | "running" | "paused" | "completed" | "needs-review";
  activeSeconds: number;
  wallClockSeconds?: number;
  interruptionCount?: number;
  firstStartedAt?: string;
  activeSince?: string;
  completedAt?: string;
  timingRevision?: string;
}

export interface DailyDeckPlanItemInput {
  id: string;
  text: string;
  kind: DailyPlanDeviceKind;
  status: "todo" | "in-progress" | "done";
  taskRevision: string;
  primary?: boolean;
  minimum?: boolean;
  goal?: string;
  nextStep?: string;
  estimateMinutes?: number;
  target?: string;
  startedAt?: string;
  groupLabel?: string;
  projectId?: string;
  projectLabel?: string;
  projectColor?: string;
  targetLabel?: string;
  targetProvenance?: "explicit" | "task-link" | "ancestor-link" | "task-block" | "dashboard";
  lineageRevision?: string;
  timing?: DailyDeckTimingInput;
}

export interface DailyDeckTaskSummary {
  id: string;
  text: string;
  status: DailyDeckPlanItemInput["status"];
  primary: boolean;
  minimum: boolean;
  groupLabel?: string;
  projectId?: string;
  projectLabel?: string;
  projectColor?: string;
  targetLabel?: string;
}

export type DailyInboxItemSource = "rule" | "ai" | "human" | "inbox" | "system";

export interface DailyDeckInboxItemInput {
  id: string;
  source: DailyInboxItemSource;
  title: string;
  detail?: string;
  reason?: string;
  generatedAt?: string;
}

export interface DailyInboxItemSummary extends DailyDeckInboxItemInput {
  aiGenerated: boolean;
}

export interface DailyOverviewCard {
  page: "daily_overview";
  /** Opaque local navigation identity: `daily-overview:YYYY-MM-DD`. */
  localId: string;
  cardId: string;
  date: string;
  theme?: string;
  current?: DailyDeckTaskSummary & {
    goal?: string;
    nextStep?: string;
    estimateMinutes?: number;
    groupLabel?: string;
    targetLabel?: string;
    timing?: DailyDeckTimingInput;
  };
  /** At most the two unfinished tasks after the current item. */
  upcoming: DailyDeckTaskSummary[];
  progress: {
    done: number;
    total: number;
  };
  projects: Array<{
    id: string;
    label: string;
    color?: string;
    done: number;
    total: number;
  }>;
  /** Optional telemetry reported by the device; absent renders as `--%`. */
  batteryPercent?: number;
}

export interface DailyPlanItemCard {
  page: "daily_plan_item";
  /** Reuses the compatibility identity: `daily-plan:<task-id>`. */
  localId: string;
  cardId: string;
  date: string;
  position: number;
  total: number;
  item: DailyDeckTaskSummary & {
    kind: DailyPlanDeviceKind;
    taskRevision: string;
    goal?: string;
    nextStep?: string;
    estimateMinutes?: number;
    target?: string;
    startedAt?: string;
    groupLabel?: string;
    targetLabel?: string;
    targetProvenance?: DailyDeckPlanItemInput["targetProvenance"];
    lineageRevision?: string;
    timing?: DailyDeckTimingInput;
  };
}

export interface DailyResultCard {
  page: "daily_result";
  /** Opaque local navigation identity: `daily-result:YYYY-MM-DD`. */
  localId: string;
  cardId: string;
  date: string;
  completed: DailyDeckTaskSummary[];
  remaining: DailyDeckTaskSummary[];
  progress: {
    done: number;
    total: number;
  };
}

export interface DailyInboxCard {
  page: "daily_inbox";
  localId: string;
  cardId: string;
  date: string;
  position: number;
  total: number;
  item?: DailyInboxItemSummary;
}

export interface DailyDeckSnapshot {
  schemaVersion: 1;
  date: string;
  theme?: string;
  currentItemId?: string;
  overview: DailyOverviewCard;
  planItems: DailyPlanItemCard[];
  /** The task card initially shown on the single task page. */
  activePlanItem?: DailyPlanItemCard;
  inboxItems: DailyInboxCard[];
  activeInboxItem: DailyInboxCard;
  /** Legacy aggregate kept for API compatibility; it is no longer a device page. */
  result: DailyResultCard;
  /** Exactly three device page modes; item navigation changes task/inbox cards. */
  pageOrder: readonly ["daily_overview", "daily_plan_item", "daily_inbox"];
  /** Every generated card; unlike pageOrder this includes all task cards. */
  cards: Array<DailyOverviewCard | DailyPlanItemCard | DailyInboxCard>;
}

export interface DailyDeckBuildInput {
  date: string;
  theme?: string;
  items: readonly DailyDeckPlanItemInput[];
  inboxItems?: readonly DailyDeckInboxItemInput[];
  batteryPercent?: number;
}

export interface DailyPlanDeviceInput {
  id: string;
  kind: DailyPlanDeviceKind;
  status: string;
  devicePolicy: DailyDevicePolicy;
  /** Immutable hash/revision of the Markdown task line used for conflict checks. */
  taskRevision: string;
  display: {
    title?: string;
    body?: string;
    prompt?: string;
  };
  sourceLocalId?: string;
  writeTargetLocalId?: string;
  allowedActions?: readonly HubContentAction[];
  reasonCode?: string;
  score?: number;
  policyBasis?: HubPolicyBasis;
  urgency?: number;
  contextStates?: readonly HubContextState[];
  availableAt?: string;
  expiresAt?: string;
  privacy?: LocalHubCandidate["privacy"];
}

export interface DailySummaryDeviceInput {
  id: string;
  devicePolicy: DailyDevicePolicy;
  display: {
    title?: string;
    body?: string;
    prompt?: string;
  };
  sourceLocalId?: string;
  allowedActions?: readonly HubContentAction[];
  reasonCode?: string;
  score?: number;
  expiresAt?: string;
  privacy?: LocalHubCandidate["privacy"];
}

export interface DailyPlanDeviceAdapter {
  localId: string;
  taskRevision: string;
  pagingItem: DailyDevicePagingItem;
  /** Undefined for completed/skipped items or a policy of `none`. */
  candidate?: LocalHubCandidate;
}

export interface DailySummaryDeviceAdapter {
  localId: string;
  pagingItem: DailyDevicePagingItem;
  /** Undefined for a policy of `none`. */
  candidate?: LocalHubCandidate;
}

/**
 * Builds the three-page Daily device model without applying delivery policy.
 *
 * Markdown order is preserved. The current item is the first in-progress
 * item, then the explicit primary item, then the first unfinished item.
 * Progress always includes every item, even though the overview only shows
 * the current item and two upcoming items.
 */
export function buildDailyDeckSnapshot(input: DailyDeckBuildInput): DailyDeckSnapshot {
  const date = requiredDate(input.date);
  const items = input.items.map(normalizeDeckItem);
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("Daily deck item identifiers must be unique.");
  }
  const unfinished = items.filter((item) => item.status !== "done");
  const current = unfinished.find((item) => item.status === "in-progress")
    ?? unfinished.find((item) => item.primary)
    ?? unfinished[0];
  const orderedUpcoming = current
    ? [current, ...unfinished.filter((item) => item.id !== current.id)]
    : [];
  const summaries = new Map(items.map((item) => [item.id, summarizeDeckItem(item)]));
  const done = items.filter((item) => item.status === "done").length;
  const progress = { done, total: items.length };
  const projects = buildProjectProgress(items);
  const overviewLocalId = dailyOverviewCardLocalId(date);
  const overview: DailyOverviewCard = {
    page: "daily_overview",
    localId: overviewLocalId,
    cardId: overviewLocalId,
    date,
    theme: optionalLine(input.theme),
    current: current
      ? {
          ...summaries.get(current.id)!,
          goal: optionalLine(current.goal),
          nextStep: optionalLine(current.nextStep),
          estimateMinutes: positiveInteger(current.estimateMinutes),
          groupLabel: optionalLine(current.groupLabel),
          targetLabel: optionalLine(current.targetLabel),
          timing: normalizeTiming(current.timing)
        }
      : undefined,
    upcoming: orderedUpcoming.slice(1, 3).map((item) => summaries.get(item.id)!),
    progress,
    projects,
    batteryPercent: normalizedBatteryPercent(input.batteryPercent)
  };
  const planItems: DailyPlanItemCard[] = items.map((item, index) => {
    const localId = dailyDevicePagingLocalId({
      id: item.id,
      contentType: "daily_plan_item"
    });
    return {
      page: "daily_plan_item",
      localId,
      cardId: localId,
      date,
      position: index + 1,
      total: items.length,
      item: {
        ...summaries.get(item.id)!,
        kind: item.kind,
        taskRevision: item.taskRevision,
        goal: optionalLine(item.goal),
        nextStep: optionalLine(item.nextStep),
        estimateMinutes: positiveInteger(item.estimateMinutes),
        target: optionalLine(item.target),
        startedAt: optionalIsoDateTime(item.startedAt),
        groupLabel: optionalLine(item.groupLabel),
        targetLabel: optionalLine(item.targetLabel),
        targetProvenance: normalizeTargetProvenance(item.targetProvenance),
        lineageRevision: optionalIdentifier(item.lineageRevision),
        timing: normalizeTiming(item.timing)
      }
    };
  });
  const resultLocalId = dailyResultCardLocalId(date);
  const result: DailyResultCard = {
    page: "daily_result",
    localId: resultLocalId,
    cardId: resultLocalId,
    date,
    completed: items
      .filter((item) => item.status === "done")
      .map((item) => summaries.get(item.id)!),
    remaining: unfinished.map((item) => summaries.get(item.id)!),
    progress
  };
  const inboxInputs = (input.inboxItems ?? []).map(normalizeInboxItem);
  const inboxItems: DailyInboxCard[] = inboxInputs.length
    ? inboxInputs.map((item, index) => {
        const localId = dailyInboxCardLocalId(date, item.id);
        return {
          page: "daily_inbox" as const,
          localId,
          cardId: localId,
          date,
          position: index + 1,
          total: inboxInputs.length,
          item
        };
      })
    : [{
        page: "daily_inbox",
        localId: dailyInboxCardLocalId(date, "empty"),
        cardId: dailyInboxCardLocalId(date, "empty"),
        date,
        position: 0,
        total: 0
      }];
  return {
    schemaVersion: 1,
    date,
    theme: optionalLine(input.theme),
    currentItemId: current?.id,
    overview,
    planItems,
    activePlanItem: current
      ? planItems.find((card) => card.item.id === current.id)
      : planItems[0],
    inboxItems,
    activeInboxItem: inboxItems[0],
    result,
    pageOrder: ["daily_overview", "daily_plan_item", "daily_inbox"],
    cards: [overview, ...planItems, ...inboxItems]
  };
}

export function dailyOverviewCardLocalId(date: string): string {
  return `daily-overview:${requiredDate(date)}`;
}

export function dailyResultCardLocalId(date: string): string {
  return `daily-result:${requiredDate(date)}`;
}

export function dailyInboxCardLocalId(date: string, itemId: string): string {
  return `daily-inbox:${requiredDate(date)}:${stableFragment(itemId)}`;
}

function buildProjectProgress(items: readonly DailyDeckPlanItemInput[]): DailyOverviewCard["projects"] {
  const projects = new Map<string, DailyOverviewCard["projects"][number]>();
  for (const item of items) {
    const label = optionalLine(item.projectLabel) || optionalLine(item.groupLabel) || "未分类";
    const id = normalizedProjectIdentifier(item.projectId) || stableFragment(label);
    const existing = projects.get(id);
    if (existing) {
      existing.total += 1;
      if (item.status === "done") existing.done += 1;
      continue;
    }
    projects.set(id, {
      id,
      label,
      color: normalizedColor(item.projectColor),
      done: item.status === "done" ? 1 : 0,
      total: 1
    });
  }
  return [...projects.values()];
}

function normalizeInboxItem(item: DailyDeckInboxItemInput): DailyInboxItemSummary {
  return {
    id: item.id.trim() || "empty",
    source: item.source,
    title: optionalLine(item.title) || "提醒",
    detail: optionalLine(item.detail),
    reason: optionalLine(item.reason),
    generatedAt: optionalIsoDateTime(item.generatedAt),
    aiGenerated: item.source === "ai"
  };
}

function normalizedBatteryPercent(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value!))) : undefined;
}

function normalizedColor(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLocaleLowerCase();
  return normalized && /^#[0-9a-f]{6}$/u.test(normalized) ? normalized : undefined;
}

function stableFragment(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Creates the privacy-gated Hub candidate and compatibility paging record
 * without importing the DailyPlanService. The caller retains taskRevision
 * locally and must compare it again before applying `complete`.
 */
export function adaptDailyPlanItemForDevice(
  input: DailyPlanDeviceInput
): DailyPlanDeviceAdapter {
  const id = requiredIdentifier(input.id, "Daily plan item");
  const taskRevision = requiredIdentifier(input.taskRevision, "Daily task revision");
  const pagingItem: DailyDevicePagingItem = {
    id,
    contentType: "daily_plan_item",
    devicePolicy: input.devicePolicy,
    status: input.status
  };
  const localId = dailyDevicePagingLocalId(pagingItem);
  const finished = input.status === "done" || input.status === "skipped";
  const candidate: LocalHubCandidate | undefined = input.devicePolicy === "none" || finished
    ? undefined
    : {
        localId,
        type: "daily_plan_item",
        display: { ...input.display },
        sourceLocalId: input.sourceLocalId ?? id,
        writeTargetLocalId: input.writeTargetLocalId ?? id,
        allowedActions: normalizeDailyActions(
          input.allowedActions,
          ["capture", "complete", "later"],
          true
        ),
        reasonCode: input.reasonCode ?? `daily_${input.devicePolicy}`,
        score: finiteOr(input.score, defaultScore(input.devicePolicy)),
        policyBasis: input.policyBasis,
        urgency: input.urgency,
        contextStates: input.contextStates ? [...input.contextStates] : undefined,
        availableAt: input.availableAt,
        expiresAt: input.expiresAt,
        privacy: input.privacy
      };
  return { localId, taskRevision, pagingItem, candidate };
}

export function adaptDailySummaryForDevice(
  input: DailySummaryDeviceInput
): DailySummaryDeviceAdapter {
  const id = requiredIdentifier(input.id, "Daily summary");
  const pagingItem: DailyDevicePagingItem = {
    id,
    contentType: "daily_summary",
    devicePolicy: input.devicePolicy
  };
  const localId = dailyDevicePagingLocalId(pagingItem);
  const candidate: LocalHubCandidate | undefined = input.devicePolicy === "none"
    ? undefined
    : {
        localId,
        type: "daily_summary",
        display: { ...input.display },
        sourceLocalId: input.sourceLocalId ?? id,
        allowedActions: normalizeDailyActions(
          input.allowedActions,
          ["open", "capture", "later"],
          false
        ),
        reasonCode: input.reasonCode ?? `daily_summary_${input.devicePolicy}`,
        score: finiteOr(input.score, defaultScore(input.devicePolicy)),
        policyBasis: "general" as const,
        privacy: input.privacy,
        expiresAt: input.expiresAt
      };
  return { localId, pagingItem, candidate };
}

function normalizeDailyActions(
  actions: readonly HubContentAction[] | undefined,
  fallback: readonly HubContentAction[],
  allowComplete: boolean
): HubContentAction[] {
  const source = actions?.length ? actions : fallback;
  const allowed = new Set<HubContentAction>([
    "respond",
    "capture",
    "open",
    "next",
    "useful",
    "later",
    "skip",
    ...(allowComplete ? ["complete" as const] : [])
  ]);
  const normalized = [...new Set(source)].filter((action) => allowed.has(action)).slice(0, 3);
  return normalized.length ? normalized : [...fallback];
}

function defaultScore(policy: DailyDevicePolicy): number {
  if (policy === "manual") return 1;
  if (policy === "scheduled") return 0.95;
  if (policy === "agent") return 0.7;
  if (policy === "rotation") return 0.5;
  return 0;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value as number : fallback;
}

function requiredIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized)) {
    throw new Error(`${label} needs a stable identifier.`);
  }
  return normalized;
}

function requiredDate(value: string): string {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
    throw new Error("Daily deck needs a local YYYY-MM-DD date.");
  }
  return normalized;
}

function normalizeDeckItem(
  item: DailyDeckPlanItemInput,
  index: number
): DailyDeckPlanItemInput {
  const id = requiredIdentifier(item.id, `Daily deck item ${index + 1}`);
  const taskRevision = requiredIdentifier(
    item.taskRevision,
    `Daily deck item ${index + 1} revision`
  );
  const text = optionalLine(item.text);
  if (!text) {
    throw new Error(`Daily deck item ${index + 1} needs display text.`);
  }
  return {
    ...item,
    id,
    taskRevision,
    text,
    projectId: normalizedProjectIdentifier(item.projectId),
    projectLabel: optionalLine(item.projectLabel),
    projectColor: normalizedColor(item.projectColor),
    primary: item.primary === true,
    minimum: item.minimum === true
  };
}

function summarizeDeckItem(item: DailyDeckPlanItemInput): DailyDeckTaskSummary {
  return {
    id: item.id,
    text: item.text,
    status: item.status,
    primary: item.primary === true,
    minimum: item.minimum === true,
    groupLabel: optionalLine(item.groupLabel),
    projectId: item.projectId,
    projectLabel: optionalLine(item.projectLabel),
    projectColor: normalizedColor(item.projectColor),
    targetLabel: optionalLine(item.targetLabel)
  };
}

function normalizedProjectIdentifier(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return /^[A-Za-z0-9._:-]+$/u.test(normalized) ? normalized : stableFragment(normalized);
}

function optionalLine(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/gu, " ").trim();
  return normalized || undefined;
}

function positiveInteger(value: number | undefined): number | undefined {
  if (!Number.isFinite(value) || (value as number) <= 0) return undefined;
  return Math.round(value as number);
}

function optionalIsoDateTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function optionalIdentifier(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  return requiredIdentifier(value, "Daily lineage revision");
}

function normalizeTargetProvenance(
  value: DailyDeckPlanItemInput["targetProvenance"]
): DailyDeckPlanItemInput["targetProvenance"] {
  return value === "explicit"
    || value === "task-link"
    || value === "ancestor-link"
    || value === "task-block"
    || value === "dashboard"
    ? value
    : undefined;
}

function normalizeTiming(value: DailyDeckTimingInput | undefined): DailyDeckTimingInput | undefined {
  if (!value) return undefined;
  const activeSeconds = Math.max(0, Math.floor(finiteOr(value.activeSeconds, 0)));
  const wallClockSeconds = value.wallClockSeconds === undefined
    ? undefined
    : Math.max(0, Math.floor(finiteOr(value.wallClockSeconds, 0)));
  const interruptionCount = value.interruptionCount === undefined
    ? undefined
    : Math.max(0, Math.floor(finiteOr(value.interruptionCount, 0)));
  return {
    state: value.state,
    activeSeconds,
    wallClockSeconds,
    interruptionCount,
    firstStartedAt: optionalIsoDateTime(value.firstStartedAt),
    activeSince: optionalIsoDateTime(value.activeSince),
    completedAt: optionalIsoDateTime(value.completedAt),
    timingRevision: optionalIdentifier(value.timingRevision)
  };
}
