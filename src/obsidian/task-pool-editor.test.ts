import { describe, expect, it } from "vitest";
import { isTaskPoolEditorTechnicalLine } from "./task-pool-editor";
import { taskPoolTrailingIdRange } from "./task-pool-preview";

describe("Task Pool editor metadata", () => {
  it("recognizes new comments, legacy fields, and stable task ids", () => {
    expect(isTaskPoolEditorTechnicalLine("  %% [towrite-state:: pool] %%")).toBe(true);
    expect(isTaskPoolEditorTechnicalLine("  [towrite-target:: [[Echo]]] ")).toBe(true);
    expect(isTaskPoolEditorTechnicalLine("  ^task_bfc6a55669a4dc48e4eeeda3587cb155")).toBe(true);
  });

  it("does not hide user-authored text containing a field example", () => {
    expect(isTaskPoolEditorTechnicalLine("解释 [towrite-state:: pool] 的含义")).toBe(false);
    expect(isTaskPoolEditorTechnicalLine("- [ ] 普通任务")).toBe(false);
  });

  it("supports legacy inline stable ids while preserving the task label", () => {
    const value = `- [ ] Visible task ^task_${"b".repeat(32)}`;
    const range = taskPoolTrailingIdRange(value);
    expect(value.slice(0, range?.from)).toBe("- [ ] Visible task");
  });
});
