# ToWrite Open Questions

[English](README.md) | 简体中文

ToWrite Open Questions 是一个 Obsidian 桌面端插件，用来把还没想清楚、还要继续写、需要查证或需要补充的内容，保留在它们原本出现的位置旁边。

它不是普通 TODO 列表。它更像一层 `ToThink` / `ToWrite` 批注索引：正文继续保持写作流，未完成的思考和写作片段会以卡片、跳转、高亮、导出数据和可选 API 的形式浮出来。

## 主要功能

- 从 Markdown 选区、PDF 选区、显式 Markdown 规则、触发词建议创建 `ToThink` / `ToWrite` 卡片。
- 右侧栏优先显示当前笔记，并按 ToThink / ToWrite 分区；两个分区都可以整体折叠。
- 点击卡片可跳回 Markdown 原文行或 PDF 高亮位置。
- 在侧栏直接编辑卡片标题、原文正文、批注、状态、类型、lane、颜色和标签。
- 批注支持 Obsidian 风格 `[[双向链接]]`；预览里可打开已有笔记，也可创建缺失笔记。
- 选区卡片默认保存到 sidecar JSON，不污染 Markdown。只有点击“固定原文锚点”时才会写入 `^oq_xxx`。
- 编辑器原文支持整行浅色高亮，也支持单条或全局切换成“只保留左侧竖线”。
- Workflow Stages 可按文件夹、frontmatter tags 或正文 `#tag` 把 Markdown 文件分组成 Raw、Sparks、Processing 等自定义状态。
- Article Types 可按文件夹或 tag 把笔记归为 MindFlow、Tech、Project 等内容类型；右侧栏和 dashboard 会同时显示分类与 Workflow 阶段。
- 导出 JSON，供 dashboard、桌面小组件、脚本和墨水屏设备读取。
- 可选桌面端 External API，支持 JSON、RSS、SSE、内置 dashboard、手机小屏预览、手机 companion 输入页，以及状态、批注和新想法写回。
- 可选通用 Push Engine 和 Quote0 接入，把首页总览或下一张卡片推送到墨水屏；NFC 碰一碰可打开受限的手机写回页面。
- 可选 OpenAI-compatible AI 摘要和本地笔记推荐；默认关闭，只在你配置接口后才会请求。
- 从新想法、Markdown 选区或 ToThink/ToWrite 问题卡片打开原生智能记录弹窗，先在本地推荐写入位置并提供冲突安全的预览。
- 可选学习粗粒度工作会话与记录路由模式；识别出的习惯必须由你确认后才会生效。
- 可选连接独立许可的 Obsidian AI Backend，用于重排本地目标候选或改善习惯候选文案；不连接 Backend 也能完整记录。

## 截图

![侧边栏当前笔记与选区工具栏](docs/assets/sidebar-current-note%20and%20selection-toolbar.png)

![小屏预览与 External API 概览](docs/assets/to-write-elink-api-overview.png)

![网页 Dashboard](docs/assets/to-write-web-dashboard.png)

如果你要给别人介绍插件，可以直接使用 [讲解与宣传素材](docs/promo-demo-guide.zh-CN.md)，里面包含演示流程、样本文本和发布文案。

## 为什么是桌面端插件

当前 `manifest.json` 设置为 `isDesktopOnly: true`，因为 External API 使用 Node.js `http` 在 Obsidian Desktop 内启动本地服务器。为了符合 Obsidian 社区插件审核规则，第一版市场提交按桌面端插件处理。

## 快速开始

1. 用左侧 ribbon 图标或命令面板打开 ToWrite 侧栏。
2. 在 Markdown 或 PDF 里选中文字。
3. 在浮动工具条里点击 `Think` 或 `Write`。
4. 在右侧卡片中编辑标题、批注、状态和分类。
5. 点击卡片上的箭头跳回原文。

## 本地优先的智能记录

你可以从 ribbon、命令面板、Markdown 选区或问题卡片打开智能记录。原生 Obsidian 弹窗支持三种意图：

- `新记录`：保存一个独立想法。
- `记录选区`：保留选中文字和来源上下文，再决定放到哪里。
- `回答问题`：默认只追加到问题卡片；可勾选“同时归档为笔记”。

