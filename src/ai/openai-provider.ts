import { requestUrl } from "obsidian";
import type { ToWriteAiSettings } from "../core/settings";
import type { OpenQuestionAi } from "../core/types";
import type {
  AiChatMessageInput,
  AiChatCompletionResult,
  AiConnectionResult,
  AiContextInput,
  AiModelInfo,
  AiQuestionProvider,
  AiToolDefinition
} from "./types";

interface ChatCompletionToolCall {
  id?: unknown;
  function?: { name?: unknown; arguments?: unknown };
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: ChatCompletionToolCall[];
    };
  }>;
}

interface ModelsResponse {
  data?: Array<{
    id?: unknown;
    owned_by?: unknown;
  }>;
}

export class OpenAiCompatibleProvider implements AiQuestionProvider {
  constructor(private readonly getSettings: () => ToWriteAiSettings) {}

  async listModels(): Promise<AiModelInfo[]> {
    const settings = this.requireSettings({ requireModel: false });
    const response = await requestUrl({
      url: this.endpoint(settings.baseUrl, "models"),
      method: "GET",
      headers: this.headers(settings.apiKey),
      throw: false
    });
    this.assertSuccess(response.status, "model discovery");
    const payload = response.json as ModelsResponse;
    const seen = new Set<string>();
    const models: AiModelInfo[] = [];
    for (const item of Array.isArray(payload.data) ? payload.data : []) {
      const id = typeof item.id === "string" ? item.id.trim() : "";
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      models.push({
        id,
        ownedBy: typeof item.owned_by === "string" && item.owned_by.trim() ? item.owned_by.trim() : undefined
      });
    }
    if (models.length === 0) {
      throw new Error("The provider returned no selectable models. You can still enter a model id manually.");
    }
    return models.sort((left, right) => left.id.localeCompare(right.id));
  }

  async testConnection(): Promise<AiConnectionResult> {
    const settings = this.requireSettings({ requireModel: true });
    const startedAt = Date.now();
    const reply = await this.chat([
      { role: "user", content: "Reply with exactly: OK" }
    ], settings.model, { maxTokens: 256 });
    return {
      model: settings.model,
      reply: reply.slice(0, 160),
      latencyMs: Math.max(0, Date.now() - startedAt)
    };
  }

  async chat(
    messages: AiChatMessageInput[],
    model?: string,
    options: { maxTokens?: number } = {}
  ): Promise<string> {
    const result = await this.complete(messages, model, options);
    if (!result.content) {
      throw new Error("AI response was empty.");
    }
    return result.content;
  }

  async complete(
    messages: AiChatMessageInput[],
    model?: string,
    options: { maxTokens?: number; tools?: AiToolDefinition[] } = {}
  ): Promise<AiChatCompletionResult> {
    const settings = this.requireSettings({ requireModel: true });
    const payload: Record<string, unknown> = {
      model: model?.trim() || settings.model,
      messages
    };
    if (options.maxTokens) {
      payload.max_tokens = options.maxTokens;
    }
    if (options.tools?.length) {
      payload.tools = options.tools;
      payload.tool_choice = "auto";
    }
    const response = await requestUrl({
      url: this.endpoint(settings.baseUrl, "chat/completions"),
      method: "POST",
      headers: this.headers(settings.apiKey),
      body: JSON.stringify(payload),
      throw: false
    });
    this.assertSuccess(response.status, "chat completion");
    const message = (response.json as ChatCompletionResponse).choices?.[0]?.message;
    const content = message?.content?.trim() ?? "";
    const toolCalls = (Array.isArray(message?.tool_calls) ? message.tool_calls : [])
      .map((call, index) => normalizeToolCall(call, index))
      .filter((call): call is NonNullable<typeof call> => Boolean(call));
    if (!content && toolCalls.length === 0) {
      throw new Error("AI response was empty.");
    }
    return { content, toolCalls };
  }

