import type { WorkflowIndexPayload } from "../workflow";
import type { PushDisplayCard } from "../push/types";
import type { Quote0CanvasElement, Quote0CanvasPayload } from "./client";

export interface Quote0DashboardCanvasOptions {
  link?: string;
  taskAlias?: string;
  border?: 0 | 1;
  layout?: Quote0DashboardCanvasLayout;
  screenWidth?: number;
  screenHeight?: number;
}

export type Quote0DashboardCanvasLayout = "classic-27" | "wide-low";

interface DashboardData extends Record<string, unknown> {
  layoutProfile: Quote0DashboardCanvasLayout;
  screenWidth: number;
  screenHeight: number;
  title: string;
  subtitle: string;
  summary: string;
  think: string;
  write: string;
  open: string;
  articles: string;
  due: string;
  workflow: string;
  stale: string;
  stage0: string;
  stage1: string;
  stage2: string;
  stage3: string;
  stage4: string;
  footerLeft: string;
  footerCenter: string;
  footerRight: string;
}

interface MetricSet {
  think: string;
  write: string;
  open: string;
  articles: string;
  due: string;
  stale: string;
  workflow: string;
}

interface DashboardCanvasLayoutSpec {
  profile: Quote0DashboardCanvasLayout;
  screenWidth: number;
  screenHeight: number;
  outerPaddingTw: string;
  rootGap: string;
  headerRowGap: string;
  titleFontSize: string;
  titleLineHeight: string;
  subtitleFontSize: string;
  subtitleLineHeight: string;
  summaryFontSize: string;
  summaryLineHeight: string;
  ruleHeight: string;
  ruleMarginTop: string;
  metricHeight: string;
  metricValueFontSize: string;
  metricValueLineHeight: string;
  metricLabelFontSize: string;
  metricLabelLineHeight: string;
  metricRadius: string;
  workflowHeight: string;
  workflowTitleFontSize: string;
  workflowTitleLineHeight: string;
  workflowTitlePaddingLeft: string;
  workflowTitlePaddingTop: string;
  stageGridPadding: string;
  stageGridGap: string;
  stagePairGap: string;
  stageStripeWidth: string;
  stageFontSize: string;
  stageLineHeight: string;
  stageHeight: string;
  stagePaddingLeft: string;
  footerHeight: string;
  footerGap: string;
  navArrowWidth: string;
  navHomeWidth: string;
  navFontSize: string;
  navLineHeight: string;
  navRadius: string;
  spacerMarginTop: string;
}

const CLASSIC_27_LAYOUT: DashboardCanvasLayoutSpec = {
  profile: "classic-27",
  screenWidth: 264,
  screenHeight: 176,
  outerPaddingTw: "p-[8px]",
  rootGap: "4px",
  headerRowGap: "6px",
  titleFontSize: "20px",
  titleLineHeight: "22px",
  subtitleFontSize: "11px",
  subtitleLineHeight: "14px",
  summaryFontSize: "10px",
  summaryLineHeight: "12px",
  ruleHeight: "2px",
  ruleMarginTop: "2px",
  metricHeight: "25px",
  metricValueFontSize: "15px",
  metricValueLineHeight: "15px",
  metricLabelFontSize: "7px",
  metricLabelLineHeight: "8px",
  metricRadius: "3px",
  workflowHeight: "56px",
  workflowTitleFontSize: "13px",
  workflowTitleLineHeight: "14px",
  workflowTitlePaddingLeft: "5px",
  workflowTitlePaddingTop: "2px",
  stageGridPadding: "1px 5px 4px",
  stageGridGap: "1px",
  stagePairGap: "4px",
  stageStripeWidth: "3px",
  stageFontSize: "10px",
  stageLineHeight: "12px",
  stageHeight: "12px",
  stagePaddingLeft: "4px",
  footerHeight: "17px",
  footerGap: "4px",
  navArrowWidth: "42px",
  navHomeWidth: "70px",
  navFontSize: "9px",
  navLineHeight: "11px",
  navRadius: "3px",
  spacerMarginTop: "1px"
};

