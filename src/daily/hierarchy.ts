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
  extractExplicitDailyAction,
  extractExplicitDailyTarget,
  parseDailyMarkdownTargets,
  resolveDailyTarget
} from "./target-resolver";

const LIST_RE = /^(?<indent>[ \t]*)(?<marker>(?:[-+*]|\d+[.)]))[ \t]+(?:(?<checkbox>\[(?<mark>[^\]])\])[ \t]+)?(?<body>.*)$/u;
const STANDALONE_BLOCK_RE = /^(?<indent>[ \t]+)\^(?<id>[A-Za-z0-9_-]+)\s*$/u;
const INLINE_BLOCK_RE = /(?:^|\s)\^(?<id>[A-Za-z0-9_-]+)\s*$/u;
const DAILY_SECTION_MARKER_RE = /^\s*%%\s*\[towrite-daily-section::\s*(?:true|yes|1)\s*\]\s*%%\s*$/iu;
const OWNED_FIELD_RE = /\[towrite-(?<key>kind|category|task-ref|pool-revision|work-kind|work-ref|work-revision|device|at|scheduled|due|primary|minimum|goal|next|estimate|action|target|started)::\s*(?<value>\[\[[^\]]+\]\]|[^\]]*)\]/giu;
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

interface DailyPlanningSurfaceResolution {
  canonicalScope?: TodoScope;
  canonicalNodes: ListNode[];
  planScope?: TodoScope;
  planNodes: ListNode[];
  documentScope?: TodoScope;
  documentNodes: ListNode[];
  freeFormNodes: ListNode[];
  nodes: ListNode[];
  revisionScope?: TodoScope;
}

export interface DailyPlanWriteSurface {
  kind: "todo" | "plan" | "free-form" | "none";
  /** Zero-based first source line owned by this surface. */
  start: number;
  /** Safe insertion point for a task that should lead this planning surface. */
  prepend: number;
  /** Zero-based insertion point before the next source line. */
  insertion: number;
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
  const surface = resolveDailyPlanningSurface(lines, normalizedDate, source, options);
  const nodes = surface.nodes;
  const groups: DailyPlanGroup[] = [];
  const diagnostics: DailyPlanHierarchyDiagnostic[] = [];