  async summarize(input: AiContextInput): Promise<OpenQuestionAi> {
    const settings = this.requireSettings({ requireModel: true });
    const endpoint = this.endpoint(settings.baseUrl, "chat/completions");
    const response = await requestUrl({
      url: endpoint,
      method: "POST",
      headers: this.headers(settings.apiKey),
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: [
              "You help an Obsidian writing plugin explain unresolved ToThink/ToWrite items.",
              "Use only the provided note context and local note candidates.",
              "Do not claim you searched the web.",
              "Return compact JSON with keys: summary, nextAction, suggestedSearchQueries, relatedNotes, relatedConcepts, confidence.",
              "relatedNotes must be an array of {file,title,reason}. relatedConcepts must be short strings."
            ].join(" ")
          },
          {
            role: "user",
            content: JSON.stringify(buildPromptPayload(input), null, 2)
          }
        ],
        response_format: { type: "json_object" }
      }),
      throw: false
    });

    this.assertSuccess(response.status, "summary");

    const payload = response.json as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("AI response was empty.");
    }

    return normalizeAiOutput(content, input);
  }

  private requireSettings(options: { requireModel: boolean }): ToWriteAiSettings {
    const settings = this.getSettings();
    if (!settings.enabled) {
      throw new Error("AI is disabled. Enable it in ToWrite settings before making a direct request.");
    }
    if (!/^https?:\/\//iu.test(settings.baseUrl.trim())) {
      throw new Error("AI Base URL must start with http:// or https://.");
    }
    if (!settings.apiKey.trim()) {
      throw new Error("AI API Key is missing.");
    }
    if (options.requireModel && !settings.model.trim()) {
      throw new Error("AI model is missing.");
    }
    return settings;
  }

  private endpoint(baseUrl: string, path: string): string {
    return `${baseUrl.trim().replace(/\/+$/u, "")}/${path.replace(/^\/+/, "")}`;
  }

  private headers(apiKey: string): Record<string, string> {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey.trim()}`
    };
  }

  private assertSuccess(status: number, operation: string): void {
    if (status < 200 || status >= 300) {
      throw new Error(`AI ${operation} failed with HTTP ${status}.`);
    }
  }
}

function normalizeToolCall(
  call: ChatCompletionToolCall,
  index: number
) {
  const name = typeof call.function?.name === "string" ? call.function.name.trim() : "";
  if (!name) {
    return undefined;
  }
  const rawArguments = call.function?.arguments;
  let args: unknown = rawArguments;
  if (typeof rawArguments === "string") {
    try {
      args = JSON.parse(rawArguments) as unknown;
    } catch {
      args = { raw: rawArguments.slice(0, 8000) };
    }
  }
  return {
    id: typeof call.id === "string" && call.id.trim() ? call.id.trim() : `tool_${index + 1}`,
    name,
    arguments: args
  };
}

function buildPromptPayload(input: AiContextInput) {
  return {
    noteTitle: input.noteTitle,
    frontmatter: input.frontmatter ?? {},
    headingPath: input.headingPath,
    question: {
      id: input.question.id,
      lane: input.question.lane,
      status: input.question.status,
      kind: input.question.kind,
      title: input.question.title,
      text: input.question.question,
      tags: input.question.tags
    },
    anchorText: input.anchorText,
    beforeLines: input.beforeLines,
    afterLines: input.afterLines,
    localCandidates: input.localCandidates.map((candidate) => ({
      file: candidate.file,
      title: candidate.title,
      headings: candidate.headings,
      tags: candidate.tags,
      snippet: candidate.snippet,
      score: candidate.score
    }))
  };
}

function normalizeAiOutput(content: string, input: AiContextInput): OpenQuestionAi {
  const parsed = parseJson(content);
  if (!parsed || typeof parsed !== "object") {
    return {
      summary: content.slice(0, 800),
      relatedNotes: fallbackRelatedNotes(input),
      generatedAt: new Date().toISOString()
    };
  }

  const record = parsed as Record<string, unknown>;
  return {
    summary: asString(record.summary),
    nextAction: asString(record.nextAction),
    suggestedSearchQueries: asStringArray(record.suggestedSearchQueries).slice(0, 6),
    relatedNotes: normalizeRelatedNotes(record.relatedNotes, input),
    relatedConcepts: asStringArray(record.relatedConcepts).slice(0, 10),
    confidence: asNumber(record.confidence),
    generatedAt: new Date().toISOString()
  };
}

function normalizeRelatedNotes(value: unknown, input: AiContextInput): OpenQuestionAi["relatedNotes"] {
  if (!Array.isArray(value)) {
    return fallbackRelatedNotes(input);
  }

  const candidatesByFile = new Map(input.localCandidates.map((candidate) => [candidate.file, candidate]));
  const notes: NonNullable<OpenQuestionAi["relatedNotes"]> = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const file = asString(record.file);
    if (!file) {
      continue;
    }
    const candidate = candidatesByFile.get(file);
    const note: NonNullable<OpenQuestionAi["relatedNotes"]>[number] = {
      file,
      title: asString(record.title) ?? candidate?.title ?? file.replace(/\.md$/iu, "")
    };
    const reason = asString(record.reason);
    if (reason) {
      note.reason = reason;
    }
    if (candidate?.snippet) {
      note.snippet = candidate.snippet;
    }
    if (candidate?.score !== undefined) {
      note.score = candidate.score;
    }
    notes.push(note);
  }

  return notes.slice(0, 5);
}

function fallbackRelatedNotes(input: AiContextInput): NonNullable<OpenQuestionAi["relatedNotes"]> {
  return input.localCandidates.slice(0, 5).map((candidate) => ({
    file: candidate.file,
    title: candidate.title,
    snippet: candidate.snippet,
    score: candidate.score
  }));
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const match = /\{[\s\S]*\}/u.exec(content);
    if (!match) {
      return undefined;
    }
    try {
      return JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(asString).filter((item): item is string => Boolean(item));
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
