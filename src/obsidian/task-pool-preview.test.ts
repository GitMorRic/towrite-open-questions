import { describe, expect, it } from "vitest";
import { isTaskPoolTechnicalLine, taskPoolTrailingIdRange } from "./task-pool-preview";

describe("task pool preview metadata", () => {
  it("hides only complete plugin-owned metadata and task ids", () => {
    expect(isTaskPoolTechnicalLine("[towrite-state:: pool]")).toBe(true);
    expect(isTaskPoolTechnicalLine("[towrite-target:: [[Echo]] ]")).toBe(true);
    expect(isTaskPoolTechnicalLine("^task_bfc6a55669a4dc48e4eeeda3587cb155")).toBe(true);
    expect(isTaskPoolTechnicalLine("写下 [towrite-state:: pool] 的解释")).toBe(false);
    expect(isTaskPoolTechnicalLine("普通说明")).toBe(false);
  });

  it("isolates a trailing inline stable id without hiding the checkbox text", () => {
    const text = `- [ ] Keep this visible ^task_${"a".repeat(32)}`;
    const range = taskPoolTrailingIdRange(text);
    expect(range).toBeDefined();
    expect(text.slice(range!.from)).toBe(` ^task_${"a".repeat(32)}`);
    expect(taskPoolTrailingIdRange(`Explain ^task_${"a".repeat(32)} in prose`)).toBeUndefined();
  });
});
