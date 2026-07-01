import { ItemView, WorkspaceLeaf } from "obsidian";
import type { SvelteComponent } from "svelte";
import SidebarView from "../ui/SidebarView.svelte";
import DashboardView from "../ui/DashboardView.svelte";
import type { ToWriteUiApi } from "../ui/api";

export const TOWRITE_SIDEBAR_VIEW = "towrite-open-questions-sidebar";
export const TOWRITE_DASHBOARD_VIEW = "towrite-open-questions-dashboard";

export class ToWriteSidebarItemView extends ItemView {
  private component?: SvelteComponent;

  constructor(leaf: WorkspaceLeaf, private readonly api: ToWriteUiApi) {
    super(leaf);
  }

  getViewType(): string {
    return TOWRITE_SIDEBAR_VIEW;
  }

  getDisplayText(): string {
    return "ToWrite Open Questions";
  }

  getIcon(): string {
    return "circle-help";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("towrite-view-host");
    this.component = new SidebarView({
      target: this.contentEl,
      props: { api: this.api }
    });
  }

  async onClose(): Promise<void> {
    this.component?.$destroy();
    this.component = undefined;
  }
}

export class ToWriteDashboardItemView extends ItemView {
  private component?: SvelteComponent;

  constructor(leaf: WorkspaceLeaf, private readonly api: ToWriteUiApi) {
    super(leaf);
  }

  getViewType(): string {
    return TOWRITE_DASHBOARD_VIEW;
  }

  getDisplayText(): string {
    return "ToWrite Dashboard";
  }

  getIcon(): string {
    return "layout-dashboard";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("towrite-view-host");
    this.component = new DashboardView({
      target: this.contentEl,
      props: { api: this.api }
    });
  }

  async onClose(): Promise<void> {
    this.component?.$destroy();
    this.component = undefined;
  }
}
