import type { ToWriteBackendSettings } from "../core/settings";
import type { BackendCapabilities, CaptureDraft, CaptureTargetCandidate } from "../capture/types";
import type { HubCandidate, HubContextState } from "../hub/types";
import { requestHub, type HttpRequest } from "../hub/http";
import type {
  DailyDevicePolicy,
  DailyPlanItemKind,
  DailyPlanStatus,
  DailySummary,
  DailyTaskTimingSnapshot,
  DailyTimerEvent
} from "../daily";

interface BackendRecommendationItem {
  id?: unknown;
  reason?: unknown;
  confidence?: unknown;
  score?: unknown;
}

interface BackendRecommendationResponse {
  protocolVersion?: unknown;
  candidates?: BackendRecommendationItem[];
}

interface BackendDeviceRecommendationItem {
  candidate_id?: unknown;
  id?: unknown;
  reason?: unknown;
  score?: unknown;
}

export interface BackendHabitSuggestionResponse<T = unknown> {
  protocolVersion: string;
  suggestions: T[];
}

export interface BackendModelInfo {
  id: string;
  label: string;
  provider?: string;
}

export interface BackendSkillInfo {
  name: string;
  role?: string;
  skillPath: string;
  agentId?: string;
  command?: string;
  api?: string;
}

export interface BackendAgentInfo {
  agentId: string;
  name: string;
  type: string;
  status: string;
  role: string;
  path: string;
  category: string;
  defaultModelId: string;
  externalModelPolicy: string;
  subscribes: string[];
  avatar: string;
  participation: Record<string, unknown>;
  permissions: Record<string, unknown>;
  tools: string[];
  memoryPaths: Record<string, string>;
  bodyPreview: string;
}

export interface BackendChatRequest {
  message: string;
  modelId: string;
  notePaths: string[];
  folderPaths?: string[];
  contextSnippets: Array<{ kind: string; title: string; text: string }>;
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
  agentIds?: string[];
  worldName?: string;
  appendPath?: string;
  maxChars?: number;
}

export interface BackendChatResponse {
  reply: string;
  notePath?: string;
}

export type BackendChatStreamEvent =
  | { type: "status"; message: string }
  | {
      type: "context";
      noteCount: number;
      folderCount: number;
      agentCount: number;
      historyCount: number;
      imageCount: number;
      charCount: number;
      snippetCount: number;
      snippetCharCount: number;
      agentCharCount: number;
      historyCharCount: number;
      appendPath?: string;
      modelId: string;
      worldName: string;
      agentIds: string[];
    }
  | { type: "prompt_preview"; content: string }
  | { type: "delta"; content: string }
  | { type: "done"; notePath?: string }
  | { type: "error"; detail: string };

export interface BackendAgentCommandRequest {
  message: string;
  agentIds?: string[];
  date?: string;
}

export interface BackendAgentInteraction {
  agentId: string;
  kind: "reply" | "suggestion" | "tool_call";
  reply: string;
  requiresApproval: boolean;
  tool?: string;
  suggestedTool?: Record<string, unknown>;
  toolResult?: unknown;
  appendPath?: string;
}

export interface BackendSkillRunResult {
  output: string;
  outputPath?: string;
  runLogPath?: string;
}

export interface BackendDailyOpsStatus {
  protocolVersion: string;
  markdownContract: string;
  enabled: boolean;
  writerCapable: boolean;
  dailyNoteRoot: string;
  dailyNoteFormat: string;
  todoHeading: string;
  planHeading: string;
  planSource: "daily" | "fixed" | "";
  planDocument: string;
}

export interface BackendDailyTaskMutation {
  id: string;
  revision?: string;
  sourcePath?: string;
  rawLine?: string;
  rawBlock?: string;
  idempotent?: boolean;
}

export interface BackendDailyTaskMoveResult {
  moved: boolean;
  boundary: boolean;
  idempotent: boolean;
  direction: "up" | "down";
}

export interface BackendDailyTaskTimingResult {
  item?: BackendDailyTaskMutation;
  timing: DailyTaskTimingSnapshot;
  events: DailyTimerEvent[];
  idempotent: boolean;
}

export interface BackendDailyPlanMutation {
  date: string;
  source: "daily" | "fixed" | "";
  sourcePath: string;
  theme: string;
  noteRevision: string;
  changed?: boolean;
  idempotent?: boolean;
}

export interface BackendDailyTaskCreateRequest {
  /** Stable caller-generated block id used to make explicit add-to-today idempotent. */
  id?: string;
  text: string;
  date: string;
  kind: DailyPlanItemKind;
  devicePolicy: DailyDevicePolicy;
  scheduledFor?: string;
  dueDate?: string;
  tags?: string[];
  primary?: boolean;
  minimum?: boolean;
  goal?: string;
  nextStep?: string;
  estimateMinutes?: number;
  target?: string;
}

