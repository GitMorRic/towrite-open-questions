import { contentHash128 } from "../core/hash";
import {
  DAILY_SCHEMA_VERSION,
  type DailyMarkdownTarget,
  type DailyPlanGroup,
  type DailyPlanHierarchy,
  type DailyPlanHierarchyDiagnostic,
  type DailyPlanHierarchyTask,
  type DailyPlanSource,
  type DailyPlanStatus
} from "./types";
import {
  createDailyLineage,
  extractExplicitDailyTarget,
  parseDailyMarkdownTargets,
  resolveDailyTarget
} from "./target-resolver";

const LIST_RE = /^(?<indent>[ \t]*)(?<marker>(?:[-+*]|\d+[.)]))[ \t]+(?:(?<checkbox>\[(?<mark>[^\]])\])[ \t]+)?(?<body>.*)$/u;
const STANDALONE_BLOCK_RE = /^(?<indent>[ \t]+)\^(?<id>[A-Za-z0-9_-]+)\s*$/u;
const INLINE_BLOCK_RE = /(?:^|\s)\^(?<id>[A-Za-z0-9_-]+)\s*$/u;
const OWNED_FIELD_RE = /\[towrite-(?<key>kind|category|task-ref|pool-revision|work-kind|work-ref|work-revision|device|at|scheduled|due|primary|minimum|goal|next|estimate|target|started)::\s*(?<value>\[\[[^\]]+\]\]|[^\]]*)\]/giu;
const MARKDOWN_LINK_LIKE_RE = /(?<!!)\[[^\]\r\n]*\]\((?<target>[^)\r\n]+)\)/gu;

export interface DailyPlanHierarchyParseOptions {
  source?: DailyPlanSource;
  todoHeading?: string;
  /**
   * Compatibility heading used by Obsidian Daily-note templates that keep
   * their editable checklist directly under "今日计划". The canonical ToDo
   * section still wins whenever it contains list items.
   */
  planHeading?: string;
  /** Optional local-vault check. It is never invoked for rejected targets. */
  targetExists?: (target: DailyMarkdownTarget) => boolean;
}

interface ListNode {
  index: number;
  line: number;
  indent: number;
  depth: number;
  marker: string;
  checkbox: boolean;
  mark?: string;
  body: string;
  rawLine: string;
  parent?: ListNode;
  children: ListNode[];
  directLines: number[];
  blockIds: string[];
  blockIdLines: number[];
  endIndex: number;
  group?: DailyPlanGroup;
}

interface TodoScope {
  start: number;
  end: number;
  rawStart: number;
  rawEnd: number;
}

