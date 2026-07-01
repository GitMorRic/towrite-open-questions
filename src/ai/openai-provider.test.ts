import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { OpenAiCompatibleProvider } from "./openai-provider";
import type { AiContextInput } from "./types";

describe("OpenAiCompatibleProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls an OpenAI-compatible chat completions endpoint", async () => {
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValue({
      status: 200,
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "Need measured voltage-drop evidence.",
                nextAction: "Compare measurements from related local notes.",
                relatedNotes: [{ file: "local/ws2812.md", title: "WS2812 notes", reason: "contains measurements" }],
                relatedConcepts: ["voltage drop", "full white current"],
                confidence: 0.8
              })
            }
          }
        ]
      }
    } as never);

    const provider = new OpenAiCompatibleProvider(() => ({
      enabled: true,
      baseUrl: "https://example.test/v1/",
      apiKey: "test-key",
      model: "test-model",
      autoRun: false,
      maxAutoRunsPerSession: 5,
      rerankLocalNotes: true
    }));

    const result = await provider.summarize(makeContext());
    const request = requestUrlSpy.mock.calls[0]?.[0] as { body?: string; headers?: Record<string, string> } | undefined;
    const body = JSON.parse(String(request?.body));

    expect(request).toMatchObject({
      url: "https://example.test/v1/chat/completions",
      method: "POST"
    });
    expect(request?.headers).toMatchObject({
      authorization: "Bearer test-key"
    });
    expect(body.model).toBe("test-model");
    expect(body.messages[1].content).toContain("local/ws2812.md");
    expect(result.summary).toBe("Need measured voltage-drop evidence.");
    expect(result.relatedNotes?.[0]).toMatchObject({
      file: "local/ws2812.md",
      title: "WS2812 notes",
      reason: "contains measurements"
    });
  });

  it("throws on non-successful responses", async () => {
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValue({ status: 401, json: {} } as never);
    const provider = new OpenAiCompatibleProvider(() => ({
      enabled: true,
      baseUrl: "https://example.test/v1",
      apiKey: "bad-key",
      model: "test-model",
      autoRun: false,
      maxAutoRunsPerSession: 5,
      rerankLocalNotes: true
    }));

    await expect(provider.summarize(makeContext())).rejects.toThrow("HTTP 401");
  });
});

function makeContext(): AiContextInput {
  return {
    noteTitle: "Current note",
    frontmatter: { tags: ["hardware"] },
    headingPath: ["Power"],
    question: {
      id: "oq_test",
      lane: "think",
      status: "open",
      kind: "research",
      tags: ["ws2812"],
      color: "amber",
      question: "Need WS2812 voltage drop measurements.",
      source: {
        file: "inbox/current.md",
        headingPath: ["Power"],
        lineStart: 1,
        lineEnd: 1,
        rule: "selection"
      }
    },
    anchorText: "Need WS2812 voltage drop measurements.",
    beforeLines: ["Power planning"],
    afterLines: ["More data needed"],
    localCandidates: [
      {
        file: "local/ws2812.md",
        title: "WS2812 notes",
        headings: ["Measurements"],
        tags: ["ws2812"],
        snippet: "Measured a 16 LED ring.",
        score: 8.2
      }
    ]
  };
}
