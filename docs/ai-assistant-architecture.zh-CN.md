# ToWrite AI 助手架构

## 已实现的 V1

- AI 设置页可从 OpenAI-compatible `GET /models` 发现模型，同时保留手工模型 id 兜底。
- “测试连接”使用当前模型发起小型真实请求，验证认证、模型可用性和 `/chat/completions` 契约。
- 原生 Obsidian AI 助手支持自然语言输入、Obsidian Markdown 渲染/原文切换、模型切换、本地对话历史、上下文检查器和清空历史。
- `Ctrl/Cmd+Enter` 发送、`Shift+Enter` 换行；Backend 模式使用 `/` 搜索本地 Skill 仓库，使用 `@` 选择 Agent roster。
- 直连模型可调用 `ask_user_choice` function tool；Backend 使用受限的 `towrite-choice` 展示协议。两种路径都会生成本地选择卡片，卡片不会直接执行写入。
- 未连接 Backend 时，插件直接调用用户配置的 OpenAI-compatible 服务。
- 连接 Backend 时，插件复用 Backend 的模型目录、上下文对话和 Skill 执行接口；插件不复制 Backend 的 Agent 或 Skill 实现。

## 调用层选择

当前 Obsidian AI Backend 已经采用 FastAPI 与 LiteLLM。LiteLLM 适合继续承担多模型协议适配、认证、路由、重试、费用/限额和服务端日志等职责，因此没有必要在 Obsidian 插件里再引入第二套供应商适配层。

Vercel AI SDK 提供 OpenAI-compatible provider、自定义 transport、流式 UI 和消息持久化工具，适合 TypeScript Web/Node 应用的对话界面与传输层；但它本身不是一个与 LiteLLM 等价的多供应商网关。当前插件已经有 Svelte/Obsidian 原生 UI，而且直接依赖它会增加插件体积、浏览器环境兼容与流式请求处理成本，所以 V1 不引入。若后续把流式对话 UI 独立成 Node/Web 应用，可以在该层评估 Vercel AI SDK，而 Backend 仍保留 LiteLLM 路由。

## 数据流

```text
Obsidian 原生助手
  ├─ Backend 未启用 → 用户配置的 OpenAI-compatible /models + /chat/completions
  └─ Backend 已启用 → /models + /skills + /agents/roster + /agents/dialogue/chat-on-context
                                   └─ LiteLLM / Backend Agent / Skill
```

对话历史以 Obsidian 插件数据为运行状态，同时镜像到 `.obsidian-open-questions/ai/conversations.json`，便于用户检查和清理。上下文在每次发送前重新读取，并在界面中列出将发送的字段。记录目标重排仍使用独立的隐私过滤契约，不能因为 AI 助手支持正文对话而扩大其 payload。

## 后续建议

1. 增加多会话目录、对话重命名与按会话删除。
2. 为 Backend 对话接入流式响应和取消请求。
3. 为 Skill 增加权限声明、输入预览、运行产物列表和逐次授权。
4. 在 Backend 内统一模型能力元数据，例如 vision、tool calling、reasoning 与上下文窗口，而不是仅返回模型 id。
5. 若引入 MCP，只连接可信服务器，并在调用前展示将共享的数据与工具权限。

## 参考

- [OpenAI Models API](https://developers.openai.com/api/reference/resources/models/methods/list)
- [OpenAI conversation state](https://developers.openai.com/api/docs/guides/conversation-state)
- [OpenAI Skills](https://developers.openai.com/api/docs/guides/tools-skills)
- [OpenAI MCP security guidance](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)
- [Vercel AI SDK OpenAI-compatible providers](https://ai-sdk.dev/providers/openai-compatible-providers)
- [Vercel AI SDK chat UI](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)
- [LiteLLM documentation](https://docs.litellm.ai/)
