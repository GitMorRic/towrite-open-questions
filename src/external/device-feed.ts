import type { ArticleSummary, OpenQuestion, OpenQuestionLane, OpenQuestionStatus } from "../core/types";
import { mergeArticleSummariesWithWorkflow } from "../core/articles";
import { stripQuestionRuleSyntax } from "../core/rule-text";
import type { WorkflowFileSummary, WorkflowIndexPayload, WorkflowStageSummary } from "../workflow";
import { buildDeviceInputUrl, deliveryIdFor, laneIntentLabel, type DeviceInteractionAction, type DeviceSourceRef } from "../device-interactions";
import { buildObsidianUri } from "./payloads";

export type DeviceProfile = "mobile-eink" | "eink-bw" | "desktop-card";
export type DeviceFeedPage = "home" | "cards" | "workflow" | "articles";
export type DeviceOrientation = "portrait" | "landscape" | "unknown";
export type DeviceLayout = "portrait-card" | "landscape-compact" | "desktop-card";

export interface DeviceFeedQuery {
  profile?: DeviceProfile;
  width?: number;
  height?: number;
  inches?: number;
  token?: string;
  companionBaseUrl?: string;
  page?: DeviceFeedPage;
  cursor?: string;
  limit?: number;
  targetId?: string;
  lane?: OpenQuestionLane;
  stage?: string;
  sourceFile?: string;
}

export interface DeviceFeedPayload {
  schemaVersion: 1;
  generatedAt: string;
  vaultName: string;
  profile: DeviceProfile;
  device: {
    width?: number;
    height?: number;
    inches?: number;
    orientation: DeviceOrientation;
    aspectRatio?: number;
    ppi?: number;
    layout: DeviceLayout;
    page: DeviceFeedPage;
    lane?: OpenQuestionLane;
    stage?: string;
    sourceFile?: string;
    limit: number;
  };
  summary: DeviceSummary;
  workflow: DeviceWorkflowSummary;
  screens: DeviceScreen[];
  navigation: DeviceNavigation;
  actions: DeviceAction[];
}

export interface DeviceSummary {
  think: number;
  write: number;
  unresolved: number;
  candidate: number;
  blockedArticles: number;
  workflowFiles: number;
  workflowStages: number;
  remindersDue: number;
  remindersUpcoming: number;
}

export interface DeviceWorkflowSummary {
  enabled: boolean;
  uniqueFiles: number;
  stages: DeviceWorkflowStage[];
}

export interface DeviceWorkflowStage {
  id: string;
  title: string;
  description: string;
  color: string;
  count: number;
  staleCount: number;
  nextActions: Array<{
    title: string;
    filePath: string;
    openUri: string;
  }>;
}

export interface DeviceNavigation {
  page: DeviceFeedPage;
  cursor: string;
  limit: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevCursor?: string;
  nextCursor?: string;
}

export type DeviceAction = DeviceInteractionAction;

export interface DeviceScreen {
  id: string;
  type: DeviceFeedPage;
  title: string;
  subtitle?: string;
  items: DeviceScreenItem[];
  peekItems?: DeviceCardPreviewItem[];
  openUri?: string;
  companionUrl?: string;
  qrText?: string;
  actions: DeviceAction[];
}

export type DeviceScreenItem =
  | DeviceStatGridItem
  | DeviceWorkflowStageItem
  | DeviceNextActionItem
  | DeviceCardItem
  | DeviceWorkflowFileItem
  | DeviceArticleItem
  | DeviceEmptyItem;

export interface DeviceStatGridItem {
  type: "stats";
  stats: Array<{
    label: string;
    value: number;
    hint?: string;
  }>;
}

export interface DeviceWorkflowStageItem {
  type: "workflow-stage";
  stages: DeviceWorkflowStage[];
}

export interface DeviceNextActionItem {
  type: "next-actions";
  actions: Array<{
    title: string;
    source: string;
    openUri: string;
  }>;
}

export interface DeviceCardItem {
  type: "card";
  id: string;
  title: string;
  body: string;
  note: string;
  source: string;
  sourceFile: string;
  sourceLine: number;
  sourceEndLine?: number;
  sourceBlockId?: string;
  sourcePage?: number;
  sourceRef?: DeviceSourceRef;
  lane: OpenQuestionLane;
  status: OpenQuestionStatus;
  kind: string;
  tags: string[];
  reminderAt?: string;
  reminderNote?: string;
  reminderDue?: boolean;
  openUri: string;
  answerUrl?: string;
  deliveryId?: string;
  updatedAt?: string;
}

