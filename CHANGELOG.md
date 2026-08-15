# Changelog / 更新日志

## Unreleased

## 0.5.0 - 2026-08-15

- Added the local-only `note-focus` desktop action. A physical primary-button event can now open the task's exact Obsidian file, block, heading, text checkpoint, line, or PDF page in the main editor while keeping the complete Today list visible on the right.
- Added raw phone audio capture with `MediaRecorder`, a 45-second bounded recording session, local playback, IndexedDB Blob recovery, one-time handoff asset staging, and Markdown attachment persistence. Browser speech recognition remains an optional transcription enhancement instead of the only voice path.
- Added a no-write routing preview for phone captures: append to a note, create an idempotent Task Pool todo, or generate an approval-gated Agent proposal.
- Added a persisted Agent run state machine and local tool allowlist. Phone-originated Agent requests can currently propose only `create_todo`; a second explicit confirmation is required before the Connector calls TaskPoolService. Shell, deletion, credentials, and arbitrary model paths remain unavailable.
- Kept hardware decoupled from Obsidian and Agent internals. Existing Device Event v2/v3 and displayed ACK payloads are unchanged; new phone routes use opaque handoff and asset references.
- Added architecture documentation plus regression coverage for workspace action normalization, PWA script syntax, audio staging/consumption, route previews, Agent approval, replay rejection, and malformed persisted proposals.
- Production verification: 129 test files and 805 tests, Obsidian lint with zero warnings, TypeScript checks, production build, Release asset validation, and the 2 MiB bundle limit.

中文摘要：

- 新增仅在本机解析的 `note-focus` 桌面动作：实体主键可打开任务对应的 Obsidian 文件、block、heading、文本检查点、行或 PDF 页，同时在右侧铺开完整今日任务列表。
- 手机 PWA 新增 `MediaRecorder` 原始录音、45 秒限制、本地回放、IndexedDB Blob 恢复、一次性 handoff 音频暂存与 Markdown 附件写入；浏览器听写只作为可选增强。
- 新增不写入 Markdown 的归类预览，可确认追加笔记、创建幂等的工作池待办，或生成需要再次确认的 Agent 提案。
- 新增持久化 Agent 状态机和本地工具白名单。当前手机 Agent 只能提议 `create_todo`，再次确认后才由 Connector 调用 TaskPoolService；Shell、删除、凭据和模型提供的任意路径仍被禁止。
- 保持软硬件解耦：Device Event v2/v3 与 displayed ACK 载荷不变，新手机接口只使用不透明 handoff 和 asset 引用。
- 生产验证：129 个测试文件、805 项测试，以及 Obsidian lint、类型检查、生产构建、Release 资产校验和 2 MiB 包体限制全部通过。

## 0.4.6 - 2026-08-14

- Fixed carry-over migration rejecting top-level checkbox categories with `A Daily task with child tasks cannot be migrated as one leaf`. A level-one task such as `项目`, `创作`, `其他`, or `稍后阅读和记录` is now migrated as one authored Markdown subtree.
- Kept these dual-purpose task/category parents in their own preview and Today groups instead of placing them under `未分类`, while retaining the parent task itself and its nested numbered, checkbox, linked, and deeper child rows.
- Extended exact-duplicate consolidation to category subtrees. Matching parent categories merge their immediate child subtrees; byte-equivalent child structures are deduplicated conservatively, different children are retained, and colliding child block IDs are deterministically remapped.
- Added live subtask summaries inside the sticky merged-result preview so the final nested effect is visible before confirmation.
- Added regression coverage for subtree preflight, full-tree migration and source audit replacement, category grouping, nested child preservation, exact child merging, and conflicting block IDs.
- Production verification: 127 test files and 799 tests, Obsidian lint with zero warnings, TypeScript checks, production build, Release asset validation, and the 2 MiB bundle limit.

中文摘要：

- 修复一级复选框分类因“父任务仍有子任务”而迁移失败的问题；`项目`、`创作`、`其他`、`稍后阅读和记录` 现在会作为一棵完整的 Markdown 子树迁移。
- 一级节点继续同时充当任务和分类，预览与迁移后的今日视图都会归入它自己的分类，不再落入“未分类”；编号项、复选框、链接及更深层子任务都会保留。
- 同名一级分类合并时会继续合并各自的子任务树；只有结构和正文完全相同的子树才去重，不同内容全部保留，冲突的子任务 block ID 会被稳定重映射。
- 置顶的“合并后预览”现在会直接显示每个分类将带入的子任务摘要，确认前即可检查最终层级。
- 新增子树预检、完整迁移、来源审计替换、分类归组、嵌套结构保留、重复子树合并及 block ID 冲突的回归测试。
- 生产验证：127 个测试文件、799 项测试，以及 Obsidian lint、类型检查、生产构建、Release 资产校验和 2 MiB 包体限制全部通过。

## 0.4.5 - 2026-08-14

- Fixed migrated tasks losing their authored Markdown classification and appearing under `未分类`. When a historical leaf has no explicit category, migration now materializes its nearest containing group as the destination task's explicit category before the source lineage disappears.
- Unified migration duplicate analysis with the same destination-category rule. Identical text under different groups such as `项目` and `创作` is no longer considered an exact duplicate, while a historical structural group still matches an already-materialized destination category.
- Kept explicit task categories and canonical Task Pool categories higher priority than inherited Markdown groups.
- Added regression coverage for nested linked group labels, explicit-category precedence, classification-aware duplicate detection, and the actual migration create path.

中文摘要：
- 修复历史任务迁移后丢失原 Markdown 父分类、全部落入“未分类”的问题；任务本身没有显式分类时，会在迁移写入前把最近一层父分组固化为目标任务的显式分类。
- 完全重复项预检现在使用同一套最终分类规则；“项目”和“创作”下即使正文相同也不会被误合并，而历史父分组可以与今天已经固化的同名分类正确匹配。
- 任务自身的显式分类和任务池规范分类仍然优先，不会被父分组覆盖。
- 新增嵌套链接分组、显式分类优先、按分类去重及实际迁移创建路径的回归测试。

## 0.4.4 - 2026-08-14

- Added a one-click confirmation button directly to the sticky merged-result preview. Its disabled state, progress label, and execution path are shared with the footer action, and success or failure feedback now remains visible beside the preview.
- Fixed carry-over migration being blocked by an unrelated malformed task in a historical source note, such as `multiple-block-ids at line 8`. A selected leaf may now be replaced by its migration audit marker when its own id, revision, and structural node are all unique.
- Added full-batch source preflight before any destination Markdown is changed. Reused selected ids, stale revisions, ambiguous nodes, and parent tasks still fail closed; unrelated malformed rows are never edited or guessed.
- Localized the remaining migration identity errors in both the Dashboard and Obsidian notice instead of exposing the internal English diagnostic.
- Production verification: 127 test files and 793 tests, Obsidian lint with zero warnings, TypeScript checks, production build, Release asset validation, and the 2 MiB bundle limit.

中文摘要：

- 在置顶的“合并后预览”中新增一键确认按钮；它与底部按钮共用禁用状态、进度和执行逻辑，成功或失败反馈也会直接保留在预览区。
- 修复旧日记中无关的畸形任务（例如 `multiple-block-ids at line 8`）连带阻止已选任务迁移的问题；只要所选叶子任务自己的标识、修订和结构节点都唯一，就可以安全替换为迁移审计记录。
- 整批迁移会在修改任何目标 Markdown 前验证全部来源；真正重复的所选 ID、过期修订、歧义节点和父任务仍会安全拒绝，无关畸形行不会被自动修改或猜测。
- Dashboard 与 Obsidian 通知中的迁移标识错误均改为中文，不再直接显示内部英文诊断。
- 生产验证：127 个测试文件、793 项测试，以及 Obsidian lint、类型检查、生产构建、Release 资产校验和 2 MiB 包体限制全部通过。

