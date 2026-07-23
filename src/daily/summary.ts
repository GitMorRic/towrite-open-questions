import { DAILY_SCHEMA_VERSION, type DailyActivityAggregate, type DailyPlanItem, type DailySummary } from "./types";

export function buildDailySummary(
  date: string,
  items: readonly DailyPlanItem[],
  activity: DailyActivityAggregate,
  now = new Date(),
  language: "zh" | "en" = "zh"
): DailySummary {
  const completed = items.filter((item) => item.done).length;
  const remaining = items.length - completed;
  const lines = language === "zh"
    ? [
        `完成 ${completed}/${items.length} 项计划，剩余 ${remaining} 项。`,
        `写作新增 ${activity.positiveWritingUnits} 单位，净增 ${formatSigned(activity.netWritingUnits)} 单位。`,
        `新建 ${activity.notesCreated} 篇笔记，修改 ${activity.notesModified} 篇笔记。`
      ]
    : [
        `Completed ${completed}/${items.length} planned items; ${remaining} remain.`,
        `Added ${activity.positiveWritingUnits} writing units; net ${formatSigned(activity.netWritingUnits)}.`,
        `Created ${activity.notesCreated} notes and modified ${activity.notesModified}.`
      ];
  if (activity.questionsResolved || activity.capturesCommitted) {
    lines.push(language === "zh"
      ? `解决 ${activity.questionsResolved} 个问题，完成 ${activity.capturesCommitted} 次记录。`
      : `Resolved ${activity.questionsResolved} questions and committed ${activity.capturesCommitted} captures.`);
  }
  if (!activity.trackingComplete) {
    lines.push(language === "zh"
      ? "今日统计从启用追踪后开始，可能不包含全天数据。"
      : "Tracking started partway through the day, so this summary may be incomplete.");
  }
  const headline = language === "zh"
    ? items.length === 0
      ? "今天尚未安排计划"
      : remaining === 0
        ? "今天的计划已经完成"
        : `今天完成了 ${completed} 项，还有 ${remaining} 项`
    : items.length === 0
      ? "No plan has been added for today"
      : remaining === 0
        ? "Today's plan is complete"
        : `${completed} completed, ${remaining} remaining today`;
  const heading = language === "zh" ? "今日总结" : "Today summary";
  return {
    schemaVersion: DAILY_SCHEMA_VERSION,
    date,
    generatedAt: validDate(now).toISOString(),
    headline,
    lines,
    markdown: [`## ${heading}`, "", `**${headline}**`, "", ...lines.map((line) => `- ${line}`)].join("\n"),
    metrics: {
      planned: items.length,
      completed,
      remaining,
      positiveWritingUnits: activity.positiveWritingUnits,
      netWritingUnits: activity.netWritingUnits,
      notesCreated: activity.notesCreated,
      notesModified: activity.notesModified
    }
  };
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function validDate(value: Date): Date {
  return Number.isFinite(value.getTime()) ? value : new Date();
}
