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

  it("discovers and deduplicates models from the OpenAI-compatible models endpoint", async () => {
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValue({
      status: 200,
      json: {
        data: [
          { id: "model-b", owned_by: "local" },
          { id: "model-a", owned_by: "provider" },
          { id: "model-b", owned_by: "duplicate" },
          { id: "" }
        ]
      }
    } as never);
    const provider = new OpenAiCompatibleProvider(() => ({
      enabled: true,
      baseUrl: "https://example.test/v1/",
      apiKey: "test-key",
      model: "model-a",
      autoRun: false,
      maxAutoRunsPerSession: 5,
      rerankLocalNotes: true
    }));

    const models = await provider.listModels();

    expect(requestUrlSpy).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://example.test/v1/models",
      method: "GET",
      headers: expect.objectContaining({ authorization: "Bearer test-key" })
    }));
    expect(models).toEqual([
      { id: "model-a", ownedBy: "provider" },
      { id: "model-b", ownedBy: "local" }
    ]);
  });

  it("tests generation with the currently selected model", async () => {
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValue({
      status: 200,
      json: { choices: [{ message: { content: "OK" } }] }
    } as never);
    const provider = new OpenAiCompatibleProvider(() => ({
      enabled: true,
      baseUrl: "https://example.test/v1",
      apiKey: "test-key",
      model: "selected-model",
      autoRun: false,
      maxAutoRunsPerSession: 5,
      rerankLocalNotes: true
    }));

    const result = await provider.testConnection();
    const body = JSON.parse(String((requestUrlSpy.mock.calls[0]?.[0] as { body?: string }).body));

    expect(body).toMatchObject({ model: "selected-model", max_tokens: 256 });
    expect(result).toMatchObject({ model: "selected-model", reply: "OK" });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
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

  it("does not send direct requests while AI is disabled", async () => {
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    const provider = new OpenAiCompatibleProvider(() => ({
      enabled: false,
      baseUrl: "https://example.test/v1",
      apiKey: "test-key",
      model: "test-model",
      autoRun: false,
      maxAutoRunsPerSession: 5,
      rerankLocalNotes: true
    }));

    await expect(provider.listModels()).rejects.toThrow("AI is disabled");
    expect(requestUrlSpy).not.toHaveBeenCalled();
  });

  it("returns structured function tool calls for interactive chat", async () => {
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValue({
      status: 200,
      json: {
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: "call_choice",
              function: {
                name: "ask_user_choice",
                arguments: JSON.stringify({
                  question: "Choose a direction",
                  options: [{ id: "plan", label: "Plan" }, { id: "draft", label: "Draft" }]
                })
              }
            }]
          }
        }]
      }
    } as never);
    const provider = new OpenAiCompatibleProvider(() => ({
      enabled: true,
      baseUrl: "https://example.test/v1",
      apiKey: "test-key",
      model: "test-model",
      autoRun: false,
      maxAutoRunsPerSession: 5,
      rerankLocalNotes: true
    }));

    const result = await provider.complete([{ role: "user", content: "Help me choose" }], undefined, {
      tools: [{
        type: "function",
        function: { name: "ask_user_choice", description: "Ask a choice", parameters: { type: "object" } }
      }]
    });

    expect(result.toolCalls[0]).toMatchObject({
      id: "call_choice",
      name: "ask_user_choice",
      arguments: { question: "Choose a direction" }
    });
    const body = JSON.parse(String((requestUrlSpy.mock.calls[0]?.[0] as { body?: string }).body));
    expect(body.tool_choice).toBe("auto");
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
