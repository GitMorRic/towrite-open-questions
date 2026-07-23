import { describe, expect, it } from "vitest";
import { DEFAULT_ARTICLE_TYPES, DEFAULT_DEVICE_PROFILES, DEFAULT_REMINDER_PRESETS, DEFAULT_SETTINGS, ensureInboxWorkflowStage, normalizeArticleTypesSettings, normalizeDeviceProfiles, normalizeExternalApiBindHost, normalizeExternalApiPublicBaseUrl, normalizeInboxSettings, normalizePushSettings, normalizeQuote0Settings, normalizeReminderPresets } from "./settings";

describe("settings normalization", () => {
  it("keeps private, no-ai, and no-cloud content outside default remote scope", () => {
    expect(DEFAULT_SETTINGS.deviceCapture.excludeTags).toEqual(expect.arrayContaining(["private", "no-ai", "no-cloud"]));
    expect(DEFAULT_SETTINGS.deviceCapture.excludeFrontmatter).toEqual(expect.arrayContaining(["private", "no_ai", "no_cloud"]));
  });

  it("defaults highlighted cards into an Agent-managed device library", () => {
    expect(DEFAULT_SETTINGS.hub).toMatchObject({
      selectionMode: "agent",
      autoSelect: true,
      autoAddSelections: true,
      manualSelectionVibration: true,
      rotationIntervalMinutes: 30,
      manualHoldMinutes: 30,
      scheduleOccurrenceIds: []
    });
    expect(DEFAULT_SETTINGS.echoCards).toEqual([]);
  });

  it("normalizes Inbox folders and preserves safe defaults for upgraded data", () => {
    expect(normalizeInboxSettings(undefined)).toEqual(DEFAULT_SETTINGS.inbox);
    expect(normalizeInboxSettings({
      enabled: true,
      folderPrefixes: [" /00-Raw_Materials/Quick_Notes/ ", "00-Raw_Materials\\Quick_Notes", "Inbox"],
      groupBy: "folder",
      maxItems: 99_999,
      autoApplyStageOnCreate: true,
      includeInDeviceCandidates: false
    })).toEqual({
      enabled: true,
      folderPrefixes: ["00-Raw_Materials/Quick_Notes", "Inbox"],
      autoApplyStageOnCreate: true,
      groupBy: "folder",
      maxItems: 2_000,
      includeInDeviceCandidates: false
    });
  });

  it("keeps Inbox as the shared core workflow stage for upgraded configurations", () => {
    const stages = ensureInboxWorkflowStage([{ ...DEFAULT_SETTINGS.workflowStages.stages.find((stage) => stage.id === "raw")! }]);
    expect(stages.map((stage) => stage.id)).toEqual(["inbox", "raw"]);
    expect(ensureInboxWorkflowStage(stages)).toBe(stages);
  });

  it("normalizes common External API bind host values", () => {
    expect(normalizeExternalApiBindHost("0.0.0.0")).toBe("0.0.0.0");
    expect(normalizeExternalApiBindHost("0.0.0.")).toBe("0.0.0.0");
    expect(normalizeExternalApiBindHost("localhost")).toBe("127.0.0.1");
    expect(normalizeExternalApiBindHost(" 192.168.1.20 ")).toBe("192.168.1.20");
    expect(normalizeExternalApiBindHost("not a host!")).toBe("127.0.0.1");
  });

  it("normalizes External API public base URLs", () => {
    expect(normalizeExternalApiPublicBaseUrl("http://100.64.1.2:48321/")).toBe("http://100.64.1.2:48321");
    expect(normalizeExternalApiPublicBaseUrl("https://towrite.example.com/device?token=secret")).toBe("https://towrite.example.com");
    expect(normalizeExternalApiPublicBaseUrl("100.64.1.2:48321")).toBe("");
    expect(normalizeExternalApiPublicBaseUrl("ftp://example.com")).toBe("");
  });

  it("normalizes reminder quick presets", () => {
    expect(normalizeReminderPresets([])).toEqual(DEFAULT_REMINDER_PRESETS);
    expect(normalizeReminderPresets([
      { label: " Soon ", value: " 15m " },
      { label: "Soon", value: "15m" },
      { label: "", value: "1h" },
      { label: "Later", value: "" }
    ])).toEqual([{ label: "Soon", value: "15m" }]);
  });

  it("normalizes device profiles", () => {
    expect(normalizeDeviceProfiles([])).toEqual(DEFAULT_DEVICE_PROFILES);
    expect(normalizeDeviceProfiles([
      {
        id: "My 2.7 Screen!",
        name: "",
        profile: "unknown" as never,
        width: 10,
        height: 9999,
        inches: 0,
        defaultPage: "bad" as never,
        defaultLane: "all" as never,
        refreshSeconds: 1
      },
      {
        id: "my-27-screen",
        name: "Duplicate",
        profile: "desktop-card",
        width: 800,
        height: 480,
        inches: 7,
        defaultPage: "cards",
        defaultLane: "write",
        refreshSeconds: 60
      }
    ])).toEqual([
      {
        id: "my-27-screen",
        name: "my-27-screen",
        profile: "eink-bw",
        width: 80,
        height: 2400,
        inches: 1,
        defaultPage: "home",
        defaultLane: "",
        refreshSeconds: 15
      }
    ]);
  });

  it("normalizes article type settings", () => {
    expect(normalizeArticleTypesSettings({ types: [] }).types).toEqual(DEFAULT_ARTICLE_TYPES);
    expect(normalizeArticleTypesSettings({
      enabled: true,
      parseHierarchicalTags: true,
      types: [
        {
          id: "Mind Flow!",
          title: "",
          color: "bad" as never,
          folderPrefixes: [" /ByteDance/MindFlow/ ", "ByteDance\\MindFlow"],
          tags: [" #MindFlow ", "mindflow"]
        },
        {
          id: "mind-flow",
          title: "Duplicate",
          color: "sky",
          folderPrefixes: [],
          tags: []
        }
      ]
    })).toMatchObject({
      enabled: true,
      parseHierarchicalTags: true,
      types: [{
        id: "mind-flow",
        title: "mind-flow",
        color: "slate",
        folderPrefixes: ["ByteDance/MindFlow"],
        tags: ["mindflow"]
      }]
    });
  });

  it("normalizes Quote0 settings", () => {
    expect(normalizeQuote0Settings({
      enabled: true,
      apiBaseUrl: "https://dot.mindreset.tech/docs?x=1",
      apiKey: " dot_app_test ",
      deviceId: " ABCD1234 ",
      taskKey: " text_task_1 ",
      taskAlias: "",
      dashboardApi: "canvas",
      imageTaskKey: " image_task_1 ",
      imageTaskAlias: "",
      imageDitherType: "DIFFUSION",
      imageBorder: 1,
      canvasTaskAlias: "",
      canvasBorder: 1,
      forceRefreshAfterSend: false,
      refreshSeconds: 1,
      lane: "write",
      nfcToken: " q0_test ",
      cursor: -1,
      lastSyncedQuestionId: " oq_1 ",
      lastSyncedAt: " 2026-07-01T00:00:00.000Z ",
      lastError: " no problem "
    })).toMatchObject({
      enabled: true,
      apiBaseUrl: "https://dot.mindreset.tech",
      apiKey: "dot_app_test",
      deviceId: "ABCD1234",
      taskKey: "text_task_1",
      taskAlias: "ToWrite Open Questions",
      dashboardApi: "canvas",
      imageTaskKey: "image_task_1",
      imageTaskAlias: "ToWrite Dashboard",
      imageDitherType: "DIFFUSION",
      imageBorder: 1,
      canvasTaskAlias: "ToWrite Dashboard",
      canvasBorder: 1,
      forceRefreshAfterSend: false,
      refreshSeconds: 60,
      lane: "write",
      nfcToken: "q0_test",
      cursor: 0,
      lastSyncedQuestionId: "oq_1",
      lastSyncedAt: "2026-07-01T00:00:00.000Z",
      lastError: "no problem"
    });

    expect(normalizeQuote0Settings({}).forceRefreshAfterSend).toBe(true);
  });

  it("normalizes push settings and migrates Quote0 into a target", () => {
    const quote0 = normalizeQuote0Settings({
      enabled: true,
      nfcToken: "q0_token",
      lane: "write",
      refreshSeconds: 60
    });
    const push = normalizePushSettings({
      privacy: {
        level: "precise-location",
        allowPreciseLocation: true,
        shareWithAi: true
      },
      targets: [{
        id: "Desk Phone!",
        name: "",
        type: "mobile-app",
        enabled: true,
        profile: "desktop-card",
        width: 430,
        height: 932,
        inches: 6.7,
        defaultPage: "cards",
        defaultLane: "think",
        refreshSeconds: 5,
        quietHoursStart: "23:00",
        quietHoursEnd: "07:00",
        token: " phone-token ",
        capabilities: ["pull", "sse", "pull"]
      }],
      habits: [{
        id: " Evening Write ",
        label: " Evening Write ",
        enabled: true,
        timeStart: "18:00",
        timeEnd: "25:99",
        placeLabel: " desk ",
        mode: " writing ",
        stageIds: ["processing", "processing"],
        lanes: ["write"],
        statuses: ["blocked"],
        targetIds: ["Desk Phone!"],
        boost: 999,
        limitPerDay: -1
      }]
    }, quote0);

    expect(push.enabled).toBe(true);
    expect(push.privacy).toEqual({
      level: "precise-location",
      allowPreciseLocation: true,
      shareWithAi: true
    });
    expect(push.targets.find((target) => target.id === "desk-phone")).toMatchObject({
      type: "mobile-app",
      refreshSeconds: 15,
      capabilities: ["pull", "sse"]
    });
    expect(push.targets.find((target) => target.id === "quote0")).toMatchObject({
      type: "quote0",
      enabled: true,
      defaultLane: "write",
      refreshSeconds: 60,
      token: "q0_token"
    });
    expect(push.habits[0]).toMatchObject({
      id: "evening-write",
      timeEnd: "",
      placeLabel: "desk",
      mode: "writing",
      stageIds: ["processing"],
      boost: 100,
      limitPerDay: 0
    });
  });
});
