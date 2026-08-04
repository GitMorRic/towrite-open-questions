import { describe, expect, it } from "vitest";
import { migrateWorkbenchTab } from "./workbench-state";

describe("single Workbench view-state migration", () => {
  it("maps legacy Dashboard and Daily surface state into the three tabs", () => {
    expect(migrateWorkbenchTab({ activeTab: "all" })).toBe("status");
    expect(migrateWorkbenchTab({ activeTab: "today", dailySurface: "pool" })).toBe("pool");
    expect(migrateWorkbenchTab({ dailySurface: "review" })).toBe("today");
    expect(migrateWorkbenchTab({ activeTab: "pool" })).toBe("pool");
    expect(migrateWorkbenchTab(undefined, "status")).toBe("status");
  });
});
