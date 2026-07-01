# Obsidian 社区插件上架准备

官方参考：

- 提交要求：<https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins>
- 提交插件：<https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin>
- Manifest 参考：<https://docs.obsidian.md/Reference/Manifest>
- 开发者政策：<https://docs.obsidian.md/Developer+policies>

## 当前市场身份

- 插件 id：`towrite-open-questions`
- 插件名称：`ToWrite Open Questions`
- Release tag：`0.2.0`
- 最低 Obsidian 版本：`1.5.0`
- Desktop only：`true`

为什么是桌面端：当前 External API 使用 Node.js `http` 在 Obsidian Desktop 里启动本地服务器。Obsidian 社区审核要求使用 Node.js 或 Electron API 的插件把 `isDesktopOnly` 设置为 `true`。

## 仓库根目录需要准备

- `manifest.json`
- `versions.json`
- `README.md`
- `LICENSE`

建议同时保留：

- `README.zh-CN.md`
- `CHANGELOG.md`
- `docs/release-checklist.md`
- `docs/marketplace-submission.md`
- `docs/marketplace-submission.zh-CN.md`
- `docs/assets/` 中的截图或动图

## GitHub Release 资产

每个 release 上传这三个 Obsidian 可加载文件：

- `main.js`
- `manifest.json`
- `styles.css`

不要让用户安装 GitHub 自动生成的 Source code ZIP。那个 ZIP 包含源码、测试和开发文件，不是可直接加载的插件包。

## 提交流程

1. 把 GitHub 仓库设为公开。
2. 确认默认分支根目录有 `manifest.json`、`versions.json`、`README.md`、`LICENSE`。
3. 运行 `npm.cmd run test`。
4. 运行 `npm.cmd run build`。
5. 创建与 `manifest.json` 版本一致的 tag，例如 `0.2.0`。
6. 用这个 tag 创建 GitHub release。
7. 上传 `dist/main.js`、`dist/manifest.json`、`dist/styles.css`。
8. 在干净 vault 中只用这三个文件测试安装。
9. 到 Obsidian 社区插件请求区提交：<https://community.obsidian.md/c/plugins/plugin-requests/7>
10. 使用 “New plugin” 流程，填写公开 GitHub 仓库 URL。

旧教程里常见的 `obsidianmd/obsidian-releases` PR 流程已经不是当前官方文档推荐的新插件提交流程。现在应以 Obsidian forum/community 的 New plugin 流程为准。

## 可直接用于提交的英文说明

Short description：

> Track ToThink and ToWrite annotations beside your source notes.

Longer description：

> ToWrite Open Questions adds a ToThink / ToWrite annotation layer for unfinished thinking and unfinished writing inside Obsidian. Capture cards from Markdown selections, PDF selections, explicit rules, or inline trigger suggestions; keep the current note's unresolved items visible in the sidebar; jump back to source lines or PDF highlights; and export JSON for dashboards, widgets, or eink devices. Optional AI and the desktop External API are disabled by default.

给审核者看的隐私说明：

> Core indexing is local-first. Selection cards are stored in sidecar JSON inside the user's vault. The plugin only modifies Markdown when the user explicitly pins a source anchor. External API and AI are opt-in; tokens and API keys are stored in local Obsidian plugin data and are not exported.

## 需要准备哪些图片和动图

请用干净 demo vault 录制，不要出现私人笔记、API token 或真实 AI key。

建议素材：

1. `docs/assets/sidebar-current-note.png`
   - 左边是当前笔记，右边是 ToWrite 侧栏。
   - 展示 ToThink / ToWrite 分区、数量、折叠卡片。

2. `docs/assets/selection-toolbar.gif`
   - 在 Markdown 中选中文字，点击 `Think` 或 `Write`，右侧出现卡片。

3. `docs/assets/pdf-highlight.gif`
   - 在 PDF 中选择文字，创建卡片，展示非破坏式高亮和跳回。

4. `docs/assets/card-editing.png`
   - 展示标题、原文、批注、`[[双向链接]]`、状态/类型标签和动作按钮。

5. `docs/assets/dashboard.png`
   - 展示内置 dashboard 或示例 web dashboard，重点是解析后的卡片 UI，不要只展示 raw JSON。

6. `docs/assets/external-api-settings.png`
   - 展示 External API 设置页，token 需要打码。

7. `docs/assets/eink-example.jpg`
   - 可选：真实墨水屏照片，或展示 `/api/v1/eink` 输出效果的 mock。

## 审核风险

已经处理：

- `id` 不再包含 `obsidian`。
- `name` 不再使用冒号。
- 因为使用 Node.js `http`，`isDesktopOnly` 已改为 `true`。
- AI 默认关闭，并且文档已说明。
- External API 默认关闭、token 保护，并且文档已说明。
- 只有用户显式点击“固定原文锚点”时才会修改 Markdown。
- Release 资产限定为 `main.js`、`manifest.json`、`styles.css`。

提交前还要确认：

- `authorUrl` 当前为空。允许为空，但建议填一个稳定 GitHub 主页或个人网站。
- 公开仓库 URL 最好与最终插件 id/name 一致。
- 从旧手动目录 `obsidian-towrite` 切换到新市场 id `towrite-open-questions` 前，先在干净 vault 测试。
- 截图不能出现私人内容和凭据。
- release ZIP 不要包含 `node_modules`、vault 数据、`.obsidian-open-questions`、API token 或 AI key。

## 一定要英文吗

插件可以有中文 UI，也可以有完整中文文档。市场面向的 `README.md`、manifest `description`、GitHub release notes 和提交说明建议使用英文，因为 Obsidian 社区审核和插件目录是英文优先。`README.zh-CN.md` 可以作为完整中文版本保留。
