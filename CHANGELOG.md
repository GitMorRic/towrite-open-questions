# Changelog / 更新日志

## 0.3.0-beta.10 - 2026-07-23

- Unified saved Echo templates and ToThink / ToWrite annotations into one template-first small-screen playlist, including manual current-card selection, wrapping next/previous paging, and backwards-compatible `/api/v1/eink` fields.
- Fixed Echo “save and show” on installations whose working ESP32 still uses the local External API; an incomplete or temporarily offline Device Hub no longer prevents the local screen selection from changing.
- Added a visible screen-paging opt-in and queue summary to the card workbench. Saved preset drafts join paging by default, while Agent selection remains explicitly opt-in.
- Added idempotent hardware-button processing, target-bound device tokens, and header-only device authentication so concurrent retries cannot double-advance or control another target.
- Added an ESP32-S3 example with configurable right/left GPIO buttons, five-second change detection, template-first paging, and no unnecessary e-ink redraws.
- Cached the compatibility playlist between data changes and added a lightweight current-selection read so frequent device polls do not rebuild the full candidate set or clone handoff history.

中文摘要：

- 将已保存的 Echo 模板卡与 ToThink / ToWrite 划线卡统一成模板优先的小屏翻页队列，支持手动设为当前、上一张/下一张与末尾循环，同时保持旧 `/api/v1/eink` 字段兼容。
- 修复 ESP32 仍读取本地 External API 时，Echo“保存并显示”看似无反应的问题；Device Hub 未配完整或临时离线时，本地小屏当前卡仍会正常切换。
- 卡片工作台新增醒目的“小屏按键翻页”开关和队列统计；参考模板明确保存后默认加入翻页，但 Agent 选择仍需用户单独授权。
- 按键事件增加并发幂等、target 与设备 token 绑定和纯请求头鉴权，避免网络重试翻两页或跨设备控制。
- ESP32-S3 示例新增可配置左右 GPIO、5 秒变化检测、模板优先翻页，以及内容未变化时不重复刷新墨水屏。
- 兼容播放列表只在数据变化后重建，并用轻量方式读取当前选择，避免设备频繁轮询重新扫描完整候选或复制 handoff 历史。

## 0.3.0-beta.9 - 2026-07-23

- Added prominent “Create custom card” and “Open card library” shortcuts at the top of Device Hub settings, and changed the settings tabs to wrap instead of hiding the card entry in a horizontal scroller.
- Moved the actual Device Hub connection and provisioning controls ahead of the separate Local Capture Bridge section.
- Added an ESP32 provisioning checklist with validated canonical HTTPS endpoints for desired polling, display ACKs, and button events, plus safe copy actions for endpoint templates and the one-time device configuration.
- Bound the one-time device secret to the Hub origin that issued it, rejected loopback/non-canonical origins for hardware configuration, and prevented private Tailscale Serve origins from being presented as directly reachable by a normal ESP32.
- Clarified when an Echo card was only selected locally instead of actually sent to a connected display, and corrected the simulator documentation to use its hidden device-secret prompt.

中文摘要：

- Device Hub 设置页顶部新增醒目的“新建手写卡片”和“打开卡片库”入口；设置标签改为自动换行，不再把卡片入口藏在横向滚动区域。
- 将真正的 Device Hub 连接与设备配对配置移到独立的本机 Capture Bridge 之前。
- 新增 ESP32 接入清单，自动生成并校验 desired 长轮询、display ACK 和按键事件端点，并可安全复制端点模板与本次一次性设备配置。
- 一次性设备密钥现在绑定到签发它的 Hub origin；硬件配置拒绝 loopback 和非 canonical 地址，也不会把私有 Tailscale Serve 错当成普通 ESP32 可直连入口。
- 明确区分“仅设为本地当前卡片”和“已发送到设备”，并修正模拟器文档，改用隐藏的设备密钥输入。

## 0.3.0-beta.8 - 2026-07-23

- Added a user-managed Echo card workbench for 2.7-inch e-ink displays, with blank cards, eight reference templates, a live 264 × 176 monochrome preview, explicit AI inference/simulation/perspective labels, and one-to-three display actions.
- Echo cards can be sent manually or explicitly opted into Agent, rotation, and daily schedule selection; reference templates remain inert until copied and saved by the user.
- Unified Echo cards with the local NFC/Capture snapshot path, including opaque Hub refs, local target authorization, revision conflict checks, safe Inbox fallback, and correct generic capture handling for custom question-shaped cards.
- Added layout budgets, strict persistence normalization, overlapping-schedule de-duplication, double-send protection, and tests that keep template editing off the settings write/network hot path.
- Manual “show now” selections request vibration by default, while Hub DND/quiet policy silently downgrades them; device-authenticated e-ink buttons can submit idempotent `useful`/`later`/`skip` feedback against the current desired version.
- Prevented Bearer-authenticated device feeds from embedding the long-lived External API token in generated browser URLs.

中文摘要：

- 设置页新增面向 2.7 英寸墨水屏的 Echo 卡片工作台：支持空白卡、8 个参考模板、264 × 176 黑白实时预览、明确的 AI 推测/模拟/视角标记，以及 1–3 个屏幕操作。
- Echo 卡可手动发送，也可由用户明确加入 Agent、循环和每日定时选择；参考模板在用户复制并保存前不会进入候选库。
- Echo 卡与本地 NFC/Capture 快照链路统一，包含 Hub opaque 引用、本地目标授权、修订冲突检查、安全 Inbox 兜底，以及自定义问题卡的正确通用记录行为。
- 新增小屏布局预算、严格持久化规范化、重叠定时去重、防重复发送，并确保模板输入过程不触发设置写入、网络或索引工作。
- 手动“立即显示”默认请求振动，但 Hub 在勿扰/静默时段会静默降级；墨水屏可用 Device 鉴权幂等提交 `useful`/`later`/`skip` 按键反馈。
- 使用 Bearer 鉴权读取设备 Feed 时，不再把长期 External API token 嵌入生成的浏览器链接。