## 0.4.3 - 2026-08-14

- Changed the live carry-over result preview from a flat list into the same category tree used by the final Today view. Explicit categories still win; otherwise the nearest authored Markdown group becomes the parent node.
- Existing Today destinations are grouped from the destination task itself, while new destinations use their selected historical representative, so duplicate consolidation previews the structure that will actually remain after migration.
- Kept pre-migration title editing and constrained drag-and-drop plus arrow controls to siblings within the same category. This prevents a cross-category visual order that the final grouped Today view could not preserve.
- Added projection and component regression coverage for category parents, child tasks, existing-destination grouping, and category-scoped ordering controls.
- Production verification: 127 test files and 791 tests, Obsidian lint with zero warnings, TypeScript checks, production build, Release asset validation, and the 2 MiB bundle limit.

中文摘要：

- 将实时迁移结果预览从扁平列表改为与最终 Today 列表一致的分类树；显式分类优先，否则使用 Markdown 最近一层父分组作为类型父节点。
- 归入今日现有任务时按目标任务的最终分类展示；新建任务按被选中的历史代表项分类，因此重复合并后的预览结构与真正留下的结构一致。
- 保留迁移前标题编辑，并把拖动和上下移动限制在同一类型的兄弟任务之间，避免出现最终分类视图无法保留的跨类型伪排序。
- 新增分类父节点、任务子节点、现有目标归组以及同类型排序控件的投影与组件回归测试。
- 生产验证：127 个测试文件、791 项测试，以及 Obsidian lint、类型检查、生产构建、Release 资产校验和 2 MiB 包体限制全部通过。

## 0.4.2 - 2026-08-14

- Added a sticky, live carry-over result preview that recalculates as individual tasks, whole dates, all tasks, or exact-duplicate consolidation are toggled. It shows selected sources, final destinations, new top tasks, merges into existing tasks, and duplicates removed.
- Made new migration destinations editable before writing. Edited titles are bound to stable, revision-derived migration-unit keys and are applied by the migration service rather than remaining visual-only drafts.
- Added pointer drag-and-drop plus accessible up/down controls for arranging the final top-of-day order. Existing destination tasks keep their authored position, and Task Pool projections keep their canonical title.
- Added execution-side validation so stale, unknown, blank, existing-task, or Task-Pool title overrides fail before any Markdown is changed.
- Production verification: 127 test files and 790 tests, Obsidian lint with zero warnings, TypeScript checks, production build, Release asset validation, and the 2 MiB bundle limit.

中文摘要：

- 新增置顶的实时迁移结果预览；单项、整日、全部勾选或切换完全重复合并时，会即时显示来源数量、最终任务、新增到顶部、归入今天现有以及减少的重复数量。
- 新建型迁移结果可以在写入前编辑标题；编辑内容绑定到带修订信息的稳定迁移单元，并由实际迁移服务执行，不是仅修改界面。
- 支持鼠标拖动和可访问的上下移动按钮调整今日顶部顺序；今天已有任务保持原位置，任务池投影保持规范标题。
- 执行端会拒绝过期、未知、空标题、已有任务或任务池标题改写，且在修改 Markdown 前完成校验。
- 生产验证：127 个测试文件、790 项测试，以及 Obsidian lint、类型检查、生产构建、Release 资产校验和 2 MiB 包体限制全部通过。

## 0.4.1 - 2026-08-14

- Fixed historical Daily migration into an empty ToDo section at the end of a note. Trimming trailing blank lines can no longer leave the prepend cursor outside the Markdown line array and cause `Cannot read properties of undefined (reading 'trim')`.
- Added a regression test for an empty trailing ToDo section with multiple final blank lines and verified that the migrated task remains parseable after insertion.
- Production verification: 127 test files and 787 tests, Obsidian lint with zero warnings, TypeScript checks, production build, Release asset validation, and the 2 MiB bundle limit.

中文摘要：

- 修复历史任务迁移到文档末尾空 ToDo 区域时的越界错误；清理尾部空行后会重新限制插入索引，不再触发 `undefined.trim()`。
- 新增“空 ToDo 位于文档末尾并带多个尾部空行”的回归测试，并验证迁移后的任务可以正常重新解析。
- 生产验证：127 个测试文件、787 项测试，以及 Obsidian lint、类型检查、生产构建、Release 资产校验和 2 MiB 包体限制全部通过。

## 0.4.0 - 2026-08-14

- Added safe, local named desktop actions through `[towrite-action:: action-id]`, with settings-managed mappings for ToWrite focus views, exact Vault positions, HTTPS URLs, and explicitly approved deep links. Remote devices continue to exchange opaque IDs instead of paths or commands.
- Changed the primary-button double click into a five-minute, one-time mobile handoff bound to the physically displayed card revision. The Hub never receives a reusable desktop action or Vault path, and replayed or concurrent submissions are rejected after the first successful write.
- Added the Web Push subscription contract, privacy-safe generic lock-screen notifications, PWA notification routing, and an IndexedDB offline queue for mobile notes, captures, later actions, and revision-guarded completion.
- Extended device display acknowledgements and heartbeats with optional firmware, screen, capability, and battery metadata while keeping the existing Device Event V2 tuple compatible.
- Added a fail-closed ESP32-S3 panel-driver boundary: firmware acknowledges a card and enables buttons only after a real driver reports a successful physical refresh. The supplied template intentionally remains disabled until the actual 2.7-inch controller and pinout are confirmed.
- Made historical carry-over visibly actionable: migration now reports in-place progress and errors, supports whole-day selection, prepends carried work to the safe top of today's planning surface, and can explicitly consolidate exact duplicates into one canonical destination while retaining an audit marker in every source note.
- Added the 90-day hardware Alpha roadmap, hardware bring-up checklist, launch copy, protocol documentation, and mobile/desktop security boundaries.
- Production verification: 127 test files and 786 tests, Obsidian lint with zero warnings, TypeScript checks, production build, Release asset validation, and the 2 MiB bundle limit.

中文摘要：

- 新增安全的本地命名动作 `[towrite-action:: action-id]`，可在设置中映射到 ToWrite 专注布局、Vault 内精确位置、HTTPS 链接和用户明确批准的深链接；远端设备仍只交换不透明 ID，不接触路径和系统命令。
- 主键双击改为创建五分钟有效、一次性使用的手机 handoff，并绑定到物理屏幕当时显示的卡片修订；首次成功写入后，重放或并发提交会被拒绝。
- 新增 Web Push 订阅协议、锁屏隐私通知、PWA 通知跳转，以及基于 IndexedDB 的离线记录队列；手机可记录文字、捕获内容、稍后处理，或在修订校验通过后完成任务。
- 设备显示 ACK 与心跳新增可选的固件、屏幕、能力和电量信息，同时保持现有 Device Event V2 tuple 兼容。
- 新增 fail-closed 的 ESP32-S3 屏幕驱动边界：只有真实驱动确认物理刷新成功后才回传 ACK 并启用按键。由于实际 2.7 英寸屏幕控制器和引脚尚未确认，仓库中的驱动模板会刻意保持禁用，避免把串口模拟误当成真机完成。
- 历史迁移现在会在按钮附近显示进度与错误，支持按日期整组选中，并把迁入任务放到今日计划区域的安全顶部；用户还可以显式开启“完全重复合并”，让多个来源归入一个今日任务，同时在每份原日记保留迁移审计记录。
- 新增 90 天硬件 Alpha 路线图、硬件 bring-up 清单、宣传文案、协议说明，以及手机与电脑的安全边界文档。
- 生产验证：127 个测试文件、786 项测试，以及 Obsidian lint、类型检查、生产构建、Release 资产和 2 MiB 包体限制全部通过。

