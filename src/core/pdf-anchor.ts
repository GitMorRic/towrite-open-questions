import type { PdfAnchor, PdfAnchorRect } from "./types";

export interface PdfRectInput {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PdfPageBox extends PdfRectInput {
  pageNumber: number;
}

export interface PdfRectWithPage {
  rect: PdfRectInput;
  page: PdfPageBox;
}

export function buildPdfAnchor(selectedText: string, items: PdfRectWithPage[]): PdfAnchor | undefined {
  const rects = items
    .map(({ rect, page }) => normalizePdfRect(rect, page))
    .filter((rect): rect is PdfAnchorRect => Boolean(rect));

  if (!selectedText.trim() || rects.length === 0) {
    return undefined;
  }

  return {
    pageNumber: rects[0].pageNumber,
    selectedText: selectedText.trim(),
    rects
  };
}

export function normalizePdfRect(rect: PdfRectInput, page: PdfPageBox): PdfAnchorRect | undefined {
  if (rect.width < 1 || rect.height < 1 || page.width <= 0 || page.height <= 0) {
    return undefined;
  }

  const rawLeft = clamp((rect.left - page.left) / page.width, 0, 1);
  const rawTop = clamp((rect.top - page.top) / page.height, 0, 1);
  const rawRight = clamp((rect.left + rect.width - page.left) / page.width, 0, 1);
  const rawBottom = clamp((rect.top + rect.height - page.top) / page.height, 0, 1);
  const width = roundRatio(rawRight - rawLeft);
  const height = roundRatio(rawBottom - rawTop);

  if (width <= 0 || height <= 0) {
    return undefined;
  }

  return {
    pageNumber: page.pageNumber,
    left: roundRatio(rawLeft),
    top: roundRatio(rawTop),
    width,
    height
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundRatio(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
