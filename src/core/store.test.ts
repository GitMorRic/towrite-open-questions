import { describe, expect, it } from "vitest";
import { makeQuestionId } from "./hash";
import { parseOpenQuestionDocument } from "./parser";
import { OpenQuestionStore } from "./store";
import type { OpenQuestion, OpenQuestionSuggestion } from "./types";

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

describe("OpenQuestionStore file snapshots", () => {
  it("replaces questions and suggestions with one notification", () => {
    const store = new OpenQuestionStore();
    const question = makeQuestion("note.md", "question-1");
    const suggestion = makeSuggestion("note.md", "suggestion-1");
    let notifications = 0;
    store.subscribe(() => notifications += 1);

    store.replaceFileSnapshot("note.md", [question], [suggestion]);

    expect(notifications).toBe(1);
    expect(store.getQuestionsForFile("note.md")).toEqual([question]);
    expect(store.getSuggestionsForFile("note.md")).toEqual([suggestion]);
  });

  it("atomically replaces the parsed Vault snapshot while preserving sidecars", () => {
    const store = new OpenQuestionStore();
    const stale = makeQuestion("stale.md", "stale");
    const sidecar = makeQuestion("sidecar.md", "sidecar");
    store.replaceFileSnapshot("stale.md", [stale], [makeSuggestion("stale.md", "stale-suggestion")]);
    store.replaceSidecarQuestions("sidecar.md", [sidecar]);
    let notifications = 0;
    store.subscribe(() => notifications += 1);

    const current = makeQuestion("current.md", "current");
    const suggestion = makeSuggestion("current.md", "current-suggestion");
    store.replaceVaultSnapshot([{
      filePath: "current.md",
      questions: [current],
      suggestions: [suggestion]
    }]);

    expect(notifications).toBe(1);
    expect(store.getQuestionsForFile("stale.md")).toEqual([]);
    expect(store.getSuggestionsForFile("stale.md")).toEqual([]);
    expect(store.getQuestionsForFile("current.md")).toEqual([current]);
    expect(store.getQuestionsForFile("sidecar.md")).toEqual([sidecar]);
  });

  it("removes parsed data without discarding persistent sidecar questions", () => {
    const store = new OpenQuestionStore();
    const parsed = makeQuestion("note.md", "parsed");
    const sidecar = makeQuestion("note.md", "sidecar");
    store.replaceFileSnapshot("note.md", [parsed], [makeSuggestion("note.md", "suggestion")]);
    store.replaceSidecarQuestions("note.md", [sidecar]);

    store.removeParsedFile("note.md", false);

    expect(store.getQuestionsForFile("note.md")).toEqual([sidecar]);
    expect(store.getSuggestionsForFile("note.md")).toEqual([]);
  });

  it("reads one file without iterating unrelated file collections", () => {
    const store = new OpenQuestionStore();
    const targetQuestion = makeQuestion("target.md", "target-question");
    const targetSuggestion = makeSuggestion("target.md", "target-suggestion");
    store.replaceFileSnapshot("target.md", [targetQuestion], [targetSuggestion]);

    const internals = store as unknown as {
      parsedByFile: Map<string, OpenQuestion[]>;
      sidecarByFile: Map<string, OpenQuestion[]>;
      suggestionsByFile: Map<string, OpenQuestionSuggestion[]>;
    };
    internals.parsedByFile.set("unrelated.md", failIfIterated<OpenQuestion>());
    internals.sidecarByFile.set("unrelated.md", failIfIterated<OpenQuestion>());
    internals.suggestionsByFile.set("unrelated.md", failIfIterated<OpenQuestionSuggestion>());

    expect(store.getQuestionsForFile("target.md")).toEqual([targetQuestion]);
    expect(store.getSuggestionsForFile("target.md")).toEqual([targetSuggestion]);
  });
});

function makeQuestion(file: string, id: string): OpenQuestion {
  return {
    id,
    lane: "think",
    status: "open",
    kind: "other",
    tags: [],
    color: "amber",
    question: id,
    source: {
      file,
      headingPath: [],
      lineStart: 0,
      lineEnd: 0,
      rule: "selection"
    }
  };
}

function makeSuggestion(file: string, id: string): OpenQuestionSuggestion {
  return {
    id,
    lane: "write",
    kind: "other",
    tags: [],
    color: "sky",
    question: id,
    anchorText: id,
    source: {
      file,
      headingPath: [],
      lineStart: 0,
      lineEnd: 0,
      rule: "candidate"
    }
  };
}

function failIfIterated<T>(): T[] {
  return new Proxy([] as T[], {
    get(target, property, receiver) {
      if (property === Symbol.iterator) {
        throw new Error("An unrelated file collection was scanned");
      }
      return Reflect.get(target, property, receiver) as unknown;
    }
  });
}
