const DAILY_ID_RE = /\s*\^daily_[0-9a-f]{32}\s*$/u;
const OWNED_FIELD_RE = /(?:%%\s*)?\[towrite-(?:kind|category|task-ref|pool-revision|work-kind|work-ref|work-revision|device|at|scheduled|due|primary|minimum|goal|next|estimate|target|started)::[^\]]*\](?:\s*%%)?/giu;

export function dailyTaskPreviewIdRange(value: string): { from: number; to: number } | undefined {
  const match = DAILY_ID_RE.exec(value.replace(/\u200b/gu, ""));
  return match ? { from: match.index, to: value.length } : undefined;
}

/** Keep the stable Markdown identity while removing it from rendered prose. */
export function concealDailyTaskTechnicalMetadata(root: HTMLElement): void {
  const walker = root.ownerDocument.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const matches: Array<{ node: Text; from: number }> = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.parentElement?.closest(".towrite-daily-technical-id")) continue;
    node.data = node.data.replace(OWNED_FIELD_RE, "").replace(/^\s*%%\s*%%\s*$/u, "");
    const range = dailyTaskPreviewIdRange(node.data);
    if (range) matches.push({ node, from: range.from });
  }
  for (const { node, from } of matches) {
    if (!node.parentNode) continue;
    const visible = node.data.slice(0, from);
    const hidden = createSpan();
    hidden.className = "towrite-daily-technical-id";
    hidden.setAttribute("aria-hidden", "true");
    hidden.textContent = node.data.slice(from);
    if (visible) node.parentNode.insertBefore(node.ownerDocument.createTextNode(visible), node);
    node.parentNode.insertBefore(hidden, node);
    node.remove();
  }
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("p, li, div"))) {
    if (!element.textContent?.trim() && element.children.length === 0) element.remove();
  }
}
