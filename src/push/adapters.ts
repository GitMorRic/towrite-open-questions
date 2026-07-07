import type { Quote0TextPayload } from "../quote0/client";
import type { PushFeedPayload } from "./types";

export interface PushAdapterResult {
  candidateId: string;
  candidateType: PushFeedPayload["decision"]["candidateType"];
  display: PushFeedPayload["display"];
  payload: Quote0TextPayload;
  nfcLink?: string;
  message: string;
}

export function quote0TextApiAdapter(feed: PushFeedPayload, taskKey = "", taskAlias = ""): PushAdapterResult {
  const display = feed.display;
  const taskFields = buildTaskFields(taskKey, taskAlias);
  const styles = quote0StylesForDisplay(display);
  const payload: Quote0TextPayload = {
    refreshNow: true,
    title: quote0TitleForDisplay(display),
    message: [
      quote0MessageForDisplay(display),
      feed.decision.quiet ? "Quiet hours: due item only." : ""
    ].filter(Boolean).join("\n"),
    signature: truncate(display.footer || display.signature, 52),
    icon: normalizeTextApiIcon(display.icon),
    link: display.link,
    ...taskFields,
    styles
  };

  return {
    candidateId: feed.decision.candidateId ?? "",
    candidateType: feed.decision.candidateType,
    display,
    payload,
    nfcLink: display.link,
    message: feed.decision.candidateId ? `Push candidate ${feed.decision.candidateId}` : "No push candidate."
  };
}

function quote0TitleForDisplay(display: PushFeedPayload["display"]): string {
  if (display.variant === "home-summary") {
    return "ToWrite Overview";
  }
  return truncate(display.titleText || display.title, 25);
}

function quote0MessageForDisplay(display: PushFeedPayload["display"]): string {
  if (display.variant === "home-summary") {
    return compactQuote0HomeMessage(display);
  }
  return compactQuote0Message(display);
}

function quote0StylesForDisplay(display: PushFeedPayload["display"]): Quote0TextPayload["styles"] {
  if (display.variant === "home-summary") {
    return {
      title: { fontFamily: "ChillDuanSans", fontSize: 24, fontWeight: 700 },
      message: { fontFamily: "FusionPixel12", fontSize: 15, lineHeight: 1.04 },
      signature: { fontFamily: "ChillDuanSans", fontSize: 12 }
    };
  }
  if (display.variant === "question") {
    return {
      title: { fontFamily: "ChillDuanSans", fontSize: 21, fontWeight: 700 },
      message: { fontFamily: "FusionPixel12", fontSize: 14, lineHeight: 1.08 },
      signature: { fontFamily: "ChillDuanSans", fontSize: 11 }
    };
  }
  return {
    title: { fontFamily: "ChillDuanSans", fontSize: 20, fontWeight: 700 },
    message: { fontFamily: "FusionPixel12", fontSize: 14, lineHeight: 1.08 },
    signature: { fontFamily: "ChillDuanSans", fontSize: 11 }
  };
}

function buildTaskFields(taskKey: string, taskAlias: string): Pick<Quote0TextPayload, "taskKey" | "taskAlias"> {
  const key = taskKey.trim();
  if (key) {
    return { taskKey: key };
  }
  const alias = taskAlias.trim();
  return alias ? { taskAlias: alias } : {};
}

function compactQuote0HomeMessage(display: PushFeedPayload["display"]): string {
  const metrics = metricMap(display);
  const combined = [display.primary, ...display.secondaryLines, display.footer, display.signature].filter(Boolean).join("\n");
  const open = metricValue(metrics, ["open"], fallbackMatch(combined, /(\d+)\s+open/iu, "0"));
  const think = metricValue(metrics, ["tothink", "think"], "0");
  const write = metricValue(metrics, ["towrite", "write"], "0");
  const articles = metricValue(metrics, ["articles"], "0");
  const due = metricValue(metrics, ["due"], fallbackMatch(combined, /(\d+)\s+reminders?\s+due/iu, "0"));
  const stale = metricValue(metrics, ["stale"], "0");
  const workflow = metricValue(metrics, ["workflow"], fallbackMatch(combined, /(\d+)\s+files/iu, "0"));
  const stages = metricValue(metrics, ["stages"], fallbackMatch(combined, /(\d+)\s+stages/iu, "0"));
  return [
    `OPEN ${open} · DUE ${due}`,
    `THINK ${think} · WRITE ${write}`,
    `ARTICLES ${articles} · WORKFLOW ${workflow}`,
    `STALE ${stale} · STAGES ${stages}`
  ].join("\n");
}

function normalizeTextApiIcon(value: string | undefined): string | undefined {
  const icon = value?.trim();
  if (!icon) {
    return undefined;
  }
  if (/^https?:\/\/\S+$/iu.test(icon)) {
    return icon;
  }
  if (/^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/u.test(icon)) {
    return icon;
  }
  if (icon.length >= 80 && /^[A-Za-z0-9+/=\s]+$/u.test(icon)) {
    return icon;
  }
  return undefined;
}

function metricMap(display: PushFeedPayload["display"]): Map<string, string> {
  return new Map(display.metrics.map((metric) => [normalizeMetricLabel(metric.label), String(metric.value)]));
}

function metricValue(metrics: Map<string, string>, labels: string[], fallback: string | undefined): string {
  for (const label of labels) {
    const value = metrics.get(normalizeMetricLabel(label));
    if (value !== undefined) {
      return value;
    }
  }
  return fallback || "0";
}

function fallbackMatch(value: string, pattern: RegExp, fallback: string): string {
  return value.match(pattern)?.[1] ?? fallback;
}

function normalizeMetricLabel(value: string): string {
  return value.toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function compactQuote0Message(display: PushFeedPayload["display"]): string {
  const lines = [
    display.primary,
    ...display.secondaryLines,
    display.metrics.length > 0 ? display.metrics.slice(0, 3).map((metric) => `${metric.label} ${metric.value}`).join(" · ") : ""
  ].filter(Boolean);
  const unique: string[] = [];
  for (const line of lines) {
    const compact = truncate(line, 64);
    if (compact && !unique.includes(compact)) {
      unique.push(compact);
    }
  }
  return unique.slice(0, display.variant === "question" ? 3 : 4).join("\n");
}

function truncate(value: string | undefined, maxLength: number): string {
  const compact = String(value ?? "").replace(/\s+/gu, " ").trim();
  const chars = Array.from(compact);
  if (chars.length <= maxLength) {
    return compact;
  }
  return chars.slice(0, Math.max(0, maxLength - 3)).join("") + "...";
}
