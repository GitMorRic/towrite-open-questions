import {
  NoteTaskConflictError,
  type NoteTaskCandidate,
  type NoteTaskPatch,
  type NoteTaskService,
  type TrackedNoteTask
} from "./note-task-service";
import {
  TaskPoolConflictError,
  type TaskPoolService
} from "./task-pool-service";
import type {
  TaskPoolCreateInput,
  TaskPoolItem,
  TaskPoolUpdate
} from "./task-pool-types";

export interface NoteTaskPoolCoordinatorOptions {
  completePlanned?(item: TaskPoolItem): Promise<void>;
  /** Optional source-note frontmatter fallback; an explicit task category wins. */
  resolveCategory?(task: TrackedNoteTask): string | undefined | Promise<string | undefined>;
}

/**
 * Coordinates the ordinary-note Markdown truth with the global Task Pool
 * registry. The source checkbox remains editable; the pool owns scheduling
 * lifecycle and keeps a stable block link back to that checkbox.
 */
export class NoteTaskPoolCoordinator {
  constructor(
    private readonly notes: NoteTaskService,
    private readonly pool: TaskPoolService,
    private readonly options: NoteTaskPoolCoordinatorOptions = {}
  ) {}

  async register(
    candidate: NoteTaskCandidate,
    patch: NoteTaskPatch = {}
  ): Promise<{ noteTask: TrackedNoteTask; poolTask: TaskPoolItem }> {
    const noteTask = await this.notes.adopt(candidate, {
      ...patch,
      poolTaskRef: candidate.proposedTaskId
    });
    return {
      noteTask,
      poolTask: await this.ensureRegistered(noteTask)
    };
  }

  async linkExisting(
    candidate: NoteTaskCandidate,
    existing: TaskPoolItem
  ): Promise<{ noteTask: TrackedNoteTask; poolTask: TaskPoolItem }> {
    if (existing.state !== "pool" && existing.state !== "returned") {
      throw new TaskPoolConflictError("invalid-state", "Only an available Task Pool item can be linked.");
    }
    if (existing.source) {
      throw new TaskPoolConflictError(
        "invalid-state",
        "This Task Pool item is already linked to another source checkbox."
      );
    }
    const noteTask = await this.notes.adopt(candidate, {
      category: existing.category,
      target: existing.target,
      dueDate: existing.dueDate,
      estimateMinutes: existing.estimateMinutes,
      poolTaskRef: existing.taskId
    });
    return {
      noteTask,
      poolTask: await this.ensureRegistered(noteTask)
    };
  }

  async ensureRegistered(noteTask: TrackedNoteTask): Promise<TaskPoolItem> {
    const taskId = noteTask.poolTaskRef ?? noteTask.taskId;
    const source = noteTaskSourceLink(noteTask);
    const inheritedCategory = noteTask.category
      ?? await this.options.resolveCategory?.(noteTask);
    const existing = await this.pool.get(taskId);
    if (!existing) {
      if (taskId !== noteTask.taskId) {
        throw new TaskPoolConflictError(
          "not-found",
          "The linked Task Pool item no longer exists; choose another item or create a new pool task."
        );
      }
      return this.pool.create(noteTaskPoolCreateInput(noteTask, inheritedCategory));
    }
    if (existing.source && existing.source !== source) {
      throw new TaskPoolConflictError(
        "id-reused",
        "The Task Pool item is already bound to a different source checkbox."
      );
    }
    if (existing.state === "done" || existing.state === "dropped") return existing;
    const patch = noteTaskPoolUpdate(noteTask, existing, source, inheritedCategory);
    if (existing.state === "planned") {
      if (!existing.plannedDate || !existing.assignmentId) {
        throw new TaskPoolConflictError("invalid-state", "The planned Task Pool item is missing its assignment.");
      }
      return this.pool.updateAssigned(
        existing.taskId,
        existing.revision,
        existing.plannedDate,
        existing.assignmentId,
        patch
      );
    }
    return this.pool.update(existing.taskId, existing.revision, patch);
  }

  async complete(noteTask: TrackedNoteTask): Promise<TaskPoolItem | undefined> {
    const taskId = noteTask.poolTaskRef;
    if (!taskId) return undefined;
    const existing = await this.pool.get(taskId);
    if (!existing || existing.state === "done") return existing;
    if (existing.state === "dropped") {
      throw new TaskPoolConflictError("invalid-state", "A dropped Task Pool item cannot be completed.");
    }
    if (existing.state === "planned" && this.options.completePlanned) {
      await this.options.completePlanned(existing);
      return this.pool.get(taskId);
    }
    return (await this.pool.complete(taskId, existing.revision)).task;
  }
}

export function noteTaskSourceLink(
  task: Pick<TrackedNoteTask, "sourcePath" | "taskId">
): string {
  const path = task.sourcePath.replace(/\.md$/iu, "");
  if (!path || /[\]\r\n]/u.test(path)) {
    throw new NoteTaskConflictError("invalid-document", "The source note path cannot form a safe block link.");
  }
  return `[[${path}#^${task.taskId}]]`;
}

export function noteTaskPoolCreateInput(
  task: TrackedNoteTask,
  inheritedCategory?: string
): TaskPoolCreateInput {
  const source = noteTaskSourceLink(task);
  return {
    id: task.taskId,
    text: task.text,
    category: task.category ?? inheritedCategory,
    target: task.target ?? source,
    source,
    dueDate: task.dueDate ?? task.deadlineAt?.slice(0, 10),
    estimateMinutes: task.estimateMinutes
  };
}

function noteTaskPoolUpdate(
  task: TrackedNoteTask,
  existing: TaskPoolItem,
  source: string,
  inheritedCategory?: string
): TaskPoolUpdate {
  if (task.poolTaskRef !== task.taskId) {
    return { source };
  }
  return {
    text: task.text,
    category: task.category ?? inheritedCategory ?? existing.category ?? null,
    target: task.target ?? source,
    source,
    dueDate: task.dueDate ?? task.deadlineAt?.slice(0, 10) ?? null,
    estimateMinutes: task.estimateMinutes ?? null
  };
}
