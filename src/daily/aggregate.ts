import type { DailyPlanItem } from "./types";

export interface DailyLinkedTaskAggregateSource {
  sourcePath: string;
  line: number;
  tasks: ReadonlyArray<{ status: string }>;
}

/**
 * Adds a read-only roll-up to checkbox parents without changing their authored
 * checkbox state. A parent is effectively complete when it was explicitly
 * checked or every descendant Daily task and linked-note task is complete.
 */
export function projectDailyTaskAggregates(
  sourceItems: readonly DailyPlanItem[],
  linkedSources: readonly DailyLinkedTaskAggregateSource[] = []
): DailyPlanItem[] {
  const items = sourceItems.map((item) => ({ ...item, aggregate: undefined }));
  const byId = new Map(items.map((item) => [item.id, item]));
  const byLine = new Map(items.map((item) => [sourceLineKey(item.sourcePath, item.line), item]));
  const children = new Map<string, DailyPlanItem[]>();
  const linkedByLine = new Map<string, Array<{ status: string }>>();

  for (const source of linkedSources) {
    const key = sourceLineKey(source.sourcePath, source.line);
    linkedByLine.set(key, [...(linkedByLine.get(key) ?? []), ...source.tasks]);
  }
  for (const item of items) {
    const parent = item.parentTaskId
      ? byId.get(item.parentTaskId)
      : item.parentTaskLine
        ? byLine.get(sourceLineKey(item.sourcePath, item.parentTaskLine))
        : undefined;
    if (!parent || parent.id === item.id) continue;
    children.set(parent.id, [...(children.get(parent.id) ?? []), item]);
  }

  interface Rollup {
    effectiveDone: boolean;
    subtreeTotal: number;
    subtreeDone: number;
    subtreeDailyTasks: number;
    subtreeLinkedTasks: number;
  }
  const visiting = new Set<string>();
  const rollups = new Map<string, Rollup>();
  const visit = (item: DailyPlanItem): Rollup => {
    const cached = rollups.get(item.id);
    if (cached) return cached;
    if (visiting.has(item.id)) {
      const effectiveDone = item.status === "done";
      return {
        effectiveDone,
        subtreeTotal: 1,
        subtreeDone: effectiveDone ? 1 : 0,
        subtreeDailyTasks: 1,
        subtreeLinkedTasks: 0
      };
    }
    visiting.add(item.id);
    const descendants = children.get(item.id) ?? [];
    const linked = linkedByLine.get(sourceLineKey(item.sourcePath, item.line)) ?? [];
    const childRollups = descendants.map(visit);
    const descendantTotal = childRollups.reduce((sum, rollup) => sum + rollup.subtreeTotal, 0);
    const descendantDone = childRollups.reduce((sum, rollup) => sum + rollup.subtreeDone, 0);
    const descendantDailyTasks = childRollups.reduce((sum, rollup) => sum + rollup.subtreeDailyTasks, 0);
    const descendantLinkedTasks = childRollups.reduce((sum, rollup) => sum + rollup.subtreeLinkedTasks, 0);
    const linkedDone = linked.filter((task) => task.status === "done").length;
    const dependentTotal = descendantTotal + linked.length;
    const dependentDone = descendantDone + linkedDone;
    const explicitlyComplete = item.status === "done";
    const complete = dependentTotal > 0 && dependentDone === dependentTotal;
    if (dependentTotal > 0) {
      item.aggregate = {
        total: dependentTotal,
        done: dependentDone,
        complete,
        explicitlyComplete,
        dailyTasks: descendantDailyTasks,
        linkedTasks: descendantLinkedTasks + linked.length
      };
    }
    item.done = explicitlyComplete || complete;
    const rollup: Rollup = {
      effectiveDone: item.done,
      subtreeTotal: 1 + dependentTotal,
      subtreeDone: (item.done ? 1 : 0) + dependentDone,
      subtreeDailyTasks: 1 + descendantDailyTasks,
      subtreeLinkedTasks: descendantLinkedTasks + linked.length
    };
    visiting.delete(item.id);
    rollups.set(item.id, rollup);
    return rollup;
  };

  for (const item of [...items].sort((left, right) => (right.depth ?? 0) - (left.depth ?? 0))) visit(item);
  return items;
}

function sourceLineKey(path: string, line: number): string {
  return `${path.replace(/\\/gu, "/").toLocaleLowerCase()}\u0000${line}`;
}