在发起任何可选网络请求前，ToWrite 会先计算并显示最多三个本地候选：

| 候选 | 保存结果 |
| --- | --- |
| 最相关的已有笔记 | 追加到配置的 Capture 标题下。 |
| 推荐文件夹或 Workflow 阶段 | 按预览路径新建 Markdown 笔记。 |
| Inbox 兜底 | 当高相关候选不足时写入配置的 Inbox。 |

本地索引会遵守 Capture 的包含/排除文件夹、排除 tags 和 truthy 隐私 frontmatter 设置。你可以先检查路径与摘要、改选目标，再用 `Ctrl/Cmd+Enter` 保存。保存成功后可以立即打开笔记；如果返回了安全撤销凭证，还可以撤销本次写入，并避免覆盖之后发生的编辑。

Obsidian AI Backend 只是可选增强，不是运行依赖。本地候选会先出现，并构成 Backend 可操作的白名单；启用 Backend 后，它可以异步重排这些候选和修改展示理由，但不能注入任意 Vault 路径。Backend 关闭、离线、版本不兼容或超时时，本地记录和本地推荐仍然正常工作。

Backend 实现方可参考版本化的 [ToWrite v1 对接契约](docs/obsidian-ai-backend-towrite-v1.md)。

## 习惯学习与主动建议

习惯学习默认关闭。启用后，ToWrite 只记录粗粒度结构事件，例如文件切换、有效编辑时段、已确认的记录目标、问题操作和建议反馈。学习事件不包含笔记正文、选区内容、剪贴板内容或逐键输入。

原始学习事件会在 30 天后自动清理。模式识别只能生成“待确认习惯”，待确认状态不会改变记录路由，也不会触发习惯通知；只有你明确接受的习惯才会影响后续行为。你可以查看证据、修改候选名称、忽略或稍后处理，也可以导出或全部清空学习数据。

主动通知同样默认关闭。启用后，只有到期提醒和已确认习惯可以弹通知；新的习惯候选会静默进入侧栏。默认安静时段为 `23:00-08:00`，默认每天最多发送三条习惯通知。

精确的数据边界与可选 Backend 传输范围见 [PRIVACY.zh-CN.md](PRIVACY.zh-CN.md)。

## Markdown 触发规则

- `?? 内容` 或 `？？ 内容`：创建正式 `ToThink` 卡片，适合明确标记“这里需要想清楚”。
- `- [ ] [?] 内容`：创建待处理卡片；勾选后会被识别为 resolved。
- `> [!question]` callout：创建多行问题卡片。
- 触发词建议只处理较明确的句式，例如“分析一下”“需要确认”“来源是什么”“有没有实测”“继续写”“补写”“扩写”等。普通单问号句子不会自动变成候选，所以小说台词、对话和反问不会因为末尾是 `？` 就被标记。
- 编辑器里的候选建议只会显示加号和叉号；点加号才会保存，点叉号会忽略这一条。

## Workflow Stages

Workflow Stages 是独立于 ToThink / ToWrite 的“文件生命周期索引”。它适合把文件按项目阶段暴露给 dashboard、桌面卡片、墨水屏或后续 AI 提醒系统。

你可以在设置页开启并配置：

- `id`：稳定标识，例如 `sparks`、`processing`。
- `title` / `description`：展示标题和说明。
- `color`：dashboard 和设置页使用的颜色。
- `folderPrefixes[]`：文件夹路径前缀，例如 `MindFlow/01-Sparks`。
- `tags[]`：匹配 frontmatter tags 和正文 `#tag`。
- `limit`：每组导出多少文件。
- `staleAfterDays`：多少天没有更新后标记为 stale。

一个文件可以同时属于多个 stage。Workflow 只索引 Markdown 文件，不移动文件，也不会自动改 frontmatter。

建议把 `Stage` 当作“生命周期”，例如 Raw、Sparks、Initialize、Processing、Archive；把 MindFlow、Techbench、OCStory 这类当作“内容类型 / 项目域”。第一版可以通过文件夹前缀来表达项目域：例如 `MindFlow/01-Sparks`、`Techbench/02-Processing`、`OC-Story/Lore`。如果你想在 API 和 dashboard 里同时按“项目域 × 生命周期”交叉统计，后续可以再加独立的 `Workflow Areas` 配置，避免把 stage 复制成 `raw-mindflow`、`raw-techbench` 这种难维护的长列表。