## 0.3.9 - 2026-08-13

- Made project progress interactive: hover previews project tasks, left click pins details, and right click opens project colour controls, with equivalent keyboard actions and valid progress accessibility metadata.
- Made historical carry-over opt-in and revision-safe across dates. Reused task IDs are preflighted and assigned distinct deterministic destination IDs instead of silently merging or leaving a partially migrated batch.
- Preserved revision dates through the external Daily API and refreshed stale carry-over choices when historical notes change.
- Stopped configured Daily Notes from entering the ordinary Note Task synchronizer, preventing unexpected managed tasks from being appended to historical journal files.
- Recovered legacy free-form project trees even when an injected `ToDo` section exists, while excluding isolated journal reminders and unrelated outlines from the Daily plan.
- Kept new and migrated tasks beside an authored free-form planning tree instead of creating a shadowing `ToDo` heading; an explicitly authored empty `ToDo` section still remains the intended write target.
- Production verification: 126 test files and 768 tests, Obsidian lint with zero warnings, TypeScript checks, production build, release asset validation, and the 2 MiB bundle limit.

中文摘要：

- 项目进度条现在支持悬浮查看任务详情、左键固定详情、右键设置颜色，并补齐键盘操作与无障碍状态。
- 历史迁移改为手动勾选；跨日期复用任务 ID 时会在迁移前完成校验并分配独立目标 ID，不再静默合并，也不会迁移一半才报错。
- 外部 Daily API 会保留迁移来源日期，历史日记发生变化后迁移列表会自动失效并刷新。
- 配置为 Daily 来源的历史日记不会再进入普通笔记任务同步，避免在日记末尾意外写入托管任务。
- 旧版误加 `ToDo` 后，原有自由格式项目树仍会被识别；随记中的孤立复选框和普通大纲不会冒充今日任务。
- 新建和迁入任务会写入已有自由格式计划区，不再创建遮蔽项目的 `ToDo`；如果用户明确写了空的 `ToDo`，则继续以该区块作为目标。
- 生产验证：126 个测试文件、768 项测试，以及 Obsidian lint、类型检查、生产构建、Release 资产和 2 MiB 包体限制全部通过。

## 0.3.8 - 2026-08-13

- Kept Workbench navigation responsive when Workflow is not configured: switching between Today, Work Pool, Status, and Journal is now local-first and no longer depends on successfully persisting the Obsidian workspace layout.
- Added a zero-configuration Workflow guide with a one-click recommended sequence (`Inbox → Raw → Sparks → Initialize → Processing → Archive`), clear distinctions between Workflow stages, question states, article types, and tags, and direct access to advanced tag mapping.
- Preserved hierarchical Daily planning for Book Sprint-style notes: numbered linked project entries and nested checkbox tasks inherit their nearest linked target while ordinary numbered notes remain descriptive content.
- Stabilized current-task and Today surfaces across draft materialization, carry-over handling, timing actions, popovers, and progressive plan loading.
- Added regression coverage for navigation without Workflow data, zero-config onboarding, hierarchical linked tasks, Daily draft behavior, and narrow-layout scrolling.

## 0.3.7 - 2026-08-12

- Prevented deleted or edited provisional Daily tasks from leaving stale `draft_*` timing errors that replaced the Today workspace with an error banner.
- Stabilized draft task identity across unrelated Daily Note edits and rebuilt current draft references before explicit start, complete, timing, and menu actions.
- Reused timing snapshots already produced with the Daily dashboard so refreshes cannot race against deleted draft tasks.
- Restored a resilient settings-page grid at narrow and wide widths, with regression coverage for the navigation and content columns.
- Production verification: 124 test files and 747 tests, Obsidian lint with zero warnings, TypeScript checks, production build, release asset validation, and the 2 MiB bundle limit.

## 0.3.6 - 2026-08-12

- Fixed Daily Note source detection so an untouched legacy `Daily/YYYY-MM-DD` placeholder follows Obsidian's configured Daily Notes folder and date format.
- Expanded unfinished-task handling from only yesterday to earlier available Daily Notes, with source-date labels, revision-safe migration, and a persistent “handled” choice that reappears only when the source changes.
- Restored Daily editor action clicks by allowing hover widgets to receive pointer events, and stopped normal-priority tasks from inserting a visible priority symbol into authored Markdown.
- Added visible fallback project colors and clearer segmented progress styling without requiring manual color configuration.
- Reworked the Journal into a calendar-style month view with selected-day completion, invested time, migration history, and marker-scoped write-back feedback.
- Clarified deterministic summary preview versus confirmed Daily Note write-back and added regression coverage for no-heading Daily Notes and legacy source migration.
- Production verification: 123 test files and 745 tests, Obsidian lint with zero warnings, TypeScript checks, production build, release asset validation, and the 2 MiB bundle limit.

## 0.3.5 - 2026-08-12

- Made checkbox parents dual-role items: a line such as `- [ ] Project` can remain a directly completable task while also grouping nested Daily tasks and tasks projected from linked notes.
- Added read-only aggregate completion. An unchecked parent is shown as complete only after every descendant and linked-note task is complete; explicitly checking the parent still completes the parent immediately without rewriting its children.
- Preserved authored Markdown as the source of truth: aggregate state is computed in memory, and only an explicit user action changes a checkbox in the Daily Note.
- Added aggregate progress and linked-task counts to the Today dashboard, Work Pool, device deck, and daily activity calculations.
- Deferred expensive Vault-backed startup reconciliation and coalesced background index work so large Vaults become interactive before the full Work Pool is ready.
- Production verification: 123 test files and 743 tests, Obsidian lint, TypeScript checks, production build, release asset validation, and the 2 MiB bundle limit.

中文摘要：

- 父级复选框现在兼具“任务”和“分类”两种角色：例如 `- [ ] 项目` 可以直接勾选，也可以汇总日记中的子任务及关联笔记内的任务。
- 未手动勾选的父任务会在全部下级任务完成后显示为汇总完成；手动勾选父任务则立即完成父任务，但不会偷偷改写子任务。
- 汇总状态只在内存中计算，Markdown 仍是数据真源；只有用户明确执行操作时才写回原文。
- 今日工作台、工作池、设备卡片和活动统计会显示汇总进度与关联任务数量。
- 大型仓库的完整索引与校准继续放到后台串行执行，优先让 Obsidian 与工作台可交互。
- 生产验证：123 个测试文件、743 项测试，以及 Obsidian lint、类型检查、生产构建、Release 资产和 2 MiB 包体限制全部通过。

## 0.3.4 - 2026-08-11

