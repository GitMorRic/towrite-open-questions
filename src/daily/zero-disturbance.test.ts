import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DailyPlanNormalizationService } from "./normalization-service";
import type { DailyPlanStorage } from "./plan-service";

describe("zero-disturbance Daily editing", () => {
  it("keeps preview and refresh read-only while the author continues a numbered child list", async () => {
    const path = "Daily/2026-08-11.md";
    const original = "## ToDo\n\n- [ ] 其他\n  1. \n";
    const storage = new MemoryStorage(path, original);
    const service = new DailyPlanNormalizationService(storage, {
      source: { kind: "daily-note", dailyRoot: "Daily", dateFormat: "YYYY-MM-DD" }
    });

    const preview = await service.preview("2026-08-11");
    expect(preview.edits.some((edit) => edit.kind === "missing-block-id")).toBe(false);
    expect(storage.files.get(path)).toBe(original);
    expect(storage.writes).toBe(0);
  });

  it("does not call the normalizer from dashboard or Vault refresh paths", () => {
    const source = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
    expect(source).not.toContain("normalizeMissingDailyCheckboxIds");
    const refreshStart = source.indexOf("async refreshDailyDashboard");
    const refresh = source.slice(
      refreshStart,
      source.indexOf("\n  private ", refreshStart)
    );
    expect(refresh).not.toContain("normalizeTask(");
    expect(refresh).not.toContain("normalizePlan(");
  });

  it("renders editor actions as hover overlays instead of layout rows", () => {
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    expect(styles).toContain(".towrite-daily-line-controls");
    expect(styles).toContain("position: absolute");
    expect(styles).toContain("opacity: 0");
  });
});

class MemoryStorage implements DailyPlanStorage {
  readonly files = new Map<string, string>();
  writes = 0;

  constructor(path: string, content: string) {
    this.files.set(path, content);
  }

  async readText(path: string): Promise<string | undefined> {
    return this.files.get(path);
  }

  async writeText(path: string, content: string): Promise<void> {
    this.writes += 1;
    this.files.set(path, content);
  }
}
