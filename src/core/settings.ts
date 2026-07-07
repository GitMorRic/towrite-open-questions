import type { OpenQuestionColor, OpenQuestionLane, QuestionStatusOption } from "./types";
import type { PushHabitRule, PushRuntimeState, PushTargetSettings, ToWritePushSettings } from "../push/types";

export type ToWriteLanguage = "zh" | "en";

export interface ToWriteAiSettings {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  autoRun: boolean;
  maxAutoRunsPerSession: number;
  rerankLocalNotes: boolean;
}

export type ToWriteQuote0LaneScope = "" | OpenQuestionLane;

export interface ToWriteQuote0Settings {
  enabled: boolean;
  apiBaseUrl: string;
  apiKey: string;
  deviceId: string;
  taskKey: string;
  taskAlias: string;
  refreshSeconds: number;
  lane: ToWriteQuote0LaneScope;
  nfcToken: string;
  cursor: number;
  lastSyncedQuestionId: string;
  lastSyncedAt: string;
  lastError: string;
}

export interface ToWriteExternalApiSettings {
  enabled: boolean;
  bindHost: string;
  port: number;
  token: string;
  allowQueryTokenForRead: boolean;
  publicBaseUrl: string;
}

export interface WorkflowStageSettings {
  id: string;
  title: string;
  description: string;
  color: OpenQuestionColor;
  folderPrefixes: string[];
  tags: string[];
  limit: number;
  staleAfterDays: number;
}

export interface WorkflowStagesSettings {
  enabled: boolean;
  stages: WorkflowStageSettings[];
}

export interface ToWriteDeviceCaptureSettings {
  enabled: boolean;
  inboxFile: string;
  targetFolders: string[];
  defaultTags: string[];
}

export type ToWriteDeviceProfileKind = "mobile-eink" | "eink-bw" | "desktop-card";
export type ToWriteDeviceProfilePage = "home" | "cards" | "workflow" | "articles";

export interface ToWriteDeviceProfileSettings {
  id: string;
  name: string;
  profile: ToWriteDeviceProfileKind;
  width: number;
  height: number;
  inches: number;
  defaultPage: ToWriteDeviceProfilePage;
  defaultLane?: OpenQuestionLane | "";
  refreshSeconds: number;
}

export interface ToWriteReminderPreset {
  label: string;
  value: string;
}

export interface ToWriteSettings {
  language: ToWriteLanguage;
  exportDirectory: string;
  autoExport: boolean;
  autoOpenSidebar: boolean;
  groupCurrentByHeading: boolean;
  enableCandidateDetection: boolean;
  enableEditorDecorations: boolean;
  compactEditorDecorations: boolean;
  candidateTriggerWords: string[];
  statusOptions: QuestionStatusOption[];
  defaultThinkColor: OpenQuestionColor;
  defaultWriteColor: OpenQuestionColor;
  externalApi: ToWriteExternalApiSettings;
  deviceCapture: ToWriteDeviceCaptureSettings;
  deviceProfiles: ToWriteDeviceProfileSettings[];
  workflowStages: WorkflowStagesSettings;
  reminderPresets: ToWriteReminderPreset[];
  ai: ToWriteAiSettings;
  quote0: ToWriteQuote0Settings;
  push: ToWritePushSettings;
  writeArticleProperties: boolean;
}

export interface ToWriteSavedData {
  settings: ToWriteSettings;
  questionStates: Record<string, import("./types").StoredQuestionState>;
  pushState?: PushRuntimeState;
}

export const DEFAULT_STATUS_OPTIONS: QuestionStatusOption[] = [
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
  { id: "blocked", label: "Blocked" },
  { id: "paused", label: "Paused" },
  { id: "ignored", label: "Ignored" },
  { id: "candidate", label: "Candidate" }
];

