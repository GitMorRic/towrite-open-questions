import { describe, expect, it } from "vitest";
import { quote0TextApiAdapter } from "./adapters";
import { formatPushFeed } from "./formatter";
import type { PushCandidate, PushDecision, PushTargetSettings } from "./types";

describe("push adapters", () => {
  it("formats quote0 text without leaking full source paths", () => {
    const feed = makeFeed(questionCandidate);
    const result = quote0TextApiAdapter(feed, "EVj", "ToWrite");

    expect(result.payload).toMatchObject({
      taskKey: "EVj",
      refreshNow: true
    });
    expect(result.payload.taskAlias).toBeUndefined();
    expect(result.payload.icon).toBeUndefined();
    expect(result.payload.title).toContain("What is the next turn");
    expect(result.payload.message).toContain("Next: Draft the second");
    expect(result.payload.message).not.toContain("MindFlow/02-Processing");
    expect(result.payload.signature).toContain("Processing");
  });

  it("compresses home summary metrics for quote0", () => {
    const result = quote0TextApiAdapter(makeFeed({
      id: "home:2026-07-07",
      type: "home-summary",
      title: "ToWrite Overview",
      body: "7 open · 3 articles · 2 reminders due",
      tags: [],
      metrics: [
        { label: "Open", value: 7 },
        { label: "? ToThink", value: 4 },
        { label: "✎ ToWrite", value: 3 },
        { label: "Articles", value: 3 },
        { label: "Due", value: 2 },
        { label: "Stale", value: 1 },
        { label: "Workflow", value: 12 },
        { label: "Stages", value: 4 }
      ],
      badges: ["7 open", "3 candidate"],
      footer: "12 files · 4 stages"
    }));

    expect(result.payload.icon).toBeUndefined();
    expect(result.payload.title).toBe("ToWrite Overview");
    expect(result.payload.message).toContain("OPEN 7");
    expect(result.payload.message).toContain("THINK 4");
    expect(result.payload.message).toContain("WRITE 3");
    expect(result.payload.message).toContain("ARTICLES 3");
    expect(result.payload.message).toContain("WORKFLOW 12");
    expect(result.payload.message).toContain("STAGES 4");
    expect(result.payload.message).not.toContain("▦");
    expect(result.payload.signature).toBe("12 files · 4 stages");
    expect(result.payload.styles?.title?.fontSize).toBe(24);
    expect(result.payload.styles?.message?.fontSize).toBe(15);
  });

  it("shows article state without full paths", () => {
    const result = quote0TextApiAdapter(makeFeed({
      id: "article:MindFlow/02-Processing/deep-note.md",
      type: "article",
      title: "Deep note",
      body: "What should this article prove?",
      tags: [],
      sourceFile: "MindFlow/02-Processing/deep-note.md",
      workflowStageTitle: "Processing",
      statusLabel: "stale",
      stale: true,
      ageDays: 9,
      oldestOpenAgeDays: 12,
      articleOpen: 2,
      articleCandidate: 1,
      articleResolved: 4
    }));

    expect(result.payload.icon).toBeUndefined();
    expect(result.payload.message).toContain("Oldest open: 12d");
    expect(result.payload.message).toContain("Updated: 9d ago");
    expect(result.payload.message).not.toContain("MindFlow/02-Processing");
    expect(result.payload.signature).toContain("Processing");
  });

  it("shows workflow state and next action compactly", () => {
    const result = quote0TextApiAdapter(makeFeed({
      id: "workflow:MindFlow/02-Processing/deep-note.md",
      type: "workflow-file",
      title: "Deep note",
      body: "Needs a first pass before drafting.",
      tags: ["processing"],
      workflowStageTitle: "Processing",
      stale: true,
      ageDays: 9,
      articleOpen: 3,
      articleThink: 1,
      articleWrite: 2,
      nextAction: "Draft the first outline",
      openUri: "obsidian://open?vault=Vault&file=MindFlow%2F02-Processing%2Fdeep-note.md"
    }));

    expect(result.payload.icon).toBeUndefined();
    expect(result.payload.message).toContain("Next: Draft the first outline");
    expect(result.payload.message).toContain("open 3");
    expect(result.payload.signature).toContain("9d stale");
  });

  it("only sends Text API icon values that are valid image inputs", () => {
    const feed = makeFeed(questionCandidate);
    feed.display.icon = "https://example.com/icon.png";

    const result = quote0TextApiAdapter(feed);

    expect(result.payload.icon).toBe("https://example.com/icon.png");
  });

  it("sends taskAlias only when taskKey is omitted", () => {
    const result = quote0TextApiAdapter(makeFeed(questionCandidate), "", "ToWrite");

    expect(result.payload.taskKey).toBeUndefined();
    expect(result.payload.taskAlias).toBe("ToWrite");
  });
});

const target: PushTargetSettings = {
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

const questionCandidate: PushCandidate = {
  id: "oq_one",
  type: "question",
  title: "What is the next turn?",
  body: "Explain why this fragment is worth writing now.",
  note: "[[MindFlow/02-Processing/deep-note|deep note]]",
  nextAction: "Draft the second paragraph",
  sourceFile: "MindFlow/02-Processing/deep-note.md",
  workflowStageTitle: "Processing",
  lane: "write",
  status: "open",
  tags: [],
  answerUrl: "http://127.0.0.1:48321/device/input?token=q0&questionId=oq_one"
};

function makeFeed(candidate: PushCandidate) {
  const decision: PushDecision = {
    target,
    candidate,
    score: 88,
    reason: "habit evening, has next action",
    quiet: false,
    generatedAt: "2026-07-07T12:00:00.000Z"
  };

  return formatPushFeed(decision, {
    privacy: {
      level: "local-coarse",
      allowPreciseLocation: false,
      shareWithAi: false
    },
    context: {
      timeBucket: "evening",
      placeLabel: "desk",
      mode: "writing",
      activeFile: "MindFlow/02-Processing/deep-note.md"
    }
  });
}