  for (const node of nodes) {
    if (!isGroupNode(node)) continue;
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
    if (!isTaskNode(node) || !cleanListText(node.body)) continue;
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
    if (!isTaskNode(node) || !cleanListText(node.body)) continue;
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
    const explicitActionId = extractExplicitDailyAction(directBlock);
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
      explicitActionId,
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
      parentTaskLine: nearestParentTask(node)?.line,
      category,
      taskRef,
      status,
      checkbox: node.checkbox,
      rawLine: node.rawLine,
      rawBlock,
      detachedOwnedLines: detachedDirect.map((line) => line + 1),
      explicitActionId,
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

  const scopedRaw = surface.revisionScope
    ? lines.slice(surface.revisionScope.rawStart, surface.revisionScope.rawEnd).join("\n")
    : "";
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
 * Resolves the same authored planning surface used by the reader. A populated
 * managed section remains the preferred write target. When a Daily note is
 * authored as a free-form checkbox tree, however, creating a task appends next
 * to that tree instead of injecting a new ToDo heading that would shadow it.
 */
export function resolveDailyPlanWriteSurface(
  markdown: string,
  date: string,
  options: DailyPlanHierarchyParseOptions = {}
): DailyPlanWriteSurface {
  const normalizedDate = normalizeDate(date);
  const source = normalizeSource(options.source);
  const lines = markdown.split(/\r?\n/u);
  const surface = resolveDailyPlanningSurface(lines, normalizedDate, source, options);
  if (surface.canonicalNodes.length > 0 && surface.canonicalScope) {
    return sectionWriteSurface("todo", surface.canonicalScope);
  }
  if (surface.planNodes.length > 0 && surface.planScope) {
    return sectionWriteSurface("plan", surface.planScope);
  }
  if (surface.nodes.length > 0 && surface.documentScope) {
    const projectTreeNodes = checkboxTreeComponents(surface.nodes);
    let insertionNodes = surface.nodes;
    if (projectTreeNodes.length > 0) {
      const lastProjectLine = Math.max(...projectTreeNodes.map((node) => node.endIndex));
      let nextHeading = lines.length;
      for (let index = lastProjectLine + 1; index < lines.length; index += 1) {
        if (headingDepth(lines[index]) > 0) {
          nextHeading = index;
          break;
        }
      }
      // Include standalone tasks already appended after the project trees,
      // but stop before a later journal heading and its unrelated checkboxes.
      insertionNodes = surface.nodes.filter((node) => node.index < nextHeading);
    }
    return {
      kind: "free-form",
      start: surface.documentScope.start,
      prepend: Math.min(...surface.nodes.map((node) => node.index)),
      insertion: Math.max(...insertionNodes.map((node) => node.endIndex + 1))
    };
  }
  if (surface.canonicalScope) return sectionWriteSurface("todo", surface.canonicalScope);
  if (surface.planScope) return sectionWriteSurface("plan", surface.planScope);
  return { kind: "none", start: 0, prepend: 0, insertion: lines.length };
}

function resolveDailyPlanningSurface(
  lines: string[],
  date: string,
  source: DailyPlanSource,
  options: DailyPlanHierarchyParseOptions
): DailyPlanningSurfaceResolution {
  const canonicalScope = findTodoScope(lines, date, source, options.todoHeading ?? "ToDo");
  const planScope = findTodoScope(lines, date, source, options.planHeading ?? "今日计划");
  const canonicalNodes = canonicalScope ? parseListNodes(lines, canonicalScope) : [];
  const planNodes = planScope ? parseListNodes(lines, planScope) : [];

  // Daily Notes are often authored as a free-form journal without a dedicated
  // ToDo heading. The whole-document scan remains strict: a node must be a
  // checkbox or live below a checkbox container, so ordinary outlines and
  // reading indexes cannot become commitments merely because they use lists.
  const documentScope = findDailyDocumentScope(lines, date, source);
  const documentNodes = documentScope
    ? parseListNodes(lines, documentScope).filter(isDailyChecklistNode)
    : [];
  const freeFormNodes = documentNodes.filter((node) =>
    !nodeIsInScope(node, canonicalScope) && !nodeIsInScope(node, planScope)
  );
  const projectRegionNodes = checkboxPlanningRegionNodes(lines, freeFormNodes);
  const markedSectionNodes = markedDailySectionNodes(lines, freeFormNodes);
  const supplementalNodes = uniqueNodesBySourceLine([
    ...projectRegionNodes,
    ...markedSectionNodes
  ]);

  if (canonicalNodes.length > 0) {
    // Older writers could append a populated ToDo section to a Daily note that
    // already used checkbox project trees. Keep the explicit canonical section
    // while recovering those authored tree components. Isolated journal
    // checkboxes and ordinary outlines remain outside the managed plan.
    const supplemental = uniqueNodesBySourceLine([
      ...planNodes,
      ...supplementalNodes
    ]);
    return {
      canonicalScope,
      canonicalNodes,
      planScope,
      planNodes,
      documentScope,
      documentNodes,
      freeFormNodes,
      nodes: uniqueNodesBySourceLine([...canonicalNodes, ...supplemental]),
      revisionScope: supplemental.length > 0 ? documentScope ?? canonicalScope : canonicalScope
    };
  }
  if (planNodes.length > 0) {
    const nodes = uniqueNodesBySourceLine([...planNodes, ...supplementalNodes]);
    return {
      canonicalScope,
      canonicalNodes,
      planScope,
      planNodes,
      documentScope,
      documentNodes,
      freeFormNodes,
      nodes,
      revisionScope: supplementalNodes.length > 0 ? documentScope ?? planScope : planScope
    };
  }
  const managedScope = canonicalScope ?? planScope;
  if (managedScope) {
    // An explicitly authored managed section wins over unrelated journal
    // checkboxes, even while it is empty. The one exception is the legacy
    // shape this plugin previously polluted: a real free-form project tree
    // followed by an empty managed heading. Recover that tree without also
    // adopting isolated reminders elsewhere in the note.
    return {
      canonicalScope,
      canonicalNodes,
      planScope,
      planNodes,
      documentScope,
      documentNodes,
      freeFormNodes,
      nodes: supplementalNodes,
      revisionScope: supplementalNodes.length > 0 ? documentScope ?? managedScope : managedScope
    };
  }
  const unmanagedNodes = supplementalNodes.length > 0
    ? supplementalNodes
    : initialFreeFormChecklistNodes(lines, freeFormNodes, source, date);
  return {
    canonicalScope,
    canonicalNodes,
    planScope,
    planNodes,
    documentScope,
    documentNodes,
    freeFormNodes,
    nodes: unmanagedNodes,
    revisionScope: unmanagedNodes.length > 0 ? documentScope : undefined
  };
}

function sectionWriteSurface(
  kind: "todo" | "plan",
  scope: TodoScope
): DailyPlanWriteSurface {
  return { kind, start: scope.start, prepend: scope.start, insertion: scope.end };
}

function nodeIsInScope(node: ListNode, scope: TodoScope | undefined): boolean {
  return Boolean(scope && node.index >= scope.start && node.index < scope.end);
}

function checkboxTreeComponents(nodes: readonly ListNode[]): ListNode[] {
  const included = new Set(nodes.map((node) => node.index));
  const componentRoot = (node: ListNode): number => {
    let current = node;
    while (current.parent && included.has(current.parent.index)) current = current.parent;
    return current.index;
  };
  const treeRoots = new Set(nodes
    .filter((node) => node.checkbox && node.children.some((child) => included.has(child.index)))
    .map(componentRoot));
  return nodes.filter((node) => treeRoots.has(componentRoot(node)));
}

/**
 * A legacy free-form planning area is identified by a checkbox project tree.
 * Once a tree establishes a heading-bounded region, standalone checkbox tasks
 * in that same region are also kept. This recovers legitimate peers without
 * pulling isolated reminders from a later Journal section into the plan.
 */
function checkboxPlanningRegionNodes(
  lines: readonly string[],
  nodes: readonly ListNode[]
): ListNode[] {
  // A checkbox parent with authored descendants is a strong planning signal,
  // even under a later custom heading such as "项目" or "随记". This is
  // deliberately narrower than adopting every checkbox in that section: the
  // tree establishes the region, then its same-section peers are included.
  // Standalone reminder checkboxes elsewhere still require the explicit
  // hidden section marker below.
  const treeNodes = checkboxTreeComponents(nodes);
  if (treeNodes.length === 0) return [];
  const regions = new Set(treeNodes.map((node) => precedingHeadingIndex(lines, node.index)));
  return nodes.filter((node) => regions.has(precedingHeadingIndex(lines, node.index)));
}

/**
 * Opts a custom heading into Daily planning without renaming it to `ToDo`.
 * The marker is an Obsidian comment, so it stays invisible in Reading view:
 * `%% [towrite-daily-section:: true] %%`.
 *
 * This is intentionally section-scoped rather than note-scoped. A file can
 * remain a natural journal while one authored section supplies commitments.
 */
function markedDailySectionNodes(
  lines: readonly string[],
  nodes: readonly ListNode[]
): ListNode[] {
  const ranges: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!DAILY_SECTION_MARKER_RE.test(lines[index] ?? "")) continue;
    const heading = precedingHeadingIndex(lines, index);
    if (heading < 0) {
      const nextHeading = lines.findIndex((line, lineIndex) => lineIndex > index && headingDepth(line) > 0);
      ranges.push({ start: index + 1, end: nextHeading < 0 ? lines.length : nextHeading });
      continue;
    }
    const level = headingDepth(lines[heading] ?? "");
    let end = lines.length;
    for (let cursor = heading + 1; cursor < lines.length; cursor += 1) {
      const candidateLevel = headingDepth(lines[cursor] ?? "");
      if (candidateLevel > 0 && candidateLevel <= level) {
        end = cursor;
        break;
      }
    }
    ranges.push({ start: index + 1, end });
  }
  return nodes.filter((node) => ranges.some((range) => node.index >= range.start && node.index < range.end));
}