export const DEFAULT_WORKFLOW_STAGES: WorkflowStageSettings[] = [
  {
    id: "raw",
    title: "Raw",
    description: "Capture / 未整理",
    color: "slate",
    folderPrefixes: ["00-Raw", "MindFlow/00-Raw"],
    tags: ["raw", "capture"],
    limit: 20,
    staleAfterDays: 14
  },
  {
    id: "sparks",
    title: "Sparks",
    description: "灵感、火花和还没展开的开头",
    color: "amber",
    folderPrefixes: ["01-Sparks", "MindFlow/01-Sparks"],
    tags: ["spark", "sparks"],
    limit: 20,
    staleAfterDays: 7
  },
  {
    id: "initialize",
    title: "Initialize",
    description: "已初步整理，等待进入推进",
    color: "mint",
    folderPrefixes: ["01-Initialize", "Techbench/01-Initialize"],
    tags: ["initialize", "initialized"],
    limit: 20,
    staleAfterDays: 21
  },
  {
    id: "processing",
    title: "Processing",
    description: "需要继续查资料、讨论或写作推进",
    color: "sky",
    folderPrefixes: ["02-Processing", "Techbench/02-Processing"],
    tags: ["processing", "next"],
    limit: 20,
    staleAfterDays: 10
  },
  {
    id: "archive",
    title: "Archive",
    description: "已归档或暂时完成",
    color: "violet",
    folderPrefixes: ["03-Archive", "MindFlow/03-Archive", "Techbench/03-Archive"],
    tags: ["archive", "archived"],
    limit: 20,
    staleAfterDays: 0
  }
];

export const DEFAULT_DEVICE_PROFILES: ToWriteDeviceProfileSettings[] = [
  {
    id: "eink-27-landscape",
    name: "2.7 inch e-ink landscape",
    profile: "eink-bw",
    width: 264,
    height: 176,
    inches: 2.7,
    defaultPage: "home",
    defaultLane: "",
    refreshSeconds: 300
  }
];

export const DEFAULT_QUOTE0_SETTINGS: ToWriteQuote0Settings = {
  enabled: false,
  apiBaseUrl: "https://dot.mindreset.tech",
  apiKey: "",
  deviceId: "",
  taskKey: "",
  taskAlias: "ToWrite Open Questions",
  refreshSeconds: 300,
  lane: "",
  nfcToken: "",
  cursor: 0,
  lastSyncedQuestionId: "",
  lastSyncedAt: "",
  lastError: ""
};

export const DEFAULT_PUSH_SETTINGS: ToWritePushSettings = {
  enabled: false,
  privacy: {
    level: "local-coarse",
    allowPreciseLocation: false,
    shareWithAi: false
  },
  targets: [
    {
      id: "local-web",
      name: "Local web / phone",
      type: "local-web",
      enabled: true,
      profile: "mobile-eink",
      width: 390,
      height: 844,
      inches: 6.1,
      defaultPage: "home",
      defaultLane: "",
      refreshSeconds: 60,
      quietHoursStart: "",
      quietHoursEnd: "",
      token: "",
      capabilities: ["pull", "sse", "feedback", "input"]
    },
    {
      id: "quote0",
      name: "quote0",
      type: "quote0",
      enabled: false,
      profile: "eink-bw",
      width: 264,
      height: 176,
      inches: 2.7,
      defaultPage: "cards",
      defaultLane: "",
      refreshSeconds: 300,
      quietHoursStart: "",
      quietHoursEnd: "",
      token: "",
      capabilities: ["push", "nfc", "text-api"]
    }
  ],
  habits: [
    {
      id: "morning-sparks",
      label: "Morning sparks",
      enabled: true,
      timeStart: "06:00",
      timeEnd: "11:00",
      placeLabel: "",
      mode: "",
      stageIds: ["raw", "sparks"],
      lanes: ["think"],
      statuses: [],
      targetIds: [],
      boost: 18,
      limitPerDay: 12
    },
    {
      id: "evening-writing",
      label: "Evening writing",
      enabled: true,
      timeStart: "18:00",
      timeEnd: "23:00",
      placeLabel: "",
      mode: "writing",
      stageIds: ["processing"],
      lanes: ["write"],
      statuses: [],
      targetIds: [],
      boost: 20,
      limitPerDay: 12
    }
  ],
  habitText: "",
  aiRerank: false
};

export const DEFAULT_REMINDER_PRESETS: ToWriteReminderPreset[] = [
  { label: "15 分钟后", value: "15m" },
  { label: "1 小时后", value: "1h" },
  { label: "3 小时后", value: "3h" },
  { label: "今天 18:00", value: "today 18:00" },
  { label: "今天 21:00", value: "today 21:00" },
  { label: "明天 09:00", value: "tomorrow 09:00" },
  { label: "明天 21:00", value: "tomorrow 21:00" },
  { label: "下周 09:00", value: "nextWeek 09:00" }
];

