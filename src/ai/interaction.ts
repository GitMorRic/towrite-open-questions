import { normalizeChoiceInteraction, type AiAssistantChoiceInteraction } from "./chat";
import type { AiToolCall, AiToolDefinition } from "./types";

export const ASK_USER_CHOICE_TOOL: AiToolDefinition = {
  type: "function",
  function: {
    name: "ask_user_choice",
    description: "Ask the user to choose between two to eight concrete options when their decision is required before continuing.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["question", "options"],
      properties: {
        question: { type: "string", description: "A concise decision question." },
        options: {
          type: "array",
          minItems: 2,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              description: { type: "string" }
            }
          }
        }
      }
    }
  }
};

export const BACKEND_CHOICE_INSTRUCTION = [
  "Interactive tool available: ask_user_choice.",
  "Only when a user decision is necessary before you can continue, return a fenced block with language towrite-choice:",
  "```towrite-choice",
  '{"question":"A concise question","options":[{"id":"option-a","label":"Option A","description":"Tradeoff"},{"id":"option-b","label":"Option B"}]}',
  "```",
  "Provide two to eight concrete options. Do not use this tool for rhetorical questions or when you can proceed safely."
].join("\n");

export interface ParsedAssistantInteraction {
  content: string;
  interaction?: AiAssistantChoiceInteraction;
}

export function parseDirectInteraction(content: string, toolCalls: AiToolCall[]): ParsedAssistantInteraction {
  const call = toolCalls.find((item) => item.name === "ask_user_choice");
  const interaction = call
    ? normalizeChoiceInteraction({
        kind: "choice",
        id: call.id,
        ...(isRecord(call.arguments) ? call.arguments : {}),
        status: "pending"
      })
    : undefined;
  return {
    content: content.trim() || interaction?.question || "",
    interaction
  };
}

export function parseBackendInteraction(reply: string): ParsedAssistantInteraction {
  const pattern = /```towrite-choice\s*\r?\n([\s\S]*?)\r?\n```/iu;
  const match = pattern.exec(reply);
  if (!match) {
    return { content: reply.trim() };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(match[1].trim()) as unknown;
  } catch {
    return { content: reply.trim() };
  }
  const interaction = normalizeChoiceInteraction({
    kind: "choice",
    id: `choice_${Date.now().toString(36)}`,
    ...(isRecord(payload) ? payload : {}),
    status: "pending"
  });
  if (!interaction) {
    return { content: reply.trim() };
  }
  const content = reply.replace(match[0], "").trim();
  return { content: content || interaction.question, interaction };
}

export function choiceFollowUpText(interaction: AiAssistantChoiceInteraction, optionId: string): string | undefined {
  const option = interaction.options.find((item) => item.id === optionId);
  if (!option) {
    return undefined;
  }
  return `My choice for “${interaction.question}”: ${option.label}${option.description ? ` — ${option.description}` : ""}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