export interface DeviceCardPreviewItem {
  type: "card-preview";
  id: string;
  title: string;
  source: string;
  lane: OpenQuestionLane;
  status: OpenQuestionStatus;
  kind: string;
  answerUrl?: string;
  openUri: string;
  deliveryId?: string;
  sourceRef?: DeviceSourceRef;
}

export interface DeviceWorkflowFileItem {
  type: "workflow-file";
  stageId: string;
  stageTitle: string;
  color: string;
  filePath: string;
  title: string;
  description: string;
  nextAction: string;
  tags: string[];
  stale: boolean;
  ageDays: number;
  openQuestionCount: number;
  thinkCount: number;
  writeCount: number;
  openUri: string;
  updatedAt: string;
}

export interface DeviceArticleItem {
  type: "article";
  filePath: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  ageDays?: number;
  oldestOpenAgeDays?: number;
  statusLabel?: string;
  stageId?: string;
  stageTitle?: string;
  stale?: boolean;
  open: number;
  candidate: number;
  resolved: number;
  think: number;
  write: number;
  topIssues: Array<{
    id: string;
    title: string;
    lane: OpenQuestionLane;
    status: OpenQuestionStatus;
  }>;
  cardsUrl?: string;
  openUri: string;
}

export interface DeviceEmptyItem {
  type: "empty";
  text: string;
}

interface ProfileSpec {
  cardsLimit: number;
  workflowLimit: number;
  articleLimit: number;
  titleLength: number;
  bodyLength: number;
  noteLength: number;
  workflowDescriptionLength: number;
  nextActions: number;
  previewCards: number;
}

interface DeviceContext {
  width?: number;
  height?: number;
  inches?: number;
  orientation: DeviceOrientation;
  aspectRatio?: number;
  ppi?: number;
  layout: DeviceLayout;
}

const PROFILE_SPECS: Record<DeviceProfile, ProfileSpec> = {
  "mobile-eink": {
    cardsLimit: 1,
    workflowLimit: 4,
    articleLimit: 4,
    titleLength: 40,
    bodyLength: 180,
    noteLength: 120,
    workflowDescriptionLength: 140,
    nextActions: 5,
    previewCards: 1
  },
  "eink-bw": {
    cardsLimit: 1,
    workflowLimit: 3,
    articleLimit: 3,
    titleLength: 28,
    bodyLength: 96,
    noteLength: 56,
    workflowDescriptionLength: 88,
    nextActions: 3,
    previewCards: 1
  },
  "desktop-card": {
    cardsLimit: 3,
    workflowLimit: 5,
    articleLimit: 5,
    titleLength: 60,
    bodyLength: 220,
    noteLength: 160,
    workflowDescriptionLength: 180,
    nextActions: 6,
    previewCards: 2
  }
};

function resolveDeviceContext(query: DeviceFeedQuery, profile: DeviceProfile): DeviceContext {
  const width = query.width && query.width > 0 ? query.width : undefined;
  const height = query.height && query.height > 0 ? query.height : undefined;
  const inches = query.inches && query.inches > 0 ? query.inches : undefined;
  const orientation: DeviceOrientation = width && height
    ? width >= height ? "landscape" : "portrait"
    : "unknown";
  const aspectRatio = width && height ? Number((width / height).toFixed(3)) : undefined;
  const ppi = width && height && inches ? Number((Math.sqrt(width ** 2 + height ** 2) / inches).toFixed(1)) : undefined;
  const layout: DeviceLayout = profile === "desktop-card"
    ? "desktop-card"
    : orientation === "landscape" ? "landscape-compact" : "portrait-card";

  return {
    width,
    height,
    inches,
    orientation,
    aspectRatio,
    ppi,
    layout
  };
}

function adaptSpecForDevice(spec: ProfileSpec, profile: DeviceProfile, device: DeviceContext): ProfileSpec {
  if (isTinyLandscapeScreen(device)) {
    return {
      ...spec,
      cardsLimit: 1,
      workflowLimit: 1,
      articleLimit: 1,
      titleLength: Math.min(spec.titleLength, 34),
      bodyLength: Math.min(spec.bodyLength, 96),
      noteLength: Math.min(spec.noteLength, 52),
      workflowDescriptionLength: Math.min(spec.workflowDescriptionLength, 68),
      nextActions: Math.min(spec.nextActions, 2),
      previewCards: 1
    };
  }

  if (isMediumLandscapeScreen(device)) {
    return {
      ...spec,
      cardsLimit: Math.max(spec.cardsLimit, 2),
      previewCards: Math.max(spec.previewCards, 1)
    };
  }

  if (profile === "desktop-card" || device.layout !== "landscape-compact") {
    return spec;
  }

  return {
    ...spec,
    cardsLimit: 1,
    workflowLimit: Math.min(5, Math.max(spec.workflowLimit, 4)),
    articleLimit: Math.min(5, Math.max(spec.articleLimit, 4)),
    titleLength: Math.min(spec.titleLength, 34),
    bodyLength: Math.min(spec.bodyLength, 120),
    noteLength: Math.min(spec.noteLength, 72),
    workflowDescriptionLength: Math.min(spec.workflowDescriptionLength, 96),
    nextActions: Math.min(spec.nextActions, 4),
    previewCards: Math.min(spec.previewCards, 1)
  };
}