## Article Types、侧栏和 Dashboard

Article Types 是和 Workflow Stages 正交的一层“内容类型”配置。默认示例包括 `mindflow`、`tech`、`project`，你可以在设置页改名、换颜色、添加文件夹前缀和 tags。

层级 tag 会被拆成两层使用：例如 `#mindflow/spark` 同时表示 type=`mindflow` 和 stage=`spark`。独立 tag 也可以匹配 stage，例如 `#spark`、`#processing`。这意味着一篇笔记可以还没有 ToThink/ToWrite 卡片，但只要它匹配了 type 或 stage，也会进入“其他笔记”、dashboard 和设备数据。

右侧栏顶部有三层筛选：

- ToThink / ToWrite lane：控制当前笔记问题分区，以及展开文章后显示哪些问题。
- 分类 tabs：来自 Article Types 设置，哪怕当前数量为 0 也会显示。
- Workflow tabs：来自 Workflow Stages 设置，所有阶段都会显示，0 也保留，方便你知道哪个阶段暂时空着。

Obsidian 内置 Dashboard、External API 的 `/api/v1/device-feed`、Quote0 dashboard 都使用同一批问题、文章和 workflow/tag 索引。不同设备会做展示适配：侧栏保留更多可编辑信息，web/dashboard 更适合扫描统计，Quote0 Text API 会压缩成少量文字，Quote0 Canvas/Image dashboard 会优先显示首页指标和 Workflow 状态。

## Quote0 与自动推流

Quote0 接入分成两类内容：

- 文本卡片：推送下一张 ToThink/ToWrite 卡片，显示标题、问题、下一步、最近 note、stage 和状态；适合设备轮播。
- 首页总览：通过 Text / Image / Canvas API 推送 dashboard，总览 ToThink、ToWrite、未解决文章、提醒、Workflow 文件和阶段状态；适合常驻桌面小屏。

NFC link 默认指向 `External API publicBaseUrl + /device/input?token=<quote0-nfc-token>&questionId=<id>`。这个 token 是 Quote0 专用受限 token，只用于手机写回页、输入上下文、追加 note 和创建 capture，不复用完整 External API token。要让手机碰一碰能打开页面，需要：

1. Obsidian 桌面端正在运行，插件启用 External API。
2. `bindHost` 在局域网/Tailscale 场景下设置为 `0.0.0.0`。
3. `publicBaseUrl` 填手机可访问的电脑地址，例如 `http://100.x.y.z:48321` 或 `http://192.168.1.20:48321`。
4. Quote0 设置里有 API key、deviceId，并且 Text / Image / Canvas API 内容已经在 Dot App/Content Studio 加入设备 Loop。
5. 发送测试卡、发送主页、强制刷新设备都能成功；如果 Dot API 返回 200 但屏幕没变，通常要检查 Loop 里是否选择了对应 API 内容，以及设备是否在线/刷新间隔是否生效。

插件默认会在发送成功后额外调用一次 Dot 的设备切换/刷新接口（`/next`），尽量让 quote0 立刻拉取新内容。但它仍受 Dot 云端队列、Loop 当前内容和墨水屏物理刷新限制；如果你的 Loop 因为 `/next` 跳到其他内容，可以在 Quote0 设置里关闭“发送后自动强制刷新”。

## 数据文件

ToWrite 会在 vault 中写入可读 JSON：

```text
.obsidian-open-questions/
  index.json
  articles.json
  eink-compact.json
  workflows.json
  learning/
    events.jsonl
    habits.json
  questions/
    <question-sidecar>.json
```

这些文件可能包含选中的笔记文本、PDF 摘录、标题、批注、标签、状态、来源路径、frontmatter、卡片元数据，以及启用学习后生成的粗粒度事件与习惯候选。除非你明确想分享这些内容，否则不要公开导出目录。

## External API

External API 默认关闭，只在 Obsidian 桌面端运行。启用后需要 token。

默认本机地址：

```text
http://127.0.0.1:48321
```

常用接口：

