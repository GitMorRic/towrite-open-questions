import type { HubDeviceState } from "../hub";
import type { TapSelectionReference, TapSelectionSnapshot } from "./types";

export interface LocalTapSelectionServiceOptions {
  createSnapshot(reference: TapSelectionReference): Promise<TapSelectionSnapshot>;
  getFallbackLocalId(): string | undefined;
  validateSnapshot?(snapshot: TapSelectionSnapshot): Promise<void>;
  onStateChanged?(): void;
}

export interface LocalTapSelectionState {
  localSnapshot?: TapSelectionSnapshot;
  contentSnapshots: Array<{ contentId: string; snapshot: TapSelectionSnapshot }>;
}

/**
 * Keeps the local write target paired with the content selected for a device.
 * Resolution intentionally prefers the last display ACK over desired state so
 * a phone tap cannot open content different from what is visible on the screen.
 */
export class LocalTapSelectionService {
  private hubState?: HubDeviceState;
  private localSnapshot?: TapSelectionSnapshot;
  private readonly contentSnapshots = new Map<string, TapSelectionSnapshot>();

  constructor(private readonly options: LocalTapSelectionServiceOptions) {}

  async selectLocal(localId: string): Promise<TapSelectionSnapshot> {
    const snapshot = await this.options.createSnapshot({ source: "local", localId });
    this.localSnapshot = clone(snapshot);
    this.options.onStateChanged?.();
    return clone(snapshot);
  }

  async rememberHubSelection(localId: string, state: HubDeviceState): Promise<void> {
    this.hubState = clone(state);
    const selected = state.selected;
    if (selected) {
      const snapshot = await this.options.createSnapshot({
        source: "selected",
        localId,
        contentId: selected.selectedContentId,
        card: selected.card
      });
      this.contentSnapshots.set(selected.selectedContentId, clone(snapshot));
      this.localSnapshot = clone(snapshot);
    }
    const displayed = state.displayed;
    if (displayed && displayed.contentId === selected?.selectedContentId) {
      const selectedSnapshot = this.contentSnapshots.get(displayed.contentId);
      if (selectedSnapshot) {
        this.contentSnapshots.set(displayed.contentId, {
          ...clone(selectedSnapshot),
          source: "displayed",
          sourceContentId: displayed.contentId
        });
      }
    }
    this.trimContentSnapshots();
    this.options.onStateChanged?.();
  }

  async rememberHubStateMappings(
    state: HubDeviceState,
    mappings: { selectedLocalId?: string; displayedLocalId?: string }
  ): Promise<void> {
    if (hubStateVersion(state) < hubStateVersion(this.hubState)) return;
    this.hubState = clone(state);
    let changed = false;
    if (state.selected && mappings.selectedLocalId) {
      const existing = this.contentSnapshots.get(state.selected.selectedContentId);
      if (!existing || existing.localId !== mappings.selectedLocalId) {
        const snapshot = await this.options.createSnapshot({
          source: "selected",
          localId: mappings.selectedLocalId,
          contentId: state.selected.selectedContentId,
          card: state.selected.card
        });
        this.contentSnapshots.set(state.selected.selectedContentId, clone(snapshot));
        this.localSnapshot = clone(snapshot);
        changed = true;
      }
    }
    if (state.displayed && mappings.displayedLocalId) {
      const existing = this.contentSnapshots.get(state.displayed.contentId);
      if (!existing || existing.localId !== mappings.displayedLocalId) {
        const snapshot = await this.options.createSnapshot({
          source: "displayed",
          localId: mappings.displayedLocalId,
          contentId: state.displayed.contentId,
          card: state.displayed.card
        });
        this.contentSnapshots.set(state.displayed.contentId, clone(snapshot));
        changed = true;
      }
    }
    this.trimContentSnapshots();
    if (changed) this.options.onStateChanged?.();
  }

  recordHubState(state: HubDeviceState): void {
    if (hubStateVersion(state) < hubStateVersion(this.hubState)) return;
    this.hubState = clone(state);
  }

  async resolve(): Promise<TapSelectionSnapshot> {
    const displayed = this.hubState?.displayed;
    if (displayed) {
      const remembered = this.contentSnapshots.get(displayed.contentId);
      if (remembered) {
        await this.options.validateSnapshot?.(remembered);
        return { ...clone(remembered), source: "displayed", sourceContentId: displayed.contentId };
      }
      return this.options.createSnapshot({
        source: "displayed",
        contentId: displayed.contentId,
        card: displayed.card
      });
    }

    const selected = this.hubState?.selected;
    if (selected) {
      const remembered = this.contentSnapshots.get(selected.selectedContentId);
      if (remembered) {
        await this.options.validateSnapshot?.(remembered);
        return { ...clone(remembered), source: "selected", sourceContentId: selected.selectedContentId };
      }
      return this.options.createSnapshot({
        source: "selected",
        contentId: selected.selectedContentId,
        card: selected.card
      });
    }

    if (this.localSnapshot) {
      await this.options.validateSnapshot?.(this.localSnapshot);
      return clone(this.localSnapshot);
    }
    const fallbackLocalId = this.options.getFallbackLocalId();
    if (!fallbackLocalId) {
      throw new Error("No local Capture selection is available.");
    }
    return this.selectLocal(fallbackLocalId);
  }

  clear(): void {
    this.hubState = undefined;
    this.localSnapshot = undefined;
    this.contentSnapshots.clear();
    this.options.onStateChanged?.();
  }

  serialize(): LocalTapSelectionState {
    return {
      localSnapshot: this.localSnapshot ? clone(this.localSnapshot) : undefined,
      contentSnapshots: [...this.contentSnapshots.entries()].map(([contentId, snapshot]) => ({
        contentId,
        snapshot: clone(snapshot)
      }))
    };
  }

  restore(value: LocalTapSelectionState | undefined): void {
    this.localSnapshot = isSnapshot(value?.localSnapshot) ? clone(value.localSnapshot) : undefined;
    this.contentSnapshots.clear();
    const items = Array.isArray(value?.contentSnapshots) ? value.contentSnapshots : [];
    for (const item of items) {
      if (item && typeof item === "object" && /^cnt_[A-Za-z0-9_-]+$/u.test(String(item.contentId)) && isSnapshot(item.snapshot)) {
        this.contentSnapshots.set(item.contentId, clone(item.snapshot));
      }
    }
    this.trimContentSnapshots();
  }

  private trimContentSnapshots(): void {
    while (this.contentSnapshots.size > 100) {
      const oldest = this.contentSnapshots.keys().next().value as string | undefined;
      if (!oldest) break;
      this.contentSnapshots.delete(oldest);
    }
  }
}

function isSnapshot(value: unknown): value is TapSelectionSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<TapSelectionSnapshot>;
  return snapshot.protocolVersion === "towrite-capture-bridge/v1"
    && typeof snapshot.snapshotId === "string"
    && typeof snapshot.createdAt === "string"
    && typeof snapshot.localId === "string"
    && typeof snapshot.candidate === "object"
    && typeof snapshot.candidate?.path === "string"
    && (snapshot.candidate?.action === "append" || snapshot.candidate?.action === "create");
}

function clone<T>(value: T): T {
  return typeof globalThis.structuredClone === "function"
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

function hubStateVersion(state: HubDeviceState | undefined): number {
  return Math.max(state?.selected?.stateVersion ?? 0, state?.displayed?.stateVersion ?? 0);
}
