import { App, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import {
  DEFAULT_ARTICLE_TYPES,
  DEFAULT_STATUS_OPTIONS,
  DEFAULT_DEVICE_PROFILES,
  DEFAULT_REMINDER_PRESETS,
  DEFAULT_WORKFLOW_STAGES,
  ensureInboxWorkflowStage,
  normalizeExternalApiBindHost,
  normalizeExternalApiPublicBaseUrl,
  normalizeInboxSettings,
  normalizeArticleTypesSettings,
  normalizeDeviceProfiles,
  normalizePushSettings,
  normalizeQuote0ApiBaseUrl,
  normalizeReminderPresets,
  type ToWriteDeviceProfileSettings,
  type ToWriteLanguage,
  type ToWriteReminderPreset,
  type ToWriteSettings,
  type ArticleTypeSettings,
  type WorkflowStageSettings
} from "../core/settings";
import { OPEN_QUESTION_COLORS, type OpenQuestionColor, type OpenQuestionLane, type QuestionStatusOption } from "../core/types";
import type { PushDisplayCard, PushHabitRule, PushTargetSettings } from "../push/types";
import { DEFAULT_DEVICE_BUTTON_MAPPINGS, normalizeDeviceButtonMappings } from "../device-interactions";
import type ToWritePlugin from "../main";
import type { AiModelInfo } from "../ai/types";
import type { Quote0CanvasPayload, Quote0Device, Quote0ImagePayload, Quote0TextPayload } from "../quote0/client";
import type { Quote0SyncPreview } from "../quote0/sync-service";
import { normalizeCaptureBridgeBaseUrl } from "../capture-bridge";
import {
  createEchoCardId,
  echoCardActionLabel,
  echoCardDisclosureLabel,
  validateEchoCardLayout,
  type EchoCard,
  type EchoCardDisclosure,
  type EchoCardReferencePreset
} from "../hub/echo-cards";
import {
  buildEsp32DeviceEndpoints,
  isHubDeviceId,
  isPrivateTailscaleServeOrigin,
  normalizeEsp32HubOrigin
} from "../hub/esp32-config";
import type { HubContentAction, HubContentType } from "../hub/types";

type SettingsTabId = "general" | "cards" | "capture" | "inbox" | "learning" | "workflow" | "api" | "push" | "quote0" | "ai" | "backend" | "hub" | "about";

const ABOUT_LINKS = {
  repository: "https://github.com/GitMorRic/towrite-open-questions",
  releases: "https://github.com/GitMorRic/towrite-open-questions/releases",
  issues: "https://github.com/GitMorRic/towrite-open-questions/issues",
  readmeZh: "https://github.com/GitMorRic/towrite-open-questions/blob/main/README.zh-CN.md",
  readmeEn: "https://github.com/GitMorRic/towrite-open-questions#readme",
  // Set this after a real support page has been created; an empty value stays hidden.
  support: "" as string
} as const;

const ECHO_ACTION_OPTIONS: readonly HubContentAction[] = ["respond", "capture", "open", "next", "useful", "later", "skip"];

const ECHO_CONTENT_TYPE_OPTIONS: ReadonlyArray<{ value: HubContentType; zh: string; en: string }> = [
  { value: "question_prompt", zh: "未完成问题", en: "Unfinished question" },
  { value: "note_continue", zh: "继续创作", en: "Continue note" },
  { value: "title_only", zh: "标题笔记", en: "Title only" },
  { value: "blank_capture", zh: "快速记录", en: "Blank capture" },
  { value: "excerpt", zh: "内容回响 / 摘录", en: "Content echo / excerpt" },
  { value: "quote", zh: "语录", en: "Quote" },
  { value: "on_this_day", zh: "那年今日", en: "On this day" },
  { value: "stale_note_nudge", zh: "久未继续", en: "Stale-note nudge" },
  { value: "character_letter", zh: "角色来信", en: "Character letter" },
  { value: "human_message", zh: "他人来信", en: "Human message" },
  { value: "wellbeing_reminder", zh: "轻提醒", en: "Wellbeing reminder" }
];

type Quote0PreviewAction = {
  label: string;
  primary?: boolean;
  run(): Promise<void>;
};

type SettingCopy = {
  title: string;
  tabs: Record<SettingsTabId, string>;
  language: string;
  languageDesc: string;
  chinese: string;
  english: string;
  exportDirectory: string;
  exportDirectoryDesc: string;
  autoExport: string;
  autoExportDesc: string;
  autoOpenSidebar: string;
  autoOpenSidebarDesc: string;
  groupCurrentByHeading: string;
  groupCurrentByHeadingDesc: string;
  candidateDetection: string;
  candidateDetectionDesc: string;
  editorDecorations: string;
  editorDecorationsDesc: string;
  compactEditorDecorations: string;
  compactEditorDecorationsDesc: string;
  triggerWords: string;
  triggerWordsDesc: string;
  addPlaceholder: string;
  addTrigger: string;
  removeTrigger: string;
  statuses: string;
  statusesDesc: string;
  reminderPresets: string;
  reminderPresetsDesc: string;
  defaultThinkColor: string;
  defaultThinkColorDesc: string;
  defaultWriteColor: string;
  defaultWriteColorDesc: string;
  externalApi: string;
  externalApiDesc: string;
  externalApiBindHost: string;
  externalApiBindHostDesc: string;
  externalApiPort: string;
  externalApiPortDesc: string;
  externalApiToken: string;
  externalApiTokenDesc: string;
  externalApiQueryToken: string;
  externalApiQueryTokenDesc: string;
  externalApiPublicBaseUrl: string;
  externalApiPublicBaseUrlDesc: string;
  externalApiEndpoint: string;
  externalApiEndpointDesc: string;
  externalApiDashboard: string;
  externalApiDashboardDesc: string;
  externalApiDevice: string;
  externalApiDeviceDesc: string;
  push: string;
  pushDesc: string;
  pushEnabled: string;
  pushEnabledDesc: string;
  pushPrivacy: string;
  pushPrivacyDesc: string;
  pushPrivacyLocal: string;
  pushPrivacyPrecise: string;
  pushPrivacyNone: string;
  pushPreciseLocation: string;
  pushPreciseLocationDesc: string;
  pushAiRerank: string;
  pushAiRerankDesc: string;
  pushHabitText: string;
  pushHabitTextDesc: string;
  pushTargets: string;
  pushTargetsDesc: string;
  pushHabits: string;
  pushHabitsDesc: string;
  pushAddTarget: string;
  pushRemoveTarget: string;
  pushAddHabit: string;
  pushRemoveHabit: string;
  pushFeedUrl: string;
  quote0: string;
  quote0Desc: string;
  quote0ApiBaseUrl: string;
  quote0ApiBaseUrlDesc: string;
  quote0ApiKey: string;
  quote0ApiKeyDesc: string;
  quote0DeviceId: string;
  quote0DeviceIdDesc: string;
  quote0FetchDevices: string;
  quote0NoDevices: string;
  quote0DeviceStatus: string;
  quote0Scope: string;
  quote0ScopeDesc: string;
  quote0AllCards: string;
  quote0ThinkOnly: string;
  quote0WriteOnly: string;
  quote0RefreshSeconds: string;
  quote0RefreshSecondsDesc: string;
  quote0ForceRefreshAfterSend: string;
  quote0ForceRefreshAfterSendDesc: string;
  quote0TaskKey: string;
  quote0TaskKeyDesc: string;
  quote0TaskAlias: string;
  quote0TaskAliasDesc: string;
  quote0DashboardApi: string;
  quote0DashboardApiDesc: string;
  quote0DashboardText: string;
  quote0DashboardImage: string;
  quote0DashboardCanvas: string;
  quote0ImageTaskKey: string;
  quote0ImageTaskKeyDesc: string;
  quote0ImageTaskAlias: string;
  quote0ImageTaskAliasDesc: string;
  quote0ImageDither: string;
  quote0ImageDitherDesc: string;
  quote0ImageBorder: string;
  quote0ImageBorderDesc: string;
  quote0CanvasTaskAlias: string;
  quote0CanvasTaskAliasDesc: string;
  quote0CanvasBorder: string;
  quote0CanvasBorderDesc: string;
  quote0NfcToken: string;
  quote0NfcTokenDesc: string;
  quote0NfcLink: string;
  quote0NfcLinkDesc: string;
  quote0SendNext: string;
  quote0SendDashboard: string;
  quote0SendTest: string;
  quote0ForceRefresh: string;
  quote0ApplyInterval: string;
  quote0Preview: string;
  quote0PreviewDesc: string;
  quote0TextPreview: string;
  quote0TextPreviewDesc: string;
  quote0HomePreview: string;
  quote0HomePreviewDesc: string;
  quote0PreviewRefresh: string;
  quote0PreviewUnavailable: string;
  quote0LoopNotice: string;
  quote0LastSync: string;
  quote0MissingPublicBaseUrl: string;
  deviceCapture: string;
  deviceCaptureDesc: string;
  deviceCaptureInbox: string;
  deviceCaptureInboxDesc: string;
  deviceCaptureFolders: string;
  deviceCaptureFoldersDesc: string;
  deviceCaptureTags: string;
  deviceCaptureTagsDesc: string;
  deviceProfiles: string;
  deviceProfilesDesc: string;
  deviceProfileName: string;
  deviceProfileId: string;
  deviceProfileKind: string;
  deviceProfileSize: string;
  deviceProfileWidth: string;
  deviceProfileHeight: string;
  deviceProfileInches: string;
  deviceProfileDefaultPage: string;
  deviceProfileDefaultLane: string;
  deviceProfileRefresh: string;
  deviceProfileFeedUrl: string;
  deviceProfileAdd: string;
  deviceProfileRemove: string;
  articleTypes: string;
  articleTypesDesc: string;
  articleTypesParseHierarchy: string;
  articleTypesParseHierarchyDesc: string;
  articleTypeTitle: string;
  articleTypeTitlePlaceholder: string;
  articleTypeId: string;
  articleTypeIdPlaceholder: string;
  articleTypeColor: string;
  articleTypeFolders: string;
  articleTypeFoldersDesc: string;
  articleTypeTags: string;
  articleTypeTagsDesc: string;
  articleTypeAdd: string;
  articleTypeRemove: string;
  articleTypeMoveUp: string;
  articleTypeMoveDown: string;
  regenerateToken: string;
  workflowStages: string;
  workflowStagesDesc: string;
  workflowStageTitle: string;
  workflowStageTitlePlaceholder: string;
  workflowStageId: string;
  workflowStageIdPlaceholder: string;
  workflowStageDescription: string;
  workflowStageDescriptionPlaceholder: string;
  workflowStageColor: string;
  workflowStageFolders: string;
  workflowStageFoldersDesc: string;
  workflowStageTags: string;
  workflowStageTagsDesc: string;
  workflowStageLimit: string;
  workflowStageStaleDays: string;
  workflowStageAdd: string;
  workflowStageRemove: string;
  workflowStageMoveUp: string;
  workflowStageMoveDown: string;
  statusId: string;
  statusLabel: string;
  addStatus: string;
  ai: string;
  aiDesc: string;
  aiProviderPreset: string;
  aiProviderPresetDesc: string;
  aiBaseUrl: string;
  aiBaseUrlDesc: string;
  aiApiKey: string;
  aiApiKeyDesc: string;
  aiModel: string;
  aiModelDesc: string;
  aiDiagnostics: string;
  aiDiagnosticsDesc: string;
  aiFetchModels: string;
  aiTestConnection: string;
  aiAssistant: string;
  aiAssistantDesc: string;
  aiOpenAssistant: string;
  aiAutoRun: string;
  aiAutoRunDesc: string;
  aiAutoLimit: string;
  aiAutoLimitDesc: string;
  aiRerank: string;
  aiRerankDesc: string;
  writeArticleProperties: string;
  writeArticlePropertiesDesc: string;
  copy: string;
  copied: string;
};

const COPY: Record<ToWriteLanguage, SettingCopy> = {
  "zh": {
    "title": "ToWrite：未闭合问题",
    "tabs": {
      "general": "通用",
      "cards": "卡片与编辑器",
      "capture": "记录",
      "inbox": "Inbox / 卡片",
      "learning": "建议与习惯",
      "workflow": "Workflow",
      "api": "API 与设备",
      "push": "推流",
      "quote0": "Quote0",
      "ai": "AI",
      "backend": "Backend",
      "hub": "Device Hub",
      "about": "关于"
    },
    "language": "语言",
    "languageDesc": "设置插件界面的显示语言。默认使用中文。",
    "chinese": "中文",
    "english": "英文",
    "exportDirectory": "导出目录",
    "exportDirectoryDesc": "相对于 vault 根目录的 JSON 导出文件夹。",
    "autoExport": "自动导出 JSON",
    "autoExportDesc": "索引刷新或状态变化后，自动写入 index.json、articles.json、eink-compact.json 和 workflows.json。",
    "autoOpenSidebar": "启动时自动打开侧栏",
    "autoOpenSidebarDesc": "Obsidian 布局加载完成后，自动在右侧展开 ToWrite 面板，避免第一次启用插件时找不到入口。",
    "groupCurrentByHeading": "当前笔记按标题分组",
    "groupCurrentByHeadingDesc": "关闭时，同一篇文章里的批注按位置直接列出；开启后才按 Markdown 标题分组。",
    "candidateDetection": "触发词建议",
    "candidateDetectionDesc": "只在正文中高亮并显示加号，不会自动加入右侧列表。",
    "editorDecorations": "编辑器标记",
    "editorDecorationsDesc": "在编辑器中标记正式问题和可添加建议。修改后建议重载 Obsidian。",
    "compactEditorDecorations": "紧凑编辑器标记",
    "compactEditorDecorationsDesc": "开启后，正文里只显示左侧竖线，不再铺满整行底色。关闭时恢复整行浅色高亮。",
    "triggerWords": "触发词",
    "triggerWordsDesc": "每个触发词一个输入框。粘贴多个词时支持逗号、中文逗号、分号、顿号或换行自动拆分。",
    "addPlaceholder": "新增触发词",
    "addTrigger": "添加触发词",
    "removeTrigger": "删除",
    "statuses": "问题状态",
    "statusesDesc": "右键卡片状态标签时会显示这些状态。id 建议使用英文小写，显示名可以自定义。",
    "reminderPresets": "提醒快捷设置",
    "reminderPresetsDesc": "一行一个快捷项，格式：显示名 = 规则。规则支持 15m、1h、3h、today 18:00、tomorrow 09:00、nextWeek 09:00。",
    "defaultThinkColor": "ToThink 默认颜色",
    "defaultThinkColorDesc": "没有在选区工具条手动选色时，ToThink 卡片使用的颜色。",
    "defaultWriteColor": "ToWrite 默认颜色",
    "defaultWriteColorDesc": "没有在选区工具条手动选色时，ToWrite 卡片使用的颜色。",
    "externalApi": "外部 API",
    "externalApiDesc": "桌面端本地 HTTP API，可用于 JSON、RSS、SSE 实时刷新，以及状态和笔记写回。",
    "externalApiBindHost": "API 监听地址",
    "externalApiBindHostDesc": "只在本机使用填 127.0.0.1；局域网或隧道访问填 0.0.0.0。",
    "externalApiPort": "API 端口",
    "externalApiPortDesc": "本地 HTTP API 使用的端口。",
    "externalApiToken": "API token",
    "externalApiTokenDesc": "私有 API 都需要 token。开启下面的选项后，GET 请求也可以用 ?token=。",
    "externalApiQueryToken": "允许 GET 查询参数 token",
    "externalApiQueryTokenDesc": "适合 ESP32、RSS 阅读器、桌面小组件等不能发送 Authorization header 的客户端。",
    "externalApiPublicBaseUrl": "手机/远程访问基地址",
    "externalApiPublicBaseUrlDesc": "填手机实际访问的地址，例如 https://desktop-name.tailnet.ts.net:48321 或 http://192.168.1.20:48321。留空时使用本机示例地址。",
    "externalApiEndpoint": "API 访问地址",
    "externalApiEndpointDesc": "本机示例地址。局域网访问时，把 127.0.0.1 换成这台电脑的局域网 IP。",
    "externalApiDashboard": "Dashboard 页面",
    "externalApiDashboardDesc": "在浏览器里查看解析后的待解决问题、文章统计和原始 JSON。",
    "externalApiDevice": "手机小屏页面",
    "externalApiDeviceDesc": "复制到手机浏览器，用来模拟墨水屏/小屏设备。",
    "push": "自动推流",
    "pushDesc": "同一套候选、情境锚点、规则排序和反馈，服务 quote0、手机 App、局域网页面和后续设备。",
    "pushEnabled": "启用 Push Engine",
    "pushEnabledDesc": "开启后 Quote0 会优先使用通用推流策略；手机和自研设备可读取 /api/v1/push/feed。",
    "pushPrivacy": "隐私边界",
    "pushPrivacyDesc": "默认只记录时间段、手动地点标签、模式和当前笔记等粗粒度锚点。",
    "pushPrivacyLocal": "本地粗粒度",
    "pushPrivacyPrecise": "精确位置",
    "pushPrivacyNone": "不采位置",
    "pushPreciseLocation": "允许精确位置",
    "pushPreciseLocationDesc": "只有同时选择精确位置隐私边界时才会保存坐标；默认关闭。",
    "pushAiRerank": "允许 AI 重排",
    "pushAiRerankDesc": "v1 仍由规则优先；开启后只允许 AI 在本地候选内微调和生成建议。",
    "pushHabitText": "我的工作习惯",
    "pushHabitTextDesc": "自由文本说明你的时间、地点、设备和写作偏好；AI 只能据此提出待确认规则。",
    "pushTargets": "推流目标",
    "pushTargetsDesc": "配置 quote0、手机 App、局域网页面或未来 webhook 的目标参数。",
    "pushHabits": "习惯规则",
    "pushHabitsDesc": "结构化规则：时间段、地点标签、工作模式、stage、lane、状态、设备和权重。",
    "pushAddTarget": "添加目标",
    "pushRemoveTarget": "删除目标",
    "pushAddHabit": "添加规则",
    "pushRemoveHabit": "删除规则",
    "pushFeedUrl": "Push feed URL",
    "quote0": "Quote0 推送",
    "quote0Desc": "把当前 ToThink / ToWrite 卡片推送到 quote0 Text API，并把 NFC 链接指向手机写回页面。",
    "quote0ApiBaseUrl": "Dot API Base URL",
    "quote0ApiBaseUrlDesc": "默认使用 https://dot.mindreset.tech。一般不需要修改。",
    "quote0ApiKey": "Dot API Key",
    "quote0ApiKeyDesc": "保存在本地 Obsidian 插件数据里。请勿截图或提交到仓库。",
    "quote0DeviceId": "Quote0 Device ID",
    "quote0DeviceIdDesc": "可手动填写，也可以填入 API key 后点击获取设备自动选择。",
    "quote0FetchDevices": "获取设备",
    "quote0NoDevices": "没有找到 quote_0 设备。",
    "quote0DeviceStatus": "设备状态",
    "quote0Scope": "卡片范围",
    "quote0ScopeDesc": "控制 quote0 轮播 ToThink、ToWrite，或全部未解决卡片。",
    "quote0AllCards": "全部",
    "quote0ThinkOnly": "只看 ToThink",
    "quote0WriteOnly": "只看 ToWrite",
    "quote0RefreshSeconds": "刷新间隔（秒）",
    "quote0RefreshSecondsDesc": "插件定时推送下一张卡片的间隔。quote0 接电时官方最小刷新间隔为 1 分钟。",
    "quote0ForceRefreshAfterSend": "发送后自动强制刷新",
    "quote0ForceRefreshAfterSendDesc": "发送下一条、主页或测试卡成功后，额外调用 Dot 的设备切换/刷新接口。若你的 Loop 会跳到其他内容，可以关闭。",
    "quote0TaskKey": "Text API taskKey",
    "quote0TaskKeyDesc": "已有多个 Text API 内容时填写。留空则更新第一个 Text API 内容。",
    "quote0TaskAlias": "Text API taskAlias",
    "quote0TaskAliasDesc": "显示在 quote0 任务列表中的名字，用来识别 ToWrite 内容。",
    "quote0DashboardApi": "主页渲染 API",
    "quote0DashboardApiDesc": "Canvas API 用结构化画板渲染 dashboard，最适合分区 UI；Image API 是 PNG 备用方案；Text API 只显示文字。",
    "quote0DashboardText": "Text API 文字首页",
    "quote0DashboardImage": "Image API PNG 首页",
    "quote0DashboardCanvas": "Canvas API 画板首页（推荐）",
    "quote0ImageTaskKey": "Image API taskKey",
    "quote0ImageTaskKeyDesc": "已有多个 Image API 内容时填写。留空则更新第一个 Image API 内容。",
    "quote0ImageTaskAlias": "Image API taskAlias",
    "quote0ImageTaskAliasDesc": "显示在 quote0 任务列表中的名字，用来识别 ToWrite 首页图像。",
    "quote0ImageDither": "Image API dithering",
    "quote0ImageDitherDesc": "dashboard 是文字图，默认 NONE 会更锐利；照片或复杂灰度图才建议 DIFFUSION。",
    "quote0ImageBorder": "Image API 边框",
    "quote0ImageBorderDesc": "0 为白边，1 为黑边。dashboard 图像本身已经有边框，默认白边。",
    "quote0CanvasTaskAlias": "Canvas API taskAlias",
    "quote0CanvasTaskAliasDesc": "显示在 quote0 任务列表中的名字，用来识别 ToWrite 画板首页。",
    "quote0CanvasBorder": "Canvas API 边框",
    "quote0CanvasBorderDesc": "0 为白边，1 为黑边。画板内容本身已经有分区边框，默认白边。",
    "quote0NfcToken": "Quote0 NFC token",
    "quote0NfcTokenDesc": "专用于 NFC 写回的受限 token，只允许打开写回页和提交内容。",
    "quote0NfcLink": "NFC 测试链接",
    "quote0NfcLinkDesc": "使用 External API 的手机/远程访问基地址生成。局域网模式请填电脑的局域网地址。",
    "quote0SendNext": "发送下一条",
    "quote0SendDashboard": "发送主页",
    "quote0SendTest": "发送测试卡",
    "quote0ForceRefresh": "强制刷新设备",
    "quote0ApplyInterval": "应用设备间隔",
    "quote0Preview": "发送前预览",
    "quote0PreviewDesc": "下面分别显示“发送下一条”和“发送主页”将提交给 Quote0 API 的内容。",
    "quote0TextPreview": "文本预览",
    "quote0TextPreviewDesc": "点击发送下一条时会推送这张 Text API 卡片。",
    "quote0HomePreview": "主页预览",
    "quote0HomePreviewDesc": "点击发送主页时会推送这个 dashboard；Canvas / Image 模式会尽量按设备效果预览。",
    "quote0PreviewRefresh": "重算预览",
    "quote0PreviewUnavailable": "暂时无法生成预览，请检查 Quote0 和 Push 设置。",
    "quote0LoopNotice": "如果返回 404 或设备没有切换，请先在 Dot App/Content Studio 把 Text / Image / Canvas API 内容加入 quote0 的 Loop Content。",
    "quote0LastSync": "最近同步",
    "quote0MissingPublicBaseUrl": "还没有设置手机/远程访问基地址，NFC 链接暂不可用。",
    "deviceCapture": "手机输入写回",
    "deviceCaptureDesc": "允许 /device/input companion 页面把回答追加到卡片，或把独立想法写入指定 Inbox/文件夹。",
    "deviceCaptureInbox": "默认 Inbox 文件",
    "deviceCaptureInboxDesc": "没有选择具体目标时，新想法会追加到这个 Markdown 文件。",
    "deviceCaptureFolders": "可选目标文件夹",
    "deviceCaptureFoldersDesc": "一行一个 vault 内文件夹。手机输入页会把它们显示为保存位置。",
    "deviceCaptureTags": "默认 tags",
    "deviceCaptureTagsDesc": "手机输入页保存的新想法默认带上的标签；可用逗号、顿号或换行分隔。",
    "deviceProfiles": "设备 Profiles",
    "deviceProfilesDesc": "保存常用墨水屏/小屏参数，并生成 ESP32、手机或桌面组件可直接请求的 device-feed URL。",
    "deviceProfileName": "显示名称",
    "deviceProfileId": "Profile id",
    "deviceProfileKind": "Profile 类型",
    "deviceProfileSize": "屏幕尺寸",
    "deviceProfileWidth": "宽度 px",
    "deviceProfileHeight": "高度 px",
    "deviceProfileInches": "英寸",
    "deviceProfileDefaultPage": "默认页面",
    "deviceProfileDefaultLane": "默认卡片范围",
    "deviceProfileRefresh": "刷新间隔（秒）",
    "deviceProfileFeedUrl": "Device feed URL",
    "deviceProfileAdd": "添加设备 profile",
    "deviceProfileRemove": "删除设备 profile",
    "articleTypes": "文章类型",
    "articleTypesDesc": "按大类组织笔记，例如 MindFlow、Tech、Project。可匹配文件夹、tag，或层级 tag 的第一段。",
    "articleTypesParseHierarchy": "解析层级 tag",
    "articleTypesParseHierarchyDesc": "把 mindflow/spark 解析为 type=mindflow、stage=spark，同时保留完整 tag。",
    "articleTypeTitle": "显示标题",
    "articleTypeTitlePlaceholder": "例如 MindFlow",
    "articleTypeId": "Type id",
    "articleTypeIdPlaceholder": "例如 mindflow",
    "articleTypeColor": "颜色",
    "articleTypeFolders": "文件夹前缀",
    "articleTypeFoldersDesc": "一行一个路径前缀，例如 ByteDance/MindFlow。",
    "articleTypeTags": "匹配标签",
    "articleTypeTagsDesc": "一行一个 tag，可写 mindflow 或 #mindflow。层级 tag 也会使用第一段。",
    "articleTypeAdd": "添加类型",
    "articleTypeRemove": "删除类型",
    "articleTypeMoveUp": "上移",
    "articleTypeMoveDown": "下移",
    "regenerateToken": "重新生成 token",
    "workflowStages": "Workflow Stages",
    "workflowStagesDesc": "按文件夹、frontmatter tags 或正文 #tag，把 Markdown 文件分组为 Raw、Sparks、Processing 等自定义状态，并通过 workflows.json 和 API 暴露。",
    "workflowStageTitle": "显示标题",
    "workflowStageTitlePlaceholder": "例如 Sparks",
    "workflowStageId": "Stage id",
    "workflowStageIdPlaceholder": "例如 sparks",
    "workflowStageDescription": "描述",
    "workflowStageDescriptionPlaceholder": "这组文件表示什么状态",
    "workflowStageColor": "颜色",
    "workflowStageFolders": "文件夹前缀",
    "workflowStageFoldersDesc": "一行一个路径前缀，例如 MindFlow/01-Sparks 或 Techbench/02-Processing。",
    "workflowStageTags": "匹配标签",
    "workflowStageTagsDesc": "一行一个 tag，会同时匹配 frontmatter tags 和正文 #tag，可写 spark 或 #spark。",
    "workflowStageLimit": "每组数量",
    "workflowStageStaleDays": "过期天数",
    "workflowStageAdd": "添加 stage",
    "workflowStageRemove": "删除 stage",
    "workflowStageMoveUp": "上移",
    "workflowStageMoveDown": "下移",
    "statusId": "状态 id",
    "statusLabel": "显示名",
    "addStatus": "添加状态",
    "ai": "AI 功能",
    "aiDesc": "默认关闭。启用后 ToWrite 会使用你配置的 OpenAI-compatible 接口，只做本地笔记摘要和推荐，不做联网搜索。",
    "aiProviderPreset": "AI 接入预设",
    "aiProviderPresetDesc": "选择后会填入兼容 OpenAI 的 Base URL 和建议模型；API Key 仍需自己填写。",
    "aiBaseUrl": "AI Base URL",
    "aiBaseUrlDesc": "兼容 OpenAI 风格接口的基础地址，例如 https://api.openai.com/v1 或自托管网关。",
    "aiApiKey": "AI API Key",
    "aiApiKeyDesc": "保存在本地插件数据中。未启用 AI 时不会发送请求。",
    "aiModel": "AI 模型",
    "aiModelDesc": "用于摘要和本地笔记重排序的模型名。",
    "aiDiagnostics": "模型发现与连接测试",
    "aiDiagnosticsDesc": "主动读取 OpenAI-compatible 模型列表，并用当前模型发送一次短请求验证真实可用性。推理模型需要留出生成最终回复的 token，测试会消耗少量额度。",
    "aiFetchModels": "获取模型",
    "aiTestConnection": "测试连接",
    "aiAssistant": "AI 助手",
    "aiAssistantDesc": "打开原生对话入口，可切换模型、查看发送上下文和本地历史；连接 Backend 后还可选择 Skill。",
    "aiOpenAssistant": "打开助手",
    "aiAutoRun": "自动后台生成",
    "aiAutoRunDesc": "开启后自动处理缺失或过期的正式问题，不处理触发词建议。",
    "aiAutoLimit": "每次会话自动上限",
    "aiAutoLimitDesc": "限制每次启动 Obsidian 后自动调用 AI 的问题数量。",
    "aiRerank": "AI 重排序本地笔记",
    "aiRerankDesc": "开启后先用本地索引召回候选笔记，再交给 AI 选择最相关的结果。",
    "writeArticleProperties": "写入文章属性",
    "writeArticlePropertiesDesc": "可选：导出时写入 open_questions、candidate_questions 和 question_status 到笔记属性。",
    "copy": "复制",
    "copied": "已复制"
  },
  "en": {
    "title": "ToWrite Open Questions",
    "tabs": {
      "general": "General",
      "cards": "Cards & Editor",
      "capture": "Capture",
      "inbox": "Inbox / Cards",
      "learning": "Suggestions & Habits",
      "workflow": "Workflow",
      "api": "API & Device",
      "push": "Push",
      "quote0": "Quote0",
      "ai": "AI",
      "backend": "Backend",
      "hub": "Device Hub",
      "about": "About"
    },
    "language": "Language",
    "languageDesc": "Choose the plugin display language. Chinese is the default.",
    "chinese": "Chinese",
    "english": "English",
    "exportDirectory": "Export directory",
    "exportDirectoryDesc": "Folder for JSON exports, relative to the vault root.",
    "autoExport": "Auto-export JSON",
    "autoExportDesc": "Write index.json, articles.json, eink-compact.json, and workflows.json after index refreshes or status changes.",
    "autoOpenSidebar": "Open sidebar on startup",
    "autoOpenSidebarDesc": "After the Obsidian layout is ready, automatically open the ToWrite panel on the right so first-time users can find it.",
    "groupCurrentByHeading": "Group current note by heading",
    "groupCurrentByHeadingDesc": "When off, annotations in the same note are listed by position. Turn it on to group them by Markdown heading.",
    "candidateDetection": "Trigger word suggestions",
    "candidateDetectionDesc": "Highlight trigger words in the editor and show add buttons without adding them to the sidebar automatically.",
    "editorDecorations": "Editor markers",
    "editorDecorationsDesc": "Mark saved questions and addable suggestions in the editor. Reload Obsidian after changing this if needed.",
    "compactEditorDecorations": "Compact editor markers",
    "compactEditorDecorationsDesc": "When enabled, editor marks use a left rail only instead of a full-line background. Disable it to restore full-line highlights.",
    "triggerWords": "Trigger words",
    "triggerWordsDesc": "One trigger word per input. Pasting multiple words supports comma, Chinese comma, semicolon, enumeration comma, or line breaks.",
    "addPlaceholder": "New trigger word",
    "addTrigger": "Add trigger word",
    "removeTrigger": "Remove",
    "statuses": "Question statuses",
    "statusesDesc": "Shown in the card status menu. Keep ids lowercase English when possible; labels can be customized.",
    "reminderPresets": "Reminder presets",
    "reminderPresetsDesc": "One shortcut per line: Label = rule. Rules support 15m, 1h, 3h, today 18:00, tomorrow 09:00, nextWeek 09:00.",
    "defaultThinkColor": "Default ToThink color",
    "defaultThinkColorDesc": "Color used for ToThink cards when no color is chosen from the selection toolbar.",
    "defaultWriteColor": "Default ToWrite color",
    "defaultWriteColorDesc": "Color used for ToWrite cards when no color is chosen from the selection toolbar.",
    "externalApi": "External API",
    "externalApiDesc": "Local desktop HTTP API for JSON, RSS, SSE refreshes, status updates, and note writeback.",
    "externalApiBindHost": "API bind host",
    "externalApiBindHostDesc": "Use 127.0.0.1 for local-only access; use 0.0.0.0 for LAN or tunnel access.",
    "externalApiPort": "API port",
    "externalApiPortDesc": "Port used by the local HTTP API.",
    "externalApiToken": "API token",
    "externalApiTokenDesc": "Private API routes require this token. When the option below is enabled, GET requests can also use ?token=.",
    "externalApiQueryToken": "Allow GET query token",
    "externalApiQueryTokenDesc": "Useful for ESP32, RSS readers, and desktop widgets that cannot send an Authorization header.",
    "externalApiPublicBaseUrl": "Phone/remote base URL",
    "externalApiPublicBaseUrlDesc": "Set the URL your phone will actually open, such as https://desktop-name.tailnet.ts.net:48321 or http://192.168.1.20:48321. Leave empty to use the local example URL.",
    "externalApiEndpoint": "API URL",
    "externalApiEndpointDesc": "Local example URL. For LAN access, replace 127.0.0.1 with this computer’s LAN IP.",
    "externalApiDashboard": "Dashboard page",
    "externalApiDashboardDesc": "View parsed open questions, article statistics, and raw JSON in a browser.",
    "externalApiDevice": "Phone small-screen page",
    "externalApiDeviceDesc": "Copy to a phone browser to simulate an e-ink or small-screen device.",
    "push": "Push automation",
    "pushDesc": "One candidate, context, ranking, and feedback layer for quote0, mobile apps, local web, and future devices.",
    "pushEnabled": "Enable Push Engine",
    "pushEnabledDesc": "When enabled, Quote0 uses the shared push policy, and devices can read /api/v1/push/feed.",
    "pushPrivacy": "Privacy boundary",
    "pushPrivacyDesc": "Defaults to coarse local anchors such as time bucket, manual place label, mode, and active note.",
    "pushPrivacyLocal": "Local coarse",
    "pushPrivacyPrecise": "Precise location",
    "pushPrivacyNone": "No location",
    "pushPreciseLocation": "Allow precise location",
    "pushPreciseLocationDesc": "Coordinates are saved only when this is on and the privacy boundary is precise location.",
    "pushAiRerank": "Allow AI rerank",
    "pushAiRerankDesc": "Rules still lead in v1. AI can only rerank local candidates and suggest rules.",
    "pushHabitText": "My work habits",
    "pushHabitTextDesc": "Describe your time, place, device, and writing preferences. AI suggestions must be confirmed before becoming rules.",
    "pushTargets": "Push targets",
    "pushTargetsDesc": "Configure quote0, mobile apps, local web pages, or future webhooks.",
    "pushHabits": "Habit rules",
    "pushHabitsDesc": "Structured rules for time, place label, mode, stage, lane, status, target, and boost.",
    "pushAddTarget": "Add target",
    "pushRemoveTarget": "Remove target",
    "pushAddHabit": "Add rule",
    "pushRemoveHabit": "Remove rule",
    "pushFeedUrl": "Push feed URL",
    "quote0": "Quote0 push",
    "quote0Desc": "Push the current ToThink / ToWrite card to quote0 Text API, with NFC opening the phone writeback page.",
    "quote0ApiBaseUrl": "Dot API Base URL",
    "quote0ApiBaseUrlDesc": "Defaults to https://dot.mindreset.tech. Usually leave this unchanged.",
    "quote0ApiKey": "Dot API key",
    "quote0ApiKeyDesc": "Stored locally in Obsidian plugin data. Do not screenshot it or commit it.",
    "quote0DeviceId": "Quote0 device ID",
    "quote0DeviceIdDesc": "Fill it manually, or enter an API key and fetch devices to select one.",
    "quote0FetchDevices": "Fetch devices",
    "quote0NoDevices": "No quote_0 devices found.",
    "quote0DeviceStatus": "Device status",
    "quote0Scope": "Card scope",
    "quote0ScopeDesc": "Choose whether quote0 rotates all open cards, ToThink only, or ToWrite only.",
    "quote0AllCards": "All",
    "quote0ThinkOnly": "ToThink only",
    "quote0WriteOnly": "ToWrite only",
    "quote0RefreshSeconds": "Refresh interval (seconds)",
    "quote0RefreshSecondsDesc": "How often the plugin pushes the next card. Dot documents 1 minute as the powered minimum.",
    "quote0ForceRefreshAfterSend": "Force refresh after send",
    "quote0ForceRefreshAfterSendDesc": "After sending a card, home dashboard, or test card, also call Dot's device switch/refresh endpoint. Turn this off if your Loop jumps to another item.",
    "quote0TaskKey": "Text API taskKey",
    "quote0TaskKeyDesc": "Use when multiple Text API contents exist. Leave empty to update the first Text API content.",
    "quote0TaskAlias": "Text API taskAlias",
    "quote0TaskAliasDesc": "Name shown in the quote0 task list so this ToWrite content is easy to identify.",
    "quote0DashboardApi": "Home rendering API",
    "quote0DashboardApiDesc": "Canvas API renders the dashboard as structured screen content and is best for sectioned UI. Image API is the PNG fallback. Text API is plain text.",
    "quote0DashboardText": "Text API home",
    "quote0DashboardImage": "Image API PNG home",
    "quote0DashboardCanvas": "Canvas API home (recommended)",
    "quote0ImageTaskKey": "Image API taskKey",
    "quote0ImageTaskKeyDesc": "Use when multiple Image API contents exist. Leave empty to update the first Image API content.",
    "quote0ImageTaskAlias": "Image API taskAlias",
    "quote0ImageTaskAliasDesc": "Name shown in the quote0 task list for the ToWrite dashboard image.",
    "quote0ImageDither": "Image API dithering",
    "quote0ImageDitherDesc": "Dashboard images are text-heavy, so NONE is sharper by default. Use DIFFUSION for photos or complex grayscale images.",
    "quote0ImageBorder": "Image API border",
    "quote0ImageBorderDesc": "0 is white border, 1 is black border. The dashboard image already has its own frame, so white is the default.",
    "quote0CanvasTaskAlias": "Canvas API taskAlias",
    "quote0CanvasTaskAliasDesc": "Name shown in the quote0 task list for the ToWrite canvas dashboard.",
    "quote0CanvasBorder": "Canvas API border",
    "quote0CanvasBorderDesc": "0 is white border, 1 is black border. The canvas dashboard already has section borders, so white is the default.",
    "quote0NfcToken": "Quote0 NFC token",
    "quote0NfcTokenDesc": "Restricted token for NFC writeback. It can open the input page and submit content, not read the full deck.",
    "quote0NfcLink": "NFC test link",
    "quote0NfcLinkDesc": "Generated from the phone/remote base URL. For LAN mode, use this computer's LAN address.",
    "quote0SendNext": "Send next card",
    "quote0SendDashboard": "Send home",
    "quote0SendTest": "Send test card",
    "quote0ForceRefresh": "Force device refresh",
    "quote0ApplyInterval": "Apply device interval",
    "quote0Preview": "Preview before sending",
    "quote0PreviewDesc": "Shows the separate payloads that Send next card and Send home will submit to the Quote0 API.",
    "quote0TextPreview": "Text preview",
    "quote0TextPreviewDesc": "This Text API card is what Send next card will push.",
    "quote0HomePreview": "Home preview",
    "quote0HomePreviewDesc": "This dashboard is what Send home will push. Canvas / Image modes are previewed as close to the device result as possible.",
    "quote0PreviewRefresh": "Rebuild preview",
    "quote0PreviewUnavailable": "Preview is not available yet. Check Quote0 and Push settings.",
    "quote0LoopNotice": "If the API returns 404 or the display does not switch, add the Text / Image / Canvas API content to quote0 Loop Content in Dot App/Content Studio first.",
    "quote0LastSync": "Last sync",
    "quote0MissingPublicBaseUrl": "Phone/remote base URL is missing, so NFC links are not available yet.",
    "deviceCapture": "Phone input writeback",
    "deviceCaptureDesc": "Allow the /device/input companion page to append answers to cards or save standalone ideas to an Inbox/folder.",
    "deviceCaptureInbox": "Default Inbox file",
    "deviceCaptureInboxDesc": "When no specific target is selected, new ideas are appended to this Markdown file.",
    "deviceCaptureFolders": "Selectable target folders",
    "deviceCaptureFoldersDesc": "One vault folder per line. The phone input page will show them as save targets.",
    "deviceCaptureTags": "Default tags",
    "deviceCaptureTagsDesc": "Tags added to new ideas saved from the phone input page; separate with commas, enumeration commas, or line breaks.",
    "deviceProfiles": "Device Profiles",
    "deviceProfilesDesc": "Save common e-ink or small-screen parameters and generate a device-feed URL for ESP32, phones, or desktop widgets.",
    "deviceProfileName": "Display name",
    "deviceProfileId": "Profile id",
    "deviceProfileKind": "Profile kind",
    "deviceProfileSize": "Screen size",
    "deviceProfileWidth": "Width px",
    "deviceProfileHeight": "Height px",
    "deviceProfileInches": "Inches",
    "deviceProfileDefaultPage": "Default page",
    "deviceProfileDefaultLane": "Default card lane",
    "deviceProfileRefresh": "Refresh interval seconds",
    "deviceProfileFeedUrl": "Device feed URL",
    "deviceProfileAdd": "Add device profile",
    "deviceProfileRemove": "Remove device profile",
    "articleTypes": "Article Types",
    "articleTypesDesc": "Group notes by broad type such as MindFlow, Tech, or Project. Types can match folder prefixes, tags, or the first part of hierarchical tags.",
    "articleTypesParseHierarchy": "Parse hierarchical tags",
    "articleTypesParseHierarchyDesc": "Treat mindflow/spark as type mindflow and stage spark while keeping the full tag available.",
    "articleTypeTitle": "Display title",
    "articleTypeTitlePlaceholder": "For example MindFlow",
    "articleTypeId": "Type id",
    "articleTypeIdPlaceholder": "For example mindflow",
    "articleTypeColor": "Color",
    "articleTypeFolders": "Folder prefixes",
    "articleTypeFoldersDesc": "One path prefix per line, for example ByteDance/MindFlow.",
    "articleTypeTags": "Matching tags",
    "articleTypeTagsDesc": "One tag per line. Use mindflow or #mindflow. Hierarchical tags also use their first part.",
    "articleTypeAdd": "Add type",
    "articleTypeRemove": "Remove type",
    "articleTypeMoveUp": "Move up",
    "articleTypeMoveDown": "Move down",
    "regenerateToken": "Regenerate token",
    "workflowStages": "Workflow Stages",
    "workflowStagesDesc": "Group Markdown files into custom states such as Raw, Sparks, and Processing by folder, frontmatter tags, or inline #tags, then expose them through workflows.json and the API.",
    "workflowStageTitle": "Display title",
    "workflowStageTitlePlaceholder": "For example Sparks",
    "workflowStageId": "Stage id",
    "workflowStageIdPlaceholder": "For example sparks",
    "workflowStageDescription": "Description",
    "workflowStageDescriptionPlaceholder": "What this file group means",
    "workflowStageColor": "Color",
    "workflowStageFolders": "Folder prefixes",
    "workflowStageFoldersDesc": "One path prefix per line, for example MindFlow/01-Sparks or Techbench/02-Processing.",
    "workflowStageTags": "Matching tags",
    "workflowStageTagsDesc": "One tag per line. Matches both frontmatter tags and inline #tags. Use spark or #spark.",
    "workflowStageLimit": "Items per stage",
    "workflowStageStaleDays": "Stale days",
    "workflowStageAdd": "Add stage",
    "workflowStageRemove": "Remove stage",
    "workflowStageMoveUp": "Move up",
    "workflowStageMoveDown": "Move down",
    "statusId": "Status id",
    "statusLabel": "Label",
    "addStatus": "Add status",
    "ai": "AI features",
    "aiDesc": "Off by default. When enabled, ToWrite uses your OpenAI-compatible endpoint for local note summaries and recommendations only, not web search.",
    "aiProviderPreset": "AI provider preset",
    "aiProviderPresetDesc": "Choosing a preset fills an OpenAI-compatible Base URL and suggested model; you still need to enter your API key.",
    "aiBaseUrl": "AI Base URL",
    "aiBaseUrlDesc": "Base URL for an OpenAI-compatible API, such as https://api.openai.com/v1 or a self-hosted gateway.",
    "aiApiKey": "AI API Key",
    "aiApiKeyDesc": "Stored in local plugin data. No requests are sent while AI is disabled.",
    "aiModel": "AI model",
    "aiModelDesc": "Model used for summaries and local note reranking.",
    "aiDiagnostics": "Model discovery and connection test",
    "aiDiagnosticsDesc": "Load the OpenAI-compatible model list, then send a short request with the selected model. Reasoning models need enough tokens to produce their final answer; the test uses a small amount of quota.",
    "aiFetchModels": "Load models",
    "aiTestConnection": "Test connection",
    "aiAssistant": "AI assistant",
    "aiAssistantDesc": "Open native chat with model switching, a payload inspector, and local history. Backend Skills appear when connected.",
    "aiOpenAssistant": "Open assistant",
    "aiAutoRun": "Automatic background generation",
    "aiAutoRunDesc": "Automatically process saved questions with missing or stale AI output; trigger word suggestions are ignored.",
    "aiAutoLimit": "Auto-run limit per session",
    "aiAutoLimitDesc": "Limit how many questions AI can process automatically after each Obsidian startup.",
    "aiRerank": "AI rerank local notes",
    "aiRerankDesc": "First retrieve candidate notes from the local index, then ask AI to pick the most relevant results.",
    "writeArticleProperties": "Write article properties",
    "writeArticlePropertiesDesc": "Optional: write open_questions, candidate_questions, and question_status into note frontmatter on export.",
    "copy": "Copy",
    "copied": "Copied"
  }
};

const AI_PROVIDER_PRESETS = [
  {
    id: "custom",
    label: "Custom OpenAI-compatible",
    baseUrl: "",
    model: ""
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini"
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini"
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat"
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "Qwen/Qwen2.5-7B-Instruct"
  },
  {
    id: "ollama",
    label: "Ollama local",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.1"
  },
  {
    id: "lm-studio",
    label: "LM Studio local",
    baseUrl: "http://127.0.0.1:1234/v1",
    model: "local-model"
  }
] as const;

export class ToWriteSettingTab extends PluginSettingTab {
  private readonly openArticleTypeIds = new Set<string>();
  private readonly openWorkflowStageIds = new Set<string>();
  private readonly openDeviceProfileIds = new Set<string>();
  private quote0Devices: Quote0Device[] = [];
  private aiModels: AiModelInfo[] = [];
  private aiDiagnosticsStatus = "";
  private aiModelsLoading = false;
  private aiConnectionTesting = false;
  private aiDiagnosticsGeneration = 0;
  private aiApiKeyVisible = false;
  private hubLoginEmail = "";
  private hubLoginChallengeId = "";
  private hubLoginCode = "";
  /** Short-lived and memory-only; never written into plugin settings. */
  private hubAccountAccessToken = "";
  /** Shown only after provisioning/rotation so it can be copied to the ESP32. */
  private hubOneTimeDeviceSecret = "";
  /** Binds the one-time secret to the Hub that issued it so it cannot be copied to another origin. */
  private hubOneTimeDeviceSecretOrigin = "";
  private hubDeviceSecretVisible = false;
  private inboxSettingsSaveTimer = 0;
  private inboxSettingsSaveRunning = false;
  private inboxSettingsSaveQueued = false;
  /** Echo edits stay here until Save / Show now is explicitly pressed. */
  private echoCardDraft?: EchoCard;
  private echoCardDraftBaseline = "";
  private echoCardDeleteConfirmId = "";
  private echoCardMutationRunning = false;
  private activeSettingsTab: SettingsTabId = "general";

  constructor(app: App, private readonly plugin: ToWritePlugin) {
    super(app, plugin);
  }

  display(): void {
    this.renderSettings(this.containerEl);
  }

  private renderSettings(containerEl: HTMLElement): void {
    const copy = COPY[this.plugin.settings.language ?? "zh"];
    containerEl.empty();
    containerEl.addClass("towrite-settings");
    new Setting(containerEl).setName(copy.title).setHeading();
    this.renderSettingsTabs(containerEl, copy);

    const panel = containerEl.createDiv({ cls: "towrite-settings-tab-panel" });
    if (this.activeSettingsTab === "general") {
      this.renderGeneralSettings(panel, copy);
    } else if (this.activeSettingsTab === "cards") {
      this.renderCardsEditorSettings(panel, copy);
    } else if (this.activeSettingsTab === "capture") {
      this.renderCaptureSettings(panel);
    } else if (this.activeSettingsTab === "inbox") {
      this.renderInboxSettings(panel);
    } else if (this.activeSettingsTab === "learning") {
      this.renderLearningSettings(panel, copy);
    } else if (this.activeSettingsTab === "workflow") {
      this.renderWorkflowSettings(panel, copy);
    } else if (this.activeSettingsTab === "api") {
      this.renderApiDeviceSettings(panel, copy);
    } else if (this.activeSettingsTab === "push") {
      this.renderPushSettings(panel, copy);
    } else if (this.activeSettingsTab === "quote0") {
      this.renderQuote0Settings(panel, copy);
    } else if (this.activeSettingsTab === "backend") {
      this.renderBackendSettings(panel);
    } else if (this.activeSettingsTab === "hub") {
      this.renderHubSettings(panel);
    } else if (this.activeSettingsTab === "about") {
      this.renderAboutSettings(panel);
    } else {
      this.renderAiSettings(panel, copy);
    }
  }

  private renderSettingsTabs(containerEl: HTMLElement, copy: SettingCopy): void {
    const tabs: Array<{ id: SettingsTabId; label: string }> = [
      { id: "general", label: copy.tabs.general },
      { id: "cards", label: copy.tabs.cards },
      { id: "capture", label: copy.tabs.capture },
      { id: "inbox", label: copy.tabs.inbox },
      { id: "learning", label: copy.tabs.learning },
      { id: "workflow", label: copy.tabs.workflow },
      { id: "api", label: copy.tabs.api },
      { id: "push", label: copy.tabs.push },
      { id: "quote0", label: copy.tabs.quote0 },
      { id: "ai", label: copy.tabs.ai },
      { id: "backend", label: copy.tabs.backend },
      { id: "hub", label: copy.tabs.hub },
      { id: "about", label: copy.tabs.about }
    ];
    const tabBar = containerEl.createDiv({ cls: "towrite-settings-tabs" });
    tabBar.setAttribute("role", "tablist");

    for (const tab of tabs) {
      const active = this.activeSettingsTab === tab.id;
      const button = tabBar.createEl("button", {
        cls: `towrite-settings-tab${active ? " is-active" : ""}`,
        text: tab.label,
        attr: {
          type: "button",
          role: "tab",
          "aria-selected": String(active)
        }
      });
      button.addEventListener("click", () => {
        if (this.activeSettingsTab === tab.id) {
          return;
        }
        this.activeSettingsTab = tab.id;
        this.refreshSettingsUi();
      });
    }
  }

  private renderGeneralSettings(containerEl: HTMLElement, copy: SettingCopy): void {
    new Setting(containerEl)
      .setName(copy.language)
      .setDesc(copy.languageDesc)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("zh", copy.chinese)
          .addOption("en", copy.english)
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value === "en" ? "en" : "zh";
            await this.plugin.savePluginData();
            this.refreshSettingsUi();
          });
      });

    new Setting(containerEl)
      .setName(copy.exportDirectory)
      .setDesc(copy.exportDirectoryDesc)
      .addText((text) => {
        text
          .setValue(this.plugin.settings.exportDirectory)
          .setPlaceholder(".obsidian-open-questions")
          .onChange(async (value) => {
            this.plugin.settings.exportDirectory = value.trim() || ".obsidian-open-questions";
            await this.plugin.savePluginData();
          });
      });

    new Setting(containerEl)
      .setName(copy.autoExport)
      .setDesc(copy.autoExportDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.autoExport)
          .onChange(async (value) => {
            this.plugin.settings.autoExport = value;
            await this.plugin.savePluginData();
          });
      });

    new Setting(containerEl)
      .setName(copy.autoOpenSidebar)
      .setDesc(copy.autoOpenSidebarDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.autoOpenSidebar)
          .onChange(async (value) => {
            this.plugin.settings.autoOpenSidebar = value;
            await this.plugin.savePluginData();
          });
      });


  }

  private renderCardsEditorSettings(containerEl: HTMLElement, copy: SettingCopy): void {
    new Setting(containerEl)
      .setName(copy.groupCurrentByHeading)
      .setDesc(copy.groupCurrentByHeadingDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.groupCurrentByHeading)
          .onChange(async (value) => {
            this.plugin.settings.groupCurrentByHeading = value;
            await this.plugin.savePluginData();
          });
      });

    new Setting(containerEl)
      .setName(copy.candidateDetection)
      .setDesc(copy.candidateDetectionDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.enableCandidateDetection)
          .onChange(async (value) => {
            this.plugin.settings.enableCandidateDetection = value;
            await this.plugin.savePluginData();
            await this.plugin.refreshIndex();
          });
      });

    new Setting(containerEl)
      .setName(copy.editorDecorations)
      .setDesc(copy.editorDecorationsDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.enableEditorDecorations)
          .onChange(async (value) => {
            this.plugin.settings.enableEditorDecorations = value;
            await this.plugin.savePluginData();
          });
      });

    new Setting(containerEl)
      .setName(copy.compactEditorDecorations)
      .setDesc(copy.compactEditorDecorationsDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.compactEditorDecorations)
          .onChange(async (value) => {
            await this.plugin.setCompactEditorDecorations(value);
          });
      });

    new Setting(containerEl)
      .setName(copy.triggerWords)
      .setDesc(copy.triggerWordsDesc);
    this.renderTriggerWordEditor(containerEl, copy);

    new Setting(containerEl)
      .setName(copy.statuses)
      .setDesc(copy.statusesDesc);
    this.renderStatusEditor(containerEl, copy);

    new Setting(containerEl)
      .setName(copy.reminderPresets)
      .setDesc(copy.reminderPresetsDesc)
      .addTextArea((text) => {
        text
          .setValue(formatReminderPresets(this.plugin.settings.reminderPresets))
          .setPlaceholder(formatReminderPresets(DEFAULT_REMINDER_PRESETS))
          .onChange(async (value) => {
            this.plugin.settings.reminderPresets = parseReminderPresets(value);
            await this.plugin.savePluginData();
          });
        text.inputEl.rows = 7;
      });

    this.renderColorSetting(
      containerEl,
      copy.defaultThinkColor,
      copy.defaultThinkColorDesc,
      this.plugin.settings.defaultThinkColor,
      async (color) => {
        this.plugin.settings.defaultThinkColor = color;
        await this.plugin.savePluginData();
      }
    );

    this.renderColorSetting(
      containerEl,
      copy.defaultWriteColor,
      copy.defaultWriteColorDesc,
      this.plugin.settings.defaultWriteColor,
      async (color) => {
        this.plugin.settings.defaultWriteColor = color;
        await this.plugin.savePluginData();
      }
    );


    new Setting(containerEl)
      .setName(copy.writeArticleProperties)
      .setDesc(copy.writeArticlePropertiesDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.writeArticleProperties)
          .onChange(async (value) => {
            this.plugin.settings.writeArticleProperties = value;
            await this.plugin.savePluginData();
          });
      });
  }

  private renderCaptureSettings(containerEl: HTMLElement): void {
    const zh = this.plugin.settings.language !== "en";
    const capture = this.plugin.settings.deviceCapture;

    new Setting(containerEl)
      .setName(zh ? "智能记录" : "Smart capture")
      .setDesc(zh ? "在 Obsidian 内记录想法，并在保存前推荐已有笔记、文件夹和 Inbox。" : "Capture inside Obsidian and review an existing-note, folder, and Inbox destination before saving.")
      .addButton((button) => {
        button.setCta().setButtonText(zh ? "打开记录弹窗" : "Open capture").onClick(() => {
          this.plugin.openCaptureModal();
        });
      });

    new Setting(containerEl)
      .setName(zh ? "启用记录写入" : "Enable capture writes")
      .setDesc(zh ? "同时控制原生记录弹窗和设备输入页的独立想法写入。" : "Controls standalone writes from both the native modal and device input page.")
      .addToggle((toggle) => toggle.setValue(capture.enabled).onChange(async (value) => {
        capture.enabled = value;
        await this.plugin.savePluginData();
        this.refreshSettingsUi();
      }));

    if (!capture.enabled) {
      return;
    }

    new Setting(containerEl)
      .setName(zh ? "本地目标推荐" : "Local target recommendations")
      .setDesc(zh ? "默认开启，只使用本地 Vault 索引；Backend 和远程 AI 仍需单独启用。" : "Enabled by default and uses only the local vault index; Backend and remote AI remain separate opt-ins.")
      .addToggle((toggle) => toggle.setValue(capture.localRecommendations).onChange(async (value) => {
        capture.localRecommendations = value;
        await this.plugin.savePluginData();
      }));

    new Setting(containerEl)
      .setName(zh ? "默认 Inbox" : "Default Inbox")
      .addText((text) => text.setValue(capture.inboxFile).setPlaceholder("00-Raw/Device Inbox.md").onChange(async (value) => {
        capture.inboxFile = normalizeMarkdownPath(value);
        await this.plugin.savePluginData();
      }));

    new Setting(containerEl)
      .setName(zh ? "可新建的目标文件夹" : "Create-note target folders")
      .setDesc(zh ? "一行一个。Workflow Stage 的第一个文件夹也会自动成为候选。" : "One per line. The first folder of each Workflow Stage is also eligible.")
      .addTextArea((text) => {
        text.setValue(capture.targetFolders.join("\n")).setPlaceholder("00-Raw\n01-Sparks\n02-Processing").onChange(async (value) => {
          capture.targetFolders = splitWorkflowList(value);
          await this.plugin.savePluginData();
        });
        text.inputEl.rows = 4;
      });

    new Setting(containerEl)
      .setName(zh ? "追加区段标题" : "Append section heading")
      .setDesc(zh ? "追加到已有笔记时使用；无需输入 ##。" : "Used when appending to an existing note; omit the ## prefix.")
      .addText((text) => text.setValue(capture.appendHeading).setPlaceholder("Captures").onChange(async (value) => {
        capture.appendHeading = value.replace(/^#+\s*/u, "").trim().slice(0, 120) || "Captures";
        await this.plugin.savePluginData();
      }));

    new Setting(containerEl)
      .setName(zh ? "默认 tags" : "Default tags")
      .addTextArea((text) => {
        text.setValue(capture.defaultTags.map((tag) => `#${tag}`).join("\n")).onChange(async (value) => {
          capture.defaultTags = normalizeTagList(value);
          await this.plugin.savePluginData();
        });
        text.inputEl.rows = 3;
      });

    new Setting(containerEl).setName(zh ? "本地索引范围" : "Local index scope").setHeading();
    new Setting(containerEl)
      .setName(zh ? "仅包含文件夹" : "Include folders")
      .setDesc(zh ? "留空表示所有 Markdown；一行一个 Vault 相对路径。" : "Leave empty for all Markdown; one vault-relative path per line.")
      .addTextArea((text) => {
        text.setValue(capture.includeFolders.join("\n")).onChange(async (value) => {
          capture.includeFolders = splitWorkflowList(value);
          await this.plugin.savePluginData();
        });
        text.inputEl.rows = 3;
      });
    new Setting(containerEl)
      .setName(zh ? "排除文件夹" : "Exclude folders")
      .addTextArea((text) => {
        text.setValue(capture.excludeFolders.join("\n")).onChange(async (value) => {
          capture.excludeFolders = splitWorkflowList(value);
          await this.plugin.savePluginData();
        });
        text.inputEl.rows = 4;
      });
    new Setting(containerEl)
      .setName(zh ? "排除 tags / frontmatter" : "Exclude tags / frontmatter")
      .setDesc(zh ? "命中任一 tag 或 truthy frontmatter key 的笔记不会进入推荐或 AI 候选。" : "Notes matching any tag or truthy frontmatter key are excluded from recommendations and AI candidates.")
      .addTextArea((text) => {
        text.setValue(capture.excludeTags.join("\n")).setPlaceholder("private\nno-ai").onChange(async (value) => {
          capture.excludeTags = normalizeTagList(value);
          await this.plugin.savePluginData();
        });
        text.inputEl.rows = 3;
      })
      .addTextArea((text) => {
        text.setValue(capture.excludeFrontmatter.join("\n")).setPlaceholder("private\nno_ai").onChange(async (value) => {
          capture.excludeFrontmatter = normalizeTagList(value);
          await this.plugin.savePluginData();
        });
        text.inputEl.rows = 3;
      });
  }

  private renderInboxSettings(containerEl: HTMLElement): void {
    const zh = this.plugin.settings.language !== "en";
    const inbox = this.plugin.settings.inbox;
    const snapshot = this.plugin.getInboxSnapshot();

    new Setting(containerEl)
      .setName(zh ? "统一 Inbox" : "Unified Inbox")
      .setDesc(zh
        ? "把 Capture 生成但尚未整理的 Markdown 收拢到一个入口。V1 只索引路径、标题、tags 与时间，不读取正文；后续 Agent 来信和他人留言会复用同一 InboxItem 契约。"
        : "Collect captured Markdown that still needs organizing. V1 indexes only path, title, tags, and timestamps, never note bodies; future agent and human messages use the same InboxItem contract.")
      .addToggle((toggle) => toggle.setValue(inbox.enabled).onChange(async (value) => {
        inbox.enabled = value;
        await this.plugin.savePluginData();
        this.plugin.refreshInboxIndex();
        this.refreshSettingsUi();
      }));

    if (inbox.enabled) {
      const metadataSetting = new Setting(containerEl)
        .setName(zh ? "显式 Inbox 属性" : "Explicit Inbox property")
        .setDesc(zh
          ? "workflow_stage 是权威状态：设为 inbox 会从任意位置进入 Inbox；改为 raw、processing 等其他阶段会立即离开。没有该属性时才使用下方目录规则。"
          : "workflow_stage is authoritative: inbox enters from any folder; raw, processing, or another stage leaves immediately. Folder rules are used only when the property is absent.");
      metadataSetting.controlEl.createEl("code", { text: "workflow_stage: inbox" });
      metadataSetting.addButton((button) => button
        .setButtonText(zh ? "复制属性" : "Copy property")
        .onClick(() => void copyToClipboard("workflow_stage: inbox", zh ? "已复制 Inbox 属性" : "Inbox property copied")));

      new Setting(containerEl)
        .setName(zh ? "监控文件夹" : "Watched folders")
        .setDesc(zh
          ? `当前 ${snapshot.count} 条待整理笔记。一行一个 Vault 相对路径；子文件夹会作为兼容规则自动纳入。`
          : `${snapshot.count} notes are waiting. Enter one vault-relative folder per line; descendants are included as a compatibility fallback.`)
        .addTextArea((text) => {
          text.setValue(inbox.folderPrefixes.join("\n")).setPlaceholder("00-Raw_Materials/Quick_Notes").onChange((value) => {
            Object.assign(inbox, normalizeInboxSettings({
              ...inbox,
              folderPrefixes: splitWorkflowList(value)
            }));
            this.queueInboxSettingsSave();
          });
          text.inputEl.rows = 4;
        });

      new Setting(containerEl)
        .setName(zh ? "新建或移入时写入 Inbox 属性" : "Write Inbox property on create or move")
        .setDesc(zh
          ? "默认关闭。开启后，只给监控目录中尚无 workflow_stage 的新笔记或移入笔记写入 workflow_stage: inbox；绝不覆盖已有阶段。"
          : "Off by default. Adds workflow_stage: inbox only to new or moved notes in watched folders that have no explicit stage; existing stages are never overwritten.")
        .addToggle((toggle) => toggle.setValue(inbox.autoApplyStageOnCreate).onChange(async (value) => {
          inbox.autoApplyStageOnCreate = value;
          await this.plugin.savePluginData();
        }));

      new Setting(containerEl)
        .setName(zh ? "补写现有笔记的 Inbox 属性" : "Materialize metadata for existing notes")
        .setDesc(zh
          ? "一次性给当前监控目录中的旧笔记补写显式属性。已有 workflow_stage / workflow_status 的笔记会跳过。"
          : "One-time migration for existing notes in watched folders. Notes with workflow_stage or workflow_status are skipped.")
        .addButton((button) => button.setButtonText(zh ? "补写属性" : "Write metadata").onClick(async () => {
          button.setDisabled(true);
          try {
            const result = await this.plugin.materializeInboxMetadata();
            new Notice(zh
              ? `已补写 ${result.updated} 篇；跳过 ${result.alreadyExplicit} 篇已有阶段的笔记。`
              : `Updated ${result.updated}; skipped ${result.alreadyExplicit} notes with an existing stage.`);
            this.refreshSettingsUi();
          } catch (error) {
            new Notice(`${zh ? "补写失败" : "Could not write Inbox metadata"}: ${error instanceof Error ? error.message : String(error)}`);
          } finally {
            button.setDisabled(false);
          }
        }));

      new Setting(containerEl)
        .setName(zh ? "分组方式" : "Group Inbox by")
        .setDesc(zh ? "项目取监控根目录下的第一层文件夹；文件夹模式保留完整相对层级。" : "Project uses the first folder below a watched root; Folder preserves the full relative folder hierarchy.")
        .addDropdown((dropdown) => dropdown
          .addOption("project", zh ? "项目" : "Project")
          .addOption("folder", zh ? "文件夹" : "Folder")
          .setValue(inbox.groupBy)
          .onChange(async (value) => {
            inbox.groupBy = value === "folder" ? "folder" : "project";
            await this.plugin.savePluginData();
            this.plugin.notifyUi();
          }));

      new Setting(containerEl)
        .setName(zh ? "最大显示条数" : "Maximum visible notes")
        .setDesc(zh ? "按最近修改排序；只限制 UI，不会读取笔记正文。" : "Sorted by most recently modified; this limits UI metadata only and never reads bodies.")
        .addText((text) => text.setValue(String(inbox.maxItems)).onChange(async (value) => {
          inbox.maxItems = clampInteger(value, 10, 2_000, 200);
          await this.plugin.savePluginData();
          this.plugin.notifyUi();
        }));

      new Setting(containerEl)
        .setName(zh ? "允许进入设备推荐候选" : "Include in device recommendations")
        .setDesc(zh
          ? "开启后只发送通过本地隐私过滤的标题级候选；不会读取或上传 Quick Note 正文。手工发送仍会冻结到原笔记作为 NFC 追加目标。"
          : "Adds title-only candidates after local privacy filtering; Quick Note bodies are never read or uploaded. Manual sends still freeze the original note as the NFC append target.")
        .addToggle((toggle) => toggle.setValue(inbox.includeInDeviceCandidates).onChange(async (value) => {
          inbox.includeInDeviceCandidates = value;
          await this.plugin.savePluginData();
          this.plugin.notifyUi();
          void this.plugin.syncDeviceHub(false);
        }));

      new Setting(containerEl)
        .setName(zh ? "Inbox 索引" : "Inbox index")
        .setDesc(snapshot.truncated
          ? (zh ? `共 ${snapshot.count} 条，当前显示最近 ${snapshot.visibleCount} 条。` : `${snapshot.count} total; showing the latest ${snapshot.visibleCount}.`)
          : (zh ? `${snapshot.count} 条，按 ${snapshot.groups.length} 个分组显示。` : `${snapshot.count} notes in ${snapshot.groups.length} groups.`))
        .addButton((button) => button.setButtonText(zh ? "立即刷新" : "Refresh now").onClick(() => {
          this.plugin.refreshInboxIndex();
          this.refreshSettingsUi();
        }));
    }

    this.renderDeviceLibrarySettings(containerEl, zh);
  }

  private renderDeviceLibrarySettings(containerEl: HTMLElement, zh: boolean): void {
    const hub = this.plugin.settings.hub;
    const library = this.plugin.getDeviceContentLibrary();

    new Setting(containerEl)
      .setName(zh ? "设备内容库" : "Device content library")
      .setDesc(zh
        ? `ToThink / ToWrite 卡片中有 ${library.eligibleCount} 条可发送，${library.excludedCount} 条被隐私或来源规则排除。完整列表放在这里，侧栏只保留当前推荐。`
        : `${library.eligibleCount} ToThink / ToWrite cards are eligible and ${library.excludedCount} are excluded. The full library lives here while the sidebar shows only the current recommendation.`)
      .setHeading();

    this.renderEchoCardWorkbench(containerEl, zh);

    new Setting(containerEl)
      .setName(zh ? "内容选择方式" : "Content selection mode")
      .setDesc(zh ? "Agent 只能在本地白名单候选中重排；不会发明笔记或路径。" : "Agent may only rerank locally allowlisted candidates and cannot invent notes or paths.")
      .addDropdown((dropdown) => dropdown
        .addOption("manual", zh ? "手动" : "Manual")
        .addOption("agent", "Agent")
        .addOption("rotation", zh ? "循环播放" : "Rotation")
        .addOption("schedule", zh ? "固定时间" : "Schedule")
        .setValue(hub.selectionMode)
        .onChange((value) => {
          void this.plugin.setDeviceHubSelectionMode(value as typeof hub.selectionMode).then(() => this.refreshSettingsUi());
        }));

    new Setting(containerEl)
      .setName(zh ? "划线卡自动加入设备库" : "Auto-add selection cards")
      .setDesc(zh ? "解决、隐藏或手工移出的卡片不会再参与推荐。" : "Resolved, hidden, or explicitly removed cards no longer participate.")
      .addToggle((toggle) => toggle.setValue(hub.autoAddSelections).onChange(async (value) => {
        hub.autoAddSelections = value;
        await this.plugin.savePluginData();
        this.plugin.notifyUi();
        void this.plugin.syncDeviceHub(false);
      }));

    if (hub.selectionMode === "rotation") {
      new Setting(containerEl)
        .setName(zh ? "循环间隔（分钟）" : "Rotation interval (minutes)")
        .setDesc(zh ? "设备成功 ACK 后才开始下一轮计时。" : "The next interval starts only after a successful display ACK.")
        .addText((text) => text.setValue(String(hub.rotationIntervalMinutes)).onChange(async (value) => {
          hub.rotationIntervalMinutes = clampInteger(value, 1, 1440, 30);
          await this.plugin.savePluginData();
          this.plugin.configureDeviceHub();
        }));
    }

    const entries = library.entries.filter((entry) => entry.inLibrary);
    const details = containerEl.createEl("details", { cls: "towrite-settings-device-library" });
    const summary = details.createEl("summary", { cls: "towrite-settings-device-library-summary" });
    summary.createSpan({ text: zh ? `查看 ${entries.length} 张卡片` : `Review ${entries.length} cards` });
    summary.createEl("small", { text: zh ? "打开、立即显示或移出" : "Open, show now, or remove" });
    const list = details.createDiv({ cls: "towrite-settings-device-library-list" });
    if (entries.length === 0) {
      list.createEl("p", { text: zh ? "划线加入 ToThink / ToWrite 后，卡片会出现在这里。" : "Cards appear here after a selection is saved as ToThink / ToWrite." });
      return;
    }

    for (const entry of entries) {
      const row = list.createDiv({ cls: `towrite-settings-device-library-row${entry.eligible ? "" : " is-excluded"}` });
      const copy = row.createDiv({ cls: "towrite-settings-device-library-copy" });
      copy.createEl("strong", { text: entry.title });
      copy.createEl("small", {
        text: [
          entry.lane === "write" ? "ToWrite" : "ToThink",
          entry.schedule?.enabled ? entry.schedule.localTime : "",
          entry.priority || "",
          entry.eligible ? (zh ? "可发送" : "Eligible") : (zh ? "已排除" : "Excluded")
        ].filter(Boolean).join(" · ")
      });
      const actions = row.createDiv({ cls: "towrite-settings-device-library-actions" });
      const openLabel = zh ? `打开 ${entry.title}` : `Open ${entry.title}`;
      const open = actions.createEl("button", { attr: { type: "button", title: openLabel, "aria-label": openLabel } });
      setIcon(open, "external-link");
      open.addEventListener("click", () => void this.plugin.jumpToQuestion(entry.id));
      const sendLabel = zh ? `立即显示 ${entry.title}` : `Show ${entry.title} now`;
      const send = actions.createEl("button", { attr: { type: "button", title: sendLabel, "aria-label": sendLabel } });
      setIcon(send, "monitor-up");
      send.disabled = !entry.eligible;
      send.addEventListener("click", () => {
        void this.plugin.sendQuestionToDeviceHub(entry.id).then(() => this.refreshSettingsUi()).catch((error: unknown) => {
          new Notice(`${zh ? "发送失败" : "Could not send"}: ${error instanceof Error ? error.message : String(error)}`);
        });
      });
      const removeLabel = zh ? `移出 ${entry.title}` : `Remove ${entry.title}`;
      const remove = actions.createEl("button", { attr: { type: "button", title: removeLabel, "aria-label": removeLabel } });
      setIcon(remove, "trash-2");
      remove.addEventListener("click", () => {
        void this.plugin.toggleQuestionInDeviceLibrary(entry.id).then(() => this.refreshSettingsUi());
      });
    }
  }

  private renderEchoCardWorkbench(containerEl: HTMLElement, zh: boolean): void {
    const presets = this.plugin.getEchoCardPresets();
    const cards = this.plugin.getEchoCards();
    const section = containerEl.createEl("section", {
      cls: "towrite-echo-workbench",
      attr: { "aria-labelledby": "towrite-echo-heading" }
    });
    const heading = section.createDiv({ cls: "towrite-echo-section-heading" });
    const headingCopy = heading.createDiv();
    headingCopy.createEl("h3", { text: zh ? "Echo 墨水屏卡片" : "Echo e-ink cards", attr: { id: "towrite-echo-heading" } });
    headingCopy.createEl("p", {
      text: zh
        ? "一张卡只保留一个核心信息与最多三个动作。参考模板不会自动加入设备库，也不会触发 AI。"
        : "Keep one core idea and at most three actions per card. Reference templates never enter the library or invoke AI automatically."
    });
    const blank = heading.createEl("button", {
      cls: "towrite-echo-new-button",
      text: zh ? "新建空白卡" : "New blank card",
      attr: { type: "button" }
    });
    blank.addEventListener("click", () => void this.startEchoCardDraft(undefined));

    const presetDetails = section.createEl("details", { cls: "towrite-echo-presets" });
    const presetSummary = presetDetails.createEl("summary");
    presetSummary.createSpan({ text: zh ? `参考模板 · ${presets.length}` : `Reference templates · ${presets.length}` });
    presetSummary.createEl("small", { text: zh ? "选择后先编辑，不会立即保存" : "Choose, edit, then save" });
    const presetGrid = presetDetails.createDiv({ cls: "towrite-echo-preset-grid" });
    for (const preset of presets) {
      this.renderEchoPresetButton(presetGrid, preset, zh);
    }

    const library = section.createDiv({ cls: "towrite-echo-user-library" });
    const libraryHeading = library.createDiv({ cls: "towrite-echo-subheading" });
    libraryHeading.createEl("strong", { text: zh ? "我的卡片" : "My cards" });
    libraryHeading.createEl("small", {
      text: cards.length > 0
        ? (zh ? `${cards.length} 张 · 只有明确启用的卡片才参与 Agent、循环或定时` : `${cards.length} · only explicitly enabled cards join Agent, rotation, or schedules`)
        : (zh ? "尚未保存卡片" : "No saved cards yet")
    });

    if (cards.length > 0) {
      const cardList = library.createDiv({ cls: "towrite-echo-card-list" });
      for (const card of cards) {
        const row = cardList.createEl("article", {
          cls: `towrite-echo-card-row${this.echoCardDraft?.id === card.id ? " is-editing" : ""}`
        });
        const cardCopy = row.createDiv({ cls: "towrite-echo-card-row-copy" });
        const title = cardCopy.createDiv({ cls: "towrite-echo-card-row-title" });
        title.createEl("strong", { text: card.name });
        const disclosure = echoCardDisclosureLabel(card.disclosure, zh ? "zh-CN" : "en");
        if (disclosure) title.createSpan({ cls: "towrite-echo-disclosure", text: disclosure });
        cardCopy.createEl("small", {
          text: [
            card.typeLabel,
            card.subject,
            card.inLibrary ? (zh ? "设备库" : "In library") : (zh ? "仅手动" : "Manual only"),
            card.schedule?.enabled ? card.schedule.localTime : ""
          ].filter(Boolean).join(" · ")
        });
        const rowActions = row.createDiv({ cls: "towrite-echo-card-row-actions" });
        this.createEchoIconButton(rowActions, "pencil", zh ? `编辑 ${card.name}` : `Edit ${card.name}`, () => {
          if (!this.canReplaceEchoCardDraft(zh)) return;
          this.echoCardDraft = cloneEchoCardForEditor(card);
          this.echoCardDraftBaseline = echoCardFingerprint(card);
          this.echoCardDeleteConfirmId = "";
          this.refreshSettingsUi();
        });
        this.createEchoIconButton(rowActions, "monitor-up", zh ? `立即显示 ${card.name}` : `Show ${card.name} now`, () => {
          void this.sendSavedEchoCard(card.id, zh);
        });
        this.createEchoIconButton(rowActions, "copy", zh ? `复制 ${card.name}` : `Duplicate ${card.name}`, () => {
          if (!this.canReplaceEchoCardDraft(zh)) return;
          this.duplicateEchoCardDraft(card, zh);
        });
        const armed = this.echoCardDeleteConfirmId === card.id;
        this.createEchoIconButton(rowActions, armed ? "alert-triangle" : "trash-2", armed
          ? (zh ? "再次点击确认删除" : "Click again to confirm deletion")
          : (zh ? `删除 ${card.name}` : `Delete ${card.name}`), () => {
          if (!armed) {
            this.echoCardDeleteConfirmId = card.id;
            this.refreshSettingsUi();
            return;
          }
          void this.plugin.deleteEchoCard(card.id).then(() => {
            if (this.echoCardDraft?.id === card.id) {
              this.echoCardDraft = undefined;
              this.echoCardDraftBaseline = "";
            }
            this.echoCardDeleteConfirmId = "";
            new Notice(zh ? "Echo 卡片已删除。" : "Echo card deleted.");
            this.refreshSettingsUi();
          }).catch((error: unknown) => {
            new Notice(`${zh ? "删除失败" : "Could not delete"}: ${error instanceof Error ? error.message : String(error)}`);
          });
        }, armed ? "is-danger" : "");
      }
    }

    if (this.echoCardDraft) {
      this.renderEchoCardEditor(section, this.echoCardDraft, cards, zh);
    }
  }

  private renderEchoPresetButton(containerEl: HTMLElement, preset: EchoCardReferencePreset, zh: boolean): void {
    const button = containerEl.createEl("button", {
      cls: "towrite-echo-preset-card",
      attr: { type: "button", "aria-label": `${zh ? "使用模板" : "Use template"}: ${preset.name}` }
    });
    const top = button.createDiv({ cls: "towrite-echo-preset-top" });
    top.createEl("strong", { text: preset.typeLabel });
    if (preset.subject) top.createSpan({ text: preset.subject });
    const disclosure = echoCardDisclosureLabel(preset.disclosure, zh ? "zh-CN" : "en");
    if (disclosure) button.createSpan({ cls: "towrite-echo-disclosure", text: disclosure });
    button.createEl("p", { text: preset.content });
    button.createEl("small", { text: preset.name });
    button.addEventListener("click", () => void this.startEchoCardDraft(preset.presetId));
  }

  private async startEchoCardDraft(presetId?: string, replaceConfirmed = false): Promise<void> {
    const zh = this.plugin.settings.language !== "en";
    if (!replaceConfirmed && !this.canReplaceEchoCardDraft(zh)) return;
    try {
      const draft = await this.plugin.createEchoCardFromPreset(presetId);
      this.echoCardDraft = cloneEchoCardForEditor(draft);
      this.echoCardDraftBaseline = "";
      this.echoCardDeleteConfirmId = "";
      this.refreshSettingsUi();
      this.focusEchoCardWorkbench();
    } catch (error) {
      new Notice(`Echo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private openEchoCardWorkbench(createBlank: boolean): void {
    if (createBlank) {
      const zh = this.plugin.settings.language !== "en";
      if (!this.canReplaceEchoCardDraft(zh)) return;
      this.activeSettingsTab = "inbox";
      void this.startEchoCardDraft(undefined, true);
      return;
    }
    this.activeSettingsTab = "inbox";
    this.refreshSettingsUi();
    this.focusEchoCardWorkbench();
  }

  private focusEchoCardWorkbench(): void {
    window.requestAnimationFrame(() => {
      this.containerEl.querySelector<HTMLElement>(".towrite-echo-workbench")?.scrollIntoView({
        block: "start",
        behavior: "smooth"
      });
    });
  }

  private duplicateEchoCardDraft(card: EchoCard, zh: boolean): void {
    const now = new Date().toISOString();
    this.echoCardDraft = {
      ...cloneEchoCardForEditor(card),
      id: createEchoCardId(),
      name: `${card.name}${zh ? "（副本）" : " copy"}`,
      inLibrary: false,
      agentEligible: false,
      rotationEligible: false,
      schedule: undefined,
      createdAt: now,
      updatedAt: now
    };
    this.echoCardDraftBaseline = "";
    this.echoCardDeleteConfirmId = "";
    this.refreshSettingsUi();
  }

  private renderEchoCardEditor(containerEl: HTMLElement, draft: EchoCard, savedCards: readonly EchoCard[], zh: boolean): void {
    const editor = containerEl.createEl("section", {
      cls: "towrite-echo-editor",
      attr: { "aria-label": zh ? "Echo 卡片编辑器" : "Echo card editor" }
    });
    const editorHeader = editor.createDiv({ cls: "towrite-echo-editor-header" });
    const editorTitle = editorHeader.createDiv();
    editorTitle.createEl("strong", { text: zh ? "编辑卡片" : "Edit card" });
    const editorStatus = editorTitle.createEl("small");
    const close = editorHeader.createEl("button", {
      cls: "towrite-echo-close",
      attr: { type: "button", title: zh ? "关闭编辑器" : "Close editor", "aria-label": zh ? "关闭编辑器" : "Close editor" }
    });
    setIcon(close, "x");
    close.addEventListener("click", () => {
      if (!this.canReplaceEchoCardDraft(zh)) return;
      this.echoCardDraft = undefined;
      this.echoCardDraftBaseline = "";
      this.refreshSettingsUi();
    });

    const layout = editor.createDiv({ cls: "towrite-echo-editor-layout" });
    const form = layout.createDiv({ cls: "towrite-echo-form" });
    const previewPanel = layout.createDiv({ cls: "towrite-echo-preview-panel" });
    previewPanel.createEl("span", { cls: "towrite-echo-preview-label", text: zh ? "2.7 英寸 · 264 × 176 预览" : "2.7 inch · 264 × 176 preview" });
    const preview = previewPanel.createDiv({ cls: "towrite-echo-preview-root" });
    const fitMessage = previewPanel.createDiv({ cls: "towrite-echo-fit-message", attr: { "aria-live": "polite" } });

    const updatePreview = (): void => {
      const validation = validateEchoCardLayout(draft);
      preview.empty();
      this.renderEchoScreenPreview(preview, draft, validation.fits, zh);
      fitMessage.empty();
      fitMessage.toggleClass("is-overflow", !validation.fits);
      if (validation.fits) {
        fitMessage.createSpan({ text: zh
          ? `适合 2.7 英寸布局 · ${validation.weightedUnits}/${validation.maxWeightedUnits}`
          : `Fits the 2.7-inch layout · ${validation.weightedUnits}/${validation.maxWeightedUnits}` });
      } else {
        const fields = [...new Set(validation.issues.map((issue) => echoLayoutFieldLabel(issue.field, zh)))];
        fitMessage.createSpan({ text: zh
          ? `需要精简：${fields.join("、")} · ${validation.weightedUnits}/${validation.maxWeightedUnits}`
          : `Shorten: ${fields.join(", ")} · ${validation.weightedUnits}/${validation.maxWeightedUnits}` });
      }
      const dirty = !this.echoCardDraftBaseline || echoCardFingerprint(draft) !== this.echoCardDraftBaseline;
      editorStatus.setText([
        dirty ? (zh ? "未保存修改" : "Unsaved changes") : (zh ? "已保存" : "Saved"),
        validation.fits ? (zh ? "屏幕适配" : "Screen fit") : (zh ? "内容过长" : "Too long")
      ].join(" · "));
      saveButton.disabled = !draft.name.trim();
      sendButton.disabled = !draft.name.trim() || !validation.fits;
      sendButton.title = validation.fits ? "" : (zh ? "请先精简标记出的字段" : "Shorten the highlighted fields first");
    };
    const mutate = (patch: Partial<EchoCard>): void => {
      Object.assign(draft, patch);
      this.echoCardDraft = draft;
      updatePreview();
    };

    new Setting(form)
      .setName(zh ? "卡片名称" : "Card name")
      .setDesc(zh ? "只用于在插件里识别，不会完整显示到屏幕。" : "Used inside the plugin; it is not shown verbatim on screen.")
      .addText((input) => input.setValue(draft.name).setPlaceholder(zh ? "例如：潮汐 · 去年今天" : "e.g. Tide · On this day").onChange((value) => mutate({ name: value })));

    const identity = form.createDiv({ cls: "towrite-echo-field-grid" });
    new Setting(identity)
      .setName(zh ? "内容类型" : "Content type")
      .addDropdown((dropdown) => {
        for (const option of ECHO_CONTENT_TYPE_OPTIONS) dropdown.addOption(option.value, zh ? option.zh : option.en);
        dropdown.setValue(draft.contentType).onChange((value) => mutate({ contentType: value as HubContentType }));
      });
    new Setting(identity)
      .setName(zh ? "卡片类型标签" : "Type label")
      .addText((input) => input.setValue(draft.typeLabel).setPlaceholder(zh ? "记忆回响" : "Memory echo").onChange((value) => mutate({ typeLabel: value })));
    new Setting(identity)
      .setName(zh ? "项目 / 角色" : "Project / character")
      .addText((input) => input.setValue(draft.subject).setPlaceholder(zh ? "《潮汐》 / 林屿" : "Tide / Lin Yu").onChange((value) => mutate({ subject: value })));
    new Setting(identity)
      .setName(zh ? "AI 标记" : "AI disclosure")
      .setDesc(zh ? "AI 生成内容必须明确标记为推测、模拟或视角。" : "AI content must be labelled as inference, simulation, or perspective.")
      .addDropdown((dropdown) => dropdown
        .addOption("none", zh ? "非 AI / 用户原文" : "Non-AI / user text")
        .addOption("ai_inference", zh ? "AI 推测" : "AI inference")
        .addOption("ai_simulation", zh ? "AI 模拟" : "AI simulation")
        .addOption("ai_perspective", zh ? "AI 视角" : "AI perspective")
        .setValue(draft.disclosure)
        .onChange((value) => mutate({ disclosure: value as EchoCardDisclosure })));

    new Setting(form)
      .setName(zh ? "一句上下文" : "One-line context")
      .addTextArea((input) => {
        input.setValue(draft.context).setPlaceholder(zh ? "上次你停在……" : "Last time, you stopped at…").onChange((value) => mutate({ context: value }));
        input.inputEl.rows = 2;
      });
    new Setting(form)
      .setName(zh ? "核心内容 / 问题" : "Core content / question")
      .setDesc(zh ? "这张卡真正需要被注意的一件事。" : "The one thing this card asks the reader to notice.")
      .addTextArea((input) => {
        input.setValue(draft.content).setPlaceholder(zh ? "写下一条真正值得注意的内容。" : "Write one thing worth noticing.").onChange((value) => mutate({ content: value }));
        input.inputEl.rows = 4;
      });
    new Setting(form)
      .setName(zh ? "为什么此刻出现" : "Why now")
      .addTextArea((input) => {
        input.setValue(draft.whyNow).setPlaceholder(zh ? "继续上次未完成的创作线索。" : "Continue an unfinished thread from last time.").onChange((value) => mutate({ whyNow: value }));
        input.inputEl.rows = 2;
      });
    new Setting(form)
      .setName(zh ? "内容来源" : "Source")
      .addText((input) => input.setValue(draft.sourceLabel).setPlaceholder(zh ? "来自 2025.07.24 · 人物草稿" : "From 2025-07-24 · character draft").onChange((value) => mutate({ sourceLabel: value })));

    const actionSetting = new Setting(form)
      .setName(zh ? "屏幕操作" : "Screen actions")
      .setDesc(zh ? "选择 1–3 个操作；操作顺序与这里一致。" : "Choose 1–3 actions in this order.");
    const actionGrid = actionSetting.controlEl.createDiv({ cls: "towrite-echo-action-picker" });
    const renderActionPicker = (): void => {
      actionGrid.empty();
      for (const action of ECHO_ACTION_OPTIONS) {
        const selected = draft.actions.includes(action);
        const actionButton = actionGrid.createEl("button", {
          cls: `towrite-echo-action-chip${selected ? " is-selected" : ""}`,
          text: echoCardActionLabel(action, draft, zh ? "zh-CN" : "en"),
          attr: { type: "button", "aria-pressed": String(selected) }
        });
        actionButton.disabled = !selected && draft.actions.length >= 3;
        actionButton.addEventListener("click", () => {
          if (selected && draft.actions.length === 1) {
            new Notice(zh ? "至少保留一个屏幕操作。" : "Keep at least one screen action.");
            return;
          }
          draft.actions = selected
            ? draft.actions.filter((item) => item !== action)
            : [...draft.actions, action].slice(0, 3);
          renderActionPicker();
          updatePreview();
        });
      }
    };
    renderActionPicker();

    const advanced = form.createEl("details", { cls: "towrite-echo-advanced" });
    advanced.createEl("summary", { text: zh ? "发送、目标与自动选择" : "Delivery, target, and automation" });
    const advancedBody = advanced.createDiv({ cls: "towrite-echo-advanced-body" });
    new Setting(advancedBody)
      .setName(zh ? "记录目标" : "Capture target")
      .setDesc(zh ? "留空使用 Capture Inbox。可填写已有 Markdown 笔记或已授权的新建文件夹。" : "Leave empty for the Capture Inbox. Use an existing Markdown note or an authorized create folder.")
      .addText((input) => input.setValue(draft.targetPath ?? "").setPlaceholder(zh ? "留空 = Capture Inbox" : "Blank = Capture Inbox").onChange((value) => mutate({ targetPath: value.trim() || undefined })));
    new Setting(advancedBody)
      .setName(zh ? "加入设备内容库" : "Include in device library")
      .setDesc(zh ? "关闭时仍可手动发送；Agent、循环和定时不会自动选择。" : "Manual sending still works when off; Agent, rotation, and schedules will not select it.")
      .addToggle((toggle) => toggle.setValue(draft.inLibrary).onChange((value) => mutate({ inLibrary: value })));
    new Setting(advancedBody)
      .setName(zh ? "允许 Agent 选择" : "Allow Agent selection")
      .addToggle((toggle) => toggle.setValue(draft.agentEligible).onChange((value) => mutate({ agentEligible: value, ...(value ? { inLibrary: true } : {}) })));
    new Setting(advancedBody)
      .setName(zh ? "允许循环播放" : "Allow rotation")
      .addToggle((toggle) => toggle.setValue(draft.rotationEligible).onChange((value) => mutate({ rotationEligible: value, ...(value ? { inLibrary: true } : {}) })));
    new Setting(advancedBody)
      .setName(zh ? "固定显示时间" : "Scheduled time")
      .setDesc(zh ? "使用 24 小时 HH:mm；留空关闭。V1 默认每天生效 30 分钟。" : "Use 24-hour HH:mm; leave blank to disable. V1 uses a daily 30-minute window.")
      .addText((input) => input.setValue(draft.schedule?.enabled ? draft.schedule.localTime : "").setPlaceholder("15:30").onChange((value) => {
        const time = value.trim();
        mutate({
          schedule: time ? {
            enabled: true,
            weekdays: draft.schedule?.weekdays ?? [0, 1, 2, 3, 4, 5, 6],
            localTime: time,
            durationMinutes: draft.schedule?.durationMinutes ?? 30
          } : undefined,
          ...(time ? { inLibrary: true } : {})
        });
      }));

    const footer = editor.createDiv({ cls: "towrite-echo-editor-footer" });
    const secondary = footer.createDiv({ cls: "towrite-echo-editor-secondary" });
    const duplicateButton = secondary.createEl("button", { text: zh ? "复制为新卡" : "Duplicate", attr: { type: "button" } });
    duplicateButton.addEventListener("click", () => this.duplicateEchoCardDraft(draft, zh));
    const persisted = savedCards.some((card) => card.id === draft.id);
    if (persisted) {
      const deleteButton = secondary.createEl("button", { text: zh ? "删除" : "Delete", attr: { type: "button" } });
      deleteButton.addClass("towrite-echo-delete-text");
      deleteButton.addEventListener("click", () => {
        if (this.echoCardDeleteConfirmId !== draft.id) {
          this.echoCardDeleteConfirmId = draft.id;
          deleteButton.setText(zh ? "再次点击删除" : "Confirm delete");
          deleteButton.addClass("is-armed");
          return;
        }
        void this.plugin.deleteEchoCard(draft.id).then(() => {
          this.echoCardDraft = undefined;
          this.echoCardDraftBaseline = "";
          this.echoCardDeleteConfirmId = "";
          new Notice(zh ? "Echo 卡片已删除。" : "Echo card deleted.");
          this.refreshSettingsUi();
        });
      });
    }
    const primary = footer.createDiv({ cls: "towrite-echo-editor-primary" });
    const saveButton = primary.createEl("button", { text: zh ? "保存" : "Save", attr: { type: "button" } });
    saveButton.addEventListener("click", () => void this.saveEchoCardDraft(draft, zh, false));
    const hubReady = Boolean(
      this.plugin.settings.hub.enabled
      && this.plugin.settings.hub.baseUrl
      && this.plugin.settings.hub.receiverId
      && this.plugin.settings.hub.deviceId
    );
    const sendButton = primary.createEl("button", {
      cls: "mod-cta",
      text: hubReady
        ? (zh ? "保存并发送到屏幕" : "Save and send to display")
        : (zh ? "保存并设为当前卡片" : "Save as current card"),
      attr: { type: "button" }
    });
    sendButton.addEventListener("click", () => void this.saveEchoCardDraft(draft, zh, true));

    updatePreview();
  }

  private renderEchoScreenPreview(containerEl: HTMLElement, card: EchoCard, fits: boolean, zh: boolean): void {
    const screen = containerEl.createDiv({ cls: `towrite-echo-screen${fits ? "" : " is-overflow"}` });
    const header = screen.createDiv({ cls: "towrite-echo-screen-header" });
    const label = header.createDiv();
    label.createEl("strong", { text: card.typeLabel || (zh ? "卡片类型" : "Card type") });
    const disclosure = echoCardDisclosureLabel(card.disclosure, zh ? "zh-CN" : "en");
    if (disclosure) label.createSpan({ text: disclosure });
    header.createEl("span", { text: card.subject || (zh ? "项目 / 角色" : "Project / character"), cls: card.subject ? "" : "is-placeholder" });
    const content = screen.createDiv({ cls: "towrite-echo-screen-content" });
    if (card.context) content.createEl("p", { cls: "towrite-echo-screen-context", text: card.context });
    content.createEl("p", {
      cls: `towrite-echo-screen-core${card.content ? "" : " is-placeholder"}`,
      text: card.content || (zh ? "一条真正值得注意的内容，或者一个问题。" : "One thing worth noticing, or one question.")
    });
    if (card.whyNow) content.createEl("p", { cls: "towrite-echo-screen-why", text: card.whyNow });
    const bottom = screen.createDiv({ cls: "towrite-echo-screen-bottom" });
    bottom.createEl("small", {
      cls: card.sourceLabel ? "" : "is-placeholder",
      text: card.sourceLabel || (zh ? "内容来源 / 为什么此刻出现" : "Source / why now")
    });
    const actions = bottom.createDiv({ cls: "towrite-echo-screen-actions" });
    for (const action of card.actions.slice(0, 3)) {
      actions.createSpan({ text: echoCardActionLabel(action, card, zh ? "zh-CN" : "en") });
    }
  }

  private createEchoIconButton(
    containerEl: HTMLElement,
    icon: string,
    label: string,
    run: () => void,
    extraClass = ""
  ): HTMLButtonElement {
    const button = containerEl.createEl("button", {
      cls: `towrite-echo-icon-button${extraClass ? ` ${extraClass}` : ""}`,
      attr: { type: "button", title: label, "aria-label": label }
    });
    setIcon(button, icon);
    button.addEventListener("click", run);
    return button;
  }

  private canReplaceEchoCardDraft(zh: boolean): boolean {
    const draft = this.echoCardDraft;
    if (!draft) return true;
    const dirty = !this.echoCardDraftBaseline || echoCardFingerprint(draft) !== this.echoCardDraftBaseline;
    return !dirty || window.confirm(zh ? "放弃尚未保存的 Echo 卡片修改？" : "Discard unsaved Echo card changes?");
  }

  private async saveEchoCardDraft(draft: EchoCard, zh: boolean, send: boolean): Promise<void> {
    if (this.echoCardMutationRunning) return;
    this.echoCardMutationRunning = true;
    try {
      const saved = await this.plugin.upsertEchoCard(cloneEchoCardForEditor(draft));
      this.echoCardDraft = cloneEchoCardForEditor(saved);
      this.echoCardDraftBaseline = echoCardFingerprint(saved);
      const hubState = send ? await this.plugin.sendEchoCardToDeviceHub(saved.id) : undefined;
      new Notice(send
        ? hubState
          ? (zh ? "Echo 卡片已保存并发送到设备。" : "Echo card saved and sent to the device.")
          : (zh ? "Echo 卡片已保存为本地当前卡片；Device Hub 尚未连接，未发送到 ESP32。" : "Echo card saved as the local current card. Device Hub is not connected, so it was not sent to the ESP32.")
        : (zh ? "Echo 卡片已保存。" : "Echo card saved."));
      this.refreshSettingsUi();
    } catch (error) {
      new Notice(`${send ? (zh ? "发送失败" : "Could not send") : (zh ? "保存失败" : "Could not save")}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.echoCardMutationRunning = false;
    }
  }

  private async sendSavedEchoCard(cardId: string, zh: boolean): Promise<void> {
    if (this.echoCardMutationRunning) return;
    this.echoCardMutationRunning = true;
    try {
      const hubState = await this.plugin.sendEchoCardToDeviceHub(cardId);
      new Notice(hubState
        ? (zh ? "Echo 卡片已发送到设备。" : "Echo card sent to the device.")
        : (zh ? "已设为本地当前卡片；Device Hub 尚未连接，未发送到 ESP32。" : "Selected as the local current card. Device Hub is not connected, so it was not sent to the ESP32."));
      this.refreshSettingsUi();
    } catch (error) {
      new Notice(`${zh ? "发送失败" : "Could not send"}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.echoCardMutationRunning = false;
    }
  }

  private queueInboxSettingsSave(): void {
    if (this.inboxSettingsSaveTimer) window.clearTimeout(this.inboxSettingsSaveTimer);
    this.inboxSettingsSaveTimer = window.setTimeout(() => {
      this.inboxSettingsSaveTimer = 0;
      void this.flushInboxSettingsSave();
    }, 450);
  }

  private async flushInboxSettingsSave(): Promise<void> {
    if (this.inboxSettingsSaveRunning) {
      this.inboxSettingsSaveQueued = true;
      return;
    }
    this.inboxSettingsSaveRunning = true;
    try {
      do {
        this.inboxSettingsSaveQueued = false;
        await this.plugin.savePluginData();
      } while (this.inboxSettingsSaveQueued);
      this.plugin.refreshInboxIndex();
    } catch (error) {
      new Notice(`${this.plugin.settings.language === "zh" ? "Inbox 设置保存失败" : "Could not save Inbox settings"}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.inboxSettingsSaveRunning = false;
    }
  }

  private renderLearningSettings(containerEl: HTMLElement, copy: SettingCopy): void {
    const zh = this.plugin.settings.language !== "en";
    const learning = this.plugin.settings.learning;

    new Setting(containerEl)
      .setName(zh ? "学习工作习惯" : "Learn work habits")
      .setDesc(zh ? "只记录文件切换、有效编辑会话、时间段和显式选择；不记录正文、选区或按键。" : "Records file focus, active edit sessions, time buckets, and explicit choices; never note text, selections, or keystrokes.")
      .addToggle((toggle) => toggle.setValue(learning.enabled).onChange(async (value) => {
        await this.plugin.setLearningEnabled(value);
        this.refreshSettingsUi();
      }));

    new Setting(containerEl)
      .setName(zh ? "本地数据边界" : "Local data boundary")
      .setDesc(zh
        ? "原始行为事件最多保留 30 天；连续 5 分钟无活动即结束会话。"
        : "Raw activity events are kept for at most 30 days; five inactive minutes end a session.");

    new Setting(containerEl)
      .setName(zh ? "启用主动提醒" : "Enable proactive notifications")
      .setDesc(zh ? "只提醒到期事项和已确认习惯；新候选始终静默进入侧栏。" : "Only due items and confirmed habits may notify; new candidates stay silent in the sidebar.")
      .addToggle((toggle) => toggle.setValue(learning.notificationsEnabled).onChange(async (value) => {
        learning.notificationsEnabled = value;
        await this.plugin.savePluginData();
      }));
    new Setting(containerEl)
      .setName(zh ? "安静时段" : "Quiet hours")
      .setDesc("HH:mm")
      .addText((text) => text.setValue(learning.quietHoursStart).setPlaceholder("23:00").onChange(async (value) => {
        learning.quietHoursStart = normalizeTimeInput(value) || "23:00";
        await this.plugin.savePluginData();
      }))
      .addText((text) => text.setValue(learning.quietHoursEnd).setPlaceholder("08:00").onChange(async (value) => {
        learning.quietHoursEnd = normalizeTimeInput(value) || "08:00";
        await this.plugin.savePluginData();
      }));
    new Setting(containerEl)
      .setName(zh ? "每天习惯提醒上限" : "Daily habit notification limit")
      .addText((text) => text.setValue(String(learning.maxHabitNotificationsPerDay)).onChange(async (value) => {
        learning.maxHabitNotificationsPerDay = clampInteger(value, 0, 20, 3);
        await this.plugin.savePluginData();
      }));

    new Setting(containerEl)
      .setName(copy.pushHabitText)
      .setDesc(copy.pushHabitTextDesc)
      .addTextArea((text) => {
        text.setValue(this.plugin.settings.push.habitText).onChange(async (value) => {
          this.plugin.settings.push.habitText = value.trim().slice(0, 4000);
          await this.plugin.savePluginData();
        });
        text.inputEl.rows = 4;
      });

    new Setting(containerEl)
      .setName(zh ? "我的学习数据" : "My learning data")
      .setDesc(zh ? "导出用户可读 JSON，或清空事件、候选和已确认学习规则。" : "Export user-readable JSON or clear events, candidates, and confirmed learned rules.")
      .addButton((button) => button.setButtonText(zh ? "导出" : "Export").onClick(() => {
        void this.plugin.exportLearningData();
      }))
      .addButton((button) => button.setWarning().setButtonText(zh ? "全部清空" : "Clear all").onClick(() => {
        void this.plugin.clearLearningData();
      }));

    new Setting(containerEl).setName(copy.pushHabits).setDesc(copy.pushHabitsDesc).setHeading();
    this.renderPushHabitEditor(containerEl, copy);
  }

  private renderBackendSettings(containerEl: HTMLElement): void {
    const zh = this.plugin.settings.language !== "en";
    const backend = this.plugin.settings.backend;

    new Setting(containerEl)
      .setName(zh ? "连接 Obsidian AI Backend" : "Connect Obsidian AI Backend")
      .setDesc(zh ? "可选增强。关闭或离线时，记录与本地推荐仍可正常工作。" : "Optional enhancement. Capture and local recommendations continue to work while disabled or offline.")
      .addToggle((toggle) => toggle.setValue(backend.enabled).onChange(async (value) => {
        backend.enabled = value;
        await this.plugin.savePluginData();
        this.refreshSettingsUi();
      }));

    new Setting(containerEl)
      .setName("Backend URL")
      .addText((text) => text.setValue(backend.baseUrl).setPlaceholder("http://127.0.0.1:8790").onChange(async (value) => {
        backend.baseUrl = value.trim().replace(/\/+$/u, "");
        await this.plugin.savePluginData();
      }));
    new Setting(containerEl)
      .setName(zh ? "访问 token" : "Access token")
      .setDesc(zh ? "仅保存在插件数据中，通过 X-Capture-Token 发送，不写入 URL 或导出。" : "Stored only in plugin data and sent as X-Capture-Token, never in URLs or exports.")
      .addText((text) => {
        text.setValue(backend.token).onChange(async (value) => {
          backend.token = value.trim();
          await this.plugin.savePluginData();
        });
        text.inputEl.type = "password";
      });
    new Setting(containerEl)
      .setName(zh ? "用于目标重排" : "Use for target reranking")
      .setDesc(zh ? "只发送经过本地过滤的候选；Backend 不能新增任意路径。" : "Only locally filtered candidates are sent; Backend cannot introduce arbitrary paths.")
      .addToggle((toggle) => toggle.setValue(backend.useForRecommendations).onChange(async (value) => {
        backend.useForRecommendations = value;
        await this.plugin.savePluginData();
      }));
    new Setting(containerEl)
      .setName(zh ? "用于习惯候选说明" : "Use for habit suggestion wording")
      .setDesc(zh ? "只发送聚合证据，默认关闭。" : "Sends aggregate evidence only and is off by default.")
      .addToggle((toggle) => toggle.setValue(backend.useForHabitSuggestions).onChange(async (value) => {
        backend.useForHabitSuggestions = value;
        await this.plugin.savePluginData();
      }));
    new Setting(containerEl)
      .setName(zh ? "发送范围预览" : "Data-sharing preview")
      .setDesc(zh
        ? `Provider：${backend.baseUrl || "未配置"}。目标重排最多发送 20 个候选的 id、类型、动作、分数、置信度与理由，以及草稿标题、tags 和粗粒度来源标记；不发送正文、选区、来源路径或候选路径。习惯文案仅发送结构化规则和聚合证据。`
        : `Provider: ${backend.baseUrl || "not configured"}. Target reranking sends at most 20 candidate ids, kinds, actions, scores, confidence levels, and reasons, plus draft title, tags, and coarse source flags. It does not send body text, selections, source paths, or candidate paths. Habit wording receives only structured rules and aggregate evidence.`);
    new Setting(containerEl)
      .setName(zh ? "超时（毫秒）" : "Timeout (ms)")
      .addText((text) => text.setValue(String(backend.timeoutMs)).onChange(async (value) => {
        backend.timeoutMs = clampInteger(value, 500, 10000, 2500);
        await this.plugin.savePluginData();
      }))
      .addButton((button) => button.setButtonText(zh ? "测试连接" : "Test connection").onClick(() => {
        void this.plugin.testBackendConnection();
      }));
  }

  private renderHubSettings(containerEl: HTMLElement): void {
    const zh = this.plugin.settings.language !== "en";
    const hub = this.plugin.settings.hub;
    const tailscaleServe = isPrivateTailscaleServeOrigin(hub.baseUrl);

    const echoCards = this.plugin.getEchoCards();
    const deviceLibrary = this.plugin.getDeviceContentLibrary();
    new Setting(containerEl)
      .setName(zh ? "卡片与屏幕" : "Cards and display")
      .setDesc(zh
        ? `手写 Echo 卡片、套用参考模板，或发送已有 ToThink / ToWrite 卡片。当前有 ${echoCards.length} 张手写卡、${deviceLibrary.eligibleCount} 张可发送划线卡。`
        : `Write Echo cards, start from a reference template, or send an existing ToThink / ToWrite card. There are ${echoCards.length} custom cards and ${deviceLibrary.eligibleCount} eligible selection cards.`)
      .addButton((button) => button
        .setCta()
        .setButtonText(zh ? "新建手写卡片" : "Create custom card")
        .onClick(() => this.openEchoCardWorkbench(true)))
      .addButton((button) => button
        .setButtonText(zh ? "打开卡片库" : "Open card library")
        .onClick(() => this.openEchoCardWorkbench(false)));

    new Setting(containerEl)
      .setName(zh ? "连接 ToWrite Device Hub" : "Connect ToWrite Device Hub")
      .setDesc(zh
        ? "可选公网控制面。插件只上传经过本地隐私过滤的设备显示候选；Hub 离线不会阻塞本地记录和编辑。"
        : "Optional public control plane. Only locally privacy-filtered display candidates are uploaded; an offline Hub never blocks local capture or editing.")
      .addToggle((toggle) => toggle.setValue(hub.enabled).onChange(async (value) => {
        hub.enabled = value;
        await this.plugin.savePluginData();
        this.plugin.configureDeviceHub();
        this.refreshSettingsUi();
      }));

    new Setting(containerEl)
      .setName("Hub URL")
      .setDesc(zh
        ? "填写固定的 canonical HTTP(S) origin，不要带 /t/v1、query 或 fragment；NFC 使用 HTTPS。"
        : "Enter the canonical HTTP(S) origin without /t/v1, a query, or a fragment; NFC uses HTTPS.")
      .addText((text) => text.setValue(hub.baseUrl).setPlaceholder("https://hub.example.com").onChange(async (value) => {
        const nextBaseUrl = value.trim().replace(/\/+$/u, "");
        const nextCanonicalOrigin = normalizeEsp32HubOrigin(nextBaseUrl) ?? "";
        if (this.hubOneTimeDeviceSecretOrigin && nextCanonicalOrigin !== this.hubOneTimeDeviceSecretOrigin) {
          this.hubOneTimeDeviceSecret = "";
          this.hubOneTimeDeviceSecretOrigin = "";
          this.hubDeviceSecretVisible = false;
        }
        hub.baseUrl = nextBaseUrl;
        await this.plugin.savePluginData();
        this.plugin.configureDeviceHub();
        this.refreshSettingsUi();
      }));

    if (tailscaleServe) {
      new Setting(containerEl)
        .setName(zh ? "Tailscale Serve 私有模式" : "Private Tailscale Serve mode")
        .setDesc(zh
          ? "这个地址只对同一 tailnet 开放。手机碰标签前必须安装、登录并开启 Tailscale；登录名必须与当前 Tailscale LoginName 一致，GitHub 身份形如 username@github。普通 ESP32 未加入 tailnet 时暂时不能直接访问。"
          : "This address is reachable only inside the same tailnet. Before tapping, the phone must have Tailscale installed, signed in, and connected; the value must match the active Tailscale LoginName, such as username@github for GitHub identities. A normal ESP32 cannot connect unless it joins the tailnet or uses a controlled gateway.");
    }

    const login = new Setting(containerEl)
      .setName(zh ? "账号登录与一键配对" : "Account sign-in and one-click pairing")
      .setDesc(this.hubAccountAccessToken
        ? (zh
          ? "本次设置会话已登录。账号令牌只保存在内存中，不写入插件设置。"
          : "Signed in for this settings session. The account token stays in memory and is never persisted.")
        : this.hubLoginChallengeId
          ? (zh ? "验证码已发送；验证后即可自动创建 Receiver、设备绑定与 NFC 地址。" : "Code sent. Verify it to provision the Receiver, device binding, and NFC address.")
          : tailscaleServe
            ? (zh ? "填写当前 Tailscale LoginName（GitHub 登录形如 username@github）；长期凭据不会进入 URL。" : "Enter the active Tailscale LoginName (GitHub identities look like username@github); long-lived credentials never enter a URL.")
            : (zh ? "使用邮箱验证码登录 Hub；长期凭据不会进入 URL。" : "Sign in with an email code; long-lived credentials never enter a URL."));
    login.addText((text) => text
      .setPlaceholder(tailscaleServe ? "username@github" : "you@example.com")
      .setValue(this.hubLoginEmail)
      .onChange((value) => {
        this.hubLoginEmail = value.trim();
      }));
    login.addButton((button) => button
      .setButtonText(zh ? "发送验证码" : "Send code")
      .onClick(() => {
        void this.plugin.startHubEmailAuth(this.hubLoginEmail).then((challenge) => {
          this.hubLoginChallengeId = challenge.challengeId;
          if (challenge.developmentCode) {
            this.hubLoginCode = challenge.developmentCode;
          }
          new Notice(zh ? "Device Hub 验证码已发送。" : "Device Hub verification code sent.");
          this.refreshSettingsUi();
        }).catch((error: unknown) => {
          new Notice(`${zh ? "发送失败" : "Could not send code"}: ${error instanceof Error ? error.message : String(error)}`);
        });
      }));

    if (this.hubLoginChallengeId && !this.hubAccountAccessToken) {
      new Setting(containerEl)
        .setName(zh ? "登录验证码" : "Sign-in verification code")
        .addText((text) => text
          .setPlaceholder("123456")
          .setValue(this.hubLoginCode)
          .onChange((value) => {
            this.hubLoginCode = value.trim();
          }))
        .addButton((button) => button
          .setCta()
          .setButtonText(zh ? "验证登录" : "Verify")
          .onClick(() => {
            void this.plugin.verifyHubEmailAuth(
              this.hubLoginEmail,
              this.hubLoginChallengeId,
              this.hubLoginCode
            ).then((token) => {
              this.hubAccountAccessToken = token;
              this.hubLoginCode = "";
              new Notice(zh ? "Device Hub 登录成功；令牌仅保存在本次设置会话。" : "Signed in; the token is memory-only for this settings session.");
              this.refreshSettingsUi();
            }).catch((error: unknown) => {
              new Notice(`${zh ? "验证失败" : "Verification failed"}: ${error instanceof Error ? error.message : String(error)}`);
            });
          }));
    }

    if (this.hubAccountAccessToken) {
      const provisioning = new Setting(containerEl)
        .setName(zh ? "个人设备闭环" : "Personal device setup")
        .setDesc(hub.receiverId && hub.deviceId
          ? (zh ? "Receiver 与墨水屏设备已配置。可轮换设备密钥或 NFC 地址。" : "Receiver and e-ink device are configured. You can rotate the device secret or NFC address.")
          : (zh ? "自动创建 Receiver、墨水屏设备、配对绑定和静态 Tap 地址。" : "Creates the Receiver, e-ink device, binding, and static tap address."));
      if (!hub.receiverId || !hub.deviceId) {
        provisioning.addButton((button) => button
          .setCta()
          .setButtonText(zh ? "一键创建并配对" : "Provision and pair")
          .onClick(() => {
            void (async () => {
              if (!this.plugin.getHubReceiverKeyStatus().configured) {
                await this.plugin.generateHubReceiverKeyPair();
              }
              const result = await this.plugin.provisionPersonalDeviceHub(this.hubAccountAccessToken);
              this.hubOneTimeDeviceSecret = result.deviceSecret;
              this.hubOneTimeDeviceSecretOrigin = normalizeEsp32HubOrigin(hub.baseUrl) ?? "";
              this.hubDeviceSecretVisible = false;
              new Notice(zh
                ? "配对成功。ESP32 密钥显示在下方；写 NFC 时只复制“完整 Tap URL”。"
                : "Paired. The ESP32 secret is shown below; write only the complete Tap URL to NFC.");
              this.refreshSettingsUi();
            })().catch((error: unknown) => {
              new Notice(`${zh ? "创建失败" : "Provisioning failed"}: ${error instanceof Error ? error.message : String(error)}`);
            });
          }));
      } else {
        provisioning
          .addButton((button) => button
            .setButtonText(zh ? "轮换设备密钥" : "Rotate device secret")
            .onClick(() => {
              void this.plugin.rotateHubDeviceSecret(this.hubAccountAccessToken).then(async (result) => {
                this.hubOneTimeDeviceSecret = result.deviceSecret;
                this.hubOneTimeDeviceSecretOrigin = normalizeEsp32HubOrigin(hub.baseUrl) ?? "";
                this.hubDeviceSecretVisible = false;
                await copyToClipboard(result.deviceSecret, zh ? "新设备密钥已复制" : "New device secret copied");
                this.refreshSettingsUi();
              }).catch((error: unknown) => {
                new Notice(`${zh ? "轮换失败" : "Rotation failed"}: ${error instanceof Error ? error.message : String(error)}`);
              });
            }))
          .addButton((button) => button
            .setButtonText(zh ? "轮换 NFC 地址" : "Rotate NFC address")
            .onClick(() => {
              void this.plugin.rotateHubTapId(this.hubAccountAccessToken).then(() => {
                new Notice(zh ? "NFC 地址已轮换；旧标签立即失效。" : "NFC address rotated; the old tag is now invalid.");
                this.refreshSettingsUi();
              }).catch((error: unknown) => {
                new Notice(`${zh ? "轮换失败" : "Rotation failed"}: ${error instanceof Error ? error.message : String(error)}`);
              });
            }));
      }
    }

    if (this.hubOneTimeDeviceSecret) {
      new Setting(containerEl)
        .setName(zh ? "一次性 ESP32 设备密钥" : "One-time ESP32 device secret")
        .setDesc(zh ? "只在本次设置会话显示。把它写入设备安全存储；不要写入 NFC 标签。" : "Visible only in this settings session. Put it in device secure storage, never on the NFC tag.")
        .addText((text) => {
          text.setValue(this.hubOneTimeDeviceSecret);
          text.inputEl.readOnly = true;
          text.inputEl.type = this.hubDeviceSecretVisible ? "text" : "password";
        })
        .addButton((button) => button
          .setButtonText(this.hubDeviceSecretVisible ? (zh ? "隐藏" : "Hide") : (zh ? "预览" : "Reveal"))
          .onClick(() => {
            this.hubDeviceSecretVisible = !this.hubDeviceSecretVisible;
            this.refreshSettingsUi();
          }))
        .addButton((button) => button
          .setButtonText(zh ? "复制给 ESP32 / 模拟器" : "Copy for ESP32 / simulator")
          .onClick(() => {
            void copyToClipboard(this.hubOneTimeDeviceSecret, zh ? "设备密钥已复制" : "Device secret copied");
          }))
        .addButton((button) => button
          .setButtonText(zh ? "清除显示" : "Clear")
          .onClick(() => {
            this.hubOneTimeDeviceSecret = "";
            this.hubOneTimeDeviceSecretOrigin = "";
            this.hubDeviceSecretVisible = false;
            this.refreshSettingsUi();
          }));
    }

    new Setting(containerEl)
      .setName("Receiver ID")
      .setDesc(zh ? "Obsidian Connector 在 cloud-relay 注册得到的 recv_… 标识。" : "The recv_… identifier registered by the Obsidian Connector.")
      .addText((text) => text.setValue(hub.receiverId).setPlaceholder("recv_…").onChange(async (value) => {
        hub.receiverId = value.trim();
        await this.plugin.savePluginData();
      }));

    new Setting(containerEl)
      .setName(zh ? "Connector 访问 token" : "Connector access token")
      .setDesc(zh ? "仅通过 Authorization: Bearer 请求头发送，不进入 URL、候选或日志。" : "Sent only in the Authorization: Bearer header, never in URLs, candidates, or logs.")
      .addText((text) => {
        text.setValue(hub.receiverToken).onChange(async (value) => {
          hub.receiverToken = value.trim();
          await this.plugin.savePluginData();
        });
        text.inputEl.type = "password";
      });

    const receiverKey = this.plugin.getHubReceiverKeyStatus();
    const receiverKeySetting = new Setting(containerEl)
      .setName(zh ? "PWA 回写 E2EE 接收密钥" : "PWA writeback E2EE receiver key")
      .setDesc(receiverKey.configured
        ? (zh
          ? "已配置 P-256 接收密钥。私钥只保存在本地插件数据中，不显示、不复制、不上传。轮换前请先处理已排队的回答。"
          : "A P-256 receiver key is configured. The private key stays in local plugin data and is never displayed, copied, or uploaded. Drain queued answers before rotating it.")
        : (zh
          ? "生成本地 P-256 密钥对，并将公钥 JWK 复制到 Receiver 注册。私钥不会出现在 UI 中。"
          : "Generate a local P-256 key pair, then copy the public JWK into Receiver registration. The private JWK is never rendered in the UI."));
    receiverKeySetting.addButton((button) => button
      .setButtonText(receiverKey.configured ? (zh ? "轮换密钥" : "Rotate key") : (zh ? "生成密钥" : "Generate key"))
      .onClick(() => {
        void this.plugin.generateHubReceiverKeyPair().then(async (publicKey) => {
          await copyToClipboard(publicKey, zh ? "已生成并复制公钥 JWK" : "Receiver public JWK generated and copied");
          this.refreshSettingsUi();
        }).catch((error: unknown) => {
          new Notice(`${zh ? "密钥生成失败" : "Key generation failed"}: ${error instanceof Error ? error.message : String(error)}`);
        });
      }));
    if (receiverKey.publicKeyJwk) {
      receiverKeySetting.addButton((button) => button
        .setButtonText(zh ? "复制公钥" : "Copy public JWK")
        .onClick(() => {
          void copyToClipboard(receiverKey.publicKeyJwk, zh ? "已复制公钥 JWK" : "Receiver public JWK copied");
        }));
    }

    new Setting(containerEl)
      .setName(zh ? "墨水屏设备 ID" : "E-ink device ID")
      .setDesc(zh ? "使用 dev_… 长随机 ID。设备 secret 只配置在 ESP32/模拟器，不填入插件或 NFC。" : "Use the long random dev_… ID. The device secret belongs only on the ESP32/simulator, never in the plugin or NFC tag.")
      .addText((text) => text.setValue(hub.deviceId).setPlaceholder("dev_…").onChange(async (value) => {
        hub.deviceId = value.trim();
        await this.plugin.savePluginData();
      }));

    this.renderEsp32ProvisioningGuide(containerEl, zh, tailscaleServe);

    new Setting(containerEl)
      .setName(zh ? "同步间隔（秒）" : "Sync interval (seconds)")
      .setDesc(zh ? "Vault 变更会 debounce；这个间隔只用于后台校验，不会在按键链发请求。" : "Vault changes are debounced; this interval is only a background safety sync and never runs in the keystroke path.")
      .addText((text) => text.setValue(String(hub.syncIntervalSeconds)).onChange(async (value) => {
        hub.syncIntervalSeconds = clampInteger(value, 15, 86400, 60);
        await this.plugin.savePluginData();
        this.plugin.configureDeviceHub();
      }));

    new Setting(containerEl)
      .setName(zh ? "发送获准显示的正文片段" : "Share approved display snippets")
      .setDesc(zh ? "默认关闭。关闭时只发送标题、类型、动作、分数与可读理由；路径和完整正文始终不发送。" : "Off by default. When off, only title, kind, actions, score, and reason are sent; paths and full note text are never sent.")
      .addToggle((toggle) => toggle.setValue(hub.shareDisplayBody).onChange(async (value) => {
        hub.shareDisplayBody = value;
        await this.plugin.savePluginData();
      }));

    new Setting(containerEl)
      .setName(zh ? "手动推送时振动" : "Vibrate for manual push")
      .setDesc(zh ? "默认开启。勿扰或静默时段仍会显示卡片，但 Hub 会把本次提醒降级为静默。" : "On by default. During DND or quiet hours the card is still shown, but the Hub downgrades the notification to silent.")
      .addToggle((toggle) => toggle.setValue(hub.manualSelectionVibration).onChange(async (value) => {
        hub.manualSelectionVibration = value;
        await this.plugin.savePluginData();
      }));

    new Setting(containerEl)
      .setName(zh ? "手工显示保持（分钟）" : "Manual display hold (minutes)")
      .setDesc(zh ? "从墨水屏成功 ACK 起算；等待 ACK 时 Agent、循环和时间表都不会覆盖。0 表示不额外保持。" : "Starts at the successful display ACK; Agent, rotation, and schedules cannot overwrite a pending display. Use 0 for no extra hold.")
      .addText((text) => text.setValue(String(hub.manualHoldMinutes)).onChange(async (value) => {
        hub.manualHoldMinutes = clampInteger(value, 0, 10080, 30);
        await this.plugin.savePluginData();
      }));

    if (hub.selectionMode === "rotation" || hub.selectionMode === "schedule") {
      new Setting(containerEl)
        .setName(zh ? "V1 调度运行位置" : "V1 scheduler location")
        .setDesc(zh
          ? "当前循环/定时由 Obsidian Connector 执行：Obsidian 关闭时暂停，但屏幕保持最后一次内容。要实现全天候调度，下一步需把节目单与 ACK 游标同步到 Hub worker。"
          : "Rotation/scheduling currently runs in the Obsidian connector: it pauses while Obsidian is closed and leaves the last card displayed. Always-on scheduling requires syncing the program and ACK cursor to a Hub worker in the next server revision.");
    }

    new Setting(containerEl)
      .setName(zh ? "当前语义地点 / 状态" : "Current semantic place / mode")
      .setDesc(zh ? "V1 由用户确认，不采集 GPS、SSID 或精确位置。勿扰状态填写 do_not_disturb。" : "V1 is user-confirmed and does not collect GPS, SSID, or precise location. Use do_not_disturb for DND.")
      .addText((text) => text.setValue(hub.manualPlace).setPlaceholder(zh ? "书桌 / 森林公园" : "desk / forest park").onChange(async (value) => {
        hub.manualPlace = value.trim().slice(0, 120);
        await this.plugin.savePluginData();
        this.plugin.queueDeviceHubContext();
      }))
      .addText((text) => text.setValue(hub.manualMode).setPlaceholder("desk_focus / walking / do_not_disturb").onChange(async (value) => {
        hub.manualMode = value.trim().slice(0, 120);
        await this.plugin.savePluginData();
        this.plugin.queueDeviceHubContext();
      }));

    const controls = new Setting(containerEl)
      .setName(zh ? "连接与同步" : "Connection and sync")
      .setDesc(hub.lastError
        ? `${zh ? "最近错误" : "Last error"}: ${hub.lastError}`
        : `${zh ? "最近同步" : "Last sync"}: ${hub.lastSyncedAt || "—"}`);
    controls
      .addButton((button) => button.setButtonText(zh ? "测试连接" : "Test").onClick(() => void this.plugin.testHubConnection()))
      .addButton((button) => button.setCta().setButtonText(zh ? "立即同步" : "Sync now").onClick(() => void this.plugin.syncDeviceHub(true)))
      .addButton((button) => button.setButtonText(zh ? "刷新状态" : "Refresh state").onClick(() => void this.plugin.refreshDeviceHubState()));

    const currentHubState = this.plugin.getDeviceHubState();
    const selectedLabel = currentHubState?.selected?.card?.title || hub.lastSelectedContentId || "—";
    const displayedLabel = currentHubState?.displayed?.card?.title || hub.lastDisplayedContentId || "—";
    new Setting(containerEl)
      .setName(zh ? "设备期望 / 实际显示" : "Desired / displayed")
      .setDesc(`state v${hub.lastStateVersion} · selected ${selectedLabel} · displayed ${displayedLabel}`);

    const ndef = this.plugin.getHubNdefStatus();
    const nfc = new Setting(containerEl)
      .setName(zh ? "NFC Tools 写入内容（完整 Tap URL）" : "NFC Tools payload (complete Tap URL)")
      .setDesc(hub.tapUrl
        ? `${ndef.bytes}/144 bytes · ${ndef.fits ? (zh ? "可写入 NTAG213；复制整段 URL，不要只复制 tap_…" : "fits NTAG213; copy the entire URL, not only tap_…") : (zh ? "超出 NTAG213 容量" : "too large for NTAG213")}${tailscaleServe ? (zh ? " · 手机需连接同一 tailnet" : " · phone must be on the same tailnet") : ""}`
        : (zh
          ? "完成邮箱登录和“一键创建并配对”后由 Hub 安全生成。不要自行编写 tap_…；未注册的随机串会返回 404。"
          : "Generated securely by the Hub after email sign-in and Provision and pair. Do not invent tap_… values; an unregistered value returns 404."));
    nfc.addText((text) => {
      text.setValue(hub.tapUrl).setPlaceholder("https://hub.example.com/t/v1/tap_…");
      text.inputEl.readOnly = true;
    });
    if (hub.tapUrl) {
      nfc
        .addButton((button) => button.setCta().setButtonText(zh ? "复制完整 URL" : "Copy complete URL").setDisabled(!ndef.fits).onClick(() => {
          void copyToClipboard(hub.tapUrl, zh ? "已复制完整 Tap URL，可粘贴到 NFC Tools 的 URL/URI Record" : "Complete Tap URL copied for the NFC Tools URL/URI record");
        }))
        .addButton((button) => button.setButtonText(zh ? "模拟碰一碰" : "Simulate tap").onClick(() => this.plugin.openDeviceHubTap()));
    }

    new Setting(containerEl)
      .setName(zh ? "发送范围预览" : "Data-sharing preview")
      .setDesc(zh
        ? "每批最多 20 个 opaque 候选；发送类型、显示标题、可选获准片段、动作、分数、理由和粗粒度工作流信息。临时选区绝不上传；由划线明确保存的卡片只有在开启正文片段开关后才会发送截断内容。Vault 路径、完整正文、剪贴板、精确位置和长期 token 始终不发送。"
        : "At most 20 opaque candidates per batch: kind, display title, optional approved snippet, actions, score, reason, and coarse workflow metadata. Ephemeral selections are never uploaded; a card explicitly saved from a selection shares truncated content only when display snippets are enabled. Vault paths, full text, clipboard data, precise location, and long-lived tokens are never sent.");

    this.renderLocalCaptureBridgeSettings(containerEl, zh);
  }

  private renderEsp32ProvisioningGuide(containerEl: HTMLElement, zh: boolean, tailscaleServe: boolean): void {
    const hub = this.plugin.settings.hub;
    const origin = normalizeEsp32HubOrigin(hub.baseUrl) ?? "";
    const originIsDeviceReachable = Boolean(origin);
    const deviceId = hub.deviceId.trim();
    const deviceIdValid = isHubDeviceId(deviceId);
    const endpoints = buildEsp32DeviceEndpoints(origin, deviceId);
    const placeholderRoot = "https://hub.example.com/v1/hub/devices/{device_id}";
    const secretMatchesOrigin = Boolean(
      this.hubOneTimeDeviceSecret
      && origin
      && this.hubOneTimeDeviceSecretOrigin === origin
    );
    const previewConfig = {
      protocol: "towrite-device-hub/v1",
      hub_origin: origin || (zh ? "<ESP32 可访问的 HTTPS Hub 地址>" : "<HTTPS Hub origin reachable by ESP32>"),
      device_id: deviceIdValid ? deviceId : (zh ? "<一键配对后生成的 dev_…>" : "<dev_… generated during provisioning>"),
      device_secret: secretMatchesOrigin
        ? (zh ? "<已生成；点击下方按钮安全复制>" : "<ready; use the secure copy button below>")
        : (zh ? "<配对或轮换时只显示一次>" : "<shown once after provisioning or rotation>"),
      desired_url: endpoints?.desiredUrl ?? `${placeholderRoot}/desired?after={state_version}&wait=25`,
      display_ack_url: endpoints?.displayAckUrl ?? `${placeholderRoot}/display-acks`,
      event_url: endpoints?.eventUrl ?? `${placeholderRoot}/events`,
      authorization: "Device <device_secret>"
    };

    const details = containerEl.createEl("details", { cls: "towrite-esp32-guide" });
    details.open = true;
    const summary = details.createEl("summary");
    summary.createSpan({ text: zh ? "ESP32 接入清单" : "ESP32 provisioning checklist" });
    summary.createEl("small", {
      text: deviceIdValid
        ? (zh ? `已绑定 ${deviceId}` : `Bound to ${deviceId}`)
        : (zh ? "尚未完成设备配对" : "Device not provisioned")
    });

    const body = details.createDiv({ cls: "towrite-esp32-guide-body" });
    body.createEl("p", {
      cls: tailscaleServe ? "towrite-esp32-network-warning" : "",
      text: tailscaleServe
        ? (zh
          ? "当前 Hub URL 是 Tailscale Serve 私有地址：手机和电脑可访问，但普通 ESP32 不能直接加入 tailnet。真机需要一个 ESP32 可访问且受保护的 HTTPS 入口，或由同一局域网内的 Tailscale 网关代转。"
          : "The Hub URL is a private Tailscale Serve origin. Phones and computers can reach it, but a normal ESP32 cannot join the tailnet directly. Hardware needs a protected HTTPS origin it can reach, or a gateway on the same LAN.")
        : (zh
          ? "ESP32 必须能直接访问上面的 Hub HTTPS 地址；Wi-Fi 名称和密码只保存在 ESP32，不填写到 ToWrite。"
          : "The ESP32 must be able to reach the Hub HTTPS origin. Wi-Fi credentials stay on the ESP32 and are never entered into ToWrite.")
    });

    const checklist = body.createEl("ol");
    checklist.createEl("li", {
      text: hub.enabled
        ? (zh ? "Device Hub 已启用。" : "Device Hub is enabled.")
        : (zh ? "先开启“连接 ToWrite Device Hub”。" : "Enable Connect ToWrite Device Hub.")
    });
    checklist.createEl("li", {
      text: originIsDeviceReachable
        ? (zh ? `Hub 地址：${origin}` : `Hub origin: ${origin}`)
        : origin
          ? (zh ? `当前 ${origin} 仅适合本机开发；请改为 ESP32 可访问的非 loopback HTTPS 地址。` : `${origin} is suitable only for local development. Use a non-loopback HTTPS origin reachable by the ESP32.`)
          : (zh ? "填写 ESP32 可访问的非 loopback HTTPS Hub URL。" : "Enter a non-loopback HTTPS Hub URL reachable by the ESP32.")
    });
    checklist.createEl("li", {
      text: deviceIdValid
        ? (zh ? `设备 ID：${deviceId}` : `Device ID: ${deviceId}`)
        : (zh ? "登录 Hub 后点击“一键创建并配对”；不要自己编造 device_id。" : "Sign in, then use Provision and pair. Do not invent a device ID.")
    });
    checklist.createEl("li", {
      text: secretMatchesOrigin
        ? (zh ? "一次性 device_secret 已就绪；复制到 ESP32 安全存储。" : "The one-time device secret is ready; copy it into ESP32 secure storage.")
        : deviceIdValid
          ? (zh ? "device_secret 不会长期保存在插件里；若上次没有保存，请先登录并“轮换设备密钥”。" : "The device secret is not persisted by the plugin. Sign in and rotate it if you did not save the previous value.")
          : (zh ? "配对完成后会显示一次 device_secret。" : "Provisioning reveals the device secret once.")
    });
    checklist.createEl("li", {
      text: zh
        ? "固件用 Authorization: Device <device_secret> 长轮询 desired；渲染成功后提交 display ACK。"
        : "Firmware long-polls desired with Authorization: Device <device_secret>, then submits a display ACK after rendering."
    });
    body.createEl("p", {
      text: zh
        ? "当前版本交付 Device Hub 协议与模拟器，不包含与你具体墨水屏型号绑定的 ESP32 刷屏驱动；现有 examples/esp32s3-eink 仍是旧 External API 示例，不能直接当作 Device Hub 固件。"
        : "This version delivers the Device Hub protocol and simulator, not a display driver for a particular e-ink panel. The existing examples/esp32s3-eink sketch still targets the legacy External API and is not Device Hub firmware."
    });

    const preview = body.createEl("pre", { cls: "towrite-esp32-config-preview" });
    preview.createEl("code", { text: JSON.stringify(previewConfig, null, 2) });

    const actions = body.createDiv({ cls: "towrite-esp32-guide-actions" });
    const endpointsReady = Boolean(endpoints);
    const completeConfigReady = Boolean(endpointsReady && !tailscaleServe && secretMatchesOrigin);
    const endpointButton = actions.createEl("button", {
      text: zh ? "复制端点模板" : "Copy endpoint template",
      attr: { type: "button" }
    });
    endpointButton.disabled = !endpointsReady;
    endpointButton.addEventListener("click", () => {
      void copyToClipboard(JSON.stringify(previewConfig, null, 2), zh ? "ESP32 端点模板已复制" : "ESP32 endpoint template copied");
    });
    const completeButton = actions.createEl("button", {
      cls: "mod-cta",
      text: zh ? "复制完整 ESP32 配置" : "Copy complete ESP32 config",
      attr: {
        type: "button",
        title: completeConfigReady
          ? ""
          : tailscaleServe
            ? (zh ? "普通 ESP32 无法直接访问私有 Tailscale Serve；请先配置受保护的 HTTPS 网关" : "A normal ESP32 cannot reach private Tailscale Serve; configure a protected HTTPS gateway first")
            : (zh ? "需先完成配对，并保留本次显示的一次性设备密钥" : "Provision first and keep the one-time device secret visible")
      }
    });
    completeButton.disabled = !completeConfigReady;
    completeButton.addEventListener("click", () => {
      const completeConfig = {
        ...previewConfig,
        device_secret: this.hubOneTimeDeviceSecret
      };
      void copyToClipboard(JSON.stringify(completeConfig, null, 2), zh ? "完整 ESP32 配置已复制；请妥善保管设备密钥" : "Complete ESP32 config copied; protect the device secret");
    });
  }

  private renderLocalCaptureBridgeSettings(containerEl: HTMLElement, zh: boolean): void {
    const bridge = this.plugin.settings.captureBridge;
    new Setting(containerEl)
      .setName(zh ? "NFC 与 Capture 本地联动" : "Local NFC and Capture integration")
      .setDesc(zh
        ? "碰一碰后直接打开 Capture 记录页；实际目标、冲突检查和撤销仍由 ToWrite 本地 CaptureService 控制。"
        : "A tap opens Capture directly while ToWrite remains responsible for the frozen target, conflict checks, and undo.")
      .setHeading();

    new Setting(containerEl)
      .setName(zh ? "碰一碰记录方式" : "Tap capture flow")
      .setDesc(zh
        ? "本机 Capture 适合同一 tailnet 内的个人设备；Device Hub E2EE 保留为公网或离线队列方案。"
        : "Local Capture is for personal devices in the same tailnet; Device Hub E2EE remains available for public/offline queues.")
      .addDropdown((dropdown) => dropdown
        .addOption("local_capture", zh ? "本机 Capture" : "Local Capture")
        .addOption("hub_e2ee", "Device Hub E2EE")
        .setValue(bridge.flow)
        .onChange(async (value) => {
          bridge.flow = value === "hub_e2ee" ? "hub_e2ee" : "local_capture";
          await this.plugin.savePluginData();
          await this.plugin.configureCaptureBridge(false);
          this.refreshSettingsUi();
        }));

    if (bridge.flow !== "local_capture") {
      new Setting(containerEl)
        .setName(zh ? "当前使用 Device Hub 登录与加密队列" : "Device Hub sign-in and encrypted queue are active")
        .setDesc(zh
          ? "下方继续配置 Receiver、设备和 Hub Tap URL；本地 Bridge 不会监听端口。"
          : "Continue below with Receiver, device, and Hub Tap URL settings; the local Bridge will not listen.");
      return;
    }

    new Setting(containerEl)
      .setName(zh ? "启用本地 Capture Bridge" : "Enable local Capture Bridge")
      .setDesc(zh
        ? "仅监听 127.0.0.1，使用独立随机 Bearer token；不会复用 External API token。"
        : "Listens only on 127.0.0.1 with an independent random Bearer token; it never reuses the External API credential.")
      .addToggle((toggle) => toggle.setValue(bridge.enabled).onChange(async (value) => {
        bridge.enabled = value;
        await this.plugin.savePluginData();
        await this.plugin.configureCaptureBridge(true);
        this.refreshSettingsUi();
      }));

    const captureOriginDescription = zh
      ? "填写 Tailscale Serve 暴露的 canonical HTTPS origin，例如 https://computer.tailnet.ts.net:8790；不要带路径、query 或 token。"
      : "Canonical HTTPS origin exposed by Tailscale Serve, such as https://computer.tailnet.ts.net:8790; do not include a path, query, or token.";
    const captureOriginError = zh
      ? "地址必须是 https://*.ts.net:8790。旧 Device Hub 的 :10000 不能用作 Capture 地址。"
      : "The address must be https://*.ts.net:8790. The old Device Hub :10000 origin is not a Capture origin.";
    const captureOriginSetting = new Setting(containerEl)
      .setName(zh ? "Capture HTTPS 地址" : "Capture HTTPS origin")
      .setDesc(captureOriginDescription)
      .addText((text) => text
        .setPlaceholder("https://computer.tailnet.ts.net:8790")
        .setValue(bridge.captureBaseUrl)
        .onChange(async (value) => {
          const raw = value.trim().replace(/\/+$/u, "");
          const normalized = normalizeCaptureBridgeBaseUrl(raw);
          const invalid = Boolean(raw && !normalized);
          text.inputEl.setAttribute("aria-invalid", invalid ? "true" : "false");
          text.inputEl.classList.toggle("towrite-invalid-input", invalid);
          captureOriginSetting.setDesc(invalid
            ? `${captureOriginDescription} ${captureOriginError}`
            : captureOriginDescription);
          // Never replace a previously valid persisted origin with a value
          // that the loader would later discard silently.
          if (invalid) return;
          bridge.captureBaseUrl = normalized;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName(zh ? "Tailscale 可信身份" : "Trusted Tailscale identity")
      .setDesc(zh
        ? "必须与手机当前 Tailscale-User-Login 完全一致，例如 GitMorRic@github。"
        : "Must exactly match the phone's Tailscale-User-Login, for example GitMorRic@github.")
      .addText((text) => text
        .setPlaceholder("username@github")
        .setValue(bridge.ownerLogin)
        .onChange(async (value) => {
          bridge.ownerLogin = value.trim().slice(0, 200);
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName(zh ? "Bridge 回调端口" : "Bridge callback port")
      .setDesc(`127.0.0.1:${bridge.port} · ${zh ? "固定端口，与 External API 48321 独立" : "fixed and independent from External API 48321"}`);

    const status = this.plugin.getCaptureBridgeStatus();
    const statusText = status.registered
      ? (zh ? "已连接：ToWrite Bridge、Capture 插件和 Backend 已完成 V1 注册。" : "Connected: ToWrite Bridge, Capture plugin, and Backend completed V1 registration.")
      : status.error || (zh ? "尚未检测或连接兼容的 Capture 插件。" : "A compatible Capture plugin has not been detected or linked.");
    new Setting(containerEl)
      .setName(zh ? "联动状态" : "Integration status")
      .setDesc(`${status.running ? (zh ? "监听中" : "listening") : (zh ? "未监听" : "stopped")} · ${statusText}`)
      .addButton((button) => button.setButtonText(zh ? "检测 Capture" : "Detect Capture").onClick(() => {
        void this.plugin.detectCapturePluginBridge(true).then(() => this.refreshSettingsUi());
      }))
      .addButton((button) => button.setCta().setButtonText(zh ? "连接 / 重新连接" : "Link / relink").onClick(() => {
        void this.plugin.configureCaptureBridge(true).then(() => this.refreshSettingsUi());
      }));

    const tapUrl = this.plugin.getLocalCaptureTapUrl();
    const ndef = this.plugin.getLocalCaptureNdefStatus();
    const nfc = new Setting(containerEl)
      .setName(zh ? "NFC Tools 写入内容" : "NFC Tools payload")
      .setDesc(tapUrl
        ? `${ndef.bytes}/144 bytes · ${ndef.fits ? (zh ? "可写入 NTAG213" : "fits NTAG213") : (ndef.error || (zh ? "超出容量" : "too large"))}`
        : (ndef.error || (zh ? "先检测 Capture 或填写 HTTPS 地址与可信身份。" : "Detect Capture or configure its HTTPS origin and trusted identity first.")));
    nfc.addText((text) => {
      text.setValue(tapUrl).setPlaceholder("https://computer.tailnet.ts.net:8790/capture/t/v1/tap_…");
      text.inputEl.readOnly = true;
    });
    nfc
      .addButton((button) => button.setButtonText(zh ? "复制完整 URL" : "Copy complete URL").setDisabled(!tapUrl || !ndef.fits).onClick(() => {
        void copyToClipboard(tapUrl, zh ? "已复制 NFC Tools 的完整 URL" : "Complete NFC Tools URL copied");
      }))
      .addButton((button) => button.setButtonText(zh ? "轮换地址" : "Rotate address").onClick(() => {
        void this.plugin.rotateLocalCaptureTapId().then(() => {
          new Notice(zh ? "本地 NFC 地址已轮换；旧标签立即失效。" : "Local NFC address rotated; the old tag is now invalid.");
          this.refreshSettingsUi();
        });
      }))
      .addButton((button) => button.setButtonText(zh ? "模拟碰一碰" : "Simulate tap").setDisabled(!tapUrl || !status.registered).onClick(() => {
        void this.plugin.openLocalCaptureTap().catch((error: unknown) => {
          new Notice(`${zh ? "无法打开 Capture" : "Could not open Capture"}: ${error instanceof Error ? error.message : String(error)}`);
        });
      }));

    new Setting(containerEl)
      .setName(zh ? "NFC Tools 操作" : "NFC Tools steps")
      .setDesc("Write → Add a record → URL/URI → paste complete URL → Write → Read");
  }

  private renderApiDeviceSettings(containerEl: HTMLElement, copy: SettingCopy): void {
    new Setting(containerEl)
      .setName(copy.externalApi)
      .setDesc(copy.externalApiDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.externalApi.enabled)
          .onChange(async (value) => {
            this.plugin.settings.externalApi.enabled = value;
            await this.plugin.savePluginData();
            await this.plugin.configureExternalApiServer();
            this.refreshSettingsUi();
          });
      });

    if (this.plugin.settings.externalApi.enabled) {
      const endpoint = buildExternalApiExampleUrl(this.plugin.settings);
      const dashboard = buildExternalApiDashboardUrl(this.plugin.settings);
      const device = buildExternalApiDeviceUrl(this.plugin.settings);

      new Setting(containerEl)
        .setName(copy.externalApiPublicBaseUrl)
        .setDesc(copy.externalApiPublicBaseUrlDesc)
        .addText((text) => {
          let draftValue = this.plugin.settings.externalApi.publicBaseUrl;
          const commit = async () => {
            const rawValue = draftValue.trim();
            const nextValue = normalizeExternalApiPublicBaseUrl(rawValue);
            if (rawValue && !nextValue) {
              new Notice("请输入完整的 http:// 或 https:// 访问地址。");
            }
            this.plugin.settings.externalApi.publicBaseUrl = nextValue;
            text.setValue(nextValue);
            await this.plugin.savePluginData();
            this.refreshSettingsUi();
          };

          text
            .setValue(this.plugin.settings.externalApi.publicBaseUrl)
            .setPlaceholder("http://100.x.y.z:48321")
            .onChange((value) => {
              draftValue = value;
            });
          text.inputEl.addEventListener("blur", () => {
            void commit();
          });
          text.inputEl.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              text.inputEl.blur();
            }
          });
        });

      new Setting(containerEl)
        .setName(copy.externalApiDashboard)
        .setDesc(copy.externalApiDashboardDesc)
        .addText((text) => {
          text.setValue(dashboard);
          text.inputEl.readOnly = true;
          text.inputEl.addClass("towrite-readonly-input");
        })
        .addButton((button) => {
          button
            .setIcon("copy")
            .setTooltip(copy.copy)
            .onClick(() => {
              void copyToClipboard(dashboard, copy.copied);
            });
        });

      new Setting(containerEl)
        .setName(copy.externalApiDevice)
        .setDesc(copy.externalApiDeviceDesc)
        .addText((text) => {
          text.setValue(device);
          text.inputEl.readOnly = true;
          text.inputEl.addClass("towrite-readonly-input");
        })
        .addButton((button) => {
          button
            .setIcon("copy")
            .setTooltip(copy.copy)
            .onClick(() => {
              void copyToClipboard(device, copy.copied);
            });
        });

      new Setting(containerEl)
        .setName(copy.externalApiEndpoint)
        .setDesc(copy.externalApiEndpointDesc)
        .addText((text) => {
          text.setValue(endpoint);
          text.inputEl.readOnly = true;
          text.inputEl.addClass("towrite-readonly-input");
        })
        .addButton((button) => {
          button
            .setIcon("copy")
            .setTooltip(copy.copy)
            .onClick(() => {
              void copyToClipboard(endpoint, copy.copied);
            });
        });

      new Setting(containerEl)
        .setName(copy.externalApiBindHost)
        .setDesc(copy.externalApiBindHostDesc)
        .addText((text) => {
          let draftValue = this.plugin.settings.externalApi.bindHost;
          const commit = async () => {
            const rawValue = draftValue.trim();
            const nextValue = normalizeExternalApiBindHost(rawValue);
            if (nextValue !== rawValue && rawValue) {
              new Notice(`API bind host 已修正为 ${nextValue}`);
            }
            this.plugin.settings.externalApi.bindHost = nextValue;
            text.setValue(nextValue);
            await this.plugin.savePluginData();
            await this.plugin.configureExternalApiServer(false);
          };

          text
            .setValue(this.plugin.settings.externalApi.bindHost)
            .setPlaceholder("127.0.0.1")
            .onChange((value) => {
              draftValue = value;
            });
          text.inputEl.addEventListener("blur", () => {
            void commit();
          });
          text.inputEl.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              text.inputEl.blur();
            }
          });
        });

      new Setting(containerEl)
        .setName(copy.externalApiPort)
        .setDesc(copy.externalApiPortDesc)
        .addText((text) => {
          text
            .setValue(String(this.plugin.settings.externalApi.port))
            .setPlaceholder("48321")
            .onChange(async (value) => {
              this.plugin.settings.externalApi.port = clampInteger(value, 1024, 65535, 48321);
              await this.plugin.savePluginData();
              await this.plugin.configureExternalApiServer(false);
            });
        });

      new Setting(containerEl)
        .setName(copy.externalApiToken)
        .setDesc(copy.externalApiTokenDesc)
        .addText((text) => {
          text
            .setValue(this.plugin.settings.externalApi.token)
            .onChange(async (value) => {
              this.plugin.settings.externalApi.token = value.trim();
              await this.plugin.savePluginData();
            });
        })
        .addButton((button) => {
          button
            .setIcon("copy")
            .setTooltip(copy.copy)
            .onClick(() => {
              void copyToClipboard(this.plugin.settings.externalApi.token, copy.copied);
            });
        })
        .addButton((button) => {
          button
            .setButtonText(copy.regenerateToken)
            .onClick(async () => {
              this.plugin.regenerateExternalApiToken();
              await this.plugin.savePluginData();
              this.refreshSettingsUi();
            });
        });

      new Setting(containerEl)
        .setName(copy.externalApiQueryToken)
        .setDesc(copy.externalApiQueryTokenDesc)
        .addToggle((toggle) => {
          toggle
            .setValue(this.plugin.settings.externalApi.allowQueryTokenForRead)
            .onChange(async (value) => {
              this.plugin.settings.externalApi.allowQueryTokenForRead = value;
              await this.plugin.savePluginData();
            });
        });
    }

    this.renderDeviceProfiles(containerEl, copy);
  }

  private renderQuote0Settings(containerEl: HTMLElement, copy: SettingCopy): void {
    const quote0 = this.plugin.settings.quote0;

    new Setting(containerEl)
      .setName(copy.quote0)
      .setDesc(copy.quote0Desc)
      .addToggle((toggle) => {
        toggle
          .setValue(quote0.enabled)
          .onChange(async (value) => {
            quote0.enabled = value;
            await this.plugin.savePluginData();
            this.plugin.configureQuote0Sync();
            this.refreshSettingsUi();
          });
      });

    new Setting(containerEl)
      .setName(copy.quote0ApiBaseUrl)
      .setDesc(copy.quote0ApiBaseUrlDesc)
      .addText((text) => {
        let draftValue = quote0.apiBaseUrl;
        const commit = async () => {
          const nextValue = normalizeQuote0ApiBaseUrl(draftValue);
          quote0.apiBaseUrl = nextValue;
          text.setValue(nextValue);
          await this.plugin.savePluginData();
        };
        text
          .setValue(quote0.apiBaseUrl)
          .setPlaceholder("https://dot.mindreset.tech")
          .onChange((value) => {
            draftValue = value;
          });
        text.inputEl.addEventListener("blur", () => {
          void commit();
        });
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            text.inputEl.blur();
          }
        });
      });

    new Setting(containerEl)
      .setName(copy.quote0ApiKey)
      .setDesc(copy.quote0ApiKeyDesc)
      .addText((text) => {
        text
          .setValue(quote0.apiKey)
          .setPlaceholder("dot_app_...")
          .onChange(async (value) => {
            quote0.apiKey = value.trim();
            await this.plugin.savePluginData();
          });
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "off";
      });

    new Setting(containerEl)
      .setName(copy.quote0DeviceId)
      .setDesc(copy.quote0DeviceIdDesc)
      .addText((text) => {
        text
          .setValue(quote0.deviceId)
          .setPlaceholder("ABCD1234ABCD")
          .onChange(async (value) => {
            quote0.deviceId = value.trim();
            await this.plugin.savePluginData();
            this.plugin.configureQuote0Sync();
          });
      })
      .addButton((button) => {
        button
          .setButtonText(copy.quote0FetchDevices)
          .onClick(async () => {
            try {
              const devices = await this.plugin.listQuote0Devices();
              this.quote0Devices = devices.filter(isQuote0Device);
              if (this.quote0Devices.length === 1) {
                quote0.deviceId = this.quote0Devices[0].id;
                await this.plugin.savePluginData();
                this.plugin.configureQuote0Sync();
                new Notice(`Quote0 device selected: ${formatQuote0DeviceLabel(this.quote0Devices[0])}`);
              } else if (this.quote0Devices.length === 0) {
                new Notice(copy.quote0NoDevices);
              } else {
                new Notice(`Found ${this.quote0Devices.length} quote0 devices.`);
              }
              this.refreshSettingsUi();
            } catch (error) {
              new Notice(`Quote0 devices failed: ${errorMessage(error)}`);
            }
          });
      })
      .addButton((button) => {
        button
          .setButtonText(copy.quote0DeviceStatus)
          .onClick(async () => {
            try {
              const status = await this.plugin.getQuote0DeviceStatus();
              new Notice([
                status.alias || status.deviceId,
                status.status?.current,
                status.status?.battery,
                status.status?.wifi
              ].filter(Boolean).join(" · ") || "Quote0 status loaded.");
            } catch (error) {
              new Notice(`Quote0 status failed: ${errorMessage(error)}`);
            }
          });
      });

    if (this.quote0Devices.length > 1) {
      new Setting(containerEl)
        .setName(copy.quote0DeviceId)
        .addDropdown((dropdown) => {
          for (const device of this.quote0Devices) {
            dropdown.addOption(device.id, formatQuote0DeviceLabel(device));
          }
          dropdown
            .setValue(quote0.deviceId)
            .onChange(async (value) => {
              quote0.deviceId = value;
              await this.plugin.savePluginData();
              this.plugin.configureQuote0Sync();
              this.refreshSettingsUi();
            });
        });
    }

    new Setting(containerEl)
      .setName(copy.quote0Scope)
      .setDesc(copy.quote0ScopeDesc)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("", copy.quote0AllCards)
          .addOption("think", copy.quote0ThinkOnly)
          .addOption("write", copy.quote0WriteOnly)
          .setValue(quote0.lane)
          .onChange(async (value) => {
            quote0.lane = value === "think" || value === "write" ? value : "";
            quote0.cursor = 0;
            await this.plugin.savePluginData();
          });
      });

    new Setting(containerEl)
      .setName(copy.quote0RefreshSeconds)
      .setDesc(copy.quote0RefreshSecondsDesc)
      .addText((text) => {
        text
          .setValue(String(quote0.refreshSeconds))
          .setPlaceholder("300")
          .onChange(async (value) => {
            quote0.refreshSeconds = clampInteger(value, 60, 86400, 300);
            await this.plugin.savePluginData();
            this.plugin.configureQuote0Sync();
          });
      })
      .addButton((button) => {
        button
          .setButtonText(copy.quote0ApplyInterval)
          .onClick(async () => {
            try {
              await this.plugin.updateQuote0DeviceRefreshInterval();
              new Notice("Quote0 device interval updated.");
            } catch (error) {
              new Notice(`Quote0 interval failed: ${errorMessage(error)}`);
            }
          });
      });

    new Setting(containerEl)
      .setName(copy.quote0ForceRefreshAfterSend)
      .setDesc(copy.quote0ForceRefreshAfterSendDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(quote0.forceRefreshAfterSend)
          .onChange(async (value) => {
            quote0.forceRefreshAfterSend = value;
            await this.plugin.savePluginData();
          });
      });

    new Setting(containerEl)
      .setName(copy.quote0TaskKey)
      .setDesc(copy.quote0TaskKeyDesc)
      .addText((text) => {
        text
          .setValue(quote0.taskKey)
          .setPlaceholder("text_task_1")
          .onChange(async (value) => {
            quote0.taskKey = value.trim();
            await this.plugin.savePluginData();
          });
      });

    new Setting(containerEl)
      .setName(copy.quote0TaskAlias)
      .setDesc(copy.quote0TaskAliasDesc)
      .addText((text) => {
        text
          .setValue(quote0.taskAlias)
          .setPlaceholder("ToWrite Open Questions")
          .onChange(async (value) => {
            quote0.taskAlias = value.trim() || "ToWrite Open Questions";
            await this.plugin.savePluginData();
          });
      });

    new Setting(containerEl)
      .setName(copy.quote0DashboardApi)
      .setDesc(copy.quote0DashboardApiDesc)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("text", copy.quote0DashboardText)
          .addOption("canvas", copy.quote0DashboardCanvas)
          .addOption("image", copy.quote0DashboardImage)
          .setValue(quote0.dashboardApi)
          .onChange(async (value) => {
            quote0.dashboardApi = value === "image" || value === "canvas" ? value : "text";
            await this.plugin.savePluginData();
            this.refreshSettingsUi();
          });
      });

    if (quote0.dashboardApi === "canvas") {
      new Setting(containerEl)
        .setName(copy.quote0CanvasTaskAlias)
        .setDesc(copy.quote0CanvasTaskAliasDesc)
        .addText((text) => {
          text
            .setValue(quote0.canvasTaskAlias)
            .setPlaceholder("ToWrite Dashboard")
            .onChange(async (value) => {
              quote0.canvasTaskAlias = value.trim() || "ToWrite Dashboard";
              await this.plugin.savePluginData();
            });
        });

      new Setting(containerEl)
        .setName(copy.quote0CanvasBorder)
        .setDesc(copy.quote0CanvasBorderDesc)
        .addDropdown((dropdown) => {
          dropdown
            .addOption("0", "0")
            .addOption("1", "1")
            .setValue(String(quote0.canvasBorder))
            .onChange(async (value) => {
              quote0.canvasBorder = value === "1" ? 1 : 0;
              await this.plugin.savePluginData();
            });
        });
    }

    if (quote0.dashboardApi === "image") {
      new Setting(containerEl)
        .setName(copy.quote0ImageTaskKey)
        .setDesc(copy.quote0ImageTaskKeyDesc)
        .addText((text) => {
          text
            .setValue(quote0.imageTaskKey)
            .setPlaceholder("image_task_1")
            .onChange(async (value) => {
              quote0.imageTaskKey = value.trim();
              await this.plugin.savePluginData();
            });
        });

      new Setting(containerEl)
        .setName(copy.quote0ImageTaskAlias)
        .setDesc(copy.quote0ImageTaskAliasDesc)
        .addText((text) => {
          text
            .setValue(quote0.imageTaskAlias)
            .setPlaceholder("ToWrite Dashboard")
            .onChange(async (value) => {
              quote0.imageTaskAlias = value.trim() || "ToWrite Dashboard";
              await this.plugin.savePluginData();
            });
        });

      new Setting(containerEl)
        .setName(copy.quote0ImageDither)
        .setDesc(copy.quote0ImageDitherDesc)
        .addDropdown((dropdown) => {
          dropdown
            .addOption("NONE", "NONE")
            .addOption("DIFFUSION", "DIFFUSION")
            .addOption("ORDERED", "ORDERED")
            .setValue(quote0.imageDitherType)
            .onChange(async (value) => {
              quote0.imageDitherType = value === "DIFFUSION" || value === "ORDERED" ? value : "NONE";
              await this.plugin.savePluginData();
              this.refreshSettingsUi();
            });
        });

      new Setting(containerEl)
        .setName(copy.quote0ImageBorder)
        .setDesc(copy.quote0ImageBorderDesc)
        .addDropdown((dropdown) => {
          dropdown
            .addOption("0", "0")
            .addOption("1", "1")
            .setValue(String(quote0.imageBorder))
            .onChange(async (value) => {
              quote0.imageBorder = value === "1" ? 1 : 0;
              await this.plugin.savePluginData();
            });
        });
    }

    new Setting(containerEl)
      .setName(copy.quote0NfcToken)
      .setDesc(copy.quote0NfcTokenDesc)
      .addText((text) => {
        text.setValue(quote0.nfcToken);
        text.inputEl.readOnly = true;
        text.inputEl.addClass("towrite-readonly-input");
      })
      .addButton((button) => {
        button
          .setIcon("copy")
          .setTooltip(copy.copy)
          .onClick(() => {
            void copyToClipboard(quote0.nfcToken, copy.copied);
          });
      })
      .addButton((button) => {
        button
          .setButtonText(copy.regenerateToken)
          .onClick(async () => {
            this.plugin.regenerateQuote0NfcToken();
            await this.plugin.savePluginData();
            this.refreshSettingsUi();
          });
      });

    const nfcLink = buildQuote0NfcPreviewUrl(this.plugin.settings);
    new Setting(containerEl)
      .setName(copy.quote0NfcLink)
      .setDesc(nfcLink ? copy.quote0NfcLinkDesc : copy.quote0MissingPublicBaseUrl)
      .addText((text) => {
        text.setValue(nfcLink || "");
        text.inputEl.readOnly = true;
        text.inputEl.addClass("towrite-readonly-input");
      })
      .addButton((button) => {
        button
          .setIcon("copy")
          .setTooltip(copy.copy)
          .setDisabled(!nfcLink)
          .onClick(() => {
            if (nfcLink) {
              void copyToClipboard(nfcLink, copy.copied);
            }
          });
      });

    new Setting(containerEl)
      .setName(copy.quote0LastSync)
      .setDesc(formatQuote0LastSync(quote0));

    this.renderQuote0Preview(containerEl, copy);

    containerEl.createDiv({ cls: "towrite-quote0-action-note", text: copy.quote0LoopNotice });
  }

  private renderQuote0Preview(containerEl: HTMLElement, copy: SettingCopy): void {
    new Setting(containerEl)
      .setName(copy.quote0Preview)
      .setDesc(copy.quote0PreviewDesc)
      .addButton((button) => {
        button
          .setButtonText(copy.quote0PreviewRefresh)
          .onClick(() => this.refreshSettingsUi());
      });

    const previewEl = containerEl.createDiv({ cls: "towrite-quote0-preview" });
    const list = previewEl.createDiv({ cls: "towrite-quote0-preview-list" });
    this.renderQuote0PreviewCard(
      list,
      copy.quote0TextPreview,
      copy.quote0TextPreviewDesc,
      () => this.plugin.previewQuote0Next(),
      copy,
      [
        { label: copy.quote0SendNext, primary: true, run: () => this.sendQuote0NextFromPreview() },
        { label: copy.quote0SendTest, run: () => this.sendQuote0TestFromPreview() },
        { label: copy.quote0ForceRefresh, run: () => this.forceQuote0RefreshFromPreview() }
      ]
    );
    this.renderQuote0PreviewCard(
      list,
      copy.quote0HomePreview,
      copy.quote0HomePreviewDesc,
      () => this.plugin.previewQuote0DashboardContent(),
      copy,
      [
        { label: copy.quote0SendDashboard, primary: true, run: () => this.sendQuote0DashboardFromPreview() },
        { label: copy.quote0ForceRefresh, run: () => this.forceQuote0RefreshFromPreview() }
      ]
    );
  }

  private renderQuote0PreviewCard(
    containerEl: HTMLElement,
    titleText: string,
    descText: string,
    buildPreview: () => Quote0SyncPreview,
    copy: SettingCopy,
    actions: Quote0PreviewAction[]
  ): void {
    const cardEl = containerEl.createDiv({ cls: "towrite-quote0-preview-card" });
    const headerEl = cardEl.createDiv({ cls: "towrite-quote0-preview-card-header" });
    const titleEl = headerEl.createDiv({ cls: "towrite-quote0-preview-card-copy" });
    titleEl.createDiv({ cls: "towrite-quote0-preview-card-title", text: titleText });
    titleEl.createDiv({ cls: "towrite-quote0-preview-card-desc", text: descText });
    const actionsEl = headerEl.createDiv({ cls: "towrite-quote0-preview-card-actions" });
    for (const action of actions) {
      const button = actionsEl.createEl("button", {
        text: action.label,
        cls: action.primary ? "mod-cta" : "",
        attr: { type: "button" }
      });
      button.addEventListener("click", () => {
        void this.runQuote0PreviewAction(button, action);
      });
    }

    try {
      const preview = buildPreview();
      const payload = preview.payload;
      const titleStyle = payload.styles?.title ?? {};
      const messageStyle = payload.styles?.message ?? {};
      const signatureStyle = payload.styles?.signature ?? {};
      const screen = cardEl.createDiv({ cls: "towrite-quote0-preview-stage" });
      const isDashboard = preview.display?.variant === "home-summary";
      const isImage = Boolean(preview.imagePayload?.image);
      const isCanvas = Boolean(preview.canvasPayload);
      const screenClasses = ["towrite-quote0-preview-screen"];
      if (isCanvas) {
        screenClasses.push("is-canvas-home");
        if (canvasDataText(preview.canvasPayload?.data ?? {}, "layoutProfile", "") === "wide-low") {
          screenClasses.push("is-wide-low");
        }
      } else if (isImage) {
        screenClasses.push("is-image");
      } else if (isDashboard) {
        screenClasses.push("is-dashboard");
      }
      const device = screen.createDiv({ cls: screenClasses.join(" ") });
      if (isCanvas && preview.canvasPayload) {
        const screenWidth = canvasDataNumber(preview.canvasPayload.data, "screenWidth");
        const screenHeight = canvasDataNumber(preview.canvasPayload.data, "screenHeight");
        if (screenWidth && screenHeight) {
          device.style.aspectRatio = `${screenWidth} / ${screenHeight}`;
        }
      }
      if (isImage && preview.imagePayload) {
        renderQuote0ImagePreview(device, preview.imagePayload);
      } else if (isCanvas && preview.canvasPayload) {
        renderQuote0CanvasDashboardPreview(device, preview.canvasPayload);
      } else if ((isDashboard || isCanvas) && preview.display) {
        renderQuote0DashboardPreview(device, preview.display, payload);
      } else {
        const title = device.createDiv({ cls: "towrite-quote0-preview-title", text: payload.title || "ToWrite" });
        applyPreviewTextStyle(title, titleStyle);

        const body = device.createDiv({ cls: "towrite-quote0-preview-message" });
        applyPreviewTextStyle(body, messageStyle);
        body.style.lineHeight = String(messageStyle.lineHeight ?? 1.08);
        for (const line of splitPreviewLines(payload.message)) {
          body.createDiv({ text: line });
        }

        const signature = device.createDiv({ cls: "towrite-quote0-preview-signature", text: payload.signature || "" });
        applyPreviewTextStyle(signature, signatureStyle);
      }

      const meta = cardEl.createDiv({ cls: "towrite-quote0-preview-meta" });
      meta.createSpan({ text: [preview.candidateType, preview.questionId ? shortId(preview.questionId) : ""].filter(Boolean).join(" - ") || "payload" });
      if (preview.nfcLink) {
        meta.createSpan({ text: "NFC ready" });
      }

      const fields = cardEl.createDiv({ cls: "towrite-quote0-preview-fields" });
      addPreviewField(fields, "api", preview.canvasPayload ? "canvas" : preview.imagePayload ? "image" : "text");
      addPreviewField(fields, "title", payload.title);
      addPreviewField(fields, "message", payload.message);
      addPreviewField(fields, "signature", payload.signature);
      if (preview.imagePayload) {
        addPreviewField(fields, "image", previewImageSummary(preview.imagePayload.image));
        addPreviewField(fields, "ditherType", preview.imagePayload.ditherType);
        addPreviewField(fields, "border", preview.imagePayload.border === undefined ? undefined : String(preview.imagePayload.border));
        addPreviewField(fields, "imageTaskKey", preview.imagePayload.taskKey);
        addPreviewField(fields, "imageTaskAlias", preview.imagePayload.taskAlias === null || preview.imagePayload.taskAlias === undefined ? undefined : String(preview.imagePayload.taskAlias));
      }
      if (preview.canvasPayload) {
        addPreviewField(fields, "canvasTaskAlias", preview.canvasPayload.taskAlias === null || preview.canvasPayload.taskAlias === undefined ? undefined : String(preview.canvasPayload.taskAlias));
        addPreviewField(fields, "canvasBorder", preview.canvasPayload.border === undefined ? undefined : String(preview.canvasPayload.border));
        addPreviewField(fields, "canvasLayout", canvasDataText(preview.canvasPayload.data, "layoutProfile", ""));
        addPreviewField(fields, "canvasScreen", `${canvasDataText(preview.canvasPayload.data, "screenWidth", "?")}x${canvasDataText(preview.canvasPayload.data, "screenHeight", "?")}`);
        addPreviewField(fields, "canvasData", `${Object.keys(preview.canvasPayload.data).length} fields`);
        addPreviewField(fields, "windowData", `${preview.canvasPayload.windowData.default.length} default layer`);
      }
      addPreviewField(fields, "taskKey", payload.taskKey);
      addPreviewField(fields, "taskAlias", payload.taskAlias === null || payload.taskAlias === undefined ? undefined : String(payload.taskAlias));
      addPreviewField(fields, "link", redactSensitiveText(preview.canvasPayload?.link || preview.imagePayload?.link || payload.link));
    } catch (error) {
      cardEl.createDiv({
        cls: "towrite-quote0-preview-error",
        text: `${copy.quote0PreviewUnavailable} ${errorMessage(error)}`
      });
    }
  }

  private async runQuote0PreviewAction(button: HTMLButtonElement, action: Quote0PreviewAction): Promise<void> {
    button.disabled = true;
    try {
      await action.run();
    } finally {
      button.disabled = false;
    }
  }

  private async sendQuote0NextFromPreview(): Promise<void> {
    try {
      const result = await this.plugin.syncQuote0Next();
      const api = result.contentApi ? result.contentApi.toUpperCase() : "API";
      new Notice(result.questionId ? `Quote0 ${api} sent ${shortId(result.questionId)}.` : result.message);
      this.refreshSettingsUi();
    } catch (error) {
      new Notice(`Quote0 sync failed: ${errorMessage(error)}`);
      this.refreshSettingsUi();
    }
  }

  private async sendQuote0DashboardFromPreview(): Promise<void> {
    try {
      const message = await this.plugin.sendQuote0DashboardContent();
      new Notice(message);
      this.refreshSettingsUi();
    } catch (error) {
      new Notice(`Quote0 dashboard failed: ${errorMessage(error)}`);
      this.refreshSettingsUi();
    }
  }

  private async sendQuote0TestFromPreview(): Promise<void> {
    try {
      const message = await this.plugin.sendQuote0TestCard();
      new Notice(message);
      this.refreshSettingsUi();
    } catch (error) {
      new Notice(`Quote0 test failed: ${errorMessage(error)}`);
      this.refreshSettingsUi();
    }
  }

  private async forceQuote0RefreshFromPreview(): Promise<void> {
    try {
      const message = await this.plugin.switchQuote0ToNextContent();
      new Notice(message);
      this.refreshSettingsUi();
    } catch (error) {
      new Notice(`Quote0 refresh failed: ${errorMessage(error)}`);
      this.refreshSettingsUi();
    }
  }

  private renderPushSettings(containerEl: HTMLElement, copy: SettingCopy): void {
    const push = this.plugin.settings.push;

    new Setting(containerEl)
      .setName(copy.push)
      .setDesc(copy.pushDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(push.enabled)
          .onChange(async (value) => {
            push.enabled = value;
            await this.savePushSettings(true);
            this.plugin.configureQuote0Sync();
          });
      });

    new Setting(containerEl)
      .setName(copy.pushPrivacy)
      .setDesc(copy.pushPrivacyDesc)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("local-coarse", copy.pushPrivacyLocal)
          .addOption("precise-location", copy.pushPrivacyPrecise)
          .addOption("no-location", copy.pushPrivacyNone)
          .setValue(push.privacy.level)
          .onChange(async (value) => {
            push.privacy.level = value === "precise-location" || value === "no-location" ? value : "local-coarse";
            if (push.privacy.level !== "precise-location") {
              push.privacy.allowPreciseLocation = false;
            }
            await this.savePushSettings(true);
          });
      });

    new Setting(containerEl)
      .setName(copy.pushPreciseLocation)
      .setDesc(copy.pushPreciseLocationDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(push.privacy.allowPreciseLocation)
          .onChange(async (value) => {
            push.privacy.allowPreciseLocation = value && push.privacy.level === "precise-location";
            await this.savePushSettings(true);
          });
      });

    new Setting(containerEl)
      .setName(copy.pushAiRerank)
      .setDesc(copy.pushAiRerankDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(push.aiRerank)
          .onChange(async (value) => {
            push.aiRerank = value;
            await this.savePushSettings();
          });
      });

    new Setting(containerEl)
      .setName(copy.pushTargets)
      .setDesc(copy.pushTargetsDesc)
      .setHeading();
    this.renderPushTargetEditor(containerEl, copy);
  }

  private renderPushTargetEditor(containerEl: HTMLElement, copy: SettingCopy): void {
    const targets = this.plugin.settings.push.targets;
    const list = containerEl.createDiv({ cls: "towrite-workflow-stage-editor" });

    for (const [index, target] of targets.entries()) {
      const card = list.createEl("details", { cls: "towrite-workflow-stage-card towrite-color-slate" });
      card.open = index < 2;
      const header = card.createEl("summary", { cls: "towrite-workflow-stage-header" });
      const title = header.createDiv({ cls: "towrite-workflow-stage-title" });
      title.createEl("strong", { text: `${target.name || target.id} (${target.type})` });
      title.createSpan({ cls: "towrite-workflow-stage-meta", text: `${target.profile} · ${target.refreshSeconds}s · ${target.enabled ? "enabled" : "off"}` });
      const actions = header.createDiv({ cls: "towrite-workflow-stage-actions" });
      const remove = createIconButton(actions, "trash-2", copy.pushRemoveTarget);
      remove.disabled = target.id === "quote0";
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.removePushTarget(index);
      });

      const body = card.createDiv({ cls: "towrite-workflow-stage-body" });
      new Setting(body)
        .setName("Enabled")
        .addToggle((toggle) => {
          toggle.setValue(target.enabled).onChange(async (value) => {
            await this.patchPushTarget(index, { enabled: value }, true);
          });
        });
      new Setting(body)
        .setName("Name")
        .addText((text) => {
          text.setValue(target.name).onChange(async (value) => {
            await this.patchPushTarget(index, { name: value.trim() || target.id });
          });
        });
      new Setting(body)
        .setName("Target id")
        .addText((text) => {
          text.setValue(target.id).setPlaceholder("desk-phone").onChange(async (value) => {
            await this.patchPushTarget(index, { id: normalizePushEditorId(value) }, true);
          });
          text.inputEl.disabled = target.id === "quote0";
        });
      new Setting(body)
        .setName("Type")
        .addDropdown((dropdown) => {
          dropdown
            .addOption("local-web", "local-web")
            .addOption("mobile-app", "mobile-app")
            .addOption("quote0", "quote0")
            .addOption("webhook", "webhook")
            .setValue(target.type)
            .onChange(async (value) => {
              await this.patchPushTarget(index, { type: normalizePushTargetType(value) }, true);
            });
        });
      new Setting(body)
        .setName("Profile")
        .addDropdown((dropdown) => {
          dropdown
            .addOption("mobile-eink", "mobile-eink")
            .addOption("eink-bw", "eink-bw")
            .addOption("desktop-card", "desktop-card")
            .setValue(target.profile)
            .onChange(async (value) => {
              await this.patchPushTarget(index, { profile: value === "mobile-eink" || value === "desktop-card" ? value : "eink-bw" }, true);
            });
        });
      new Setting(body)
        .setName("Default page")
        .addDropdown((dropdown) => {
          dropdown
            .addOption("home", "home")
            .addOption("cards", "cards")
            .addOption("workflow", "workflow")
            .addOption("articles", "articles")
            .setValue(target.defaultPage)
            .onChange(async (value) => {
              await this.patchPushTarget(index, { defaultPage: value === "cards" || value === "workflow" || value === "articles" ? value : "home" }, true);
            });
        });
      new Setting(body)
        .setName("Default lane")
        .addDropdown((dropdown) => {
          dropdown
            .addOption("", "all")
            .addOption("think", "think")
            .addOption("write", "write")
            .setValue(target.defaultLane)
            .onChange(async (value) => {
              await this.patchPushTarget(index, { defaultLane: value === "think" || value === "write" ? value : "" }, true);
            });
        });
      new Setting(body)
        .setName("Refresh seconds")
        .addText((text) => {
          text.setValue(String(target.refreshSeconds)).onChange(async (value) => {
            await this.patchPushTarget(index, { refreshSeconds: clampInteger(value, 15, 86400, 300) });
          });
        });
      new Setting(body)
        .setName("Quiet hours")
        .setDesc("Format HH:mm. Leave empty to disable.")
        .addText((text) => {
          text.setValue(target.quietHoursStart).setPlaceholder("23:00").onChange(async (value) => {
            await this.patchPushTarget(index, { quietHoursStart: normalizeTimeInput(value) });
          });
        })
        .addText((text) => {
          text.setValue(target.quietHoursEnd).setPlaceholder("07:00").onChange(async (value) => {
            await this.patchPushTarget(index, { quietHoursEnd: normalizeTimeInput(value) });
          });
        });
      new Setting(body)
        .setName("Capabilities")
        .addTextArea((text) => {
          text.setValue(target.capabilities.join("\n")).onChange(async (value) => {
            await this.patchPushTarget(index, { capabilities: splitWorkflowList(value) });
          });
          text.inputEl.rows = 3;
        });
      new Setting(body)
        .setName("Button mappings")
        .setDesc("One per line: center: respond, center-long: capture, center-double: open, left: prev, right: next, right-long: later.")
        .addTextArea((text) => {
          text.setValue(formatButtonMappings(target.buttonMappings)).onChange(async (value) => {
            await this.patchPushTarget(index, { buttonMappings: parseButtonMappings(value) });
          });
          text.inputEl.rows = 6;
        });
      const feedUrl = buildPushFeedUrl(this.plugin.settings, target);
      new Setting(body)
        .setName(copy.pushFeedUrl)
        .addText((text) => {
          text.setValue(feedUrl);
          text.inputEl.readOnly = true;
          text.inputEl.addClass("towrite-readonly-input");
        })
        .addButton((button) => {
          button.setIcon("copy").setTooltip(copy.copy).onClick(() => {
            void copyToClipboard(feedUrl, copy.copied);
          });
        });
    }

    const addButton = containerEl.createEl("button", { text: copy.pushAddTarget, attr: { type: "button" } });
    addButton.addEventListener("click", () => {
      const id = nextPushTargetId(targets);
      void this.savePushTargets([
        ...targets,
        {
          id,
          name: `Target ${targets.length + 1}`,
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
          capabilities: ["pull", "sse", "feedback", "input"],
          buttonMappings: DEFAULT_DEVICE_BUTTON_MAPPINGS
        }
      ], true);
    });
  }

  private renderPushHabitEditor(containerEl: HTMLElement, copy: SettingCopy): void {
    const habits = this.plugin.settings.push.habits;
    const list = containerEl.createDiv({ cls: "towrite-workflow-stage-editor" });

    for (const [index, habit] of habits.entries()) {
      const card = list.createEl("details", { cls: "towrite-workflow-stage-card towrite-color-mint" });
      card.open = index < 2;
      const header = card.createEl("summary", { cls: "towrite-workflow-stage-header" });
      const title = header.createDiv({ cls: "towrite-workflow-stage-title" });
      title.createEl("strong", { text: habit.label || habit.id });
      title.createSpan({ cls: "towrite-workflow-stage-meta", text: `${habit.timeStart || "*"}-${habit.timeEnd || "*"} · boost ${habit.boost}` });
      const actions = header.createDiv({ cls: "towrite-workflow-stage-actions" });
      const remove = createIconButton(actions, "trash-2", copy.pushRemoveHabit);
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.removePushHabit(index);
      });

      const body = card.createDiv({ cls: "towrite-workflow-stage-body" });
      new Setting(body).setName("Enabled").addToggle((toggle) => {
        toggle.setValue(habit.enabled).onChange(async (value) => this.patchPushHabit(index, { enabled: value }, true));
      });
      new Setting(body).setName("Label").addText((text) => {
        text.setValue(habit.label).onChange(async (value) => this.patchPushHabit(index, { label: value.trim() || habit.id }));
      });
      new Setting(body).setName("Rule id").addText((text) => {
        text.setValue(habit.id).onChange(async (value) => this.patchPushHabit(index, { id: normalizePushEditorId(value) }, true));
      });
      new Setting(body).setName("Time range").setDesc("Format HH:mm. Leave empty for all day.").addText((text) => {
        text.setValue(habit.timeStart).setPlaceholder("06:00").onChange(async (value) => this.patchPushHabit(index, { timeStart: normalizeTimeInput(value) }));
      }).addText((text) => {
        text.setValue(habit.timeEnd).setPlaceholder("11:00").onChange(async (value) => this.patchPushHabit(index, { timeEnd: normalizeTimeInput(value) }));
      });
      new Setting(body).setName("Place / mode").addText((text) => {
        text.setValue(habit.placeLabel).setPlaceholder("desk").onChange(async (value) => this.patchPushHabit(index, { placeLabel: value.trim() }));
      }).addText((text) => {
        text.setValue(habit.mode).setPlaceholder("writing").onChange(async (value) => this.patchPushHabit(index, { mode: value.trim() }));
      });
      new Setting(body).setName("Stage ids").addTextArea((text) => {
        text.setValue(habit.stageIds.join("\n")).setPlaceholder("raw\nsparks").onChange(async (value) => this.patchPushHabit(index, { stageIds: splitWorkflowList(value) }));
        text.inputEl.rows = 3;
      });
      new Setting(body).setName("Lanes").addText((text) => {
        text.setValue(habit.lanes.join(", ")).setPlaceholder("think, write").onChange(async (value) => this.patchPushHabit(index, { lanes: parseLaneList(value) }));
      });
      new Setting(body).setName("Statuses").addText((text) => {
        text.setValue(habit.statuses.join(", ")).setPlaceholder("open, blocked").onChange(async (value) => this.patchPushHabit(index, { statuses: splitWorkflowList(value) }));
      });
      new Setting(body).setName("Target ids").addTextArea((text) => {
        text.setValue(habit.targetIds.join("\n")).setPlaceholder("quote0\nlocal-web").onChange(async (value) => this.patchPushHabit(index, { targetIds: splitWorkflowList(value).map(normalizePushEditorId) }));
        text.inputEl.rows = 3;
      });
      new Setting(body).setName("Boost").addText((text) => {
        text.setValue(String(habit.boost)).onChange(async (value) => this.patchPushHabit(index, { boost: clampInteger(value, -100, 100, 10) }));
      });
    }

    const addButton = containerEl.createEl("button", { text: copy.pushAddHabit, attr: { type: "button" } });
    addButton.addEventListener("click", () => {
      const id = nextPushHabitId(habits);
      void this.savePushHabits([
        ...habits,
        {
          id,
          label: `Rule ${habits.length + 1}`,
          enabled: true,
          timeStart: "",
          timeEnd: "",
          placeLabel: "",
          mode: "",
          stageIds: [],
          lanes: [],
          statuses: [],
          targetIds: [],
          boost: 10,
          limitPerDay: 0
        }
      ], true);
    });
  }

  private renderDeviceProfiles(containerEl: HTMLElement, copy: SettingCopy): void {
    new Setting(containerEl)
      .setName(copy.deviceProfiles)
      .setDesc(copy.deviceProfilesDesc);

    const profiles = normalizeDeviceProfiles(this.plugin.settings.deviceProfiles);
    this.plugin.settings.deviceProfiles = profiles;
    const list = containerEl.createDiv({ cls: "towrite-device-profile-editor" });

    for (const [index, profile] of profiles.entries()) {
      const card = list.createEl("details", { cls: "towrite-device-profile-card" });
      card.open = this.openDeviceProfileIds.has(profile.id);
      card.addEventListener("toggle", () => {
        if (card.open) {
          this.openDeviceProfileIds.add(profile.id);
        } else {
          this.openDeviceProfileIds.delete(profile.id);
        }
      });

      const header = card.createEl("summary", { cls: "towrite-device-profile-header" });
      const title = header.createDiv({ cls: "towrite-device-profile-title" });
      title.createEl("strong", { text: profile.name || profile.id });
      title.createSpan({
        cls: "towrite-device-profile-meta",
        text: profile.profile + " ? " + profile.width + "?" + profile.height + " ? " + profile.inches + " inch ? " + profile.defaultPage
      });
      const actions = header.createDiv({ cls: "towrite-device-profile-actions" });
      const remove = createIconButton(actions, "trash-2", copy.deviceProfileRemove);
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.removeDeviceProfile(index);
      });

      const body = card.createDiv({ cls: "towrite-device-profile-body" });

      new Setting(body)
        .setName(copy.deviceProfileName)
        .addText((input) => {
          input
            .setValue(profile.name)
            .setPlaceholder("2.7 inch e-ink landscape")
            .onChange(async (value) => {
              await this.patchDeviceProfile(index, { name: value.trim() });
            });
        });

      new Setting(body)
        .setName(copy.deviceProfileId)
        .addText((input) => {
          input
            .setValue(profile.id)
            .setPlaceholder("eink-27-landscape")
            .onChange(async (value) => {
              await this.patchDeviceProfile(index, { id: normalizeDeviceProfileId(value) }, true);
            });
        });

      new Setting(body)
        .setName(copy.deviceProfileKind)
        .addDropdown((dropdown) => {
          dropdown
            .addOption("eink-bw", "eink-bw")
            .addOption("mobile-eink", "mobile-eink")
            .addOption("desktop-card", "desktop-card")
            .setValue(profile.profile)
            .onChange(async (value) => {
              await this.patchDeviceProfile(index, { profile: value as ToWriteDeviceProfileSettings["profile"] }, true);
            });
        });

      new Setting(body)
        .setName(copy.deviceProfileWidth)
        .setDesc(copy.deviceProfileSize)
        .addText((input) => {
          input
            .setValue(String(profile.width))
            .setPlaceholder("264")
            .onChange(async (value) => {
              await this.patchDeviceProfile(index, { width: clampInteger(value, 80, 2400, 264) }, true);
            });
        });

      new Setting(body)
        .setName(copy.deviceProfileHeight)
        .addText((input) => {
          input
            .setValue(String(profile.height))
            .setPlaceholder("176")
            .onChange(async (value) => {
              await this.patchDeviceProfile(index, { height: clampInteger(value, 80, 2400, 176) }, true);
            });
        });

      new Setting(body)
        .setName(copy.deviceProfileInches)
        .addText((input) => {
          input
            .setValue(String(profile.inches))
            .setPlaceholder("2.7")
            .onChange(async (value) => {
              await this.patchDeviceProfile(index, { inches: clampNumber(value, 1, 32, 2.7) }, true);
            });
        });

      new Setting(body)
        .setName(copy.deviceProfileDefaultPage)
        .addDropdown((dropdown) => {
          dropdown
            .addOption("home", "home")
            .addOption("cards", "cards")
            .addOption("workflow", "workflow")
            .addOption("articles", "articles")
            .setValue(profile.defaultPage)
            .onChange(async (value) => {
              await this.patchDeviceProfile(index, { defaultPage: value as ToWriteDeviceProfileSettings["defaultPage"] }, true);
            });
        });

      new Setting(body)
        .setName(copy.deviceProfileDefaultLane)
        .addDropdown((dropdown) => {
          dropdown
            .addOption("", "all")
            .addOption("think", "ToThink")
            .addOption("write", "ToWrite")
            .setValue(profile.defaultLane ?? "")
            .onChange(async (value) => {
              await this.patchDeviceProfile(index, { defaultLane: value as OpenQuestionLane | "" }, true);
            });
        });

      new Setting(body)
        .setName(copy.deviceProfileRefresh)
        .addText((input) => {
          input
            .setValue(String(profile.refreshSeconds))
            .setPlaceholder("300")
            .onChange(async (value) => {
              await this.patchDeviceProfile(index, { refreshSeconds: clampInteger(value, 15, 86400, 300) }, true);
            });
        });

      const feedUrl = buildDeviceFeedProfileUrl(this.plugin.settings, profile);
      new Setting(body)
        .setName(copy.deviceProfileFeedUrl)
        .addText((input) => {
          input.setValue(feedUrl);
          input.inputEl.readOnly = true;
          input.inputEl.addClass("towrite-readonly-input");
        })
        .addButton((button) => {
          button
            .setIcon("copy")
            .setTooltip(copy.copy)
            .onClick(() => {
              void copyToClipboard(feedUrl, copy.copied);
            });
        });
    }

    const addRow = containerEl.createDiv({ cls: "towrite-device-profile-add" });
    const addButton = addRow.createEl("button", {
      text: copy.deviceProfileAdd,
      attr: { type: "button" }
    });
    addButton.addEventListener("click", () => {
      const nextId = nextDeviceProfileId(profiles);
      this.openDeviceProfileIds.add(nextId);
      void this.saveDeviceProfiles([
        ...profiles,
        {
          ...DEFAULT_DEVICE_PROFILES[0],
          id: nextId,
          name: "Device " + (profiles.length + 1)
        }
      ], true);
    });
  }

  private renderWorkflowSettings(containerEl: HTMLElement, copy: SettingCopy): void {
    new Setting(containerEl)
      .setName(copy.articleTypes)
      .setDesc(copy.articleTypesDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.articleTypes.enabled)
          .onChange(async (value) => {
            this.plugin.settings.articleTypes.enabled = value;
            if (this.plugin.settings.articleTypes.types.length === 0) {
              this.plugin.settings.articleTypes.types = DEFAULT_ARTICLE_TYPES.map((type) => ({ ...type }));
            }
            this.plugin.notifyUi();
            this.refreshSettingsUi();
            await this.plugin.savePluginData();
            await this.plugin.refreshWorkflowIndex();
          });
      });

    if (this.plugin.settings.articleTypes.enabled) {
      new Setting(containerEl)
        .setName(copy.articleTypesParseHierarchy)
        .setDesc(copy.articleTypesParseHierarchyDesc)
        .addToggle((toggle) => {
          toggle
            .setValue(this.plugin.settings.articleTypes.parseHierarchicalTags)
            .onChange(async (value) => {
              this.plugin.settings.articleTypes.parseHierarchicalTags = value;
              await this.plugin.savePluginData();
              await this.plugin.refreshWorkflowIndex();
              this.refreshSettingsUi();
            });
        });
      this.renderArticleTypeEditor(containerEl, copy);
    }

    new Setting(containerEl)
      .setName(copy.workflowStages)
      .setDesc(copy.workflowStagesDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.workflowStages.enabled)
          .onChange(async (value) => {
            this.plugin.settings.workflowStages.enabled = value;
            if (this.plugin.settings.workflowStages.stages.length === 0) {
              this.plugin.settings.workflowStages.stages = DEFAULT_WORKFLOW_STAGES.map((stage) => ({ ...stage }));
            }
            // Update the sidebar from configured stages immediately; counts follow after the focused rebuild.
            this.plugin.notifyUi();
            this.refreshSettingsUi();
            await this.plugin.savePluginData();
            await this.plugin.refreshWorkflowIndex();
          });
      });

    if (this.plugin.settings.workflowStages.enabled) {
      this.renderWorkflowStageEditor(containerEl, copy);
    }


  }

  private renderAboutSettings(containerEl: HTMLElement): void {
    const zh = this.plugin.settings.language !== "en";
    const version = this.plugin.manifest.version;
    const isPrerelease = version.includes("-");

    new Setting(containerEl)
      .setName(zh ? "插件信息" : "Plugin information")
      .setDesc(zh ? "查看当前安装版本、下载测试版并访问项目资源。" : "Check the installed version, download test builds, and open project resources.")
      .setHeading();

    const versionSetting = new Setting(containerEl)
      .setName(zh ? "当前版本" : "Current version")
      .setDesc(isPrerelease
        ? (zh ? "Beta 测试通道；适合在备用 Vault 或测试设备中验证。" : "Beta channel; test in a secondary vault or device first.")
        : (zh ? "稳定发布通道。" : "Stable release channel."));
    versionSetting.controlEl.createEl("code", { text: `v${version}` });

    const compatibilitySetting = new Setting(containerEl)
      .setName(zh ? "兼容与许可" : "Compatibility & license")
      .setDesc(zh ? "社区插件核心采用 MIT 许可。" : "The Community Plugin core is licensed under MIT.");
    compatibilitySetting.controlEl.createSpan({
      cls: "towrite-about-meta",
      text: `${zh ? "最低 Obsidian" : "Minimum Obsidian"} ${this.plugin.manifest.minAppVersion}`
    });

    const repositorySetting = new Setting(containerEl)
      .setName(zh ? "GitHub 项目" : "GitHub project")
      .setDesc(zh ? "查看源代码、README 和开发进度。" : "Browse the source, README, and development history.");
    this.addAboutLink(repositorySetting, "GitHub", ABOUT_LINKS.repository);

    const releaseSetting = new Setting(containerEl)
      .setName(zh ? "版本下载" : "Release downloads")
      .setDesc(zh ? "在另一台电脑安装时，从 Releases 下载 main.js、manifest.json 和 styles.css。" : "For another computer, download main.js, manifest.json, and styles.css from Releases.");
    this.addAboutLink(releaseSetting, zh ? "打开 Releases" : "Open Releases", ABOUT_LINKS.releases);

    const helpSetting = new Setting(containerEl)
      .setName(zh ? "文档与反馈" : "Docs & feedback")
      .setDesc(zh ? "阅读使用说明，或在 GitHub 提交可复现的问题。" : "Read the guide or report a reproducible issue on GitHub.");
    this.addAboutLink(helpSetting, zh ? "中文文档" : "Documentation", zh ? ABOUT_LINKS.readmeZh : ABOUT_LINKS.readmeEn);
    this.addAboutLink(helpSetting, zh ? "反馈问题" : "Report issue", ABOUT_LINKS.issues);

    const supportSetting = new Setting(containerEl)
      .setName(zh ? "支持开发" : "Support development")
      .setDesc(ABOUT_LINKS.support
        ? (zh ? "如果这个插件对你有帮助，可以支持后续开发。" : "Support continued development if the plugin is useful to you.")
        : (zh ? "已预留 Buy Me a Coffee 入口；创建正式支持页面后即可在此启用。" : "A Buy Me a Coffee entry is reserved and will appear after an official support page is configured."));
    if (ABOUT_LINKS.support) {
      this.addAboutLink(supportSetting, "Buy Me a Coffee", ABOUT_LINKS.support);
    }
  }

  private addAboutLink(setting: Setting, label: string, url: string): void {
    const link = setting.controlEl.createEl("a", {
      cls: "towrite-about-action",
      text: label
    });
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }

  private renderAiSettings(containerEl: HTMLElement, copy: SettingCopy): void {
    new Setting(containerEl)
      .setName(copy.ai)
      .setDesc(copy.aiDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.ai.enabled)
          .onChange(async (value) => {
            this.plugin.settings.ai.enabled = value;
            await this.plugin.savePluginData();
            this.refreshSettingsUi();
          });
      });

    if (this.plugin.settings.ai.enabled) {
      new Setting(containerEl)
        .setName(copy.aiProviderPreset)
        .setDesc(copy.aiProviderPresetDesc)
        .addDropdown((dropdown) => {
          for (const preset of AI_PROVIDER_PRESETS) {
            dropdown.addOption(preset.id, preset.label);
          }
          dropdown
            .setValue(findSelectedAiPreset(this.plugin.settings))
            .onChange(async (value) => {
              const preset = AI_PROVIDER_PRESETS.find((item) => item.id === value);
              if (!preset || preset.id === "custom") {
                return;
              }
              this.plugin.settings.ai.baseUrl = preset.baseUrl;
              this.plugin.settings.ai.model = preset.model;
              await this.plugin.savePluginData();
              this.refreshSettingsUi();
            });
        });

      new Setting(containerEl)
        .setName(copy.aiBaseUrl)
        .setDesc(copy.aiBaseUrlDesc)
        .addText((text) => {
          text
            .setValue(this.plugin.settings.ai.baseUrl)
            .setPlaceholder("https://api.openai.com/v1")
            .onChange(async (value) => {
              this.plugin.settings.ai.baseUrl = value.trim();
              this.resetAiDiagnostics();
              await this.plugin.savePluginData();
            });
        })
        .addButton((button) => {
          button
            .setIcon("copy")
            .setTooltip(copy.copy)
            .onClick(() => {
              void copyToClipboard(this.plugin.settings.ai.baseUrl, copy.copied);
            });
        });

      let aiApiKeyInput: HTMLInputElement | undefined;
      new Setting(containerEl)
        .setName(copy.aiApiKey)
        .setDesc(copy.aiApiKeyDesc)
        .addText((text) => {
          aiApiKeyInput = text.inputEl;
          text
            .setValue(this.plugin.settings.ai.apiKey)
            .setPlaceholder("sk-...")
            .onChange(async (value) => {
              this.plugin.settings.ai.apiKey = value.trim();
              this.resetAiDiagnostics();
              await this.plugin.savePluginData();
            });
          text.inputEl.type = this.aiApiKeyVisible ? "text" : "password";
        })
        .addButton((button) => {
          const updateButton = () => {
            const label = this.plugin.settings.language === "zh"
              ? (this.aiApiKeyVisible ? "隐藏 API Key" : "显示 API Key")
              : (this.aiApiKeyVisible ? "Hide API key" : "Show API key");
            button
              .setIcon(this.aiApiKeyVisible ? "eye-off" : "eye")
              .setTooltip(label);
            button.buttonEl.setAttribute("aria-label", label);
          };
          updateButton();
          button.onClick(() => {
            this.aiApiKeyVisible = !this.aiApiKeyVisible;
            if (aiApiKeyInput) {
              aiApiKeyInput.type = this.aiApiKeyVisible ? "text" : "password";
              aiApiKeyInput.focus();
            }
            updateButton();
          });
        })
        .addButton((button) => {
          button
            .setIcon("copy")
            .setTooltip(copy.copy)
            .onClick(() => {
              void copyToClipboard(this.plugin.settings.ai.apiKey, copy.copied);
            });
        });

      const modelSetting = new Setting(containerEl)
        .setName(copy.aiModel)
        .setDesc(copy.aiModelDesc)
        .addText((text) => {
          text
            .setValue(this.plugin.settings.ai.model)
            .setPlaceholder("gpt-4o-mini")
            .onChange(async (value) => {
              this.plugin.settings.ai.model = value.trim() || "gpt-4o-mini";
              await this.plugin.savePluginData();
            });
        });
      const modelListId = "towrite-ai-model-options";
      const modelInput = modelSetting.controlEl.querySelector("input");
      if (modelInput) {
        modelInput.setAttribute("list", modelListId);
      }
      const modelList = containerEl.createEl("datalist", { attr: { id: modelListId } });
      for (const model of this.aiModels) {
        modelList.createEl("option", { value: model.id, text: model.ownedBy ? `${model.id} — ${model.ownedBy}` : model.id });
      }

      new Setting(containerEl)
        .setName(copy.aiDiagnostics)
        .setDesc(this.aiDiagnosticsStatus || copy.aiDiagnosticsDesc)
        .addButton((button) => {
          button
            .setButtonText(this.aiModelsLoading ? "…" : copy.aiFetchModels)
            .setDisabled(this.aiModelsLoading || this.aiConnectionTesting)
            .onClick(() => {
              void this.refreshAiModels();
            });
        })
        .addButton((button) => {
          button
            .setButtonText(this.aiConnectionTesting ? "…" : copy.aiTestConnection)
            .setCta()
            .setDisabled(this.aiModelsLoading || this.aiConnectionTesting)
            .onClick(() => {
              void this.runAiConnectionTest();
            });
        });

      new Setting(containerEl)
        .setName(copy.aiAssistant)
        .setDesc(copy.aiAssistantDesc)
        .addButton((button) => {
          button
            .setButtonText(copy.aiOpenAssistant)
            .setIcon("bot")
            .onClick(() => {
              this.plugin.openAiAssistant();
            });
        });

      new Setting(containerEl)
        .setName(copy.aiAutoRun)
        .setDesc(copy.aiAutoRunDesc)
        .addToggle((toggle) => {
          toggle
            .setValue(this.plugin.settings.ai.autoRun)
            .onChange(async (value) => {
              this.plugin.settings.ai.autoRun = value;
              await this.plugin.savePluginData();
            });
        });

      new Setting(containerEl)
        .setName(copy.aiAutoLimit)
        .setDesc(copy.aiAutoLimitDesc)
        .addText((text) => {
          text
            .setValue(String(this.plugin.settings.ai.maxAutoRunsPerSession))
            .setPlaceholder("5")
            .onChange(async (value) => {
              this.plugin.settings.ai.maxAutoRunsPerSession = clampInteger(value, 0, 50, 5);
              await this.plugin.savePluginData();
            });
        });

      new Setting(containerEl)
        .setName(copy.aiRerank)
        .setDesc(copy.aiRerankDesc)
        .addToggle((toggle) => {
          toggle
            .setValue(this.plugin.settings.ai.rerankLocalNotes)
            .onChange(async (value) => {
              this.plugin.settings.ai.rerankLocalNotes = value;
              await this.plugin.savePluginData();
            });
        });
    }


  }

  private refreshSettingsUi(): void {
    this.renderSettings(this.containerEl);
  }

  private resetAiDiagnostics(): void {
    this.aiDiagnosticsGeneration += 1;
    this.aiModels = [];
    this.aiDiagnosticsStatus = "";
  }

  private async refreshAiModels(): Promise<void> {
    if (this.aiModelsLoading || this.aiConnectionTesting) {
      return;
    }
    const generation = ++this.aiDiagnosticsGeneration;
    const signature = `${this.plugin.settings.ai.baseUrl}\u0000${this.plugin.settings.ai.apiKey}`;
    this.aiModelsLoading = true;
    this.aiDiagnosticsStatus = this.plugin.settings.language === "zh" ? "正在获取模型…" : "Loading models…";
    this.refreshSettingsUi();
    try {
      const models = await this.plugin.listAiModels();
      const currentSignature = `${this.plugin.settings.ai.baseUrl}\u0000${this.plugin.settings.ai.apiKey}`;
      if (generation !== this.aiDiagnosticsGeneration || signature !== currentSignature) {
        return;
      }
      this.aiModels = models;
      this.aiDiagnosticsStatus = this.plugin.settings.language === "zh"
        ? `已加载 ${models.length} 个模型，可在上方输入框中搜索选择。`
        : `Loaded ${models.length} models. Search and select one in the field above.`;
    } catch (error) {
      if (generation !== this.aiDiagnosticsGeneration) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.aiModels = [];
      this.aiDiagnosticsStatus = this.plugin.settings.language === "zh"
        ? `模型列表不可用：${message}；仍可手动填写模型名。`
        : `Model list unavailable: ${message} You can still enter a model id manually.`;
    } finally {
      if (generation === this.aiDiagnosticsGeneration) {
        this.aiModelsLoading = false;
        this.refreshSettingsUi();
      }
    }
  }

  private async runAiConnectionTest(): Promise<void> {
    if (this.aiModelsLoading || this.aiConnectionTesting) {
      return;
    }
    const generation = ++this.aiDiagnosticsGeneration;
    this.aiConnectionTesting = true;
    this.aiDiagnosticsStatus = this.plugin.settings.language === "zh" ? "正在测试当前模型…" : "Testing the selected model…";
    this.refreshSettingsUi();
    try {
      const result = await this.plugin.testAiConnection();
      if (generation !== this.aiDiagnosticsGeneration) {
        return;
      }
      this.aiDiagnosticsStatus = this.plugin.settings.language === "zh"
        ? `连接成功：${result.model}，${result.latencyMs} ms，回复：${result.reply}`
        : `Connected: ${result.model}, ${result.latencyMs} ms. Reply: ${result.reply}`;
    } catch (error) {
      if (generation !== this.aiDiagnosticsGeneration) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.aiDiagnosticsStatus = this.plugin.settings.language === "zh" ? `连接失败：${message}` : `Connection failed: ${message}`;
    } finally {
      if (generation === this.aiDiagnosticsGeneration) {
        this.aiConnectionTesting = false;
        this.refreshSettingsUi();
      }
    }
  }

  private renderTriggerWordEditor(containerEl: HTMLElement, copy: SettingCopy): void {
    const list = containerEl.createDiv({ cls: "towrite-trigger-list" });
    const words = normalizeTriggerWords(this.plugin.settings.candidateTriggerWords);

    for (const [index, word] of words.entries()) {
      const row = list.createDiv({ cls: "towrite-trigger-row" });
      const input = row.createEl("input", {
        attr: {
          type: "text",
          value: word,
          "aria-label": copy.triggerWords
        }
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          input.blur();
        }
      });
      input.addEventListener("change", () => {
        const parsed = splitTriggerWords(input.value);
        const next = [...words];
        next.splice(index, 1, ...parsed);
        void this.saveTriggerWords(next);
      });

      const remove = createIconButton(row, "trash-2", copy.removeTrigger);
      remove.addEventListener("click", () => {
        const next = [...words];
        next.splice(index, 1);
        void this.saveTriggerWords(next);
      });
    }

    const addRow = containerEl.createDiv({ cls: "towrite-trigger-add" });
    const addInput = addRow.createEl("input", {
      attr: { type: "text", placeholder: copy.addPlaceholder }
    });
    const addButton = addRow.createEl("button", {
      text: copy.addTrigger,
      attr: { type: "button" }
    });

    const addWords = () => {
      const parsed = splitTriggerWords(addInput.value);
      if (parsed.length === 0) {
        addInput.focus();
        return;
      }
      void this.saveTriggerWords([...words, ...parsed]);
    };

    addInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addWords();
      }
    });
    addButton.addEventListener("click", addWords);
  }

  private renderStatusEditor(containerEl: HTMLElement, copy: SettingCopy): void {
    const statuses = normalizeStatusOptions(this.plugin.settings.statusOptions);
    const list = containerEl.createDiv({ cls: "towrite-status-editor" });

    for (const [index, status] of statuses.entries()) {
      const row = list.createDiv({ cls: "towrite-status-row" });
      const idInput = row.createEl("input", {
        attr: { type: "text", value: status.id, placeholder: copy.statusId }
      });
      const labelInput = row.createEl("input", {
        attr: { type: "text", value: status.label, placeholder: copy.statusLabel }
      });
      const remove = createIconButton(row, "trash-2", copy.removeTrigger);

      const saveRow = () => {
        const next = [...statuses];
        next[index] = {
          id: normalizeStatusId(idInput.value),
          label: labelInput.value.trim() || normalizeStatusId(idInput.value)
        };
        void this.saveStatusOptions(next);
      };

      idInput.addEventListener("change", saveRow);
      labelInput.addEventListener("change", saveRow);
      remove.addEventListener("click", () => {
        const next = [...statuses];
        next.splice(index, 1);
        void this.saveStatusOptions(next);
      });
    }

    const addRow = containerEl.createDiv({ cls: "towrite-status-add" });
    const idInput = addRow.createEl("input", {
      attr: { type: "text", placeholder: copy.statusId }
    });
    const labelInput = addRow.createEl("input", {
      attr: { type: "text", placeholder: copy.statusLabel }
    });
    const addButton = addRow.createEl("button", {
      text: copy.addStatus,
      attr: { type: "button" }
    });
    addButton.addEventListener("click", () => {
      const id = normalizeStatusId(idInput.value);
      if (!id) {
        idInput.focus();
        return;
      }
      void this.saveStatusOptions([...statuses, { id, label: labelInput.value.trim() || id }]);
    });
  }

  private renderArticleTypeEditor(containerEl: HTMLElement, copy: SettingCopy): void {
    const types = this.plugin.settings.articleTypes.types;
    const list = containerEl.createDiv({ cls: "towrite-workflow-stage-editor" });

    for (const [index, articleType] of types.entries()) {
      const card = list.createEl("details", { cls: `towrite-workflow-stage-card towrite-color-${articleType.color}` });
      card.open = this.openArticleTypeIds.has(articleType.id);
      card.addEventListener("toggle", () => {
        if (card.open) {
          this.openArticleTypeIds.add(articleType.id);
        } else {
          this.openArticleTypeIds.delete(articleType.id);
        }
      });

      const header = card.createEl("summary", { cls: "towrite-workflow-stage-header" });
      const title = header.createDiv({ cls: "towrite-workflow-stage-title" });
      title.createEl("strong", { text: `${articleType.title || articleType.id} (${articleType.id})` });
      title.createSpan({
        cls: "towrite-workflow-stage-meta",
        text: `${articleType.folderPrefixes.length} folders · ${articleType.tags.length} tags`
      });
      const actions = header.createDiv({ cls: "towrite-workflow-stage-actions" });
      const up = createIconButton(actions, "arrow-up", copy.articleTypeMoveUp);
      const down = createIconButton(actions, "arrow-down", copy.articleTypeMoveDown);
      const remove = createIconButton(actions, "trash-2", copy.articleTypeRemove);
      up.disabled = index === 0;
      down.disabled = index === types.length - 1;
      for (const button of [up, down, remove]) {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
        });
      }

      const body = card.createDiv({ cls: "towrite-workflow-stage-body" });

      up.addEventListener("click", () => {
        const next = [...types];
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
        void this.saveArticleTypes(next, true);
      });
      down.addEventListener("click", () => {
        const next = [...types];
        [next[index], next[index + 1]] = [next[index + 1], next[index]];
        void this.saveArticleTypes(next, true);
      });
      remove.addEventListener("click", () => {
        const next = [...types];
        next.splice(index, 1);
        void this.saveArticleTypes(next, true);
      });

      new Setting(body)
        .setName(copy.articleTypeTitle)
        .addText((text) => {
          text
            .setValue(articleType.title)
            .setPlaceholder(copy.articleTypeTitlePlaceholder)
            .onChange(async (value) => {
              await this.patchArticleType(index, { title: value.trim() });
            });
        });

      new Setting(body)
        .setName(copy.articleTypeId)
        .addText((text) => {
          text
            .setValue(articleType.id)
            .setPlaceholder(copy.articleTypeIdPlaceholder)
            .onChange(async (value) => {
              await this.patchArticleType(index, { id: normalizeStageId(value) }, true);
            });
        });

      this.renderColorSetting(
        body,
        copy.articleTypeColor,
        "",
        articleType.color,
        async (color) => {
          await this.patchArticleType(index, { color }, true);
        }
      );

      new Setting(body)
        .setName(copy.articleTypeFolders)
        .setDesc(copy.articleTypeFoldersDesc)
        .addTextArea((text) => {
          text
            .setValue(articleType.folderPrefixes.join("\n"))
            .setPlaceholder("ByteDance/MindFlow\nTechbench")
            .onChange(async (value) => {
              await this.patchArticleType(index, { folderPrefixes: splitWorkflowList(value) });
            });
          text.inputEl.rows = 3;
        });

      new Setting(body)
        .setName(copy.articleTypeTags)
        .setDesc(copy.articleTypeTagsDesc)
        .addTextArea((text) => {
          text
            .setValue(articleType.tags.map((tag) => `#${tag.replace(/^#/u, "")}`).join("\n"))
            .setPlaceholder("#mindflow\n#project")
            .onChange(async (value) => {
              await this.patchArticleType(index, { tags: splitWorkflowList(value).map((tag) => tag.replace(/^#+/u, "")) });
            });
          text.inputEl.rows = 3;
        });
    }

    const addRow = containerEl.createDiv({ cls: "towrite-workflow-stage-add" });
    const addButton = addRow.createEl("button", {
      text: copy.articleTypeAdd,
      attr: { type: "button" }
    });
    addButton.addEventListener("click", () => {
      const nextId = nextArticleTypeId(types);
      this.openArticleTypeIds.add(nextId);
      void this.saveArticleTypes([
        ...types,
        {
          id: nextId,
          title: `Type ${types.length + 1}`,
          color: "slate",
          folderPrefixes: [],
          tags: []
        }
      ], true);
    });
  }

  private renderWorkflowStageEditor(containerEl: HTMLElement, copy: SettingCopy): void {
    const stages = this.plugin.settings.workflowStages.stages;
    const list = containerEl.createDiv({ cls: "towrite-workflow-stage-editor" });

    for (const [index, stage] of stages.entries()) {
      const coreInboxStage = stage.id === "inbox";
      const card = list.createEl("details", { cls: `towrite-workflow-stage-card towrite-color-${stage.color}` });
      card.open = this.openWorkflowStageIds.has(stage.id);
      card.addEventListener("toggle", () => {
        if (card.open) {
          this.openWorkflowStageIds.add(stage.id);
        } else {
          this.openWorkflowStageIds.delete(stage.id);
        }
      });

      const header = card.createEl("summary", { cls: "towrite-workflow-stage-header" });
      const title = header.createDiv({ cls: "towrite-workflow-stage-title" });
      title.createEl("strong", { text: `${stage.title || stage.id} (${stage.id})` });
      title.createSpan({
        cls: "towrite-workflow-stage-meta",
        text: coreInboxStage
          ? `core · workflow_stage: inbox · limit ${stage.limit}`
          : `${stage.folderPrefixes.length} folders · ${stage.tags.length} tags · limit ${stage.limit}`
      });
      const actions = header.createDiv({ cls: "towrite-workflow-stage-actions" });
      const up = createIconButton(actions, "arrow-up", copy.workflowStageMoveUp);
      const down = createIconButton(actions, "arrow-down", copy.workflowStageMoveDown);
      const remove = createIconButton(actions, "trash-2", copy.workflowStageRemove);
      up.disabled = index === 0;
      down.disabled = index === stages.length - 1;
      remove.disabled = coreInboxStage;
      if (coreInboxStage) {
        remove.title = this.plugin.settings.language === "zh" ? "Inbox 是核心阶段，不能删除" : "Inbox is a core stage and cannot be removed";
      }
      for (const button of [up, down, remove]) {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
        });
      }

      const body = card.createDiv({ cls: "towrite-workflow-stage-body" });

      up.addEventListener("click", () => {
        const next = [...stages];
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
        void this.saveWorkflowStages(next, true);
      });
      down.addEventListener("click", () => {
        const next = [...stages];
        [next[index], next[index + 1]] = [next[index + 1], next[index]];
        void this.saveWorkflowStages(next, true);
      });
      remove.addEventListener("click", () => {
        const next = [...stages];
        next.splice(index, 1);
        void this.saveWorkflowStages(next, true);
      });

      new Setting(body)
        .setName(copy.workflowStageTitle)
        .addText((text) => {
          text
            .setValue(stage.title)
            .setPlaceholder(copy.workflowStageTitlePlaceholder)
            .onChange(async (value) => {
              await this.patchWorkflowStage(index, { title: value.trim() });
            });
        });

      new Setting(body)
        .setName(copy.workflowStageId)
        .addText((text) => {
          text
            .setValue(stage.id)
            .setPlaceholder(copy.workflowStageIdPlaceholder)
            .onChange(async (value) => {
              await this.patchWorkflowStage(index, { id: normalizeStageId(value) });
            });
          text.setDisabled(coreInboxStage);
        });

      new Setting(body)
        .setName(copy.workflowStageDescription)
        .addText((text) => {
          text
            .setValue(stage.description)
            .setPlaceholder(copy.workflowStageDescriptionPlaceholder)
            .onChange(async (value) => {
              await this.patchWorkflowStage(index, { description: value.trim() });
            });
        });

      this.renderColorSetting(
        body,
        copy.workflowStageColor,
        "",
        stage.color,
        async (color) => {
          await this.patchWorkflowStage(index, { color }, true);
        }
      );

      new Setting(body)
        .setName(copy.workflowStageFolders)
        .setDesc(copy.workflowStageFoldersDesc)
        .addTextArea((text) => {
          text
            .setValue(stage.folderPrefixes.join("\n"))
            .setPlaceholder("MindFlow/01-Sparks\nTechbench/02-Processing")
            .onChange(async (value) => {
              await this.patchWorkflowStage(index, { folderPrefixes: splitWorkflowList(value) });
            });
          text.inputEl.rows = 3;
        });

      new Setting(body)
        .setName(copy.workflowStageTags)
        .setDesc(copy.workflowStageTagsDesc)
        .addTextArea((text) => {
          text
            .setValue(stage.tags.map((tag) => `#${tag.replace(/^#/u, "")}`).join("\n"))
            .setPlaceholder("#spark\n#processing")
            .onChange(async (value) => {
              await this.patchWorkflowStage(index, { tags: splitWorkflowList(value).map((tag) => tag.replace(/^#+/u, "")) });
            });
          text.inputEl.rows = 3;
        });

      new Setting(body)
        .setName(copy.workflowStageLimit)
        .addText((text) => {
          text
            .setValue(String(stage.limit))
            .setPlaceholder("20")
            .onChange(async (value) => {
              await this.patchWorkflowStage(index, { limit: clampInteger(value, 1, 200, 20) });
            });
        });

      new Setting(body)
        .setName(copy.workflowStageStaleDays)
        .addText((text) => {
          text
            .setValue(String(stage.staleAfterDays))
            .setPlaceholder("14")
            .onChange(async (value) => {
              await this.patchWorkflowStage(index, { staleAfterDays: clampInteger(value, 0, 3650, 0) });
            });
        });
    }

    const addRow = containerEl.createDiv({ cls: "towrite-workflow-stage-add" });
    const addButton = addRow.createEl("button", {
      text: copy.workflowStageAdd,
      attr: { type: "button" }
    });
    addButton.addEventListener("click", () => {
      const index = stages.length + 1;
      void this.saveWorkflowStages([
        ...stages,
        {
          id: `stage-${index}`,
          title: `Stage ${index}`,
          description: "",
          color: "slate",
          folderPrefixes: [],
          tags: [],
          limit: 20,
          staleAfterDays: 14
        }
      ], true);
      this.openWorkflowStageIds.add(`stage-${index}`);
    });
  }

  private renderColorSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    current: OpenQuestionColor,
    onChange: (color: OpenQuestionColor) => Promise<void>
  ): void {
    const setting = new Setting(containerEl)
      .setName(name)
      .setDesc(desc);
    const swatches = setting.controlEl.createDiv({ cls: "towrite-settings-color-swatches" });

    for (const color of OPEN_QUESTION_COLORS) {
      const active = color === current;
      const label = colorLabel(color, this.plugin.settings.language);
      const button = swatches.createEl("button", {
        cls: `towrite-settings-color-button towrite-color-${color}${active ? " is-active" : ""}`,
        attr: {
          type: "button",
          title: label,
          "aria-label": `${name}: ${label}`,
          "aria-pressed": String(active)
        }
      });
      button.createSpan({ cls: "towrite-settings-color-dot" });
      button.createSpan({ cls: "towrite-settings-color-name", text: label });
      button.addEventListener("click", () => {
        void onChange(color)
          .then(() => this.refreshSettingsUi())
          .catch((error) => {
            console.error("Failed to save ToWrite color setting", error);
            new Notice("Failed to save color setting.");
          });
      });
    }
  }

  private async saveTriggerWords(words: string[]): Promise<void> {
    this.plugin.settings.candidateTriggerWords = normalizeTriggerWords(words);
    await this.plugin.savePluginData();
    await this.plugin.refreshIndex();
    this.refreshSettingsUi();
  }

  private async saveStatusOptions(options: QuestionStatusOption[]): Promise<void> {
    this.plugin.settings.statusOptions = normalizeStatusOptions(options);
    await this.plugin.savePluginData();
    this.refreshSettingsUi();
  }

  private async patchDeviceProfile(index: number, patch: Partial<ToWriteDeviceProfileSettings>, redisplay = false): Promise<void> {
    const profiles = [...normalizeDeviceProfiles(this.plugin.settings.deviceProfiles)];
    const current = profiles[index];
    if (!current) {
      return;
    }
    profiles[index] = { ...current, ...patch };
    await this.saveDeviceProfiles(profiles, redisplay);
  }

  private async removeDeviceProfile(index: number): Promise<void> {
    const profiles = [...normalizeDeviceProfiles(this.plugin.settings.deviceProfiles)];
    const removed = profiles.splice(index, 1)[0];
    if (removed) {
      this.openDeviceProfileIds.delete(removed.id);
    }
    await this.saveDeviceProfiles(profiles, true);
  }

  private async saveDeviceProfiles(profiles: ToWriteDeviceProfileSettings[], redisplay = false): Promise<void> {
    this.plugin.settings.deviceProfiles = normalizeDeviceProfiles(profiles);
    await this.plugin.savePluginData();
    if (redisplay) {
      this.refreshSettingsUi();
    }
  }

  private async savePushSettings(redisplay = false): Promise<void> {
    this.plugin.settings.push = normalizePushSettings(this.plugin.settings.push, this.plugin.settings.quote0);
    await this.plugin.savePluginData();
    if (redisplay) {
      this.refreshSettingsUi();
    }
  }

  private async patchPushTarget(index: number, patch: Partial<PushTargetSettings>, redisplay = false): Promise<void> {
    const targets = [...this.plugin.settings.push.targets];
    const current = targets[index];
    if (!current) {
      return;
    }
    targets[index] = { ...current, ...patch };
    await this.savePushTargets(targets, redisplay);
  }

  private async savePushTargets(targets: PushTargetSettings[], redisplay = false): Promise<void> {
    this.plugin.settings.push.targets = targets;
    await this.savePushSettings(redisplay);
    this.plugin.configureQuote0Sync();
  }

  private async removePushTarget(index: number): Promise<void> {
    const targets = [...this.plugin.settings.push.targets];
    if (targets[index]?.id === "quote0") {
      return;
    }
    targets.splice(index, 1);
    await this.savePushTargets(targets, true);
  }

  private async patchPushHabit(index: number, patch: Partial<PushHabitRule>, redisplay = false): Promise<void> {
    const habits = [...this.plugin.settings.push.habits];
    const current = habits[index];
    if (!current) {
      return;
    }
    habits[index] = { ...current, ...patch };
    await this.savePushHabits(habits, redisplay);
  }

  private async savePushHabits(habits: PushHabitRule[], redisplay = false): Promise<void> {
    this.plugin.settings.push.habits = habits;
    await this.savePushSettings(redisplay);
  }

  private async removePushHabit(index: number): Promise<void> {
    const habits = [...this.plugin.settings.push.habits];
    habits.splice(index, 1);
    await this.savePushHabits(habits, true);
  }

  private async patchWorkflowStage(index: number, patch: Partial<WorkflowStageSettings>, redisplay = false): Promise<void> {
    const stages = [...this.plugin.settings.workflowStages.stages];
    const current = stages[index];
    if (!current) {
      return;
    }
    stages[index] = { ...current, ...patch };
    await this.saveWorkflowStages(stages, redisplay);
  }

  private async patchArticleType(index: number, patch: Partial<ArticleTypeSettings>, redisplay = false): Promise<void> {
    const types = [...this.plugin.settings.articleTypes.types];
    const current = types[index];
    if (!current) {
      return;
    }
    types[index] = { ...current, ...patch };
    await this.saveArticleTypes(types, redisplay);
  }

  private async saveArticleTypes(types: ArticleTypeSettings[], redisplay = false): Promise<void> {
    this.plugin.settings.articleTypes = normalizeArticleTypesSettings({
      ...this.plugin.settings.articleTypes,
      types
    });
    await this.plugin.savePluginData();
    await this.plugin.refreshWorkflowIndex();
    if (redisplay) {
      this.refreshSettingsUi();
    }
  }

  private async saveWorkflowStages(stages: WorkflowStageSettings[], redisplay = false): Promise<void> {
    this.plugin.settings.workflowStages.stages = normalizeWorkflowStages(stages);
    this.plugin.notifyUi();
    await this.plugin.savePluginData();
    await this.plugin.refreshWorkflowIndex();
    if (redisplay) {
      this.refreshSettingsUi();
    }
  }
}

function cloneEchoCardForEditor(card: EchoCard): EchoCard {
  return {
    ...card,
    actions: [...card.actions],
    schedule: card.schedule ? {
      ...card.schedule,
      weekdays: [...card.schedule.weekdays]
    } : undefined
  };
}

function echoCardFingerprint(card: EchoCard): string {
  return JSON.stringify(cloneEchoCardForEditor(card));
}

function echoLayoutFieldLabel(field: string, zh: boolean): string {
  const labels: Record<string, { zh: string; en: string }> = {
    card: { zh: "整张卡", en: "whole card" },
    header: { zh: "标题", en: "header" },
    context: { zh: "上下文", en: "context" },
    content: { zh: "核心内容", en: "core content" },
    whyNow: { zh: "出现原因", en: "why now" },
    sourceLabel: { zh: "来源", en: "source" },
    actions: { zh: "操作", en: "actions" }
  };
  const label = labels[field] ?? { zh: field, en: field };
  return zh ? label.zh : label.en;
}

function isQuote0Device(device: Quote0Device): boolean {
  return device.series === "quote" && device.model === "quote_0";
}

function buildPushFeedUrl(settings: ToWriteSettings, target: PushTargetSettings): string {
  const baseUrl = settings.externalApi.publicBaseUrl || buildLocalExternalApiBaseUrl(settings);
  const params = new URLSearchParams();
  params.set("token", settings.externalApi.token || "TOKEN");
  params.set("targetId", target.id);
  return `${baseUrl}/api/v1/push/feed?${params.toString()}`;
}

function formatButtonMappings(mappings: PushTargetSettings["buttonMappings"]): string {
  return normalizeDeviceButtonMappings(mappings)
    .map((mapping) => `${mapping.button}: ${mapping.action}`)
    .join("\n");
}

function parseButtonMappings(value: string): PushTargetSettings["buttonMappings"] {
  const parsed = value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [button, ...rest] = line.split(/[:=]/u);
      const action = rest.join(":").trim();
      return {
        button: button.trim(),
        action,
        label: `${button.trim()}: ${action}`
      };
    });
  return normalizeDeviceButtonMappings(parsed);
}

