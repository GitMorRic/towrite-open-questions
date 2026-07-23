import type { HubContentAction, HubContentType, HubDisplayContent } from "./types";

export type EchoCardDisclosure = "none" | "ai_inference" | "ai_simulation" | "ai_perspective";

export interface EchoCardSchedule {
  enabled: boolean;
  weekdays: number[];
  localTime: string;
  durationMinutes: number;
}

/** A user-authored card. Reference presets are deliberately stored separately. */
export interface EchoCard {
  id: string;
  name: string;
  inLibrary: boolean;
  contentType: HubContentType;
  typeLabel: string;
  subject: string;
  context: string;
  content: string;
  whyNow: string;
  sourceLabel: string;
  disclosure: EchoCardDisclosure;
  actions: HubContentAction[];
  targetPath?: string;
  agentEligible: boolean;
  rotationEligible: boolean;
  schedule?: EchoCardSchedule;
  createdAt: string;
  updatedAt: string;
}

export interface EchoCardReferencePreset {
  readonly presetId: string;
  readonly locale: "zh-CN";
  readonly name: string;
  readonly contentType: HubContentType;
  readonly typeLabel: string;
  readonly subject: string;
  readonly context: string;
  readonly content: string;
  readonly whyNow: string;
  readonly sourceLabel: string;
  readonly disclosure: EchoCardDisclosure;
  readonly actions: readonly HubContentAction[];
}

export interface EchoCardLayoutIssue {
  field: "card" | "header" | "context" | "content" | "whyNow" | "sourceLabel" | "actions";
  code: "missing-core" | "too-long" | "too-many-actions" | "total-too-long";
  weightedUnits: number;
  limit: number;
}

export interface EchoCardLayoutValidation {
  fits: boolean;
  weightedUnits: number;
  maxWeightedUnits: number;
  issues: EchoCardLayoutIssue[];
}

export type EchoCardLayoutInput = Pick<
  EchoCard,
  "typeLabel" | "subject" | "context" | "content" | "whyNow" | "sourceLabel" | "disclosure"
> & { readonly actions: readonly HubContentAction[] };

export interface EchoCardCloneOptions {
  id?: string;
  now?: Date | string | number;
  crypto?: Pick<Crypto, "getRandomValues">;
}

export type CreateEmptyEchoCardOptions = EchoCardCloneOptions & Partial<Omit<EchoCard, "id" | "createdAt" | "updatedAt">>;

const CONTENT_TYPES = new Set<HubContentType>([
  "question_prompt",
  "note_continue",
  "title_only",
  "blank_capture",
  "excerpt",
  "quote",
  "on_this_day",
  "stale_note_nudge",
  "character_letter",
  "human_message",
  "wellbeing_reminder"
]);

const CONTENT_ACTIONS = new Set<HubContentAction>([
  "respond",
  "capture",
  "open",
  "next",
  "useful",
  "later",
  "skip"
]);

const DISCLOSURES = new Set<EchoCardDisclosure>([
  "none",
  "ai_inference",
  "ai_simulation",
  "ai_perspective"
]);

export const ECHO_CARD_MAX_COUNT = 50;
export const ECHO_CARD_ID_PATTERN = /^echo_[A-Za-z0-9_-]{22}$/u;
export const ECHO_CARD_LOCAL_ID_PREFIX = "echo-card:";

/** Storage limits protect data.json and Hub payloads; layout limits below are intentionally tighter. */
export const ECHO_CARD_HARD_LIMITS = Object.freeze({
  name: 80,
  typeLabel: 32,
  subject: 80,
  context: 240,
  content: 800,
  whyNow: 240,
  sourceLabel: 160,
  targetPath: 512
} as const);

/** Weighted units approximate a 2.7-inch screen: full-width glyphs count as two, line breaks as eight. */
export const ECHO_CARD_LAYOUT_LIMITS = Object.freeze({
  header: 72,
  context: 104,
  content: 240,
  whyNow: 104,
  sourceLabel: 80,
  total: 440,
  actions: 3
} as const);

