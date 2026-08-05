import { contentHash128 } from "../core/hash";
import type { OpenQuestion } from "../core/types";
import type { TaskPoolItem } from "../daily/task-pool-types";
import type { InboxItem } from "../inbox/types";
import type { WorkflowFileSummary } from "../workflow";
import {
  WORK_POOL_SCHEMA_VERSION,
  type WorkPoolClassification,
  type WorkPoolClassificationOptions,
  type WorkPoolGroup,
  type WorkPoolGroupNode,
  type WorkPoolGroupingDimension,
  type WorkPoolHistoryMode,
  type WorkPoolItem,
  type WorkPoolQuery,
  type WorkPoolSnapshot,
  type WorkPoolSourceTab
} from "./types";
import { isWorkPoolItemVisible, type WorkPoolVisibilityRules } from "./visibility";

export interface WorkPoolBuildInput {
  tasks: readonly TaskPoolItem[];
  questions: readonly OpenQuestion[];
  inboxItems: readonly InboxItem[];
  workflowFiles: readonly WorkflowFileSummary[];
  generatedAt?: string;
  classification?: WorkPoolClassificationOptions;
  visibility?: WorkPoolVisibilityRules;
}

export class WorkPoolService {
  build(input: WorkPoolBuildInput, query: WorkPoolQuery = {}): WorkPoolSnapshot {
    const items = buildWorkPoolItems(input).filter((item) => isWorkPoolItemVisible(item, input.visibility));
    const filtered = filterWorkPoolItems(items, query);
    return {
      schemaVersion: WORK_POOL_SCHEMA_VERSION,
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      items: filtered,
      groups: groupWorkPoolItems(filtered),
      counts: countWorkPoolItems(items)
    };
  }
}