export const DEFAULT_SETTINGS: ToWriteSettings = {
  language: "zh",
  exportDirectory: ".obsidian-open-questions",
  autoExport: true,
  autoOpenSidebar: true,
  groupCurrentByHeading: false,
  enableCandidateDetection: true,
  enableEditorDecorations: true,
  compactEditorDecorations: false,
  candidateTriggerWords: [
    "\u8fd9\u91cc\u8981\u8865",
    "\u8865\u4e00\u70b9",
    "\u8865\u5145",
    "\u8fd8\u8981\u8865",
    "\u5206\u6790\u4e00\u4e0b",
    "\u6709\u6ca1\u6709\u5b9e\u6d4b",
    "\u9700\u8981\u786e\u8ba4",
    "\u6765\u6e90\u662f\u4ec0\u4e48",
    "\u7ee7\u7eed\u5199",
    "\u540e\u7eed\u5199",
    "\u5f85\u5199",
    "\u8865\u5199",
    "\u6269\u5199",
    "todo",
    "TODO"
  ],
  statusOptions: DEFAULT_STATUS_OPTIONS,
  defaultThinkColor: "amber",
  defaultWriteColor: "sky",
  externalApi: {
    enabled: false,
    bindHost: "127.0.0.1",
    port: 48321,
    token: "",
    allowQueryTokenForRead: true,
    publicBaseUrl: ""
  },
  deviceCapture: {
    enabled: true,
    inboxFile: "00-Raw/Device Inbox.md",
    targetFolders: ["00-Raw", "01-Sparks", "02-Processing"],
    defaultTags: ["capture", "device"]
  },
  deviceProfiles: DEFAULT_DEVICE_PROFILES,
  workflowStages: {
    enabled: false,
    stages: DEFAULT_WORKFLOW_STAGES
  },
  reminderPresets: DEFAULT_REMINDER_PRESETS,
  ai: {
    enabled: false,
    baseUrl: "",
    apiKey: "",
    model: "gpt-4o-mini",
    autoRun: false,
    maxAutoRunsPerSession: 5,
    rerankLocalNotes: true
  },
  quote0: DEFAULT_QUOTE0_SETTINGS,
  push: DEFAULT_PUSH_SETTINGS,
  writeArticleProperties: false
};

export function normalizeDeviceProfiles(profiles?: ToWriteDeviceProfileSettings[]): ToWriteDeviceProfileSettings[] {
  const source = Array.isArray(profiles) && profiles.length > 0 ? profiles : DEFAULT_DEVICE_PROFILES;
  const seen = new Set<string>();
  const output: ToWriteDeviceProfileSettings[] = [];

  for (const profile of source) {
    const id = normalizeDeviceProfileId(profile.id || profile.name);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    output.push({
      id,
      name: String(profile.name ?? "").trim() || id,
      profile: normalizeDeviceProfileKind(profile.profile),
      width: clampIntegerSetting(profile.width, 80, 2400, 264),
      height: clampIntegerSetting(profile.height, 80, 2400, 176),
      inches: clampNumberSetting(profile.inches, 1, 32, 2.7),
      defaultPage: normalizeDeviceProfilePage(profile.defaultPage),
      defaultLane: profile.defaultLane === "think" || profile.defaultLane === "write" ? profile.defaultLane : "",
      refreshSeconds: clampIntegerSetting(profile.refreshSeconds, 15, 86400, 300)
    });
  }

  return output.length > 0 ? output : DEFAULT_DEVICE_PROFILES;
}

