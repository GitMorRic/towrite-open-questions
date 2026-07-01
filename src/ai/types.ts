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

export interface AiRefreshResult {
  ai: OpenQuestionAi;
  mode: "manual" | "auto";
}