- Changed the Todo Workspace Ribbon action to open a full Obsidian popout workbench and made the Daily Note migration prompt focus the migration picker instead of silently reusing an obscured tab.
- Restored cached state before background index reconciliation, moved full Vault scans out of the layout-ready critical path, and coalesced duplicate Work Pool reloads so opening the plugin no longer waits on repeated full-index composition.
- Sanitized every e-ink card field before rendering: Markdown links, wiki links, checkbox syntax, inline code, ToWrite metadata, and `^daily_*` identifiers are no longer shown as screen content.
- Kept the 2.7-inch preview intentionally glanceable: overview cards show date, battery, overall/project progress and the current task; task cards add state, start time, target, goal, next step, and invested/estimated time; reminder cards show source, summary, and reason.
- Added regression coverage for popout activation, progressive Work Pool loading, and compact e-ink rendering.

中文摘要：

- 左侧 Todo 工作台现在打开完整的 Obsidian 独立弹出窗口；日记中的“迁移昨日任务”会直接聚焦迁移选择器，不再看起来像没有响应。
- 启动时先恢复缓存，再在后台重建完整索引；工作池会合并重复刷新请求，避免打开插件时因多次全库组合而长时间空白。
- 墨水屏卡片会统一清理 Markdown 链接、Wiki 链接、复选框语法、行内代码、ToWrite 元数据和 `^daily_*` 标识，不再把技术文本当成显示内容。
- 2.7 英寸预览保持可扫读：总览显示日期、电量、整体与项目进度和当前任务；任务页补充状态、开始时间、目标、下一步与投入时间；提醒页显示来源、摘要和出现原因。
- 新增弹出窗口、渐进式工作池加载与墨水屏文本清理回归测试。

## 0.3.3 - 2026-08-11

- Changed the license for version 0.3.3 and later to PolyForm Noncommercial 1.0.0, with commercial use available only under a separate written license; earlier releases keep the license that accompanied them.
- Removed the remaining production `fetch` calls reported by the Obsidian community scanner; Backend and Device Hub requests now share the desktop HTTP transport with explicit cancellation and response-size limits.
- Made Ribbon and command view activation wait for workspace restoration, reconfigure existing leaves, rebuild stale leaves once, and surface failures through an Obsidian Notice instead of silently doing nothing.
- Added regression coverage for dashboard and sidebar activation across restored, missing, and stale workspace leaves.
- Replaced the outdated marketplace README and screenshot with the current Today, Work Pool, Status, Journal, and Focus Now product model in English and Simplified Chinese.
- Cleared the full Obsidian compatibility warning report and changed the production lint gate to fail on any future warning instead of hiding warnings with `--quiet`.

## 0.3.2 - 2026-08-11

- Replaced the Echo settings section's manual HTML heading with Obsidian's native `Setting.setHeading()` API, resolving the blocking community-review finding while preserving accessibility and layout.
- Added an Obsidian marketplace-rule gate based on the official `eslint-plugin-obsidianmd`; blocking guideline violations now fail local production builds before a release is created.
- Added a dedicated GitHub Quality workflow for `main`, Codex branches, and pull requests, and connected the same guideline gate to the stable Release workflow.
- Separated blocking marketplace rules from the non-blocking compatibility warning backlog so genuine submission failures remain visible without masking future runtime or TypeScript checks.
- Documented the review gate and release procedure for contributors and release maintainers.
- Production verification: 121 test files and 730 tests, Obsidian blocking rules, typecheck, runtime dependency audit, production build, release asset validation, and the 2 MiB bundle limit.

中文摘要：

- 将 Echo 设置区手写的 HTML 标题替换为 Obsidian 原生 `Setting.setHeading()`，修复社区审核中的唯一阻断错误，并保留无障碍关联与原有布局。
- 接入官方 `eslint-plugin-obsidianmd`，本地生产构建会在创建 Release 前阻止违反 Obsidian 社区规范的代码。
- 新增 GitHub Quality 工作流，覆盖 `main`、Codex 分支和 Pull Request；稳定版 Release 工作流使用同一规范门禁。
- 将阻断上架的规范错误与非阻断兼容性建议分离，避免历史警告掩盖真正的提交失败，同时继续保留类型检查与运行时测试。
- 更新贡献与发布文档，明确社区审核和 Release 流程。
- 生产验证：121 个测试文件、730 项测试、Obsidian 阻断规则、类型检查、运行时依赖审计、生产构建、Release 资产验证及 2 MiB bundle 门限全部通过。

## 0.3.1 - 2026-08-11

- Fixed the Workbench Journal runtime error by providing block editor decorations through a CodeMirror state field.
- Prevented the Open Questions sidebar's Daily summary from shrinking and clipping the current task row.
- Removed stale ToWrite-owned Ribbon elements before rebuilding shortcuts, preventing duplicate Todo Workspace icons after reloads.

## 0.3.0 - 2026-08-11

- Made Daily Note editing zero-disturbance: refreshes and indexes are read-only, and a stable `^daily_*` identity is added only when the user explicitly starts, completes, edits, migrates, sends, or schedules that exact task.
- Added revision-checked draft task materialization so a changed line is rejected instead of writing an ID into a neighboring list item.
- Treated checkbox parents with ordinary numbered children as categories while preserving checkbox parent/child task hierarchies and explicit `towrite-kind:: task` overrides.
- Changed Daily task actions to a hover-only, absolutely positioned disclosure that does not change line height; ToWrite technical fields remain protected atomic ranges.
- Added the Workbench Journal surface, persistent transition ledger, daily/monthly aggregation, marker-scoped Markdown write-back, and versioned journal API endpoints.
- Deferred Vault-backed indexes, ledgers, optional servers, bridges, and device scheduling until Obsidian layout restoration completes.
- Migrated API keys and long-lived tokens to Obsidian SecretStorage and scrubbed migrated plaintext values from `data.json`.
- Raised the minimum Obsidian version to 1.11.4, retained desktop-only support, replaced direct deletion with Trash, and added release version/asset/2 MiB bundle checks.
- Reworked the English and Chinese README files around the three-minute start, natural Daily Markdown, Workbench surfaces, data ownership, network disclosure, and troubleshooting.
- Production verification: 120 test files and 727 tests, typecheck, production build, release asset validation, and Capture Vault deployment.

中文摘要：

- 日记编辑现在真正“零打扰”：刷新、索引和扫描只读；只有用户明确开始、完成、编辑属性、迁移、发送或安排某一任务时，才给该任务写入稳定 `^daily_*` ID。
- 临时任务首次执行前会重新校验文档修订、行号和正文指纹；任务行已变化时直接拒绝，不会把 ID 写到相邻编号列表。
- 带普通编号子项的 checkbox 默认作为分类；父子 checkbox 任务和显式 `towrite-kind:: task` 仍保持兼容。
- 日记任务操作改为悬停后出现的绝对定位三点按钮，不改变行高；技术字段继续作为不可误入、不可误删的原子区域。
- 工作台新增“日志”页、长期任务 transition JSONL 账本、日/月汇总、marker 范围内的日记写回和版本化日志 API。
- Vault 索引、账本、可选服务器、Bridge 和设备调度均延后到 Obsidian 布局恢复完成后启动。
- API Key 和长期 token 迁移到 Obsidian SecretStorage，迁移成功后从 `data.json` 清除明文。
- 最低 Obsidian 版本提升到 1.11.4，继续限定桌面端；直接删除改为回收站，并增加版本、Release 资产和 2 MiB bundle 检查。
- 中英文 README 重新围绕三分钟上手、自然日记 Markdown、工作台各页面、数据所有权、联网披露和故障排查编排。
- 生产验证：120 个测试文件、727 项测试、类型检查、生产构建、Release 资产检查和 Capture Vault 同步全部通过。