function isTinyLandscapeScreen(device: DeviceContext): boolean {
  return device.orientation === "landscape"
    && Boolean(device.width && device.height)
    && (device.width ?? 0) <= 320
    && (device.height ?? 0) <= 220;
}

function isMediumLandscapeScreen(device: DeviceContext): boolean {
  return device.orientation === "landscape"
    && Boolean(device.width && device.height)
    && (device.width ?? 0) >= 360
    && (device.height ?? 0) >= 260;
}

export function deviceFeedQueryFromUrl(url: URL): DeviceFeedQuery {
  return {
    profile: normalizeProfile(url.searchParams.get("profile")),
    width: parsePositiveInteger(url.searchParams.get("width"), 0) || undefined,
    height: parsePositiveInteger(url.searchParams.get("height"), 0) || undefined,
    inches: parsePositiveNumber(url.searchParams.get("inches"), 0) || undefined,
    page: normalizePage(url.searchParams.get("page")),
    cursor: normalizeCursor(url.searchParams.get("cursor")),
    limit: parsePositiveInteger(url.searchParams.get("limit"), 0) || undefined,
    targetId: url.searchParams.get("targetId")?.trim() || undefined,
    lane: normalizeLane(url.searchParams.get("lane")),
    stage: url.searchParams.get("stage")?.trim() || undefined,
    sourceFile: url.searchParams.get("sourceFile")?.trim() || undefined
  };
}

export function buildDeviceFeedPayload(
  vaultName: string,
  questions: OpenQuestion[],
  articles: ArticleSummary[],
  workflowPayload: WorkflowIndexPayload,
  query: DeviceFeedQuery = {},
  generatedAt = new Date().toISOString()
): DeviceFeedPayload {
  const profile = query.profile ?? "mobile-eink";
  const page = query.page ?? "home";
  const device = resolveDeviceContext(query, profile);
  const spec = adaptSpecForDevice(PROFILE_SPECS[profile], profile, device);
  const limit = resolveLimit(query.limit, defaultLimitForPage(page, spec));
  const cursor = normalizeCursor(query.cursor);
  const offset = parseCursor(cursor);
  const workQuestions = questions.filter((question) => isWorkStatus(question.status));
  const nowMs = Date.parse(generatedAt);
  const enrichedArticles = mergeArticleSummariesWithWorkflow(articles, workflowPayload, generatedAt);
  const summary = buildSummary(workQuestions, questions, enrichedArticles, workflowPayload, Number.isFinite(nowMs) ? nowMs : Date.now());
  const workflow = buildWorkflowSummary(workflowPayload, spec);
  const pageData = buildScreenForPage({
    vaultName,
    workQuestions,
    articles: enrichedArticles,
    workflowPayload,
    page,
    offset,
    limit,
    query,
    spec,
    nowMs: Number.isFinite(nowMs) ? nowMs : Date.now()
  });
  const navigation = buildNavigation(page, cursor, offset, limit, pageData.total);
  const actions = buildPageActions(navigation);
  const screens = pageData.screens.map((screen) => ({
    ...screen,
    actions: [
      ...screen.actions,
      ...actions.filter((action) => action.id === "prev" || action.id === "next")
    ]
  }));

  return {
    schemaVersion: 1,
    generatedAt,
    vaultName,
    profile,
    device: {
      width: device.width,
      height: device.height,
      inches: device.inches,
      orientation: device.orientation,
      aspectRatio: device.aspectRatio,
      ppi: device.ppi,
      layout: device.layout,
      page,
      lane: query.lane,
      stage: query.stage,
      sourceFile: query.sourceFile,
      limit
    },
    summary,
    workflow,
    screens,
    navigation,
    actions
  };
}