export function parseDailyPlanHierarchy(
  markdown: string,
  sourcePath: string,
  date: string,
  options: DailyPlanHierarchyParseOptions = {}
): DailyPlanHierarchy {
  const normalizedDate = normalizeDate(date);
  const source = normalizeSource(options.source);
  const lines = markdown.split(/\r?\n/u);
  const canonicalScope = findTodoScope(lines, normalizedDate, source, options.todoHeading ?? "ToDo");
  const canonicalNodes = canonicalScope ? parseListNodes(lines, canonicalScope) : [];
  const fallbackScope = canonicalNodes.length === 0
    ? findTodoScope(lines, normalizedDate, source, options.planHeading ?? "今日计划")
    : undefined;
  const fallbackNodes = fallbackScope ? parseListNodes(lines, fallbackScope) : [];
  // Daily Notes are often authored as a free-form journal without a dedicated
  // ToDo heading. When neither managed section contains a list, treat the
  // current day's document (or the current date section in fixed mode) as the
  // editable planning surface. This fallback is deliberately limited to the
  // configured Daily source; arbitrary Vault notes still enter through the
  // Work Pool allowlist instead of becoming today's commitments.
  const documentScope = canonicalNodes.length === 0 && fallbackNodes.length === 0
    ? findDailyDocumentScope(lines, normalizedDate, source)
    : undefined;
  const scope = canonicalNodes.length > 0
    ? canonicalScope
    : fallbackNodes.length > 0
      ? fallbackScope
      : documentScope ?? fallbackScope ?? canonicalScope;
  const nodes = canonicalNodes.length > 0
    ? canonicalNodes
    : fallbackNodes.length > 0
      ? fallbackNodes
      : documentScope
        ? parseListNodes(lines, documentScope)
        : [];
  const groups: DailyPlanGroup[] = [];
  const diagnostics: DailyPlanHierarchyDiagnostic[] = [];

  for (const node of nodes) {
    if (!isStructuralGroup(node)) continue;
    const parentGroup = nearestGroup(node.parent);
    const text = cleanListText(node.body);
    node.group = {
      id: `group_${contentHash128(`${sourcePath}\n${normalizedDate}\n${node.line}\n${node.rawLine}`)}`,
      text,
      rawLine: node.rawLine,
      sourcePath,
      line: node.line,
      endLine: node.endIndex + 1,
      depth: node.depth,
      parentGroupId: parentGroup?.id,
      links: parseDailyMarkdownTargets(text, { sourcePath })
    };
    groups.push(node.group);
  }

  const tasks: DailyPlanHierarchyTask[] = [];
  const ids = new Map<string, ListNode[]>();
  for (const node of nodes) {
    if (isStructuralGroup(node) || !cleanListText(node.body)) continue;
    for (const id of node.blockIds) {
      const occurrences = ids.get(id) ?? [];
      occurrences.push(node);
      ids.set(id, occurrences);
    }
    if (node.blockIds.length > 1) {
      diagnostics.push({
        code: "multiple-block-ids",
        severity: "error",
        message: "A daily task contains more than one block id.",
        sourcePath,
        line: node.line,
        blockId: node.blockIds[0]
      });
    }
  }
  for (const [blockId, occurrences] of ids) {
    if (occurrences.length < 2) continue;
    for (const node of occurrences) {
      diagnostics.push({
        code: "duplicate-block-id",
        severity: "error",
        message: `Daily plan block id is used more than once: ${blockId}`,
        sourcePath,
        line: node.line,
        blockId
      });
    }
  }

  for (const node of nodes) {
    if (isStructuralGroup(node) || !cleanListText(node.body)) continue;
    const lineageGroups = ancestorGroups(node);
    const lineage = createDailyLineage(lineageGroups, sourcePath, normalizedDate);
    const firstChildIndex = node.children[0]?.index ?? Number.POSITIVE_INFINITY;
    const contiguousDirect = node.directLines.filter((line) => line < firstChildIndex);
    const detachedDirect = node.directLines.filter((line) => line > firstChildIndex);
    const ownEndIndex = contiguousDirect.length
      ? contiguousDirect[contiguousDirect.length - 1]
      : node.index;
    const rawBlock = [node.rawLine, ...node.directLines.map((line) => lines[line])].join("\n");
    const directBlock = [node.rawLine, ...node.directLines.map((index) => lines[index])].join("\n");
    const explicitTarget = extractExplicitDailyTarget(directBlock);
    const category = normalizeOptionalField(readOwnedField(directBlock, "category"), 120);
    const taskRef = normalizeTaskRef(readOwnedField(directBlock, "task-ref"));
    const text = cleanListText(node.body);
    const blockId = node.blockIds.length === 1 ? normalizeBlockId(node.blockIds[0]) : undefined;
    const links = parseDailyMarkdownTargets(text, { sourcePath });
    const targetResolution = resolveDailyTarget({
      sourcePath,
      taskText: text,
      rawBlock: directBlock,
      blockId,
      explicitTarget,
      lineage
    });
    const status = node.checkbox ? checkboxStatus(node.mark ?? "") : struckStatus(node.body);
    const task: DailyPlanHierarchyTask = {
      id: blockId,
      blockId,
      blockIdLine: node.blockIds.length === 1 ? node.blockIdLines[0] : undefined,
      text,
      sourcePath,
      line: node.line,
      endLine: ownEndIndex + 1,
      depth: node.depth,
      parentTaskId: nearestParentTaskId(node),
      category,
      taskRef,
      status,
      checkbox: node.checkbox,
      rawLine: node.rawLine,
      rawBlock,
      detachedOwnedLines: detachedDirect.map((line) => line + 1),
      explicitTarget,
      links,
      lineage,
      lineageRevision: lineage.revision,
      targetResolution,
      normalizationRequired: !node.checkbox || !blockId
    };
    tasks.push(task);
    appendTargetDiagnostics(task, diagnostics, options.targetExists);
    appendUnsafeTargetDiagnostics(node, sourcePath, diagnostics);
  }

  const scopedRaw = scope ? lines.slice(scope.rawStart, scope.rawEnd).join("\n") : "";
  return {
    schemaVersion: DAILY_SCHEMA_VERSION,
    date: normalizedDate,
    source,
    sourcePath,
    groups,
    tasks,
    diagnostics: dedupeDiagnostics(diagnostics),
    revision: `dpr_${contentHash128(`${sourcePath}\n${normalizedDate}\n${scopedRaw}`)}`
  };
}

/**
 * A checkbox used only as a heading/category should not inflate task counts.
 * An authored parent without its own stable id is a structural container even
 * after one of its leaf rows is normalized. An id-bearing checkbox containing
 * checkbox children remains a real task so existing nested-task documents
 * keep their semantics.
 */
