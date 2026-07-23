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

计划区段默认是 `## 今日计划`，任务区段使用 Tasks 兼容的 `## ToDo`。完整的 V2 任务示例：

```markdown
## 今日计划

[towrite-theme:: 推进 Echo MVP]

## ToDo

- [ ] 写出 MVP 实验方案 🔺 📅 2026-07-24
  [towrite-kind:: edit_note] [towrite-device:: rotation]
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
| `towrite-device` | `none`、`manual`、`scheduled`、`rotation`、`agent` | 是否以及如何进入设备队列。 |
| `towrite-at` | 本地 ISO 日期时间 | 一次性定时显示时间。 |
| `towrite-theme` | 计划中的自由文本 | 当天的简短主题，不重复保存某个任务。 |
| `towrite-primary` | `true` | 最多标记一条主任务；没有显式设置时取第一条未完成任务。 |
| `towrite-minimum` | `true` | 最多标记一条“明天再乱也至少完成”的任务。 |
| `towrite-goal` | 自由文本 | 任务要得到的结果或这样做的原因。 |
| `towrite-next` | 自由文本 | 显示在概要页和任务卡上的最小下一步。 |
| `towrite-estimate` | 例如 `15m` | 预计时长，不代表逐键统计的工作时间。 |
| `towrite-target` | wikilink | 要打开的笔记；缺失时使用任务正文中的第一个 wikilink。 |
| `towrite-started` | 本地 ISO 日期时间 | 任务成为当前任务时写入。 |
| Tasks 优先级 | `🔺`、`⏫`、`🔼`、`🔽`、`⏬` | 最高、高、普通、低、最低；只有允许设备/Agent 选择的任务才参与相应排序。 |
| `⏳` / `📅` | `YYYY-MM-DD` | 与常见 Tasks 写法兼容的计划日和截止日。 |
| `✅` | `YYYY-MM-DD` | 用户明确完成后写入的完成日期。 |
| Block ID | `^daily_<random>` | 用于幂等和冲突检查的稳定标识。 |

Markdown 顺序就是设备顺序。开始任务时，ToWrite 会原子地把它改为 `[/]`，将当天其他 `[/]` 恢复为 `[ ]`，并写入 `towrite-started`。完成时改为 `[x]` 并写入 `✅ YYYY-MM-DD`。完成计划项不会自动推进关联笔记的 Workflow 阶段。

用户可以直接修改 Markdown。元数据和 block ID 既可与复选框同行，也可写在缩进续行中。ToWrite 会保留任务下方未知的说明、嵌套列表和用户文本，只修改复选框和自己拥有的字段。每次写操作都使用来源、block ID 与**完整逻辑任务块**生成的修订。Dashboard、NFC 页面或设备卡片加载后，只要任务块的任意部分发生变化，ToWrite 就返回冲突，不会覆盖更新后的任务。

缺失或重复的 `^daily_*` block ID 会显示诊断，并拒绝修改对应任务。ToWrite 不会根据相似文字静默猜测目标。未完成任务不会自动迁移到第二天；用户需要明确选择移到明天、放回项目池或不再追踪。

ToThink、ToWrite、Inbox 和 stale/Echo 内容只作为编排候选出现。加入今日或明日必须由用户明确操作。可选 AI 可以调整候选顺序，但不能替用户作出承诺。

确定性总结会先预览，再幂等写入配置的 `## 今日总结`（或自定义）区段。ToWrite 只管理 marker 包围的总结块，不覆盖 marker 外手写内容。AI 改写只能引用插件给出的指标占位符；输出不合规时回退到规则总结。

## 活动统计与隐私

今日活动统计独立于习惯学习，可以单独暂停或清空，且不会修改 Daily Markdown。

- 一个**写作单位**是去除 Markdown 标记后可见文本中的一个 CJK 字符或一个拉丁词。
- **正向新增**只累加两次后台测量之间的增长；**净增**会计入删除。
- 新建笔记、去重后的修改笔记、完成任务、解决问题、Capture 提交、卡片 selected 和 displayed 都记录为结构化事件。
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
- 右键长按：仅在任务页安全完成当前 displayed 任务；
- 主键单击：概要页先原子设置当前任务，再打开电脑版 Obsidian 里的目标；任务页打开当前任务目标；结果页打开计划原文；
- 主键双击：带入当前卡片上下文，打开 create-only Capture 弹窗；用户取消时不会产生空文件；
- 主键长按：返回 `recording_not_available`。V1 预留硬件录音协议，但不会伪装成录音成功。

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
GET   /api/v1/daily/summary
POST  /api/v1/daily/items
PATCH /api/v1/daily/items/{id}
POST  /api/v1/daily/items/{id}/start
POST  /api/v1/daily/items/{id}/complete
POST  /api/v1/daily/summary/write-back
POST  /api/v1/device/display-acks
POST  /api/v1/device/events
```

写操作必须携带当前完整逻辑任务块的修订。设备手势 V2 必须匹配已 ACK 的 displayed tuple；旧 device-event schema 不会触发桌面 UI 副作用。External API 原有鉴权和网络暴露安全建议仍然适用。

## 验证清单

发布测试覆盖：

- 每日笔记与固定规划文档两种来源、今日/明日编辑、跨日、排序、主任务/最低承诺，以及不自动迁移；
- 本地创建、编辑、开始、完成、重新打开、总结预览/写回、导出和清空；
- 保留未知任务块内容、缺失/重复 block ID 诊断，以及原子的唯一 `[/]`；
- 手工修改 Markdown 与完整块过期修订 `409`；
- 正向新增/净增统计，且编辑器同步链不执行全文 I/O；
- 三页设备快照与旧固件通用卡渲染；
- 单击/双击/长按消歧、防抖与右长按完成保护；
- displayed=A、selected=B 时打开、新建、NFC 和完成都只针对 A；
- 重复、过期、迟到、超时和翻页后的设备事件；
- Capture Bridge v1 回退以及 v2 能力/权限边界；
- Backend V2 对两种来源的写入者握手、`auto` 离线回退与严格 `backend` 失败；
- 旧 ToThink/ToWrite、Inbox、Echo、Quote0、External API 和翻页兼容。
