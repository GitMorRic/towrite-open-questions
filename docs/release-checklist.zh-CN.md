# Release 检查清单

## 打 tag 前

- 确认 `manifest.json` 使用市场 id：`towrite-open-questions`。
- 更新 `manifest.json` version。
- 更新 `package.json` version。
- 更新 `versions.json`。
- 更新 `CHANGELOG.md`。
- 运行 `npm.cmd run test`。
- 运行 `npm.cmd run build`。

## Release 资产

只从 `dist/` 上传这三个文件：

- `main.js`
- `manifest.json`
- `styles.css`

不要把 vault 文件夹、`data.json`、`.obsidian-open-questions`、API token、AI key、`node_modules` 或源码压缩包当作安装资产上传。

## 本地冒烟测试

- 在干净 vault 中把三件套放到 `.obsidian/plugins/towrite-open-questions/`。
- 启用 `ToWrite Open Questions`。
- 创建一个 `??` Markdown 问题。
- 创建一个 Markdown 选区卡片。
- 创建一个 PDF 选区卡片，确认 overlay 高亮和跳回。
- 折叠/展开 ToThink 和 ToWrite 分区。
- 测试单条和全局的编辑器高亮隐藏。
- 导出 JSON。
- 重启 Obsidian，确认状态仍然存在。

## 上架提交

- 将 GitHub 仓库设为公开。
- 创建与 `manifest.json` 版本一致的 GitHub release。
- 上传三件套 release assets。
- 通过 Obsidian 社区插件请求流程提交。
- 详见 [marketplace-submission.zh-CN.md](marketplace-submission.zh-CN.md)。
