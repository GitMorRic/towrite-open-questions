const DAILY_BLOCK_ID = /(?:\s+|^)(?:\^|#\^?)daily_[A-Za-z0-9_-]+(?:\s+|$)/gu;
const TECHNICAL_FIELD = /%%\s*\[?towrite-[^%\n]+%%|\[towrite-[^\]\n]+\]/giu;

/** Convert a Markdown task label into short text suitable for tiny screens. */
export function dailyDisplayText(value: string): string {
  return value
    .replace(/^\s*(?:[-*+]\s+)?\[[ xX/]\]\s*/u, "")
    .replace(TECHNICAL_FIELD, " ")
    .replace(DAILY_BLOCK_ID, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/gu, "$1")
    .replace(/\[([^\]]+)\]\((?:<[^>]+>|[^)]+)\)/gu, "$1")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?\|([^\]]+)\]\]/gu, "$2")
    .replace(/\[\[([^\]|#]+)(?:#[^\]]+)?\]\]/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}