export function buildWorkPoolItems(input: WorkPoolBuildInput): WorkPoolItem[] {
  const classificationOptions = normalizeClassificationOptions(input.classification);
  const workflowByPath = new Map(input.workflowFiles.map((file) => [normalizePath(file.filePath), file]));
  const inboxByPath = new Map(input.inboxItems.map((item) => [normalizePath(item.filePath), item]));
  const taskLinkPaths = input.tasks.flatMap((task) =>
    [task.source, task.target]
      .map(extractLinkPath)
      .filter((value): value is string => Boolean(value))
  );
  const resolvablePaths = uniqueResolvablePaths([
    ...input.workflowFiles.map((file) => file.filePath),
    ...input.inboxItems.map((item) => item.filePath),
    ...input.questions.map((question) => question.source.file),
    ...taskLinkPaths
  ]);
  const notePaths = new Set<string>([
    ...workflowByPath.keys(),
    ...inboxByPath.keys()
  ]);
  const notes: WorkPoolItem[] = [...notePaths].sort().map((path) => {
    const workflow = workflowByPath.get(path);
    const inbox = inboxByPath.get(path);
    const stageId = workflow?.stageId ?? (inbox ? "inbox" : undefined);
    const title = workflow?.title || inbox?.title || basename(path);
    const active = stageId?.toLowerCase() !== "archive";
    const tags = unique([...(workflow?.tags ?? []), ...(inbox?.tags ?? [])]);
    const project = resolveNoteProject(
      path,
      workflow?.frontmatter,
      inbox,
      tags,
      classificationOptions
    );
    return {
      schemaVersion: WORK_POOL_SCHEMA_VERSION,
      id: `note:${path}`,
      kind: "note",
      sourceRef: {
        kind: "note",
        id: path,
        revision: noteRevision(path, workflow, inbox)
      },
      title,
      description: workflow?.description || project?.label || inbox?.folder,
      notePath: path,
      target: `[[${stripMarkdownExtension(path)}]]`,
      active,
      inbox: Boolean(inbox),
      stale: Boolean(workflow?.stale),
      stageId,
      stageTitle: workflow?.stageTitle ?? (inbox ? "Inbox" : undefined),
      typeId: workflow?.typeId,
      typeTitle: workflow?.typeTitle,
      tags,
      project: project?.label,
      createdAt: workflow?.createdAt ?? inbox?.createdAt,
      updatedAt: workflow?.updatedAt ?? inbox?.updatedAt,
      classification: {
        workTypeId: inbox ? "inbox" : "note",
        workTypeLabel: inbox ? "Inbox" : "笔记",
        workTypeSource: "native",
        ...(project
          ? {
              projectId: project.id,
              projectLabel: project.label,
              projectSource: project.source
            }
          : {})
      }
    };
  });
  const noteByPath = new Map(
    notes
      .filter((note): note is WorkPoolItem & { notePath: string } => Boolean(note.notePath))
      .map((note) => [note.notePath, note])
  );

  const tasks: WorkPoolItem[] = input.tasks.map((task) => {
    const notePath = resolveTaskNotePath(task, resolvablePaths);
    const note = notePath ? noteByPath.get(notePath) : undefined;
    const explicitProject = normalizedNamedValue(task.project);
    const inheritedProject = note?.classification.projectLabel
      ? {
          id: note.classification.projectId ?? identifier(note.classification.projectLabel),
          label: note.classification.projectLabel,
          source: note.classification.projectSource ?? "fallback" as const
        }
      : undefined;
    const project = explicitProject
      ? { id: identifier(explicitProject), label: explicitProject, source: "task" as const }
      : inheritedProject;
    const workTypeLabel = normalizedNamedValue(task.category) || (project ? "项目" : "任务");
    return {
      schemaVersion: WORK_POOL_SCHEMA_VERSION,
      id: `task:${task.taskId}`,
      kind: "task",
      sourceRef: { kind: "task", id: task.taskId, revision: task.revision.value },
      title: task.text,
      description: [task.category, project?.label].filter(Boolean).join(" · ") || undefined,
      notePath,
      target: task.target ?? task.source,
      active: task.state !== "done" && task.state !== "dropped",
      category: task.category,
      project: project?.label,
      inbox: note?.inbox,
      stale: note?.stale,
      stageId: note?.stageId,
      stageTitle: note?.stageTitle,
      typeId: note?.typeId,
      typeTitle: note?.typeTitle,
      tags: note?.tags ?? [],
      taskId: task.taskId,
      taskState: task.state,
      taskRevision: task.revision,
      dueDate: task.dueDate,
      estimateMinutes: task.estimateMinutes,
      classification: {
        workTypeId: identifier(workTypeLabel),
        workTypeLabel,
        workTypeSource: task.category ? "task" : "native",
        ...(project
          ? {
              projectId: project.id,
              projectLabel: project.label,
              projectSource: project.source,
              inheritedFromNote: !explicitProject
            }
          : {})
      }
    };
  });

  const questions: WorkPoolItem[] = input.questions.map((question) => {
    const notePath = normalizePath(question.source.file);
    const note = noteByPath.get(notePath);
    return {
      schemaVersion: WORK_POOL_SCHEMA_VERSION,
      id: `question:${question.id}`,
      kind: "question",
      sourceRef: {
        kind: "question",
        id: question.id,
        revision: questionRevision(question)
      },
      title: question.title || question.question,
      description: question.question,
      notePath,
      target: question.source.blockId
        ? `[[${stripMarkdownExtension(question.source.file)}#^${question.source.blockId}]]`
        : `[[${stripMarkdownExtension(question.source.file)}]]`,
      active: question.status !== "resolved" && question.status !== "ignored",
      inbox: note?.inbox,
      stale: note?.stale,
      stageId: note?.stageId,
      stageTitle: note?.stageTitle,
      typeId: note?.typeId,
      typeTitle: note?.typeTitle,
      tags: unique([...question.tags, ...(note?.tags ?? [])]),
      lane: question.lane,
      questionId: question.id,
      questionStatus: question.status,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
      project: note?.classification.projectLabel,
      classification: {
        workTypeId: question.lane === "write" ? "towrite" : "tothink",
        workTypeLabel: question.lane === "write" ? "ToWrite" : "ToThink",
        workTypeSource: "native",
        ...(note?.classification.projectLabel
          ? {
              projectId: note.classification.projectId,
              projectLabel: note.classification.projectLabel,
              projectSource: note.classification.projectSource,
              inheritedFromNote: true
            }
          : {})
      }
    };
  });

  return [...notes, ...tasks, ...questions].sort(compareWorkItems);
}