function normalizePushEditorId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9_-]/gu, "")
    .slice(0, 80);
}

function normalizePushTargetType(value: string): PushTargetSettings["type"] {
  return value === "quote0" || value === "mobile-app" || value === "webhook" ? value : "local-web";
}

function normalizeTimeInput(value: string): string {
  const text = value.trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/u.test(text) ? text : "";
}

function parseLaneList(value: string): OpenQuestionLane[] {
  return splitWorkflowList(value).filter((lane): lane is OpenQuestionLane => lane === "think" || lane === "write");
}

function nextPushTargetId(targets: PushTargetSettings[]): string {
  const ids = new Set(targets.map((target) => target.id));
  let index = targets.length + 1;
  while (ids.has(`target-${index}`)) {
    index += 1;
  }
  return `target-${index}`;
}

function nextPushHabitId(habits: PushHabitRule[]): string {
  const ids = new Set(habits.map((habit) => habit.id));
  let index = habits.length + 1;
  while (ids.has(`habit-${index}`)) {
    index += 1;
  }
  return `habit-${index}`;
}

function formatQuote0DeviceLabel(device: Quote0Device): string {
  return [
    device.alias || device.id,
    device.location,
    `edition ${device.edition}`,
    device.id
  ].filter(Boolean).join(" · ");
}

