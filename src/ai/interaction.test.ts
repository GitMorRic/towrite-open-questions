import { describe, expect, it } from "vitest";
import { choiceFollowUpText, parseBackendInteraction, parseDirectInteraction } from "./interaction";

describe("AI assistant interactions", () => {
  it("turns an OpenAI-compatible tool call into a choice card", () => {
    const parsed = parseDirectInteraction("", [{
      id: "call_1",
      name: "ask_user_choice",
      arguments: {
        question: "Where should we start?",
        options: [{ id: "plan", label: "Plan" }, { id: "draft", label: "Draft" }]
      }
    }]);
    expect(parsed.content).toBe("Where should we start?");
    expect(parsed.interaction).toMatchObject({ id: "call_1", status: "pending" });
  });

  it("extracts a Backend choice marker without showing protocol text", () => {
    const parsed = parseBackendInteraction([
      "I need one decision.",
      "```towrite-choice",
      '{"question":"Pick a mode","options":[{"id":"fast","label":"Fast"},{"id":"deep","label":"Deep"}]}',
      "```"
    ].join("\n"));
    expect(parsed.content).toBe("I need one decision.");
    expect(parsed.interaction?.options).toHaveLength(2);
    expect(choiceFollowUpText(parsed.interaction!, "deep")).toContain("Deep");
  });
});