const WIDE_LOW_LAYOUT: DashboardCanvasLayoutSpec = {
  profile: "wide-low",
  screenWidth: 296,
  screenHeight: 128,
  outerPaddingTw: "p-[4px]",
  rootGap: "3px",
  headerRowGap: "6px",
  titleFontSize: "22px",
  titleLineHeight: "23px",
  subtitleFontSize: "11px",
  subtitleLineHeight: "12px",
  summaryFontSize: "10px",
  summaryLineHeight: "11px",
  ruleHeight: "2px",
  ruleMarginTop: "1px",
  metricHeight: "31px",
  metricValueFontSize: "18px",
  metricValueLineHeight: "18px",
  metricLabelFontSize: "8px",
  metricLabelLineHeight: "9px",
  metricRadius: "3px",
  workflowHeight: "55px",
  workflowTitleFontSize: "13px",
  workflowTitleLineHeight: "14px",
  workflowTitlePaddingLeft: "4px",
  workflowTitlePaddingTop: "1px",
  stageGridPadding: "1px 5px 3px",
  stageGridGap: "1px",
  stagePairGap: "4px",
  stageStripeWidth: "3px",
  stageFontSize: "10px",
  stageLineHeight: "11px",
  stageHeight: "11px",
  stagePaddingLeft: "3px",
  footerHeight: "16px",
  footerGap: "3px",
  navArrowWidth: "34px",
  navHomeWidth: "58px",
  navFontSize: "9px",
  navLineHeight: "11px",
  navRadius: "3px",
  spacerMarginTop: "0"
};

export function buildQuote0DashboardCanvasPayload(
  display: PushDisplayCard,
  workflow: WorkflowIndexPayload,
  options: Quote0DashboardCanvasOptions = {}
): Quote0CanvasPayload {
  const layout = resolveDashboardCanvasLayout(options);
  const data = buildDashboardCanvasData(display, workflow, layout);
  const taskAlias = options.taskAlias?.trim();
  return {
    refreshNow: true,
    taskAlias: taskAlias || undefined,
    data,
    windowData: {
      default: [root(data, layout)]
    },
    layoutFull: {
      tw: layout.outerPaddingTw,
      style: {
        backgroundColor: "#f7f5ea"
      }
    },
    link: options.link || display.link,
    border: options.border ?? 0
  };
}

function buildDashboardCanvasData(
  display: PushDisplayCard,
  workflow: WorkflowIndexPayload,
  layout: DashboardCanvasLayoutSpec
): DashboardData {
  const metrics = collectMetrics(display, workflow);
  const stages = workflow.enabled
    ? workflow.stages.slice(0, 5).map((stage) => `${stage.title} · ${stage.count}`)
    : [layout.profile === "wide-low" ? "Workflow off · 0" : "Workflow 未启用 · 0"];
  while (stages.length < 5) {
    stages.push("");
  }
  return {
    layoutProfile: layout.profile,
    screenWidth: layout.screenWidth,
    screenHeight: layout.screenHeight,
    title: layout.profile === "wide-low" ? "ToWrite" : "小屏首页",
    subtitle: layout.profile === "wide-low" ? "Overview" : "ToThink / ToWrite / Workflow 总览",
    summary: layout.profile === "wide-low"
      ? `Think ${metrics.think} · Write ${metrics.write} · Open ${metrics.open} · Due ${metrics.due}`
      : `ToThink ${metrics.think} · ToWrite ${metrics.write} · Workflow ${metrics.workflow} · 提醒 ${metrics.due}`,
    think: metrics.think,
    write: metrics.write,
    open: metrics.open,
    articles: metrics.articles,
    due: metrics.due,
    workflow: metrics.workflow,
    stale: metrics.stale,
    stage0: stages[0] ?? "",
    stage1: stages[1] ?? "",
    stage2: stages[2] ?? "",
    stage3: stages[3] ?? "",
    stage4: stages[4] ?? "",
    footerLeft: layout.profile === "wide-low" ? "New" : "新想法",
    footerCenter: layout.profile === "wide-low" ? "Home" : "⌂ 首页",
    footerRight: layout.profile === "wide-low" ? "Input" : "手机输入"
  };
}

function root(data: DashboardData, layout: DashboardCanvasLayoutSpec): Quote0CanvasElement {
  return div("", [
    header(data, layout),
    metricStrip(data, layout),
    workflowPanel(data, layout),
    spacer(layout),
    footer(data, layout)
  ], {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: layout.rootGap,
    width: "100%",
    height: "100%",
    minWidth: "0",
    minHeight: "0",
    overflow: "hidden",
    backgroundColor: "#f7f5ea",
    color: "#111"
  });
}

function header(data: DashboardData, layout: DashboardCanvasLayoutSpec): Quote0CanvasElement {
  return div("", [
    div("", [
      span(data.title, "", {
        flex: "0 1 auto",
        minWidth: "0",
        fontSize: layout.titleFontSize,
        lineHeight: layout.titleLineHeight,
        fontFamily: "ChillDuanSans, sans-serif",
        fontWeight: 800,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }),
      span(data.subtitle, "", {
        flex: "1 1 auto",
        minWidth: "0",
        fontSize: layout.subtitleFontSize,
        lineHeight: layout.subtitleLineHeight,
        fontFamily: "ChillDuanSans, sans-serif",
        fontWeight: 700,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textAlign: "right"
      })
    ], {
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: layout.headerRowGap,
      minWidth: "0"
    }),
    span(data.summary, "", {
      minWidth: "0",
      fontSize: layout.summaryFontSize,
      lineHeight: layout.summaryLineHeight,
      fontFamily: "ChillDuanSans, sans-serif",
      fontWeight: 700,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }),
    div("", "", { width: "100%", height: layout.ruleHeight, marginTop: layout.ruleMarginTop, backgroundColor: "#111", flexShrink: 0 })
  ], {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    minWidth: "0"
  });
}