```text
GET   /health
GET   /api/v1/questions
GET   /api/v1/articles
GET   /api/v1/workflows
GET   /api/v1/eink
GET   /api/v1/deck
GET   /api/v1/device-feed
GET   /api/v1/rss.xml
GET   /api/v1/events
GET   /dashboard
GET   /device
GET   /device/go
GET   /device/input
POST  /api/v1/questions/<id>/status
POST  /api/v1/questions/<id>/notes
POST  /api/v1/captures
POST  /api/v1/device/events
POST  /api/v1/device/handoffs
PATCH /api/v1/questions/<id>
```

只在本机使用时保持 `127.0.0.1`。如果要给 ESP32、手机或另一台电脑访问，可以把 bind host 改成 `0.0.0.0`，但请自己用 Tailscale、Cloudflare Tunnel、反向代理、HTTPS、访问控制或防火墙保护远程访问。

### 手机小屏 / 墨水屏模拟

如果手机和电脑已经通过 Tailscale 组成局域网，在插件设置里打开 External API，把 `API bind host` 改成 `0.0.0.0`，并开启“允许 GET 查询参数 token”，然后在手机浏览器打开：

```text
http://<电脑的 Tailscale IP>:48321/device?token=<你的 token>
```

也可以在设置页的“手机/远程访问基地址”里填写 `http://<电脑的 Tailscale IP>:48321`，之后直接复制“手机小屏页面”链接。

`/device` 是小屏预览页，视觉上模拟墨水屏，支持左右滑动和屏幕上的上一页/下一页按钮。它内置屏幕模拟器，可以选择 2.7 寸、2.13 寸、4.2 寸等预设，也可以手动输入宽度、高度和英寸数；模拟屏幕会按比例居中显示。页面会请求 `GET /api/v1/device-feed`，由电脑端插件提前整理首页、Workflow 状态、下一步、ToThink/ToWrite 卡片、下一张预览和来源笔记状态。未来 ESP32、桌面小组件或其他设备也可以复用这个接口，只负责渲染。

真实墨水屏不需要负责复杂输入。卡片页会提供“回答”和“新想法”入口，打开 `/device/input` 手机 companion 页面：带 `questionId` 时默认追加到那张卡片的 note；不带 `questionId` 时可以把独立灵感写入设置里的默认 Inbox 文件、目标文件夹或 Workflow stage。静态 NFC 或二维码可以固定指向 `/device/go?targetId=...`，由桌面端根据该设备最近显示的卡片决定打开回答页、原笔记或统一记录入口。硬件按键可以 POST 到 `/api/v1/device/events`，由同一套 action 层解析。手机预览页里还会额外显示“语音”按钮，可以不离开当前页面，直接用浏览器语音转文字保存为一条新想法。

手机预览页会在模拟屏幕底部显示五键提示栏：`新想法 / 上一页 / 首页+录音 / 下一页 / 手机输入或当前动作`。中间键短按回首页，长按直接语音记录新想法并写入 Device Inbox；右侧键在来源笔记页会变成“看卡片”，进入当前笔记的卡片队列。真实硬件可以把这五个提示映射到屏幕下方或侧边的实体按键。

设备协议支持 `profile=mobile-eink`、`profile=eink-bw`、`profile=desktop-card`，也支持 `page=home/cards/workflow/articles`、`cursor`、`limit`、`lane`、`stage`、`sourceFile`、`width`、`height`、`inches` 等参数。`sourceFile` 可让卡片页只刷某篇来源笔记里的 ToThink/ToWrite。`mobile-eink` 适合手机 PWA 模拟墨水屏；`eink-bw` 适合真实黑白小屏，文本更短；`desktop-card` 适合桌面小组件，信息密度更高。横屏墨水屏可以传入实际尺寸，例如 `width=264&height=176&inches=2.7`，服务端会返回 `orientation`、`aspectRatio`、`ppi` 和更紧凑的 `layout`。

卡片可以设置手动提醒时间，提醒字段会出现在 `/api/v1/questions`、`/api/v1/deck` 和 `/api/v1/device-feed` 中。`/device` 在 HTTPS 或 Tailscale Serve 等安全上下文里可以安装成 PWA；第一版提醒是在页面打开时通过 SSE 检测变化，完整后台推送需要后续 Web Push 或常驻服务支持。

