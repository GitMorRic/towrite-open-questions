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
      displayCategory: "echo",
      contentType: "note_continue"
    });
    expect(payload.focus[0]).toMatchObject({
      sourceType: "question",
      displayCategory: "tothink"
    });
    expect(payload.playlist).toMatchObject({
      order: "echo_then_questions",
      cursor: 0,
      total: 4,
      queueTotal: 4,
      currentInQueue: true,
      currentIndex: 3,
      currentPosition: 4,
      currentId: secondQuestion.id,
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
    expect(payload.playlist).toMatchObject({
      cursor: 1,
      currentIndex: 1,
      currentPosition: 2,
      currentId: item.id,
      nextCursor: 0,
      previousCursor: 0
    });
  });

  it("reports canonical page progress while selected cards are promoted to cursor zero", () => {
    const firstEcho = echo(1, "Memory");
    const secondEcho = echo(2, "World");
    const item = question("question-1");
    const orderedLocalIds = [
      echoCardLocalId(firstEcho),
      echoCardLocalId(secondEcho),
      item.id
    ];
    const at = (selectedLocalId: string) => buildExternalEinkPlaylistPayload(
      "Vault",
      [item],
      [],
      [firstEcho, secondEcho],
      {
        orderedLocalIds,
        selectedLocalId,
        cursor: 0,
        limit: 1,
        generatedAt: "2026-07-23T00:00:00.000Z"
      }
    );

    expect(at(echoCardLocalId(firstEcho)).playlist).toMatchObject({
      cursor: 0,
      currentIndex: 0,
      currentPosition: 1,
      total: 3
    });
    expect(at(echoCardLocalId(secondEcho)).playlist).toMatchObject({
      cursor: 0,
      currentIndex: 1,
      currentPosition: 2,
      total: 3
    });
    expect(at(item.id).playlist).toMatchObject({
      cursor: 0,
      currentIndex: 2,
      currentPosition: 3,
      total: 3
    });
  });

  it("keeps a manual-only card outside the stable paging count", () => {
    const preview = echo(1, "Manual preview");
    const item = question("question-1");
    const payload = buildExternalEinkPlaylistPayload(
      "Vault",
      [item],
      [],
      [preview],
      {
        orderedLocalIds: [item.id],
        selectedLocalId: echoCardLocalId(preview),
        cursor: 0,
        limit: 1,
        generatedAt: "2026-07-23T00:00:00.000Z"
      }
    );

    expect(payload.focus[0]).toMatchObject({
      id: echoCardLocalId(preview),
      displayCategory: "echo"
    });
    expect(payload.playlist).toMatchObject({
      total: 2,
      queueTotal: 1,
      currentInQueue: false,
      currentIndex: -1,
      currentPosition: 0,
      currentId: echoCardLocalId(preview)
    });
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
