import { describe, expect, it } from "vitest";
import { readObsidianDailyNotesConfiguration } from "./daily-notes";

describe("Obsidian Daily Notes integration", () => {
  it("reads the core plugin folder, format and template without importing private classes", () => {
    const app = {
      internalPlugins: {
        getPluginById: () => ({
          enabled: true,
          instance: {
            options: {
              folder: "sync\\Todo_and_tosolve/",
              format: "YYYYMMDD",
              template: "00 inbox/日记模板.md"
            }
          }
        })
      }
    };
    expect(readObsidianDailyNotesConfiguration(app as never)).toEqual({
      enabled: true,
      folder: "sync/Todo_and_tosolve",
      format: "YYYYMMDD",
      template: "00 inbox/日记模板"
    });
  });

  it("uses safe defaults when the core plugin is unavailable", () => {
    expect(readObsidianDailyNotesConfiguration({} as never)).toEqual({
      enabled: false,
      folder: "",
      format: "YYYY-MM-DD",
      template: ""
    });
  });
});