function isStructuralGroup(node: ListNode): boolean {
  if (node.children.length === 0) return false;
  if (!node.checkbox || node.blockIds.length === 0) return true;
  return node.children.every((child) => !child.checkbox);
}

function parseListNodes(lines: string[], scope: TodoScope): ListNode[] {
  const nodes: ListNode[] = [];
  const stack: ListNode[] = [];
  for (let index = scope.start; index < scope.end; index += 1) {
    const list = LIST_RE.exec(lines[index]);
    if (list?.groups) {
      const indent = indentationWidth(list.groups.indent);
      while (stack.length && stack[stack.length - 1].indent >= indent) {
        const closed = stack.pop()!;
        closed.endIndex = Math.max(closed.index, index - 1);
      }
      const parent = stack[stack.length - 1];
      const node: ListNode = {
        index,
        line: index + 1,
        indent,
        depth: parent ? parent.depth + 1 : 0,
        marker: list.groups.marker,
        checkbox: Boolean(list.groups.checkbox),
        mark: list.groups.mark,
        body: list.groups.body,
        rawLine: lines[index],
        parent,
        children: [],
        directLines: [],
        blockIds: [],
        blockIdLines: [],
        endIndex: scope.end - 1
      };
      parent?.children.push(node);
      nodes.push(node);
      stack.push(node);
      const inline = INLINE_BLOCK_RE.exec(node.body)?.groups?.id;
      if (inline && normalizeBlockId(inline)) {
        node.blockIds.push(inline);
        node.blockIdLines.push(index + 1);
      }
      continue;
    }

    if (!lines[index].trim()) continue;
    const indent = indentationWidth(/^[ \t]*/u.exec(lines[index])?.[0] ?? "");
    while (stack.length && stack[stack.length - 1].indent >= indent) {
      const closed = stack.pop()!;
      closed.endIndex = Math.max(closed.index, index - 1);
    }
    const owner = stack[stack.length - 1];
    if (!owner) continue;
    owner.directLines.push(index);
    const standalone = STANDALONE_BLOCK_RE.exec(lines[index]);
    if (standalone?.groups?.id && normalizeBlockId(standalone.groups.id)) {
      owner.blockIds.push(standalone.groups.id);
      owner.blockIdLines.push(index + 1);
    }
  }

  for (const node of nodes) {
    while (node.endIndex > node.index && !lines[node.endIndex].trim()) node.endIndex -= 1;
  }
  return nodes;
}