export function normalizeReminderPresets(presets?: ToWriteReminderPreset[]): ToWriteReminderPreset[] {
  const source = Array.isArray(presets) && presets.length > 0 ? presets : DEFAULT_REMINDER_PRESETS;
  const seen = new Set<string>();
  const output: ToWriteReminderPreset[] = [];

  for (const preset of source) {
    const label = String(preset.label ?? "").trim();
    const value = String(preset.value ?? "").trim();
    const key = `${label}\u0000${value}`;
    if (!label || !value || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push({ label, value });
  }

  return output.length > 0 ? output : DEFAULT_REMINDER_PRESETS;
}

export function normalizeQuote0Settings(settings?: Partial<ToWriteQuote0Settings>): ToWriteQuote0Settings {
  return {
    ...DEFAULT_QUOTE0_SETTINGS,
    ...(settings ?? {}),
    enabled: settings?.enabled === true,
    apiBaseUrl: normalizeQuote0ApiBaseUrl(settings?.apiBaseUrl),
    apiKey: String(settings?.apiKey ?? "").trim(),
    deviceId: normalizeQuote0ShortText(settings?.deviceId, 120),
    taskKey: normalizeQuote0ShortText(settings?.taskKey, 120),
    taskAlias: normalizeQuote0ShortText(settings?.taskAlias, 100) || DEFAULT_QUOTE0_SETTINGS.taskAlias,
    refreshSeconds: clampIntegerSetting(settings?.refreshSeconds, 60, 86400, DEFAULT_QUOTE0_SETTINGS.refreshSeconds),
    lane: settings?.lane === "think" || settings?.lane === "write" ? settings.lane : "",
    nfcToken: normalizeQuote0ShortText(settings?.nfcToken, 160),
    cursor: clampIntegerSetting(settings?.cursor, 0, 100000, 0),
    lastSyncedQuestionId: normalizeQuote0ShortText(settings?.lastSyncedQuestionId, 120),
    lastSyncedAt: normalizeQuote0ShortText(settings?.lastSyncedAt, 80),
    lastError: normalizeQuote0ShortText(settings?.lastError, 400)
  };
}

export function normalizePushSettings(
  settings?: Partial<ToWritePushSettings>,
  quote0?: ToWriteQuote0Settings
): ToWritePushSettings {
  const normalizedQuote0 = quote0 ?? DEFAULT_QUOTE0_SETTINGS;
  const targets = normalizePushTargets(settings?.targets, normalizedQuote0);
  return {
    ...DEFAULT_PUSH_SETTINGS,
    ...(settings ?? {}),
    enabled: settings?.enabled === true || normalizedQuote0.enabled,
    privacy: {
      level: settings?.privacy?.level === "precise-location" || settings?.privacy?.level === "no-location"
        ? settings.privacy.level
        : "local-coarse",
      allowPreciseLocation: settings?.privacy?.allowPreciseLocation === true,
      shareWithAi: settings?.privacy?.shareWithAi === true
    },
    targets,
    habits: normalizePushHabits(settings?.habits),
    habitText: String(settings?.habitText ?? "").trim().slice(0, 4000),
    aiRerank: settings?.aiRerank === true
  };
}

function normalizePushTargets(targets: PushTargetSettings[] | undefined, quote0: ToWriteQuote0Settings): PushTargetSettings[] {
  const source = Array.isArray(targets) && targets.length > 0
    ? targets
    : DEFAULT_PUSH_SETTINGS.targets;
  const seen = new Set<string>();
  const output: PushTargetSettings[] = [];

  for (const target of source) {
    const id = normalizePushId(target.id || target.name);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    output.push({
      id,
      name: normalizePushShortText(target.name, 100) || id,
      type: normalizePushTargetType(target.type),
      enabled: target.enabled === true,
      profile: normalizeDeviceProfileKind(target.profile),
      width: clampIntegerSetting(target.width, 80, 2400, 264),
      height: clampIntegerSetting(target.height, 80, 2400, 176),
      inches: clampNumberSetting(target.inches, 1, 32, 2.7),
      defaultPage: normalizeDeviceProfilePage(target.defaultPage),
      defaultLane: target.defaultLane === "think" || target.defaultLane === "write" ? target.defaultLane : "",
      refreshSeconds: clampIntegerSetting(target.refreshSeconds, 15, 86400, 300),
      quietHoursStart: normalizeTime(target.quietHoursStart),
      quietHoursEnd: normalizeTime(target.quietHoursEnd),
      token: normalizePushShortText(target.token, 200),
      capabilities: normalizePushStringList(target.capabilities).slice(0, 12)
    });
  }

  const quoteTargetIndex = output.findIndex((target) => target.id === "quote0");
  const quoteTarget: PushTargetSettings = {
    id: "quote0",
    name: "quote0",
    type: "quote0",
    enabled: quote0.enabled,
    profile: "eink-bw",
    width: 264,
    height: 176,
    inches: 2.7,
    defaultPage: "cards",
    defaultLane: quote0.lane,
    refreshSeconds: quote0.refreshSeconds,
    quietHoursStart: "",
    quietHoursEnd: "",
    token: quote0.nfcToken,
    capabilities: ["push", "nfc", "text-api"]
  };

  if (quoteTargetIndex >= 0) {
    output[quoteTargetIndex] = {
      ...output[quoteTargetIndex],
      type: "quote0",
      profile: "eink-bw",
      width: 264,
      height: 176,
      inches: 2.7,
      defaultPage: "cards",
      defaultLane: quote0.lane || output[quoteTargetIndex].defaultLane,
      refreshSeconds: quote0.refreshSeconds || output[quoteTargetIndex].refreshSeconds,
      token: quote0.nfcToken || output[quoteTargetIndex].token,
      capabilities: uniquePushList([...output[quoteTargetIndex].capabilities, "push", "nfc", "text-api"]),
      enabled: quote0.enabled || output[quoteTargetIndex].enabled
    };
  } else {
    output.push(quoteTarget);
  }

  return output.length > 0 ? output : DEFAULT_PUSH_SETTINGS.targets;
}

function normalizePushHabits(habits: PushHabitRule[] | undefined): PushHabitRule[] {
  const source = Array.isArray(habits) && habits.length > 0 ? habits : DEFAULT_PUSH_SETTINGS.habits;
  const seen = new Set<string>();
  const output: PushHabitRule[] = [];

  for (const habit of source) {
    const id = normalizePushId(habit.id || habit.label);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    output.push({
      id,
      label: normalizePushShortText(habit.label, 100) || id,
      enabled: habit.enabled !== false,
      timeStart: normalizeTime(habit.timeStart),
      timeEnd: normalizeTime(habit.timeEnd),
      placeLabel: normalizePushShortText(habit.placeLabel, 80),
      mode: normalizePushShortText(habit.mode, 80),
      stageIds: normalizePushStringList(habit.stageIds).map(normalizePushId).filter(Boolean),
      lanes: normalizePushStringList(habit.lanes).filter((item): item is OpenQuestionLane => item === "think" || item === "write"),
      statuses: normalizePushStringList(habit.statuses) as PushHabitRule["statuses"],
      targetIds: normalizePushStringList(habit.targetIds).map(normalizePushId).filter(Boolean),
      boost: clampIntegerSetting(habit.boost, -100, 100, 10),
      limitPerDay: clampIntegerSetting(habit.limitPerDay, 0, 500, 0)
    });
  }

  return output;
}

function normalizePushTargetType(value: unknown): PushTargetSettings["type"] {
  return value === "quote0" || value === "mobile-app" || value === "local-web" || value === "webhook" ? value : "local-web";
}

function normalizePushId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9_-]/gu, "")
    .slice(0, 80);
}

