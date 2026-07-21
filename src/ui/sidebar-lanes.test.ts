import { describe, expect, it } from "vitest";
import { allSurfaceCount, shouldRenderInboxPreview } from "./sidebar-lanes";

describe("sidebar All aggregation", () => {
  it("shows six Inbox notes when there are no current-note questions", () => {
    expect(allSurfaceCount(0, 6)).toBe(6);
    expect(shouldRenderInboxPreview("all", 6)).toBe(true);
  });

  it("keeps the focused Inbox and question lanes free of duplicate previews", () => {
    expect(shouldRenderInboxPreview("inbox", 6)).toBe(false);
    expect(shouldRenderInboxPreview("think", 6)).toBe(false);
    expect(shouldRenderInboxPreview("all", 0)).toBe(false);
  });
});