const REFERENCE_PRESETS: EchoCardReferencePreset[] = [
  {
    presetId: "memory",
    locale: "zh-CN",
    name: "记忆回响：去年今天",
    contentType: "on_this_day",
    typeLabel: "记忆回响",
    subject: "《潮汐》",
    context: "去年今天，你第一次写下：",
    content: "“她讨厌等待。”",
    whyNow: "现在还认同这句话吗？",
    sourceLabel: "来自 2025.07.24 · 人物草稿第 1 版",
    disclosure: "none",
    actions: ["capture", "open", "later"]
  },
  {
    presetId: "place",
    locale: "zh-CN",
    name: "地点回响：现实与作品重叠",
    contentType: "excerpt",
    typeLabel: "地点回响",
    subject: "林屿 · 海",
    context: "你曾经三次让她站在岸边，却从未让她真正下水。",
    content: "今天看到的海，和她看到的有什么不同？",
    whyNow: "在海边时，让现实感受短暂接回作品。",
    sourceLabel: "来自《潮汐》的 3 条原文",
    disclosure: "none",
    actions: ["capture", "open", "later"]
  },
  {
    presetId: "unfinished",
    locale: "zh-CN",
    name: "未完成问题：恢复创作状态",
    contentType: "question_prompt",
    typeLabel: "未完成的问题",
    subject: "《潮汐》",
    context: "上次你停在：林屿把伞留给了对方。",
    content: "为什么这一次不同？",
    whyNow: "继续上次未完成的创作线索。",
    sourceLabel: "来自未解决问题",
    disclosure: "none",
    actions: ["respond", "open", "later"]
  },
  {
    presetId: "insight",
    locale: "zh-CN",
    name: "理解回响：人物规律",
    contentType: "excerpt",
    typeLabel: "理解回响",
    subject: "林屿",
    context: "她拒绝别人的伞；她总是提前离开；她说自己讨厌等待。",
    content: "她是在拒绝依赖，还是在控制离开的时机？",
    whyNow: "这是候选理解，不会写入正式设定。",
    sourceLabel: "依据：3 条可查看的原文",
    disclosure: "ai_inference",
    actions: ["respond", "open", "skip"]
  },
  {
    presetId: "character",
    locale: "zh-CN",
    name: "角色来信：角色视角问题",
    contentType: "character_letter",
    typeLabel: "角色来信",
    subject: "林屿",
    context: "“你说我不愿意解释，是因为我太骄傲。",
    content: "可如果我真正害怕的是：解释以后，你还是离开呢？”",
    whyNow: "角色视角的候选理解，不属于正式剧情。",
    sourceLabel: "依据：3 条已确认设定",
    disclosure: "ai_perspective",
    actions: ["respond", "open", "skip"]
  },
  {
    presetId: "world_l0",
    locale: "zh-CN",
    name: "世界脉搏 L0：状态回放",
    contentType: "note_continue",
    typeLabel: "世界脉搏 · L0",
    subject: "伊塔港",
    context: "当前世界仍停在：港口连续停电第 3 天。",
    content: "三条人物线尚未汇合。",
    whyNow: "只回放已确认状态，不创造新事实。",
    sourceLabel: "来自世界状态记录",
    disclosure: "none",
    actions: ["open", "capture", "later"]
  },
  {
    presetId: "world_l1",
    locale: "zh-CN",
    name: "世界脉搏 L1：规则变化",
    contentType: "note_continue",
    typeLabel: "世界脉搏 · L1",
    subject: "伊塔港",
    context: "3 天过去。",
    content: "灯塔燃料：已耗尽\n港口通航：暂停\n林屿：仍未向商会求助",
    whyNow: "只执行你已经确认的世界规则。",
    sourceLabel: "依据：燃料与人物规则",
    disclosure: "none",
    actions: ["open", "capture", "later"]
  },
  {
    presetId: "world_l2",
    locale: "zh-CN",
    name: "世界脉搏 L2：候选事件",
    contentType: "note_continue",
    typeLabel: "世界脉搏 · L2",
    subject: "伊塔港",
    context: "你离开后的第 3 天，港口再次熄灯。",
    content: "林屿没有去修，却一直站到天亮。",
    whyNow: "仅作为可能发生的微事件，需由你决定是否保留。",
    sourceLabel: "依据：已确认世界事实",
    disclosure: "ai_simulation",
    actions: ["useful", "open", "skip"]
  }
];

/** Read-only examples for the editor. They never become active cards until explicitly cloned. */
export const ECHO_CARD_REFERENCE_PRESETS: readonly EchoCardReferencePreset[] = deepFreeze(REFERENCE_PRESETS);
export const ECHO_CARD_REFERENCE_PRESETS_ZH_CN = ECHO_CARD_REFERENCE_PRESETS;