/** A heading-free body (or the body immediately below the date H1) can be a
 * simple checklist even without project containers. Lower-level authored
 * sections such as `## Journal` are not implicitly planning surfaces. */
function initialFreeFormChecklistNodes(
  lines: readonly string[],
  nodes: readonly ListNode[],
  source: DailyPlanSource,
  date: string
): ListNode[] {
  const firstHeading = source.kind === "fixed-document"
    ? lines.findIndex((line) => headingDepth(line) === 2 && headingText(line) === date)
    : lines.findIndex((line) => headingDepth(line) === 1 && headingLooksLikeDate(line, date));
  const hasPreHeadingNode = nodes.some((node) => precedingHeadingIndex(lines, node.index) < 0);
  const region = hasPreHeadingNode ? -1 : firstHeading;
  if (region < 0 && !hasPreHeadingNode) return [];
  return nodes.filter((node) => precedingHeadingIndex(lines, node.index) === region);
}

function headingLooksLikeDate(line: string, date: string): boolean {
  return headingText(line).replace(/\D/gu, "") === date.replace(/\D/gu, "");
}

function precedingHeadingIndex(lines: readonly string[], index: number): number {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (headingDepth(lines[cursor]) > 0) return cursor;
  }
  return -1;
}

function uniqueNodesBySourceLine(nodes: readonly ListNode[]): ListNode[] {
  const byLine = new Map<number, ListNode>();
  for (const node of nodes) {
    if (!byLine.has(node.index)) byLine.set(node.index, node);
  }
  return [...byLine.values()].sort((left, right) => left.index - right.index);
}

/**
 * Every list parent is a structural group. Checkbox parents deliberately keep
 * a second role as aggregate tasks, so an author can use `- [ ] Project` both
 * as a collapsible category and as the explicit completion switch for all work
 * below it. Plain list parents remain group-only.
 */
function isGroupNode(node: ListNode): boolean {
  return node.children.length > 0;
}

function isTaskNode(node: ListNode): boolean {
  return node.checkbox || node.children.length === 0;
}

/**
 * Whole-document fallback is intentionally stricter than an explicit ToDo
 * section. A free-form Daily Note can contain numbered outlines, reading
 * lists, indexes, and other ordinary Markdown lists. Only a checkbox itself,
 * or a descendant nested beneath a checkbox container, belongs to the Daily
 * checklist. This preserves checkbox categories with numbered linked children
 * without absorbing unrelated outlines.
 */
function isDailyChecklistNode(node: ListNode): boolean {
  if (node.checkbox) return true;
  let parent = node.parent;
  while (parent) {
    if (parent.checkbox) return true;
    parent = parent.parent;
  }
  return false;
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
  const current = nearestParentTask(node);
  return current?.blockIds.length === 1
    ? normalizeBlockId(current.blockIds[0])
    : undefined;
}

function nearestParentTask(node: ListNode): ListNode | undefined {
  let current = node.parent;
  while (current) {
    if (current.checkbox) return current;
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