function normalizePushShortText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizePushStringList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : String(value ?? "").split(/[,;\n|\uFF0C\u3001\uFF1B]+/u);
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const text = String(item).trim();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    output.push(text);
  }
  return output;
}

function uniquePushList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeTime(value: unknown): string {
  const text = String(value ?? "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/u.test(text) ? text : "";
}

export function normalizeExternalApiBindHost(value?: string): string {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (!trimmed) {
    return DEFAULT_SETTINGS.externalApi.bindHost;
  }

  if (trimmed === "localhost") {
    return "127.0.0.1";
  }

  if (trimmed === "*" || trimmed === "::" || trimmed === "[::]" || trimmed === "0.0.0" || trimmed === "0.0.0.") {
    return "0.0.0.0";
  }

  if (isIpv4Address(trimmed) || isHostname(trimmed)) {
    return trimmed;
  }

  return DEFAULT_SETTINGS.externalApi.bindHost;
}

export function normalizeExternalApiPublicBaseUrl(value?: string): string {
  const trimmed = value?.trim().replace(/\/+$/u, "") ?? "";
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/u, "");
  } catch {
    return "";
  }
}

export function normalizeQuote0ApiBaseUrl(value?: string): string {
  const trimmed = value?.trim().replace(/\/+$/u, "") ?? "";
  if (!trimmed) {
    return DEFAULT_QUOTE0_SETTINGS.apiBaseUrl;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return DEFAULT_QUOTE0_SETTINGS.apiBaseUrl;
    }
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/u, "");
  } catch {
    return DEFAULT_QUOTE0_SETTINGS.apiBaseUrl;
  }
}

function normalizeQuote0ShortText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function isIpv4Address(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d+$/u.test(part)) {
      return false;
    }
    const number = Number(part);
    return number >= 0 && number <= 255;
  });
}

function isHostname(value: string): boolean {
  if (value.endsWith(".") || value.length > 253) {
    return false;
  }
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/u.test(value);
}


function normalizeDeviceProfileId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9_-]/gu, "");
}

function normalizeDeviceProfileKind(value: unknown): ToWriteDeviceProfileKind {
  return value === "mobile-eink" || value === "eink-bw" || value === "desktop-card" ? value : "eink-bw";
}

function normalizeDeviceProfilePage(value: unknown): ToWriteDeviceProfilePage {
  return value === "cards" || value === "workflow" || value === "articles" || value === "home" ? value : "home";
}

function clampIntegerSetting(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function clampNumberSetting(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}
