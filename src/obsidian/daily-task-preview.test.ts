import { describe, expect, it } from "vitest";
import { dailyTaskPreviewIdRange } from "./daily-task-preview";

describe("Daily task reading preview", () => {
  it("finds inline and standalone stable ids while leaving ordinary block ids alone", () => {
    expect(dailyTaskPreviewIdRange(
      "这是一个待办 ^daily_1234567890abcdef1234567890abcdef"
    )).toEqual({ from: 6, to: 46 });
    expect(dailyTaskPreviewIdRange("^daily_1234567890abcdef1234567890abcdef"))
      .toEqual({ from: 0, to: 39 });
    expect(dailyTaskPreviewIdRange("正文 ^ordinary-block")).toBeUndefined();
  });
});