## 0.3.0-beta.25 - 2026-08-11

- Added configurable Obsidian Ribbon shortcuts and reduced the default Ribbon to the core Todo Workspace entry; Questions, Capture, AI, and Focus shortcuts can be enabled independently in Settings.
- Applied Ribbon changes immediately without restarting the plugin while keeping every feature available through the Command Palette.
- Removed Vault reads, linked-note traversal, parsing, indexing, and network work from the editor keystroke path.
- Debounced and serialized incremental Markdown task updates, startup indexing, Work Pool reconciliation, and background exports to reduce typing latency on large Vaults.
- Added regression coverage that prevents editor-change handlers from performing synchronous I/O or recursive task scans. The production suite now covers 717 tests.

中文摘要：
- 左侧 Ribbon 快捷入口现在可以在设置中独立开关；默认只显示核心的“待办工作台”，问题、记录、AI 与“现在专注”入口默认收起。
- Ribbon 设置保存后立即生效，不需要重启插件；被隐藏的功能仍可从命令面板打开。
- 编辑器按键热路径不再读取 Vault、遍历关联笔记、解析索引或发起网络请求。
- Markdown 待办同步、启动索引、工作池校准与后台导出改为更长防抖和串行执行，降低大型 Vault 中的输入卡顿。
- 新增性能回归测试，防止以后再次把同步 I/O 或递归扫描放回输入链路；当前生产测试共 717 项。

## 0.3.0-beta.24 - 2026-08-10

- Prevented Daily task normalization from inserting stable IDs while a wikilink or Markdown link is still being typed.
- Deferred ToWrite task suggestions inside unfinished `[[note]]` input so Obsidian's native note-link completion remains in control; plain-text Work Pool suggestions remain available.
- Added deterministic, higher-contrast default project colors to Today progress and made each project color editable by click or context menu.
- Reworked the project legend into a responsive grid and changed the color picker into a compact floating panel so project groups no longer look compressed.
- Added regression coverage for unfinished wikilinks and Markdown links. The production suite now covers 714 tests.

中文摘要：
- 日记任务中的 Wikilink 或 Markdown 链接尚未输入完成时，不再提前插入稳定 ID，避免把链接和后续列表写乱。
- 输入未闭合的 `[[笔记]]` 时，ToWrite 会让 Obsidian 原生笔记联想接管；普通文本形式的工作池联想保持可用。
- 今日进度中的每个项目现在自动获得稳定、对比度更高的默认颜色，也可以通过点击或右键修改。
- 项目图例改为响应式网格，颜色选择器改为紧凑悬浮面板，不再挤压项目分类和今日卡片。
- 增加未完成 Wikilink 与 Markdown 链接的回归测试；生产测试现覆盖 714 项。

## 0.3.0-beta.23 - 2026-08-10

- Protected Daily task IDs and ToWrite-owned metadata as compact CodeMirror atomic ranges in Source and Live Preview modes, preventing accidental cursor entry or deletion while keeping Markdown as the source of truth.
- Added safe Daily task-structure repair, unified Obsidian/Wikilink/relative Markdown target resolution, and kept valid task transitions available when unrelated new rows are still missing stable IDs.
- Added revision-checked migration of yesterday's unfinished work into Today, preserving task identity, timing, device references, and a compact audit marker in the previous Daily Note.
- Added the global “locate current focused task” command and blank-editor double-click shortcut, with precise source opening, scrolling, and temporary focus highlighting.
- Added deterministic daily and natural-month analytics for completion, active/pause time, interruptions, writing units, note activity, and project/category distribution without collecting task or note contents.
- Clarified the Status surface with Workflow, Article Type, question-state, and tag-mapping explanations plus direct configuration, refresh, and Work Pool navigation actions.
- Extended the versioned Daily API with previous-task migration, focus location, and daily/monthly analytics endpoints. The production suite now covers 713 tests.

中文摘要：

- 日记任务 ID 与 ToWrite 技术字段现在会在源码模式和实时预览中折叠为不可误入、不可误删的原子区域，同时继续保存在可读 Markdown 中。
- 新增安全的日记任务结构修复，统一 Wikilink、相对 Markdown 链接、父分类与任务目标解析；其他新任务尚未补齐 ID 时，不再阻塞已有任务开始。
- 新增“处理昨日未完成”，通过修订检查把任务迁移到今天，保留原任务身份、计时、设备引用，并在昨天的日记中留下紧凑迁移记录。
- 新增“定位当前专注任务”命令和 Markdown 空白处双击定位，自动打开来源、滚动到任务并短暂高亮。
- 新增不采集正文的每日/月度统计，包括完成率、投入与暂停时间、中断、写作单位、笔记活动及项目/类别分布。
- 状态页补充 Workflow、文章类型、问题状态和 tag 映射说明，并提供配置、刷新及返回工作池入口。
- Daily API 增加昨日任务迁移、专注定位和日/月统计接口；生产测试现覆盖 713 项。

## 0.3.0-beta.22 - 2026-08-10

- Increased the contrast and hover feedback of the compact Daily task disclosure so the `···` control remains visible in light themes.
- Added an explicit `↗` action beside linked Daily rows. It opens the associated Obsidian note directly without relying on Live Preview's edit-mode link gesture.
- Rebuilt linked-note task projections whenever the Daily cache changes, and safely registered previously untracked checkbox tasks in Daily-linked notes before rendering the expandable `child tasks x/y` projection.
- Kept excluded Work Pool sources excluded from automatic linked-task registration.
- Added regression coverage for the linked-note open affordance. The production suite now covers 709 tests.

中文摘要：

- 提高日记任务行 `···` 按钮在浅色主题中的对比度，并增加明确的悬停反馈。
- 关联文档任务旁新增 `↗` 快捷入口，可直接打开对应的 Obsidian 文档，不再依赖 Live Preview 编辑态的链接点击手势。
- Daily 缓存变化时立即重建关联文档任务投影；关联文档中尚未登记的 checkbox 会先安全进入任务索引，再恢复可展开的“子任务 x/y”。
- “不整理”来源仍不会被自动登记。
- 补充关联文档打开入口的回归测试；当前生产测试共 709 项。

## 0.3.0-beta.21 - 2026-08-10

- Refined Today into compact project groups, clearer task rows, a project-weighted progress bar, and project color customization shared with the 2.7-inch preview.
- Simplified the default task presentation by moving technical target, timing, and device details behind explicit controls; Focus Now now groups the daily outline by project.
- Allowed an already tracked Daily task to start or complete even when newly typed sibling tasks still need stable block IDs.
- Fixed task action popovers overlapping each other or the inline property editor. Timing and More are now mutually exclusive, and entering edit mode closes and hides both menus.
- Added regression coverage for Daily transitions, compact layouts, project grouping, and mutually exclusive task menus. The production suite now covers 708 tests.

中文摘要：

- “今日”改为更紧凑的项目分组与任务行，增加按项目权重计算的进度条、项目颜色设置，并同步到 2.7 英寸墨水屏预览。
- 技术性的目标、计时和设备策略默认收起；“现在专注”中的今日缩略也按项目归类。
- 新输入的相邻待办尚未补齐稳定 ID 时，已有的已跟踪任务仍然可以正常开始和完成。
- 修复任务行的“时间与进度”“更多操作”和属性编辑卡片相互重叠：两个浮层现在互斥，进入编辑状态会自动关闭并隐藏浮层。
- 补充 Daily 状态切换、紧凑布局、项目分组和菜单互斥回归测试；当前生产测试共 708 项。