function buildSummary(
  workQuestions: OpenQuestion[],
  allQuestions: OpenQuestion[],
  articles: ArticleSummary[],
  workflowPayload: WorkflowIndexPayload,
  nowMs: number
): DeviceSummary {
  return {
    think: workQuestions.filter((question) => question.lane === "think").length,
    write: workQuestions.filter((question) => question.lane === "write").length,
    unresolved: workQuestions.length,
    candidate: allQuestions.filter((question) => question.status === "candidate").length,
    blockedArticles: articles.filter((article) => article.needsWork).length,
    workflowFiles: workflowPayload.enabled ? workflowPayload.counts.uniqueFiles : 0,
    workflowStages: workflowPayload.enabled ? workflowPayload.counts.stages : 0,
    remindersDue: workQuestions.filter((question) => isReminderDue(question.reminderAt, nowMs)).length,
    remindersUpcoming: workQuestions.filter((question) => isReminderUpcoming(question.reminderAt, nowMs)).length
  };
}

function buildWorkflowSummary(workflowPayload: WorkflowIndexPayload, spec: ProfileSpec): DeviceWorkflowSummary {
  return {
    enabled: workflowPayload.enabled,
    uniqueFiles: workflowPayload.counts.uniqueFiles,
    stages: workflowPayload.stages.map((stage) => ({
      id: stage.id,
      title: truncateText(stage.title, spec.titleLength),
      description: truncateText(stage.description, spec.workflowDescriptionLength),
      color: stage.color,
      count: stage.count,
      staleCount: stage.staleCount,
      nextActions: uniqueNextActions(stage.files, spec.nextActions)
    }))
  };
}

function buildScreenForPage(options: {
  vaultName: string;
  workQuestions: OpenQuestion[];
  articles: ArticleSummary[];
  workflowPayload: WorkflowIndexPayload;
  page: DeviceFeedPage;
  offset: number;
  limit: number;
  query: DeviceFeedQuery;
  spec: ProfileSpec;
  nowMs: number;
}): { screens: DeviceScreen[]; total: number } {
  if (options.page === "cards") {
    return buildCardsScreen(options);
  }
  if (options.page === "workflow") {
    return buildWorkflowScreen(options);
  }
  if (options.page === "articles") {
    return buildArticlesScreen(options);
  }
  return buildHomeScreen(options);
}

function buildHomeScreen(options: {
  vaultName: string;
  workQuestions: OpenQuestion[];
  articles: ArticleSummary[];
  workflowPayload: WorkflowIndexPayload;
  query: DeviceFeedQuery;
  spec: ProfileSpec;
  nowMs: number;
}): { screens: DeviceScreen[]; total: number } {
  const workflow = buildWorkflowSummary(options.workflowPayload, options.spec);
  const remindersDue = options.workQuestions.filter((question) => isReminderDue(question.reminderAt, options.nowMs)).length;
  const nextActions = workflow.stages
    .flatMap((stage) => stage.nextActions.map((action) => ({
      title: action.title,
      source: stage.title,
      openUri: action.openUri
    })))
    .slice(0, options.spec.nextActions);
  const firstOpenUri = nextActions[0]?.openUri ?? (options.workQuestions[0] ? buildObsidianUri(options.vaultName, options.workQuestions[0]) : undefined);
  const quickCaptureUrl = buildInputUrl(options.query);

  return {
    total: 1,
    screens: [
      {
        id: "home",
        type: "home",
        title: "小屏首页",
        subtitle: "ToThink / ToWrite / Workflow 总览",
        openUri: firstOpenUri,
        companionUrl: quickCaptureUrl,
        qrText: quickCaptureUrl,
        actions: [
          quickCaptureAction(quickCaptureUrl),
          ...(firstOpenUri ? [openSourceAction(firstOpenUri)] : [])
        ],
        items: [
          {
            type: "stats",
            stats: [
              { label: "ToThink", value: options.workQuestions.filter((question) => question.lane === "think").length },
              { label: "ToWrite", value: options.workQuestions.filter((question) => question.lane === "write").length },
              { label: "未解决", value: options.workQuestions.length },
              { label: "有问题文章", value: options.articles.filter((article) => article.needsWork).length },
              { label: "提醒到期", value: remindersDue }
            ]
          },
          workflow.enabled
            ? { type: "workflow-stage", stages: workflow.stages }
            : { type: "empty", text: "Workflow Stages 还没有开启。" },
          nextActions.length > 0
            ? { type: "next-actions", actions: nextActions }
            : { type: "empty", text: "暂时没有下一步动作。" }
        ]
      }
    ]
  };
}

