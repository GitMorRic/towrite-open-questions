import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  getQuestionDecorationUpdateStrategy,
  selectionTouchesLineRange,
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

  it("rebuilds after selection-only updates so the active paragraph stays quiet", () => {
    expect(getQuestionDecorationUpdateStrategy(signals({ selectionSet: true }))).toBe("rebuild");
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

describe("selectionTouchesLineRange", () => {
  it("recognizes a cursor inside a multi-line candidate paragraph", () => {
    const state = EditorState.create({
      doc: "Introduction\nTODO draft\ncontinued detail\nFooter",
      selection: { anchor: 25 }
    });

    expect(selectionTouchesLineRange(state, 2, 3)).toBe(true);
    expect(selectionTouchesLineRange(state, 4, 4)).toBe(false);
  });
});
