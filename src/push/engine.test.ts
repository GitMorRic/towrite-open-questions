import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type ToWriteSettings } from "../core/settings";
import type { ArticleSummary, OpenQuestion } from "../core/types";
import type { WorkflowIndexPayload } from "../workflow";
import { PushEngine } from "./engine";
import { normalizePushRuntimeState } from "./state";
import type { PushRuntimeState, PushTargetSettings } from "./types";

describe("PushEngine display rotation", () => {
  it("inserts a home summary after five quote0 card deliveries", () => {
    const state = normalizePushRuntimeState({ displayCursors: { quote0: 5 } });
    const engine = makeEngine(state, [question]);
    const feed = engine.getFeed("quote0");

    expect(feed.decision.candidateType).toBe("home-summary");
    expect(feed.display).toMatchObject({
      variant: "home-summary",
      icon: "▦"
    });
    expect(feed.display.metrics).toEqual(expect.arrayContaining([
      { label: "? ToThink", value: 1 },
      { label: "Articles", value: 1 }
    ]));
  });

  it("lets a due reminder interrupt home summary rotation", () => {
    const state = normalizePushRuntimeState({ displayCursors: { quote0: 5 } });
    const engine = makeEngine(state, [{ ...question, reminderAt: "2000-01-01T00:00:00.000Z" }]);
    const feed = engine.getFeed("quote0");

    expect(feed.decision.candidateType).toBe("question");
    expect(feed.decision.candidateId).toBe("oq_one");
    expect(feed.display.variant).toBe("question");
  });
});

function makeEngine(state: PushRuntimeState, questions: OpenQuestion[]): PushEngine {
  return new PushEngine({
    getSettings: () => makeSettings(),
    getVaultName: () => "Vault",
    getQuestions: () => questions,
    getArticleSummaries: () => articles,
    getWorkflowPayload: () => workflow,
    getActiveFile: () => null,
    getState: () => state,
    saveState: async () => undefined
  });
}

function makeSettings(): ToWriteSettings {
  return {
    ...DEFAULT_SETTINGS,
    externalApi: {
      ...DEFAULT_SETTINGS.externalApi,
      publicBaseUrl: "http://127.0.0.1:48321",
      token: "external"
    },
    quote0: {
      ...DEFAULT_SETTINGS.quote0,
      nfcToken: "q0-token",
      taskAlias: "ToWrite"
    },
    push: {
      ...DEFAULT_SETTINGS.push,
      privacy: {
        ...DEFAULT_SETTINGS.push.privacy
      },
      habits: [],
      targets: [quote0Target]
    }
  };
}

const quote0Target: PushTargetSettings = {
  id: "quote0",
  name: "quote0",
  type: "quote0",
  enabled: true,
  profile: "eink-bw",
  width: 264,
  height: 176,
  inches: 2.7,
  defaultPage: "cards",
  defaultLane: "",
  refreshSeconds: 300,
  quietHoursStart: "",
  quietHoursEnd: "",
  token: "",
  capabilities: ["push"]
};

const question: OpenQuestion = {
  id: "oq_one",
  title: "What should change?",
  lane: "think",
  status: "open",
  kind: "research",
  tags: ["display"],
  color: "amber",
  question: "What should change on the small screen?",
  note: "Use hierarchy, not paths.",
  source: {
    file: "MindFlow/02-Processing/deep-note.md",
    headingPath: ["Display"],
    lineStart: 4,
    lineEnd: 4,
    rule: "selection"
  },
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z"
};

const articles: ArticleSummary[] = [{
  filePath: "MindFlow/02-Processing/deep-note.md",
  title: "Deep note",
  open: 1,
  candidate: 0,
  resolved: 0,
  ignored: 0,
  think: 1,
  write: 0,
  needsWork: true,
  oldestOpenAgeDays: 6,
  topIssues: [question]
}];

const workflow: WorkflowIndexPayload = {
  schemaVersion: 1,
  generatedAt: "2026-07-07T00:00:00.000Z",
  vaultName: "Vault",
  enabled: true,
  counts: { stages: 1, uniqueFiles: 1 },
  stages: [
    {
      id: "processing",
      title: "Processing",
      description: "Active writing",
      color: "sky",
      limit: 20,
      staleAfterDays: 7,
      count: 1,
      staleCount: 1,
      files: [
        {
          filePath: "MindFlow/02-Processing/deep-note.md",
          title: "Deep note",
          description: "Needs display hierarchy",
          tags: ["processing"],
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-04T00:00:00.000Z",
          ageDays: 3,
          stale: true,
          openQuestionCount: 1,
          thinkCount: 1,
          writeCount: 0,
          nextAction: "Sketch the display model",
          openUri: "obsidian://open?vault=Vault&file=MindFlow%2F02-Processing%2Fdeep-note.md"
        }
      ]
    }
  ]
};
