import { describe, expect, it } from "vitest";
import type { DeviceFeedPayload } from "../external/device-feed";
import { buildQuote0InputUrl, formatQuote0DeviceFeed } from "./formatter";

describe("Quote0 formatter", () => {
  it("formats a card into Text API payload with an NFC answer link", () => {
    const result = formatQuote0DeviceFeed(makeFeed(), {
      nfcBaseUrl: "http://192.168.1.20:48321/",
      nfcToken: "q0_test",
      taskKey: "text_task_1",
      taskAlias: "ToWrite",
      index: 0,
      total: 2,
      sourceContexts: {
        "eink.md": {
          sourceTitle: "Eink refresh",
          workflowStageId: "raw",
          workflowStageTitle: "Raw",
          workflowNextAction: "Compare three refresh modes",
          tags: ["raw", "eink"]
        }
      }
    });

    expect(result.questionId).toBe("oq_one");
    expect(result.nfcLink).toBe("http://192.168.1.20:48321/device/input?token=q0_test&questionId=oq_one");
    expect(result.payload).toMatchObject({
      refreshNow: true,
      title: "Check refresh behavior",
      link: "http://192.168.1.20:48321/device/input?token=q0_test&questionId=oq_one",
      taskKey: "text_task_1"
    });
    expect(result.payload.taskAlias).toBeUndefined();
    expect(result.payload.message).toContain("Does partial refresh ghost?");
    expect(result.payload.message).toContain("Memo: Compare three modes.");
    expect(result.payload.signature).toContain("1 / 2");
    expect(result.payload.signature).toContain("Raw");
  });

  it("turns wiki-link notes into compact memory cues instead of paths", () => {
    const feed = makeFeed();
    const card = feed.screens[0].items[0];
    if (card.type === "card") {
      card.note = "[[00-Raw_Materials/Quick_Notes/index]]";
    }

    const result = formatQuote0DeviceFeed(feed, {
      nfcBaseUrl: "http://192.168.1.20:48321/",
      nfcToken: "q0_test",
      index: 2,
      total: 12
    });

    expect(result.payload.message).toContain("Memo: Quick Notes");
    expect(result.payload.message).not.toContain("00-Raw");
    expect(result.payload.signature).not.toContain("00-Raw");
    expect(result.payload.signature).not.toContain("Quick_Notes");
  });

  it("builds empty-state content when no card is available", () => {
    const feed = makeFeed();
    feed.screens[0].items = [{ type: "empty", text: "Done" }];

    const result = formatQuote0DeviceFeed(feed, {
      nfcBaseUrl: "http://192.168.1.20:48321",
      nfcToken: "q0_test"
    });

    expect(result.questionId).toBe("");
    expect(result.payload.title).toBe("ToWrite");
    expect(result.payload.link).toBe("http://192.168.1.20:48321/device/input?token=q0_test");
  });

  it("does not produce NFC links without a public base URL or token", () => {
    expect(buildQuote0InputUrl("", "q0_test", "oq_one")).toBeUndefined();
    expect(buildQuote0InputUrl("http://192.168.1.20:48321", "", "oq_one")).toBeUndefined();
  });

  it("keeps taskAlias for first Text API content when taskKey is omitted", () => {
    const result = formatQuote0DeviceFeed(makeFeed(), {
      taskAlias: "ToWrite"
    });

    expect(result.payload.taskKey).toBeUndefined();
    expect(result.payload.taskAlias).toBe("ToWrite");
  });
});

function makeFeed(): DeviceFeedPayload {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-01T00:00:00.000Z",
    vaultName: "Vault",
    profile: "eink-bw",
    device: {
      width: 264,
      height: 176,
      inches: 2.7,
      orientation: "landscape",
      aspectRatio: 1.5,
      ppi: 117.5,
      layout: "landscape-compact",
      page: "cards",
      limit: 1
    },
    summary: {
      think: 1,
      write: 0,
      unresolved: 1,
      candidate: 0,
      blockedArticles: 0,
      workflowFiles: 0,
      workflowStages: 0,
      remindersDue: 0,
      remindersUpcoming: 0
    },
    workflow: {
      enabled: false,
      uniqueFiles: 0,
      stages: []
    },
    screens: [
      {
        id: "cards-0",
        type: "cards",
        title: "Cards",
        subtitle: "1 / 2",
        companionUrl: "http://192.168.1.20:48321/device/input?token=q0_test&questionId=oq_one",
        qrText: "http://192.168.1.20:48321/device/input?token=q0_test&questionId=oq_one",
        actions: [],
        items: [
          {
            type: "card",
            id: "oq_one",
            title: "Check refresh behavior",
            body: "Does partial refresh ghost?",
            note: "Compare three modes.",
            source: "eink.md:9",
            sourceFile: "eink.md",
            sourceLine: 9,
            lane: "think",
            status: "open",
            kind: "research",
            tags: ["eink"],
            openUri: "obsidian://open?vault=Vault&file=eink.md",
            answerUrl: "http://192.168.1.20:48321/device/input?token=q0_test&questionId=oq_one"
          }
        ]
      }
    ],
    navigation: {
      page: "cards",
      cursor: "0",
      limit: 1,
      total: 2,
      hasPrev: false,
      hasNext: true,
      nextCursor: "1"
    },
    actions: []
  };
}
