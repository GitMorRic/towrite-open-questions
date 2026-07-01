import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type ToWriteSettings } from "../core/settings";
import type { OpenQuestion } from "../core/types";
import { AiQuestionService } from "./service";

describe("AiQuestionService", () => {
  it("does not call the provider while AI is disabled", async () => {
    const provider = { summarize: vi.fn() };
    const service = new AiQuestionService({
      app: {} as never,
      store: {
        getQuestion: () => makeQuestion()
      } as never,
      localIndex: {} as never,
      provider,
      getSettings: () => makeSettings({ enabled: false }),
      onQuestionUpdated: vi.fn()
    });

    await expect(service.refreshQuestion("oq_test", "manual")).rejects.toThrow("AI is disabled");
    expect(provider.summarize).not.toHaveBeenCalled();
  });
});

function makeSettings(ai: Partial<ToWriteSettings["ai"]>): ToWriteSettings {
  return {
    ...DEFAULT_SETTINGS,
    ai: {
      ...DEFAULT_SETTINGS.ai,
      ...ai
    }
  };
}

function makeQuestion(): OpenQuestion {
  return {
    id: "oq_test",
    lane: "think",
    status: "open",
    kind: "research",
    tags: [],
    color: "amber",
    question: "Need related notes.",
    source: {
      file: "inbox/current.md",
      headingPath: [],
      lineStart: 1,
      lineEnd: 1,
      rule: "selection"
    }
  };
}
