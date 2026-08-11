# ToWrite Open Questions

[English](README.md) · [下载版本](https://github.com/GitMorRic/towrite-open-questions/releases) · [反馈问题](https://github.com/GitMorRic/towrite-open-questions/issues)

ToWrite 是一个桌面端 Obsidian 工作台，把普通 Markdown 待办、开放问题、Inbox 笔记和不同 Workflow 阶段的笔记，整理成克制的每日计划。Markdown 始终是真源：你仍然在日记里自然书写，只在需要安排、开始、完成或复盘时打开工作台。

![包含今日、工作池、状态与日志的 ToWrite 工作台](docs/assets/towrite-workbench-0.3.svg)

## 0.3 版有什么

- **今日**：从日记编排任务，只保留一个当前任务，显示进度与 2.7 英寸墨水屏预览。
- **工作池**：统一查看白名单内的 Markdown 待办、ToThink/ToWrite、Inbox 与 Workflow 笔记。
- **状态**：查看 Workflow 阶段、文章类型、开放问题状态和陈旧笔记。
- **日志**：按日或按月回看完成、暂停、迁移与回流，并可预览后写回日记。
- **现在专注**：可固定的小窗口，只显示当前任务，不加载完整工作池。

## 三分钟开始

1. 在 Obsidian 社区插件中安装并启用 **ToWrite Open Questions**。
2. 打开 **ToWrite 设置 → Daily**，选择复用 Obsidian 日记，或指定一份固定规划文档。
3. 在配置的 `ToDo` 区段里正常写 Markdown：

   ```md
   ## ToDo

   - [ ] 项目
     1. [[写发布说明]]
     2. [[测试记录流程]]
   - [ ] 稍后阅读
     1. [[一篇有用的论文]]
   ```

4. 点击默认唯一显示的 Ribbon 待办图标，或从命令面板运行 **Open Todo Workspace**。
5. 只有在你明确开始、完成、迁移、修改属性或发送任务时，插件才会写入稳定 ID；输入与刷新不会主动改写日记。

上例中，只有普通编号链接的父 checkbox 会被当作分类；真正的子 checkbox 仍是任务。稳定技术字段只在动作需要时写入，并在 Live Preview 中作为不可误删的原子区域保护。

## 自然书写日记

支持 `[[双链]]`、相对 Markdown 链接、heading、block、父分类、子任务和目标继承。打开任务时优先使用任务自己的链接，其次是最近的父分类链接，再回到来源 block。关联笔记中的待办可以投影到日记，但不会复制或取代原文真源。

昨日未完成会先展示迁移预览；确认后移动到今天，并在原日记留下可读迁移记录，不会静默滚雪球。

## 各页面的区别

| 页面 | 用途 |
| --- | --- |
| 今日 | 决定并推进今天承诺的内容。 |
| 工作池 | 搜索和安排各来源的活跃工作。 |
| 状态 | 查看流程覆盖、问题状态和数量。 |
| 日志 | 回看每日/月度变化与投入时间。 |
| 现在专注 | 把一个当前任务常驻在注意力边缘。 |
| 开放问题侧栏 | 查看和编辑 ToThink/ToWrite 批注。 |

## 本地优先与联网说明

Markdown 与用户可读的 JSON/JSONL 是数据真源，索引均可重建。插件不采集按键，也不会默认上传完整 Vault。

| 功能 | 默认 | 联网与数据行为 |
| --- | --- | --- |
| 今日计划、工作池、日志 | 本地启用 | 无需网络。 |
| AI Provider | 关闭 | 只发送披露预览中列出的字段。 |
| 可信 Backend | 关闭 | 可选的重排、Skills、Agent 与设备协调。 |
| Device Hub / NFC | 关闭 | 发送隐私过滤后的卡片快照与 opaque 引用。 |
| External API / Capture Bridge | 关闭 | 桌面端本地服务，使用请求头中的 scoped token。 |

API Key 与长期 token 在支持的版本中使用 Obsidian SecretStorage，且不会进入 URL。启用联网功能前请阅读[隐私说明](PRIVACY.zh-CN.md)、[安全说明](SECURITY.zh-CN.md)与[架构](ARCHITECTURE.md)。

## 兼容性

- Obsidian **1.11.4 或更高版本**
- 仅桌面端（`isDesktopOnly: true`）
- Release 必须包含 `main.js`、`manifest.json`、`styles.css`

## 常见问题

- **点击侧栏图标没有反应**：升级到最新版，也可从命令面板运行 **Open Todo Workspace**。当前版本会等待布局恢复，并在页面激活失败时显示明确提示。
- **今日清单为空**：检查日记位置、日期格式和 `ToDo` 标题，再在工作台点击刷新。
- **任务无法开始**：查看诊断；重复 ID 或来源修订变化会被拦截，避免写错行。
- **工作池内容太多**：配置 include 白名单，并保留对遗留笔记的单独忽略规则。
- **输入变卡**：关闭不用的 AI、Hub 与 API 功能并提交可复现路径；编辑器按键链本身不会扫描 Vault 或发网络请求。

## 开发验证

```bash
npm ci
npm test
npm run build
```

`npm run build` 会执行 Obsidian 社区规范门禁、TypeScript、生产构建、Release 文件检查和 2 MiB bundle 限制。

MIT 许可。可选 Backend 独立发行，并遵循各自的许可。