export function filterWorkPoolItems(
  items: readonly WorkPoolItem[],
  query: WorkPoolQuery
): WorkPoolItem[] {
  const history = query.history ?? "active";
  const search = query.search?.trim().toLocaleLowerCase();
  return items.filter((item) => (
    matchesHistory(item, history)
    && matchesSource(item, query.source ?? "all")
    && (!query.stageId || item.stageId === query.stageId)
    && (!query.typeId || item.typeId === query.typeId)
    && (!query.category || item.category === query.category)
    && (!query.workType || item.classification.workTypeId === query.workType)
    && (!query.project || item.classification.projectId === query.project)
    && (!query.status || nativeStatus(item) === query.status)
    && (!search || searchableText(item).includes(search))
  ));
}

export function groupWorkPoolItemsBy(
  items: readonly WorkPoolItem[],
  primary: WorkPoolGroupingDimension,
  secondary: WorkPoolGroupingDimension = "none"
): WorkPoolGroupNode[] {
  const firstDimension = primary === "none" ? "source" : primary;
  const buckets = bucketItems(items, firstDimension);
  return [...buckets.entries()]
    .map(([key, bucket]) => {
      const descriptor = groupDescriptor(bucket[0], firstDimension);
      const children = secondary === "none" || secondary === firstDimension
        ? []
        : [...bucketItems(bucket, secondary).entries()].map(([childKey, childItems]) => {
            const childDescriptor = groupDescriptor(childItems[0], secondary);
            return groupNode(`${firstDimension}:${key}/${secondary}:${childKey}`, childKey, childDescriptor, secondary, childItems, []);
          }).sort(compareGroupNodes);
      return groupNode(`${firstDimension}:${key}`, key, descriptor, firstDimension, children.length ? [] : bucket, children);
    })
    .sort(compareGroupNodes);
}

export function groupWorkPoolItems(items: readonly WorkPoolItem[]): WorkPoolGroup[] {
  const notes = new Map<string, WorkPoolItem>();
  const children = new Map<string, WorkPoolItem[]>();
  for (const item of items) {
    if (item.kind === "note" && item.notePath) notes.set(item.notePath, item);
    else {
      const key = item.notePath || "__standalone__";
      children.set(key, [...(children.get(key) ?? []), item]);
    }
  }
  const keys = new Set([...notes.keys(), ...children.keys()]);
  return [...keys].map((key) => {
    const note = notes.get(key);
    const groupChildren = (children.get(key) ?? []).sort(compareWorkItems);
    return {
      id: key === "__standalone__" ? "standalone" : `note-group:${key}`,
      notePath: key === "__standalone__" ? undefined : key,
      title: note?.title ?? (key === "__standalone__" ? "独立任务" : basename(key)),
      note,
      children: groupChildren,
      taskCount: groupChildren.filter((item) => item.kind === "task").length,
      thinkCount: groupChildren.filter((item) => item.kind === "question" && item.lane === "think").length,
      writeCount: groupChildren.filter((item) => item.kind === "question" && item.lane === "write").length,
      activeCount: Number(Boolean(note?.active)) + groupChildren.filter((item) => item.active).length
    };
  }).sort((left, right) => (
    right.activeCount - left.activeCount
    || left.title.localeCompare(right.title, "zh-CN")
  ));
}

export function questionRevision(question: OpenQuestion): string {
  return `wq_${contentHash128(JSON.stringify({
    id: question.id,
    lane: question.lane,
    status: question.status,
    title: question.title,
    question: question.question,
    source: question.source,
    updatedAt: question.updatedAt
  }))}`;
}

function countWorkPoolItems(items: readonly WorkPoolItem[]): WorkPoolSnapshot["counts"] {
  return {
    active: items.filter((item) => item.active).length,
    history: items.filter((item) => !item.active).length,
    tasks: items.filter((item) => item.kind === "task").length,
    think: items.filter((item) => item.kind === "question" && item.lane === "think").length,
    write: items.filter((item) => item.kind === "question" && item.lane === "write").length,
    inbox: items.filter((item) => item.kind === "note" && item.inbox).length,
    notes: items.filter((item) => item.kind === "note" && !item.inbox).length
  };
}

