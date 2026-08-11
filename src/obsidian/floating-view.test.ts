import { describe, expect, it, vi } from "vitest";
import type { Workspace, WorkspaceLeaf } from "obsidian";
import { openPinnedFloatingView } from "./floating-view";

function leaf() {
  return {
    setPinned: vi.fn(),
    setViewState: vi.fn(async () => undefined)
  } as unknown as WorkspaceLeaf;
}

describe("openPinnedFloatingView", () => {
  it("reveals and pins an existing widget instead of creating another window", async () => {
    const existing = leaf();
    const workspace = {
      getLeavesOfType: vi.fn(() => [existing]),
      revealLeaf: vi.fn(async () => undefined),
      setActiveLeaf: vi.fn(),
      openPopoutLeaf: vi.fn()
    } as unknown as Workspace;

    await expect(openPinnedFloatingView(workspace, {
      viewType: "towrite-today"
    })).resolves.toMatchObject({ created: false, leaf: existing });
    expect(workspace.openPopoutLeaf).not.toHaveBeenCalled();
    expect(existing.setPinned).toHaveBeenCalledWith(true);
  });

  it("creates a pinned pop-out with the compact default size", async () => {
    const created = leaf();
    const workspace = {
      getLeavesOfType: vi.fn(() => []),
      openPopoutLeaf: vi.fn(() => created),
      setActiveLeaf: vi.fn()
    } as unknown as Workspace;

    await expect(openPinnedFloatingView(workspace, {
      viewType: "towrite-today",
      state: { collapsed: false }
    })).resolves.toMatchObject({ created: true, popout: true });
    expect(workspace.openPopoutLeaf).toHaveBeenCalledWith({
      size: { width: 380, height: 520 }
    });
    expect(created.setViewState).toHaveBeenCalledWith({
      type: "towrite-today",
      active: true,
      pinned: true,
      state: { collapsed: false }
    });
    expect(created.setPinned).toHaveBeenCalledWith(true);
  });

  it("moves a main-window dashboard into a real pop-out when requested", async () => {
    const existing = {
      ...leaf(),
      detach: vi.fn(),
      view: { containerEl: { ownerDocument: { defaultView: undefined } } }
    } as unknown as WorkspaceLeaf;
    const created = leaf();
    const workspace = {
      getLeavesOfType: vi.fn(() => [existing]),
      openPopoutLeaf: vi.fn(() => created),
      setActiveLeaf: vi.fn()
    } as unknown as Workspace;

    const result = await openPinnedFloatingView(workspace, {
      viewType: "towrite-dashboard",
      state: { activeTab: "today" },
      preferPopout: true
    });

    expect(result).toMatchObject({ created: true, popout: true, leaf: created });
    expect(existing.detach).toHaveBeenCalledOnce();
    expect(workspace.openPopoutLeaf).toHaveBeenCalledOnce();
  });

  it("falls back to a normal pinned tab when pop-outs are unavailable", async () => {
    const fallback = leaf();
    const workspace = {
      getLeavesOfType: vi.fn(() => []),
      openPopoutLeaf: vi.fn(() => {
        throw new Error("unsupported");
      }),
      getLeaf: vi.fn(() => fallback),
      setActiveLeaf: vi.fn()
    } as unknown as Workspace;

    const result = await openPinnedFloatingView(workspace, {
      viewType: "towrite-today"
    });
    expect(result).toMatchObject({ created: true, popout: false });
    expect(result.popoutError).toBeInstanceOf(Error);
    expect(workspace.getLeaf).toHaveBeenCalledWith("tab");
    expect(fallback.setPinned).toHaveBeenCalledWith(true);
  });
});
