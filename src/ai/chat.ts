export type AiAssistantRole = "user" | "assistant";
export type AiAssistantMode = "direct" | "backend";

export interface AiAssistantChoiceOption {
  id: string;
  label: string;
  description?: string;
}

export interface AiAssistantChoiceInteraction {
  kind: "choice";
  id: string;
  question: string;
  options: AiAssistantChoiceOption[];
  status: "pending" | "answered";
  selectedOptionId?: string;
}

export interface AiAssistantMessage {
  id: string;
  role: AiAssistantRole;
  content: string;
  createdAt: string;
  modelId?: string;
  skillPath?: string;
  agentIds?: string[];
  interaction?: AiAssistantChoiceInteraction;
}

export interface AiAssistantState {
  messages: AiAssistantMessage[];
  selectedModelId: string;
  selectedSkillPath: string;
  selectedAgentIds: string[];
}

export const EMPTY_AI_ASSISTANT_STATE: AiAssistantState = {
  messages: [],
  selectedModelId: "",
  selectedSkillPath: "",
  selectedAgentIds: []
};

export function normalizeAiAssistantState(value: unknown): AiAssistantState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_AI_ASSISTANT_STATE };
  }
  const record = value as Record<string, unknown>;
  const messages = Array.isArray(record.messages)
    ? record.messages.map(normalizeMessage).filter((message): message is AiAssistantMessage => Boolean(message)).slice(-80)
    : [];
  return {
    messages,
    selectedModelId: safeText(record.selectedModelId, 240),
    selectedSkillPath: safeText(record.selectedSkillPath, 500),
    selectedAgentIds: normalizeStringList(record.selectedAgentIds, 8, 160) ?? []
  };
}

export function createAiAssistantMessage(
  role: AiAssistantRole,
  content: string,
  metadata: Pick<AiAssistantMessage, "modelId" | "skillPath" | "agentIds" | "interaction"> = {}
): AiAssistantMessage {
  const createdAt = new Date().toISOString();
  return {
    id: `chat_${createdAt.replace(/\D/gu, "").slice(0, 17)}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content: content.trim().slice(0, 24000),
    createdAt,
    ...metadata
  };
}

function normalizeMessage(value: unknown): AiAssistantMessage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const role = record.role === "user" || record.role === "assistant" ? record.role : undefined;
  const content = safeText(record.content, 24000);
  if (!role || !content) {
    return undefined;
  }
  return {
    id: safeText(record.id, 160) || `chat_${Math.random().toString(36).slice(2, 10)}`,
    role,
    content,
    createdAt: safeText(record.createdAt, 80) || new Date().toISOString(),
    modelId: safeText(record.modelId, 240) || undefined,
    skillPath: safeText(record.skillPath, 500) || undefined,
    agentIds: normalizeStringList(record.agentIds, 8, 160),
    interaction: normalizeChoiceInteraction(record.interaction)
  };
}

export function normalizeChoiceInteraction(value: unknown): AiAssistantChoiceInteraction | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record.kind !== "choice") {
    return undefined;
  }
  const question = safeText(record.question, 1000);
  const options = Array.isArray(record.options)
    ? record.options.map(normalizeChoiceOption).filter((option): option is AiAssistantChoiceOption => Boolean(option)).slice(0, 8)
    : [];
  if (!question || options.length < 2) {
    return undefined;
  }
  const selectedOptionId = safeText(record.selectedOptionId, 160) || undefined;
  return {
    kind: "choice",
    id: safeText(record.id, 160) || `choice_${Math.random().toString(36).slice(2, 10)}`,
    question,
    options,
    status: record.status === "answered" && selectedOptionId ? "answered" : "pending",
    selectedOptionId
  };
}

function normalizeChoiceOption(value: unknown): AiAssistantChoiceOption | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const label = safeText(record.label, 240);
  if (!label) {
    return undefined;
  }
  return {
    id: safeText(record.id, 160) || label.toLowerCase().replace(/\s+/gu, "-").slice(0, 160),
    label,
    description: safeText(record.description, 500) || undefined
  };
}

function normalizeStringList(value: unknown, maxItems: number, maxLength: number): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = [...new Set(value.map((item) => safeText(item, maxLength)).filter(Boolean))].slice(0, maxItems);
  return values.length > 0 ? values : undefined;
}

function safeText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
