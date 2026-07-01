import { describe, expect, it } from "vitest";
import { buildPdfAnchor, normalizePdfRect } from "./pdf-anchor";

describe("pdf anchors", () => {
  it("normalizes client rects into page-relative coordinates", () => {
    const rect = normalizePdfRect(
      { left: 150, top: 220, width: 100, height: 40 },
      { pageNumber: 3, left: 100, top: 200, width: 500, height: 800 }
    );

    expect(rect).toEqual({
      pageNumber: 3,
      left: 0.1,
      top: 0.025,
      width: 0.2,
      height: 0.05
    });
  });

  it("clamps overflow and drops tiny rects", () => {
    expect(normalizePdfRect(
      { left: 95, top: 190, width: 20, height: 20 },
      { pageNumber: 1, left: 100, top: 200, width: 400, height: 600 }
    )).toEqual({
      pageNumber: 1,
      left: 0,
      top: 0,
      width: 0.0375,
      height: 0.016667
    });

    expect(normalizePdfRect(
      { left: 120, top: 220, width: 0.5, height: 12 },
      { pageNumber: 1, left: 100, top: 200, width: 400, height: 600 }
    )).toBeUndefined();
  });

  it("builds multi-page anchors", () => {
    const anchor = buildPdfAnchor("selected text", [
      {
        rect: { left: 120, top: 220, width: 40, height: 20 },
        page: { pageNumber: 2, left: 100, top: 200, width: 400, height: 600 }
      },
      {
        rect: { left: 130, top: 250, width: 50, height: 20 },
        page: { pageNumber: 3, left: 100, top: 200, width: 400, height: 600 }
      }
    ]);

    expect(anchor?.pageNumber).toBe(2);
    expect(anchor?.selectedText).toBe("selected text");
    expect(anchor?.rects.map((rect) => rect.pageNumber)).toEqual([2, 3]);
  });
});
