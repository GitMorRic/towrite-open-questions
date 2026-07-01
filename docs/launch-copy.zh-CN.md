# 发布文案

## 简短描述

把 ToThink 和 ToWrite 批注保留在原文旁边。

## 较长描述

ToWrite Open Questions 适合那些“差一点就写完”的笔记：还缺证据、解释、引用、测量数据，或者还需要再想一轮。

你可以从 Markdown 选区、PDF 选区、显式 Markdown 规则或触发词建议创建卡片。ToWrite 会优先显示当前笔记的未完成项，把 ToThink 和 ToWrite 分成可折叠区域，支持跳回原文行或 PDF 高亮，并导出 JSON 给 dashboard、桌面小组件、脚本或墨水屏设备使用。

可选 AI 可以为已保存卡片生成摘要、下一步建议，并从你的 vault 中重排相关本地笔记。AI 默认关闭，使用你自己配置的 OpenAI-compatible endpoint，不做联网搜索。

桌面端 External API 也默认关闭。启用后，它可以提供 token 保护的 JSON、RSS、SSE events、dashboard，以及状态/批注写回。

## 标语候选

- 让未完成的思考保持可见。
- 给严肃笔记加一层 ToThink / ToWrite。
- 跟踪草稿里还需要想清楚或写完的部分。
- 把写作缺口变成可跳转的原文卡片。

## 截图和动图计划

1. 技术笔记旁边显示当前笔记优先的右侧栏。
2. ToThink / ToWrite 分区折叠和展开。
3. 编辑器触发词建议，带 `+ Think` / `+ Write` 按钮。
4. 选区工具条，一键创建 Think / Write。
5. PDF 选区创建非破坏式 overlay 高亮。
6. 卡片编辑：标题、原文、批注、`[[双向链接]]` 和动作按钮。
7. Dashboard 显示解析后的开放卡片和文章统计。
8. External API 设置页，token 打码。
9. 可选墨水屏卡片输出。

## 发布帖结构

- 问题：笔记里的未完成思考很容易被普通 TODO 列表丢掉上下文。
- 方案：ToWrite 在问题出现的位置建立索引。
- 展示当前笔记优先的侧栏，以及可折叠 ToThink / ToWrite 分区。
- 展示 Markdown 和 PDF 选区捕获。
- 解释非侵入 sidecar 存储，以及显式固定原文锚点。
- 提到 JSON 导出、内置 dashboard、墨水屏和桌面小组件。
- 提到可选 AI 本地笔记推荐。
- 说明由于可选本地 HTTP API，当前市场版是桌面端插件。
- 邀请用户反馈规则语法、卡片 UI 和写作流程。