## 0.3.0-beta.20 - 2026-08-10

- Tightened the free-form Daily Note fallback so ordinary numbered outlines, link indexes, reading lists, and their plain child rows no longer appear as Today tasks or Work Pool commitments.
- A row is now adopted from the full Daily Note body only when it is a Markdown checkbox itself or is nested beneath a checkbox category. Explicit `ToDo` and `今日计划` sections keep their existing compatibility behavior.
- Preserved the intended compact format of checkbox categories with numbered linked children, while standalone checkbox tasks continue to work normally.
- Kept newly detected Daily tasks on a stable single line: only a compact `···` disclosure is shown by default, and the property/skip actions expand only after an explicit click.
- Added regression fixtures covering project directories, platform lists, valid checkbox task islands, and the compact enrichment disclosure. The production suite now covers 704 tests.

中文摘要：

- 收紧自由日记正文的待办识别：普通数字目录、链接索引、阅读清单及其普通子项不再进入“今日”或工作池。
- 只有 Markdown checkbox 本身，或嵌套在 checkbox 分类下的列表项，才会从整篇日记正文中被识别；明确的 `ToDo` 和 `今日计划` 区段保持原有兼容行为。
- 保留“checkbox 分类 + 编号链接子任务”的简洁写法，独立 checkbox 待办也继续正常工作。
- 新识别的 Daily 待办默认只在原行显示紧凑的 `···` 入口；只有主动点击后才展开属性与跳过操作，切换任务行时不再上下跳动。
- 使用项目目录、平台清单、有效 checkbox 任务岛与紧凑展开控件补充回归测试；当前生产测试共 704 项。

## 0.3.0-beta.19 - 2026-08-10

- Fixed Today plans staying empty when an Obsidian Daily Note keeps its checklist in the free-form journal body instead of under a dedicated `ToDo` or `今日计划` heading.
- Added a safe Daily-source fallback order: populated `ToDo` section, populated plan section, then the current Daily Note body (or the matching date section in fixed-document mode).
- Parent checkbox rows with nested items remain structural categories and do not inflate progress; pure local-note leaves are normalized into tasks while preserving numbered-list markers, and empty list rows are ignored.
- Added an exact regression fixture for categorized Chinese Daily Notes containing wikilinks and Markdown links. The production suite now covers 702 tests.

中文摘要：

- 修复日记中的待办没有放在 `ToDo` 或 `今日计划` 标题下时，“今日”仍显示为空的问题。
- 解析顺序调整为：有内容的 `ToDo` → 有内容的计划区段 → 当天日记正文；固定规划文档则只回退到对应日期区段。
- 带子项的父级 checkbox 继续作为分类，不计入进度；纯本地笔记链接叶子会保留数字列表标记并自动成为任务，空白列表项会被忽略。
- 使用中文分类、wikilink 和 Markdown 链接的实际日记结构补充回归测试；当前生产测试共 702 项。

## 0.3.0-beta.18 - 2026-08-10

- Added mixed Daily checklist support: checkbox category rows, numbered Markdown links, wikilinks, and nested checkbox tasks can now coexist without inflating category rows into task counts.
- Pure local-note link leaves are adopted safely while preserving their numbered or bulleted list marker; prose rows that merely contain a link still require explicit confirmation.
- Added stable Daily-to-linked-note relations so checkbox tasks inside linked project notes appear under the related Work Pool item without copying their Markdown source.
- Added a compact, collapsible child-task projection beside linked Daily rows. Completing or reopening a projected task writes directly to the linked note with relation and task revision checks.
- Kept linked-note discovery and projection refresh outside the editor keystroke path, with debounced cache refresh and per-path document deduplication.
- Added regression coverage for mixed list syntax, numbered-link normalization, nested target inheritance, and stable linked-note references. The production suite now covers 701 tests.

## 0.3.0-beta.17 - 2026-08-10

- Changed Markdown-task discovery to a configurable allowlist: Daily sources, notes linked from Daily task blocks, Workflow/Inbox notes, and notes with active ToThink/ToWrite questions are included by default, while explicit file/folder exclusions always win.
- Added recursive Daily-to-project note relations so linked project notes and their nested task documents remain discoverable without scanning unrelated Vault content.
- Added settings for manual task-source allowlists and automatic Daily-link, Workflow, Inbox, and question-source inclusion.
- Fixed plugin startup when the Work Pool suggestion cache is restored before Workflow and Inbox indexes are initialized.
- Kept stable `^daily_*` task identities in Markdown while concealing them in Reading, Live Preview, and Source modes; Daily task actions now stay behind a compact disclosure shown only on the selected row.
- Fixed orphaned timers from deleted or moved Daily tasks so their automatic pause no longer blocks starting the current task.
- Added regression coverage for allowlist precedence, linked-note traversal, startup ordering, concealed Daily IDs, compact task controls, and orphaned timer coordination. The production suite now covers 699 tests.

中文摘要：

- 普通 Markdown 待办改为白名单发现：默认包含日记、日记任务块提及的笔记、Workflow/Inbox 笔记以及存在活跃 ToThink/ToWrite 问题的来源笔记；手动“不整理名单”始终拥有最高优先级。
- 支持沿日记中的项目链接递归发现子文档待办，不再为了找任务扫描无关的整个 Vault。
- 设置页新增手工白名单，以及日记链接、Workflow、Inbox、开放问题来源的自动纳入开关。
- 修复工作池联想缓存早于 Workflow/Inbox 索引初始化时导致的插件加载失败。
- `^daily_*` 稳定 ID 继续保存在 Markdown 真源中，但在阅读、Live Preview 和 Source 模式隐藏；任务操作只在选中行显示一个紧凑的展开入口。
- 修复旧日记任务被删除或移动后留下的计时状态，避免它阻止当前任务开始。
- 补充白名单优先级、链接递归、启动顺序、Daily ID 隐藏、渐进操作控件和孤立计时协调测试；生产测试套件现覆盖 699 项测试。

## 0.3.0-beta.16 - 2026-08-07

- Added Daily-note hierarchy projection so ordinary nested checklist leaves under `今日计划` appear in the unified Work Pool while category/container rows remain groups instead of inflating task counts.
- Added fallback compatibility for Obsidian Daily Notes templates that place editable tasks under `今日计划` while keeping a canonical but empty `ToDo` section.
- Added cache-only task and note completion suggestions while typing an open Markdown checkbox, including partial-title matching such as `ob` to `obsidian-待办清单`.
- Kept Daily tasks linked to their Markdown source: existing Daily rows cannot be scheduled twice, provisional rows are normalized before state changes, and completion uses revision-checked Daily mutations.
- Added regression coverage for Daily fallback headings, nested project classification, Work Pool projection, target resolution, and Markdown task input suggestions. The production suite now covers 689 tests.

## 0.3.0-beta.15 - 2026-08-05

- Fixed Focus Now controls, mode switching, navigation shortcuts, pin actions, and responsive layout so compact pop-outs remain clickable and no longer overlap at narrow widths.
- Reused Obsidian's core Daily Notes folder, filename format, and template as the default Today-plan source, while preserving the optional ToWrite custom source and bidirectional Markdown editing.
- Added task and note suggestions while composing Work Pool items, background Markdown-task refresh, clearer source actions, and grouped Status note details by project, Workflow stage, or article type.
- Added non-destructive Work Pool cleanup for legacy tasks: hide individual items or exclude an entire Vault file/folder from display and future automatic organization, with restore controls in both the Work Pool manager and settings. Source Markdown is never deleted or marked complete.
- Added regression coverage for saved visibility rules, folder matching, Work Pool filtering, Daily Notes discovery, compact Focus Now layout, and task projection. The production suite now covers 682 tests.

