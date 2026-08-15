# 今日 Dashboard 与每日计划

[English](daily-dashboard.md) | 简体中文

ToWrite 把每日计划与全库状态索引明确分开：

- **今日**：用于编排今天或明天，显示主题、当前任务、之后两项、进度、排序操作、候选项和 2.7 英寸墨水屏预览。
- **数据与复盘**：是“今日”中的二级区域，显示写作与活动统计、完成记录、定时卡片和规则总结；这些数据不会挤进墨水屏首屏。
- **全部状态**：显示完整索引中的 Workflow 阶段、Article Type、Inbox、stale、ToThink 和 ToWrite 数量，不从今日计划推算。
- 侧栏只增加紧凑的“今日”摘要和 Dashboard 入口，不会把今日数字混进原有的 All/ToThink/ToWrite/Inbox 数字。

每日计划在没有 AI、没有可选 Backend 时也能完整使用。AI 默认关闭，只能重排编排候选，或根据同一份结构化数据改写总结；它不能计算统计、加入或完成任务，也不能修改设备状态。

## Markdown 是数据真源

每日计划 V2 契约为 `towrite-daily-plan/v2`。设置中只能选择一种计划来源：

1. **每日笔记**（默认）：`Daily/YYYY-MM-DD.md`。
2. **固定规划文档**：默认 `Planning/Daily Plans.md`，每一天使用一个 `## YYYY-MM-DD` 分区。

升级用户继续使用已经配置的每日笔记位置，ToWrite 不会自动移动旧计划。Dashboard 提供“今日 / 明日”切换，可以打开当前 Markdown 原文；所有编辑都会写回同一个来源。

Dashboard 顶部会直接显示当前唯一真源的路径、文件是否存在、已识别任务数、待规范化数量和格式诊断。若当天的每日笔记尚不存在，可以点击“创建计划页”，只建立标题与 `ToDo` 区段，不虚构任务。若你的待办已经写在另一份长期笔记中，请在设置里把“每日计划来源”切换为固定规划文档；ToWrite 不会为了凑出 Dashboard 数字而扫描全 Vault 的所有 checkbox。

清单上方的快速新增、任务 checkbox、属性编辑、排序、开始与完成操作都会通过 `DailyPlanService` 的完整任务块 CAS 写回该 Markdown。反过来，直接在原文中修改任务后，Dashboard 会在 Vault 变更事件 debounce 后自动刷新，不需要重启插件。分类在 Dashboard 中修改时会写成显式的 `[towrite-category:: ...]`；它改变分组投影，但不会擅自重排用户手写的父分类层级。

计划区段默认是 `## 今日计划`，任务区段使用 Tasks 兼容的 `## ToDo`。完整的 V2 任务示例：

```markdown
## 今日计划

[towrite-theme:: 推进 Echo MVP]

## ToDo

- [ ] 写出 MVP 实验方案 🔺
  [towrite-kind:: edit_note] [towrite-device:: rotation]
  [towrite-category:: 写作与发布]
  [towrite-task-ref:: task_pool_echo_mvp]
  [towrite-scheduled:: 2026-07-24]
  [towrite-due:: 2026-07-26]
  [towrite-primary:: true] [towrite-minimum:: true]
  [towrite-goal:: 判断常驻屏幕是否比软件 Todo 更有效]
  [towrite-next:: 列出 A/B 指标和成功阈值]
  [towrite-estimate:: 15m]
  [towrite-target:: [[Echo MVP]]]
  ^daily_r4nd0m
```

