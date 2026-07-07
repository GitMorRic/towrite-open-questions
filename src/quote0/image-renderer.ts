import type { WorkflowIndexPayload } from "../workflow";
import type { PushDisplayCard } from "../push/types";
import type { Quote0ImagePayload } from "./client";

export interface Quote0DashboardImageOptions {
  link?: string;
  taskKey?: string;
  taskAlias?: string;
  border?: 0 | 1;
  ditherType?: Quote0ImagePayload["ditherType"];
  renderPng?: (display: PushDisplayCard, workflow: WorkflowIndexPayload) => string;
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

const WIDTH = 296;
const HEIGHT = 152;

export function buildQuote0DashboardImagePayload(
  display: PushDisplayCard,
  workflow: WorkflowIndexPayload,
  options: Quote0DashboardImageOptions = {}
): Quote0ImagePayload {
  const taskFields = buildTaskFields(options.taskKey ?? "", options.taskAlias ?? "");
  return {
    refreshNow: true,
    image: options.renderPng ? options.renderPng(display, workflow) : renderQuote0DashboardPng(display, workflow),
    link: options.link || display.link,
    border: options.border ?? 0,
    ditherType: options.ditherType ?? "NONE",
    ...taskFields
  };
}

export function renderQuote0DashboardPng(display: PushDisplayCard, workflow: WorkflowIndexPayload): string {
  if (typeof document === "undefined") {
    throw new Error("Quote0 dashboard image rendering needs a browser canvas.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Quote0 dashboard image rendering failed: canvas context unavailable.");
  }

  const metrics = collectMetrics(display, workflow);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#f7f5ea";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawHeader(ctx, metrics);
  drawMetricStrip(ctx, metrics);
  drawWorkflow(ctx, workflow);
  drawFooter(ctx);

  return canvas.toDataURL("image/png");
}

function drawHeader(ctx: CanvasRenderingContext2D, metrics: MetricSet): void {
  ctx.fillStyle = "#111";
  ctx.font = "700 19px system-ui, -apple-system, BlinkMacSystemFont, 'Microsoft YaHei', sans-serif";
  fitText(ctx, "小屏首页", 8, 22, 86);
  ctx.font = "600 11px Georgia, 'Times New Roman', serif";
  fitText(ctx, "ToThink / ToWrite / Workflow 总览", 121, 21, 166, "right");
  ctx.font = "600 10px system-ui, -apple-system, BlinkMacSystemFont, 'Microsoft YaHei', sans-serif";
  fitText(ctx, `ToThink ${metrics.think} · ToWrite ${metrics.write} · Workflow ${metrics.workflow} · 提醒 ${metrics.due}`, 8, 34, 280);
  line(ctx, 8, 40, 288, 40, 2);
}

function drawMetricStrip(ctx: CanvasRenderingContext2D, metrics: MetricSet): void {
  const items = [
    { value: metrics.think, label: "ToThink" },
    { value: metrics.write, label: "ToWrite" },
    { value: metrics.open, label: "未解决" },
    { value: metrics.articles, label: "有问题文章" },
    { value: metrics.due, label: "提醒到期" }
  ];
  const x = 8;
  const y = 44;
  const w = 280;
  const h = 24;
  roundRect(ctx, x, y, w, h, 3, false, true);
  const cell = w / items.length;
  ctx.textAlign = "center";
  for (const [index, item] of items.entries()) {
    const cx = x + cell * index;
    if (index > 0) {
      line(ctx, cx, y, cx, y + h, 1);
    }
    ctx.fillStyle = "#111";
    ctx.font = "800 15px Georgia, 'Times New Roman', serif";
    ctx.fillText(item.value, cx + cell / 2, y + 13);
    ctx.font = "600 7px system-ui, -apple-system, BlinkMacSystemFont, 'Microsoft YaHei', sans-serif";
    ctx.fillText(item.label, cx + cell / 2, y + 21);
  }
  ctx.textAlign = "left";
}

function drawWorkflow(ctx: CanvasRenderingContext2D, workflow: WorkflowIndexPayload): void {
  const x = 8;
  const y = 72;
  const w = 280;
  const h = 48;
  roundRect(ctx, x, y, w, h, 3, false, true);
  ctx.fillStyle = "#111";
  ctx.font = "800 13px Georgia, 'Times New Roman', serif";
  fitText(ctx, "Workflow 状态", x + 5, y + 14, 112);

  const stages = workflow.enabled
    ? workflow.stages.slice(0, 5).map((stage) => ({ title: stage.title, count: stage.count }))
    : [{ title: "Workflow 未启用", count: 0 }];
  const rows = Math.ceil(stages.length / 2);
  const rowH = Math.max(10, Math.floor((h - 20) / Math.max(rows, 1)));
  const colW = (w - 12) / 2;
  const startY = y + 18;

  for (const [index, stage] of stages.entries()) {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const rowX = x + 5 + col * colW;
    const rowY = startY + row * rowH;
    ctx.fillStyle = index % 2 === 0 ? "#e9e6d9" : "#f1efe5";
    ctx.fillRect(rowX, rowY, colW - 4, rowH - 1);
    ctx.fillStyle = stageBarColor(index);
    ctx.fillRect(rowX, rowY, 3, rowH - 1);
    ctx.fillStyle = "#111";
    ctx.font = "800 10px Georgia, 'Times New Roman', serif";
    fitText(ctx, `${stage.title} · ${stage.count}`, rowX + 6, rowY + rowH - 3, colW - 14);
  }
}

function drawFooter(ctx: CanvasRenderingContext2D): void {
  line(ctx, 8, 128, 288, 128, 2);
  const y = 133;
  const h = 15;
  const boxes = [
    { x: 8, w: 56, label: "新想法", active: false },
    { x: 68, w: 42, label: "←", active: false },
    { x: 114, w: 68, label: "⌂  首页", active: true },
    { x: 186, w: 42, label: "→", active: false },
    { x: 232, w: 56, label: "手机输入", active: false }
  ];
  for (const box of boxes) {
    ctx.fillStyle = box.active ? "#111" : "#f7f5ea";
    roundRect(ctx, box.x, y, box.w, h, 3, true, true);
    ctx.fillStyle = box.active ? "#fff" : "#111";
    ctx.font = box.active
      ? "800 9px system-ui, -apple-system, BlinkMacSystemFont, 'Microsoft YaHei', sans-serif"
      : "700 8px system-ui, -apple-system, BlinkMacSystemFont, 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(box.label, box.x + box.w / 2, y + 11);
  }
  ctx.textAlign = "left";
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

function buildTaskFields(taskKey: string, taskAlias: string): Pick<Quote0ImagePayload, "taskKey" | "taskAlias"> {
  const key = taskKey.trim();
  if (key) {
    return { taskKey: key };
  }
  const alias = taskAlias.trim();
  return alias ? { taskAlias: alias } : {};
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

function stageBarColor(index: number): string {
  return ["#111", "#777", "#444", "#999", "#222"][index % 5];
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  align: CanvasTextAlign = "left"
): void {
  const previousAlign = ctx.textAlign;
  ctx.textAlign = align;
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    ctx.textAlign = previousAlign;
    return;
  }
  let output = text;
  while (output.length > 1 && ctx.measureText(output + "...").width > maxWidth) {
    output = output.slice(0, -1);
  }
  ctx.fillText(output + "...", x, y);
  ctx.textAlign = previousAlign;
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number): void {
  ctx.strokeStyle = "#111";
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: boolean,
  stroke: boolean
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) {
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
