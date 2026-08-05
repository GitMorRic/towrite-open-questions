import type { DailyPlanningCandidate } from "./daily-dashboard-types";

export interface FocusCarouselMessage {
  id: string;
  source: string;
  text: string;
  detail?: string;
  candidateId?: string;
}

export function buildFocusCarouselMessages(input: {
  theme?: string;
  customMessages: readonly string[];
  candidates: readonly DailyPlanningCandidate[];
}): FocusCarouselMessage[] {
  const output: FocusCarouselMessage[] = [];
  const seen = new Set<string>();
  const append = (message: FocusCarouselMessage): void => {
    const text = message.text.replace(/\s+/gu, " ").trim();
    const key = text.toLocaleLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    output.push({ ...message, text });
  };
  if (input.theme) {
    append({ id: "theme", source: "今日焦点", text: input.theme });
  }
  input.customMessages.forEach((text, index) => {
    append({ id: `custom:${index}`, source: "自定义", text });
  });
  balancedReminderCandidates(input.candidates).forEach((candidate) => append({
      id: candidate.id,
      source: focusCandidateSource(candidate.source),
      text: candidate.title,
      detail: candidate.description,
      candidateId: candidate.id
    }));
  if (output.length === 0) {
    append({ id: "fallback", source: "现在专注", text: "守住现在最重要的一件事" });
  }
  return output.slice(0, 16);
}

function balancedReminderCandidates(
  candidates: readonly DailyPlanningCandidate[]
): DailyPlanningCandidate[] {
  const output: DailyPlanningCandidate[] = [];
  for (const source of ["inbox", "towrite", "tothink", "stale", "echo", "note"] as const) {
    output.push(...candidates.filter((candidate) => candidate.source === source).slice(0, 2));
    if (output.length >= 8) return output.slice(0, 8);
  }
  return output.slice(0, 8);
}

function focusCandidateSource(source: DailyPlanningCandidate["source"]): string {
  if (source === "inbox") return "Inbox";
  if (source === "tothink") return "待思考";
  if (source === "towrite") return "待写";
  if (source === "stale") return "回响";
  if (source === "echo") return "Echo";
  return "提醒";
}