中文摘要：

- 修复“现在专注”中的模式切换、提醒翻页、快捷入口、固定操作与窄窗口自适应；缩小悬浮窗后不再重叠，所有按钮均可正常点击。
- 默认复用 Obsidian 核心“日记”插件的目录、命名格式和模板作为今日计划原文，同时保留 ToWrite 自定义来源和 Markdown 双向编辑。
- 新建工作项时会搜索并推荐已有任务或笔记；普通 Markdown 待办改为后台增量刷新，来源操作更明确，“状态”里的笔记明细支持按项目、Workflow 阶段或文章类型查看。
- 新增非破坏性的遗留待办清理：可隐藏单条，或将整篇 Vault 文件/文件夹加入“不整理名单”；工作池管理器和设置页都能恢复。原 Markdown 不会被删除，也不会被标记为完成。
- 补充隐藏规则、文件夹匹配、工作池过滤、Obsidian 日记识别、窄悬浮窗与待办投影回归测试；生产测试套件现覆盖 682 项测试。

## 0.3.0-beta.14 - 2026-08-05

- Consolidated planning and management into one ToWrite Workbench with three top-level surfaces: Today, Work Pool, and Status. Today keeps only the active plan, while all creation, classification, scheduling, and source actions live in the Work Pool.
- Added a unified Work Pool projection for Markdown tasks, ToThink and ToWrite questions, Inbox notes, and Workflow notes. It supports saved two-level views, project boards, source/stage/type filters, note grouping, project colors and icons, and revision-checked actions without copying source content into a hidden database.
- Made unchecked Markdown tasks automatically discoverable and trackable, kept Task Pool technical fields hidden in Reading, Live Preview, and Source modes, and added safe formatting previews plus compact progressive task-property controls.
- Reframed the pinned pop-out as Focus Now, with a single-task timer mode and a compact Today list. It can rotate the Daily theme, user phrases, Inbox items, questions, Echo candidates, and stale-note reminders without loading the full Work Pool on every refresh.
- Refined the 2.7-inch e-ink Daily deck around an overview, task pages, and a reminder/inbox page, with project-aware segmented progress, battery status, displayed-first actions, and backward-compatible device event handling.
- Fixed the Focus Now empty-state overlap in narrow Obsidian pop-outs by isolating its mode switch, message carousel, scrollable main content, and shortcut bar into explicit grid rows instead of a theme-sensitive generic footer layout.
- Added layout, grouping, state migration, task-pool projection, Focus Now carousel, e-ink deck, and device-interaction regressions. The production suite now covers 677 tests.

中文摘要：

- 将重复的规划和管理入口合并为唯一的 ToWrite 工作台，一级导航固定为“今日｜工作池｜状态”；今日只负责当天承诺，任务创建、分类、安排和来源管理统一放在工作池。
- 新增统一工作池投影，将普通 Markdown 待办、ToThink、ToWrite、Inbox 和 Workflow 笔记放在同一处管理；支持可保存的两级视图、横向项目看板、来源/阶段/类型筛选、项目颜色与图标，并继续以各自 Markdown、Sidecar 和 frontmatter 为数据真源。
- 未完成的 Markdown checkbox 可自动进入任务池；Task Pool 技术字段在阅读、Live Preview 和 Source 模式中默认隐藏，并提供带 diff、修订检查和撤销的格式整理，以及渐进展开的任务属性控件。
- 悬浮窗更名为“现在专注”，支持单任务计时和今日缩略两种模式；顶部可轮播今日主题、用户自定义句子、Inbox、问题、Echo 与陈旧笔记提醒，同时避免每次刷新加载完整工作池。
- 2.7 英寸墨水屏今日卡组调整为概要、任务和提醒/收件箱页面，增加按项目分段的进度、电量状态、displayed 优先操作和兼容旧固件的设备事件处理。
- 修复 Obsidian 窄悬浮窗中“今天还没有计划”与快捷操作重叠：模式切换、消息轮播、可滚动主内容和底部操作改为明确的独立网格行，不再使用容易被主题样式影响的通用 footer。
- 补充工作台布局、工作池分组与迁移、Markdown 待办投影、现在专注轮播、墨水屏卡组和设备手势回归测试；生产测试套件现覆盖 677 项测试。

## 0.3.0-beta.13 - 2026-07-30

- Added a Markdown-first task pool that automatically tracks unchecked note tasks, keeps completed work in history, and lets the Today planner select and schedule existing tasks without duplicating their source text.
- Added compact task-property controls, local timing journals, start/pause/resume/complete transitions, target inheritance, webpage and Obsidian checkpoint navigation, plus a pinned Today pop-out and embeddable Today card.
- Fixed the pinned Today window's Today / Task Pool switch in Obsidian pop-outs by using a native state control, preventing layout persistence from replaying stale state, and forcing the selected surface to redraw.
- Upgraded Daily planning to the `towrite-daily-plan/v2` Markdown contract with mutually exclusive daily-note and fixed-document sources, Today/Tomorrow planning, theme/primary/minimum metadata, ordered full task blocks, unique `[/]` current-task transitions, duplicate-ID diagnostics, and complete-block CAS that preserves user notes and nested lists.
- Added the three-page e-ink deck (`daily_overview`, one card per `daily_plan_item`, and `daily_result`) plus displayed-first three-button gestures: main single starts/opens, main double opens create-only Capture without creating an empty file, main long reserves recording, left/right navigate pages/tasks, and right long safely completes only the exact ACKed task.
- Added schema-v2 display acknowledgements and gesture events with exact device/selection/content/revision/card/playlist tuples, persisted at-most-once desktop-command handling, bounded command expiry, Hub long polling, and ESP32-S3 reference firmware with 45 ms debounce, 320 ms double-click, and 700 ms long-press timing.
- Extended Capture Bridge v2 with a server-enforced create-only handoff used by both the native Obsidian modal and the Tailscale Capture PWA; phone requests cannot supply a target path, and cancel/reload never creates an empty note.
- Added a dedicated Today Dashboard backed by `Daily/YYYY-MM-DD.md`: plan tasks, note creation/editing, one-shot device cards, explicit completion/reopen, deterministic summaries, preview-before-write AI wording, and a compact sidebar summary all work without the optional Backend.
- Accepted both inline and indented multiline Daily metadata/block IDs, preserved full logical-block revisions, recognized standard Obsidian Tasks priority symbols, and kept those priorities through local and Backend mutations.
- Added content-free daily activity accounting for positive/net visible writing units, new and uniquely modified notes, completed tasks, resolved questions, Capture commits, and selected/displayed cards. Measurements run after debounced Vault changes, raw events expire after the configured retention period, and export/pause/clear controls remain local.
- Added an exact All Status Dashboard with Workflow-stage × question-status counts, Article Type, Inbox, stale-note, ToThink, and ToWrite totals sourced from the complete incremental index instead of sidebar result limits.
- Added `daily_plan_item` and `daily_summary` device cards, future-24-hour scheduling, displayed-card-first NFC snapshots, state/revision/playlist guarded ESP32 completion, idempotent event ACKs, and automatic queue advance after a safe completion.
- Added the versioned Daily External API, trusted single-writer DailyOps handshake, Capture Bridge v2 voice/audio/task operations, and Hub support for persisted `available_at` candidates so scheduled cards can advance while Obsidian is closed.
- Preserved the existing ToThink/ToWrite, Inbox, Echo, Quote0, Capture Bridge v1, legacy e-ink paging, and External API behavior; the production suite now covers more than 400 plugin tests.

