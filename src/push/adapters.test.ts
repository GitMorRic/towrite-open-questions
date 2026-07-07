import { describe, expect, it } from "vitest";
import { quote0TextApiAdapter } from "./adapters";
import { formatPushFeed } from "./formatter";
import type { PushDecision, PushTargetSettings } from "./types";

describe("push adapters", () => {
  it("formats quote0 text without leaking full source paths", () => {
    const feed = formatPushFeed(decision, {
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
    const result = quote0TextApiAdapter(feed, "EVj", "ToWrite");

    expect(result.payload).toMatchObject({
      taskKey: "EVj",
      taskAlias: "ToWrite",
      refreshNow: true
    });
    expect(result.payload.title).toBe("What is the next turn?");
    expect(result.payload.message).toContain("Next: Draft the second");
    expect(result.payload.message).not.toContain("MindFlow/02-Processing");
    expect(result.payload.signature).toContain("Processing");
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

const decision: PushDecision = {
  target,
  candidate: {
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
  },
  score: 88,
  reason: "habit evening, has next action",
  quiet: false,
  generatedAt: "2026-07-07T12:00:00.000Z"
};

