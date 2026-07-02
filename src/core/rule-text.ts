import type { OpenQuestionRule } from "./types";

export function stripQuestionRuleSyntax(text: string, rule?: OpenQuestionRule): string {
  if (rule && rule !== "double-question" && rule !== "task-question") {
    return text.trim();
  }

  const cleaned = text
    .trim()
    .replace(/^\?\?\s+/u, "")
    .replace(/^[-*+]\s+\[[ xX]\]\s+\[\?\]\s+/u, "")
    .replace(/\s*\^[\p{L}\p{N}_-]+(?=\s|$)/gu, "")
    .replace(/\[(qid|kind|status|priority|title|tags|color|lane|type)::\s*([^\]]+)\]/giu, "")
    .replace(/#open-question\b/giu, "")
    .replace(/\s+/gu, " ")
    .trim();

  return cleaned || text.trim();
}
