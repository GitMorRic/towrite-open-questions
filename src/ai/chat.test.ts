import { describe, expect, it } from "vitest";
import { createAiAssistantMessage, normalizeAiAssistantState, normalizeChoiceInteraction } from "./chat";

describe("AI assistant chat state", () => {
  it("keeps bounded valid history and selected options", () => {
    const messages = Array.from({ length: 90 }, (_, index) => ({
      id: `m${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `message ${index}`,
      createdAt: "2026-07-13T00:00:00.000Z"
    }));

    const state = normalizeAiAssistantState({
      messages: [...messages, { role: "system", content: "ignored" }, { role: "user", content: "" }],
      selectedModelId: "local_qwen_openai",
      selectedSkillPath: "99-System/02-Skills/test/SKILL.md",
      selectedAgentIds: ["writer", "reviewer"]
    });

    expect(state.messages).toHaveLength(80);
    expect(state.messages[0].content).toBe("message 10");
    expect(state.selectedModelId).toBe("local_qwen_openai");
    expect(state.selectedSkillPath).toContain("SKILL.md");
    expect(state.selectedAgentIds).toEqual(["writer", "reviewer"]);
  });

  it("creates trimmed local messages", () => {
    const message = createAiAssistantMessage("user", "  hello  ", { modelId: "model-a" });
    expect(message).toMatchObject({ role: "user", content: "hello", modelId: "model-a" });
    expect(message.id).toMatch(/^chat_/u);
  });

  it("normalizes bounded interactive choice cards", () => {
    expect(normalizeChoiceInteraction({
      kind: "choice",
      id: "next-step",
      question: "Which direction should I take?",
      options: [
        { id: "plan", label: "Make a plan", description: "Outline first" },
        { id: "draft", label: "Write now" }
      ],
      status: "pending"
    })).toMatchObject({
      id: "next-step",
      status: "pending",
      options: [{ id: "plan" }, { id: "draft" }]
    });
    expect(normalizeChoiceInteraction({ kind: "choice", question: "Only one", options: [{ label: "One" }] })).toBeUndefined();
  });
});
