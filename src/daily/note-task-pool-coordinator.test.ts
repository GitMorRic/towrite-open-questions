import { describe, expect, it } from "vitest";
import { NoteTaskPoolCoordinator } from "./note-task-pool-coordinator";
import { NoteTaskService, type NoteTaskStorage } from "./note-task-service";
import { TaskPoolService, type TaskPoolStorage } from "./task-pool-service";

const NOTE_PATH = "Quick Notes/index.md";
const POOL_PATH = "Planning/Task Pool.md";
const NOTE_TASK = `task_${"a".repeat(32)}`;
const POOL_TASK = `task_${"b".repeat(32)}`;

class MemoryStorage implements NoteTaskStorage, TaskPoolStorage {
  readonly values = new Map<string, string>([[NOTE_PATH, "- [ ] 写出 Echo 发布说明\n"]]);

  async readText(path: string): Promise<string | undefined> {
    return this.values.get(path);
  }

  async writeText(path: string, content: string): Promise<void> {
    this.values.set(path, content);
  }
}

function services(storage: MemoryStorage) {
  const notes = new NoteTaskService(storage, () => NOTE_TASK);
  const pool = new TaskPoolService(storage, {
    path: POOL_PATH,
    createTaskId: () => POOL_TASK
  });
  return { notes, pool, coordinator: new NoteTaskPoolCoordinator(notes, pool) };
}

describe("NoteTaskPoolCoordinator", () => {
  it("registers one confirmed ordinary-note task in the shared pool with a stable source link", async () => {
    const storage = new MemoryStorage();
    const { notes, pool, coordinator } = services(storage);
    const candidate = (await notes.inspect(NOTE_PATH)).candidates[0];

    const registered = await coordinator.register(candidate, {
      category: "写作和发布",
      estimateMinutes: 25
    });

    expect(registered.noteTask.poolTaskRef).toBe(NOTE_TASK);
    expect(registered.poolTask).toMatchObject({
      taskId: NOTE_TASK,
      text: "写出 Echo 发布说明",
      state: "pool",
      category: "写作和发布",
      estimateMinutes: 25,
      target: `[[Quick Notes/index#^${NOTE_TASK}]]`,
      source: `[[Quick Notes/index#^${NOTE_TASK}]]`
    });
    expect((await pool.list())).toHaveLength(1);
    expect(storage.values.get(NOTE_PATH)).toContain(`[towrite-pool-ref:: ${NOTE_TASK}]`);

    const retried = await coordinator.ensureRegistered(registered.noteTask);
    expect(retried.taskId).toBe(NOTE_TASK);
    expect((await pool.list())).toHaveLength(1);
  });

  it("links a typed checkbox to an existing unbound pool item instead of duplicating it", async () => {
    const storage = new MemoryStorage();
    const { notes, pool, coordinator } = services(storage);
    const existing = await pool.create({
      id: POOL_TASK,
      text: "Echo 发布说明",
      category: "写作"
    });
    const candidate = (await notes.inspect(NOTE_PATH)).candidates[0];

    const linked = await coordinator.linkExisting(candidate, existing);

    expect(linked.noteTask.taskId).toBe(NOTE_TASK);
    expect(linked.noteTask.poolTaskRef).toBe(POOL_TASK);
    expect(linked.poolTask.source).toBe(`[[Quick Notes/index#^${NOTE_TASK}]]`);
    expect((await pool.list())).toHaveLength(1);
  });

  it("moves a linked task into the pool Done lane when the source checkbox completes", async () => {
    const storage = new MemoryStorage();
    const { notes, pool, coordinator } = services(storage);
    const candidate = (await notes.inspect(NOTE_PATH)).candidates[0];
    const registered = await coordinator.register(candidate);
    const completedNote = await notes.setStatus(registered.noteTask, "done");

    const completedPool = await coordinator.complete(completedNote);

    expect(completedPool?.state).toBe("done");
    expect(completedPool?.completedAt).toBeTruthy();
    expect((await pool.list())[0].state).toBe("done");
  });
});
