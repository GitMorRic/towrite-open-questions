# 更新日志

## 0.2.0 - 2026-07-01

- 新增手机小屏 / 墨水屏模拟页：`GET /device?token=...&profile=mobile-eink`。
- 新增设备协议接口：`GET /api/v1/device-feed`，由 Obsidian 端整理首页、Workflow、ToThink/ToWrite 卡片、文章状态和翻页信息。
- 设备协议支持 `mobile-eink`、`eink-bw`、`desktop-card` 三种 profile，以及 `page`、`cursor`、`limit`、`lane`、`stage` 等查询参数。
- 卡片页增加“一张主卡 + 下一张预览 + 回答/新想法入口”，2.7 寸横屏默认保持一屏完整显示。
- 新增手机 companion 输入页：`GET /device/input?token=...&questionId=...` 可回答卡片，`GET /device/input?token=...` 可记录独立灵感。
- `/device` 页面新增“语音”新想法按钮，可在当前小屏预览页直接语音转文字并写入 capture。
- `/device` 模拟屏幕底部增加五键提示栏：新想法、上一页、首页+长按录音、下一页、手机输入/看卡片，可对应真实设备实体按键。
- `/device` 隐藏屏幕外重复控制；首页下一页会进入卡片页，卡片末尾可进入来源笔记页。
- `GET /api/v1/device-feed` 新增 `sourceFile`，来源笔记页可进入某篇 Obsidian 笔记的专属卡片队列。
- 新增 `POST /api/v1/captures`，用于手机、桌面组件或小屏设备写入独立灵感到默认 Inbox、目标文件夹或 Workflow stage。
- 设置页新增 Device Capture 配置：默认 Inbox 文件、可选目标文件夹、默认 tags，以及是否允许 companion 写入。
- 提醒快捷设置改为可在插件设置中自定义；卡片里只保留一个快捷下拉，不再重复显示快捷按钮。
- Workflow Stages 设置卡片改为可折叠，适合配置较多 stage 或项目时使用。
- 中文 API 文档和 README 补充 Tailscale 手机访问方式，以及后续 ESP32/桌面小组件可复用的设备展示协议和手机输入闭环。

### 新增

- 新增 Workflow Stages：可按文件夹前缀、frontmatter tags、正文 `#tag` 把 Markdown 文件分组成 Raw、Sparks、Initialize、Processing、Archive 等自定义状态。
- 新增 `.obsidian-open-questions/workflows.json` 导出文件。
- 新增 `GET /api/v1/workflows`，支持 `stage`、`limit`、`search`、`compact=1` 查询参数。
- 内置 dashboard 新增 Workflow 区块，展示 stage 数量、文件摘要、下一步和 stale 标记。
- 设置页新增 Workflow Stages 配置入口，可添加、删除、排序 stage，并配置标题、描述、颜色、文件夹、标签、数量和过期天数。

### 改进

- SSE `/api/v1/events` 增加 Workflow 摘要，方便外部客户端知道文件状态索引是否发生变化。
- README 和中文 API 文档同步说明 `workflows.json`、`/api/v1/workflows` 与隐私影响。

## 0.1.0 - 2026-06-28

首个可分发版本。这个版本把 ToWrite 从一个当前笔记问题索引，扩展成可以批注、导出、通过 API 订阅，并可接入外部小屏幕或 dashboard 的 Obsidian 插件。

### 新增

- 支持 Markdown 选区创建 `ToThink` / `ToWrite` 批注卡片。
- 支持 PDF 选区创建批注卡片，并使用 sidecar 数据保存页码、选中文本和归一化坐标。
- PDF 页面支持非破坏式 overlay 高亮；跳转卡片时会尽量回到对应页和高亮位置。
- 卡片模型升级为“标题 + 原文 + 批注”，标题可自动生成，也可在侧栏直接编辑。
- 侧栏支持当前笔记优先展示，并按 `ToThink` / `ToWrite` 分区。
- `ToThink` / `ToWrite` 分区支持整体折叠和展开。
- 侧栏增加 `全部 / ToThink / ToWrite` 筛选。
- 卡片可折叠为紧凑单行，适合窄侧边栏。
- 编辑器正文标记支持两种模式：整行浅色高亮，或只显示左侧竖线。
- 支持单条卡片隐藏整行高亮；顶部眼睛按钮用于整体隐藏。
- 外部 API 支持读取 questions、articles、deck、eink、RSS、SSE events。
- 外部 API 支持写回状态、追加 note，并支持更新标题和正文。
- 新增浏览器桌面卡片、ESP32S3 墨水屏、网页 dashboard 三个中文示例项目。
- 新增中文 API 文档，并补齐中文 README 与 docs 文档。
- 设置页新增 External API 入口、token、bind host、端口、复制按钮和 dashboard 链接。
- 支持 OpenAI-compatible AI 配置预设，用于本地笔记摘要、下一步建议和相关笔记推荐。
- 支持自动打开右侧 ToWrite 侧栏，降低首次启用后的发现成本。

### 改进

- 中文界面中 lane 名称统一显示为 `ToThink` / `ToWrite`。
- `todo` 分类中文名改为“待办”，避免和 `ToWrite` lane 混淆。
- 状态、lane、kind 标签增加图标。
- 设置页删除按钮改为图标按钮。
- AI 设置在未开启 AI 时折叠，减少设置页视觉压力。
- 颜色选择器增加直观色块。
- 导出 JSON 后给出更明显提示。
- 右侧卡片路径显示更紧凑，长路径可展开。
- 当前光标附近的卡片会自动浮到前面，pin 的卡片仍保持置顶。
- 原文行可直接点击跳转，并会短暂高亮原文所在行。
- 为 Obsidian 社区插件上架调整 manifest：插件 id 改为 `towrite-open-questions`，插件名改为 `ToWrite Open Questions`。
- 因为 External API 使用 Node.js `http`，市场版标记为 `isDesktopOnly: true`。
- release 构建关闭 inline sourcemap，减少 `main.js` 发布体积。

### 打包

- 发布 zip 只包含 Obsidian 插件运行所需文件：
  - `main.js`
  - `styles.css`
  - `manifest.json`
- zip 不包含 vault 内容、导出 JSON、API token、AI API key、`node_modules`、源码目录或个人设置。
