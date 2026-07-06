import type { OpenQuestionColor, OpenQuestionLane, QuestionStatusOption } from "./types";

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
  writeArticleProperties: boolean;
}

export interface ToWriteSavedData {
  settings: ToWriteSettings;
  questionStates: Record<string, import("./types").StoredQuestionState>;
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
