import type { ArticleSummary, OpenQuestion } from "../core/types";
import type { ToWriteSettings } from "../core/settings";
import type { WorkflowIndexPayload } from "../workflow";
import { PushCandidateSource } from "./candidates";
import { quote0TextApiAdapter, type PushAdapterResult } from "./adapters";
import { formatPushFeed } from "./formatter";
import { PushPolicyEngine } from "./policy";
import { PushContextStore, type PushAnchorInput, type PushFeedbackInput } from "./state";
import type { PushCandidate, PushDecision, PushFeedPayload, PushRuntimeState, PushTargetSettings } from "./types";

export interface PushEngineOptions {
  getSettings(): ToWriteSettings;
  getVaultName(): string;
  getQuestions(): OpenQuestion[];
  getArticleSummaries(): ArticleSummary[];
  getWorkflowPayload(): WorkflowIndexPayload;
  getActiveFile(): string | null;
  getState(): PushRuntimeState;
  saveState(): Promise<void>;
}

export interface PushQuote0Delivery extends PushAdapterResult {
  markSent(): Promise<void>;
}

export class PushEngine {
  private readonly source = new PushCandidateSource();
  private readonly policy = new PushPolicyEngine();

  constructor(private readonly options: PushEngineOptions) {}

  getFeed(targetId?: string): PushFeedPayload {
    const settings = this.options.getSettings();
    const target = resolveTarget(settings, targetId);
    const state = this.options.getState();
    const stateStore = new PushContextStore(state);
    const context = stateStore.getCurrentContext();
    const now = new Date();
    const candidates = this.source.build({
      vaultName: this.options.getVaultName(),
      questions: this.options.getQuestions(),
      articles: this.options.getArticleSummaries(),
      workflowPayload: this.options.getWorkflowPayload(),
      publicBaseUrl: settings.externalApi.publicBaseUrl || "",
      token: tokenForTarget(settings, target),
      now: now.toISOString()
    });
    const normalDecision = this.policy.select({
      candidates,
      push: settings.push,
      target,
      context,
      events: stateStore.recentEvents(target.id, now),
      now,
      activeFile: this.options.getActiveFile()
    });
    const decision = this.applyDisplayRotation(normalDecision, candidates, target, state, now);
    return formatPushFeed(decision, {
      privacy: settings.push.privacy,
      context: {
        timeBucket: timeBucket(now),
        placeLabel: context?.placeLabel,
        mode: context?.mode,
        activeFile: context?.activeFile || this.options.getActiveFile() || undefined,
        preciseLocationIncluded: settings.push.privacy.allowPreciseLocation && Boolean(context?.preciseLocation)
      }
    });
  }

  prepareQuote0Delivery(targetId = "quote0"): PushQuote0Delivery {
    const settings = this.options.getSettings();
    const feed = this.getFeed(targetId);
    const result = quote0TextApiAdapter(feed, settings.quote0.taskKey, settings.quote0.taskAlias);
    return {
      ...result,
      markSent: async () => {
        if (!feed.decision.candidateId || !feed.decision.candidateType) {
          return;
        }
        const stateStore = new PushContextStore(this.options.getState());
        stateStore.recordSent({
          targetId: feed.target.id,
          candidateId: feed.decision.candidateId,
          candidateType: feed.decision.candidateType,
          decisionReason: feed.decision.reason,
          score: feed.decision.score
        });
        const state = this.options.getState();
        const current = state.displayCursors[feed.target.id] ?? 0;
        state.displayCursors[feed.target.id] = feed.decision.candidateType === "home-summary" ? 0 : current + 1;
        await this.options.saveState();
      }
    };
  }

  private applyDisplayRotation(
    decision: PushDecision,
    candidates: PushCandidate[],
    target: PushTargetSettings,
    state: PushRuntimeState,
    now: Date
  ): PushDecision {
    if (decision.suppressedReason || decision.candidate?.reminderDue) {
      return decision;
    }

    const home = candidates.find((candidate) => candidate.type === "home-summary");
    if (!home) {
      return decision;
    }

    const wantsHome = target.defaultPage === "home";
    const cursor = state.displayCursors[target.id] ?? 0;
    const rotateHome = target.type === "quote0" && target.defaultPage !== "home" && cursor >= 5;
    if (!wantsHome && !rotateHome) {
      return decision;
    }

    return {
      target,
      candidate: home,
      score: Math.max(decision.score, 1),
      reason: wantsHome ? "home summary target" : "home summary rotation",
      quiet: decision.quiet,
      generatedAt: now.toISOString()
    };
  }

  async recordFeedback(input: PushFeedbackInput): Promise<ReturnType<PushContextStore["recordFeedback"]>> {
    const stateStore = new PushContextStore(this.options.getState());
    const event = stateStore.recordFeedback(input);
    await this.options.saveState();
    return event;
  }

  async recordAnchor(input: PushAnchorInput): Promise<ReturnType<PushContextStore["recordAnchor"]>> {
    const settings = this.options.getSettings();
    const stateStore = new PushContextStore(this.options.getState());
    const anchor = stateStore.recordAnchor(
      input,
      settings.push.privacy.level === "precise-location" && settings.push.privacy.allowPreciseLocation,
      this.options.getActiveFile()
    );
    await this.options.saveState();
    return anchor;
  }
}

function resolveTarget(settings: ToWriteSettings, targetId: string | undefined): PushTargetSettings {
  const targets = settings.push.targets.filter((target) => target.enabled);
  const selected = targetId
    ? settings.push.targets.find((target) => target.id === targetId)
    : targets[0] ?? settings.push.targets[0];
  if (!selected) {
    throw new Error("Push target is missing.");
  }
  return selected;
}

function tokenForTarget(settings: ToWriteSettings, target: PushTargetSettings): string {
  if (target.type === "quote0") {
    return settings.quote0.nfcToken || target.token;
  }
  return target.token || settings.externalApi.token;
}

function timeBucket(now: Date): string {
  const hour = now.getHours();
  if (hour < 6) return "night";
  if (hour < 11) return "morning";
  if (hour < 14) return "noon";
  if (hour < 18) return "afternoon";
  if (hour < 23) return "evening";
  return "night";
}
