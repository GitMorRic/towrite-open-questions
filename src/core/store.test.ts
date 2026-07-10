import { describe, expect, it } from "vitest";
import { makeQuestionId } from "./hash";
import { parseOpenQuestionDocument } from "./parser";
import { OpenQuestionStore } from "./store";
import type { OpenQuestion } from "./types";

describe("OpenQuestionStore suggestions", () => {
  it("keeps candidate suggestion ids stable when line numbers move", () => {
    const first = parseOpenQuestionDocument(
      "这里后续还要继续写这一段\n",
      "note.md"
    ).suggestions[0];
    const moved = parseOpenQuestionDocument(
      "新增一段正文。\n\n这里后续还要继续写这一段\n",
      "note.md"
    ).suggestions[0];

    expect(first.source.lineStart).not.toBe(moved.source.lineStart);
    expect(first.id).toBe(moved.id);
  });

  it("keeps ignored candidate suggestions hidden after line numbers move", () => {
    const first = parseOpenQuestionDocument(
      "这里后续还要继续写这一段\n",
      "note.md"
    ).suggestions[0];
    const moved = parseOpenQuestionDocument(
      "新增一段正文。\n\n这里后续还要继续写这一段\n",
      "note.md"
    ).suggestions[0];
    const store = new OpenQuestionStore();

    store.replaceFileSuggestions("note.md", [first]);
    store.patchQuestion(first.id, {
      status: "ignored",
      lane: first.lane,
      question: first.question,
      anchorText: first.anchorText,
      source: first.source
    });
    store.replaceFileSuggestions("note.md", [moved]);

    expect(store.getSuggestions("note.md")).toHaveLength(0);
  });

  it("keeps legacy ignored candidate suggestions hidden after line numbers move", () => {
    const moved = parseOpenQuestionDocument(
      "新增一段正文。\n\n这里后续还要继续写这一段\n",
      "note.md"
    ).suggestions[0];
    const legacyId = makeQuestionId("note.md", 0, moved.anchorText);
    const store = new OpenQuestionStore({
      [legacyId]: {
        id: legacyId,
        status: "ignored",
        lane: moved.lane,
        question: moved.question,
        anchorText: moved.anchorText
      }
    });

    store.replaceFileSuggestions("note.md", [moved]);

    expect(store.getSuggestions("note.md")).toHaveLength(0);
  });

  it("does not show a candidate again after it was accepted as a card and moved", () => {
    const first = parseOpenQuestionDocument(
      "这里后续还要继续写这一段\n",
      "note.md"
    ).suggestions[0];
    const moved = parseOpenQuestionDocument(
      "新增一段正文。\n\n这里后续还要继续写这一段\n",
      "note.md"
    ).suggestions[0];
    const accepted: OpenQuestion = {
      id: first.id,
      lane: first.lane,
      status: "open",
      kind: first.kind,
      tags: first.tags,
      color: first.color,
      question: first.question,
      anchorText: first.anchorText,
      source: first.source,
      contextSummary: first.contextSummary
    };
    const store = new OpenQuestionStore();

    store.replaceSidecarQuestions("note.md", [accepted]);
    store.replaceFileSuggestions("note.md", [moved]);

    expect(store.getSuggestions("note.md")).toHaveLength(0);
  });
});