| 字段 | 可用值 | 含义 |
| --- | --- | --- |
| 复选框 | `[ ]`、`[/]`、`[x]` | 待办、唯一当前任务、已完成。 |
| `towrite-kind` | `task`、`create_note`、`edit_note`、`send_card` | 计划项代表的动作。 |
| `towrite-category` | 自由文本 | 与列表层级独立的显式分类，例如“项目”或“写作与发布”。 |
| `towrite-task-ref` | 稳定的不透明 ID | 指向 canonical Task Pool 任务；今日项可以只是该任务的 assignment。 |
| `towrite-device` | `none`、`manual`、`scheduled`、`rotation`、`agent` | 是否以及如何进入设备队列。 |
| `towrite-at` | 本地 ISO 日期时间 | 一次性定时显示时间。 |
| `towrite-scheduled` / `towrite-due` | `YYYY-MM-DD` | 缩进续行中的计划日和截止日，不改变任务标题。 |
| `towrite-theme` | 计划中的自由文本 | 当天的简短主题，不重复保存某个任务。 |
| `towrite-primary` | `true` | 最多标记一条主任务；没有显式设置时取第一条未完成任务。 |
| `towrite-minimum` | `true` | 最多标记一条“明天再乱也至少完成”的任务。 |
| `towrite-goal` | 自由文本 | 任务要得到的结果或这样做的原因。 |
| `towrite-next` | 自由文本 | 显示在概要页和任务卡上的最小下一步。 |
| `towrite-estimate` | 例如 `15m` | 预计时长，不代表逐键统计的工作时间。 |
| `towrite-target` | wikilink 或安全的本地 Markdown 链接 | 要打开的显式目标；缺失时按下文的继承规则解析。 |
| Tasks 优先级 | `🔺`、`⏫`、`🔼`、`🔽`、`⏬` | 最高、高、普通、低、最低；只有允许设备/Agent 选择的任务才参与相应排序。 |
| `⏳` / `📅` | `YYYY-MM-DD` | 旧 Tasks 写法仍可读取；仅在显式启用 `tasksCompatibilityOutput` 时继续输出。 |
| `✅` | `YYYY-MM-DD` | 旧完成日期仍可读取；新的运行时完成时间只写入计时账本。 |
| Block ID | `^daily_<random>` | 用于幂等和冲突检查的稳定标识。 |

Markdown 顺序就是设备顺序。开始任务时，ToWrite 会原子地把它改为 `[/]`，并将当天其他 `[/]` 恢复为 `[ ]`；完成时只改为 `[x]`。默认输出不会把计划日或截止日追加到 checkbox 标题；开始、暂停、继续和完成时间也不会写进任务正文。需要与 Obsidian Tasks 的行内日期格式互操作时，可以由调用方显式启用 `tasksCompatibilityOutput`。完成计划项不会自动推进关联笔记的 Workflow 阶段。

用户可以直接修改 Markdown。元数据和 block ID 既可与复选框同行，也可写在缩进续行中。ToWrite 会保留任务下方未知的说明、嵌套列表和用户文本，只修改复选框和自己拥有的字段。每次写操作都使用来源、block ID 与**完整逻辑任务块**生成的修订。Dashboard、NFC 页面或设备卡片加载后，只要任务块的任意部分发生变化，ToWrite 就返回冲突，不会覆盖更新后的任务。

缺失或重复的 `^daily_*` block ID 会显示诊断，并拒绝修改对应任务。ToWrite 不会根据相似文字静默猜测目标。未完成任务不会自动迁移到第二天；用户需要明确选择移到明天、放回项目池或不再追踪。

## 任务池与每日 assignment

设置中的任务池默认使用 `Planning/Task Pool.md`。这里保存尚未承诺到某一天的 canonical 任务；每项使用稳定的 `task_<128-bit hex>` ID。把任务安排到今日或明日时，ToWrite 会在每日计划中创建带 `towrite-task-ref` 的 assignment，而不是复制出一个互不关联的新任务。

当前普通 Markdown 笔记中保存的非空、未完成 checkbox，会在输入停止并完成防抖刷新后自动登记到统一任务池，不再要求点击“加入任务池”。登记会一次性补上稳定 block ID 与 `towrite-pool-ref`，并保存来源 block link；计划真源、任务池自身以及已经是 `[x]` 的历史完成项不会被这条自动流程导入。已登记任务的行尾状态与操作默认收起，只保留低干扰入口；悬停这个入口、键盘聚焦，或点击入口后才展开。完成源 checkbox 后，同一池项进入“已完成”栏，并计入当天完成统计；它不会被删除或复制到第二个完成文件。

任务池状态包括“池中、已安排、已返回、不再追踪、已完成”。每日 assignment 的标题、分类、截止日期、预计时间、目标或状态被修改后，会通过任务修订同步回任务池；过期 assignment 默认保留在原日期作为历史，并把 canonical 任务重新置为可选，而不会悄悄复制到第二天。用户也可以明确选择“移到明天”“放回任务池”或“不再追踪”。直接在 Daily 中新建的普通任务也可以使用“转入任务池”，保留任务、类别、目标、截止日期和预计时间，再移除当天 assignment；当天专属的最小下一步和设备策略不会自动沿用。所有状态转换都使用任务池 revision 与每日完整任务块 revision 做 CAS；若 Daily 移除失败，新建的池任务会作为补偿被删除。

