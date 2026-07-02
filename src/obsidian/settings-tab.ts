import { App, Notice, PluginSettingTab, Setting, setIcon, type SettingDefinitionItem } from "obsidian";
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

type SettingsTabId = "general" | "cards" | "workflow" | "api" | "ai";

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
  "zh": {
    "title": "ToWrite：未闭合问题",
    "tabs": {
      "general": "通用",
      "cards": "卡片与编辑器",
      "workflow": "Workflow",
      "api": "API 与设备",
      "ai": "AI"
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
    "deviceCapture": "手机输入写回",
    "deviceCaptureDesc": "允许 /device/input companion 页面把回答追加到卡片，或把独立想法写入指定 Inbox/文件夹。",
    "deviceCaptureInbox": "默认 Inbox 文件",
    "deviceCaptureInboxDesc": "没有选择具体目标时，新想法会追加到这个 Markdown 文件。",
    "deviceCaptureFolders": "可选目标文件夹",
    "deviceCaptureFoldersDesc": "一行一个 vault 内文件夹。手机输入页会把它们显示为保存位置。",
    "deviceCaptureTags": "默认 tags",
    "deviceCaptureTagsDesc": "手机输入页保存的新想法默认带上的标签；可用逗号、顿号或换行分隔。",
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
      "workflow": "Workflow",
      "api": "API & Device",
      "ai": "AI"
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
    "deviceCapture": "Phone input writeback",
    "deviceCaptureDesc": "Allow the /device/input companion page to append answers to cards or save standalone ideas to an Inbox/folder.",
    "deviceCaptureInbox": "Default Inbox file",
    "deviceCaptureInboxDesc": "When no specific target is selected, new ideas are appended to this Markdown file.",
    "deviceCaptureFolders": "Selectable target folders",
    "deviceCaptureFoldersDesc": "One vault folder per line. The phone input page will show them as save targets.",
    "deviceCaptureTags": "Default tags",
    "deviceCaptureTagsDesc": "Tags added to new ideas saved from the phone input page; separate with commas, enumeration commas, or line breaks.",
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
  private readonly openWorkflowStageIds = new Set<string>();
  private activeSettingsTab: SettingsTabId = "general";

  constructor(app: App, private readonly plugin: ToWritePlugin) {
    super(app, plugin);
  }

  private settingsRootEl: HTMLElement | null = null;

  getSettingDefinitions(): SettingDefinitionItem[] {
    const copy = COPY[this.plugin.settings.language ?? "zh"];
    return [{
      name: copy.title,
      searchable: false,
      render: (setting) => {
        setting.settingEl.empty();
        setting.settingEl.addClass("towrite-settings-definition");
        const root = setting.settingEl.createDiv({ cls: "towrite-settings" });
        this.settingsRootEl = root;
        this.renderSettings(root);
        return () => {
          if (this.settingsRootEl === root) {
            this.settingsRootEl = null;
          }
        };
      }
    }];
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
    } else if (this.activeSettingsTab === "workflow") {
      this.renderWorkflowSettings(panel, copy);
    } else if (this.activeSettingsTab === "api") {
      this.renderApiDeviceSettings(panel, copy);
    } else {
      this.renderAiSettings(panel, copy);
    }
  }

  private renderSettingsTabs(containerEl: HTMLElement, copy: SettingCopy): void {
    const tabs: Array<{ id: SettingsTabId; label: string }> = [
      { id: "general", label: copy.tabs.general },
      { id: "cards", label: copy.tabs.cards },
      { id: "workflow", label: copy.tabs.workflow },
      { id: "api", label: copy.tabs.api },
      { id: "ai", label: copy.tabs.ai }
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

    new Setting(containerEl)
      .setName(copy.deviceCapture)
      .setDesc(copy.deviceCaptureDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.deviceCapture.enabled)
          .onChange(async (value) => {
            this.plugin.settings.deviceCapture.enabled = value;
            await this.plugin.savePluginData();
            this.refreshSettingsUi();
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


  }

  private renderWorkflowSettings(containerEl: HTMLElement, copy: SettingCopy): void {
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
            this.refreshSettingsUi();
          });
      });

    if (this.plugin.settings.workflowStages.enabled) {
      this.renderWorkflowStageEditor(containerEl, copy);
    }


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


  }

  private refreshSettingsUi(): void {
    if (this.settingsRootEl) {
      this.renderSettings(this.settingsRootEl);
    } else {
      this.update();
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

  private renderWorkflowStageEditor(containerEl: HTMLElement, copy: SettingCopy): void {
    const stages = this.plugin.settings.workflowStages.stages;
    const list = containerEl.createDiv({ cls: "towrite-workflow-stage-editor" });

    for (const [index, stage] of stages.entries()) {
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
      this.refreshSettingsUi();
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
