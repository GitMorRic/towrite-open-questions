const LEGACY_FIELD_RE = /^\[towrite-[a-z-]+::[\s\S]*\]$/iu;
const COMMENT_FIELD_RE = /^%%\s*\[towrite-[a-z-]+::[\s\S]*\]\s*%%$/iu;
const TASK_ID_RE = /^\^task_[A-Za-z0-9_-]+$/u;
const TRAILING_TASK_ID_RE = /\s+\^task_[A-Za-z0-9_-]+\s*$/u;

export function isTaskPoolTechnicalLine(value: string): boolean {
  const text = value.replace(/\u200b/gu, "").trim();
  return COMMENT_FIELD_RE.test(text) || LEGACY_FIELD_RE.test(text) || TASK_ID_RE.test(text);
}

export function taskPoolTrailingIdRange(value: string): { from: number; to: number } | undefined {
  const match = TRAILING_TASK_ID_RE.exec(value.replace(/\u200b/gu, ""));
  return match ? { from: match.index, to: value.length } : undefined;
}

/**
 * Legacy task-pool files used visible Dataview-style fields. New writes use
 * Obsidian comments, but this post processor keeps old files clean before the
 * user next edits them. Only complete technical lines are hidden.
 */
export function concealTaskPoolTechnicalMetadata(root: HTMLElement): void {
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("p, span, pre"))) {
    if (isTaskPoolTechnicalLine(element.textContent ?? "")) {
      element.classList.add("towrite-task-pool-technical-line");
      element.setAttribute("aria-hidden", "true");
    }
  }
  const containers = [
    root,
    ...Array.from(root.querySelectorAll<HTMLElement>("li, p, div"))
  ];
  for (const container of containers) concealDirectLines(container);
  concealTrailingTaskIds(root);
}

function concealTrailingTaskIds(root: HTMLElement): void {
  const walker = root.ownerDocument.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const matches: Array<{ node: Text; from: number }> = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (!parent || parent.closest(".towrite-task-pool-technical-line")) continue;
    const range = taskPoolTrailingIdRange(node.data);
    if (range) matches.push({ node, from: range.from });
  }
  for (const { node, from } of matches) {
    if (!node.parentNode) continue;
    const visible = node.data.slice(0, from);
    const hidden = node.ownerDocument.createElement("span");
    hidden.className = "towrite-task-pool-technical-line";
    hidden.setAttribute("aria-hidden", "true");
    hidden.textContent = node.data.slice(from);
    if (visible) node.parentNode.insertBefore(node.ownerDocument.createTextNode(visible), node);
    node.parentNode.insertBefore(hidden, node);
    node.remove();
  }
}

function concealDirectLines(container: HTMLElement): void {
  const lines: Array<{ nodes: Node[]; separator?: HTMLBRElement }> = [];
  let current: Node[] = [];
  for (const node of Array.from(container.childNodes)) {
    if (node.nodeName === "BR") {
      lines.push({ nodes: current, separator: node as HTMLBRElement });
      current = [];
    } else {
      current.push(node);
    }
  }
  lines.push({ nodes: current });

  for (const line of lines) {
    if (!line.nodes.length) continue;
    const text = line.nodes.map((node) => node.textContent ?? "").join("");
    if (!isTaskPoolTechnicalLine(text)) continue;
    const first = line.nodes[0];
    if (!first.parentNode || first.parentNode !== container) continue;
    const wrapper = container.ownerDocument.createElement("span");
    wrapper.className = "towrite-task-pool-technical-line";
    wrapper.setAttribute("aria-hidden", "true");
    container.insertBefore(wrapper, first);
    for (const node of line.nodes) wrapper.appendChild(node);
    if (line.separator?.parentNode === container) wrapper.appendChild(line.separator);
  }
}