详细示例见 [中文 API 文档](docs/api.zh-CN.md)。

## PDF 支持

PDF 批注是非破坏式的。ToWrite 会把 PDF 路径、选中文本、页码和归一化选区矩形保存到 sidecar JSON，然后在 Obsidian PDF 查看器中绘制 overlay 高亮。点击卡片时，会尽量跳回对应页和高亮位置。

ToWrite 不会修改 PDF 文件本体。

## AI 与本地知识推荐

AI 默认关闭。启用并配置 `baseUrl`、`apiKey`、`model` 后，ToWrite 会调用 OpenAI-compatible `/chat/completions` 接口，为已保存卡片生成摘要、下一步建议和相关本地笔记推荐。

填写 Base URL 和 API Key 后，可以点击“获取模型”调用服务端的 `/models` 接口，再从返回列表中选择模型；不支持模型发现的兼容服务仍可手工填写模型 id。“测试连接”会使用当前模型发起一次很小的真实对话请求，并显示延迟和返回内容。

通过命令面板的“打开 AI 助手”、左侧 Ribbon 机器人图标或侧栏机器人按钮，可以打开原生 Obsidian 对话界面。AI 回复使用 Obsidian Markdown 渲染，每条回复都可以切回“原文”。`Ctrl/Cmd+Enter` 发送，`Shift+Enter` 换行。Backend 模式下可以输入 `/` 搜索本地 Skill 仓库，输入 `@` 添加一个或多个 Agent；所选模型、Skill 和 Agent 会持续显示在输入框上方。

助手支持切换模型、本地持久化历史、上下文检查器和安全的交互式选择卡片。当模型确实需要用户决策时，直连模式可以调用 `ask_user_choice` function tool；Backend 回复使用有边界、只负责展示的选择标记。选择卡片本身不会自动写入 Vault。直连模式使用配置的 OpenAI-compatible 接口；Backend 模式复用 Backend 已有的模型目录、LiteLLM 路由、Agent roster、Skills 和上下文对话接口。用户发送前可以展开上下文检查器，确认本次会发送哪些字段。历史也会写入用户可读的 `.obsidian-open-questions/ai/conversations.json`，并可在助手中清空。

ToWrite 不做联网搜索。它会基于 Obsidian `Vault` 和 `MetadataCache` 构建轻量本地索引，从文件名、路径、frontmatter、标签、标题和正文片段中召回候选笔记。

## 安装

### 社区插件

通过审核后，在 Obsidian 的 Community Plugins 中搜索 `ToWrite Open Questions` 安装。

### 手动安装

从 GitHub release 下载：

- `main.js`
- `manifest.json`
- `styles.css`

放到：

```text
<你的 vault>/.obsidian/plugins/towrite-open-questions/
```

重启 Obsidian，然后启用 `ToWrite Open Questions`。

如果你之前用过 `.obsidian/plugins/obsidian-towrite/` 这个早期手动安装目录，切换到市场版 id 前请先备份旧目录，尤其是其中的 `data.json`。

## 开发

```powershell
npm.cmd install
npm.cmd run test
npm.cmd run build
```

构建产物输出到 `dist/`。

## 隐私

核心索引、三候选记录推荐和习惯推断都在本地 Obsidian 内运行。学习、External API、主动通知、AI 与 Obsidian AI Backend 接入都是可选功能。API token 和 AI API key 保存在本地 Obsidian 插件数据中，不会写入导出的 JSON；Backend token 通过 `X-Capture-Token` 请求头发送，不写入 URL。

因为 ToWrite 会把选区文字、来源路径和可选学习事件保存到 sidecar JSON 与导出文件，请把这些文件视为你的私有 Vault 数据。启用远程访问或可选网络服务前，请阅读 [PRIVACY.zh-CN.md](PRIVACY.zh-CN.md) 与 [SECURITY.zh-CN.md](SECURITY.zh-CN.md)。

## License

ToWrite Open Questions 插件使用 MIT License，详见 [LICENSE](LICENSE)。

可选的 Obsidian AI Backend 是独立项目，使用它自己的许可条款。插件的 MIT 授权不包含 Backend 代码或托管服务；请以 Backend 分发包中的 `LICENSE` 与商业许可文件为准。
