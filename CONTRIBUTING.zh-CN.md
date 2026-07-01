# 贡献指南

感谢你帮助改进 ToWrite Open Questions。

这是一个 Obsidian 桌面端插件。提交修改时，请尽量保持改动聚焦、本地优先，并保护用户 vault 隐私。

## 开发

安装依赖并在提交 PR 前验证：

```powershell
npm.cmd install
npm.cmd run test
npm.cmd run build
```

构建产物会写入 `dist/`。

## 分支

- `main`：稳定发布分支。
- `dev`：日常开发整合分支。
- `feat/*`：新功能。
- `fix/*`：问题修复。
- `docs/*`：纯文档修改。
- `release/*`：版本号和发布准备。

对这个项目来说，轻量流程就够用：

1. 从 `dev` 创建功能分支。
2. 提交聚焦的小改动。
3. 运行测试和构建。
4. 合并回 `dev`。
5. 只有准备稳定版本时，才把 `dev` 合并到 `main`。

## Commit 写法

建议使用简短的 conventional-style commit：

```text
feat: add workflow stage summaries
fix: restore PDF highlight jump
docs: update API examples
chore: prepare 0.2.0 release
```

如果需要中文，也可以在第二段补充中文说明：

```text
feat: initial public release

初始化 ToWrite Open Questions 0.2.0 公开发布版本，包含批注卡片、Workflow Stages、External API、设备 feed、手机/墨水屏预览以及中英文文档。
```

## Pull Request

提交 PR 前请确认：

- 已运行 `npm.cmd run test`。
- 已运行 `npm.cmd run build`。
- 行为变化同步更新 `README.md`、`README.zh-CN.md`、`CHANGELOG.md` 或 `docs/`。
- 新增用户可见文档或示例时，尽量同时提供英文和中文。
- 截图和 demo 数据不要包含私人笔记、token 或 API key。

## 隐私与数据

不要提交：

- vault 内容。
- `.obsidian-open-questions/`。
- Obsidian 插件 `data.json`。
- API token、AI key 或 `.env` 文件。
- `node_modules/`、`dist/` 或 `release/`。
- 真实 Tailscale 主机名、私有局域网地址或私人笔记摘录。

插件可能会在用户自己的 vault 数据里保存选中文本、PDF 摘录、批注、标签、路径和 workflow 摘要。请把导出的 JSON 和 sidecar 文件都当作用户隐私数据处理。

## 发布检查

Release tag 必须和 `manifest.json` 完全一致，例如使用 `0.2.0`，不要使用 `v0.2.0`。

发布前运行：

```powershell
npm.cmd run test
npm.cmd run build
```

每个 GitHub release 必须上传这三个独立文件：

- `main.js`
- `manifest.json`
- `styles.css`

不要把 GitHub 自动生成的 Source code ZIP 当作安装包。手动安装 ZIP 可以作为额外资产上传，但 BRAT 和 Obsidian 社区插件主要需要这三个独立插件文件。

## Obsidian 审核注意事项

插件当前标记为 `isDesktopOnly: true`，因为可选的 External API 使用 Node.js `http`。

External API 和 AI 功能必须保持默认关闭。除非用户明确点击“固定原文锚点”等操作，否则插件不应该主动修改 Markdown。