function findTodoScope(
  lines: string[],
  date: string,
  source: DailyPlanSource,
  todoHeading: string
): TodoScope | undefined {
  const nested = source.kind === "fixed-document";
  let dateStart = 0;
  let dateEnd = lines.length;
  let headingLevel = 2;
  if (nested) {
    const dateHeading = lines.findIndex((line) => headingDepth(line) === 2 && headingText(line) === date);
    if (dateHeading < 0) return undefined;
    dateStart = dateHeading + 1;
    dateEnd = lines.length;
    for (let index = dateStart; index < lines.length; index += 1) {
      const level = headingDepth(lines[index]);
      if (level > 0 && level <= 2) {
        dateEnd = index;
        break;
      }
    }
    headingLevel = 3;
  }
  const wanted = todoHeading.replace(/^#+\s*/u, "").trim().toLowerCase();
  let todoHeadingIndex = -1;
  for (let index = dateStart; index < dateEnd; index += 1) {
    if (headingDepth(lines[index]) === headingLevel && headingText(lines[index]).toLowerCase() === wanted) {
      todoHeadingIndex = index;
      break;
    }
  }
  if (todoHeadingIndex < 0) return undefined;
  let todoEnd = dateEnd;
  for (let index = todoHeadingIndex + 1; index < dateEnd; index += 1) {
    const level = headingDepth(lines[index]);
    if (level > 0 && level <= headingLevel) {
      todoEnd = index;
      break;
    }
  }
  return {
    start: todoHeadingIndex + 1,
    end: todoEnd,
    rawStart: nested ? dateStart - 1 : 0,
    rawEnd: nested ? dateEnd : lines.length
  };
}

function findDailyDocumentScope(
  lines: string[],
  date: string,
  source: DailyPlanSource
): TodoScope | undefined {
  if (source.kind !== "fixed-document") {
    return {
      start: 0,
      end: lines.length,
      rawStart: 0,
      rawEnd: lines.length
    };
  }

  const dateHeading = lines.findIndex((line) => headingDepth(line) === 2 && headingText(line) === date);
  if (dateHeading < 0) return undefined;
  let dateEnd = lines.length;
  for (let index = dateHeading + 1; index < lines.length; index += 1) {
    const level = headingDepth(lines[index]);
    if (level > 0 && level <= 2) {
      dateEnd = index;
      break;
    }
  }
  return {
    start: dateHeading + 1,
    end: dateEnd,
    rawStart: dateHeading,
    rawEnd: dateEnd
  };
}

function ancestorGroups(node: ListNode): DailyPlanGroup[] {
  const groups: DailyPlanGroup[] = [];
  let current = node.parent;
  while (current) {
    if (current.group) groups.unshift(current.group);
    current = current.parent;
  }
  return groups;
}

function nearestGroup(node: ListNode | undefined): DailyPlanGroup | undefined {
  let current = node;
  while (current) {
    if (current.group) return current.group;
    current = current.parent;
  }
  return undefined;
}

function nearestParentTaskId(node: ListNode): string | undefined {
  let current = node.parent;
  while (current) {
    if (current.checkbox) {
      return current.blockIds.length === 1
        ? normalizeBlockId(current.blockIds[0])
        : undefined;
    }
    current = current.parent;
  }
  return undefined;
}

function readOwnedField(rawBlock: string, wanted: string): string | undefined {
  for (const match of rawBlock.matchAll(OWNED_FIELD_RE)) {
    if (match.groups?.key.toLowerCase() === wanted) return match.groups.value.trim();
  }
  return undefined;
}

function normalizeOptionalField(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.replace(/[\r\n\]]+/gu, " ").replace(/\s+/gu, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function normalizeTaskRef(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && /^[A-Za-z0-9][A-Za-z0-9_:-]{5,127}$/u.test(normalized)
    ? normalized
    : undefined;
}

function cleanListText(body: string): string {
  return body
    .replace(INLINE_BLOCK_RE, "")
    .replace(OWNED_FIELD_RE, "")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function checkboxStatus(mark: string): DailyPlanStatus {
  if (mark.trim().toLowerCase() === "x") return "done";
  if (mark.trim() === "/" || mark.trim() === "-") return "in-progress";
  return "todo";
}

function struckStatus(body: string): DailyPlanStatus {
  const value = body.replace(INLINE_BLOCK_RE, "").trim();
  return /^~~[\s\S]+~~$/u.test(value) ? "done" : "todo";
}

function appendTargetDiagnostics(
  task: DailyPlanHierarchyTask,
  diagnostics: DailyPlanHierarchyDiagnostic[],
  targetExists: DailyPlanHierarchyParseOptions["targetExists"]
): void {
  const target = task.targetResolution.target;
  if (!target || !targetExists || targetExists(target)) return;
  diagnostics.push({
    code: "broken-target",
    severity: "warning",
    message: `The resolved daily task target does not exist: ${target.linkText}`,
    sourcePath: task.sourcePath,
    line: task.line,
    blockId: task.blockId,
    target: target.raw
  });
}

function appendUnsafeTargetDiagnostics(
  node: ListNode,
  sourcePath: string,
  diagnostics: DailyPlanHierarchyDiagnostic[]
): void {
  for (const match of node.body.matchAll(MARKDOWN_LINK_LIKE_RE)) {
    const rawTarget = match.groups?.target ?? "";
    if (parseDailyMarkdownTargets(match[0], { sourcePath }).length) continue;
    diagnostics.push({
      code: "unsafe-target",
      severity: "warning",
      message: "External, absolute, attachment, or unsafe Markdown links cannot be task open targets.",
      sourcePath,
      line: node.line,
      target: rawTarget
    });
  }
}

function normalizeSource(source: DailyPlanSource | undefined): DailyPlanSource {
  if (source?.kind === "fixed-document") return { kind: "fixed-document", path: source.path };
  return {
    kind: "daily-note",
    dailyRoot: source?.kind === "daily-note" ? source.dailyRoot ?? "Daily" : "Daily",
    dateFormat: source?.kind === "daily-note" ? source.dateFormat : undefined
  };
}

function normalizeBlockId(value: string): string | undefined {
  const id = value.trim().replace(/^\^/u, "");
  return /^(?:daily_)?[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/u.test(id) ? id : undefined;
}

function normalizeDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error("Daily plan date is invalid.");
  return value;
}

function headingDepth(line: string): number {
  return /^(#{1,6})\s+/u.exec(line)?.[1].length ?? 0;
}

function headingText(line: string): string {
  return line.replace(/^#{1,6}\s+/u, "").trim();
}

function indentationWidth(value: string): number {
  let width = 0;
  for (const character of value) width += character === "\t" ? 4 - (width % 4) : 1;
  return width;
}

function dedupeDiagnostics(values: DailyPlanHierarchyDiagnostic[]): DailyPlanHierarchyDiagnostic[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.code}\u0000${value.line}\u0000${value.blockId ?? ""}\u0000${value.target ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