export interface BackendDailyTaskUpdateRequest {
  id: string;
  rawLine: string;
  rawBlock?: string;
  text: string;
  date: string;
  status?: Exclude<DailyPlanStatus, "done">;
  kind: DailyPlanItemKind;
  devicePolicy: DailyDevicePolicy;
  scheduledFor?: string;
  tags?: string[];
  primary?: boolean;
  minimum?: boolean;
  goal?: string;
  nextStep?: string;
  estimateMinutes?: number;
  target?: string;
  startedAt?: string;
}

export interface BackendDailyTimerTransitionRequest {
  eventId?: string;
  at?: string;
  source?: "obsidian" | "device" | "nfc" | "backend";
  rawBlock?: string;
  taskRevision?: string;
  lineageRevision?: string;
  expectedTimingRevision?: string;
}

export class BackendEnhancementClient {
  constructor(
    private readonly getSettings: () => ToWriteBackendSettings,
    private readonly httpRequest: HttpRequest = requestHub
  ) {}

  async getCapabilities(): Promise<BackendCapabilities> {
    const settings = this.requireEnabledSettings();
    const payload = await this.requestJson("/capture/integrations/towrite/v1/capabilities", {
      method: "GET"
    }, settings);
    return normalizeCapabilities(payload);
  }

  async getDailyOpsStatus(): Promise<BackendDailyOpsStatus> {
    const settings = this.requireEnabledSettings();
    const payload = asBackendRecord(await this.requestJson("/tools/daily/status", {
      method: "GET"
    }, settings), "DailyOps status");
    return {
      protocolVersion: optionalString(payload.protocol_version) ?? "",
      markdownContract: optionalString(payload.markdown_contract) ?? "",
      enabled: payload.enabled === true,
      writerCapable: payload.writer_capable === true,
      dailyNoteRoot: optionalString(payload.daily_note_root) ?? "",
      dailyNoteFormat: optionalString(payload.daily_note_format) ?? "",
      todoHeading: optionalString(payload.daily_note_todo_section) ?? "",
      planHeading: optionalString(payload.daily_plan_heading) ?? "",
      planSource: normalizeDailyPlanSource(payload.daily_plan_source),
      planDocument: optionalString(payload.daily_plan_document) ?? ""
    };
  }

  async getDailyPlan(date: string): Promise<BackendDailyPlanMutation> {
    const settings = this.requireEnabledSettings();
    const payload = asBackendRecord(await this.requestJson(
      `/tools/daily/plans/${encodeURIComponent(date)}`,
      { method: "GET" },
      settings
    ), "DailyOps plan");
    return normalizeBackendDailyPlanMutation(payload);
  }