export function createEchoCardId(crypto: Pick<Crypto, "getRandomValues"> = globalThis.crypto): string {
  if (!crypto?.getRandomValues) throw new Error("Secure randomness is required to create an Echo card ID.");
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `echo_${base64Url(bytes)}`;
}

export function isEchoCardId(value: unknown): value is string {
  return typeof value === "string" && ECHO_CARD_ID_PATTERN.test(value);
}

export function echoCardLocalId(cardOrId: Pick<EchoCard, "id"> | string): string {
  const id = typeof cardOrId === "string" ? cardOrId : cardOrId.id;
  if (!isEchoCardId(id)) throw new Error("Invalid Echo card ID.");
  return `${ECHO_CARD_LOCAL_ID_PREFIX}${id}`;
}

export function parseEchoCardLocalId(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith(ECHO_CARD_LOCAL_ID_PREFIX)) return undefined;
  const id = value.slice(ECHO_CARD_LOCAL_ID_PREFIX.length);
  return isEchoCardId(id) ? id : undefined;
}

/**
 * Strict settings normalization: malformed and duplicate records are omitted,
 * while an intentionally empty list stays empty (reference presets are not defaults).
 */
export function normalizeEchoCards(value: unknown): EchoCard[] {
  if (!Array.isArray(value)) return [];
  const cards: EchoCard[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (cards.length >= ECHO_CARD_MAX_COUNT) break;
    const card = normalizeEchoCard(item);
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);
    cards.push(card);
  }
  return cards;
}