“今日 / 明日”的展开编排区会常显“从任务池选择”，支持按任务、类别、项目或目标搜索，并直接加入当前选择的日期。完整任务池 Tab 仍提供池中、已返回、已安排、已完成和不再追踪的看板。这里始终是一个全局任务池，不为每天复制一个新池：`returnedDate` 记录任务哪天回池，Daily 只表达某一天的承诺。

Dashboard 将同一份数据投影为列表、看板、表格和日历。视图和分类筛选不会改变 Markdown 真源；分类预设仅提供名称、颜色和图标，任务仍以 `towrite-category` 明文保存，方便用户手工编辑和迁移。

## 层级清单、规范化与目标继承

在配置的 `## ToDo` 范围内，带子项的编号或普通列表项是分类/项目，不计入任务数；普通叶子项是待规范化任务；checkbox 节点始终是任务，包括嵌套在另一个 checkbox 下的子任务。没有列表标记的缩进段落继续作为上一任务的说明。

Daily Note 后部自定义标题下的 checkbox 项目树同样会被识别：父 checkbox 同时是一级任务和分类，编号/普通列表父节点继续形成更深层类型，迁移会复制完整子树而不是只留下散开的叶子。为了避免随记中的孤立提醒被自动接管，单独 checkbox 所在的自定义区段默认不参与计划；需要接管时，在该标题下写一次 `%% [towrite-daily-section:: true] %%`。这是 Reading view 不显示的 Obsidian 注释，只标记区段，不标记整篇日记，也不需要逐任务插入。

每个任务会投影结构 `depth` 和最近 checkbox 父任务的 `parentTaskId`；二者由 Markdown 缩进与稳定 block ID 推导，不需要把父子 ID 再写入正文。删除父任务使用完整任务块 CAS，并明确删除它的整个嵌套列表子树；相邻任务、标题和其他手写内容保持不变。

Dashboard、桌面按键、墨水屏、Hub、NFC 和 Capture 共用同一个目标解析顺序：

1. 显式 `towrite-target`；
2. 子任务自身的安全笔记链接；
3. 最近父分类的笔记链接；
4. 计划原文中的任务 `^daily_*` block；
5. 今日 Dashboard。

Wikilink 支持 alias、heading 和 block；安全的相对 `.md` 链接支持空格、逗号和 CJK 文件名。HTTP 链接、附件和不安全路径不会成为可写目标。每个任务还携带 `lineageRevision`：卡片或 NFC 页面加载后若父分类目标变化，后续动作返回 `409`，不会悄悄打开另一个笔记。

“规范化这份清单”会先预览识别出的分类、叶子任务、继承目标、破损链接和实际 Markdown diff。只有用户确认后，叶子项才会转成 checkbox，并获得 128-bit 随机 `^daily_*` ID；分类、链接、缩进、说明和未知内容保持原样。应用和撤销均使用完整文档 revision。旧式时间文本只作为可能建议显示，未经确认不会删除或解释。

启用“待办行尾控件”后，计划真源仍可逐行规范化。用户写普通
`- [ ] 待办` 或分类下的叶子列表后，可以选择“补充属性 / 跳过属性”；
“跳过属性”只给当前计划项补稳定 ID，不写类别、日期等字段，“补充属性”
则打开渐进式属性卡：初始只呈现完成当前判断真正需要的少量字段，打开目标、
最小下一步、详细时间和设备策略等次要字段由用户手动展开后再填写。其他尚未
处理的计划项不会被一起改写。

Live Preview 的空闲状态只保留用户写下的 checkbox 与待办正文，不常驻显示
“已追踪”“待安排”等系统状态，也不把长串 `^daily_*` / `^task_*` ID 显示在
正文后面。悬停、键盘聚焦或点击低干扰入口后才显示操作；鼠标或键盘焦点移出
后会自动收起。切换 Source mode 仍可查看和手工编辑完整 Markdown。block ID 继续
使用标准 Markdown block 语法作为稳定定位符，只是在阅读时被折叠；未知说明、
嵌套列表、正文链接和用户字段不会被折叠、移动或改写。

当前打开的普通 Markdown 笔记采用更直接的自动流程，不要求文件位于 `Daily`
或包含 `## ToDo`：非空、未完成 checkbox 在 Vault 保存后的后台 debounce
中自动获得 `^task_<128-bit>`、`towrite-pool-ref` 和任务池来源链接。空
checkbox、frontmatter、代码围栏、普通项目符号以及已经完成的历史 checkbox
不会自动登记。空闲时不显示“已追踪 / 待安排”标签；登记后的状态和属性操作
只在悬停该入口、键盘聚焦或点击后出现。原笔记始终是用户内容的唯一
真源。计划文档继续使用 `^daily_*`、
层级继承、计时和设备工作流，两种范围不会显示重复控件。