  async updateDailyPlan(
    date: string,
    theme: string,
    expectedNoteRevision: string
  ): Promise<BackendDailyPlanMutation> {
    const settings = this.requireEnabledSettings();
    const payload = asBackendRecord(await this.requestJson(
      `/tools/daily/plans/${encodeURIComponent(date)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          theme,
          expected_note_revision: expectedNoteRevision
        })
      },
      settings
    ), "DailyOps plan mutation");
    return normalizeBackendDailyPlanMutation(payload);
  }

  async createDailyTask(request: BackendDailyTaskCreateRequest): Promise<BackendDailyTaskMutation> {
    const settings = this.requireEnabledSettings();
    const payload = asBackendRecord(await this.requestJson("/tools/daily/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task_id: request.id ?? "",
        text: request.text,
        date: request.date,
        target: "daily",
        due: request.dueDate || request.date,
        scheduled: request.date,
        tags: request.tags ?? [],
        towrite_kind: request.kind,
        towrite_device: request.devicePolicy,
        towrite_at: request.scheduledFor ?? "",
        towrite_primary: request.primary ?? false,
        towrite_minimum: request.minimum ?? false,
        towrite_goal: request.goal ?? "",
        towrite_next: request.nextStep ?? "",
        towrite_estimate: request.estimateMinutes ? `${request.estimateMinutes}m` : "",
        towrite_target: request.target ?? ""
      })
    }, settings), "DailyOps task mutation");
    return normalizeBackendDailyTaskMutation(payload);
  }

  async updateDailyTask(request: BackendDailyTaskUpdateRequest): Promise<BackendDailyTaskMutation> {
    const settings = this.requireEnabledSettings();
    const action = request.status === "in-progress"
      ? "start"
      : request.status === "todo"
        ? "todo"
        : "edit";
    const payload = asBackendRecord(await this.requestJson(`/tools/daily/tasks/${encodeURIComponent(request.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        raw_line: request.rawLine,
        raw_block: request.rawBlock ?? request.rawLine,
        text: request.text,
        date: request.date,
        towrite_kind: request.kind,
        towrite_device: request.devicePolicy,
        towrite_at: request.scheduledFor ?? "",
        towrite_primary: request.primary,
        towrite_minimum: request.minimum,
        towrite_goal: request.goal,
        towrite_next: request.nextStep,
        towrite_estimate: request.estimateMinutes === undefined ? undefined : `${request.estimateMinutes}m`,
        towrite_target: request.target,
        towrite_started: request.startedAt,
        tags: request.tags ?? []
      })
    }, settings), "DailyOps task mutation");
    return normalizeBackendDailyTaskMutation(payload);
  }

  async getDailyTaskTiming(
    id: string,
    options: {
      taskRevision?: string;
      lineageRevision?: string;
      includeEvents?: boolean;
    } = {}
  ): Promise<BackendDailyTaskTimingResult> {
    const settings = this.requireEnabledSettings();
    const query = new URLSearchParams();
    if (options.taskRevision) query.set("task_revision", options.taskRevision);
    if (options.lineageRevision) query.set("lineage_revision", options.lineageRevision);
    query.set("include_events", options.includeEvents === false ? "false" : "true");
    const payload = asBackendRecord(await this.requestJson(
      `/tools/daily/tasks/${encodeURIComponent(id)}/timing?${query.toString()}`,
      { method: "GET" },
      settings
    ), "DailyOps task timing");
    return normalizeBackendDailyTaskTimingResult(payload, id);
  }

  async startDailyTask(
    id: string,
    options: BackendDailyTimerTransitionRequest
  ): Promise<BackendDailyTaskTimingResult> {
    return this.transitionDailyTaskTimer(id, "start", options);
  }

  async pauseDailyTask(
    id: string,
    options: BackendDailyTimerTransitionRequest
  ): Promise<BackendDailyTaskTimingResult> {
    return this.transitionDailyTaskTimer(id, "pause", options);
  }

  async resumeDailyTask(
    id: string,
    options: BackendDailyTimerTransitionRequest
  ): Promise<BackendDailyTaskTimingResult> {
    return this.transitionDailyTaskTimer(id, "resume", options);
  }

  async correctDailyTaskTiming(
    id: string,
    request: {
      eventId: string;
      operation: "correct" | "reset";
      expectedTimingRevision: string;
      targetEventId?: string;
      replacementAt?: string;
      reason?: string;
      source?: "obsidian" | "device" | "nfc" | "backend";
      taskRevision?: string;
      lineageRevision?: string;
    }
  ): Promise<BackendDailyTaskTimingResult> {
    const settings = this.requireEnabledSettings();
    const payload = asBackendRecord(await this.requestJson(
      `/tools/daily/tasks/${encodeURIComponent(id)}/timing`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event_id: request.eventId,
          operation: request.operation,
          target_event_id: request.targetEventId ?? "",
          replacement_at: request.replacementAt ?? "",
          reason: request.reason ?? "",
          source: request.source ?? "obsidian",
          task_revision: request.taskRevision ?? "",
          lineage_revision: request.lineageRevision ?? "",
          expected_timing_revision: request.expectedTimingRevision
        })
      },
      settings
    ), "DailyOps timing correction");
    return normalizeBackendDailyTaskTimingResult(payload, id);
  }

  private async transitionDailyTaskTimer(
    id: string,
    action: "start" | "pause" | "resume",
    request: BackendDailyTimerTransitionRequest
  ): Promise<BackendDailyTaskTimingResult> {
    const settings = this.requireEnabledSettings();
    const payload = asBackendRecord(await this.requestJson(
      `/tools/daily/tasks/${encodeURIComponent(id)}/${action}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event_id: request.eventId?.trim() || `evt_${randomFragment()}`,
          at: request.at ?? "",
          source: request.source ?? "obsidian",
          raw_block: request.rawBlock ?? "",
          task_revision: request.taskRevision ?? "",
          lineage_revision: request.lineageRevision ?? "",
          expected_timing_revision: request.expectedTimingRevision ?? ""
        })
      },
      settings
    ), `DailyOps task ${action}`);
    return normalizeBackendDailyTaskTimingResult(payload, id);
  }

  async completeDailyTask(
    id: string,
    request: BackendDailyTimerTransitionRequest
  ): Promise<BackendDailyTaskTimingResult> {
    return this.transitionDailyTaskState(id, "complete", request);
  }

  async reopenDailyTask(
    id: string,
    request: BackendDailyTimerTransitionRequest
  ): Promise<BackendDailyTaskTimingResult> {
    return this.transitionDailyTaskState(id, "reopen", request);
  }

  async setDailyTaskCompletionWithoutTiming(
    id: string,
    action: "complete" | "reopen",
    rawBlock: string
  ): Promise<BackendDailyTaskMutation> {
    const settings = this.requireEnabledSettings();
    const payload = asBackendRecord(await this.requestJson(`/tools/daily/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, raw_block: rawBlock })
    }, settings), "DailyOps task mutation");
    return normalizeBackendDailyTaskMutation(payload);
  }

  private async transitionDailyTaskState(
    id: string,
    action: "complete" | "reopen",
    request: BackendDailyTimerTransitionRequest
  ): Promise<BackendDailyTaskTimingResult> {
    const settings = this.requireEnabledSettings();
    const payload = asBackendRecord(await this.requestJson(`/tools/daily/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        event_id: request.eventId?.trim() || `evt_${randomFragment()}`,
        at: request.at ?? "",
        source: request.source ?? "obsidian",
        raw_block: request.rawBlock ?? "",
        task_revision: request.taskRevision ?? "",
        lineage_revision: request.lineageRevision ?? "",
        expected_timing_revision: request.expectedTimingRevision ?? ""
      })
    }, settings), `DailyOps task ${action}`);
    return normalizeBackendDailyTaskTimingResult(payload, id);
  }

  async moveDailyTask(
    id: string,
    rawBlock: string,
    direction: "up" | "down"
  ): Promise<BackendDailyTaskMoveResult> {
    const settings = this.requireEnabledSettings();
    const payload = asBackendRecord(await this.requestJson(`/tools/daily/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: direction === "up" ? "move_up" : "move_down",
        raw_block: rawBlock
      })
    }, settings), "DailyOps task reorder");
    return {
      moved: payload.moved === true,
      boundary: payload.boundary === true,
      idempotent: payload.idempotent === true,
      direction
    };
  }

  async writeDailySummary(summary: DailySummary): Promise<{ changed: boolean }> {
    const settings = this.requireEnabledSettings();
    const payload = asBackendRecord(await this.requestJson("/tools/daily/summary/write-back", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: summary.date,
        headline: summary.headline,
        lines: summary.lines,
        generated_at: summary.generatedAt
      })
    }, settings), "DailyOps summary writeback");
    return { changed: payload.changed === true };
  }

  async rerankTargets(draft: CaptureDraft, candidates: CaptureTargetCandidate[]): Promise<CaptureTargetCandidate[]> {
    const settings = this.requireEnabledSettings();
    if (!settings.useForRecommendations || candidates.length === 0) {
      return candidates;
    }
    const safeCandidates = candidates.slice(0, 20);
    const response = await this.requestJson("/capture/integrations/towrite/v1/recommend-targets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildRecommendationPayload(draft, safeCandidates))
    }, settings) as BackendRecommendationResponse;
    if (!isSupportedProtocol(response.protocolVersion)) {
      return safeCandidates;
    }
    return applyBackendRerank(safeCandidates, response);
  }

  async rerankDeviceHubCandidates(
    candidates: HubCandidate[],
    context: { state?: HubContextState; semanticPlace?: string; mode?: string } = {},
    acceptedHabits: Array<Record<string, unknown>> = []
  ): Promise<HubCandidate[]> {
    const settings = this.requireEnabledSettings();
    if (!settings.useForRecommendations || candidates.length === 0) {
      return candidates;
    }
    const safeCandidates = candidates.slice(0, 20);
    const payload = await this.requestJson("/capture/integrations/towrite/v1/recommend-device-content", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        protocol_version: "1",
        use_ai: true,
        context: {
          state: context.state,
          semantic_place: context.semanticPlace?.slice(0, 80),
          mode: context.mode?.slice(0, 80)
        },
        candidates: safeCandidates.map((candidate) => ({
          candidate_id: candidate.candidateRef,
          type: candidate.type,
          // Body and write target are deliberately excluded from the AI payload.
          title: candidate.display.title?.slice(0, 160) ?? "",
          reason: candidate.reasonCode.slice(0, 240),
          score: candidate.score,
          context: {}
        })),
        accepted_habits: acceptedHabits
          .filter((habit) => habit.status === "accepted")
          .slice(0, 20)
      })
    }, settings) as Record<string, unknown>;
    const ranked = Array.isArray(payload.ranked) ? payload.ranked as BackendDeviceRecommendationItem[] : [];
    const byRef = new Map(safeCandidates.map((candidate) => [candidate.candidateRef, candidate]));
    const seen = new Set<string>();
    const output: HubCandidate[] = [];
    for (const item of ranked) {
      const id = typeof item.candidate_id === "string"
        ? item.candidate_id
        : typeof item.id === "string" ? item.id : "";
      const local = byRef.get(id);
      if (!local || seen.has(id)) {
        continue;
      }
      seen.add(id);
      output.push({
        ...local,
        reasonCode: typeof item.reason === "string" && item.reason.trim()
          ? item.reason.trim().slice(0, 240)
          : local.reasonCode,
        score: typeof item.score === "number" && Number.isFinite(item.score)
          ? Math.max(0, Math.min(1, item.score))
          : local.score
      });
    }
    return [...output, ...safeCandidates.filter((candidate) => !seen.has(candidate.candidateRef))];
  }

  async suggestHabits<TInput extends object, TOutput = unknown>(aggregateEvidence: TInput): Promise<BackendHabitSuggestionResponse<TOutput>> {
    const settings = this.requireEnabledSettings();
    if (!settings.useForHabitSuggestions) {
      return { protocolVersion: "1", suggestions: [] };
    }
    const payload = await this.requestJson("/capture/integrations/towrite/v1/suggest-habits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ protocolVersion: "1", aggregateEvidence })
    }, settings) as Record<string, unknown>;
    const protocolVersion = String(payload.protocolVersion ?? payload.protocol_version ?? "").trim();
    if (!isSupportedProtocol(protocolVersion)) {
      return { protocolVersion: protocolVersion || "unknown", suggestions: [] };
    }
    return {
      protocolVersion,
      suggestions: Array.isArray(payload.suggestions) ? payload.suggestions as TOutput[] : []
    };
  }

  async listModels(): Promise<BackendModelInfo[]> {
    const settings = this.requireEnabledSettings();
    const payload = await this.requestJson("/models", { method: "GET" }, settings) as Record<string, unknown>;
    const models = payload.models && typeof payload.models === "object" && !Array.isArray(payload.models)
      ? payload.models as Record<string, unknown>
      : {};
    return Object.entries(models)
      .map(([id, value]) => normalizeBackendModel(id, value))
      .filter((model): model is BackendModelInfo => Boolean(model))
      .filter((model) => model.id.length > 0)
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  async listSkills(): Promise<BackendSkillInfo[]> {
    const settings = this.requireEnabledSettings();
    const payload = await this.requestJson("/skills", { method: "GET" }, settings) as Record<string, unknown>;
    return (Array.isArray(payload.skills) ? payload.skills : [])
      .map(normalizeBackendSkill)
      .filter((skill): skill is BackendSkillInfo => Boolean(skill))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async listAgents(): Promise<BackendAgentInfo[]> {
    const settings = this.requireEnabledSettings();
    const payload = await this.requestJson("/agents/roster", { method: "GET" }, settings) as Record<string, unknown>;
    return (Array.isArray(payload.agents) ? payload.agents : [])
      .map(normalizeBackendAgent)
      .filter((agent): agent is BackendAgentInfo => Boolean(agent))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async chatOnContext(request: BackendChatRequest): Promise<string> {
    return (await this.chatOnContextDetailed(request)).reply;
  }

  async chatOnContextDetailed(request: BackendChatRequest): Promise<BackendChatResponse> {
    const settings = this.requireEnabledSettings();
    const payload = await this.requestJson("/agents/dialogue/chat-on-context", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildBackendChatPayload(request))
    }, settings, Math.max(settings.timeoutMs, 120000)) as Record<string, unknown>;
    const reply = typeof payload.reply === "string" ? payload.reply.trim() : "";
    if (!reply) {
      throw new Error("Obsidian AI Backend returned an empty chat reply.");
    }
    return {
      reply,
      notePath: optionalString(payload.note_path)
    };
  }

  async *streamChatOnContext(request: BackendChatRequest): AsyncGenerator<BackendChatStreamEvent> {
    const settings = this.requireEnabledSettings();
    const opened = await this.openRequest("/agents/dialogue/chat-on-context/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildBackendChatPayload(request))
    }, settings, Math.max(settings.timeoutMs, 120000));
    const response = opened.response;
    if (!response.body) {
      opened.close();
      throw new Error("Obsidian AI Backend returned an empty chat stream.");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/u);
        buffer = done ? "" : lines.pop() ?? "";
        for (const line of lines) {
          const event = normalizeBackendChatStreamEvent(parseNdjsonLine(line));
          if (event) {
            yield event;
          }
        }
        if (done) {
          const event = normalizeBackendChatStreamEvent(parseNdjsonLine(buffer));
          if (event) {
            yield event;
          }
          break;
        }
      }
    } finally {
      reader.releaseLock();
      opened.close();
    }
  }

  async runAgentCommand(request: BackendAgentCommandRequest): Promise<BackendAgentInteraction> {
    const settings = this.requireEnabledSettings();
    const payload = await this.requestJson("/agents/mobile-command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: request.message,
        agent_ids: request.agentIds?.slice(0, 12) ?? [],
        date: request.date
      })
    }, settings, Math.max(settings.timeoutMs, 120000));
    const interaction = normalizeBackendAgentInteraction(payload);
    if (!interaction) {
      throw new Error("Obsidian AI Backend returned an invalid agent interaction.");
    }
    return interaction;
  }

  async runSkill(request: {
    skillPath: string;
    userInput: string;
    modelId: string;
  }): Promise<string> {
    return (await this.runSkillDetailed(request)).output;
  }

  async runSkillDetailed(request: {
    skillPath: string;
    userInput: string;
    modelId: string;
  }): Promise<BackendSkillRunResult> {
    const settings = this.requireEnabledSettings();
    const payload = await this.requestJson("/agents/run-skill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        skill_path: request.skillPath,
        user_input: request.userInput,
        model_id: request.modelId
      })
    }, settings, Math.max(settings.timeoutMs, 180000)) as Record<string, unknown>;
    const output = typeof payload.output === "string" ? payload.output.trim() : "";
    if (!output) {
      throw new Error("Obsidian AI Backend returned an empty Skill result.");
    }
    return {
      output,
      outputPath: optionalString(payload.output_path),
      runLogPath: optionalString(payload.run_log_path)
    };
  }

  private requireEnabledSettings(): ToWriteBackendSettings {
    const settings = this.getSettings();
    if (!settings.enabled) {
      throw new Error("Obsidian AI Backend integration is disabled.");
    }
    if (!/^https?:\/\//iu.test(settings.baseUrl)) {
      throw new Error("Obsidian AI Backend URL must start with http:// or https://.");
    }
    return settings;
  }

  private async requestJson(
    path: string,
    init: RequestInit,
    settings: ToWriteBackendSettings,
    timeoutMs = settings.timeoutMs
  ): Promise<unknown> {
    const opened = await this.openRequest(path, init, settings, timeoutMs);
    try {
      return await opened.response.json() as unknown;
    } finally {
      opened.close();
    }
  }

  private async openRequest(
    path: string,
    init: RequestInit,
    settings: ToWriteBackendSettings,
    timeoutMs = settings.timeoutMs
  ): Promise<{ response: Response; close: () => void }> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const close = () => window.clearTimeout(timer);
    try {
      const response = await this.httpRequest(`${settings.baseUrl.replace(/\/+$/u, "")}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          ...(init.headers ?? {}),
          ...(settings.token ? { "X-Capture-Token": settings.token } : {})
        }
      });
      if (!response.ok) {
        close();
        throw new Error(`Obsidian AI Backend returned HTTP ${response.status}.`);
      }
      return { response, close };
    } catch (error) {
      close();
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(`Obsidian AI Backend timed out after ${timeoutMs}ms.`);
      }
      throw error;
    }
  }
}

function normalizeBackendModel(id: string, value: unknown): BackendModelInfo | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if ((record.model_type && record.model_type !== "chat") || record.configured === false) {
    return undefined;
  }
  return {
    id: id.trim(),
    label: typeof record.label === "string" && record.label.trim() ? record.label.trim() : id.trim(),
    provider: typeof record.provider === "string" && record.provider.trim() ? record.provider.trim() : undefined
  };
}

function normalizeBackendSkill(value: unknown): BackendSkillInfo | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const skillPath = typeof record.skill_path === "string" ? record.skill_path.trim() : "";
  if (!skillPath) {
    return undefined;
  }
  return {
    name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : skillPath.split("/").pop() ?? skillPath,
    role: typeof record.role === "string" && record.role.trim() ? record.role.trim() : undefined,
    skillPath,
    agentId: optionalString(record.agent_id),
    command: optionalString(record.command),
    api: optionalString(record.api)
  };
}

function normalizeBackendAgent(value: unknown): BackendAgentInfo | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const agentId = optionalString(value.agent_id);
  if (!agentId) {
    return undefined;
  }
  return {
    agentId,
    name: optionalString(value.name) ?? agentId,
    type: optionalString(value.type) ?? "agent",
    status: optionalString(value.status) ?? "unknown",
    role: optionalString(value.role) ?? "",
    path: optionalString(value.path) ?? "",
    category: optionalString(value.category) ?? "",
    defaultModelId: optionalString(value.default_model_id) ?? "",
    externalModelPolicy: optionalString(value.external_model_policy) ?? "",
    subscribes: stringList(value.subscribes),
    avatar: optionalString(value.avatar) ?? "",
    participation: isRecord(value.participation) ? value.participation : {},
    permissions: isRecord(value.permissions) ? value.permissions : {},
    tools: stringList(value.tools),
    memoryPaths: stringRecord(value.memory_paths),
    bodyPreview: optionalString(value.body_preview) ?? ""
  };
}

function normalizeBackendAgentInteraction(value: unknown): BackendAgentInteraction | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const rawKind = optionalString(value.kind);
  const kind = rawKind === "reply" || rawKind === "suggestion" || rawKind === "tool_call" ? rawKind : undefined;
  const reply = optionalString(value.reply);
  if (!kind || !reply) {
    return undefined;
  }
  return {
    agentId: optionalString(value.agent_id) ?? "",
    kind,
    reply,
    requiresApproval: value.requires_approval === true || kind === "suggestion",
    tool: optionalString(value.tool),
    suggestedTool: isRecord(value.suggested_tool) ? value.suggested_tool : undefined,
    toolResult: value.tool_result,
    appendPath: optionalString(value.append_path)
  };
}

function buildBackendChatPayload(request: BackendChatRequest): Record<string, unknown> {
  return {
    message: request.message,
    model_id: request.modelId,
    note_paths: request.notePaths.slice(0, 8),
    folder_paths: request.folderPaths?.slice(0, 8) ?? [],
    context_snippets: request.contextSnippets.slice(0, 20),
    chat_history: request.chatHistory.slice(-30),
    agent_ids: request.agentIds?.slice(0, 12) ?? [],
    world_name: request.worldName,
    append_path: request.appendPath,
    max_chars: Math.max(1000, Math.min(200000, request.maxChars ?? 30000))
  };
}

function parseNdjsonLine(line: string): unknown {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error("Obsidian AI Backend returned invalid NDJSON.");
  }
}

function normalizeBackendChatStreamEvent(value: unknown): BackendChatStreamEvent | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  switch (value.type) {
    case "status":
      return { type: "status", message: optionalString(value.message) ?? "" };
    case "context":
      return {
        type: "context",
        noteCount: finiteNumber(value.note_count),
        folderCount: finiteNumber(value.folder_count),
        agentCount: finiteNumber(value.agent_count),
        historyCount: finiteNumber(value.history_count),
        imageCount: finiteNumber(value.image_count),
        charCount: finiteNumber(value.char_count),
        snippetCount: finiteNumber(value.snippet_count),
        snippetCharCount: finiteNumber(value.snippet_char_count),
        agentCharCount: finiteNumber(value.agent_char_count),
        historyCharCount: finiteNumber(value.history_char_count),
        appendPath: optionalString(value.append_path),
        modelId: optionalString(value.model_id) ?? "",
        worldName: optionalString(value.world_name) ?? "",
        agentIds: stringList(value.agent_ids)
      };
    case "prompt_preview":
      return { type: "prompt_preview", content: optionalString(value.content) ?? "" };
    case "delta":
      return { type: "delta", content: optionalString(value.content) ?? "" };
    case "done":
      return { type: "done", notePath: optionalString(value.note_path) };
    case "error":
      return { type: "error", detail: optionalString(value.detail) ?? "Unknown Backend streaming error." };
    default:
      return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asBackendRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Obsidian AI Backend returned an invalid ${label}.`);
  }
  return value;
}

