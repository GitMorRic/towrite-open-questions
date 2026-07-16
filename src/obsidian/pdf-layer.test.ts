import { describe, expect, it } from "vitest";
import { pdfMutationsRequireRender } from "./pdf-layer";

function mutation(target: object, addedNodes: object[] = [], removedNodes: object[] = []) {
  return {
    target,
    addedNodes,
    removedNodes
  } as unknown as Pick<MutationRecord, "target" | "addedNodes" | "removedNodes">;
}

describe("pdfMutationsRequireRender", () => {
  it("ignores mutations produced while rebuilding the plugin highlight layer", () => {
    const highlight = {};
    const root = {
      contains: (node: unknown) => node === highlight
    } as unknown as HTMLElement;

    expect(pdfMutationsRequireRender([
      mutation(root, [], [highlight])
    ], root)).toBe(false);
  });

  it("renders when the PDF viewer adds or removes its own page nodes", () => {
    const viewer = {};
    const page = {};
    const root = {
      contains: () => false
    } as unknown as HTMLElement;

    expect(pdfMutationsRequireRender([
      mutation(viewer, [page])
    ], root)).toBe(true);
  });
});
