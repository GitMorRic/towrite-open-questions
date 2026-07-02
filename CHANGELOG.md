# Changelog / 更新日志

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
