import type { WorkflowIndexPayload } from "../workflow";
import type { PushDisplayCard } from "../push/types";
import type { Quote0CanvasElement, Quote0CanvasPayload } from "./client";

export interface Quote0DashboardCanvasOptions {
  link?: string;
  taskAlias?: string;
  border?: 0 | 1;
}

interface DashboardData extends Record<string, unknown> {
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

export function buildQuote0DashboardCanvasPayload(
  display: PushDisplayCard,
  workflow: WorkflowIndexPayload,
  options: Quote0DashboardCanvasOptions = {}
): Quote0CanvasPayload {
  const data = buildDashboardCanvasData(display, workflow);
  const taskAlias = options.taskAlias?.trim();
  return {
    refreshNow: true,
    taskAlias: taskAlias || undefined,
    data,
    windowData: {
      default: [root(data)]
    },
    layoutFull: {
      tw: "p-[8px]",
      style: {
        backgroundColor: "#f7f5ea"
      }
    },
    link: options.link || display.link,
    border: options.border ?? 0
  };
}

function buildDashboardCanvasData(display: PushDisplayCard, workflow: WorkflowIndexPayload): DashboardData {
  const metrics = collectMetrics(display, workflow);
  const stages = workflow.enabled
    ? workflow.stages.slice(0, 5).map((stage) => `${stage.title} · ${stage.count}`)
    : ["Workflow 未启用 · 0"];
  while (stages.length < 5) {
    stages.push("");
  }
  return {
    title: "小屏首页",
    subtitle: "ToThink / ToWrite / Workflow 总览",
    summary: `ToThink ${metrics.think} · ToWrite ${metrics.write} · Workflow ${metrics.workflow} · 提醒 ${metrics.due}`,
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
    footerLeft: "新想法",
    footerCenter: "⌂ 首页",
    footerRight: "手机输入"
  };
}

function root(data: DashboardData): Quote0CanvasElement {
  return div("", [
    header(data),
    metricStrip(data),
    workflowPanel(data),
    spacer(),
    footer(data)
  ], {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    width: "100%",
    height: "100%",
    minWidth: "0",
    minHeight: "0",
    overflow: "hidden",
    backgroundColor: "#f7f5ea",
    color: "#111"
  });
}

function header(data: DashboardData): Quote0CanvasElement {
  return div("", [
    div("", [
      span(data.title, "", {
        flex: "0 1 auto",
        minWidth: "0",
        fontSize: "20px",
        lineHeight: "22px",
        fontFamily: "ChillDuanSans, sans-serif",
        fontWeight: 800,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }),
      span(data.subtitle, "", {
        flex: "1 1 auto",
        minWidth: "0",
        fontSize: "11px",
        lineHeight: "14px",
        fontFamily: "Playfair Display, serif",
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
      gap: "6px",
      minWidth: "0"
    }),
    span(data.summary, "", {
      minWidth: "0",
      fontSize: "10px",
      lineHeight: "12px",
      fontFamily: "ChillDuanSans, sans-serif",
      fontWeight: 700,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }),
    div("", "", { width: "100%", height: "2px", marginTop: "2px", backgroundColor: "#111", flexShrink: 0 })
  ], {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    minWidth: "0"
  });
}

function metricStrip(data: DashboardData): Quote0CanvasElement {
  return div("", [
    metricCell(data.think, "ToThink"),
    metricCell(data.write, "ToWrite"),
    metricCell(data.open, "未解决"),
    metricCell(data.articles, "有问题文章"),
    metricCell(data.due, "提醒到期", true)
  ], {
    display: "flex",
    flexDirection: "row",
    flexShrink: 0,
    width: "100%",
    height: "25px",
    overflow: "hidden",
    border: "1px solid #111",
    borderRadius: "3px"
  });
}

function metricCell(value: string, label: string, isLast = false): Quote0CanvasElement {
  return div("", [
    span(value, "", {
      fontSize: "15px",
      lineHeight: "15px",
      fontFamily: "Playfair Display, serif",
      fontWeight: 800
    }),
    span(label, "", {
      fontSize: "7px",
      lineHeight: "8px",
      fontFamily: "ChillDuanSans, sans-serif",
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

function workflowPanel(data: DashboardData): Quote0CanvasElement {
  return div("", [
    span("Workflow 状态", "", {
      fontSize: "13px",
      lineHeight: "14px",
      fontFamily: "Playfair Display, serif",
      fontWeight: 800,
      paddingLeft: "5px",
      paddingTop: "2px"
    }),
    div("", [
      stagePair(
        stageCell(data.stage0, "#111"),
        stageCell(data.stage1, "#8b6c17")
      ),
      stagePair(
        stageCell(data.stage2, "#3a8a5a"),
        stageCell(data.stage3, "#2e6fa8")
      ),
      stagePair(
        stageCell(data.stage4, "#7c62b5"),
        stageCell("", "#f7f5ea")
      )
    ], {
      display: "flex",
      flexDirection: "column",
      gap: "1px",
      padding: "1px 5px 4px",
      minWidth: "0"
    })
  ], {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    width: "100%",
    height: "56px",
    overflow: "hidden",
    border: "1px solid #111",
    borderRadius: "3px"
  });
}

function stagePair(left: Quote0CanvasElement, right: Quote0CanvasElement): Quote0CanvasElement {
  return div("", [left, right], {
    display: "flex",
    flexDirection: "row",
    gap: "4px",
    minWidth: "0"
  });
}

function stageCell(text: string, stripeColor: string): Quote0CanvasElement {
  return div("", [
    div("", "", { width: "3px", alignSelf: "stretch", backgroundColor: stripeColor, flexShrink: 0 }),
    span(text, "", {
      flex: "1 1 auto",
      minWidth: "0",
      fontSize: "10px",
      lineHeight: "12px",
      fontFamily: "Playfair Display, serif",
      fontWeight: 800,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      paddingLeft: "4px"
    })
  ], {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    flex: "1 1 0",
    minWidth: "0",
    height: "12px",
    backgroundColor: text ? "#ece9dc" : "#f7f5ea"
  });
}

function spacer(): Quote0CanvasElement {
  return div("", "", {
    flex: "1 1 auto",
    minHeight: "0",
    borderTop: "1px solid #111",
    marginTop: "1px"
  });
}

function footer(data: DashboardData): Quote0CanvasElement {
  return div("", [
    navBox(data.footerLeft),
    navBox("←", "42px"),
    navBox(data.footerCenter, "70px", true),
    navBox("→", "42px"),
    navBox(data.footerRight)
  ], {
    display: "flex",
    flexDirection: "row",
    flexShrink: 0,
    width: "100%",
    gap: "4px",
    height: "17px"
  });
}

function navBox(text: string, width?: string, active = false): Quote0CanvasElement {
  return div("", text, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: width ? "0 0 auto" : "1 1 0",
    width,
    minWidth: "0",
    fontSize: "9px",
    lineHeight: "11px",
    fontFamily: "ChillDuanSans, sans-serif",
    fontWeight: active ? 800 : 700,
    overflow: "hidden",
    whiteSpace: "nowrap",
    color: active ? "#f7f5ea" : "#111",
    backgroundColor: active ? "#111" : "#f7f5ea",
    border: "1px solid #111",
    borderRadius: "3px"
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
