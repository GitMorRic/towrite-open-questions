import type { DeviceCardItem, DeviceFeedPayload } from "../external/device-feed";
import type { Quote0TextPayload } from "./client";

export interface Quote0FormatOptions {
  nfcBaseUrl?: string;
  nfcToken?: string;
  taskKey?: string;
  taskAlias?: string;
  index?: number;
  total?: number;
  generatedAt?: string;
  sourceContexts?: Record<string, Quote0SourceContext>;
}

export interface Quote0SourceContext {
  sourceTitle?: string;
  workflowStageId?: string;
  workflowStageTitle?: string;
  workflowNextAction?: string;
  tags?: string[];
}

export interface Quote0FormattedContent {
  payload: Quote0TextPayload;
  questionId: string;
  nfcLink?: string;
}

export function formatQuote0DeviceFeed(
  feed: DeviceFeedPayload,
  options: Quote0FormatOptions
): Quote0FormattedContent {
  const card = findFirstCard(feed);
  if (!card) {
    return {
      questionId: "",
      nfcLink: buildQuote0InputUrl(options.nfcBaseUrl, options.nfcToken),
      payload: withTaskFields({
        refreshNow: true,
        title: "ToWrite",
        message: "No open ToThink / ToWrite cards.",
        signature: formatGeneratedAt(options.generatedAt ?? feed.generatedAt),
        link: buildQuote0InputUrl(options.nfcBaseUrl, options.nfcToken),
        styles: defaultTextStyles()
      }, options)
    };
  }

  const nfcLink = card.answerUrl || buildQuote0InputUrl(options.nfcBaseUrl, options.nfcToken, card.id);
  const context = options.sourceContexts?.[card.sourceFile];
  const title = truncateText(card.title || card.body || displayNameForPath(card.sourceFile), 24);
  const cue = cleanMemoryCue(card.note);
  const message = [
    truncateText(card.body, 72),
    context?.workflowNextAction && !sameText(context.workflowNextAction, card.body) ? `Next: ${truncateText(context.workflowNextAction, 42)}` : "",
    cue ? `Memo: ${truncateText(cue, 42)}` : "",
    card.reminderAt ? `Remind: ${truncateText(card.reminderNote || card.reminderAt, 38)}` : "",
    compactTags(context?.tags ?? card.tags)
  ].filter(Boolean).slice(0, 4).join("\n");
  const position = options.total && options.total > 0 && options.index !== undefined
    ? `${Math.min(options.index + 1, options.total)} / ${options.total}`
    : "";
  const lane = card.lane === "think" ? "ToThink" : "ToWrite";
  const status = card.status && card.status !== "open" ? card.status : "";
  const source = context?.workflowStageTitle || context?.sourceTitle || displayNameForPath(card.sourceFile);
  const signature = truncateText([position, lane, status, source].filter(Boolean).join(" · "), 44);

  return {
    questionId: card.id,
    nfcLink,
    payload: withTaskFields({
      refreshNow: true,
      title,
      message,
      signature,
      link: nfcLink,
      styles: defaultTextStyles()
    }, options)
  };
}

export function buildQuote0InputUrl(baseUrl?: string, token?: string, questionId?: string): string | undefined {
  const normalizedBase = baseUrl?.trim().replace(/\/+$/u, "");
  const normalizedToken = token?.trim();
  if (!normalizedBase || !normalizedToken) {
    return undefined;
  }

  const params = new URLSearchParams();
  params.set("token", normalizedToken);
  if (questionId) {
    params.set("questionId", questionId);
  }
  return `${normalizedBase}/device/input?${params.toString()}`;
}

function findFirstCard(feed: DeviceFeedPayload): DeviceCardItem | undefined {
  const screen = feed.screens[0];
  const item = screen?.items.find((candidate): candidate is DeviceCardItem => candidate.type === "card");
  return item;
}

function withTaskFields(payload: Quote0TextPayload, options: Quote0FormatOptions): Quote0TextPayload {
  const taskKey = options.taskKey?.trim();
  const taskAlias = options.taskAlias?.trim();
  return {
    ...payload,
    taskKey: taskKey || undefined,
    taskAlias: taskKey ? undefined : taskAlias || undefined
  };
}

function defaultTextStyles(): Quote0TextPayload["styles"] {
  return {
    title: { fontFamily: "ChillDuanSans", fontSize: 22, fontWeight: 700 },
    message: { fontFamily: "FusionPixel12", fontSize: 16, lineHeight: 1.12 },
    signature: { fontFamily: "ChillDuanSans", fontSize: 12 }
  };
}

function formatGeneratedAt(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Date(timestamp).toLocaleString();
}

function truncateText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/gu, " ").trim();
  const chars = Array.from(compact);
  if (chars.length <= maxLength) {
    return compact;
  }
  return chars.slice(0, Math.max(0, maxLength - 3)).join("") + "...";
}

function cleanMemoryCue(value: string | undefined): string {
  const compact = value?.replace(/\s+/gu, " ").trim() ?? "";
  if (!compact) {
    return "";
  }

  const readable = compact
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/gu, "$2")
    .replace(/\[\[([^\]]+)\]\]/gu, (_match, path: string) => displayNameForPath(path))
    .replace(/`+/gu, "")
    .trim();

  if (!readable || looksLikePath(readable)) {
    return displayNameForPath(readable);
  }
  return readable;
}

function compactTags(tags: string[]): string {
  return tags.length > 0 ? tags.slice(0, 3).map((tag) => `#${tag.replace(/^#/u, "")}`).join(" ") : "";
}

function displayNameForPath(value: string): string {
  const normalized = value
    .replace(/\.[a-z0-9]+$/iu, "")
    .replace(/\\/gu, "/")
    .replace(/^\/+|\/+$/gu, "");
  const parts = normalized.split("/").filter(Boolean);
  const leaf = parts.at(-1) || normalized;
  const display = leaf.toLowerCase() === "index" && parts.length > 1 ? parts.at(-2) || leaf : leaf;
  return display.replace(/[_-]+/gu, " ").trim();
}

function looksLikePath(value: string): boolean {
  return /[/\\]/u.test(value) || /^\w+:\/\//u.test(value);
}

function sameText(left: string, right: string): boolean {
  return left.replace(/\s+/gu, " ").trim().toLowerCase() === right.replace(/\s+/gu, " ").trim().toLowerCase();
}
