import { describe, expect, it } from "vitest";
import { buildPrivateCandidateBatch, createOpaqueHubRef, MAX_HUB_CANDIDATES, type LocalHubCandidate } from "./privacy";

const SECRET = "0123456789abcdef0123456789abcdef";

describe("Device Hub candidate privacy", () => {
  it("uploads only explicit display fields and opaque references", async () => {
    const local = {
      localId: "Projects/Novel/Chapter 1.md#question-4",
      type: "question_prompt",
      display: { title: "Continue this scene", prompt: "What does the character notice?" },
      sourceLocalId: "Projects/Novel/Chapter 1.md",
      writeTargetLocalId: "Projects/Novel/Chapter 1.md#Captures",
      allowedActions: ["respond", "later"],
      reasonCode: "Current note / matching project",
      score: 0.9,
      path: "Projects/Novel/Chapter 1.md",
      rawBody: "PRIVATE NOTE BODY THAT MUST NOT CROSS THE WIRE"
    } as LocalHubCandidate & { path: string; rawBody: string };

    const batch = await buildPrivateCandidateBatch([local], {
      referenceSecret: SECRET,
      batchId: "hbatch_test",
      generatedAt: "2026-07-19T00:00:00.000Z"
    });
    const serialized = JSON.stringify(batch);

    expect(batch.candidates[0]).toMatchObject({
      candidateRef: expect.stringMatching(/^hc_[A-Za-z0-9_-]{22}$/u),
      sourceRef: expect.stringMatching(/^hs_[A-Za-z0-9_-]{22}$/u),
      writeTargetRef: expect.stringMatching(/^ht_[A-Za-z0-9_-]{22}$/u),
      display: { title: "Continue this scene", prompt: "What does the character notice?" },
      reasonCode: "current_note_matching_project"
    });
    expect(serialized).not.toContain("Projects/Novel");
    expect(serialized).not.toContain("PRIVATE NOTE BODY");
  });

  it("filters excluded, private, and no-ai candidates before enforcing the 20 item limit", async () => {
    const candidates: LocalHubCandidate[] = [
      candidate("excluded", { excluded: true }),
      candidate("private", { private: true }),
      candidate("no-ai", { noAi: true }),
      ...Array.from({ length: 25 }, (_, index) => candidate(`safe-${index}`))
    ];

    const batch = await buildPrivateCandidateBatch(candidates, { referenceSecret: SECRET });

    expect(batch.candidates).toHaveLength(MAX_HUB_CANDIDATES);
    expect(batch.candidates.every((item) => item.sensitivity === "normal")).toBe(true);
  });

  it("creates stable, kind-separated HMAC references", async () => {
    const first = await createOpaqueHubRef("source", "Secret/Path.md", SECRET);
    const repeated = await createOpaqueHubRef("source", "Secret/Path.md", SECRET);
    const target = await createOpaqueHubRef("target", "Secret/Path.md", SECRET);

    expect(first).toBe(repeated);
    expect(first).not.toBe(target);
    expect(first).not.toContain("Secret");
  });

  it("requires explicit safe display content and a sufficiently strong reference secret", async () => {
    await expect(buildPrivateCandidateBatch([{
      ...candidate("empty"),
      display: {}
    }], { referenceSecret: SECRET })).rejects.toThrow(/display content/iu);
    await expect(buildPrivateCandidateBatch([candidate("safe")], {
      referenceSecret: "too-short"
    })).rejects.toThrow(/at least 16 bytes/iu);
  });
});

function candidate(id: string, privacy?: LocalHubCandidate["privacy"]): LocalHubCandidate {
  return {
    localId: id,
    type: "note_continue",
    display: { title: `Title ${id}` },
    sourceLocalId: `source/${id}.md`,
    writeTargetLocalId: `target/${id}.md`,
    allowedActions: ["respond"],
    reasonCode: "local",
    score: 1,
    privacy
  };
}
