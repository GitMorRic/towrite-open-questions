# ToWrite PRD 中文版

## 产品意图

ToWrite 帮助写作者追踪 Obsidian Markdown 笔记里的未完成思考和未完成写作。

它的核心单位不是任务，而是「未闭合问题」：记录还没有解决的地方、它出现在哪里，以及未来继续写作时需要的上下文。

ToWrite 有两条 lane：

- ToThink：需要推理、证据、研究或决策。
- ToWrite：需要续写、扩写、改写或补文。

## 目标用户

- 收集证据和解释的技术写作者。
- 写草稿时留下引用、实验或判断问题的研究者。
- 记录软硬件决策的 maker。
- 经常在文中写「这里还要补」但之后找不到上下文的写作者。

## 核心用户故事

- 我可以在 Markdown 中留下明确的问题规则，并在侧栏看到它们。
- 我可以得到触发词建议，但 ToWrite 不会自动替我保存。
- 我可以选中一段文字，把它保存为 ToThink 或 ToWrite，而不直接改正文。
- 我可以在 PDF 中选中文字，把它保存为附着到该 PDF 的卡片。
- 我打开一篇笔记时，可以立刻看到这篇还没闭合的地方。
- 我可以通过 JSON 或 External API 把问题显示到 dashboard、桌面卡片或墨水屏上。

## V1 范围

- Markdown 问题提取。
- 触发词建议和编辑器加号。
- 选区问题写入 sidecar JSON。
- PDF 选区保存文件路径、选中文本、页码和归一化高亮矩形。
- 当前笔记优先侧栏。
- 全库 dashboard。
- Obsidian 原生右侧栏折叠/展开。
- JSON 导出。
- 中文/英文设置页。
- 桌面端 External API：JSON、RSS、SSE、状态写回和备注写回。

## AI 与本地知识范围

- AI 默认关闭。
- 用户显式配置 OpenAI-compatible `baseUrl`、`apiKey`、`model` 后才会请求。
- 本地推荐基于 Obsidian `Vault` 和 `MetadataCache`，不依赖外部 Obsidian CLI。
- 本地索引使用文件名、路径、frontmatter、标签、标题、heading path 和正文片段。
- 已保存卡片可以手动刷新摘要、下一步建议、相关笔记和相关概念。
- 自动后台 AI 只处理正式保存的问题，不处理触发词建议，并遵守会话上限。
- AI 失败只写入卡片错误状态，不影响索引、跳转或导出。

## 非目标

- 修改 PDF 文件本体或把批注写入 PDF 内容。
- 在 Obsidian/PDF viewer DOM 变化后仍保证所有 PDF 跳转都像素级精准。
- 云同步服务。
- 内置账号系统、云中继或托管公网服务。
- 联网搜索或无人值守消耗 token。
- 完整任务管理器替代品。

## 数据模型

`OpenQuestion` 包含 lane、title、question、note、notes 活动流、tags、color、kind、status、source、可选 block id、可选 PDF page、可选选区 anchor、时间戳和可选 AI 字段。

`OpenQuestionSuggestion` 更轻量，只表示编辑器里的可添加建议。用户点击之前不会进入导出。

选区 anchor 使用 offset 和上下文。源文本移动过多时，卡片会标记为 orphaned，而不是悄悄指向错误位置。

## 成功标准

- 一篇有未完成问题的笔记可以在两秒内变得可扫描。
- 触发词命中不会在用户确认前进入导出。
- 选区问题默认不修改 Markdown。
- JSON 和 API 足够稳定，可以给外部 dashboard、桌面卡片和墨水屏使用。
- 插件可以按标准 Obsidian release assets 打包。
