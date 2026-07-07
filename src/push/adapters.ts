import type { Quote0TextPayload } from "../quote0/client";
import type { PushFeedPayload } from "./types";

export interface PushAdapterResult {
  candidateId: string;
  candidateType: PushFeedPayload["decision"]["candidateType"];
  payload: Quote0TextPayload;
  nfcLink?: string;
  message: string;
}

export function quote0TextApiAdapter(feed: PushFeedPayload, taskKey = "", taskAlias = ""): PushAdapterResult {
  const display = feed.display;
  const payload: Quote0TextPayload = {
    refreshNow: true,
    title: truncate(display.title, 26),
    message: [
      truncate(display.message, 150),
      feed.decision.quiet ? "Quiet hours: due item only." : ""
    ].filter(Boolean).join("\n"),
    signature: truncate(display.signature, 48),
    link: display.link,
    taskKey: taskKey.trim() || undefined,
    taskAlias: taskAlias.trim() || undefined,
    styles: {
      title: { fontFamily: "ChillDuanSans", fontSize: 22, fontWeight: 700 },
      message: { fontFamily: "FusionPixel12", fontSize: 16, lineHeight: 1.12 },
      signature: { fontFamily: "ChillDuanSans", fontSize: 12 }
    }
  };

  return {
    candidateId: feed.decision.candidateId ?? "",
    candidateType: feed.decision.candidateType,
    payload,
    nfcLink: display.link,
    message: feed.decision.candidateId ? `Push candidate ${feed.decision.candidateId}` : "No push candidate."
  };
}

function truncate(value: string | undefined, maxLength: number): string {
  const compact = String(value ?? "").replace(/\s+/gu, " ").trim();
  const chars = Array.from(compact);
  if (chars.length <= maxLength) {
    return compact;
  }
  return chars.slice(0, Math.max(0, maxLength - 3)).join("") + "...";
}

