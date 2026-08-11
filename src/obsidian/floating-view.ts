import type { Workspace, WorkspaceLeaf } from "obsidian";

export interface OpenPinnedFloatingViewOptions {
  viewType: string;
  state?: Record<string, unknown>;
  width?: number;
  height?: number;
  /** Move an existing main-window leaf into a real Obsidian pop-out. */
  preferPopout?: boolean;
}

export interface OpenPinnedFloatingViewResult {
  leaf: WorkspaceLeaf;
  created: boolean;
  popout: boolean;
  popoutError?: unknown;
}

/**
 * Reuses a single view, otherwise creates an official Obsidian pop-out. Pinning
 * locks the leaf against replacement; it is intentionally not described as an
 * operating-system always-on-top flag.
 */
export async function openPinnedFloatingView(
  workspace: Workspace,
  options: OpenPinnedFloatingViewOptions
): Promise<OpenPinnedFloatingViewResult> {
  let existing: WorkspaceLeaf | undefined = workspace.getLeavesOfType(options.viewType)[0];
  if (existing && options.preferPopout) {
    const ownerWindow = existing.view?.containerEl?.ownerDocument?.defaultView;
    if (!ownerWindow || ownerWindow === window) {
      existing.detach();
      existing = undefined;
    }
  }
  if (existing) {
    await workspace.revealLeaf(existing);
    existing.setPinned(true);
    workspace.setActiveLeaf(existing, { focus: true });
    return { leaf: existing, created: false, popout: true };
  }

  let leaf: WorkspaceLeaf;
  let popout = true;
  let popoutError: unknown;
  try {
    leaf = workspace.openPopoutLeaf({
      size: {
        width: options.width ?? 380,
        height: options.height ?? 520
      }
    });
  } catch (error) {
    popout = false;
    popoutError = error;
    leaf = workspace.getLeaf("tab");
  }
  await leaf.setViewState({
    type: options.viewType,
    active: true,
    pinned: true,
    state: options.state ?? {}
  });
  leaf.setPinned(true);
  workspace.setActiveLeaf(leaf, { focus: true });
  return { leaf, created: true, popout, popoutError };
}