function buildCardsScreen(options: {
  vaultName: string;
  workQuestions: OpenQuestion[];
  articles: ArticleSummary[];
  offset: number;
  limit: number;
  query: DeviceFeedQuery;
  spec: ProfileSpec;
  nowMs: number;
}): { screens: DeviceScreen[]; total: number } {
  const filtered = options.workQuestions
    .filter((question) => !options.query.lane || question.lane === options.query.lane)
    .filter((question) => !options.query.sourceFile || question.source.file === options.query.sourceFile)
    .sort(compareQuestions);
  const cards = filtered.slice(options.offset, options.offset + options.limit)
    .map((question) => toDeviceCard(options.vaultName, question, options.spec, options.nowMs, options.query));
  const previewOffset = options.offset + options.limit;
  const peekItems = filtered
    .slice(previewOffset, previewOffset + options.spec.previewCards)
    .map((question) => toDeviceCardPreview(options.vaultName, question, options.spec, options.query));
  const openUri = cards[0]?.openUri;
  const answerUrl = cards[0]?.answerUrl;
  const quickCaptureUrl = buildInputUrl(options.query);
  const sourceTitle = options.query.sourceFile
    ? options.articles.find((article) => article.filePath === options.query.sourceFile)?.title || basenameWithoutExtension(options.query.sourceFile)
    : "";

  return {
    total: filtered.length,
    screens: [
      {
        id: `cards-${options.offset}`,
        type: "cards",
        title: options.query.sourceFile ? "来源卡片" : options.query.lane === "think" ? "ToThink 卡片" : options.query.lane === "write" ? "ToWrite 卡片" : "批注卡片",
        subtitle: [
          sourceTitle,
          filtered.length > 0 ? `${Math.min(options.offset + 1, filtered.length)} / ${filtered.length}` : "0 / 0"
        ].filter(Boolean).join(" · "),
        openUri,
        companionUrl: answerUrl ?? quickCaptureUrl,
        qrText: answerUrl ?? quickCaptureUrl,
        actions: [
          ...(answerUrl && cards[0] ? [answerCardAction(cards[0].id, answerUrl, cards[0])] : []),
          quickCaptureAction(quickCaptureUrl),
          ...(openUri ? [openSourceAction(openUri, cards[0]?.sourceRef)] : [])
        ],
        items: cards.length > 0 ? cards : [{ type: "empty", text: "没有可刷的卡片。" }],
        peekItems
      }
    ]
  };
}

function buildWorkflowScreen(options: {
  workflowPayload: WorkflowIndexPayload;
  offset: number;
  limit: number;
  query: DeviceFeedQuery;
  spec: ProfileSpec;
}): { screens: DeviceScreen[]; total: number } {
  const files = flattenWorkflowFiles(options.workflowPayload, options.query.stage, options.spec);
  const items = files.slice(options.offset, options.offset + options.limit);
  const openUri = items[0]?.openUri;
  const quickCaptureUrl = buildInputUrl(options.query);
  const title = options.query.stage
    ? options.workflowPayload.stages.find((stage) => stage.id === options.query.stage)?.title ?? "Workflow"
    : "Workflow";

  return {
    total: files.length,
    screens: [
      {
        id: `workflow-${options.offset}`,
        type: "workflow",
        title,
        subtitle: files.length > 0 ? `${Math.min(options.offset + 1, files.length)}-${Math.min(options.offset + options.limit, files.length)} / ${files.length}` : "0 / 0",
        openUri,
        companionUrl: quickCaptureUrl,
        qrText: quickCaptureUrl,
        actions: [
          quickCaptureAction(quickCaptureUrl),
          ...(openUri ? [openSourceAction(openUri, items[0] ? { filePath: items[0].filePath } : undefined)] : [])
        ],
        items: items.length > 0 ? items : [{ type: "empty", text: "没有匹配的 Workflow 文件。" }]
      }
    ]
  };
}

function buildArticlesScreen(options: {
  vaultName: string;
  articles: ArticleSummary[];
  offset: number;
  limit: number;
  query: DeviceFeedQuery;
  spec: ProfileSpec;
}): { screens: DeviceScreen[]; total: number } {
  const articles = options.articles
    .filter((article) => article.needsWork || article.candidate > 0 || Boolean(article.typeId || article.stageId))
    .sort((left, right) => (right.open + right.candidate) - (left.open + left.candidate) || left.title.localeCompare(right.title));
  const items = articles.slice(options.offset, options.offset + options.limit)
    .map((article) => toDeviceArticle(options.vaultName, article, options.spec, options.query));
  const openUri = items[0]?.openUri;
  const firstSourceFile = items[0]?.filePath;
  const quickCaptureUrl = buildInputUrl(options.query);

  return {
    total: articles.length,
    screens: [
      {
        id: `articles-${options.offset}`,
        type: "articles",
        title: "来源笔记",
        subtitle: articles.length > 0 ? `${Math.min(options.offset + 1, articles.length)}-${Math.min(options.offset + options.limit, articles.length)} / ${articles.length}` : "0 / 0",
        openUri,
        companionUrl: quickCaptureUrl,
        qrText: quickCaptureUrl,
        actions: [
          quickCaptureAction(quickCaptureUrl),
          ...(firstSourceFile ? [viewCardsAction(firstSourceFile)] : []),
          ...(openUri ? [openSourceAction(openUri, firstSourceFile ? { filePath: firstSourceFile } : undefined)] : [])
        ],
        items: items.length > 0 ? items : [{ type: "empty", text: "没有需要处理的来源笔记。" }]
      }
    ]
  };
}

