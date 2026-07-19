import { DebouncedActivityReporter, type HubActivityContext } from "./activity";
import type { HubClientLike } from "./client";
import { buildPrivateCandidateBatch, type LocalHubCandidate } from "./privacy";
import type {
  HubCandidate,
  HubCapabilities,
  HubContextState,
  HubDeviceState,
  HubFeedbackAction
} from "./types";

export interface DeviceHubConnectorSettings {
  enabled: boolean;
  receiverId: string;
  deviceId: string;
  referenceSecret: string;
  autoSelect: boolean;
}

export interface DeviceHubConnectorOptions {
  client: HubClientLike;
  getSettings(): DeviceHubConnectorSettings;
  getCandidates(): readonly LocalHubCandidate[] | Promise<readonly LocalHubCandidate[]>;
  /** Optional trusted-Backend rerank. Only order, score and explanation survive the local whitelist gate. */
  enhanceCandidates?(candidates: readonly HubCandidate[]): Promise<readonly HubCandidate[]>;
  onState?(state: HubDeviceState): void;
  onError?(error: unknown): void;
  now?: () => Date;
  activityDebounceMs?: number;
}

/**
 * Background coordinator for the Obsidian connector. Editor callbacks only
 * call `recordEditPresence`, which mutates memory and arms a debounce timer.
 */
export class DeviceHubConnector {
  private readonly activity: DebouncedActivityReporter;
  private readonly now: () => Date;
  private currentState: HubDeviceState | undefined;
  private syncPromise: Promise<HubDeviceState | undefined> | undefined;

  constructor(private readonly options: DeviceHubConnectorOptions) {
    this.now = options.now ?? (() => new Date());
    this.activity = new DebouncedActivityReporter(
      async (observations) => {
        if (!this.isConfigured()) {
          return;
        }
        await this.options.client.submitContextObservations(observations);
      },
      {
        debounceMs: options.activityDebounceMs ?? 1_500,
        onError: options.onError,
        now: this.now
      }
    );
  }

  getState(): HubDeviceState | undefined {
    return this.currentState ? structuredCloneSafe(this.currentState) : undefined;
  }

  isConfigured(): boolean {
    const settings = this.options.getSettings();
    return settings.enabled
      && Boolean(settings.receiverId.trim())
      && Boolean(settings.deviceId.trim())
      && settings.referenceSecret.trim().length >= 16;
  }

  async testConnection(): Promise<HubCapabilities> {
    const capabilities = await this.options.client.getCapabilities();
    if (!capabilities.candidateBatches || !capabilities.deviceState) {
      throw new Error("Device Hub does not advertise the required V1 capabilities.");
    }
    return capabilities;
  }

  async sync(): Promise<HubDeviceState | undefined> {
    if (this.syncPromise) {
      return this.syncPromise;
    }
    this.syncPromise = this.performSync().finally(() => {
      this.syncPromise = undefined;
    });
    return this.syncPromise;
  }

  async refreshState(): Promise<HubDeviceState | undefined> {
    if (!this.isConfigured()) {
      return undefined;
    }
    const state = await this.options.client.getDeviceState(this.options.getSettings().deviceId.trim());
    this.setState(state);
    return state;
  }

  recordEditPresence(context: HubActivityContext = {}): void {
    if (!this.isConfigured()) {
      return;
    }
    this.activity.recordEditPresence({
      ...context,
      receiverId: this.options.getSettings().receiverId.trim()
    });
  }

  async setManualContext(state: HubContextState, placeLabel = ""): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error("Device Hub is not fully configured.");
    }
    const settings = this.options.getSettings();
    const now = this.now();
    await this.options.client.submitContextObservations([{
      observationId: opaqueEventId("obs"),
      source: "manual",
      state,
      confidence: 1,
      observedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60 * 60_000).toISOString(),
      placeLabel: cleanSemanticLabel(placeLabel),
      receiverId: settings.receiverId.trim(),
      deviceId: settings.deviceId.trim()
    }]);
  }

  async sendFeedback(action: HubFeedbackAction): Promise<void> {
    const selectionId = this.currentState?.selected?.selectionId;
    if (!selectionId) {
      throw new Error("Device Hub has no selected content to update.");
    }
    await this.options.client.submitFeedback(selectionId, {
      action,
      eventId: opaqueEventId("evt"),
      at: this.now().toISOString()
    });
    await this.refreshState();
  }

  flushActivity(): Promise<void> {
    return this.activity.flushNow();
  }

  dispose(): void {
    this.activity.dispose();
  }

  private async performSync(): Promise<HubDeviceState | undefined> {
    if (!this.isConfigured()) {
      return undefined;
    }
    const settings = this.options.getSettings();
    const localCandidates = await this.options.getCandidates();
    const batch = await buildPrivateCandidateBatch(localCandidates, {
      referenceSecret: settings.referenceSecret,
      deviceId: settings.deviceId.trim(),
      autoSelect: settings.autoSelect,
      policyVersion: "towrite-rules-v1",
      modelVersion: "local-rules"
    });
    if (batch.candidates.length > 0 && this.options.enhanceCandidates) {
      try {
        const enhanced = await this.options.enhanceCandidates(batch.candidates);
        batch.candidates = applyWhitelistedEnhancement(batch.candidates, enhanced);
        batch.modelVersion = "backend-whitelist-v1";
      } catch (error) {
        // Offline, timeout and incompatible Backend responses retain the exact
        // local batch. Device sync must never depend on AI availability.
        this.options.onError?.(error);
      }
    }
    if (batch.candidates.length > 0) {
      await this.options.client.submitCandidateBatch(settings.receiverId.trim(), batch);
    }
    return this.refreshState();
  }

  private setState(state: HubDeviceState): void {
    this.currentState = state;
    this.options.onState?.(structuredCloneSafe(state));
  }
}

export function applyWhitelistedEnhancement(
  local: readonly HubCandidate[],
  enhanced: readonly HubCandidate[]
): HubCandidate[] {
  const byRef = new Map(local.map((candidate) => [candidate.candidateRef, candidate]));
  const seen = new Set<string>();
  const output: HubCandidate[] = [];
  for (const candidate of enhanced) {
    const original = byRef.get(candidate.candidateRef);
    if (!original || seen.has(candidate.candidateRef)) {
      continue;
    }
    seen.add(candidate.candidateRef);
    output.push({
      ...original,
      reasonCode: typeof candidate.reasonCode === "string" && candidate.reasonCode.trim()
        ? candidate.reasonCode.trim().slice(0, 240)
        : original.reasonCode,
      score: Number.isFinite(candidate.score) ? candidate.score : original.score
    });
  }
  output.push(...local.filter((candidate) => !seen.has(candidate.candidateRef)));
  return output;
}

function cleanSemanticLabel(value: string): string | undefined {
  const label = value.replace(/[\u0000-\u001f\u007f]/gu, "").trim().slice(0, 80);
  return label || undefined;
}

function opaqueEventId(prefix: "obs" | "evt"): string {
  const uuid = globalThis.crypto?.randomUUID?.().replace(/-/gu, "");
  if (uuid) {
    return `${prefix}_${uuid}`;
  }
  const bytes = globalThis.crypto?.getRandomValues(new Uint8Array(16));
  if (!bytes) {
    throw new Error("Secure randomness is unavailable for Device Hub events.");
  }
  return `${prefix}_${[...bytes].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function structuredCloneSafe<T>(value: T): T {
  return typeof globalThis.structuredClone === "function"
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}
