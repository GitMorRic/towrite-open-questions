import type { OpenQuestion, OpenQuestionAi } from "../core/types";

export interface LocalKnowledgeCandidate {
  file: string;
  title: string;
  headings: string[];
  tags: string[];
  snippet: string;
  score: number;
}

export interface AiContextInput {
  noteTitle: string;
  frontmatter?: Record<string, unknown>;
  headingPath: string[];
  question: OpenQuestion;
  anchorText?: string;
  beforeLines: string[];
  afterLines: string[];
  fullNote?: string;
  localCandidates: LocalKnowledgeCandidate[];
}

export interface AiQuestionProvider {
  summarize(input: AiContextInput): Promise<OpenQuestionAi>;
}

export interface AiModelInfo {
  id: string;
  ownedBy?: string;
}

export interface AiConnectionResult {
  model: string;
  reply: string;
  latencyMs: number;
}

export interface AiChatMessageInput {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AiToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface AiChatCompletionResult {
  content: string;
  toolCalls: AiToolCall[];
}

export interface AiRefreshResult {
  ai: OpenQuestionAi;
  mode: "manual" | "auto";
}
