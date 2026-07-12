import type { ToWriteBackendSettings } from "../core/settings";
import type { BackendCapabilities, CaptureDraft, CaptureTargetCandidate } from "../capture/types";

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

export interface BackendHabitSuggestionResponse<T = unknown> {
  protocolVersion: string;
  suggestions: T[];
}

export class BackendEnhancementClient {
  constructor(private readonly getSettings: () => ToWriteBackendSettings) {}

  async getCapabilities(): Promise<BackendCapabilities> {
    const settings = this.requireEnabledSettings();
    const payload = await this.requestJson("/capture/integrations/towrite/v1/capabilities", {
      method: "GET"
    }, settings);
    return normalizeCapabilities(payload);
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

  private async requestJson(path: string, init: RequestInit, settings: ToWriteBackendSettings): Promise<unknown> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), settings.timeoutMs);
    try {
      const response = await fetch(`${settings.baseUrl.replace(/\/+$/u, "")}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          ...(init.headers ?? {}),
          ...(settings.token ? { "X-Capture-Token": settings.token } : {})
        }
      });
      if (!response.ok) {
        throw new Error(`Obsidian AI Backend returned HTTP ${response.status}.`);
      }
      return await response.json() as unknown;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(`Obsidian AI Backend timed out after ${settings.timeoutMs}ms.`);
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }
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