function normalizeBackendDailyTaskMutation(payload: Record<string, unknown>): BackendDailyTaskMutation {
  const task = isRecord(payload.task) ? payload.task : {};
  const id = optionalString(task.id);
  if (!id) {
    throw new Error("Obsidian AI Backend DailyOps response is missing the task id.");
  }
  return {
    id,
    revision: optionalString(task.revision),
    sourcePath: optionalString(task.source_path),
    rawLine: optionalExactString(task.raw_line),
    rawBlock: optionalExactString(task.raw_block),
    idempotent: payload.idempotent === true
  };
}

function normalizeBackendDailyTaskTimingResult(
  payload: Record<string, unknown>,
  fallbackTaskId: string
): BackendDailyTaskTimingResult {
  const timing = isRecord(payload.timing) ? payload.timing : {};
  const taskId = optionalString(timing.task_id) ?? fallbackTaskId;
  const status = timing.status === "running"
    || timing.status === "paused"
    || timing.status === "completed"
    ? timing.status
    : "not-started";
  const timingRevision = optionalString(timing.timing_revision);
  if (!timingRevision) {
    throw new Error("Obsidian AI Backend DailyOps timing response is missing its revision.");
  }
  const dailyActiveMs = isRecord(timing.daily_active_ms)
    ? Object.fromEntries(Object.entries(timing.daily_active_ms)
      .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
      .map(([key, value]) => [key, Math.max(0, Number(value))]))
    : {};
  const reviewReasons = Array.isArray(timing.review_reasons)
    ? timing.review_reasons.filter((value): value is DailyTaskTimingSnapshot["reviewReasons"][number] =>
      value === "open-session-over-4h"
      || value === "open-session-crossed-midnight"
      || value === "invalid-event-order")
    : [];
  const snapshot: DailyTaskTimingSnapshot = {
    schemaVersion: 1,
    taskId,
    status,
    activeMs: nonNegativeNumber(timing.active_ms),
    wallMs: nonNegativeNumber(timing.wall_ms),
    interruptionCount: nonNegativeNumber(timing.interruption_count),
    firstStartedAt: optionalString(timing.first_started_at),
    lastTransitionAt: optionalString(timing.last_transition_at),
    completedAt: optionalString(timing.completed_at),
    activeSince: optionalString(timing.active_since),
    activeSessionId: optionalString(timing.active_session_id),
    estimateMinutes: optionalFiniteNumber(timing.estimate_minutes),
    estimateDeltaMinutes: optionalFiniteNumber(timing.estimate_delta_minutes),
    dailyActiveMs,
    needsReview: timing.needs_review === true,
    reviewReasons,
    timingRevision
  };
  const taskPayload = isRecord(payload.task)
    ? payload
    : isRecord(payload.item)
      ? { ...payload, task: payload.item }
      : undefined;
  return {
    item: taskPayload ? normalizeBackendDailyTaskMutation(taskPayload) : undefined,
    timing: snapshot,
    events: Array.isArray(payload.events)
      ? payload.events.map(normalizeBackendDailyTimerEvent)
        .filter((event): event is DailyTimerEvent => Boolean(event))
      : [],
    idempotent: payload.idempotent === true
  };
}