## 0.3.0-beta.7 - 2026-07-21

- Added a top-level Inbox beside All, ToThink, and ToWrite. It incrementally indexes configured Quick Notes folders and groups pending notes by project or folder without reading note bodies.
- Inbox notes can be opened directly or explicitly selected as the current e-ink/NFC target; only title-level candidates that pass local privacy rules may enter Agent recommendations.
- Moved the full Device Content Library out of the sidebar into a dedicated Inbox & Library settings tab with open, show-now, remove, mode, and rotation controls.
- Reworked the recommendation and filter surfaces around Obsidian's neutral theme tokens, keeping color only where it communicates category, online status, or selected/displayed mismatch.
- Added metadata-only, path-boundary, incremental-update, grouping, search, and settings-migration tests.

中文摘要：

- 顶部新增 Inbox，与全部、ToThink、ToWrite 并列；可增量收集配置的 Quick Notes 目录，并按项目或文件夹分组，全程不读取笔记正文。
- Inbox 笔记可直接打开，也可手工设为墨水屏/NFC 当前内容；进入 Agent 候选的只有通过本地隐私过滤的标题级信息。
- 完整“设备内容库”从侧栏移到独立的“Inbox 与设备库”设置页，集中管理打开、立即显示、移出、Agent/循环/定时模式。
- UI 改为 Obsidian 原生中性色，仅在分类、在线状态和 selected/displayed 不一致时保留有语义的颜色。
- 新增目录边界、增量更新、分组、搜索、无正文读取和设置迁移测试。

## 0.3.0-beta.4 - 2026-07-20

- Added Device Hub V1 with scoped receiver/device pairing, non-enumerable identifiers, secret-bound device authentication, persistent selected/displayed state, long polling, ACK handling, NFC tap routing, encrypted PWA writeback, and an ESP32 simulator contract.
- Added the Device Content Library: ToThink and ToWrite annotations automatically become eligible cards, while manual selection, Agent selection, loop rotation, and fixed schedule modes control what the screen should show.
- Added Tailscale Serve setup and NFC Tools guidance, including an in-plugin tap URL generator, NTAG213 byte validation, current display preview, and selected/displayed consistency checks.
- Kept editor-side collection off the keystroke path and added privacy, authorization, ordering, and end-to-end regression coverage for Device Hub delivery.
- Added an About settings tab showing the installed version, minimum Obsidian version, MIT license, GitHub project, release downloads, documentation, issue reporting, and a reserved support-link slot.

中文摘要：

- 新增 Device Hub V1：包含 Receiver/设备配对、不可枚举 ID、设备密钥绑定鉴权、持久化 selected/displayed 状态、长轮询、ACK、NFC 跳转、加密 PWA 写回与 ESP32 模拟协议。
- 新增“设备内容库”：ToThink/ToWrite 划线会自动进入候选库，并支持手动选择、Agent 选择、循环轮播和固定时间表四种发送模式。
- 补充 Tailscale Serve 与 NFC Tools 操作流程；插件可生成碰一碰 URL、校验 NTAG213 容量、预览当前显示内容，并检查 selected/displayed 是否一致。
- 保持编辑器输入热路径无网络和全库扫描，并补充 Device Hub 的隐私、鉴权、乱序与端到端回归测试。
- 设置页新增“关于”标签，显示当前版本、最低 Obsidian 版本、MIT 许可、GitHub、Release 下载、文档、问题反馈及预留的赞助入口。

Known V1 boundaries: the concrete ESP32/e-paper display driver and an always-on hosted Hub worker are not bundled in this plugin release; loop and schedule progression currently run while the Obsidian Connector is active.

## 0.3.0-beta.3 - 2026-07-16

- Removed synchronous full decoration and sidebar refreshes from the editor keystroke path; CodeMirror now maps existing ranges while typing and uses a targeted effect for data changes.
- Batched startup Vault reads with bounded concurrency and event-loop yields, while publishing the core question index before optional knowledge and Workflow scans finish.
- Made question, local-knowledge, Workflow, and sidecar updates incremental, race-safe, and coalesced so autosave no longer repeatedly scans the full Vault.
- Fixed a PDF highlight MutationObserver feedback loop and limited PDF observation to the active viewer.
- Reduced retained Workflow memory, delayed background work until typing is quiet, and eliminated per-article Store scans in the sidebar.
- Added regression coverage for editor updates, bounded startup batches, atomic index commits, concurrent rebuilds, incremental Workflow indexing, and PDF mutation filtering.

中文摘要：

- 移除打字热路径中的全量装饰与侧栏刷新；输入时只映射现有 CodeMirror 标记，数据变化时才定向重建。
- 启动索引改为限制并发、分批处理并主动让出事件循环，核心问题列表会优先显示。
- 问题索引、本地知识索引、Workflow 与 sidecar 改为增量和竞态安全更新，自动保存不再反复扫描整个 Vault。
- 修复 PDF 高亮观察器的自循环，降低 Workflow 常驻内存，并让后台任务避开持续输入时段。
- 新增性能与竞态回归测试，覆盖启动、输入、增量索引和 PDF 观察器路径。

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