function toDeviceCard(vaultName: string, question: OpenQuestion, spec: ProfileSpec, nowMs: number, query: DeviceFeedQuery): DeviceCardItem {
  const body = stripQuestionRuleSyntax(question.question, question.source.rule);
  const latestNote = question.notes?.at(-1)?.text ?? question.note ?? "";
  const sourceLine = question.source.lineStart + 1;
  const sourceEndLine = question.source.lineEnd + 1;
  const source = question.source.page
    ? `${question.source.file} P${question.source.page}`
    : `${question.source.file}:${sourceLine}`;
  const sourceRef: DeviceSourceRef = {
    vaultName,
    filePath: question.source.file,
    lineStart: sourceLine,
    lineEnd: sourceEndLine,
    blockId: question.source.blockId,
    page: question.source.page
  };
  const deliveryId = deliveryIdFor(query.targetId ?? "device-feed", question.id, new Date(nowMs).toISOString());

  return {
    type: "card",
    id: question.id,
    title: truncateText(question.title || question.source.headingPath.at(-1) || body || question.source.file, spec.titleLength),
    body: truncateText(body, spec.bodyLength),
    note: truncateText(latestNote, spec.noteLength),
    source: truncateText(source, spec.workflowDescriptionLength),
    sourceFile: question.source.file,
    sourceLine,
    sourceEndLine,
    sourceBlockId: question.source.blockId,
    sourcePage: question.source.page,
    sourceRef,
    lane: question.lane,
    status: question.status,
    kind: question.kind,
    tags: question.tags.slice(0, 6),
    reminderAt: question.reminderAt || undefined,
    reminderNote: question.reminderNote ? truncateText(question.reminderNote, spec.noteLength) : undefined,
    reminderDue: isReminderDue(question.reminderAt, nowMs),
    openUri: buildObsidianUri(vaultName, question),
    answerUrl: buildInputUrl(query, question.id, {
      candidateId: question.id,
      deliveryId,
      sourceRef
    }),
    deliveryId,
    updatedAt: question.updatedAt ?? question.createdAt
  };
}

function toDeviceCardPreview(vaultName: string, question: OpenQuestion, spec: ProfileSpec, query: DeviceFeedQuery): DeviceCardPreviewItem {
  const body = stripQuestionRuleSyntax(question.question, question.source.rule);
  const sourceLine = question.source.lineStart + 1;
  const source = question.source.page
    ? `${question.source.file} P${question.source.page}`
    : `${question.source.file}:${sourceLine}`;
  const sourceRef: DeviceSourceRef = {
    vaultName,
    filePath: question.source.file,
    lineStart: sourceLine,
    lineEnd: question.source.lineEnd + 1,
    blockId: question.source.blockId,
    page: question.source.page
  };
  const deliveryId = deliveryIdFor(query.targetId ?? "device-feed", question.id, question.updatedAt ?? question.createdAt ?? new Date().toISOString());

  return {
    type: "card-preview",
    id: question.id,
    title: truncateText(question.title || question.source.headingPath.at(-1) || body || question.source.file, spec.titleLength),
    source: truncateText(source, spec.workflowDescriptionLength),
    lane: question.lane,
    status: question.status,
    kind: question.kind,
    answerUrl: buildInputUrl(query, question.id, {
      candidateId: question.id,
      deliveryId,
      sourceRef
    }),
    openUri: buildObsidianUri(vaultName, question),
    deliveryId,
    sourceRef
  };
}

