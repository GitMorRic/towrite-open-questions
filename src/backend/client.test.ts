import { afterEach, describe, expect, it, vi } from "vitest";
import { applyBackendRerank, BackendEnhancementClient, buildRecommendationPayload } from "./client";
import type { CaptureDraft, CaptureTargetCandidate } from "../capture/types";
import type { HubCandidate } from "../hub/types";

const draft: CaptureDraft = {
  schemaVersion: 1,
  id: "capture-1",
  intent: "selection",
  body: "A local-only draft",
  title: "Draft",
  tags: ["writing"],
  links: [],
  source: { file: "Projects/Secret.md", selection: "must not leave the plugin" }
};

const candidates: CaptureTargetCandidate[] = [
  { schemaVersion: 1, id: "note", kind: "existingNote", action: "append", path: "Private/Secret.md", reason: "local", confidence: "medium", score: 4, targetRevision: "a" },
  { schemaVersion: 1, id: "inbox", kind: "inbox", action: "append", path: "Inbox.md", reason: "fallback", confidence: "weak", score: 0, targetRevision: "b" }
];

describe("Backend enhancement contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("omits draft content and exact source paths from the backend payload", () => {
    const payload = buildRecommendationPayload(draft, candidates);
    expect(payload.draft.source).toEqual({
      hasFile: true,
      headingDepth: 0,
      hasQuestion: false,
      entryPoint: undefined
    });
    expect(JSON.stringify(payload)).not.toContain("must not leave");
    expect(JSON.stringify(payload)).not.toContain("A local-only draft");
    expect(JSON.stringify(payload)).not.toContain("Projects/Secret.md");
    expect(JSON.stringify(payload)).not.toContain("Private/Secret.md");
  });

  it("can only rerank known local candidate ids", () => {
    const result = applyBackendRerank(candidates, {
      candidates: [
        { id: "evil", reason: "Outside catalog", score: 999 },
        { id: "inbox", reason: "Backend prefers the safe fallback", confidence: "strong", score: 10 }
      ]
    });
    expect(result.map((item) => item.id)).toEqual(["inbox", "note"]);
    expect(result[0].reason).toBe("Backend prefers the safe fallback");
    expect(result.some((item) => item.id === "evil")).toBe(false);
  });

  it("falls back to the local order for an incompatible protocol", async () => {
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        protocolVersion: "2",
        candidates: [{ id: "inbox", score: 999 }]
      })
    })));
    const client = new BackendEnhancementClient(() => ({
      enabled: true,
      baseUrl: "http://127.0.0.1:8790",
      token: "secret",
      useForRecommendations: true,
      useForHabitSuggestions: false,
      timeoutMs: 2500
    }), globalThis.fetch);

    await expect(client.rerankTargets(draft, candidates)).resolves.toEqual(candidates);
  });

  it("reranks only the privacy-approved Hub whitelist without sending body or write target", async () => {
    vi.stubGlobal("window", globalThis);
    const hubCandidates: HubCandidate[] = [
      {
        candidateRef: "src_note_alpha",
        type: "note_continue",
        display: { title: "Continue", body: "private display snapshot" },
        writeTargetRef: "target_private_opaque",
        allowedActions: ["respond"],
        sensitivity: "normal",
        reasonCode: "recent work",
        score: 5
      },
      {
        candidateRef: "src_quote_beta",
        type: "quote",
        display: { title: "A line" },
        allowedActions: ["open"],
        sensitivity: "normal",
        reasonCode: "place match",
        score: 4
      }
    ];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(JSON.stringify(body)).not.toContain("private display snapshot");
      expect(JSON.stringify(body)).not.toContain("target_private_opaque");
      expect(body.accepted_habits).toEqual([{ status: "accepted", candidate_id: "src_quote_beta" }]);
      return {
        ok: true,
        json: async () => ({
          ranked: [
            { candidate_id: "invented_outside_whitelist", score: 999 },
            { candidate_id: "src_quote_beta", reason: "AI whitelist explanation", score: 12 }
          ]
        })
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new BackendEnhancementClient(() => backendSettings(), globalThis.fetch);

    const result = await client.rerankDeviceHubCandidates(hubCandidates, { state: "desk_idle" }, [
      { status: "pending", candidate_id: "src_note_alpha" },
      { status: "accepted", candidate_id: "src_quote_beta" }
    ]);

    expect(result.map((candidate) => candidate.candidateRef)).toEqual(["src_quote_beta", "src_note_alpha"]);
    expect(result.some((candidate) => candidate.candidateRef === "invented_outside_whitelist")).toBe(false);
    expect(result[0]?.reasonCode).toBe("AI whitelist explanation");
  });

  it("loads chat models and Skills from the existing Backend catalog", async () => {
    vi.stubGlobal("window", globalThis);
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith("/models")
        ? {
            models: {
              local_chat: { label: "Local Chat", model_type: "chat", provider: "openai-compatible" },
              local_embedding: { label: "Embedding", model_type: "embedding" },
              missing_key: { label: "Missing key", model_type: "chat", configured: false }
            }
          }
        : {
            skills: [{
              name: "Writing partner",
              role: "dialogue",
              skill_path: "Skills/writing/SKILL.md",
              agent_id: "writer",
              command: "/skill:writer",
              api: "/agents/dialogue/chat-on-context"
            }]
          }
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new BackendEnhancementClient(() => backendSettings(), globalThis.fetch);

    await expect(client.listModels()).resolves.toEqual([
      { id: "local_chat", label: "Local Chat", provider: "openai-compatible" }
    ]);
    await expect(client.listSkills()).resolves.toEqual([
      {
        name: "Writing partner",
        role: "dialogue",
        skillPath: "Skills/writing/SKILL.md",
        agentId: "writer",
        command: "/skill:writer",
        api: "/agents/dialogue/chat-on-context"
      }
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8790/models",
      expect.objectContaining({ headers: expect.objectContaining({ "X-Capture-Token": "secret" }) })
    );
  });

  it("sends bounded context and local history to Backend chat", async () => {
    vi.stubGlobal("window", globalThis);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ reply: "Backend reply" })
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new BackendEnhancementClient(() => backendSettings(), globalThis.fetch);

    await expect(client.chatOnContext({
      message: "Help me continue",
      modelId: "local_chat",
      notePaths: ["Projects/Active.md"],
      contextSnippets: [{ kind: "selection", title: "Selection", text: "Selected text" }],
      chatHistory: [{ role: "user", content: "Earlier question" }]
    })).resolves.toBe("Backend reply");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model_id: "local_chat",
      note_paths: ["Projects/Active.md"],
      chat_history: [{ role: "user", content: "Earlier question" }]
    });
  });

  it("normalizes the existing Backend agent roster schema", async () => {
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        count: 1,
        agents: [{
          agent_id: "creative_dialogue_partner",
          name: "Writing partner",
          type: "agent",
          status: "active",
          role: "Writing dialogue",
          path: "99-System/01-Agents/Writing/Agent.md",
          category: "Writing",
          default_model_id: "local_chat",
          external_model_policy: "ask_user_before_calling",
          subscribes: ["writing"],
          avatar: "W",
          participation: { auto_reply: false },
          permissions: { vault_read: true },
          tools: ["vault.search"],
          memory_paths: { long_term: "Memory/long-term.md" },
          body_preview: "Help the user write."
        }]
      })
    })));
    const client = new BackendEnhancementClient(() => backendSettings(), globalThis.fetch);

    await expect(client.listAgents()).resolves.toEqual([{
      agentId: "creative_dialogue_partner",
      name: "Writing partner",
      type: "agent",
      status: "active",
      role: "Writing dialogue",
      path: "99-System/01-Agents/Writing/Agent.md",
      category: "Writing",
      defaultModelId: "local_chat",
      externalModelPolicy: "ask_user_before_calling",
      subscribes: ["writing"],
      avatar: "W",
      participation: { auto_reply: false },
      permissions: { vault_read: true },
      tools: ["vault.search"],
      memoryPaths: { long_term: "Memory/long-term.md" },
      bodyPreview: "Help the user write."
    }]);
  });

  it("preserves the Backend mobile-command reply, suggestion, and tool-call contract", async () => {
    vi.stubGlobal("window", globalThis);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { message: string };
      return {
        ok: true,
        json: async () => body.message === "create"
          ? {
              agent_id: "cyber_dorm_warden",
              kind: "tool_call",
              tool: "daily.create_task",
              reply: "Created task",
              tool_result: { path: "Daily/2026-07-13.md" }
            }
          : {
              agent_id: "cyber_dorm_warden",
              kind: "suggestion",
              reply: "Task needs approval",
              suggested_tool: { name: "daily.create_task", text: "Draft task" }
            }
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new BackendEnhancementClient(() => backendSettings(), globalThis.fetch);

    await expect(client.runAgentCommand({ message: "suggest" })).resolves.toMatchObject({
      kind: "suggestion",
      requiresApproval: true,
      suggestedTool: { name: "daily.create_task", text: "Draft task" }
    });
    await expect(client.runAgentCommand({ message: "create" })).resolves.toMatchObject({
      kind: "tool_call",
      requiresApproval: false,
      tool: "daily.create_task",
      toolResult: { path: "Daily/2026-07-13.md" }
    });
  });

  it("negotiates the DailyOps writer and sends versioned Markdown mutations without a Vault path", async () => {
    vi.stubGlobal("window", globalThis);
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      requests.push({ url, body });
      if (url.endsWith("/tools/daily/status")) {
        return {
          ok: true,
          json: async () => ({
            protocol_version: "towrite-daily-ops/v2",
            markdown_contract: "towrite-daily-plan/v2",
            enabled: true,
            writer_capable: true,
            daily_note_root: "Daily",
            daily_note_format: "YYYY-MM-DD.md",
            daily_note_todo_section: "ToDo",
            daily_plan_heading: "今日计划",
            daily_plan_source: "daily",
            daily_plan_document: "Planning/Daily Plans.md"
          })
        };
      }
      if (url.includes("/tools/daily/plans/")) {
        return {
          ok: true,
          json: async () => ({
            protocol_version: "towrite-daily-ops/v2",
            markdown_contract: "towrite-daily-plan/v2",
            date: "2026-07-23",
            source: "daily",
            source_path: "Daily/2026-07-23.md",
            theme: body?.theme ?? "Echo MVP",
            note_revision: body?.expected_note_revision ? "dnr_next" : "dnr_loaded",
            changed: Boolean(body)
          })
        };
      }
      return {
        ok: true,
        json: async () => ({
          task: {
            id: "daily_abc123",
            revision: "dtr_server",
            raw_line: "- [ ] Draft",
            raw_block: "- [ ] Draft\n  User note\n  ^daily_abc123"
          },
          updated: true
        })
      };
    }));
    const client = new BackendEnhancementClient(() => backendSettings(), globalThis.fetch);

    await expect(client.getDailyOpsStatus()).resolves.toMatchObject({
      protocolVersion: "towrite-daily-ops/v2",
      markdownContract: "towrite-daily-plan/v2",
      writerCapable: true,
      planSource: "daily",
      planHeading: "今日计划"
    });
    await client.createDailyTask({
      id: "daily_explicit123",
      text: "Draft chapter",
      date: "2026-07-23",
      kind: "edit_note",
      devicePolicy: "scheduled",
      scheduledFor: "2026-07-23T09:30:00.000Z",
      tags: ["today"],
      primary: true,
      minimum: true,
      goal: "Measure the experiment",
      nextStep: "List the metrics",
      estimateMinutes: 15,
      target: "[[Echo MVP]]"
    });
    await expect(client.moveDailyTask(
      "daily_abc123",
      "- [ ] Draft\n  User note\n  ^daily_abc123",
      "up"
    )).resolves.toMatchObject({
      direction: "up"
    });
    const plan = await client.getDailyPlan("2026-07-23");
    await client.updateDailyPlan("2026-07-23", "Ship Echo", plan.noteRevision);

    const createRequest = requests.find((request) => request.url.endsWith("/tools/daily/tasks"));
    expect(createRequest?.body).toMatchObject({
      task_id: "daily_explicit123",
      target: "daily",
      towrite_kind: "edit_note",
      towrite_device: "scheduled",
      towrite_at: "2026-07-23T09:30:00.000Z",
      towrite_primary: true,
      towrite_minimum: true,
      towrite_goal: "Measure the experiment",
      towrite_next: "List the metrics",
      towrite_estimate: "15m",
      towrite_target: "[[Echo MVP]]"
    });
    const planPatch = requests.find((request) => request.body?.expected_note_revision === "dnr_loaded");
    expect(planPatch?.body).toEqual({
      theme: "Ship Echo",
      expected_note_revision: "dnr_loaded"
    });
    const moveRequest = requests.find((request) => request.body?.action === "move_up");
    expect(moveRequest?.body).toEqual({
      action: "move_up",
      raw_block: "- [ ] Draft\n  User note\n  ^daily_abc123"
    });
    expect(requests.flatMap((request) => Object.values(request.body ?? {}))).not.toContain("Daily/2026-07-23.md");
  });

  it("binds Backend complete and reopen transitions to event, task, lineage, and timer revisions", async () => {
    vi.stubGlobal("window", globalThis);
    const requests: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(body);
      const completed = body.action === "complete";
      return {
        ok: true,
        json: async () => ({
          protocol_version: "towrite-daily-ops/v2",
          task: {
            id: "daily_bound",
            revision: completed ? "task_after_complete" : "task_after_reopen",
            raw_line: completed ? "- [x] Bound" : "- [ ] Bound",
            raw_block: `${completed ? "- [x]" : "- [ ]"} Bound\n  ^daily_bound`
          },
          timing: {
            task_id: "daily_bound",
            status: completed ? "completed" : "paused",
            active_ms: 60_000,
            wall_ms: 120_000,
            interruption_count: 1,
            daily_active_ms: {},
            needs_review: false,
            review_reasons: [],
            timing_revision: completed ? "timer_after_complete" : "timer_after_reopen"
          },
          events: [],
          idempotent: false
        })
      };
    }));
    const client = new BackendEnhancementClient(() => backendSettings(), globalThis.fetch);
    const base = {
      source: "device" as const,
      rawBlock: "- [/] Bound\n  ^daily_bound",
      taskRevision: "task_before",
      lineageRevision: "lineage_frozen",
      expectedTimingRevision: "timer_before"
    };

    await expect(client.completeDailyTask("daily_bound", {
      ...base,
      eventId: "evt_complete_bound"
    })).resolves.toMatchObject({
      item: { id: "daily_bound", revision: "task_after_complete" },
      timing: { status: "completed", timingRevision: "timer_after_complete" }
    });
    await expect(client.reopenDailyTask("daily_bound", {
      ...base,
      source: "obsidian",
      eventId: "evt_reopen_bound"
    })).resolves.toMatchObject({
      item: { id: "daily_bound", revision: "task_after_reopen" },
      timing: { status: "paused", timingRevision: "timer_after_reopen" }
    });

    expect(requests).toEqual([
      {
        action: "complete",
        event_id: "evt_complete_bound",
        at: "",
        source: "device",
        raw_block: "- [/] Bound\n  ^daily_bound",
        task_revision: "task_before",
        lineage_revision: "lineage_frozen",
        expected_timing_revision: "timer_before"
      },
      {
        action: "reopen",
        event_id: "evt_reopen_bound",
        at: "",
        source: "obsidian",
        raw_block: "- [/] Bound\n  ^daily_bound",
        task_revision: "task_before",
        lineage_revision: "lineage_frozen",
        expected_timing_revision: "timer_before"
      }
    ]);
  });

  it("parses the Backend NDJSON context inspection stream", async () => {
    vi.stubGlobal("window", globalThis);
    const bytes = new TextEncoder().encode([
      JSON.stringify({ type: "status", message: "Building context bundle" }),
      JSON.stringify({
        type: "context",
        note_count: 1,
        folder_count: 0,
        agent_count: 1,
        history_count: 2,
        char_count: 320,
        model_id: "local_chat",
        agent_ids: ["writer"]
      }),
      JSON.stringify({ type: "prompt_preview", content: "Visible model input" }),
      JSON.stringify({ type: "delta", content: "Hello" }),
      JSON.stringify({ type: "done", note_path: null })
    ].join("\n"));
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        }
      })
    })));
    const client = new BackendEnhancementClient(() => backendSettings(), globalThis.fetch);

    const events = [];
    for await (const event of client.streamChatOnContext({
      message: "Continue",
      modelId: "local_chat",
      notePaths: ["Projects/Active.md"],
      agentIds: ["writer"],
      contextSnippets: [],
      chatHistory: []
    })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual(["status", "context", "prompt_preview", "delta", "done"]);
    expect(events[1]).toMatchObject({
      type: "context",
      noteCount: 1,
      agentCount: 1,
      historyCount: 2,
      modelId: "local_chat",
      agentIds: ["writer"]
    });
  });
});

function backendSettings() {
  return {
    enabled: true,
    baseUrl: "http://127.0.0.1:8790",
    token: "secret",
    useForRecommendations: true,
    useForHabitSuggestions: false,
    timeoutMs: 2500
  };
}
