import { ItemView, WorkspaceLeaf } from "obsidian";
import type { SvelteComponent } from "svelte";
import SidebarView from "../ui/SidebarView.svelte";
import DashboardView from "../ui/DashboardView.svelte";
import TodayFloatingView from "../ui/TodayFloatingView.svelte";
import type { DailyDashboardAdapter } from "../ui/daily-dashboard-types";
import type { ToWriteUiApi } from "../ui/api";
import type { WorkflowIndexPayload } from "../workflow";
import { migrateWorkbenchTab, type ToWriteWorkbenchTab } from "../ui/workbench-state";

export const TOWRITE_SIDEBAR_VIEW = "towrite-open-questions-sidebar";
export const TOWRITE_DASHBOARD_VIEW = "towrite-open-questions-dashboard";
export const TOWRITE_TODAY_FLOATING_VIEW = "towrite-open-questions-today-floating";

export interface ToWriteDashboardViewOptions {
  /** Daily services are optional so older installs still open the global Dashboard. */
  dailyApi?: DailyDashboardAdapter;
  /** Must return `files` without a result limit so aggregate matrices stay exact. */
  getFullWorkflowPayload?: () => WorkflowIndexPayload;
  onOpenFloatingToday?: () => void;
}

export interface ToWriteDashboardViewState {
  activeTab: ToWriteWorkbenchTab;
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
    activeTab: "today"
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
    return "ToWrite 工作台";
  }

  getIcon(): string {
    return "layout-dashboard";
  }

  getState(): Record<string, unknown> {
    return { ...this.state };
  }

  async setState(state: unknown): Promise<void> {
    this.state = {
      activeTab: migrateWorkbenchTab(state)
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
        onOpenFloatingToday: this.options.onOpenFloatingToday,
        onActiveTabChange: (activeTab: ToWriteDashboardViewState["activeTab"]) => {
          this.state = { ...this.state, activeTab };
          this.app.workspace.requestSaveLayout();
        }
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
  mode?: "focus" | "list";
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
    return "ToWrite 现在专注";
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
      mode: value?.mode === "list" ? "list" : "focus",
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
        initialMode: this.state.mode ?? "focus",
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
        onModeChange: (mode: "focus" | "list") => {
          this.state = { ...this.state, mode };
          this.app.workspace.requestSaveLayout();
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