### 普通待办的数据存放位置

- 待办正文、block ID 和用户选择保存的普通任务属性，写在**源笔记的逻辑任务
  块**中；一篇笔记可以包含多个任务，因此它们不会混放到笔记级 frontmatter。
- 正文中原有的 `[[笔记链接]]` 或 Markdown 链接保持原位，并可直接参与目标
  解析。只有用户在属性卡中显式覆盖“打开目标”时，才写入
  `[towrite-target:: ...]`；不选择就不会制造这个字段。
- 全局调度用的 canonical 镜像位于设置中的任务池文件，默认是
  `Planning/Task Pool.md`。`towrite-pool-ref` 和来源 block link 只负责把源任务
  与池项关联，不是第二份待办正文。
- 计时不会反复污染任务 Markdown。普通笔记任务写入
  `.obsidian-open-questions/tasks/note-task-timer-events.jsonl`，Daily 计划任务
  写入 `.obsidian-open-questions/daily/task-timer-events.jsonl`。
- 今日活动在插件数据中维护；执行“导出活动”时，原始事件默认导出到
  `.obsidian-open-questions/daily/activity-events.jsonl`，每日聚合导出到
  `.obsidian-open-questions/daily/activity.json`。如果修改了 export directory，
  这两个相对路径会跟随新的目录。

普通笔记待办的属性卡采用自适应纵向布局与渐进展开，不会用固定内容宽度
撑出横向滚动条，也不会第一次打开就要求用户理解全部字段。计划时间与实际
计时分开：

```md
  [towrite-planned-start:: 2026-07-29T09:00]
  [towrite-expected-finish:: 2026-07-29T10:30]
  [towrite-deadline:: 2026-07-30T18:00]
  [towrite-estimate:: 45m]
```

“计划开始”是准备启动的时间，“预计完成”是日程承诺，`DDL` 是硬截止，
“预计时间”则是预计实际投入；四者不会写进待办标题。属性卡会分别显示实际
投入、总历时、暂停/等待、当前滞留、计划滞后、超期和中断次数，并提供可折叠
的开始/暂停/继续/完成事件记录。手工写坏或重复的 ToWrite 时间字段会显示冲突
并保留原文，编辑其他属性时不会静默删除。

## 任务计时账本

可选任务计时写入用户可读、且不含正文的账本：

```text
.obsidian-open-questions/daily/task-timer-events.jsonl
```

每次状态转换只保存不透明的任务/会话/事件 ID、`start` / `pause` / `resume` / `complete` / `reopen` / `correct` / `reset`、带时区的绝对时间和来源，不保存任务正文或 Vault 路径。只有状态转换才写账本；界面可以在内存中更新耗时，不会每秒写文件。

同一时间只允许一项任务进行。开始或继续另一项时，原进行中任务会在同一时间点自动暂停。Dashboard 显示实际投入、总跨度、中断次数及预计差值，并提供会话列表和显式时间修正。跨午夜或超过配置阈值（默认四小时）的未关闭会话进入待确认，不会无限累计。计时账本独立于 30 天活动事件，可查看、导出、归档，或在确认后清空。

普通笔记里的 `^task_*` 使用独立的、同样不含正文和路径的账本：

```text
.obsidian-open-questions/tasks/note-task-timer-events.jsonl
```

普通笔记范围内的计时转换会串行写入，开始另一项会自动暂停上一项；手工勾选
或重新打开 checkbox 时，插件在下次后台刷新中修复完成/重开状态。当前 Daily
计划与普通笔记是两个计时域，因此各自最多可有一项进行中；后续若需要全 Vault
唯一进行中任务，需要引入跨来源的持久任务路由索引和统一事务日志。

计划开始已错过、暂停过久、超过预计完成和接近/超过 DDL 已经可以由上述结构化
时间确定性计算。V1 先在属性卡显示这些状态；主动催更尚未默认启用，后续接入
建议中心时仍须遵守安静时段、通知开关和每日上限。

ToThink、ToWrite、Inbox 和 stale/Echo 内容只作为编排候选出现。加入今日或明日必须由用户明确操作。可选 AI 可以调整候选顺序，但不能替用户作出承诺。