function buildQuote0NfcPreviewUrl(settings: ToWriteSettings): string {
  const baseUrl = settings.externalApi.publicBaseUrl.trim().replace(/\/+$/u, "");
  const token = settings.quote0.nfcToken.trim();
  if (!baseUrl || !token) {
    return "";
  }
  const params = new URLSearchParams();
  params.set("token", token);
  return `${baseUrl}/device/input?${params.toString()}`;
}

function formatQuote0LastSync(settings: ToWriteSettings["quote0"]): string {
  if (settings.lastError) {
    return `Error: ${settings.lastError}`;
  }
  if (!settings.lastSyncedAt) {
    return "Not synced yet.";
  }
  return [
    settings.lastSyncedAt,
    settings.lastSyncedQuestionId ? `question ${settings.lastSyncedQuestionId}` : "test card"
  ].join(" · ");
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 400);
}

function applyPreviewTextStyle(el: HTMLElement, style: { fontFamily?: string; fontSize?: number; fontWeight?: number }): void {
  if (style.fontFamily) {
    el.style.fontFamily = `${style.fontFamily}, var(--font-interface)`;
  }
  if (style.fontSize) {
    el.style.fontSize = `${style.fontSize}px`;
  }
  if (style.fontWeight) {
    el.style.fontWeight = String(style.fontWeight);
  }
}

