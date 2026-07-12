import { CAPTURE_SCHEMA_VERSION, type CaptureTargetCandidate } from "../capture/types";
import { describe, expect, it } from "vitest";
import {
  chooseDefaultCaptureCandidate,
  extractCaptureLinks,
  parseCaptureTags,
  reconcileCaptureCandidateId,
  visibleCaptureCandidates
} from "./capture-modal-types";

describe("capture modal state helpers", () => {
  it("normalizes comma, whitespace, hash and CJK tag separators", () => {
    expect(parseCaptureTags("#Research, research，idea； #中文、next")).toEqual([
      "Research",
      "idea",
      "中文",
      "next"
    ]);
  });

  it("extracts unique links without sentence punctuation", () => {
    expect(extractCaptureLinks(
      "Read https://example.com/a, then https://example.com/a. 中文：https://example.org/x？"
    )).toEqual(["https://example.com/a", "https://example.org/x"]);
  });

  it("shows at most three unique candidates", () => {
    const candidates = [
      candidate("note", "existingNote", "weak"),
      candidate("note", "existingNote", "weak"),
      candidate("folder", "folder", "medium"),
      candidate("inbox", "inbox", "weak"),
      candidate("extra", "folder", "strong")
    ];

    expect(visibleCaptureCandidates(candidates).map(({ id }) => id)).toEqual([
      "note",
      "folder",
      "inbox"
    ]);
  });

  it("uses a confident first match and otherwise falls back to Inbox", () => {
    const weakNote = candidate("note", "existingNote", "weak");
    const inbox = candidate("inbox", "inbox", "weak");
    const folder = candidate("folder", "folder", "medium");

    expect(chooseDefaultCaptureCandidate([folder, weakNote, inbox])?.id).toBe("folder");
    expect(chooseDefaultCaptureCandidate([weakNote, folder, inbox])?.id).toBe("inbox");
    expect(chooseDefaultCaptureCandidate([weakNote, inbox])?.id).toBe("inbox");
  });

  it("does not let a late rerank replace a manual target selection", () => {
    const note = candidate("note", "existingNote", "medium");
    const folder = candidate("folder", "folder", "strong");
    const inbox = candidate("inbox", "inbox", "weak");

    expect(reconcileCaptureCandidateId([folder, note, inbox], "note", true)).toBe("note");
    expect(reconcileCaptureCandidateId([folder, note, inbox], "note", false)).toBe("folder");
  });
});

function candidate(
  id: string,
  kind: CaptureTargetCandidate["kind"],
  confidence: CaptureTargetCandidate["confidence"]
): CaptureTargetCandidate {
  return {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    id,
    kind,
    action: kind === "existingNote" ? "append" : "create",
    path: kind === "folder" ? "Projects" : `${id}.md`,
    reason: "test",
    confidence,
    score: 0.5,
    targetRevision: "rev-1"
  };
}
