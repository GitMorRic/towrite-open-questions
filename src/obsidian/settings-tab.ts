import { App, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import {
  DEFAULT_STATUS_OPTIONS,
  DEFAULT_REMINDER_PRESETS,
  DEFAULT_WORKFLOW_STAGES,
  normalizeExternalApiBindHost,
  normalizeExternalApiPublicBaseUrl,
  normalizeReminderPresets,
  type ToWriteLanguage,
  type ToWriteReminderPreset,
  type ToWriteSettings,
  type WorkflowStageSettings
} from "../core/settings";
import { OPEN_QUESTION_COLORS, type OpenQuestionColor, type QuestionStatusOption } from "../core/types";
import type ToWritePlugin from "../main";

type SettingCopy = {
  title: string;
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
  deviceCapture: string;
  deviceCaptureDesc: string;
  deviceCaptureInbox: string;
  deviceCaptureInboxDesc: string;
  deviceCaptureFolders: string;
  deviceCaptureFoldersDesc: string;
  deviceCaptureTags: string;
  deviceCaptureTagsDesc: string;
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
  zh: {
    title: "\u0054\u006f\u0057\u0072\u0069\u0074\u0065\uff1a\u672a\u95ed\u5408\u95ee\u9898",
    language: "\u8bed\u8a00",
    languageDesc: "\u8bbe\u7f6e\u63d2\u4ef6\u754c\u9762\u7684\u663e\u793a\u8bed\u8a00\u3002\u9ed8\u8ba4\u4f7f\u7528\u4e2d\u6587\u3002",
    chinese: "\u4e2d\u6587",
    english: "\u82f1\u6587",
    exportDirectory: "\u5bfc\u51fa\u76ee\u5f55",
    exportDirectoryDesc: "\u76f8\u5bf9\u4e8e vault \u6839\u76ee\u5f55\u7684 JSON \u5bfc\u51fa\u6587\u4ef6\u5939\u3002",
    autoExport: "\u81ea\u52a8\u5bfc\u51fa JSON",
    autoExportDesc: "\u7d22\u5f15\u5237\u65b0\u6216\u72b6\u6001\u53d8\u5316\u540e\uff0c\u81ea\u52a8\u5199\u5165 index.json\u3001articles.json \u548c eink-compact.json\u3002",
    autoOpenSidebar: "启动时自动打开侧栏",
    autoOpenSidebarDesc: "Obsidian 布局加载完成后，自动在右侧展开 ToWrite 面板，避免第一次启用插件时找不到入口。",
    groupCurrentByHeading: "当前笔记按标题分组",
    groupCurrentByHeadingDesc: "关闭时，同一篇文章里的批注按位置直接列出；开启后才按 Markdown 标题分组。",
    candidateDetection: "\u89e6\u53d1\u8bcd\u5efa\u8bae",
    candidateDetectionDesc: "\u53ea\u5728\u6b63\u6587\u4e2d\u9ad8\u4eae\u5e76\u663e\u793a\u52a0\u53f7\uff0c\u4e0d\u4f1a\u81ea\u52a8\u52a0\u5165\u53f3\u4fa7\u5217\u8868\u3002",
    editorDecorations: "\u7f16\u8f91\u5668\u6807\u8bb0",
    editorDecorationsDesc: "\u5728\u7f16\u8f91\u5668\u4e2d\u6807\u8bb0\u6b63\u5f0f\u95ee\u9898\u548c\u53ef\u6dfb\u52a0\u5efa\u8bae\u3002\u4fee\u6539\u540e\u5efa\u8bae\u91cd\u8f7d Obsidian\u3002",
    compactEditorDecorations: "弱化编辑器标记",
    compactEditorDecorationsDesc: "开启后，正文里只显示左侧竖线，不再铺满整行底色。关闭时恢复整行浅色高亮。",
    triggerWords: "\u89e6\u53d1\u8bcd",
    triggerWordsDesc: "\u6bcf\u4e2a\u89e6\u53d1\u8bcd\u4e00\u4e2a\u8f93\u5165\u6846\u3002\u7c98\u8d34\u591a\u4e2a\u8bcd\u65f6\u652f\u6301\u9017\u53f7\u3001\u4e2d\u6587\u9017\u53f7\u3001\u5206\u53f7\u3001\u987f\u53f7\u6216\u6362\u884c\u81ea\u52a8\u62c6\u5206\u3002",
    addPlaceholder: "\u65b0\u589e\u89e6\u53d1\u8bcd",
    addTrigger: "\u6dfb\u52a0\u89e6\u53d1\u8bcd",
    removeTrigger: "\u5220\u9664",
    statuses: "\u95ee\u9898\u72b6\u6001",
    statusesDesc: "\u53f3\u952e\u5361\u7247\u72b6\u6001\u6807\u7b7e\u65f6\u4f1a\u663e\u793a\u8fd9\u4e9b\u72b6\u6001\u3002id \u5efa\u8bae\u4f7f\u7528\u82f1\u6587\u5c0f\u5199\uff0c\u663e\u793a\u540d\u53ef\u4ee5\u81ea\u5b9a\u4e49\u3002",
    reminderPresets: "提醒快捷设置",
    reminderPresetsDesc: "一行一个快捷项，格式：显示名 = 规则。规则支持 15m、1h、3h、today 18:00、tomorrow 09:00、nextWeek 09:00。",
    defaultThinkColor: "ToThink \u9ed8\u8ba4\u989c\u8272",
    defaultThinkColorDesc: "\u6ca1\u6709\u5728\u9009\u533a\u5de5\u5177\u6761\u624b\u52a8\u9009\u8272\u65f6\uff0cToThink \u5361\u7247\u4f7f\u7528\u7684\u989c\u8272\u3002",
    defaultWriteColor: "ToWrite \u9ed8\u8ba4\u989c\u8272",
    defaultWriteColorDesc: "\u6ca1\u6709\u5728\u9009\u533a\u5de5\u5177\u6761\u624b\u52a8\u9009\u8272\u65f6\uff0cToWrite \u5361\u7247\u4f7f\u7528\u7684\u989c\u8272\u3002",
    externalApi: "外部 API",
    externalApiDesc: "桌面端本地 HTTP API，可用于 JSON、RSS、SSE 实时刷新，以及状态和笔记写回。",
    externalApiBindHost: "API 监听地址",
    externalApiBindHostDesc: "只在本机使用填 127.0.0.1；局域网或隧道访问填 0.0.0.0。",
    externalApiPort: "API 端口",
    externalApiPortDesc: "本地 HTTP API 使用的端口。",
    externalApiToken: "API token",
    externalApiTokenDesc: "私有 API 都需要 token。开启下面的选项后，GET 请求也可以用 ?token=。",
    externalApiQueryToken: "允许 GET 查询参数 token",
    externalApiQueryTokenDesc: "适合 ESP32、RSS 阅读器、桌面小组件等不能发送 Authorization header 的客户端。",
    externalApiPublicBaseUrl: "手机/远程访问基地址",
    externalApiPublicBaseUrlDesc: "填手机实际访问的地址，例如 http://100.x.y.z:48321 或 http://192.168.1.20:48321。留空时使用本机示例地址。",
    externalApiEndpoint: "API 访问地址",
    externalApiEndpointDesc: "本机示例地址。局域网访问时，把 127.0.0.1 换成这台电脑的局域网 IP。",
    externalApiDashboard: "Dashboard 页面",
    externalApiDashboardDesc: "在浏览器里查看解析后的待解决问题、文章统计和原始 JSON。",
    externalApiDevice: "手机小屏页面",
    externalApiDeviceDesc: "复制到手机浏览器，用来模拟墨水屏/小屏设备。",
    deviceCapture: "手机输入写回",
    deviceCaptureDesc: "允许 /device/input companion 页面把回答追加到卡片，或把独立想法写入指定 Inbox/文件夹。",
    deviceCaptureInbox: "默认 Inbox 文件",
    deviceCaptureInboxDesc: "没有选择具体目标时，新想法会追加到这个 Markdown 文件。",
    deviceCaptureFolders: "可选目标文件夹",
    deviceCaptureFoldersDesc: "一行一个 vault 内文件夹。手机输入页会把它们显示为保存位置。",
    deviceCaptureTags: "默认 tags",
    deviceCaptureTagsDesc: "手机输入页保存的新想法默认带上的标签；可用逗号、顿号或换行分隔。",
    regenerateToken: "重新生成 token",
    workflowStages: "Workflow Stages",
    workflowStagesDesc: "按文件夹、frontmatter tags 或正文 #tag，把 Markdown 文件分组为 Raw、Sparks、Processing 等自定义状态，并通过 workflows.json 和 API 暴露。",
    workflowStageTitle: "显示标题",
    workflowStageTitlePlaceholder: "例如 Sparks",
    workflowStageId: "Stage id",
    workflowStageIdPlaceholder: "例如 sparks",
    workflowStageDescription: "描述",
    workflowStageDescriptionPlaceholder: "这组文件表示什么状态",
    workflowStageColor: "颜色",
    workflowStageFolders: "文件夹前缀",
    workflowStageFoldersDesc: "一行一个路径前缀，例如 MindFlow/01-Sparks 或 Techbench/02-Processing。",
    workflowStageTags: "匹配标签",
    workflowStageTagsDesc: "一行一个 tag，会同时匹配 frontmatter tags 和正文 #tag，可写 spark 或 #spark。",
    workflowStageLimit: "每组数量",
    workflowStageStaleDays: "过期天数",
    workflowStageAdd: "添加 stage",
    workflowStageRemove: "删除 stage",
    workflowStageMoveUp: "上移",
    workflowStageMoveDown: "下移",
    statusId: "\u72b6\u6001 id",
    statusLabel: "\u663e\u793a\u540d",
    addStatus: "\u6dfb\u52a0\u72b6\u6001",
    ai: "AI \u529f\u80fd",
    aiDesc: "\u9ed8\u8ba4\u5173\u95ed\u3002\u542f\u7528\u540e ToWrite \u4f1a\u4f7f\u7528\u4f60\u914d\u7f6e\u7684 OpenAI-compatible \u63a5\u53e3\uff0c\u53ea\u505a\u672c\u5730\u7b14\u8bb0\u6458\u8981\u548c\u63a8\u8350\uff0c\u4e0d\u505a\u8054\u7f51\u641c\u7d22\u3002",
    aiProviderPreset: "AI 接入预设",
    aiProviderPresetDesc: "选择后会填入兼容 OpenAI 的 Base URL 和建议模型；API Key 仍需自己填写。",
    aiBaseUrl: "AI Base URL",
    aiBaseUrlDesc: "\u517c\u5bb9 OpenAI \u98ce\u683c\u63a5\u53e3\u7684\u57fa\u7840\u5730\u5740\uff0c\u4f8b\u5982 https://api.openai.com/v1 \u6216\u81ea\u6258\u7ba1\u7f51\u5173\u3002",
    aiApiKey: "AI API Key",
    aiApiKeyDesc: "\u4fdd\u5b58\u5728\u672c\u5730\u63d2\u4ef6\u6570\u636e\u4e2d\u3002\u672a\u542f\u7528 AI \u65f6\u4e0d\u4f1a\u53d1\u9001\u8bf7\u6c42\u3002",
    aiModel: "AI \u6a21\u578b",
    aiModelDesc: "\u7528\u4e8e\u6458\u8981\u548c\u672c\u5730\u7b14\u8bb0\u91cd\u6392\u5e8f\u7684\u6a21\u578b\u540d\u3002",
    aiAutoRun: "\u81ea\u52a8\u540e\u53f0\u751f\u6210",
    aiAutoRunDesc: "\u5f00\u542f\u540e\u81ea\u52a8\u5904\u7406\u7f3a\u5931\u6216\u8fc7\u671f\u7684\u6b63\u5f0f\u95ee\u9898\uff0c\u4e0d\u5904\u7406\u89e6\u53d1\u8bcd\u5efa\u8bae\u3002",
    aiAutoLimit: "\u6bcf\u6b21\u4f1a\u8bdd\u81ea\u52a8\u4e0a\u9650",
    aiAutoLimitDesc: "\u9650\u5236\u6bcf\u6b21\u542f\u52a8 Obsidian \u540e\u81ea\u52a8\u8c03\u7528 AI \u7684\u95ee\u9898\u6570\u91cf\u3002",
    aiRerank: "AI \u91cd\u6392\u5e8f\u672c\u5730\u7b14\u8bb0",
    aiRerankDesc: "\u5f00\u542f\u540e\u5148\u7528\u672c\u5730\u7d22\u5f15\u53ec\u56de\u5019\u9009\u7b14\u8bb0\uff0c\u518d\u4ea4\u7ed9 AI \u9009\u62e9\u6700\u76f8\u5173\u7684\u7ed3\u679c\u3002",
    writeArticleProperties: "\u5199\u5165\u6587\u7ae0\u5c5e\u6027",
    writeArticlePropertiesDesc: "\u53ef\u9009\uff1a\u5bfc\u51fa\u65f6\u5199\u5165 open_questions\u3001candidate_questions \u548c question_status \u5230\u7b14\u8bb0\u5c5e\u6027\u3002",
    copy: "复制",
    copied: "已复制"
  },
  en: {
    title: "ToWrite Open Questions",
    language: "Language",
    languageDesc: "Choose the plugin display language. Chinese is the default.",
    chinese: "Chinese",
    english: "English",
    exportDirectory: "Export directory",
    exportDirectoryDesc: "Vault-relative folder used for JSON exports.",
    autoExport: "Auto export JSON",
    autoExportDesc: "Write index.json, articles.json, and eink-compact.json after refreshes and status changes.",
    autoOpenSidebar: "Open sidebar on startup",
    autoOpenSidebarDesc: "After the Obsidian layout is ready, automatically reveal the ToWrite sidebar on the right.",
    groupCurrentByHeading: "Group current note by heading",
    groupCurrentByHeadingDesc: "Off by default. When enabled, cards in the current note are grouped by Markdown headings.",
    candidateDetection: "Trigger suggestions",
    candidateDetectionDesc: "Highlight matching lines with an add button; do not auto-create sidebar cards.",
    editorDecorations: "Editor decorations",
    editorDecorationsDesc: "Mark saved questions and addable suggestions in the editor. Reload Obsidian after changing this.",
    compactEditorDecorations: "Compact editor decorations",
    compactEditorDecorationsDesc: "Show only the left marker line instead of a full-row background highlight.",
    triggerWords: "Trigger words",
    triggerWordsDesc: "One editable box per word. Pasted lists are split by commas, Chinese commas, semicolons, ideographic commas, or new lines.",
    addPlaceholder: "New trigger word",
    addTrigger: "Add trigger word",
    removeTrigger: "Remove",
    statuses: "Question statuses",
    statusesDesc: "These statuses appear when right-clicking a status chip. Use stable lowercase ids; labels are display text.",
    reminderPresets: "Reminder quick presets",
    reminderPresetsDesc: "One preset per line: label = rule. Rules support 15m, 1h, 3h, today 18:00, tomorrow 09:00, nextWeek 09:00.",
    defaultThinkColor: "Default ToThink color",
    defaultThinkColorDesc: "Color used for ToThink cards when the selection toolbar color is not overridden.",
    defaultWriteColor: "Default ToWrite color",
    defaultWriteColorDesc: "Color used for ToWrite cards when the selection toolbar color is not overridden.",
    externalApi: "External API",
    externalApiDesc: "Desktop-only local HTTP API for JSON, RSS, SSE, and status/note writeback.",
    externalApiBindHost: "API bind host",
    externalApiBindHostDesc: "Use 127.0.0.1 for local-only access, or 0.0.0.0 for LAN/tunnel access.",
    externalApiPort: "API port",
    externalApiPortDesc: "Port used by the local HTTP API.",
    externalApiToken: "API token",
    externalApiTokenDesc: "Required for all private API routes. GET routes may also use ?token= when enabled below.",
    externalApiQueryToken: "Allow GET query token",
    externalApiQueryTokenDesc: "Useful for ESP32, RSS readers, and simple widgets that cannot send Authorization headers.",
    externalApiPublicBaseUrl: "Phone / remote base URL",
    externalApiPublicBaseUrlDesc: "The address your phone can actually reach, such as http://100.x.y.z:48321 or http://192.168.1.20:48321. Leave blank for a local example.",
    externalApiEndpoint: "API endpoint",
    externalApiEndpointDesc: "Local example URL. For LAN access, replace 127.0.0.1 with this computer's LAN IP.",
    externalApiDashboard: "Dashboard page",
    externalApiDashboardDesc: "Open a browser UI for unresolved questions, article summaries, and raw JSON.",
    externalApiDevice: "Phone device page",
    externalApiDeviceDesc: "Copy this to your phone browser to simulate an eink or small-screen device.",
    deviceCapture: "Phone input writeback",
    deviceCaptureDesc: "Allow the /device/input companion page to answer cards or save standalone ideas into an Inbox or folder.",
    deviceCaptureInbox: "Default Inbox file",
    deviceCaptureInboxDesc: "Standalone ideas are appended to this Markdown file when no specific target is selected.",
    deviceCaptureFolders: "Target folders",
    deviceCaptureFoldersDesc: "One vault folder per line. The phone input page exposes these as save targets.",
    deviceCaptureTags: "Default tags",
    deviceCaptureTagsDesc: "Tags added to new device captures by default. Split with commas or new lines.",
    regenerateToken: "Regenerate token",
    workflowStages: "Workflow Stages",
    workflowStagesDesc: "Group Markdown files by folder prefixes, frontmatter tags, or inline #tags, then expose the stages through workflows.json and the API.",
    workflowStageTitle: "Display title",
    workflowStageTitlePlaceholder: "For example, Sparks",
    workflowStageId: "Stage id",
    workflowStageIdPlaceholder: "For example, sparks",
    workflowStageDescription: "Description",
    workflowStageDescriptionPlaceholder: "What this file state means",
    workflowStageColor: "Color",
    workflowStageFolders: "Folder prefixes",
    workflowStageFoldersDesc: "One vault-relative prefix per line, such as MindFlow/01-Sparks or Techbench/02-Processing.",
    workflowStageTags: "Tags",
    workflowStageTagsDesc: "One tag per line. Matches frontmatter tags and inline #tags; both spark and #spark work.",
    workflowStageLimit: "Limit per stage",
    workflowStageStaleDays: "Stale after days",
    workflowStageAdd: "Add stage",
    workflowStageRemove: "Remove stage",
    workflowStageMoveUp: "Move up",
    workflowStageMoveDown: "Move down",
    statusId: "Status id",
    statusLabel: "Label",
    addStatus: "Add status",
    ai: "AI features",
    aiDesc: "Off by default. When enabled, ToWrite uses your OpenAI-compatible endpoint for local-note summaries and recommendations only. It does not perform web search.",
    aiProviderPreset: "AI provider preset",
    aiProviderPresetDesc: "Applies an OpenAI-compatible Base URL and suggested model. You still provide the API key.",
    aiBaseUrl: "AI Base URL",
    aiBaseUrlDesc: "Base URL for an OpenAI-compatible API, such as https://api.openai.com/v1 or a self-hosted gateway.",
    aiApiKey: "AI API Key",
    aiApiKeyDesc: "Stored in local plugin data. No requests are sent while AI is disabled.",
    aiModel: "AI model",
    aiModelDesc: "Model used for summaries and local-note reranking.",
    aiAutoRun: "Auto-generate in background",
    aiAutoRunDesc: "When enabled, process missing or stale saved questions automatically. Trigger suggestions are ignored.",
    aiAutoLimit: "Auto limit per session",
    aiAutoLimitDesc: "Maximum number of automatic AI calls after each Obsidian launch.",
    aiRerank: "AI reranks local notes",
    aiRerankDesc: "Recall candidate notes locally, then let AI pick the most relevant ones.",
    writeArticleProperties: "Write article properties",
    writeArticlePropertiesDesc: "Optional: write open_questions, candidate_questions, and question_status into note frontmatter on export.",
    copy: "Copy",
    copied: "Copied"
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
  private readonly openWorkflowStageIds = new Set<string>();

  constructor(app: App, private readonly plugin: ToWritePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const copy = COPY[this.plugin.settings.language ?? "zh"];
    containerEl.empty();
    containerEl.addClass("towrite-settings");
    new Setting(containerEl).setName(copy.title).setHeading();

    new Setting(containerEl)
      .setName(copy.language)
      .setDesc(copy.languageDesc)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("zh", copy.chinese)
          .addOption("en", copy.english)
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value as ToWriteLanguage;
            await this.plugin.savePluginData();
            this.display();
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
      .setName(copy.externalApi)
      .setDesc(copy.externalApiDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.externalApi.enabled)
          .onChange(async (value) => {
            this.plugin.settings.externalApi.enabled = value;
            await this.plugin.savePluginData();
            await this.plugin.configureExternalApiServer();
            this.display();
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
            this.display();
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
              this.display();
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

    new Setting(containerEl)
      .setName(copy.deviceCapture)
      .setDesc(copy.deviceCaptureDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.deviceCapture.enabled)
          .onChange(async (value) => {
            this.plugin.settings.deviceCapture.enabled = value;
            await this.plugin.savePluginData();
            this.display();
          });
      });

    if (this.plugin.settings.deviceCapture.enabled) {
      new Setting(containerEl)
        .setName(copy.deviceCaptureInbox)
        .setDesc(copy.deviceCaptureInboxDesc)
        .addText((text) => {
          text
            .setValue(this.plugin.settings.deviceCapture.inboxFile)
            .setPlaceholder("00-Raw/Device Inbox.md")
            .onChange(async (value) => {
              this.plugin.settings.deviceCapture.inboxFile = normalizeMarkdownPath(value);
              await this.plugin.savePluginData();
            });
        });

      new Setting(containerEl)
        .setName(copy.deviceCaptureFolders)
        .setDesc(copy.deviceCaptureFoldersDesc)
        .addTextArea((text) => {
          text
            .setValue(this.plugin.settings.deviceCapture.targetFolders.join("\n"))
            .setPlaceholder("00-Raw\n01-Sparks\n02-Processing")
            .onChange(async (value) => {
              this.plugin.settings.deviceCapture.targetFolders = splitWorkflowList(value);
              await this.plugin.savePluginData();
            });
          text.inputEl.rows = 3;
        });

      new Setting(containerEl)
        .setName(copy.deviceCaptureTags)
        .setDesc(copy.deviceCaptureTagsDesc)
        .addTextArea((text) => {
          text
            .setValue(this.plugin.settings.deviceCapture.defaultTags.map((tag) => `#${tag}`).join("\n"))
            .setPlaceholder("#capture\n#device")
            .onChange(async (value) => {
              this.plugin.settings.deviceCapture.defaultTags = normalizeTagList(value);
              await this.plugin.savePluginData();
            });
          text.inputEl.rows = 3;
        });
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
            await this.plugin.savePluginData();
            await this.plugin.refreshIndex();
            this.display();
          });
      });

    if (this.plugin.settings.workflowStages.enabled) {
      this.renderWorkflowStageEditor(containerEl, copy);
    }

    new Setting(containerEl)
      .setName(copy.ai)
      .setDesc(copy.aiDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.ai.enabled)
          .onChange(async (value) => {
            this.plugin.settings.ai.enabled = value;
            await this.plugin.savePluginData();
            this.display();
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
              this.display();
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

      new Setting(containerEl)
        .setName(copy.aiApiKey)
        .setDesc(copy.aiApiKeyDesc)
        .addText((text) => {
          text
            .setValue(this.plugin.settings.ai.apiKey)
            .setPlaceholder("sk-...")
            .onChange(async (value) => {
              this.plugin.settings.ai.apiKey = value.trim();
              await this.plugin.savePluginData();
            });
          text.inputEl.type = "password";
        });

      new Setting(containerEl)
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

  private renderWorkflowStageEditor(containerEl: HTMLElement, copy: SettingCopy): void {
    const stages = this.plugin.settings.workflowStages.stages;
    const list = containerEl.createDiv({ cls: "towrite-workflow-stage-editor" });

    for (const [index, stage] of stages.entries()) {
      const card = list.createEl("details", { cls: `towrite-workflow-stage-card towrite-color-${stage.color}` }) as HTMLDetailsElement;
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
        text: `${stage.folderPrefixes.length} folders · ${stage.tags.length} tags · limit ${stage.limit}`
      });
      const actions = header.createDiv({ cls: "towrite-workflow-stage-actions" });
      const up = createIconButton(actions, "arrow-up", copy.workflowStageMoveUp);
      const down = createIconButton(actions, "arrow-down", copy.workflowStageMoveDown);
      const remove = createIconButton(actions, "trash-2", copy.workflowStageRemove);
      up.disabled = index === 0;
      down.disabled = index === stages.length - 1;
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
      button.addEventListener("click", async () => {
        await onChange(color);
        this.display();
      });
    }
  }

  private async saveTriggerWords(words: string[]): Promise<void> {
    this.plugin.settings.candidateTriggerWords = normalizeTriggerWords(words);
    await this.plugin.savePluginData();
    await this.plugin.refreshIndex();
    this.display();
  }

  private async saveStatusOptions(options: QuestionStatusOption[]): Promise<void> {
    this.plugin.settings.statusOptions = normalizeStatusOptions(options);
    await this.plugin.savePluginData();
    this.display();
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

  private async saveWorkflowStages(stages: WorkflowStageSettings[], redisplay = false): Promise<void> {
    this.plugin.settings.workflowStages.stages = normalizeWorkflowStages(stages);
    await this.plugin.savePluginData();
    await this.plugin.refreshIndex();
    if (redisplay) {
      this.display();
    }
  }
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
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
  } else {
    const textArea = activeDocument.body.createEl("textarea");
    textArea.value = value;
    textArea.addClass("towrite-hidden-clipboard-buffer");
    textArea.select();
    activeDocument.execCommand("copy");
    textArea.remove();
  }
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

  return output;
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

function clampInteger(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}
