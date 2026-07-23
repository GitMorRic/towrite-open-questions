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
