import type { ViewState, Workspace, WorkspaceLeaf } from "obsidian";

export interface WorkspaceViewActivation {
  type: string;
  state?: Record<string, unknown>;
  location: "right" | "tab";
  focus?: boolean;
}

/**
 * Opens a plugin view only after Obsidian has restored the workspace layout.
 * A stale restored leaf is discarded and retried once, which prevents Ribbon
 * and command-palette clicks from failing silently after plugin reloads.
 */
export async function activateWorkspaceView(
  workspace: Workspace,
  activation: WorkspaceViewActivation
): Promise<WorkspaceLeaf> {
  await waitForLayout(workspace);

  const existing = workspace.getLeavesOfType(activation.type)[0];
  if (existing) {
    try {
      return await configureAndReveal(workspace, existing, activation);
    } catch {
      existing.detach();
    }
  }

  const leaf = activation.location === "right"
    ? await workspace.ensureSideLeaf(activation.type, "right", {
        active: true,
        reveal: false,
        state: activation.state
      })
    : workspace.getLeaf("tab");
  return configureAndReveal(workspace, leaf, activation);
}

async function configureAndReveal(
  workspace: Workspace,
  leaf: WorkspaceLeaf,
  activation: WorkspaceViewActivation
): Promise<WorkspaceLeaf> {
  const viewState: ViewState = {
    type: activation.type,
    active: true,
    state: activation.state
  };
  await leaf.setViewState(viewState);
  await workspace.revealLeaf(leaf);
  if (activation.focus !== false) {
    workspace.setActiveLeaf(leaf, { focus: true });
  }
  return leaf;
}

function waitForLayout(workspace: Workspace): Promise<void> {
  if (workspace.layoutReady) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    workspace.onLayoutReady(resolve);
  });
}
