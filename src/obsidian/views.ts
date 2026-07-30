import { ItemView, WorkspaceLeaf } from "obsidian";
import type { SvelteComponent } from "svelte";
import SidebarView from "../ui/SidebarView.svelte";
import DashboardView from "../ui/DashboardView.svelte";
import TodayFloatingView from "../ui/TodayFloatingView.svelte";
import type { DailyDashboardAdapter } from "../ui/daily-dashboard-types";
import type { ToWriteUiApi } from "../ui/api";
import type { WorkflowIndexPayload } from "../workflow";

export const TOWRITE_SIDEBAR_VIEW = "towrite-open-questions-sidebar";
export const TOWRITE_DASHBOARD_VIEW = "towrite-open-questions-dashboard";
export const TOWRITE_TODAY_FLOATING_VIEW = "towrite-open-questions-today-floating";

export interface ToWriteDashboardViewOptions {
  /** Daily services are optional so older installs still open the global Dashboard. */
  dailyApi?: DailyDashboardAdapter;
  /** Must return `files` without a result limit so aggregate matrices stay exact. */
  getFullWorkflowPayload?: () => WorkflowIndexPayload;
}

export interface ToWriteDashboardViewState {
  activeTab: "today" | "all";
  dailySurface: "today" | "pool" | "review";
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
  private state: ToWriteDashboardViewState = {
    activeTab: "today",
    dailySurface: "today"
  };

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

  getState(): Record<string, unknown> {
    return { ...this.state };
  }

  async setState(state: unknown): Promise<void> {
    const next = state as Partial<ToWriteDashboardViewState> | null;
    this.state = {
      activeTab: next?.activeTab === "all" ? "all" : "today",
      dailySurface: next?.dailySurface === "pool" || next?.dailySurface === "review"
        ? next.dailySurface
        : "today"
    };
    this.mount();
  }

  async onOpen(): Promise<void> {
    this.mount();
  }

  private mount(): void {
    this.component?.$destroy();
    this.contentEl.empty();
    this.contentEl.addClass("towrite-view-host");
    this.component = new DashboardView({
      target: this.contentEl,
      props: {
        api: this.api,
        dailyApi: this.options.dailyApi,
        getFullWorkflowPayload: this.options.getFullWorkflowPayload,
        initialTab: this.state.activeTab,
        initialDailySurface: this.state.dailySurface
      }
    });
  }

  async onClose(): Promise<void> {
    this.component?.$destroy();
    this.component = undefined;
  }
}

export interface ToWriteTodayFloatingViewOptions {
  dailyApi: DailyDashboardAdapter;
  onOpenDashboard?: () => void;
  onOpenTaskPool?: () => void;
}

interface TodayFloatingViewState {
  collapsed: boolean;
  surface?: "today" | "pool";
  expandedWidth?: number;
  expandedHeight?: number;
}

export class ToWriteTodayFloatingItemView extends ItemView {
  private component?: SvelteComponent;
  private state: TodayFloatingViewState = { collapsed: false };
  private pinned = true;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly options: ToWriteTodayFloatingViewOptions
  ) {
    super(leaf);
    this.pinned = Boolean(leaf.getViewState().pinned ?? true);
    this.registerEvent(leaf.on("pinned-change", (pinned) => {
      this.pinned = pinned;
      this.mount();
    }));
  }

  getViewType(): string {
    return TOWRITE_TODAY_FLOATING_VIEW;
  }

  getDisplayText(): string {
    return "ToWrite Today";
  }

  getIcon(): string {
    return "calendar-check";
  }

  getState(): Record<string, unknown> {
    return { ...this.state };
  }

  async setState(state: unknown): Promise<void> {
    const value = state as Partial<TodayFloatingViewState> | null;
    this.state = {
      collapsed: Boolean(value?.collapsed),
      surface: value?.surface === "pool" ? "pool" : "today",
      expandedWidth: finiteWindowSize(value?.expandedWidth),
      expandedHeight: finiteWindowSize(value?.expandedHeight)
    };
    this.mount();
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("towrite-today-floating-host");
    this.mount();
  }

  async onClose(): Promise<void> {
    this.component?.$destroy();
    this.component = undefined;
  }

  private mount(): void {
    this.component?.$destroy();
    this.contentEl.empty();
    this.contentEl.addClass("towrite-today-floating-host");
    this.component = new TodayFloatingView({
      target: this.contentEl,
      props: {
        dailyApi: this.options.dailyApi,
        initialCollapsed: this.state.collapsed,
        initialPinned: this.pinned,
        initialSurface: this.state.surface ?? "today",
        onCollapsedChange: (collapsed: boolean) => {
          this.resizePopout(collapsed);
          this.state = { ...this.state, collapsed };
          this.app.workspace.requestSaveLayout();
        },
        onPinnedChange: (pinned: boolean) => {
          this.pinned = pinned;
          this.leaf.setPinned(pinned);
          this.app.workspace.requestSaveLayout();
        },
        onSurfaceChange: (surface: "today" | "pool") => {
          this.state = { ...this.state, surface };
          // Do not request an immediate layout save here. Some Obsidian
          // versions replay the previous leaf state while saving a Pop-out,
          // which remounts the Svelte view and makes the tab appear inert.
        },
        onOpenDashboard: this.options.onOpenDashboard,
        onOpenTaskPool: this.options.onOpenTaskPool
      }
    });
  }

  private resizePopout(collapsed: boolean): void {
    const viewWindow = this.contentEl.ownerDocument.defaultView;
    if (!viewWindow || (typeof window !== "undefined" && viewWindow === window)) return;
    try {
      if (collapsed) {
        this.state = {
          ...this.state,
          expandedWidth: Math.max(320, viewWindow.outerWidth),
          expandedHeight: Math.max(360, viewWindow.outerHeight)
        };
        viewWindow.resizeTo(Math.max(320, viewWindow.outerWidth), 132);
        return;
      }
      viewWindow.resizeTo(
        this.state.expandedWidth ?? Math.max(320, viewWindow.outerWidth),
        this.state.expandedHeight ?? 520
      );
    } catch {
      // Some window managers deny programmatic resizing; content still folds.
    }
  }
}

function finiteWindowSize(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}
