# Changelog / 更新日志

## 0.3.0-beta.2 - 2026-07-13

- Added a native AI assistant with Obsidian Markdown rendering, source view, persistent local history, context inspection, model switching, and keyboard-first composition.
- Added OpenAI-compatible model discovery, editable model selection, API-key reveal/copy controls, and real generation connectivity tests with reasoning-model headroom.
- Added optional Backend model, Skill-library, and Agent-roster integration, including `/` Skill loading, `@` multi-Agent context, structured Backend client contracts, and stream event support.
- Added safe `ask_user_choice` interactions that render model-requested decisions as bounded local choice cards without automatically writing to the Vault.
- Restored live Article Type and Workflow-stage updates, refined sidebar/ribbon discovery, and kept current-note, open-question, Quote0, Push, and External API behavior compatible.
- Refined question-card controls with theme-aware quiet pills, visible menu affordances, keyboard focus states, and a right-aligned dropdown triangle.
- Updated bilingual privacy, security, architecture, and Community Plugin submission documentation for the new capture, learning, Backend, and AI data flows.

中文摘要：

- 新增原生 AI 助手，支持 Obsidian Markdown 渲染、原文查看、本地对话历史、上下文检查、模型切换和键盘快捷输入。
- 新增模型发现、模型选择、API Key 显示/复制、真实连通性测试，以及 Backend Skill 仓库、Agent roster、`/` 与 `@` 交互。
- 新增安全的 AI 选择卡片；模型可以请求用户决策，但卡片本身不会自动写入 Vault。
- 修复 Article Type 与 Workflow Stage 的即时刷新，并优化侧栏入口、卡片属性控件和明暗主题表现。
- 补齐中英文隐私、安全、架构和社区插件提交说明。

## 0.3.0-beta.1 - 2026-07-12

- Added the native Smart Capture modal for new notes, selections, and question-card answers.
- Added local existing-note, folder/Workflow, and Inbox recommendations with previews, revision checks, idempotent writes, and safe undo.
- Added versioned capture recommendation, commit, and undo endpoints while preserving legacy capture clients.
- Added content-free session learning, user-approved habit candidates, the sidebar Now center, quiet hours, and notification limits.
- Added optional Obsidian AI Backend capability negotiation, allow-listed target reranking, and aggregate-only habit-copy enhancement.
- Added incremental local indexing, privacy scopes, readable learning/capture-target exports, and query-token migration hardening.
- Added bilingual privacy and security documentation for the new local and optional network data flows.

## 0.2.8-beta.1 - 2026-07-08

- Added Quote0 integration with Text / Image / Canvas dashboard previews, device selection, manual send, forced refresh, and NFC writeback links.
- Added an optional automatic Dot device refresh after successful Quote0 sends to reduce visible screen-update delay.
- Added the Push Engine foundation for reusable targets, display cards, context-aware scheduling, and Quote0 as the first hardware adapter.
- Added Article Types and hierarchical tag parsing so notes can be classified by content type and Workflow stage at the same time.
- Upgraded the sidebar with current-note lane sections, article type tabs, all Workflow stage tabs including zero-count stages, compact classified-note cards, and removable editor markers.
- Unified article/workflow display data across the sidebar, Obsidian dashboard, `/api/v1/device-feed`, and Quote0 dashboard sources.
- Added documentation for Quote0 setup, data consistency, demo scripts, promotion copy, and release checks.

中文摘要：

- 新增 Quote0 接入，支持 Text / Image / Canvas dashboard 预览、设备选择、手动发送、强制刷新和 NFC 写回链接。
- 新增 Quote0 发送成功后的自动设备强刷选项，减少屏幕迟迟不更新的等待感。
- 新增通用 Push Engine 基础能力，把目标设备、展示卡片、情境调度和 Quote0 适配器拆开。
- 新增 Article Types 和层级 tag 解析，让笔记可以同时按内容类型和 Workflow 阶段归类。
- 升级右侧栏：当前笔记 lane 分区、文章类型 tabs、包含 0 数量的完整 Workflow tabs、紧凑归类笔记卡片，以及可移除的编辑器标记。
- 统一侧栏、Obsidian dashboard、`/api/v1/device-feed` 和 Quote0 dashboard 的文章/workflow 数据来源。
- 补充 Quote0 配置、数据一致性、演示脚本、宣传文案和发布检查文档。

## 0.2.7 - 2026-07-02

- Removed the remaining Obsidian 1.13 settings APIs from the settings tab so the declared 1.5.0 minimum app version is accurate.
- Kept the settings heading on Setting#setHeading while restoring the stable imperative display path.
- Preserved the CSS cleanup with zero !important declarations.

中文摘要：

