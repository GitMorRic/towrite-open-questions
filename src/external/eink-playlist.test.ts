import { describe, expect, it } from "vitest";
import type { ArticleSummary, OpenQuestion } from "../core/types";
import type { EchoCard } from "../hub/echo-cards";
import { echoCardLocalId } from "../hub/echo-cards";
import { buildExternalEinkPlaylistPayload } from "./eink-playlist";

describe("external e-ink compatibility playlist", () => {
  it("keeps Echo cards before questions and prioritizes an explicit current card", () => {
    const firstEcho = echo(1, "Memory");
    const secondEcho = echo(2, "World");
    const firstQuestion = question("question-1");
    const secondQuestion = question("question-2");
    const ordered = [
      echoCardLocalId(firstEcho),
      echoCardLocalId(secondEcho),
      firstQuestion.id,
      secondQuestion.id
    ];

    const payload = buildExternalEinkPlaylistPayload(
      "Vault",
      [firstQuestion, secondQuestion],
      [],
      [firstEcho, secondEcho],
      {
        orderedLocalIds: ordered,
        selectedLocalId: secondQuestion.id,
        limit: 4,
        generatedAt: "2026-07-23T00:00:00.000Z"
      }
    );

    expect(payload.focus.map((item) => item.id)).toEqual([
      secondQuestion.id,
      echoCardLocalId(firstEcho),
      echoCardLocalId(secondEcho),
      firstQuestion.id
    ]);
    expect(payload.focus[1]).toMatchObject({
      title: "Echo · Project",
      body: "Context\n\nMemory",
      sourceType: "echo",
      contentType: "note_continue"
    });
    expect(payload.playlist).toMatchObject({
      order: "echo_then_questions",
      cursor: 0,
      total: 4,
      nextCursor: 1,
      previousCursor: 3,
      selectedId: secondQuestion.id
    });
  });

  it("supports wrap-around cursor paging without duplicating the queue", () => {
    const card = echo(1, "Memory");
    const item = question("question-1");
    const payload = buildExternalEinkPlaylistPayload("Vault", [item], [], [card], {
      orderedLocalIds: [echoCardLocalId(card), item.id],
      cursor: 1,
      limit: 2,
      generatedAt: "2026-07-23T00:00:00.000Z"
    });

    expect(payload.focus.map((entry) => entry.id)).toEqual([item.id, echoCardLocalId(card)]);
    expect(payload.playlist).toMatchObject({ cursor: 1, nextCursor: 0, previousCursor: 0 });
  });

  it("keeps summary counts compatible and emits a stable revision", () => {
    const item = question("question-1");
    const options = {
      orderedLocalIds: [item.id],
      generatedAt: "2026-07-23T00:00:00.000Z"
    };
    const first = buildExternalEinkPlaylistPayload("Vault", [item], articles, [], options);
    const second = buildExternalEinkPlaylistPayload("Vault", [item], articles, [], {
      ...options,
      generatedAt: "2026-07-24T00:00:00.000Z"
    });

    expect(first.summary).toEqual({ open: 1, candidate: 0, blockedArticles: 1 });
    expect(first.playlist?.revision).toBe(second.playlist?.revision);
  });
});

function echo(index: number, content: string): EchoCard {
  const hex = index.toString(16).padStart(2, "0");
  return {
    id: `echo_${hex.repeat(11)}`,
    name: content,
    inLibrary: true,
    contentType: "note_continue",
    typeLabel: "Echo",
    subject: "Project",
    context: "Context",
    content,
    whyNow: "Why now",
    sourceLabel: "Source",
    disclosure: "none",
    actions: ["capture", "later"],
    agentEligible: false,
    rotationEligible: true,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z"
  };
}

function question(id: string): OpenQuestion {
  return {
    id,
    lane: "think",
    status: "open",
    kind: "other",
    tags: [],
    color: "amber",
    title: id,
    question: `Body ${id}`,
    source: {
      file: `${id}.md`,
      headingPath: [],
      lineStart: 0,
      lineEnd: 0,
      rule: "selection"
    },
    updatedAt: "2026-07-23T00:00:00.000Z"
  };
}

const articles: ArticleSummary[] = [{
  filePath: "question-1.md",
  title: "Question",
  open: 1,
  candidate: 0,
  resolved: 0,
  ignored: 0,
  think: 1,
  write: 0,
  needsWork: true,
  topIssues: []
}];
