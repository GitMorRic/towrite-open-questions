import { describe, expect, it } from "vitest";
import type { ToWritePushSettings, PushCandidate, PushDeliveryEvent, PushTargetSettings } from "./types";
import { PushPolicyEngine, isTargetQuiet } from "./policy";

describe("PushPolicyEngine", () => {
  it("prioritizes due reminders and habit matches", () => {
    const decision = new PushPolicyEngine().select({
      candidates,
      push,
      target,
      context: {
        id: "ctx",
        source: "manual",
        placeLabel: "desk",
        mode: "writing",
        capturedAt: "2026-07-07T12:00:00.000Z"
      },
      events: [],
      now: new Date("2026-07-07T20:00:00")
    });

    expect(decision.candidate?.id).toBe("oq_due");
    expect(decision.reason).toContain("reminder due");
    expect(decision.reason).toContain("habit evening");
  });

  it("suppresses quiet-hours pushes unless the selected item is due", () => {
    const quietTarget = { ...target, quietHoursStart: "22:00", quietHoursEnd: "07:00" };
    expect(isTargetQuiet(quietTarget, new Date("2026-07-07T23:30:00"))).toBe(true);

    const notDue = new PushPolicyEngine().select({
      candidates: [candidates[1]],
      push,
      target: quietTarget,
      events: [],
      now: new Date("2026-07-07T23:30:00")
    });
    expect(notDue.suppressedReason).toBe("quiet-hours");

    const due = new PushPolicyEngine().select({
      candidates: [candidates[0]],
      push,
      target: quietTarget,
      events: [],
      now: new Date("2026-07-07T23:30:00")
    });
    expect(due.candidate?.id).toBe("oq_due");
    expect(due.suppressedReason).toBeUndefined();
  });

  it("does not resend a candidate inside cooldown", () => {
    const events: PushDeliveryEvent[] = [{
      id: "sent",
      targetId: "quote0",
      candidateId: "oq_due",
      candidateType: "question",
      decisionReason: "reminder due",
      score: 100,
      sentAt: "2026-07-07T19:50:00.000Z"
    }];

    const decision = new PushPolicyEngine().select({
      candidates,
      push,
      target,
      events,
      now: new Date("2026-07-07T20:00:00")
    });

    expect(decision.candidate?.id).toBe("oq_other");
    expect(decision.reason).not.toContain("recently sent");
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

const push: ToWritePushSettings = {
  enabled: true,
  privacy: {
    level: "local-coarse",
    allowPreciseLocation: false,
    shareWithAi: false
  },
  targets: [target],
  habits: [{
    id: "evening",
    label: "evening",
    enabled: true,
    timeStart: "18:00",
    timeEnd: "23:00",
    placeLabel: "desk",
    mode: "writing",
    stageIds: ["processing"],
    lanes: ["write"],
    statuses: [],
    targetIds: ["quote0"],
    boost: 30,
    limitPerDay: 0
  }],
  habitText: "",
  aiRerank: false
};

const candidates: PushCandidate[] = [
  {
    id: "oq_due",
    type: "question",
    title: "Due",
    body: "Due card",
    workflowStageId: "processing",
    workflowStageTitle: "Processing",
    lane: "write",
    status: "open",
    tags: [],
    reminderDue: true,
    updatedAt: "2026-07-07T19:00:00.000Z"
  },
  {
    id: "oq_other",
    type: "question",
    title: "Other",
    body: "Other card",
    lane: "write",
    status: "open",
    tags: [],
    updatedAt: "2026-07-07T19:30:00.000Z"
  }
];
