# ToWrite Open Questions 隐私说明

[English](PRIVACY.md) | 简体中文

最后更新：2026-07-19

本文只描述 ToWrite Open Questions Obsidian 插件。可选的 Device Hub、Obsidian AI Backend、OpenAI-compatible 服务、Quote0/Dot 服务、网络隧道和同步服务都是独立系统，适用各自运营方的隐私与运维政策。

## 本地优先默认值

- ToThink/ToWrite 索引、三候选记录推荐、保存预览和习惯推断都在 Obsidian Desktop 内运行。
- 习惯学习、主动通知、External API、AI、Device Hub 和 Obsidian AI Backend 接入均为可选功能；Device Hub、Backend 与通知默认关闭。
- ToWrite 不包含厂商分析、广告标识符或由 ToWrite 运营的遥测服务。
- 保存记录时，只会写入你确认的目标：符合条件的已有笔记、推荐文件夹或 Workflow 阶段中的新笔记，或配置的 Inbox。

## Vault 与插件数据

ToWrite 可能在 Obsidian 插件数据和配置的导出目录中保存选区文字、PDF 摘录、标题、批注、tags、状态、来源路径、Workflow 分类、frontmatter、记录元数据和卡片状态。

启用习惯学习后，还会维护：

```text
.obsidian-open-questions/learning/events.jsonl
.obsidian-open-questions/learning/habits.json
```

使用 AI 助手后，当前本地对话还会同步到用户可读文件：

```text
.obsidian-open-questions/ai/conversations.json
```

插件本地数据中也可能保存相同的学习状态。这些文件可由用户读取，并可在设置中导出或清空。请把插件数据文件和 `.obsidian-open-questions/` 视为私有 Vault 数据；Vault 同步或备份软件可能按照它自身的配置复制这些内容。

配置 Device Hub 后，Obsidian 插件数据还可能包含 Hub Base URL、Receiver ID 与 pull token、Receiver P-256 公私钥 JWK、opaque 引用 HMAC secret、device ID、Tap URL、同步时间以及 selected/displayed 标识缓存。这些值不会进入用户可读的 ToWrite 导出文件，但 Obsidian 插件数据只是普通本地数据，不是操作系统加密密钥库，也可能被 Vault 同步或备份软件复制。

Hub 引导流程的账户 access token 只存在于内存中的设置表单，不写入持久化插件设置。新建或轮换的 `device_secret` 只显示一次，供用户转移到 ESP32；ToWrite 不持久化它。关闭或清空该设置表单后无法从插件找回这次的一次性值。

## 学习数据边界

学习功能默认关闭。启用后，只保留白名单内的结构事件：

- 文件切换与粗粒度有效编辑时段；
- 时间戳、时区偏移，以及适用的 Article Type 或 Workflow 阶段；
- 本地推荐目标与用户明确选择的记录目标；
- 问题的打开、回答、解决、忽略或提醒操作；
- 建议的接受、编辑、忽略、稍后处理或打开等显式反馈。

原始本地事件可能包含 Vault 相对文件路径，以及不透明的问题、记录、目标或建议 ID。派生的工作会话摘要与推断出的习惯规则不会保留精确文件路径。

学习事件明确不包含笔记正文、记录正文、选区内容、剪贴板内容、逐键输入、按键计数、联系人、网络历史或物理位置。编辑活动会合并成粗粒度 presence 时段，而不是逐次修改日志。

原始学习事件会在 30 天后自动清理。待确认、已接受和已忽略的习惯记录及其聚合证据会保留，直到用户主动清空。清空学习数据会删除事件和学习得到的习惯；手工配置的 Push 规则属于另一套数据。

推断只能创建“待确认习惯”。只有用户明确接受后，它才可以影响记录路由或习惯通知；忽略或稍后处理不会在后台悄悄启用该习惯。

## 本地记录推荐

ToWrite 只搜索本地允许的 Markdown 范围。系统先应用包含文件夹，再用排除文件夹、排除 tags 和 truthy 排除 frontmatter key 移除笔记；被排除的笔记不会参与本地评分或可选 Backend 处理。

弹窗最多显示三个候选。异步返回的可选重排不会替换用户已经手动选择的目标。用户会在保存前看到最终路径和预览。