function normalizeBackendDailyTimerEvent(value: unknown): DailyTimerEvent | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value.kind;
  const source = value.source;
  const eventId = optionalString(value.event_id);
  const taskId = optionalString(value.task_id);
  const sessionId = optionalString(value.session_id);
  const at = optionalString(value.at);
  if (!eventId || !taskId || !sessionId || !at
    || (kind !== "start" && kind !== "pause" && kind !== "resume" && kind !== "complete"
      && kind !== "reopen" && kind !== "correct" && kind !== "reset")
    || (source !== "obsidian" && source !== "device" && source !== "nfc" && source !== "backend")) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    eventId,
    taskId,
    sessionId,
    kind,
    at,
    source,
    automatic: value.automatic === true || undefined,
    relatedTaskId: optionalString(value.related_task_id),
    targetEventId: optionalString(value.target_event_id),
    replacementAt: optionalString(value.replacement_at),
    invalidateTarget: value.invalidate_target === true || undefined,
    reason: optionalString(value.reason)
  };
}

function normalizeBackendDailyPlanMutation(payload: Record<string, unknown>): BackendDailyPlanMutation {
  const date = optionalString(payload.date);
  const sourcePath = optionalString(payload.source_path);
  const noteRevision = optionalString(payload.note_revision);
  if (!date || !sourcePath || !noteRevision) {
    throw new Error("Obsidian AI Backend DailyOps response is missing plan identity or revision.");
  }
  return {
    date,
    source: normalizeDailyPlanSource(payload.source),
    sourcePath,
    theme: optionalString(payload.theme) ?? "",
    noteRevision,
    changed: typeof payload.changed === "boolean" ? payload.changed : undefined,
    idempotent: typeof payload.idempotent === "boolean" ? payload.idempotent : undefined
  };
}

