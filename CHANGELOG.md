# Changelog / 更新日志

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