## 可选 Obsidian AI Backend

Backend 不是必需依赖。启用目标重排时，ToWrite 会向配置的 Backend 发送：

- 协议版本、记录 id 与意图；
- 可选标题和最多 20 个 tags；
- 粗粒度来源标记（是否存在来源文件或问题）、标题层级深度和记录入口；
- 仅限已经通过本地过滤的候选 id、类型、动作、追加区段标题、阶段、分数、置信度和理由。

Backend 重排请求不包含记录正文、选区文字、识别出的链接、精确来源文件路径、候选路径、来源标题名称或问题 id。候选白名单只有在本地 include/exclude 与隐私规则过滤掉不合格笔记之后才会生成。

Backend 响应只能重排或改写这些候选 id 的展示信息；插件会忽略未知 id，因此该接口不能让 Backend 注入任意 Vault 目标。

Backend 的习惯候选文案增强使用独立开关，并且默认关闭。启用后只发送聚合证据，不发送原始学习事件或笔记内容。本地规则与待确认/已接受/已忽略状态始终是权威状态；Backend 响应不能接受一个习惯。

Backend access token 保存在 Obsidian 插件数据中，并通过 `X-Capture-Token` 请求头发送，不会放进 Backend URL 或学习导出。Obsidian 插件数据不是加密密钥库，因此请保护 Vault 和所有同步的插件数据。

Device Hub 候选重排最多发送 20 个已完成本地过滤的 candidate ID、内容类型、有长度限制的标题、理由代码、分数、粗粒度 state/place/mode 和已接受习惯的规则数据。插件明确不发送 display body、`write_target_ref`、Vault 路径、选区或 pending 习惯；未知返回 ID 会被丢弃，本地候选对象始终是权威数据。

## 可选 Device Hub

Device Hub 默认关闭。启用后，插件只向独立部署的 Hub 发送墨水屏卡片与投递状态所需数据。上传前，Connector 会应用配置的 include/exclude 文件夹、tags 和 frontmatter 规则，并把本地来源和写回目标转换为带密钥的 opaque 引用。

根据设置和候选内容，Hub 可能接收：

- 用户、Receiver、设备、绑定、Tap 与 mailbox 标识；
- 内容类型、有长度限制的标题、可选显示正文、提示、允许动作、理由代码、分数、过期时间和 opaque 来源/写回引用；
- 粗粒度上下文状态、置信度、时间戳、TTL、用户手工输入的语义地点/模式和已接受习惯证据；
- selected/displayed 标识、state version、选择理由、display ACK 状态、render hash、固件版本、电量、last seen 和显式反馈；
- 启用 Mailbox 后的外部留言以及审核/信任状态；
- PWA 回答密文、P-256/AES-GCM envelope 元数据、opaque 的冻结 selection/content/write-target 关联、字节数和过期时间。

显示卡片字段在 Hub 中是明文，因为 Hub 和设备需要投递并渲染它们。显示正文默认关闭；启用同步后，标题、提示、理由和其他获准卡片字段仍可能离开 Vault。接入公网 Hub 前请先检查发送字段预览。

PWA 会在浏览器内使用临时 P-256 ECDH、HKDF-SHA256 和 AES-256-GCM 为 Receiver 加密回答正文。Hub 保存密文及路由/envelope 元数据，不保存回答明文或 Receiver 私钥。这项加密不会向 Hub 隐藏显示卡片，不能保护已经被入侵的浏览器或 Connector，也不能代替账户登录、CSRF 和幂等校验。

Tap URL 只包含可撤销的随机 `tap_id`，不包含账户 token、Receiver token、device secret、内容 ID 或 Vault 路径。任何读取或复制标签的人都可能查看本次获准的冻结卡片，因此标签不能证明现场触碰。写回答仍要求已认证账户会话和 Tap session 的 CSRF 值。

### Reference Hub 保留与删除行为

当前参考实现的 V1 行为如下；其他 Hub 运营方可以采用更严格的策略，但必须单独披露：

