import { requestUrl } from "obsidian";
import type { ToWriteAiSettings } from "../core/settings";
import type { OpenQuestionAi } from "../core/types";
import type { AiContextInput, AiQuestionProvider } from "./types";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class OpenAiCompatibleProvider implements AiQuestionProvider {
  constructor(private readonly getSettings: () => ToWriteAiSettings) {}

  async summarize(input: AiContextInput): Promise<OpenQuestionAi> {
    const settings = this.getSettings();
    const endpoint = `${settings.baseUrl.replace(/\/+$/u, "")}/chat/completions`;
    const response = await requestUrl({
      url: endpoint,
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${settings.apiKey}`
      },
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
      })
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`AI request failed with HTTP ${response.status}`);
    }

    const payload = response.json as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("AI response was empty.");
    }

    return normalizeAiOutput(content, input);
  }
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