function splitPreviewLines(value: string | undefined): string[] {
  const lines = String(value ?? "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  return lines.length > 0 ? lines : ["No message"];
}

function renderQuote0ImagePreview(device: HTMLElement, payload: Quote0ImagePayload): void {
  device.createEl("img", {
    cls: "towrite-quote0-preview-image",
    attr: {
      src: payload.image,
      alt: "Quote0 dashboard image preview"
    }
  });
}

function renderQuote0CanvasDashboardPreview(device: HTMLElement, payload: Quote0CanvasPayload): void {
  const data = payload.data;
  const isWideLow = canvasDataText(data, "layoutProfile", "") === "wide-low";
  const shellClasses = ["towrite-quote0-canvas-home"];
  if (isWideLow) {
    shellClasses.push("is-wide-low");
  }
  const shell = device.createDiv({ cls: shellClasses.join(" ") });

  const header = shell.createDiv({ cls: "towrite-quote0-canvas-header" });
  const headerRow = header.createDiv({ cls: "towrite-quote0-canvas-header-row" });
  headerRow.createDiv({ cls: "towrite-quote0-canvas-title", text: canvasDataText(data, "title", "小屏首页") });
  headerRow.createDiv({ cls: "towrite-quote0-canvas-subtitle", text: canvasDataText(data, "subtitle", "ToThink / ToWrite / Workflow 总览") });
  header.createDiv({ cls: "towrite-quote0-canvas-summary", text: canvasDataText(data, "summary", "") });
  header.createDiv({ cls: "towrite-quote0-canvas-rule" });

  const metrics = shell.createDiv({ cls: "towrite-quote0-canvas-metrics" });
  if (isWideLow) {
    renderQuote0CanvasMetric(metrics, canvasDataText(data, "open", "0"), "Open");
    renderQuote0CanvasMetric(metrics, canvasDataText(data, "think", "0"), "Think");
    renderQuote0CanvasMetric(metrics, canvasDataText(data, "write", "0"), "Write");
    renderQuote0CanvasMetric(metrics, canvasDataText(data, "articles", "0"), "Art");
    renderQuote0CanvasMetric(metrics, canvasDataText(data, "due", "0"), "Due", true);
  } else {
    renderQuote0CanvasMetric(metrics, canvasDataText(data, "think", "0"), "ToThink");
    renderQuote0CanvasMetric(metrics, canvasDataText(data, "write", "0"), "ToWrite");
    renderQuote0CanvasMetric(metrics, canvasDataText(data, "open", "0"), "未解决");
    renderQuote0CanvasMetric(metrics, canvasDataText(data, "articles", "0"), "有问题文章");
    renderQuote0CanvasMetric(metrics, canvasDataText(data, "due", "0"), "提醒到期", true);
  }

  const workflow = shell.createDiv({ cls: "towrite-quote0-canvas-workflow" });
  workflow.createDiv({ cls: "towrite-quote0-canvas-workflow-title", text: isWideLow ? "Workflow" : "Workflow 状态" });
  const stageGrid = workflow.createDiv({ cls: "towrite-quote0-canvas-stage-grid" });
  const stripeClasses = ["is-raw", "is-sparks", "is-initialize", "is-processing", "is-archive"];
  for (let index = 0; index < 5; index += 1) {
    renderQuote0CanvasStage(stageGrid, canvasDataText(data, `stage${index}`, ""), stripeClasses[index] ?? "");
  }

  shell.createDiv({ cls: "towrite-quote0-canvas-spacer" });

  const footer = shell.createDiv({ cls: "towrite-quote0-canvas-footer" });
  footer.createDiv({ cls: "towrite-quote0-canvas-nav", text: canvasDataText(data, "footerLeft", "新想法") });
  footer.createDiv({ cls: "towrite-quote0-canvas-nav is-arrow", text: "←" });
  footer.createDiv({ cls: "towrite-quote0-canvas-nav is-active", text: canvasDataText(data, "footerCenter", "⌂ 首页") });
  footer.createDiv({ cls: "towrite-quote0-canvas-nav is-arrow", text: "→" });
  footer.createDiv({ cls: "towrite-quote0-canvas-nav", text: canvasDataText(data, "footerRight", "手机输入") });
}

function renderQuote0CanvasMetric(containerEl: HTMLElement, value: string, label: string, isLast = false): void {
  const metric = containerEl.createDiv({ cls: `towrite-quote0-canvas-metric${isLast ? " is-last" : ""}` });
  metric.createDiv({ cls: "towrite-quote0-canvas-metric-value", text: value });
  metric.createDiv({ cls: "towrite-quote0-canvas-metric-label", text: label });
}

function renderQuote0CanvasStage(containerEl: HTMLElement, text: string, stripeClass: string): void {
  const stage = containerEl.createDiv({ cls: "towrite-quote0-canvas-stage" });
  stage.createSpan({ cls: `towrite-quote0-canvas-stage-stripe ${stripeClass}` });
  stage.createSpan({ cls: "towrite-quote0-canvas-stage-text", text });
}

function renderQuote0DashboardPreview(device: HTMLElement, display: PushDisplayCard, payload: Quote0TextPayload): void {
  const topbar = device.createDiv({ cls: "towrite-quote0-preview-topbar" });
  const brand = topbar.createDiv({ cls: "towrite-quote0-preview-brand" });
  brand.createSpan({ cls: "towrite-quote0-preview-brand-mark", text: "TW" });
  brand.createSpan({ text: "ToWrite" });
  topbar.createSpan({ cls: "towrite-quote0-preview-pill", text: "Text API" });

  const stats = [
    { label: "OPEN", value: previewMetricValue(display, payload, ["open"], [/\bOPEN\s+(\d+)/iu, /(\d+)\s+open/iu]) },
    { label: "THINK", value: previewMetricValue(display, payload, ["tothink", "think"], [/\bTHINK\s+(\d+)/iu]) },
    { label: "WRITE", value: previewMetricValue(display, payload, ["towrite", "write"], [/\bWRITE\s+(\d+)/iu]) },
    { label: "ARTICLES", value: previewMetricValue(display, payload, ["articles"], [/\bARTICLES\s+(\d+)/iu]) },
    { label: "DUE", value: previewMetricValue(display, payload, ["due"], [/\bDUE\s+(\d+)/iu, /(\d+)\s+reminders?\s+due/iu]) },
    { label: "STALE", value: previewMetricValue(display, payload, ["stale"], [/\bSTALE\s+(\d+)/iu]) }
  ];

  const grid = device.createDiv({ cls: "towrite-quote0-preview-stat-grid" });
  for (const stat of stats) {
    const item = grid.createDiv({ cls: "towrite-quote0-preview-stat" });
    item.createEl("strong", { text: stat.value });
    item.createSpan({ text: stat.label });
  }

  const footer = device.createDiv({ cls: "towrite-quote0-preview-footer" });
  footer.createSpan({ text: display.kicker || "Dashboard" });
  footer.createSpan({ text: payload.signature || display.footer || "Push ready" });
}

function previewMetricValue(
  display: PushDisplayCard,
  payload: Quote0TextPayload,
  aliases: string[],
  fallbackPatterns: RegExp[]
): string {
  const metrics = new Map(display.metrics.map((metric) => [normalizePreviewMetricLabel(metric.label), String(metric.value)]));
  for (const alias of aliases) {
    const value = metrics.get(normalizePreviewMetricLabel(alias));
    if (value !== undefined) {
      return value;
    }
  }
  const text = [display.primary, ...display.secondaryLines, payload.message].filter(Boolean).join("\n");
  for (const pattern of fallbackPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return "0";
}

function normalizePreviewMetricLabel(value: string): string {
  return value.toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function previewImageSummary(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const prefix = "data:image/png;base64,";
  const base64Length = value.startsWith(prefix) ? value.length - prefix.length : value.length;
  return `PNG base64 (${base64Length} chars)`;
}

function canvasDataText(data: Record<string, unknown>, key: string, fallback: string): string {
  const value = data[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function canvasDataNumber(data: Record<string, unknown>, key: string): number | undefined {
  const value = data[key];
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function addPreviewField(containerEl: HTMLElement, label: string, value: string | undefined): void {
  if (!value) {
    return;
  }
  const row = containerEl.createDiv({ cls: "towrite-quote0-preview-field" });
  row.createSpan({ cls: "towrite-quote0-preview-field-label", text: label });
  row.createSpan({ cls: "towrite-quote0-preview-field-value", text: value });
}

function shortId(value: string): string {
  const compact = value.trim();
  return compact.length <= 16 ? compact : `...${compact.slice(-12)}`;
}

function redactSensitiveText(value: string | undefined): string | undefined {
  return value
    ?.replace(/([?&]token=)[^&]+/gu, "$1[redacted]")
    .replace(/\bq0_[A-Za-z0-9_]+/gu, "q0_[redacted]")
    .replace(/\btw_[A-Za-z0-9_]+/gu, "tw_[redacted]");
}

function buildExternalApiExampleUrl(settings: ToWriteSettings): string {
  return buildExternalApiUrl(settings, "/api/v1/deck");
}

function buildExternalApiDashboardUrl(settings: ToWriteSettings): string {
  return buildExternalApiUrl(settings, "/dashboard");
}

function buildExternalApiDeviceUrl(settings: ToWriteSettings): string {
  return buildExternalApiUrl(settings, "/device");
}

function buildDeviceFeedProfileUrl(settings: ToWriteSettings, profile: ToWriteDeviceProfileSettings): string {
  const baseUrl = settings.externalApi.publicBaseUrl || buildLocalExternalApiBaseUrl(settings);
  const params = new URLSearchParams();
  params.set("token", settings.externalApi.token || "TOKEN");
  params.set("profile", profile.profile);
  params.set("width", String(profile.width));
  params.set("height", String(profile.height));
  params.set("inches", String(profile.inches));
  params.set("page", profile.defaultPage);
  if (profile.defaultLane) {
    params.set("lane", profile.defaultLane);
  }
  return baseUrl + "/api/v1/device-feed?" + params.toString();
}

function buildExternalApiUrl(settings: ToWriteSettings, path: string): string {
  const baseUrl = settings.externalApi.publicBaseUrl || buildLocalExternalApiBaseUrl(settings);
  const token = settings.externalApi.token || "TOKEN";
  return `${baseUrl}${path}?token=${encodeURIComponent(token)}`;
}

function buildLocalExternalApiBaseUrl(settings: ToWriteSettings): string {
  const host = settings.externalApi.bindHost === "0.0.0.0" ? "127.0.0.1" : settings.externalApi.bindHost;
  return `http://${host}:${settings.externalApi.port}`;
}

function findSelectedAiPreset(settings: ToWriteSettings): string {
  const baseUrl = settings.ai.baseUrl.trim().replace(/\/+$/u, "");
  const model = settings.ai.model.trim();
  const preset = AI_PROVIDER_PRESETS.find(
    (item) => item.id !== "custom" && item.baseUrl.replace(/\/+$/u, "") === baseUrl && item.model === model
  );
  return preset?.id ?? "custom";
}

function createIconButton(parent: HTMLElement, icon: string, label: string): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "towrite-icon-button",
    attr: {
      type: "button",
      title: label,
      "aria-label": label
    }
  });
  setIcon(button, icon);
  return button;
}

async function copyToClipboard(value: string, copiedMessage: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    new Notice("Clipboard API is not available in this Obsidian window.");
    return;
  }
  await navigator.clipboard.writeText(value);
  new Notice(copiedMessage);
}

function splitTriggerWords(value: string): string[] {
  return value
    .replace(/\r\n?/gu, "\n")
    .split(/[,;\n|\uFF0C\u3001\uFF1B]+/u)
    .map((word) => word.trim())
    .filter(Boolean);
}

function formatReminderPresets(presets: ToWriteReminderPreset[]): string {
  return normalizeReminderPresets(presets)
    .map((preset) => `${preset.label} = ${preset.value}`)
    .join("\n");
}

function parseReminderPresets(value: string): ToWriteReminderPreset[] {
  const presets: ToWriteReminderPreset[] = [];

  for (const line of value.replace(/\r\n?/gu, "\n").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const [labelPart, ...valueParts] = trimmed.split("=");
    const label = labelPart.trim();
    const rule = valueParts.join("=").trim() || label;
    if (label && rule) {
      presets.push({ label, value: rule });
    }
  }

  return normalizeReminderPresets(presets);
}

function normalizeTriggerWords(words: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const word of words.flatMap(splitTriggerWords)) {
    if (seen.has(word)) {
      continue;
    }
    seen.add(word);
    output.push(word);
  }

  return output;
}

function normalizeStatusOptions(options: QuestionStatusOption[]): QuestionStatusOption[] {
  const seen = new Set<string>();
  const output: QuestionStatusOption[] = [];

  for (const option of [...DEFAULT_STATUS_OPTIONS, ...options]) {
    const id = normalizeStatusId(option.id);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    output.push({
      id,
      label: option.label.trim() || id
    });
  }

  return output;
}

function normalizeStatusId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9_-]/gu, "");
}