中文摘要：

- Daily 计划升级为 `towrite-daily-plan/v2` Markdown 契约：每日笔记与固定规划文档两种来源互斥，支持今日/明日编排、主题/主任务/最低承诺、完整任务块排序、唯一 `[/]` 当前任务、重复 ID 诊断，以及保留用户说明和嵌套列表的完整块 CAS。
- 新增墨水屏三页卡组：`daily_overview`、每条计划对应的 `daily_plan_item` 和 `daily_result`；三键动作严格绑定设备实际 ACK 的 displayed 内容。主键单击开始并打开、双击打开 create-only Capture、长按预留录音；左右键切页/切任务，右键长按仅安全完成眼前任务。
- 新增 schema v2 显示 ACK 与手势事件，完整校验 device/selection/content/revision/card/playlist tuple，持久化桌面命令幂等与过期时间，并补充 Hub 长轮询和带 45 ms 防抖、320 ms 双击、700 ms 长按的 ESP32-S3 示例。
- Capture Bridge v2 新增服务端强制的 create-only handoff，原生 Obsidian 弹窗和 Tailscale Capture PWA 共用；手机不能提交目标路径，取消或刷新也不会提前产生空笔记。
- 新增以 `Daily/YYYY-MM-DD.md` 为数据真源的“今日”Dashboard：支持当天任务、新建/修改笔记、一次性定时卡片、显式完成/重开、规则总结、AI 文案预览后写回，以及侧栏紧凑摘要；没有 Backend 也能完整使用。
- 同时支持行内与缩进多行的 Daily 元数据/block ID，以完整逻辑任务块计算修订；识别标准 Obsidian Tasks 优先级符号，并在本地与 Backend 修改时保留优先级。
- 新增不保存正文的今日活动统计：正向新增/净增可见写作单位、新建与去重修改笔记、完成任务、解决问题、Capture 提交和卡片 selected/displayed；全文计算只在 Vault 变化后 debounce 执行，原始事件按保留期清理，并可本地导出、暂停和清空。
- 新增准确的“全部状态”Dashboard，展示 Workflow 阶段 × 问题状态、Article Type、Inbox、陈旧笔记、ToThink 与 ToWrite；数量来自完整增量索引，不受侧栏结果上限影响。
- 新增 `daily_plan_item` / `daily_summary` 设备卡、未来 24 小时定时上传、displayed 优先的 NFC 冻结快照、带 state/revision/playlist 校验的 ESP32 安全完成、幂等事件 ACK，以及完成后的自动换卡。
- 新增版本化今日 External API、可信 DailyOps 单写入者握手、Capture Bridge v2 语音/音频/任务操作，并让 Hub 持久化 `available_at` 候选，从而在 Obsidian 关闭后仍可按时推进卡片。
- 保持 ToThink/ToWrite、Inbox、Echo、Quote0、Capture Bridge v1、旧墨水屏翻页和 External API 兼容；生产测试套件现覆盖 400 余项插件测试。

## 0.3.0-beta.12 - 2026-07-23

- Separated true ToThink / ToWrite annotation counts from small-screen paging progress. Obsidian and the ESP32 compatibility payload now expose the current queued card as a stable `N / total` position even though the selected item is promoted to the front of each response; manual-only cards remain single previews.
- Classified Echo/reference cards as display samples rather than ToWrite annotations, while preserving their separate settings-backed card library and explicit paging opt-in.
- Made the Obsidian connection card prefer the Hub's acknowledged displayed card over a newer desired selection when the two differ.
- Renamed the Quote0 diagnostic action and card so connection tests are clearly outside the ToThink / ToWrite collection and never imply that they advance rotation.

中文摘要：

- 将真实 ToThink / ToWrite 批注数量与墨水屏翻页进度彻底分开；即使当前卡会被置于响应首位，Obsidian 与 ESP32 仍会显示稳定的“第 N / 总数张”，未加入轮播的手动卡则保持“单张预览”。
- Echo / 参考模板卡改为明确的样板分类，不再被显示成 ToWrite 批注；它们仍保存在独立卡片库中，并只在用户明确开启后进入翻页。
- 当 Hub 的期望选择与设备 ACK 的实际显示不同时，Obsidian 连接卡优先显示屏幕真正 ACK 的卡片。
- Quote0 连接诊断改名并补充说明，明确测试内容不属于 ToThink / ToWrite，也不会推进轮播。

## 0.3.0-beta.11 - 2026-07-23

- Added a persistent small-screen connection card in the Obsidian sidebar and detailed diagnostics in both Device Library and API & Devices settings. It distinguishes API disabled/stopped, waiting for the first poll, authenticated ESP32 online, stale polling, and sanitized device-route errors.
- Fixed problem-card “send” actions that appeared to do nothing: local screen controls no longer depend on Device Hub, snapshot errors are visible on the card, and the selected local card is durably saved before any optional Hub request.
- Clarified delivery truth in notices and status: local selection, Hub desired state, device online state, and display ACK are reported separately instead of claiming a disconnected screen changed.
- Added safe in-memory External API telemetry for the latest authenticated `/api/v1/eink` poll, served card, playlist revision, target, and hardware-button event without retaining credentials, card bodies, or Vault paths.
- Added one-click local API startup plus scoped ESP32 token generation/copying in settings. Existing Tailscale Serve or LAN routing remains an explicit user choice.
- Updated the ESP32-S3 example with a bounded Wi-Fi connection attempt and a rate-limited status footer for Wi-Fi, API, target, and last successful sync; unchanged cards still avoid full e-ink refreshes.
- Added connection-state, runtime privacy, firmware contract, send-feedback, persistence-order, and lightweight polling regression tests.

中文摘要：

- Obsidian 右侧栏新增常驻“小屏连接”卡片，“设备内容库”和“API 与设备”设置也会显示详细诊断；可区分 API 关闭/未监听、等待首次拉取、ESP32 已认证在线、拉取超时和经过脱敏的请求错误。
- 修复问题卡点击发送看似无反应：本地小屏按钮不再依赖 Device Hub，快照错误会直接显示，并且当前卡会在任何可选 Hub 请求之前可靠写入插件数据。
- 发送提示不再混淆“本地已选择、Hub desired、设备在线、屏幕 ACK”四种状态；离线设备不会被误报为已经刷新。
- External API 新增仅驻留内存的安全遥测，记录最近一次已认证 `/api/v1/eink` 拉取、返回卡片、播放列表修订、target 和硬件按键事件，不保存凭据、卡片正文或 Vault 路径。
- 设置页可一键启动本地 API，并为 ESP32 生成/复制独立 target token；是否通过 Tailscale Serve 或局域网暴露仍由用户明确配置。
- ESP32-S3 示例增加有超时的 Wi-Fi 连接和限频状态 footer，显示 Wi-Fi、API、target 与最后成功同步；内容不变时仍不会整屏刷新。
- 新增连接状态、运行遥测隐私、固件契约、发送反馈、持久化顺序和轻量轮询回归测试。

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
