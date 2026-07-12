import { afterEach, describe, expect, it, vi } from "vitest";
import { applyBackendRerank, BackendEnhancementClient, buildRecommendationPayload } from "./client";
import type { CaptureDraft, CaptureTargetCandidate } from "../capture/types";

const draft: CaptureDraft = {
  schemaVersion: 1,
  id: "capture-1",
  intent: "selection",
  body: "A local-only draft",
  title: "Draft",
  tags: ["writing"],
  links: [],
  source: { file: "Projects/Secret.md", selection: "must not leave the plugin" }
};

const candidates: CaptureTargetCandidate[] = [
  { schemaVersion: 1, id: "note", kind: "existingNote", action: "append", path: "Private/Secret.md", reason: "local", confidence: "medium", score: 4, targetRevision: "a" },
  { schemaVersion: 1, id: "inbox", kind: "inbox", action: "append", path: "Inbox.md", reason: "fallback", confidence: "weak", score: 0, targetRevision: "b" }
];

describe("Backend enhancement contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("omits draft content and exact source paths from the backend payload", () => {
    const payload = buildRecommendationPayload(draft, candidates);
    expect(payload.draft.source).toEqual({
      hasFile: true,
      headingDepth: 0,
      hasQuestion: false,
      entryPoint: undefined
    });
    expect(JSON.stringify(payload)).not.toContain("must not leave");
    expect(JSON.stringify(payload)).not.toContain("A local-only draft");
    expect(JSON.stringify(payload)).not.toContain("Projects/Secret.md");
    expect(JSON.stringify(payload)).not.toContain("Private/Secret.md");
  });

  it("can only rerank known local candidate ids", () => {
    const result = applyBackendRerank(candidates, {
      candidates: [
        { id: "evil", reason: "Outside catalog", score: 999 },
        { id: "inbox", reason: "Backend prefers the safe fallback", confidence: "strong", score: 10 }
      ]
    });
    expect(result.map((item) => item.id)).toEqual(["inbox", "note"]);
    expect(result[0].reason).toBe("Backend prefers the safe fallback");
    expect(result.some((item) => item.id === "evil")).toBe(false);
  });

  it("falls back to the local order for an incompatible protocol", async () => {
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        protocolVersion: "2",
        candidates: [{ id: "inbox", score: 999 }]
      })
    })));
    const client = new BackendEnhancementClient(() => ({
      enabled: true,
      baseUrl: "http://127.0.0.1:8790",
      token: "secret",
      useForRecommendations: true,
      useForHabitSuggestions: false,
      timeoutMs: 2500
    }));

    await expect(client.rerankTargets(draft, candidates)).resolves.toEqual(candidates);
  });
});