function nextDeviceProfileId(profiles: ToWriteDeviceProfileSettings[]): string {
  const ids = new Set(profiles.map((profile) => profile.id));
  let index = profiles.length + 1;
  while (ids.has("device-" + index)) {
    index += 1;
  }
  return "device-" + index;
}

function nextArticleTypeId(types: ArticleTypeSettings[]): string {
  const ids = new Set(types.map((type) => type.id));
  let index = types.length + 1;
  while (ids.has("type-" + index)) {
    index += 1;
  }
  return "type-" + index;
}

function normalizeDeviceProfileId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9_-]/gu, "");
}

function normalizeStageId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9_-]/gu, "");
}

function normalizeWorkflowStages(stages: WorkflowStageSettings[]): WorkflowStageSettings[] {
  const seen = new Set<string>();
  const output: WorkflowStageSettings[] = [];

  for (const stage of stages) {
    const id = normalizeStageId(stage.id);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    output.push({
      id,
      title: stage.title.trim() || id,
      description: stage.description.trim(),
      color: isQuestionColor(stage.color) ? stage.color : "slate",
      folderPrefixes: splitWorkflowList(stage.folderPrefixes.join("\n")),
      tags: splitWorkflowList(stage.tags.join("\n")).map((tag) => tag.replace(/^#+/u, "").toLowerCase()),
      limit: Math.max(1, Math.min(200, Math.floor(Number(stage.limit) || 20))),
      staleAfterDays: Math.max(0, Math.min(3650, Math.floor(Number(stage.staleAfterDays) || 0)))
    });
  }

  return ensureInboxWorkflowStage(output);
}

function splitWorkflowList(value: string): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of value.replace(/\r\n?/gu, "\n").split(/[,;\n|\uFF0C\u3001\uFF1B]+/u)) {
    const normalized = item.trim().replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function normalizeMarkdownPath(value: string): string {
  const normalized = value.trim().replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
  if (!normalized) {
    return "00-Raw/Device Inbox.md";
  }
  return normalized.toLowerCase().endsWith(".md") ? normalized : `${normalized}.md`;
}

function normalizeTagList(value: string): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of value.replace(/\r\n?/gu, "\n").split(/[,;\n|\uFF0C\u3001\uFF1B]+/u)) {
    const tag = item.replace(/^#+/u, "").trim().toLowerCase().replace(/\s+/gu, "-");
    if (!tag || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    output.push(tag);
  }
  return output;
}

function isQuestionColor(value: unknown): value is OpenQuestionColor {
  return value === "amber"
    || value === "mint"
    || value === "sky"
    || value === "rose"
    || value === "violet"
    || value === "slate";
}

function colorLabel(color: OpenQuestionColor, language: ToWriteLanguage): string {
  if (language === "zh") {
    const labels: Record<OpenQuestionColor, string> = {
      amber: "琥珀 amber",
      mint: "薄荷 mint",
      sky: "天蓝 sky",
      rose: "玫瑰 rose",
      violet: "紫罗兰 violet",
      slate: "石板 slate"
    };
    return labels[color];
  }
  return color;
}

function clampNumber(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function clampInteger(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}