确定性总结会先预览，再幂等写入配置的 `## 今日总结`（或自定义）区段。ToWrite 只管理 marker 包围的总结块，不覆盖 marker 外手写内容。AI 改写只能引用插件给出的指标占位符；输出不合规时回退到规则总结。

## 活动统计与隐私

今日活动统计独立于习惯学习，可以单独暂停或清空，且不会修改 Daily Markdown。

- 一个**写作单位**是去除 Markdown 标记后可见文本中的一个 CJK 字符或一个拉丁词。
- **正向新增**只累加两次后台测量之间的增长；**净增**会计入删除。
- 新建笔记、去重后的修改笔记、完成任务、解决问题、Capture 提交、卡片 selected 和 displayed 都记录为结构化事件。普通笔记中已登记任务的完成与 Daily assignment 使用同一 canonical 任务引用去重，因此同一次完成不会重复增加当天计数。
- 测量在 Vault 变化后 debounce 执行。编辑器按键链不会读取全文、发起网络请求或统计逐个按键。
- 只从启用功能后开始统计，不会反推之前的活动；Dashboard 会标明统计起点。
- 不含正文的原始活动事件默认保留 30 天，可配置为 1–365 天；每日聚合一直保留到用户主动清空。
- 活动事件不包含笔记正文、选区、剪贴板、音频或逐键输入，但本地文件 key 和不透明项目 ID 仍可能属于敏感元数据。

设置页提供用户可读导出和一键清空，会删除事件、聚合和测量基线，但不会删除日记或任务。

## 三页墨水屏与三键手势

每天固定生成三种页面：

1. `daily_overview`：日期、今日主题、当前任务、之后两项、当前任务的最小下一步，以及完成数/总数。
2. `daily_plan_item`：每条计划生成一张任务卡，显示目标、下一步、预计时间和本次开始时间。
3. `daily_result`：已完成与剩余任务；不显示字数、笔记数或全库积压。

三键默认映射：

- 左/右短按：在概要、任务、结果三类页面之间切换；
- 左/右双击：在任务页切换上一条/下一条任务；
- 左键长按：未开始则开始、已暂停则继续、进行中则暂停；
- 右键长按：仅在任务页安全完成当前 displayed 任务；
- 主键单击：概要页或任务页都会先开始未开始的任务、继续已暂停的任务，再打开目标；已经进行中的任务只打开、不重复产生计时事件；结果页打开计划原文；
- 主键双击：带入当前卡片上下文，打开 create-only Capture 弹窗；用户取消时不会产生空文件；
- 主键长按：返回 `recording_not_available`。V1 预留硬件录音协议，但不会伪装成录音成功。

没有接好实体 GPIO 时，可先让设备模拟器完成一次拉取、渲染和 display ACK，再在 Obsidian 命令面板运行 `ToWrite: Device: simulate main-button single click`。这个诊断命令仍严格使用最近 ACK 的 displayed tuple，不会绕过安全校验去打开较新的 selected 卡片。完整目标定位与未来网页/其他笔记软件 Adapter 设计见 [按一下打开对应位置](navigation-adapters.zh-CN.md)。

固件约使用 45 ms 防抖、320 ms 双击判定窗口和 700 ms 长按阈值；单击必须等双击窗口结束后才发送。只有屏幕刷新完成且匹配的显示 ACK 成功后，固件才更新本地 displayed tuple。

`selected` 始终代表服务端期望状态，`displayed` 只有在收到匹配 ACK 后才推进。每个 V2 手势必须携带 `eventId`、`deviceId`、`selectionId`、`stateVersion`、`contentId`、`revisionId`、`button` 和 `gesture`；本地模式还需要 `cardId`、`playlistRevision`。打开、新建、完成与 NFC 都严格针对真实 `displayed`，不会退回或跳到更新的 `selected`。

打开/新建命令约 30 秒过期。Connector 会在执行桌面 UI 副作用前持久记录 event ID，因此网络重试不会重复打开多个笔记或 Capture 弹窗。Obsidian 离线时，旧命令不会在几小时后突然执行。最小化窗口尽力聚焦失败时，已经开始的任务不会回滚，设备会收到明确状态。

完成操作还必须校验任务的完整 Markdown 块修订。重复事件幂等处理；迟到、翻页后、displayed tuple 过期或任务已变化都会返回冲突。旧手势 schema 继续兼容普通翻页，但不能触发桌面打开副作用。

手机 NFC 继续遵守 displayed-first：冻结屏幕上真正显示的卡片并打开 Capture PWA。远程按键不承诺强制拉起手机。