function toDeviceArticle(vaultName: string, article: ArticleSummary, spec: ProfileSpec, query: DeviceFeedQuery): DeviceArticleItem {
  return {
    type: "article",
    filePath: article.filePath,
    title: truncateText(article.title || article.filePath, spec.titleLength),
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
    ageDays: article.ageDays,
    oldestOpenAgeDays: article.oldestOpenAgeDays,
    statusLabel: article.statusLabel,
    stageId: article.stageId,
    stageTitle: article.stageTitle ? truncateText(article.stageTitle, spec.titleLength) : undefined,
    stale: article.stale,
    open: article.open,
    candidate: article.candidate,
    resolved: article.resolved,
    think: article.think,
    write: article.write,
    topIssues: article.topIssues.slice(0, 3).map((question) => ({
      id: question.id,
      title: truncateText(question.title || stripQuestionRuleSyntax(question.question, question.source.rule), spec.titleLength),
      lane: question.lane,
      status: question.status
    })),
    cardsUrl: buildCardsUrl(query, article.filePath),
    openUri: buildFileObsidianUri(vaultName, article.filePath)
  };
}

function flattenWorkflowFiles(
  workflowPayload: WorkflowIndexPayload,
  stageId: string | undefined,
  spec: ProfileSpec
): DeviceWorkflowFileItem[] {
  return workflowPayload.stages
    .filter((stage) => !stageId || stage.id === stageId)
    .flatMap((stage) => stage.files.map((file) => toDeviceWorkflowFile(stage, file, spec)))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title));
}

function toDeviceWorkflowFile(stage: WorkflowStageSummary, file: WorkflowFileSummary, spec: ProfileSpec): DeviceWorkflowFileItem {
  return {
    type: "workflow-file",
    stageId: stage.id,
    stageTitle: truncateText(stage.title, spec.titleLength),
    color: stage.color,
    filePath: file.filePath,
    title: truncateText(file.title, spec.titleLength),
    description: truncateText(file.description, spec.workflowDescriptionLength),
    nextAction: truncateText(file.nextAction, spec.bodyLength),
    tags: file.tags.slice(0, 6),
    stale: file.stale,
    ageDays: file.ageDays,
    openQuestionCount: file.openQuestionCount,
    thinkCount: file.thinkCount,
    writeCount: file.writeCount,
    openUri: file.openUri,
    updatedAt: file.updatedAt
  };
}

function uniqueNextActions(files: WorkflowFileSummary[], limit: number): DeviceWorkflowStage["nextActions"] {
  const seen = new Set<string>();
  const output: DeviceWorkflowStage["nextActions"] = [];
  for (const file of files) {
    const title = file.nextAction.trim();
    if (!title || seen.has(title)) {
      continue;
    }
    seen.add(title);
    output.push({
      title,
      filePath: file.filePath,
      openUri: file.openUri
    });
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}

function buildNavigation(page: DeviceFeedPage, cursor: string, offset: number, limit: number, total: number): DeviceNavigation {
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;
  return {
    page,
    cursor,
    limit,
    total,
    hasPrev,
    hasNext,
    prevCursor: hasPrev ? String(Math.max(0, offset - limit)) : undefined,
    nextCursor: hasNext ? String(offset + limit) : undefined
  };
}

function buildPageActions(navigation: DeviceNavigation): DeviceAction[] {
  return [
    { id: "home", label: "首页", kind: "navigate", page: "home", cursor: "0", enabled: navigation.page !== "home" },
    { id: "cards", label: "卡片", kind: "navigate", page: "cards", cursor: "0", enabled: navigation.page !== "cards" },
    { id: "workflow", label: "Workflow", kind: "navigate", page: "workflow", cursor: "0", enabled: navigation.page !== "workflow" },
    { id: "articles", label: "文章", kind: "navigate", page: "articles", cursor: "0", enabled: navigation.page !== "articles" },
    { id: "prev", label: "上一页", kind: "navigate", page: navigation.page, cursor: navigation.prevCursor ?? navigation.cursor, enabled: navigation.hasPrev },
    { id: "next", label: "下一页", kind: "navigate", page: navigation.page, cursor: navigation.nextCursor ?? navigation.cursor, enabled: navigation.hasNext }
  ];
}

function viewCardsAction(sourceFile: string): DeviceAction {
  return {
    id: "viewCards",
    label: "看卡片",
    kind: "navigate",
    page: "cards",
    cursor: "0",
    sourceFile,
    enabled: true
  };
}

function openSourceAction(uri: string, sourceRef?: DeviceSourceRef): DeviceAction {
  return {
    id: "openSource",
    label: "打开来源",
    kind: "open-source",
    url: uri,
    uri,
    obsidianUri: uri,
    sourceRef,
    enabled: true
  };
}

function answerCardAction(questionId: string, uri: string, card?: DeviceCardItem): DeviceAction {
  return {
    id: "answerCard",
    label: card ? laneIntentLabel(card.lane) : "回答",
    kind: "respond",
    questionId,
    candidateId: card?.id ?? questionId,
    candidateType: "question",
    deliveryId: card?.deliveryId,
    sourceRef: card?.sourceRef,
    url: uri,
    uri,
    qrText: uri,
    enabled: true
  };
}

function quickCaptureAction(uri: string | undefined): DeviceAction {
  return {
    id: "quickCapture",
    label: "新想法",
    kind: "capture",
    url: uri,
    uri,
    qrText: uri,
    enabled: Boolean(uri)
  };
}

function buildCardsUrl(query: DeviceFeedQuery, sourceFile: string): string | undefined {
  if (!query.token) {
    return undefined;
  }
  const params = new URLSearchParams();
  params.set("token", query.token);
  params.set("page", "cards");
  params.set("sourceFile", sourceFile);
  if (query.targetId) params.set("targetId", query.targetId);
  if (query.profile) params.set("profile", query.profile);
  const path = `/device?${params.toString()}`;
  return query.companionBaseUrl ? `${query.companionBaseUrl.replace(/\/+$/u, "")}${path}` : path;
}

function buildInputUrl(query: DeviceFeedQuery, questionId?: string, options: {
  candidateId?: string;
  deliveryId?: string;
  sourceRef?: DeviceSourceRef;
} = {}): string | undefined {
  return buildDeviceInputUrl(query.companionBaseUrl, {
    token: query.token,
    questionId,
    targetId: query.targetId,
    candidateId: options.candidateId,
    deliveryId: options.deliveryId,
    sourceRef: options.sourceRef
  });
}

function basenameWithoutExtension(path: string): string {
  const name = path.split(/[\\/]/u).pop() || path;
  return name.replace(/\.md$/iu, "");
}

function compareQuestions(left: OpenQuestion, right: OpenQuestion): number {
  const pinned = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned));
  if (pinned !== 0) {
    return pinned;
  }
  return (right.updatedAt ?? right.createdAt ?? "").localeCompare(left.updatedAt ?? left.createdAt ?? "")
    || left.source.file.localeCompare(right.source.file)
    || left.source.lineStart - right.source.lineStart;
}