function normalizeDailyPlanSource(value: unknown): "daily" | "fixed" | "" {
  return value === "daily" || value === "fixed" ? value : "";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalExactString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(optionalString).filter((item): item is string => Boolean(item))
    : [];
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, optionalString(item)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
  );
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nonNegativeNumber(value: unknown): number {
  return Math.max(0, finiteNumber(value));
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function randomFragment(): string {
  return window.crypto?.randomUUID?.().replace(/-/gu, "")
    ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function buildRecommendationPayload(draft: CaptureDraft, candidates: CaptureTargetCandidate[]) {
  return {
    protocolVersion: "1",
    draft: {
      id: draft.id,
      intent: draft.intent,
      title: draft.title?.slice(0, 200),
      tags: draft.tags.slice(0, 20),
      source: draft.source ? {
        hasFile: Boolean(draft.source.file),
        headingDepth: draft.source.headingPath?.length ?? 0,
        hasQuestion: Boolean(draft.source.questionId),
        entryPoint: draft.source.entryPoint
      } : undefined
    },
    candidates: candidates.slice(0, 20).map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      action: candidate.action,
      heading: candidate.heading,
      stageId: candidate.stageId,
      localScore: candidate.score,
      localConfidence: candidate.confidence,
      localReason: candidate.reason
    }))
  };
}