- 移除设置页里残留的 Obsidian 1.13 新 API，让声明的最低版本 1.5.0 和源码实际兼容。
- 保留官方要求的 Setting#setHeading，同时恢复稳定的 display 渲染路径。
- 保留 CSS 清理结果，styles.css 仍然没有 !important。

## 0.2.6 - 2026-07-02

- Restored the imperative settings display fallback so the settings page renders in older or manually installed Obsidian builds.
- Kept the new settings definition entry for newer Obsidian versions while returning the minimum app version to 1.5.0.
- Preserved the 0.2.5 CSS cleanup with zero !important declarations.

中文摘要：

- 恢复设置页 display 兼容入口，修复部分 Obsidian 版本或手动安装场景下设置页空白的问题。
- 新版 Obsidian 仍保留 getSettingDefinitions 入口，同时最低版本回到 1.5.0。
- 保留 0.2.5 的 CSS 清理结果，styles.css 里仍然没有 !important。

## 0.2.5 - 2026-07-02

- Removed all remaining !important declarations from plugin CSS to satisfy Obsidian style review warnings.
- Kept the existing plugin-scoped selectors and build output behavior unchanged.

中文摘要：

- 移除插件 CSS 中剩余的全部 !important，清理 Obsidian 样式审核 warning。
- 保留原有插件作用域选择器和构建输出方式。

## 0.2.4 - 2026-07-02

- Switched the settings page to Obsidian's getSettingDefinitions() API and kept the heading on Setting#setHeading.
- Raised the 0.2.4 minimum Obsidian version to 1.13.0 to match the new settings API.
- Cleaned the frontmatter export write path to avoid unsafe assignment warnings.
- Wrapped the edit modal submit handler so it no longer returns a Promise where Obsidian expects void.
- Switched PDF overlay timer calls back to window.requestAnimationFrame/setTimeout per Obsidian review guidance.
- Renamed the selection toolbar document field to avoid the popout compatibility warning.

中文摘要：

- 设置页切换到 Obsidian 新的 getSettingDefinitions() API，并继续使用 setHeading。
- 0.2.4 的最低 Obsidian 版本提升到 1.13.0，以匹配新设置 API。
- 修复 frontmatter 写入、弹窗 Promise、PDF timer、选区工具条字段名等审核 warning。

## 0.2.3 - 2026-07-02

- Added a five-tab settings layout: General, Cards & Editor, Workflow, API & Device, and AI.
- Rewrote the Chinese settings copy so the settings page no longer shows corrupted text.
- Improved popout compatibility for the PDF overlay, selection toolbar, and editor suggestion widgets by using the active document/window context.
- Cleaned review warnings around unhandled promises, unsafe frontmatter writes, unnecessary type assertions, unused code, and low-risk CSS rules.
- Updated the GitHub Release workflow to publish only the three Obsidian plugin assets: main.js, manifest.json, and styles.css. Zip packages are now local/manual distribution artifacts only.

中文摘要：

- 设置页改成顶部 tab 栏，分为“通用 / 卡片与编辑器 / Workflow / API 与设备 / AI”。
- 修复设置页中文文案乱码。
- PDF 高亮层、选区工具条和编辑器建议按钮改成更适合 popout 窗口的文档上下文写法。
- 清理 Obsidian 自动审核提示的 Promise、frontmatter、类型断言、未使用代码和低风险 CSS warning。
- GitHub Release 不再上传 zip，只保留 main.js、manifest.json、styles.css。

## 0.2.2 - 2026-07-02

- Deferred expensive refresh work to reduce typing lag in Obsidian.
- Improved the small-screen device preview controls and 2.7-inch e-ink layout behavior.
- Fixed Workflow stage color swatches and release workflow artifact attestations.
- Added documentation for required vault enumeration and clipboard access behavior.

## 0.2.1 - 2026-07-02

- Removed the dynamic eval-based server loading path and switched to direct Node http loading.
- Preserved user sidebar/dashboard layout on plugin unload.
- Improved Markdown preview rendering lifecycle in card previews.
- Adjusted release packaging and manifest details for community plugin review.

## 0.2.0 - 2026-07-01

- Added the built-in /device small-screen preview page and /api/v1/device-feed protocol.
- Added Workflow Stages indexing, workflows.json export, and /api/v1/workflows.
- Added phone companion input pages and POST /api/v1/captures for device-originated ideas.
- Added richer External API examples, dashboard improvements, and Chinese documentation.
- Added PDF sidecar anchors, PDF overlay highlights, compact editor markers, card folding, and ToThink/ToWrite lane filters.

## 0.1.0 - 2026-06-28

- First distributable version.
- Added ToThink/ToWrite annotation cards for Markdown and PDF selections.
- Added local JSON exports, dashboard examples, and the initial Obsidian sidebar workflow.