function matchesHistory(item: WorkPoolItem, mode: WorkPoolHistoryMode): boolean {
  return mode === "all" || (mode === "active" ? item.active : !item.active);
}

function matchesSource(item: WorkPoolItem, source: WorkPoolSourceTab): boolean {
  if (source === "all") return true;
  if (source === "task") return item.kind === "task";
  if (source === "tothink") return item.kind === "question" && item.lane === "think";
  if (source === "towrite") return item.kind === "question" && item.lane === "write";
  if (source === "inbox") return item.kind === "note" && Boolean(item.inbox);
  return item.kind === "note" && !item.inbox;
}

function nativeStatus(item: WorkPoolItem): string | undefined {
  return item.taskState ?? item.questionStatus ?? item.stageId;
}

function searchableText(item: WorkPoolItem): string {
  return [
    item.title, item.description, item.notePath, item.category, item.project,
    item.stageTitle, item.typeTitle, item.classification.workTypeLabel,
    item.classification.projectLabel, item.tags.join(" ")
  ].filter(Boolean).join(" ").toLocaleLowerCase();
}

function resolveTaskNotePath(
  task: TaskPoolItem,
  resolvablePaths: ReadonlyMap<string, string>
): string | undefined {
  return resolveLinkPath(task.source, resolvablePaths)
    ?? resolveLinkPath(task.target, resolvablePaths);
}