export function applyBackendRerank(
  localCandidates: CaptureTargetCandidate[],
  response: BackendRecommendationResponse
): CaptureTargetCandidate[] {
  const byId = new Map(localCandidates.map((candidate) => [candidate.id, candidate]));
  const seen = new Set<string>();
  const reranked: CaptureTargetCandidate[] = [];
  for (const item of Array.isArray(response.candidates) ? response.candidates : []) {
    const id = typeof item.id === "string" ? item.id : "";
    const local = byId.get(id);
    if (!local || seen.has(id)) {
      continue;
    }
    seen.add(id);
    reranked.push({
      ...local,
      reason: typeof item.reason === "string" && item.reason.trim()
        ? item.reason.trim().slice(0, 300)
        : local.reason,
      confidence: item.confidence === "strong" || item.confidence === "medium" || item.confidence === "weak"
        ? item.confidence
        : local.confidence,
      score: typeof item.score === "number" && Number.isFinite(item.score) ? item.score : local.score
    });
  }
  return [...reranked, ...localCandidates.filter((candidate) => !seen.has(candidate.id))];
}

function normalizeCapabilities(value: unknown): BackendCapabilities {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Obsidian AI Backend returned an invalid capability response.");
  }
  const record = value as Record<string, unknown>;
  const protocolVersion = String(record.protocolVersion ?? record.protocol_version ?? "").trim();
  if (!protocolVersion) {
    throw new Error("Obsidian AI Backend did not report a protocol version.");
  }
  if (!isSupportedProtocol(protocolVersion)) {
    throw new Error(`Obsidian AI Backend protocol ${protocolVersion} is not compatible with ToWrite protocol 1.`);
  }
  const features = record.features && typeof record.features === "object" && !Array.isArray(record.features)
    ? record.features as Record<string, unknown>
    : record;
  return {
    protocolVersion,
    recommendTargets: features.recommendTargets === true || features.recommend_targets === true,
    suggestHabits: features.suggestHabits === true || features.suggest_habits === true,
    mobileCapture: features.mobileCapture === true || features.mobile_capture === true
  };
}

function isSupportedProtocol(value: unknown): boolean {
  return typeof value === "string" && value.trim().split(".")[0] === "1";
}
