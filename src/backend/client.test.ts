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
    }));

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
    const client = new BackendEnhancementClient(() => backendSettings());

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
    const client = new BackendEnhancementClient(() => backendSettings());

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
    const client = new BackendEnhancementClient(() => backendSettings());

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
    const client = new BackendEnhancementClient(() => backendSettings());

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
    const client = new BackendEnhancementClient(() => backendSettings());

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
    const client = new BackendEnhancementClient(() => backendSettings());

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