function metricStrip(data: DashboardData, layout: DashboardCanvasLayoutSpec): Quote0CanvasElement {
  return div("", [
    metricCell(data.open, layout.profile === "wide-low" ? "Open" : "未解决", layout),
    metricCell(data.think, layout.profile === "wide-low" ? "Think" : "ToThink", layout),
    metricCell(data.write, layout.profile === "wide-low" ? "Write" : "ToWrite", layout),
    metricCell(data.articles, layout.profile === "wide-low" ? "Art" : "有问题文章", layout),
    metricCell(data.due, layout.profile === "wide-low" ? "Due" : "提醒到期", layout, true)
  ], {
    display: "flex",
    flexDirection: "row",
    flexShrink: 0,
    width: "100%",
    height: layout.metricHeight,
    overflow: "hidden",
    border: "1px solid #111",
    borderRadius: layout.metricRadius
  });
}

function metricCell(value: string, label: string, layout: DashboardCanvasLayoutSpec, isLast = false): Quote0CanvasElement {
  return div("", [
    span(value, "", {
      fontSize: layout.metricValueFontSize,
      lineHeight: layout.metricValueLineHeight,
      fontFamily: "ChillDuanSans, sans-serif",
      fontWeight: 900
    }),
    span(label, "", {
      fontSize: layout.metricLabelFontSize,
      lineHeight: layout.metricLabelLineHeight,
      fontFamily: "ChillDuanSans, sans-serif",
      fontWeight: 700,
      whiteSpace: "nowrap"
    })
  ], {
    display: "flex",
    flexDirection: "column",
    flex: "1 1 0",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "0",
    borderRight: isLast ? "0" : "1px solid #111"
  });
}

function workflowPanel(data: DashboardData, layout: DashboardCanvasLayoutSpec): Quote0CanvasElement {
  return div("", [
    span(layout.profile === "wide-low" ? "Workflow" : "Workflow 状态", "", {
      fontSize: layout.workflowTitleFontSize,
      lineHeight: layout.workflowTitleLineHeight,
      fontFamily: "ChillDuanSans, sans-serif",
      fontWeight: 800,
      paddingLeft: layout.workflowTitlePaddingLeft,
      paddingTop: layout.workflowTitlePaddingTop
    }),
    div("", [
      stagePair(
        stageCell(data.stage0, "#111", layout),
        stageCell(data.stage1, "#8b6c17", layout),
        layout
      ),
      stagePair(
        stageCell(data.stage2, "#3a8a5a", layout),
        stageCell(data.stage3, "#2e6fa8", layout),
        layout
      ),
      stagePair(
        stageCell(data.stage4, "#7c62b5", layout),
        stageCell("", "#f7f5ea", layout),
        layout
      )
    ], {
      display: "flex",
      flexDirection: "column",
      gap: layout.stageGridGap,
      padding: layout.stageGridPadding,
      minWidth: "0"
    })
  ], {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    width: "100%",
    height: layout.workflowHeight,
    overflow: "hidden",
    border: "1px solid #111",
    borderRadius: "3px"
  });
}

function stagePair(left: Quote0CanvasElement, right: Quote0CanvasElement, layout?: DashboardCanvasLayoutSpec): Quote0CanvasElement {
  return div("", [left, right], {
    display: "flex",
    flexDirection: "row",
    gap: layout?.stagePairGap ?? CLASSIC_27_LAYOUT.stagePairGap,
    minWidth: "0"
  });
}

function stageCell(text: string, stripeColor: string, layout: DashboardCanvasLayoutSpec): Quote0CanvasElement {
  return div("", [
    div("", "", { width: layout.stageStripeWidth, alignSelf: "stretch", backgroundColor: stripeColor, flexShrink: 0 }),
    span(text, "", {
      flex: "1 1 auto",
      minWidth: "0",
      fontSize: layout.stageFontSize,
      lineHeight: layout.stageLineHeight,
      fontFamily: "ChillDuanSans, sans-serif",
      fontWeight: 800,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      paddingLeft: layout.stagePaddingLeft
    })
  ], {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    flex: "1 1 0",
    minWidth: "0",
    height: layout.stageHeight,
    backgroundColor: text ? "#ece9dc" : "#f7f5ea"
  });
}