export function clonePreset(
  presetOrId: EchoCardReferencePreset | string,
  options: EchoCardCloneOptions = {}
): EchoCard {
  const preset = typeof presetOrId === "string"
    ? ECHO_CARD_REFERENCE_PRESETS.find((item) => item.presetId === presetOrId)
    : presetOrId;
  if (!preset || !ECHO_CARD_REFERENCE_PRESETS.some((item) => item.presetId === preset.presetId)) {
    throw new Error("Unknown Echo card reference preset.");
  }
  const id = options.id && isEchoCardId(options.id)
    ? options.id
    : createEchoCardId(options.crypto ?? globalThis.crypto);
  const timestamp = normalizeDate(options.now) ?? new Date().toISOString();
  return {
    id,
    name: preset.name,
    inLibrary: false,
    contentType: preset.contentType,
    typeLabel: preset.typeLabel,
    subject: preset.subject,
    context: preset.context,
    content: preset.content,
    whyNow: preset.whyNow,
    sourceLabel: preset.sourceLabel,
    disclosure: preset.disclosure,
    actions: [...preset.actions],
    agentEligible: false,
    rotationEligible: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export const cloneEchoCardPreset = clonePreset;

/** Creates an editable blank draft; it is never opted into delivery implicitly. */
export function createEmptyEchoCard(options: CreateEmptyEchoCardOptions = {}): EchoCard {
  const timestamp = normalizeDate(options.now) ?? new Date().toISOString();
  const id = options.id && isEchoCardId(options.id)
    ? options.id
    : createEchoCardId(options.crypto ?? globalThis.crypto);
  const contentType = CONTENT_TYPES.has(options.contentType as HubContentType)
    ? options.contentType as HubContentType
    : "blank_capture";
  const disclosure = DISCLOSURES.has(options.disclosure as EchoCardDisclosure)
    ? options.disclosure as EchoCardDisclosure
    : "none";
  const card: EchoCard = {
    id,
    name: singleLine(options.name, ECHO_CARD_HARD_LIMITS.name) || "未命名卡片",
    inLibrary: options.inLibrary === true,
    contentType,
    typeLabel: options.typeLabel ?? defaultTypeLabel(contentType),
    subject: options.subject ?? "",
    context: options.context ?? "",
    content: options.content ?? "",
    whyNow: options.whyNow ?? "",
    sourceLabel: options.sourceLabel ?? "",
    disclosure,
    actions: options.actions ? [...options.actions] : ["capture", "later"],
    ...(options.targetPath ? { targetPath: options.targetPath } : {}),
    agentEligible: options.agentEligible === true,
    rotationEligible: options.rotationEligible === true,
    ...(options.schedule ? { schedule: { ...options.schedule, weekdays: [...options.schedule.weekdays] } } : {}),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  return normalizeEchoCards([card])[0] ?? card;
}

/** Converts a stored card into the existing Hub title/body/prompt display protocol. */
export function composeEchoCardDisplay(card: EchoCard): HubDisplayContent {
  const disclosure = echoCardDisclosureLabel(card.disclosure);
  const title = [card.typeLabel, disclosure, card.subject].filter(Boolean).join(" · ");
  const body = [card.context, card.content].filter(Boolean).join("\n\n");
  const prompt = [card.whyNow, card.sourceLabel].filter(Boolean).join(" · ");
  return {
    ...(title ? { title } : {}),
    ...(body ? { body } : {}),
    ...(prompt ? { prompt } : {})
  };
}

export function echoCardDisclosureLabel(disclosure: EchoCardDisclosure, locale: "zh-CN" | "en" = "zh-CN"): string {
  if (locale === "en") {
    if (disclosure === "ai_inference") return "AI inference";
    if (disclosure === "ai_simulation") return "AI simulation";
    if (disclosure === "ai_perspective") return "AI perspective";
    return "";
  }
  if (disclosure === "ai_inference") return "AI 推测";
  if (disclosure === "ai_simulation") return "AI 模拟";
  if (disclosure === "ai_perspective") return "AI 视角";
  return "";
}

export function echoCardActionLabel(
  action: HubContentAction,
  card?: Pick<EchoCard, "contentType" | "disclosure">,
  locale: "zh-CN" | "en" = "zh-CN"
): string {
  if (locale === "en") {
    return ({ respond: "Respond", capture: "Record", open: "Open", next: "Next", useful: "Save", later: "Later", skip: "Skip" } as const)[action];
  }
  if (action === "skip" && card?.disclosure === "ai_inference") return "不对";
  if (action === "skip" && card?.disclosure === "ai_perspective") return "不像她";
  if (action === "useful" && card?.disclosure === "ai_simulation") return "保留可能";
  return ({ respond: "回答", capture: "录下", open: "打开", next: "下一条", useful: "收藏", later: "稍后", skip: "忽略" } as const)[action];
}

export function echoCardActionLabels(
  card: Pick<EchoCard, "actions" | "contentType" | "disclosure">,
  locale: "zh-CN" | "en" = "zh-CN"
): Array<{ action: HubContentAction; label: string }> {
  return card.actions.slice(0, ECHO_CARD_LAYOUT_LIMITS.actions).map((action) => ({
    action,
    label: echoCardActionLabel(action, card, locale)
  }));
}

export function echoCardWeightedUnits(value: string): number {
  let units = 0;
  for (const character of value) {
    if (character === "\n") units += 8;
    else if (/^[\u1100-\u115f\u2329\u232a\u2e80-\u303e\u3040-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]$/u.test(character) || character.codePointAt(0)! > 0xffff) units += 2;
    else units += 1;
  }
  return units;
}

export function validateEchoCardLayout(card: EchoCardLayoutInput): EchoCardLayoutValidation {
  const display = composeEchoCardDisplay(card as EchoCard);
  const headerUnits = echoCardWeightedUnits(display.title ?? "");
  const contextUnits = echoCardWeightedUnits(card.context);
  const contentUnits = echoCardWeightedUnits(card.content);
  const whyUnits = echoCardWeightedUnits(card.whyNow);
  const sourceUnits = echoCardWeightedUnits(card.sourceLabel);
  const weightedUnits = headerUnits + contextUnits + contentUnits + whyUnits + sourceUnits;
  const issues: EchoCardLayoutIssue[] = [];
  checkLayoutField(issues, "header", headerUnits, ECHO_CARD_LAYOUT_LIMITS.header);
  checkLayoutField(issues, "context", contextUnits, ECHO_CARD_LAYOUT_LIMITS.context);
  checkLayoutField(issues, "content", contentUnits, ECHO_CARD_LAYOUT_LIMITS.content);
  checkLayoutField(issues, "whyNow", whyUnits, ECHO_CARD_LAYOUT_LIMITS.whyNow);
  checkLayoutField(issues, "sourceLabel", sourceUnits, ECHO_CARD_LAYOUT_LIMITS.sourceLabel);
  if (!card.content.trim()) {
    issues.push({ field: "content", code: "missing-core", weightedUnits: 0, limit: ECHO_CARD_LAYOUT_LIMITS.content });
  }
  if (card.actions.length > ECHO_CARD_LAYOUT_LIMITS.actions) {
    issues.push({ field: "actions", code: "too-many-actions", weightedUnits: card.actions.length, limit: ECHO_CARD_LAYOUT_LIMITS.actions });
  }
  if (weightedUnits > ECHO_CARD_LAYOUT_LIMITS.total) {
    issues.push({ field: "card", code: "total-too-long", weightedUnits, limit: ECHO_CARD_LAYOUT_LIMITS.total });
  }
  return {
    fits: issues.length === 0,
    weightedUnits,
    maxWeightedUnits: ECHO_CARD_LAYOUT_LIMITS.total,
    issues
  };
}

function normalizeEchoCard(value: unknown): EchoCard | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (!isEchoCardId(raw.id) || !CONTENT_TYPES.has(raw.contentType as HubContentType)) return undefined;
  const name = singleLine(raw.name, ECHO_CARD_HARD_LIMITS.name);
  if (!name) return undefined;
  const contentType = raw.contentType as HubContentType;
  const createdAt = normalizeDate(raw.createdAt);
  const updatedAt = normalizeDate(raw.updatedAt) ?? createdAt;
  if (!createdAt || !updatedAt) return undefined;
  const actions = Array.isArray(raw.actions)
    ? unique(raw.actions.filter((action): action is HubContentAction => CONTENT_ACTIONS.has(action as HubContentAction))).slice(0, 3)
    : [];
  const targetPath = singleLine(raw.targetPath, ECHO_CARD_HARD_LIMITS.targetPath);
  const schedule = normalizeSchedule(raw.schedule);
  return {
    id: raw.id,
    name,
    inLibrary: raw.inLibrary === true,
    contentType,
    typeLabel: singleLine(raw.typeLabel, ECHO_CARD_HARD_LIMITS.typeLabel) || defaultTypeLabel(contentType),
    subject: singleLine(raw.subject, ECHO_CARD_HARD_LIMITS.subject),
    context: multiLine(raw.context, ECHO_CARD_HARD_LIMITS.context),
    content: multiLine(raw.content, ECHO_CARD_HARD_LIMITS.content),
    whyNow: multiLine(raw.whyNow, ECHO_CARD_HARD_LIMITS.whyNow),
    sourceLabel: singleLine(raw.sourceLabel, ECHO_CARD_HARD_LIMITS.sourceLabel),
    disclosure: DISCLOSURES.has(raw.disclosure as EchoCardDisclosure) ? raw.disclosure as EchoCardDisclosure : "none",
    actions: actions.length > 0 ? actions : ["capture"],
    ...(targetPath ? { targetPath } : {}),
    agentEligible: raw.agentEligible === true,
    rotationEligible: raw.rotationEligible === true,
    ...(schedule ? { schedule } : {}),
    createdAt,
    updatedAt
  };
}

function normalizeSchedule(value: unknown): EchoCardSchedule | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const localTime = singleLine(raw.localTime, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(localTime)) return undefined;
  const weekdays = Array.isArray(raw.weekdays)
    ? unique(raw.weekdays.filter((day): day is number => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6)).sort((left, right) => left - right)
    : [0, 1, 2, 3, 4, 5, 6];
  const duration = Number(raw.durationMinutes);
  return {
    enabled: raw.enabled !== false,
    weekdays: weekdays.length ? weekdays : [0, 1, 2, 3, 4, 5, 6],
    localTime,
    durationMinutes: Number.isInteger(duration) ? Math.max(5, Math.min(1440, duration)) : 30
  };
}

function defaultTypeLabel(type: HubContentType): string {
  return ({
    question_prompt: "未完成的问题",
    note_continue: "继续创作",
    title_only: "标题",
    blank_capture: "快速记录",
    excerpt: "内容回响",
    quote: "摘录",
    on_this_day: "记忆回响",
    stale_note_nudge: "久未继续",
    character_letter: "角色来信",
    human_message: "来信",
    wellbeing_reminder: "轻提醒"
  } as const)[type];
}

function checkLayoutField(issues: EchoCardLayoutIssue[], field: EchoCardLayoutIssue["field"], units: number, limit: number): void {
  if (units > limit) issues.push({ field, code: "too-long", weightedUnits: units, limit });
}

function singleLine(value: unknown, max: number): string {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return takeCodePoints(text, max);
}

function multiLine(value: unknown, max: number): string {
  const text = String(value ?? "")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/gu, "")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  return takeCodePoints(text, max);
}

function takeCodePoints(value: string, max: number): string {
  return Array.from(value).slice(0, max).join("");
}

function normalizeDate(value: unknown): string | undefined {
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function base64Url(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    output += alphabet[first >> 2];
    output += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) output += alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)];
    if (third !== undefined) output += alphabet[third & 63];
  }
  return output;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