function defaultLimitForPage(page: DeviceFeedPage, spec: ProfileSpec): number {
  if (page === "workflow") {
    return spec.workflowLimit;
  }
  if (page === "articles") {
    return spec.articleLimit;
  }
  if (page === "cards") {
    return spec.cardsLimit;
  }
  return 1;
}

function resolveLimit(value: number | undefined, fallback: number): number {
  if (!value || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(50, Math.floor(value)));
}

function parsePositiveInteger(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 10_000);
}

function parsePositiveNumber(value: string | null, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 1000);
}

function normalizeCursor(value: string | undefined | null): string {
  return String(Math.max(0, Number.parseInt(value ?? "0", 10) || 0));
}

function parseCursor(value: string): number {
  return Math.max(0, Number.parseInt(value, 10) || 0);
}

function normalizeProfile(value: string | null): DeviceProfile | undefined {
  return value === "mobile-eink" || value === "eink-bw" || value === "desktop-card" ? value : undefined;
}

function normalizePage(value: string | null): DeviceFeedPage | undefined {
  if (value === "home" || value === "cards" || value === "workflow" || value === "articles") {
    return value;
  }
  if (value === "card" || value === "deck") {
    return "cards";
  }
  if (value === "article") {
    return "articles";
  }
  return undefined;
}

function normalizeLane(value: string | null): OpenQuestionLane | undefined {
  return value === "think" || value === "write" ? value : undefined;
}

function isWorkStatus(status: string): boolean {
  return status !== "candidate" && status !== "resolved" && status !== "ignored";
}

function isReminderDue(value: string | undefined, nowMs: number): boolean {
  const timestamp = parseReminderTimestamp(value);
  return timestamp !== undefined && timestamp <= nowMs;
}

function isReminderUpcoming(value: string | undefined, nowMs: number): boolean {
  const timestamp = parseReminderTimestamp(value);
  if (timestamp === undefined || timestamp <= nowMs) {
    return false;
  }
  return timestamp - nowMs <= 7 * 24 * 60 * 60 * 1000;
}

function parseReminderTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function buildFileObsidianUri(vaultName: string, filePath: string): string {
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(filePath)}`;
}

function truncateText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/gu, " ").trim();
  const chars = Array.from(compact);
  if (chars.length <= maxLength) {
    return compact;
  }
  return `${chars.slice(0, Math.max(0, maxLength - 3)).join("")}...`;
}
