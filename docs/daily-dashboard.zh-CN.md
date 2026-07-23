# 今日 Dashboard 与每日计划

[English](daily-dashboard.md) | 简体中文

ToWrite 把每日计划与全库状态索引明确分开：

- **今日**：显示当天计划、写作与活动统计、完成记录、定时设备卡片、规则总结和 2.7 英寸墨水屏预览。
- **全部状态**：显示完整索引中的 Workflow 阶段、Article Type、Inbox、stale、ToThink 和 ToWrite 数量。这些数量不从今日计划推算。
- 侧栏只增加紧凑的“今日”摘要和 Dashboard 入口，不会把今日数字混进原有的 All/ToThink/ToWrite/Inbox 数字。

每日计划在没有 AI、没有可选 Backend 时也能完整使用。AI 默认关闭，只能根据同一份结构化统计和计划标签改写总结文案；它不能计算统计、添加任务、完成任务或修改设备状态。

## Markdown 是数据真源

默认日记路径为 `Daily/YYYY-MM-DD.md`。ToWrite 从配置的 `## ToDo` 区段读取 Tasks 兼容复选框：

```markdown
## ToDo

- [ ] 补充 [[关于创作]] 的证据 ⏳ 2026-07-23 📅 2026-07-23
  [towrite-kind:: edit_note] [towrite-device:: scheduled]
  ^daily_r4nd0m
```

当前契约为 `towrite-daily-plan/v1`：

| 字段 | 可用值 | 含义 |
| --- | --- | --- |
| 复选框 | `[ ]`、`[/]`、`[x]` | 待办、进行中、已完成。 |
| `towrite-kind` | `task`、`create_note`、`edit_note`、`send_card` | 计划项代表的动作。 |
| `towrite-device` | `none`、`manual`、`scheduled`、`rotation`、`agent` | 是否以及如何进入设备队列。 |
| `towrite-at` | 本地 ISO 日期时间 | 一次性定时显示时间。 |
| Tasks 优先级 | `🔺`、`⏫`、`🔼`、`🔽`、`⏬` | 最高、高、普通、低、最低；只有已允许 Agent/设备选择的项目才会按优先级参与推荐。 |
| `⏳` / `📅` | `YYYY-MM-DD` | 与常见 Tasks 写法兼容的计划日和截止日。 |
| `✅` | `YYYY-MM-DD` | 用户明确完成后写入的完成日期。 |
| Block ID | `^daily_<random>` | 用于幂等和冲突检查的稳定标识。 |

用户可以直接修改 Markdown。元数据和 block ID 既可与复选框写在同一行，也可使用上面的缩进续行格式。每次变更都会比较由来源路径、block ID 和完整逻辑任务块生成的任务修订。如果 Dashboard、NFC 页面或设备卡片打开后任务块发生变化，ToWrite 会返回冲突，不会完成或改写另一条任务。

完成每日计划只会勾选复选框并写入完成日期，不会自动推进关联笔记的 Workflow 阶段。

确定性总结会先预览，再幂等写入配置的 `## 今日总结`（或自定义名称）区段。AI 改写只能引用插件提供的指标占位符；任何额外数字、未知占位符或非 JSON 输出都会被拒绝并回退到规则总结。

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

## 设备卡片与安全完成

每日任务可以成为 `daily_plan_item` 卡片，每日总结可以成为 `daily_summary` 卡片。非 AI 规则顺序为：

1. 手工固定；
2. 已逾期；
3. 已到点的一次性定时；
4. 高优先级今日任务；
5. 轮播任务。

总结卡默认策略为“不发送”，可在设置中改为手动、轮播或允许 Agent 选择；也可在“今日”面板点“发送总结”做一次性预览。未明确启用时，总结卡和内置样板都不会进入真实队列。

安静时段可以只静默更新屏幕；勿扰状态会冻结自动换卡。测试或示例卡片不会进入真实队列。

`selected` 始终代表服务端期望状态，只有匹配的显示 ACK 才能推进 `displayed`。NFC 与完成操作优先解析 `displayed`，再考虑更新的 `selected`，因此手机操作仍针对屏幕上真正可见的卡片。

设备完成事件必须携带 `eventId`、`cardId`、`stateVersion` 和 `playlistRevision`。只有同时满足以下条件时才会接受：

- 卡片仍是当前 displayed；
- 类型是 `daily_plan_item`；
- 显示状态和播放列表修订仍匹配；
- Markdown 任务修订没有变化。

重复事件会幂等处理。迟到事件、翻页后发出的事件或任务已经变化时会返回 `409 Conflict`。成功后，该任务退出待办队列，并可选择下一条符合条件的卡片。

旧固件仍兼容通用卡片显示和上一页/下一页翻页。在固件实现上述四字段完成保护契约之前，**不得**显示或发送安全完成按钮。

## Capture Bridge v2

`towrite-capture-bridge/v1` 继续支持文本记录。v2 会协商以下可选能力：

- `textCapture`
- `voiceCapture`
- `assetUpload`
- `taskComplete`
- `availableOperations`

NFC 页面可以针对冻结的 displayed 卡片提供“记录、完成、稍后”。浏览器语音转文字使用操作系统或浏览器的语音输入；原始录音只有在用户主动点击录音并授予麦克风权限后，才会使用 `MediaRecorder`。

音频先进入临时区，再通过 ToWrite 提交到配置的 Vault 附件目录。转写不可用或失败时，仍可保留原始录音并插入“待转写”链接。没有单独授权时，音频不会发送给 AI。撤销只删除未变化的插入块；附件 hash 未变且没有被其他笔记引用时，才会删除附件。

系统通过能力握手识别旧版 Capture 插件。旧版会回退到 v1 文本记录流程，不会假装支持录音或任务完成。

## DailyOps 单写入者

今日设置提供三种写入模式：

| 模式 | 行为 |
| --- | --- |
| `local` | 始终由 Obsidian 插件写 Markdown。 |
| `auto` | 只有可信 Backend 报告 `towrite-daily-ops/v1`、相同的 `towrite-daily-plan/v1` 契约、可写能力，以及匹配的目录/格式/区段设置时才委托 Backend。Backend 离线或不兼容时由插件本地写入。 |
| `backend` | Backend 必须通过同一握手。离线或配置不匹配时停止操作并提示错误，不会静默启用第二个写入者。 |

握手会为每次操作选择唯一写入者；ToWrite 不会通过两条路径并发修改同一任务。所有模式都以 Markdown、稳定任务 ID 和任务修订为权威。

## 版本化本地 API

启用并认证 External API 后，今日 V1 接口为：

```text
GET   /api/v1/daily/today
GET   /api/v1/daily/summary
POST  /api/v1/daily/items
PATCH /api/v1/daily/items/{id}
POST  /api/v1/daily/items/{id}/complete
POST  /api/v1/daily/summary/write-back
```

写操作必须携带当前任务修订。External API 原有鉴权和网络暴露安全建议仍然适用。

## 验证清单

发布测试覆盖：

- 本地创建、编辑、完成、重新打开、总结预览/写回、导出和清空；
- 手工修改 Markdown 与过期修订 `409`；
- 正向新增/净增统计，且编辑器同步链不执行全文 I/O；
- displayed=A、selected=B 时 NFC 和完成仍针对 A；
- 重复、过期、迟到和翻页后的设备完成事件；
- Capture Bridge v1 回退以及 v2 能力/权限边界；
- Backend 写入者握手、`auto` 离线回退与严格 `backend` 失败；
- 旧 ToThink/ToWrite、Inbox、Echo、Quote0、External API 和翻页兼容。
