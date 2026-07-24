import { describe, expect, it } from "vitest";
import { getDailyTaskControlUpdateStrategy } from "./daily-task-controls";

describe("Daily editor task controls", () => {
  it("maps cached widgets during typing instead of rebuilding the Daily plan", () => {
    expect(getDailyTaskControlUpdateStrategy({
      docChanged: true,
      reconfigured: false,
      refreshRequested: false
    })).toBe("map");
  });

  it("rebuilds only after an explicit cache refresh or editor reconfiguration", () => {
    expect(getDailyTaskControlUpdateStrategy({
      docChanged: false,
      reconfigured: false,
      refreshRequested: true
    })).toBe("rebuild");
    expect(getDailyTaskControlUpdateStrategy({
      docChanged: false,
      reconfigured: true,
      refreshRequested: false
    })).toBe("rebuild");
  });
});
