import { ItemView, WorkspaceLeaf } from "obsidian";
import type { SvelteComponent } from "svelte";
import SidebarView from "../ui/SidebarView.svelte";
import DashboardView from "../ui/DashboardView.svelte";
import type { DailyDashboardAdapter } from "../ui/daily-dashboard-types";
import type { ToWriteUiApi } from "../ui/api";
import type { WorkflowIndexPayload } from "../workflow";

export const TOWRITE_SIDEBAR_VIEW = "towrite-open-questions-sidebar";
export const TOWRITE_DASHBOARD_VIEW = "towrite-open-questions-dashboard";

export interface ToWriteDashboardViewOptions {
  /** Daily services are optional so older installs still open the global Dashboard. */
  dailyApi?: DailyDashboardAdapter;
  /** Must return `files` without a result limit so aggregate matrices stay exact. */
  getFullWorkflowPayload?: () => WorkflowIndexPayload;
}

export interface ToWriteSidebarViewOptions {
  dailyApi?: DailyDashboardAdapter;
  onOpenDashboard?: () => void;
}

export class ToWriteSidebarItemView extends ItemView {
  private component?: SvelteComponent;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly api: ToWriteUiApi,
    private readonly options: ToWriteSidebarViewOptions = {}
  ) {
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
      props: {
        api: this.api,
        dailyApi: this.options.dailyApi,
        onOpenDashboard: this.options.onOpenDashboard
      }
    });
  }

  async onClose(): Promise<void> {
    this.component?.$destroy();
    this.component = undefined;
  }
}

export class ToWriteDashboardItemView extends ItemView {
  private component?: SvelteComponent;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly api: ToWriteUiApi,
    private readonly options: ToWriteDashboardViewOptions = {}
  ) {
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
      props: {
        api: this.api,
        dailyApi: this.options.dailyApi,
        getFullWorkflowPayload: this.options.getFullWorkflowPayload
      }
    });
  }

  async onClose(): Promise<void> {
    this.component?.$destroy();
    this.component = undefined;
  }
}