| 数据 | 当前 V1 行为 |
| --- | --- |
| 上下文观测、快照与候选批次 | Reference cleanup worker 会物理删除超过 30 天 cutoff 的行。 |
| PWA 加密 Capture | 创建时设置 30 天过期时间，过期后不再进入待投递队列。小时级 cleanup worker 会物理删除过期 pending/failed Capture，并按更短的已 ACK 配置保留期删除已写回 Capture。 |
| Tap session | 约 5 分钟后或成功消费后不再允许写入。无 Capture 关联的 session 在过期 1 天后物理删除；有加密写回关联的 session 保留到 Capture/link 清理。 |
| 内容修订、selection、ACK、feedback 与 mailbox 数据 | 非当前投递/审计行使用 90 天硬删除 cutoff；仍被当前 selected/displayed 或待处理加密写回引用的行保留到引用解除。 |
| 删除/撤销设备 | 立即拒绝设备鉴权，并撤销有效绑定、Tap、设备 Mailbox 和 sender key；历史投递/审计行可能继续保留。 |
| 删除账户 | 参考服务会撤销 session、device、Receiver，把排队 Capture 标记为已删除，并物理删除该账户全部 Hub 领域行。备份副本仍遵守部署运营方另行披露的备份过期策略。 |

cleanup worker 是参考部署的必需服务；停用它会暂停物理保留期清理。“30 天”只适用于原始上下文/候选数据，不适用于所有 Hub 表。运营方仍须单独配置备份过期、代理/CDN 日志和删除验证。

## 其他可选网络功能

- OpenAI-compatible AI 默认关闭。“获取模型”会向配置的 Base URL 发送带认证的 `GET /models` 请求。“测试连接”会使用所选模型发起一次很小的真实对话请求，并可能消耗服务商额度。
- 直连 AI 助手只会在用户提交消息后发送请求。上下文检查器会先列出发送字段。请求可包含用户消息、近期本地对话历史、当前笔记的 Vault 相对路径与正文（最多 12,000 字符）、选区（最多 4,000 字符）和有上限的未解决问题摘要。
- Backend 助手模式可发送当前笔记的 Vault 相对路径、选区、未解决问题摘要、近期历史，以及所选 Backend 模型、Skill 路径或 Agent id。打开 Skill 仓库和 Agent 选择器时，会从配置的 Backend 读取相应的用户可见目录。Backend 可能读取指定笔记，也可能按其自身配置和隐私条款保留运行日志或输出。
- 直连助手可以向兼容模型提供 `ask_user_choice` function schema。返回选项会在本地经过规范化后显示；用户点击选项后，该选择会加入本地历史，并随下一次明确的助手请求发送。选择卡片不会执行 Vault 写入或任意工具。
- 上文的记录目标重排隐私边界保持不变：它不接收笔记正文或选区。AI 助手对话是另一项由用户明确触发、并单独展示 payload 的操作。
- External API 默认关闭，通常只绑定 `127.0.0.1`。启用局域网或隧道访问后，所选 API 数据会按照用户配置的 token 和网络控制对外可达。
- Quote0、Push target 与远程输入只有在用户主动配置对应服务和目标后才会发送数据。
- ToWrite 本身不执行联网搜索。

## 通知

主动通知默认关闭。新的习惯候选只会静默出现在侧栏。启用通知后，只有到期提醒和已确认习惯具有通知资格。默认安静时段为 `23:00-08:00`，默认每天最多三条习惯通知。通知文字会显示在屏幕上，附近的人可能看到标题或触发理由。

## 用户控制

用户可以：

- 保持学习、通知、Backend、AI 和 External API 关闭；
- 保持 Device Hub 关闭、暂停其后台同步，或删除本地 Receiver/设备配置；
- 预览 Device Hub 候选字段、保持显示正文关闭、轮换 Receiver/device/Tap 凭据，并撤销疑似被复制的 Tap URL；
- 暂停学习数据收集；
- 接受习惯前先查看证据；
- 编辑、忽略或稍后处理习惯候选；
- 用包含/排除文件夹、tags 和 frontmatter 限制记录索引；
- 以用户可读格式导出学习事件和习惯；
- 清空所有学习事件、候选和已接受的学习习惯。
- 发送前检查 AI 助手的 payload 字段，并清空本地对话历史。

部署和 token 建议见 [SECURITY.zh-CN.md](SECURITY.zh-CN.md)。