function spacer(layout: DashboardCanvasLayoutSpec): Quote0CanvasElement {
  return div("", "", {
    flex: layout.profile === "wide-low" ? "0 0 5px" : "1 1 auto",
    minHeight: "0",
    borderTop: "1px solid #111",
    marginTop: layout.spacerMarginTop
  });
}

function footer(data: DashboardData, layout: DashboardCanvasLayoutSpec): Quote0CanvasElement {
  return div("", [
    navBox(data.footerLeft, undefined, false, layout),
    navBox("←", layout.navArrowWidth, false, layout),
    navBox(data.footerCenter, layout.navHomeWidth, true, layout),
    navBox("→", layout.navArrowWidth, false, layout),
    navBox(data.footerRight, undefined, false, layout)
  ], {
    display: "flex",
    flexDirection: "row",
    flexShrink: 0,
    width: "100%",
    gap: layout.footerGap,
    height: layout.footerHeight
  });
}

function navBox(text: string, width: string | undefined, active: boolean, layout: DashboardCanvasLayoutSpec): Quote0CanvasElement {
  return div("", text, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: width ? "0 0 auto" : "1 1 0",
    width,
    minWidth: "0",
    fontSize: layout.navFontSize,
    lineHeight: layout.navLineHeight,
    fontFamily: "ChillDuanSans, sans-serif",
    fontWeight: active ? 800 : 700,
    overflow: "hidden",
    whiteSpace: "nowrap",
    color: active ? "#f7f5ea" : "#111",
    backgroundColor: active ? "#111" : "#f7f5ea",
    border: "1px solid #111",
    borderRadius: layout.navRadius
  });
}

function div(tw: string, children: string | Quote0CanvasElement[], style?: Record<string, unknown>): Quote0CanvasElement {
  return {
    type: "div",
    props: {
      ...(tw ? { tw } : {}),
      ...(style ? { style } : {}),
      children
    }
  };
}

function span(children: string, tw = "", style?: Record<string, unknown>): Quote0CanvasElement {
  return {
    type: "span",
    props: {
      ...(tw ? { tw } : {}),
      ...(style ? { style } : {}),
      children
    }
  };
}

function resolveDashboardCanvasLayout(options: Quote0DashboardCanvasOptions): DashboardCanvasLayoutSpec {
  if (options.layout === "classic-27") {
    return CLASSIC_27_LAYOUT;
  }
  if (options.layout === "wide-low") {
    return WIDE_LOW_LAYOUT;
  }

  const width = finitePositive(options.screenWidth);
  const height = finitePositive(options.screenHeight);
  if (width && height) {
    const aspectRatio = width / height;
    if (aspectRatio >= 1.85 || height <= 152) {
      return WIDE_LOW_LAYOUT;
    }
  }

  return CLASSIC_27_LAYOUT;
}

function finitePositive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function collectMetrics(display: PushDisplayCard, workflow: WorkflowIndexPayload): MetricSet {
  const values = new Map(display.metrics.map((metric) => [normalizeMetric(metric.label), String(metric.value)]));
  const text = [display.primary, ...display.secondaryLines, display.message].filter(Boolean).join("\n");
  const workflowCount = workflow.enabled ? String(workflow.counts.uniqueFiles) : fallbackMatch(text, /(\d+)\s+workflow/iu, "0");
  return {
    think: metricValue(values, ["tothink", "think"], fallbackMatch(text, /think\s+(\d+)/iu, "0")),
    write: metricValue(values, ["towrite", "write"], fallbackMatch(text, /write\s+(\d+)/iu, "0")),
    open: metricValue(values, ["open"], fallbackMatch(text, /(\d+)\s+open/iu, "0")),
    articles: metricValue(values, ["articles"], fallbackMatch(text, /articles?\s+(\d+)/iu, "0")),
    due: metricValue(values, ["due"], fallbackMatch(text, /due\s+(\d+)/iu, "0")),
    stale: metricValue(values, ["stale"], fallbackMatch(text, /stale\s+(\d+)/iu, "0")),
    workflow: workflowCount
  };
}

function metricValue(values: Map<string, string>, labels: string[], fallback: string): string {
  for (const label of labels) {
    const value = values.get(normalizeMetric(label));
    if (value !== undefined) {
      return value;
    }
  }
  return fallback;
}

function fallbackMatch(value: string, pattern: RegExp, fallback: string): string {
  return value.match(pattern)?.[1] ?? fallback;
}

function normalizeMetric(value: string): string {
  return value.toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "");
}