function resolveLinkPath(
  value: string | undefined,
  resolvablePaths: ReadonlyMap<string, string>
): string | undefined {
  const raw = /^\[\[([^|\]#]+)(?:#[^|\]]*)?(?:\|[^\]]*)?\]\]$/u.exec(value?.trim() ?? "")?.[1];
  if (!raw) return undefined;
  const normalized = normalizePath(raw.endsWith(".md") ? raw : `${raw}.md`);
  return resolvablePaths.get(normalized.toLocaleLowerCase())
    ?? resolvablePaths.get(stripMarkdownExtension(normalized).toLocaleLowerCase())
    ?? resolvablePaths.get(basename(normalized).replace(/\.md$/iu, "").toLocaleLowerCase());
}

function extractLinkPath(value: string | undefined): string | undefined {
  const raw = /^\[\[([^|\]#]+)(?:#[^|\]]*)?(?:\|[^\]]*)?\]\]$/u.exec(value?.trim() ?? "")?.[1];
  if (!raw) return undefined;
  return normalizePath(raw.endsWith(".md") ? raw : `${raw}.md`);
}

function uniqueResolvablePaths(paths: readonly string[]): Map<string, string> {
  const output = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const input of paths) {
    const path = normalizePath(input);
    const keys = [
      path.toLocaleLowerCase(),
      stripMarkdownExtension(path).toLocaleLowerCase(),
      basename(path).replace(/\.md$/iu, "").toLocaleLowerCase()
    ];
    for (const key of keys) {
      if (output.has(key) && output.get(key) !== path) ambiguous.add(key);
      else output.set(key, path);
    }
  }
  for (const key of ambiguous) output.delete(key);
  return output;
}

function noteRevision(
  path: string,
  workflow: WorkflowFileSummary | undefined,
  inbox: InboxItem | undefined
): string {
  return `wn_${contentHash128(JSON.stringify({
    path,
    updatedAt: workflow?.updatedAt ?? inbox?.updatedAt,
    stageId: workflow?.stageId ?? (inbox ? "inbox" : undefined),
    typeId: workflow?.typeId,
    inbox: Boolean(inbox)
  }))}`;
}

function compareWorkItems(left: WorkPoolItem, right: WorkPoolItem): number {
  return Number(right.active) - Number(left.active)
    || compareOptionalDate(left.dueDate, right.dueDate)
    || left.title.localeCompare(right.title, "zh-CN")
    || left.id.localeCompare(right.id);
}

function compareOptionalDate(left?: string, right?: string): number {
  if (left && right) return left.localeCompare(right);
  if (left) return -1;
  if (right) return 1;
  return 0;
}

interface ResolvedProject {
  id: string;
  label: string;
  source: NonNullable<WorkPoolClassification["projectSource"]>;
}

function normalizeClassificationOptions(
  options: WorkPoolClassificationOptions | undefined
): Required<WorkPoolClassificationOptions> {
  const frontmatterKeys = unique((options?.projectFrontmatterKeys ?? ["project", "projects"])
    .map((value) => value.trim().toLocaleLowerCase())
    .filter(Boolean));
  const tagPrefixes = unique((options?.projectTagPrefixes ?? ["project/"])
    .map((value) => value.trim().replace(/^#+/u, "").toLocaleLowerCase())
    .filter(Boolean));
  const projectRules = (options?.projectRules ?? []).map((rule) => ({
    id: identifier(rule.id || rule.label),
    label: normalizedNamedValue(rule.label) || normalizedNamedValue(rule.id) || "未命名项目",
    tags: unique((rule.tags ?? []).map(normalizeTag).filter(Boolean)),
    folderPrefixes: unique((rule.folderPrefixes ?? []).map(normalizePath).filter(Boolean))
  })).filter((rule) => Boolean(rule.id));
  return {
    projectFrontmatterKeys: frontmatterKeys.length ? frontmatterKeys : ["project", "projects"],
    projectTagPrefixes: tagPrefixes.length ? tagPrefixes : ["project/"],
    projectRules
  };
}

function resolveNoteProject(
  path: string,
  frontmatter: Record<string, unknown> | undefined,
  inbox: InboxItem | undefined,
  tags: readonly string[],
  options: Required<WorkPoolClassificationOptions>
): ResolvedProject | undefined {
  for (const key of options.projectFrontmatterKeys) {
    const value = firstNamedValue(frontmatter?.[key]);
    if (value) return { id: identifier(value), label: value, source: "note-frontmatter" };
  }
  const inboxProject = normalizedNamedValue(inbox?.project);
  if (inboxProject) return { id: identifier(inboxProject), label: inboxProject, source: "inbox" };

  const normalizedTags = tags.map(normalizeTag);
  for (const tag of normalizedTags) {
    for (const prefix of options.projectTagPrefixes) {
      if (!tag.toLocaleLowerCase().startsWith(prefix)) continue;
      const label = normalizedNamedValue(tag.slice(prefix.length).replace(/\//gu, " / "));
      if (label) return { id: identifier(label), label, source: "tag" };
    }
  }
  for (const rule of options.projectRules) {
    const tagMatch = rule.tags.some((tag) => normalizedTags.includes(normalizeTag(tag)));
    const folderMatch = rule.folderPrefixes.some((prefix) => pathStartsWith(path, prefix));
    if (tagMatch || folderMatch) {
      return { id: rule.id, label: rule.label, source: "folder-rule" };
    }
  }
  return undefined;
}

function firstNamedValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const named = firstNamedValue(item);
      if (named) return named;
    }
    return undefined;
  }
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  return normalizedNamedValue(String(value));
}

function normalizedNamedValue(value: string | undefined): string | undefined {
  const normalized = String(value ?? "")
    .trim()
    .replace(/^\[\[/u, "")
    .replace(/\]\]$/u, "")
    .split("|")[0]
    .trim()
    .replace(/\s+/gu, " ")
    .slice(0, 120);
  return normalized || undefined;
}

function identifier(value: string): string {
  const normalized = value.trim().toLocaleLowerCase()
    .replace(/^#+/u, "")
    .replace(/[\\/\s]+/gu, "-")
    .replace(/[^\p{Letter}\p{Number}_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 100);
  return normalized || `group-${contentHash128(value).slice(0, 12)}`;
}

function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/u, "").toLocaleLowerCase();
}

function pathStartsWith(path: string, prefix: string): boolean {
  const candidate = normalizePath(path).toLocaleLowerCase();
  const normalizedPrefix = normalizePath(prefix).toLocaleLowerCase();
  return Boolean(normalizedPrefix)
    && (candidate === normalizedPrefix || candidate.startsWith(`${normalizedPrefix}/`));
}

function bucketItems(
  items: readonly WorkPoolItem[],
  dimension: WorkPoolGroupingDimension
): Map<string, WorkPoolItem[]> {
  const buckets = new Map<string, WorkPoolItem[]>();
  for (const item of items) {
    const descriptor = groupDescriptor(item, dimension);
    buckets.set(descriptor.key, [...(buckets.get(descriptor.key) ?? []), item]);
  }
  return buckets;
}

function groupDescriptor(
  item: WorkPoolItem,
  dimension: WorkPoolGroupingDimension
): { key: string; title: string } {
  if (dimension === "workType") {
    return { key: item.classification.workTypeId, title: item.classification.workTypeLabel };
  }
  if (dimension === "project") {
    return {
      key: item.classification.projectId ?? "__unclassified__",
      title: item.classification.projectLabel ?? "未归项目"
    };
  }
  if (dimension === "source") return sourceDescriptor(item);
  if (dimension === "stage") {
    return { key: item.stageId ?? "__no_stage__", title: item.stageTitle ?? "未设置阶段" };
  }
  if (dimension === "articleType") {
    return { key: item.typeId ?? "__no_type__", title: item.typeTitle ?? "未设置文章类型" };
  }
  if (dimension === "note") {
    return {
      key: item.notePath ?? "__standalone__",
      title: item.notePath ? basename(item.notePath).replace(/\.md$/iu, "") : "独立任务"
    };
  }
  if (dimension === "status") {
    const status = nativeStatus(item) ?? "__no_status__";
    return { key: status, title: status === "__no_status__" ? "未设置状态" : status };
  }
  if (dimension === "category") {
    return { key: identifier(item.category ?? "未分类"), title: item.category ?? "未分类" };
  }
  return { key: "all", title: "全部" };
}

function sourceDescriptor(item: WorkPoolItem): { key: string; title: string } {
  if (item.kind === "task") return { key: "task", title: "任务" };
  if (item.kind === "question") {
    return item.lane === "write"
      ? { key: "towrite", title: "ToWrite" }
      : { key: "tothink", title: "ToThink" };
  }
  return item.inbox ? { key: "inbox", title: "Inbox" } : { key: "note", title: "笔记" };
}

function groupNode(
  id: string,
  key: string,
  descriptor: { title: string },
  dimension: WorkPoolGroupingDimension,
  items: WorkPoolItem[],
  children: WorkPoolGroupNode[]
): WorkPoolGroupNode {
  const counted = children.length ? children.flatMap((child) => collectNodeItems(child)) : items;
  return {
    id,
    key,
    title: descriptor.title,
    dimension,
    items: [...items].sort(compareWorkItems),
    children,
    counts: {
      total: counted.length,
      tasks: counted.filter((item) => item.kind === "task").length,
      think: counted.filter((item) => item.kind === "question" && item.lane === "think").length,
      write: counted.filter((item) => item.kind === "question" && item.lane === "write").length,
      inbox: counted.filter((item) => item.kind === "note" && item.inbox).length,
      notes: counted.filter((item) => item.kind === "note" && !item.inbox).length
    }
  };
}

function collectNodeItems(node: WorkPoolGroupNode): WorkPoolItem[] {
  return node.children.length
    ? node.children.flatMap((child) => collectNodeItems(child))
    : node.items;
}

function compareGroupNodes(left: WorkPoolGroupNode, right: WorkPoolGroupNode): number {
  const leftUnclassified = left.key.startsWith("__");
  const rightUnclassified = right.key.startsWith("__");
  return Number(leftUnclassified) - Number(rightUnclassified)
    || right.counts.total - left.counts.total
    || left.title.localeCompare(right.title, "zh-CN");
}

function normalizePath(path: string): string {
  return path.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
}

function stripMarkdownExtension(path: string): string {
  return normalizePath(path).replace(/\.md$/iu, "");
}

function basename(path: string): string {
  return normalizePath(path).split("/").pop() || path;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