## Capture Bridge v2

`towrite-capture-bridge/v1` 继续支持文本记录。v2 会协商以下可选能力：

- `textCapture`
- `createOnlyCapture`
- `voiceCapture`
- `assetUpload`
- `taskComplete`
- `availableOperations`

桌面 create-only 流程会带入 displayed 卡片上下文，但只有用户提交后才创建文件。NFC 页面可以针对冻结的 displayed 卡片提供“记录、完成、稍后”。浏览器语音转文字使用操作系统或浏览器的语音输入；原始录音只有在用户主动点击录音并授予麦克风权限后，才会使用 `MediaRecorder`。

音频先进入临时区，再通过 ToWrite 提交到配置的 Vault 附件目录。转写不可用或失败时，仍可保留原始录音并插入“待转写”链接。没有单独授权时，音频不会发送给 AI。撤销只删除未变化的插入块；附件 hash 未变且没有被其他笔记引用时，才会删除附件。

系统通过能力握手识别旧版 Capture 插件。旧版会回退到 v1 文本记录流程，不会假装支持 create-only、录音或任务完成。

## DailyOps V2 单写入者

今日设置提供三种写入模式：

| 模式 | 行为 |
| --- | --- |
| `local` | 始终由 Obsidian 插件写 Markdown。 |
| `auto` | 只有可信 Backend 报告 `towrite-daily-ops/v2`、`towrite-daily-plan/v2` 契约、可写能力，以及匹配的计划来源、文档/目录、格式和区段时才委托 Backend。Backend 离线或不兼容时由插件本地写入。 |
| `backend` | Backend 必须通过同一握手。离线或配置不匹配时停止操作并提示错误，不会静默启用第二个写入者。 |

V2 握手同时支持按日期拆分的每日笔记与按日期分区的固定规划文档。V1 计划仍可读取和迁移，但 V2 委托写入必须通过 V2 握手。握手会为每次操作选择唯一写入者，不会通过两条路径并发修改同一任务。所有模式都以 Markdown、稳定任务 ID 和完整块修订为权威。

## 版本化本地 API

启用并认证 External API 后，今日 V2 接口包括：

```text
GET   /api/v1/daily/today
GET   /api/v1/daily/plans/{date}
PATCH /api/v1/daily/plans/{date}
POST  /api/v1/daily/plans/{date}/normalization-preview
POST  /api/v1/daily/plans/{date}/normalize
GET   /api/v1/daily/summary
POST  /api/v1/daily/items
PATCH /api/v1/daily/items/{id}
POST  /api/v1/daily/items/{id}/start
POST  /api/v1/daily/items/{id}/pause
POST  /api/v1/daily/items/{id}/resume
POST  /api/v1/daily/items/{id}/complete
GET   /api/v1/daily/items/{id}/timing
PATCH /api/v1/daily/items/{id}/timing
POST  /api/v1/daily/summary/write-back
POST  /api/v1/device/display-acks
POST  /api/v1/device/events
```

写操作必须携带当前完整逻辑任务块的修订。设备手势 V2 必须匹配已 ACK 的 displayed tuple；旧 device-event schema 不会触发桌面 UI 副作用。External API 原有鉴权和网络暴露安全建议仍然适用。

## 验证清单

发布测试覆盖：

- 每日笔记与固定规划文档两种来源、今日/明日编辑、跨日、排序、主任务/最低承诺，以及不自动迁移；
- 本地创建、编辑、开始、暂停、继续、完成、重新打开、时间修正、总结预览/写回、导出、归档和清空；
- 层级分类、目标继承、规范化预览/撤销、保留未知任务块内容、缺失/重复 block ID 诊断，以及原子的唯一 `[/]`；
- 手工修改 Markdown 与完整任务块、lineage、timing 过期修订 `409`；
- 正向新增/净增统计，且编辑器同步链不执行全文 I/O；
- 三页设备快照与旧固件通用卡渲染；
- 单击/双击/长按消歧、防抖与右长按完成保护；
- displayed=A、selected=B 时打开、新建、NFC 和完成都只针对 A；
- 重复、过期、迟到、超时和翻页后的设备事件；
- Capture Bridge v1 回退以及 v2 能力/权限边界；
- Backend V2 对两种来源的写入者握手、`auto` 离线回退与严格 `backend` 失败；
- 旧 ToThink/ToWrite、Inbox、Echo、Quote0、External API 和翻页兼容。
