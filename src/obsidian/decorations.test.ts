import { describe, expect, it } from "vitest";
import {
  getQuestionDecorationUpdateStrategy,
  type QuestionDecorationUpdateSignals
} from "./decorations";

function signals(overrides: Partial<QuestionDecorationUpdateSignals> = {}): QuestionDecorationUpdateSignals {
  return {
    docChanged: false,
    selectionSet: false,
    viewportChanged: false,
    reconfigured: false,
    ...overrides
  };
}

describe("getQuestionDecorationUpdateStrategy", () => {
  it("maps existing decorations through document changes instead of rebuilding", () => {
    expect(getQuestionDecorationUpdateStrategy(signals({ docChanged: true }))).toBe("map");
  });

  it("still maps when typing also moves the selection or viewport", () => {
    expect(getQuestionDecorationUpdateStrategy(signals({
      docChanged: true,
      selectionSet: true,
      viewportChanged: true
    }))).toBe("map");
  });

  it("keeps existing decorations for selection-only updates", () => {
    expect(getQuestionDecorationUpdateStrategy(signals({ selectionSet: true }))).toBe("keep");
  });

  it("keeps existing decorations for viewport-only updates", () => {
    expect(getQuestionDecorationUpdateStrategy(signals({ viewportChanged: true }))).toBe("keep");
  });

  it("rebuilds only when the editor extension is explicitly reconfigured", () => {
    expect(getQuestionDecorationUpdateStrategy(signals({ reconfigured: true }))).toBe("rebuild");
    expect(getQuestionDecorationUpdateStrategy(signals({
      docChanged: true,
      reconfigured: true
    }))).toBe("rebuild");
  });

  it("rebuilds after an explicit data refresh without rebuilding while typing", () => {
    expect(getQuestionDecorationUpdateStrategy(signals({ refreshRequested: true }))).toBe("rebuild");
    expect(getQuestionDecorationUpdateStrategy(signals({
      docChanged: true,
      refreshRequested: true
    }))).toBe("rebuild");
  });
});
