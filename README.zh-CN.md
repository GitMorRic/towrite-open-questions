# ToWrite Open Questions

[English](README.md) | 简体中文

ToWrite 是一个桌面端 Obsidian 工作台：把散落在日记、普通笔记、开放问题和 Workflow 里的未完成内容，整理成今天真正要推进的事情。Markdown 始终是数据真源；你可以继续在日记里自然书写，只在需要编排、开始、完成或复盘时打开工作台。

![ToWrite 侧栏与原文控件](docs/assets/sidebar-current-note%20and%20selection-toolbar.png)

## 三分钟快速开始

1. 在 **设置 → 第三方插件** 启用 ToWrite。
2. 在命令面板运行 **ToWrite：打开工作台**。
3. 打开今天的日记，直接写普通 Markdown 待办。
4. 回到“今日”开始一项任务，或在“工作池”里安排已有笔记与问题。
5. 在“日志”查看完成、迁移、回流和放弃记录。

如果已启用 Obsidian 核心“日记”插件，ToWrite 会复用它的目录、日期格式和模板；也可以在 ToWrite 设置中使用独立日记目录。

## 在日记里自然写任务

输入时、刷新 Dashboard 时和扫描工作池时，ToWrite 都不会主动改写 Markdown。

```md
## ToDo

- [ ] 项目
  1. [[Echo MVP]]
  2. [[发布说明]]

- [ ] 写作
  - [ ] 写完引言
  - [ ] 核对示例
```

- checkbox 下面只有普通编号、链接或说明时，父项是分类，不计入进度。
- 子项是 checkbox 时，子项是任务；父 checkbox 也可以作为任务。
- 分类下的编号链接可以投影为叶子任务，但无关普通列表不会被识别。
- 任务自己的链接优先打开；缺失时可以继承最近父分类的笔记。
- 显式 `towrite-kind:: task` 可以覆盖分类推断。

没有 ID 的新任务先使用内存临时引用。只有点击开始、完成、属性、迁移、发送到设备或加入工作池等明确动作时，插件才会重新校验文档，并把稳定 `^daily_*` ID 写到同一任务行末尾。目标行已经变化时会取消操作，绝不会把 ID 写到相邻编号行。

## 一个工作台，四个页面

### 今日

展示当天顺序、当前专注、按项目着色的进度、昨日未完成迁移，以及可选的 2.7 英寸墨水屏预览。完整清单始终遵循 Markdown 顺序。

### 工作池

统一投影 Markdown 待办、ToThink/ToWrite 问题、Inbox 与 Workflow 笔记，但不会复制到隐藏数据库。保存视图可以按项目、来源、阶段、文章类型、关联笔记或原生状态分组。

### 状态

解释并统计 Workflow 阶段、Article Type、问题状态、Inbox 与 tags。这里是分析页；真正修改仍写回来源笔记或问题 Sidecar。

### 日志

按日或自然月查看计划数、完成率、投入/暂停时间、中断、迁入、迁出、回流和放弃。事件只保存在本地可读 JSONL 中；确认写回时，只更新日记中 `ToWrite 日志` marker 包围的区域。

## 现在专注

运行 **ToWrite：现在专注：打开悬浮窗**，得到一个可固定的 Obsidian 小窗，只显示当前任务和紧凑今日摘要。点击任务会开始/继续并打开对应笔记、heading、block 或安全 HTTPS 目标；“稍后”会暂停计时并保存本地阅读断点。

命令 **ToWrite：定位当前专注任务** 可以绑定快捷键。在 Markdown 编辑器空白处双击也会定位并短暂高亮当前任务；链接、控件和选中文字不会被拦截。

## ToThink / ToWrite 批注

选择 Markdown 或 PDF 文本后，可以创建 ToThink/ToWrite 卡片。卡片能跳回来源、在 Sidecar 中保存批注而不污染正文，并进入工作池或设备候选。原来的批注流程与每日计划同时保留。

## Markdown 真源与技术字段

- 笔记、日记、checkbox、frontmatter 和可读 JSON/JSONL 是数据真源。
- `^daily_*`、`^task_*` 与 `towrite-*` 只用于稳定定位和冲突安全写入。
- 除非开启调试设置，Source、Live Preview 和阅读模式都会隐藏并保护技术字段，光标和删除键不会进入这些原子区域。
- 活动统计不记录按键，也不会保存笔记正文。
- API Key 和长期 token 使用 Obsidian 1.11.4+ 的 SecretStorage，不再保存在插件 `data.json`。

## 可选联网功能与数据说明

所有联网功能默认关闭。

| 功能 | 默认 | 启用后发送什么 |
| --- | --- | --- |
| OpenAI-compatible AI | 关闭 | 用户预览确认的字段与本地候选 ID |
| 可信 Backend | 关闭 | 经过隐私过滤的候选元数据；不能发明 Vault 路径 |
| External API | 关闭 | 经过认证的本地客户端请求的数据 |
| Device Hub / NFC | 关闭 | 获准显示的卡片快照和 opaque 来源引用 |
| Quote0 / Push | 关闭 | 用户选择的卡片或 Dashboard 数据 |

高级内容集中在 [`docs/`](docs/)：

- [今日 Dashboard 与 Markdown 契约](docs/daily-dashboard.zh-CN.md)
- [按键打开与导航 Adapter](docs/navigation-adapters.zh-CN.md)
- [Device Hub 协议](docs/device-hub-protocol.zh-CN.md)
- [NTAG213 / NFC Tools 指南](docs/ntag213-nfc-tools.zh-CN.md)
- [External API](docs/api.zh-CN.md)

## 安装与兼容

- Obsidian **1.11.4 或更高版本**
- 仅桌面端（`isDesktopOnly: true`）
- 支持 Obsidian Desktop 覆盖的 Windows、macOS 与 Linux

社区插件市场搜索 **ToWrite Open Questions** 即可安装。手动安装时，把 Release 中的 `main.js`、`manifest.json`、`styles.css` 复制到：

```text
<你的 Vault>/.obsidian/plugins/towrite-open-questions/
```

## 常见问题

- **今日为空：**检查当前日记来源，以及任务是否位于配置的 ToDo 区段或支持的自由日记区域。
- **提示任务已变化：**刷新后重试；这是插件避免覆盖新内容的保护。
- **笔记链接打不开：**使用有效的 `[[双链]]` 或相对 Markdown 链接，并检查是否存在同名笔记。
- **打字卡顿：**可关闭编辑器建议或缩小工作池 include 范围；索引和网络工作均在 debounce 后执行，不进入按键处理链。
- **技术字段可见：**运行“修复当前日记任务结构”，并关闭“显示技术字段”调试开关。

提交敏感问题前请阅读 [社区商城检查](docs/marketplace-submission.zh-CN.md)、[安全策略](SECURITY.zh-CN.md) 和 [隐私说明](PRIVACY.zh-CN.md)。

## 开发

```bash
npm ci
npm test
npm run typecheck
npm run build
```

生产构建会检查 package/manifest/versions 版本一致、Release 三个必需文件，以及 `main.js` 不超过 2 MiB。

## 许可

MIT，见 [LICENSE](LICENSE)。可选 Backend 独立发行并使用自己的许可证。
