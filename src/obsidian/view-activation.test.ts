import type { Workspace, WorkspaceLeaf } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { activateWorkspaceView } from "./view-activation";

function leaf(setViewState = vi.fn(async () => undefined)): WorkspaceLeaf {
  return {
    setViewState,
    detach: vi.fn()
  } as unknown as WorkspaceLeaf;
}

function workspace(overrides: Record<string, unknown> = {}): Workspace {
  return {
    layoutReady: true,
    getLeavesOfType: vi.fn(() => []),
    getLeaf: vi.fn(() => leaf()),
    ensureSideLeaf: vi.fn(async () => leaf()),
    revealLeaf: vi.fn(async () => undefined),
    setActiveLeaf: vi.fn(),
    onLayoutReady: vi.fn(),
    ...overrides
  } as unknown as Workspace;
}

describe("workspace view activation", () => {
  it("waits for layout restoration before creating a view", async () => {
    let ready: (() => void) | undefined;
    const created = leaf();
    const host = workspace({
      layoutReady: false,
      onLayoutReady: vi.fn((callback: () => void) => {
        ready = callback;
      }),
      getLeaf: vi.fn(() => created)
    });

    const pending = activateWorkspaceView(host, {
      type: "towrite-dashboard",
      location: "tab",
      state: { activeTab: "today" }
    });
    expect(host.getLeaf).not.toHaveBeenCalled();
    ready?.();
    await pending;
    expect(created.setViewState).toHaveBeenCalledWith(expect.objectContaining({
      type: "towrite-dashboard",
      state: { activeTab: "today" }
    }));
  });

  it("reconfigures, reveals and focuses an existing leaf", async () => {
    const existing = leaf();
    const host = workspace({ getLeavesOfType: vi.fn(() => [existing]) });

    await activateWorkspaceView(host, {
      type: "towrite-dashboard",
      location: "tab",
      state: { activeTab: "pool" }
    });

    expect(existing.setViewState).toHaveBeenCalled();
    expect(host.revealLeaf).toHaveBeenCalledWith(existing);
    expect(host.setActiveLeaf).toHaveBeenCalledWith(existing, { focus: true });
  });

  it("retries a stale restored leaf with a fresh tab", async () => {
    const stale = leaf(vi.fn(async () => {
      throw new Error("stale leaf");
    }));
    const replacement = leaf();
    const host = workspace({
      getLeavesOfType: vi.fn(() => [stale]),
      getLeaf: vi.fn(() => replacement)
    });

    await activateWorkspaceView(host, {
      type: "towrite-dashboard",
      location: "tab"
    });

    expect(stale.detach).toHaveBeenCalledOnce();
    expect(replacement.setViewState).toHaveBeenCalled();
  });

  it("uses Obsidian's side-leaf API when opening the questions sidebar", async () => {
    const sidebar = leaf();
    const host = workspace({ ensureSideLeaf: vi.fn(async () => sidebar) });

    await activateWorkspaceView(host, {
      type: "towrite-sidebar",
      location: "right"
    });

    expect(host.ensureSideLeaf).toHaveBeenCalledWith("towrite-sidebar", "right", expect.objectContaining({ active: true }));
    expect(host.revealLeaf).toHaveBeenCalledWith(sidebar);
  });
});
