import type {
  DailyPlanEnrichmentPatch,
  DailyTaskTimingSnapshot,
  NoteTaskSchedulePatch
} from "../daily";

export interface DailyTaskPropertyDraft {
  category: string;
  target: string;
  dueDate: string;
  estimateMinutes: string;
  nextStep: string;
}

export interface NoteTaskScheduleDraft {
  plannedStartAt: string;
  expectedFinishAt: string;
  deadlineAt: string;
}

export interface TaskPropertyDisclosureState {
  targetOpen: boolean;
  nextStepOpen: boolean;
  scheduleOpen: boolean;
}

export function initialTaskPropertyDisclosureState(input: {
  target?: string;
  nextStep?: string;
  plannedStartAt?: string;
  expectedFinishAt?: string;
  deadlineAt?: string;
  timingStatus?: DailyTaskTimingSnapshot["status"];
}): TaskPropertyDisclosureState {
  return {
    targetOpen: Boolean(input.target?.trim()),
    nextStepOpen: Boolean(input.nextStep?.trim()),
    scheduleOpen: Boolean(
      input.plannedStartAt
      || input.expectedFinishAt
      || input.deadlineAt
      || (input.timingStatus && input.timingStatus !== "not-started")
    )
  };
}

export function propertyPatch(draft: DailyTaskPropertyDraft): DailyPlanEnrichmentPatch {
  const estimate = draft.estimateMinutes.trim();
  const estimateMinutes = estimate ? Number(estimate) : null;
  if (estimateMinutes !== null && (!Number.isInteger(estimateMinutes) || estimateMinutes < 1 || estimateMinutes > 1_440)) {
    throw new Error("预计时间必须是 1–1440 之间的整数分钟。");
  }
  const dueDate = draft.dueDate.trim();
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/u.test(dueDate)) {
    throw new Error("截止日期必须使用 YYYY-MM-DD。");
  }
  return {
    category: draft.category.trim() || null,
    target: draft.target.trim() || null,
    dueDate: dueDate || null,
    estimateMinutes,
    nextStep: draft.nextStep.trim() || null
  };
}

/**
 * Ordinary-note tasks use the precise DDL field as their single deadline.
 * Daily plan items still use the date-only field through `propertyPatch`.
 */
export function noteTaskPropertyPatch(draft: DailyTaskPropertyDraft): DailyPlanEnrichmentPatch {
  return {
    ...propertyPatch(draft),
    dueDate: null
  };
}

/** One-time, lossless migration of the removed date-only ordinary-task field. */
export function initialNoteTaskDeadline(
  deadlineAt: string | undefined,
  legacyDueDate: string | undefined
): string {
  return deadlineAt ?? (legacyDueDate ? `${legacyDueDate}T23:59` : "");
}

export function noteTaskSchedulePatch(draft: NoteTaskScheduleDraft): NoteTaskSchedulePatch {
  const plannedStartAt = normalizeLocalDateTime(draft.plannedStartAt, "计划开始");
  const expectedFinishAt = normalizeLocalDateTime(draft.expectedFinishAt, "预计完成");
  const deadlineAt = normalizeLocalDateTime(draft.deadlineAt, "DDL");
  if (
    plannedStartAt
    && expectedFinishAt
    && Date.parse(expectedFinishAt) < Date.parse(plannedStartAt)
  ) {
    throw new Error("预计完成时间不能早于计划开始时间。");
  }
  return {
    plannedStartAt,
    expectedFinishAt,
    deadlineAt
  };
}

function normalizeLocalDateTime(value: string, label: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(normalized)) {
    throw new Error(`${label}必须使用完整的日期与时间。`);
  }
  const parsed = new Date(normalized);
  const roundTrip = !Number.isNaN(parsed.getTime())
    ? `${parsed.getFullYear().toString().padStart(4, "0")}-${(parsed.getMonth() + 1).toString().padStart(2, "0")}-${parsed.getDate().toString().padStart(2, "0")}T${parsed.getHours().toString().padStart(2, "0")}:${parsed.getMinutes().toString().padStart(2, "0")}`
    : "";
  if (roundTrip !== normalized) throw new Error(`${label}无效。`);
  return normalized;
}
