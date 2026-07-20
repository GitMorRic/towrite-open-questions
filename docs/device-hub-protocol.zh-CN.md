# ToWrite Device Hub V1 协议与 Agent 架构

本文定义 ToWrite、可信 AI Backend、Device Hub、墨水屏设备和 NFC/PWA 之间的 V1 契约。它是新 Device Hub 的协议说明，不替代现有 Quote0、Push Feed、External API 或本地 `/device/go` 兼容入口。

本文中的“必须”“不得”“应该”分别对应 MUST、MUST NOT、SHOULD。除非接口另有说明，JSON 字段使用 `snake_case`，时间使用带时区的 ISO 8601 UTC 字符串。

## 1. 目标与边界

Device Hub V1 要完成以下闭环：

```text
Obsidian 候选
  → Hub selected
  → ESP32 长轮询并显示
  → ESP32 display ACK
  → NFC 打开眼前内容
  → PWA 加密回答
  → Receiver 队列
  → ToWrite CaptureService 写回 Vault
```

V1 的明确边界：

- Obsidian Markdown 是笔记真源；本地索引、Backend SQLite 和 Hub 快照均可重建。
- Hub 只接收获准显示的最小快照，不接收完整 Vault。
- ESP32 固件和具体墨水屏驱动不在本版本中实现；V1 提供 HTTPS 长轮询、ACK 契约和设备模拟器。
- 上下文只使用时间、Obsidian 活动、设备在线、手工语义地点/模式和已确认习惯。V1 不声称能自动识别森林、散步或发呆。
- AI 只能重排 Connector 已授权的候选白名单，不能创建新路径、直接写 Vault、切换设备状态或触发振动。
- 静态 NFC 标签只是入口，不是身份凭据，也不能证明用户当时确实在现场触碰。

## 2. 四层架构与信任边界

```text
┌────────────────────────────────────────────────────────────┐
│ 1. Obsidian / ToWrite Connector                            │
│ Vault 真源、本地索引、问题库、习惯审批、隐私过滤、写回      │
└───────────────────────┬────────────────────────────────────┘
                        │ 最多 20 个获准候选；opaque refs
                        ▼
┌────────────────────────────────────────────────────────────┐
│ 2. 可选可信 AI Backend                                     │
│ LiteLLM、Skills、Agent Registry；只重排白名单或生成角色文案 │
└───────────────────────┬────────────────────────────────────┘
                        │ 仍只输出白名单 ID、顺序、解释
                        ▼
┌────────────────────────────────────────────────────────────┐
│ 3. 公网 Device Hub                                         │
│ Receiver/设备边界、候选快照、上下文、selected/displayed、   │
│ 长轮询、Tap Router、加密 Capture 队列、Mailbox              │
└───────────────┬───────────────────────────┬────────────────┘
                │ Device secret             │ tap_id / 登录 PWA
                ▼                           ▼
┌──────────────────────────┐   ┌─────────────────────────────┐
│ 4a. ESP32 / 墨水屏        │   │ 4b. 手机 NFC / HTTPS PWA    │
│ poll → render → ACK       │   │ 看内容、回答、加密提交       │
└──────────────────────────┘   └─────────────────────────────┘
```

各层只获得完成职责所需的数据：

| 层 | 可以知道 | 不应知道或保存 |
| --- | --- | --- |
| Connector | Vault 路径、正文、本地习惯证据、写回目标 | 设备明文 secret 的长期副本（除配对所需安全存储外） |
| AI Backend | 经用户预览并授权的候选字段、白名单 ID、聚合上下文 | 完整 Vault、私密正文、精确位置、未授权路径 |
| Hub | 用户/Receiver/设备关系、最小显示快照、opaque 引用、选择与 ACK | 绝对 Vault 路径、完整笔记、按键、SSID、精确坐标 |
| ESP32 | 当前 desired 卡片、state version、显示策略 | Connector token、Receiver token、Vault 路径 |
| NFC 标签 | 一个可撤销 `tap_id` URL | device secret、API key、内容 ID、Vault 路径 |
| PWA | 本次冻结的卡片、短时会话、用户输入 | 未经授权的其他设备状态或 Vault 内容 |

## 3. ID、修订和凭据

### 3.1 不可顺序枚举 ID

所有公共对象使用带类型前缀的随机 ID。ID 只用于定位对象，不授予权限。

| 对象 | 格式 | 生成方式 |
| --- | --- | --- |
| 设备 | `dev_<32 位小写 UUID4 hex>` | UUIDv4（122 个随机位） |
| 内容 | `cnt_<32 位小写 UUID4 hex>` | UUIDv4（122 个随机位） |
| 内容修订 | `rev_<32 位小写 UUID4 hex>` | UUIDv4（122 个随机位） |
| 选择 | `sel_<32 位小写 UUID4 hex>` | UUIDv4（122 个随机位） |
| 投递 | `dlv_<32 位小写 UUID4 hex>` | UUIDv4（122 个随机位） |
| Tap | `tap_<22 字符 base64url>` | 至少 128-bit 随机值，可轮换和撤销 |

其他内部对象也应使用相同原则，例如 `bat_`、`obs_`、`ctx_`、`tps_`、`mbx_`、`sky_`、`evt_` 和 `ack_`。不得使用 `/device/1`、`cnt_2` 等顺序编号。

### 3.2 不可变修订和完整性

- `content_id` 表示逻辑内容；每次显示快照变化创建新的不可变 `revision_id`。
- 修订的规范化显示字段计算 SHA-256 `content_hash`。
- 设备响应携带 `ETag`，设备 ACK 可携带本地渲染结果的 SHA-256 `render_hash`。
- 每台设备维护单调递增的 `state_version`。只有服务端创建新选择时递增。
- ID、hash、ETag 和 version 都不能代替鉴权。

### 3.3 设备密钥

每台设备配对时生成一次性显示的 256-bit `device_secret`：

```http
Authorization: Device <device_secret>
```

服务端只保存 secret 的安全 hash，并把 hash 与唯一的 `device_id`、用户和 Receiver 绑定。以下请求必须同时通过路径中的设备 ID 和该设备的 secret：

- `GET /v1/hub/devices/{deviceId}/desired`
- `POST /v1/hub/devices/{deviceId}/display-acks`

知道 `device_id`、`tap_id` 或另一个设备的 secret 均不能通过鉴权。轮换后旧 secret 必须立即失效；撤销设备后所有设备接口必须立即拒绝。

### 3.4 其他鉴权域

| 调用方 | 鉴权方式 | 权限 |
| --- | --- | --- |
| ToWrite Connector / 账户 PWA | `Authorization: Bearer <access_token>` | 账户内获准的 Receiver、设备、选择、状态、写回 |
| Receiver Connector | Bearer，或迁移期的 `X-Receiver-Token` | 仅绑定 Receiver 的候选与上下文 |
| ESP32 | `Authorization: Device <device_secret>` | 只读本设备 desired、提交本设备 ACK |
| 外部留言者 | `Authorization: Sender <sender_key>` | 仅指定 mailbox 的 `messages:create` |
| Tap 页面 | URL 中只有 `tap_id`；写操作另需登录、CSRF | 只读本次卡片；登录后提交本次反馈/加密回答 |

长期 token 不得进入 URL、二维码、NFC、重定向、日志或 Referrer。

## 4. 核心对象

### 4.1 RecommendationContent

候选内容类型：

```text
question_prompt      note_continue       title_only
blank_capture        excerpt             quote
on_this_day          stale_note_nudge    character_letter
human_message        wellbeing_reminder
```

一个上传候选的最小示例：

```json
{
  "candidate_ref": "hc_bIY8pY-0FQmRr3jL9aI3cQ",
  "type": "note_continue",
  "display": {
    "title": "继续补完角色动机",
    "body": "这段文字已被用户明确批准发送到屏幕。",
    "prompt": "补充一个让角色改变决定的瞬间。"
  },
  "source_ref": "hs_BSC3GLQq73fhdCjpxRgv0Q",
  "write_target_ref": "ht_qB4B5cFbI_OieR6wDGnB0w",
  "allowed_actions": ["open", "respond", "later", "skip"],
  "sensitivity": "normal",
  "reason_code": "stale_note",
  "score": 0.72,
  "expires_at": "2026-07-20T12:00:00Z"
}
```

`source_ref` 和 `write_target_ref` 必须是 Connector 生成的 opaque 引用。Hub 不得从中推断路径；只有原 Connector 能把它们解析回本地目标。

### 4.2 ContextObservation 与 ContextSnapshot

V1 状态：

```text
unknown            desk_focus       desk_idle
walking            outdoors         commuting
exercising         resting          do_not_disturb
```

观测包含来源、状态、置信度、TTL 和可选的粗粒度语义字段。精确坐标、SSID、网络名和联系人不得进入观测。

### 4.3 ContentSelection

一次选择固定：

- `selection_id`、`delivery_id`
- 设备、Receiver、`content_id`、`revision_id`
- 单调 `state_version`
- 选择原因、规则分数、上下文快照
- `policy_version`、`model_version`
- 是否允许振动、选择时间和过期时间

### 4.4 DeviceDisplayAck

设备完成渲染后提交：

```json
{
  "ack_id": "ack_2c4d6c5ac3d945d783b4b6d7ee8dd8dc",
  "selection_id": "sel_13a3de58a28a45a6b976f8f692d95d3f",
  "state_version": 8,
  "content_id": "cnt_c117d7f1c50944ba88dfd77dd0d58da2",
  "revision_id": "rev_b66f2ed0684a4df7a4dbad4b05529d50",
  "status": "displayed",
  "render_hash": "<64 位小写 SHA-256 hex>",
  "firmware_version": "towrite-eink/0.1.0",
  "battery_percent": 74
}
```

失败可使用 `status: "failed"` 和不含私密内容的 `error_summary`。失败 ACK 会被审计，但不推进 `displayed`。

## 5. selected 与 displayed 的权威语义

这是协议最重要的状态约束：

- `selected_content_id` 是服务端希望设备显示什么，是 desired 的权威状态。
- `displayed_content_id` 是设备已经成功显示什么，只能由完全匹配的成功 ACK 推进。
- 新选择在数据库事务中令 `state_version + 1`，并更新 selected；不得同时假装 displayed 已更新。
- 设备只能渲染高于其本地已应用版本的 desired。
- ACK 只有在 `selection_id`、`state_version`、`content_id` 和 `revision_id` 全部等于当前 selected，且 `status=displayed` 时才被接受。
- 重复 ACK 按 `ack_id` 幂等返回；迟到、乱序、跨设备或字段不一致的 ACK 只记审计，绝不能覆盖更高版本的 selected 或 displayed。
- 服务器重启后 selected 和 displayed 均保持；设备离线或重试不回滚状态。

示例：

```text
v7 selected=A, displayed=A
服务端选择 B → v8 selected=B, displayed 仍为 A
手机碰 NFC → 打开 A（屏幕一致优先）
设备显示 B 并 ACK v8 → selected=B, displayed=B
此后碰 NFC → 打开 B
迟到的 A/v7 ACK → 记录为 stale，不改变任何状态
```

Tap Router 优先冻结最近成功的 displayed；尚无任何成功 ACK 时才回退 selected。这可避免屏幕仍显示 A、手机却打开 B。

## 6. HTTP API

### 6.1 能力发现

```http
GET /v1/hub/capabilities
```

返回协议版本、最多候选数、内容/上下文类型、最大长轮询时间、ACK 支持和鉴权要求。客户端必须在不兼容的 major version 下停止使用 Hub，并回退本地能力。

### 6.2 上传候选批次

```http
POST /v1/hub/receivers/{receiverId}/candidate-batches
Authorization: Bearer <connector_token>
Content-Type: application/json
```

```json
{
  "protocol_version": "1",
  "batch_id": "bat_client_01",
  "generated_at": "2026-07-19T10:30:00Z",
  "device_id": "dev_0123456789abcdef0123456789abcdef",
  "candidates": ["<1 至 20 个符合 4.1 wire contract 的候选>"],
  "auto_select": true,
  "policy_version": "rules-v1",
  "model_version": "local-rules"
}
```

Hub 验证用户、Receiver 和设备绑定；去重或创建内容修订；返回候选映射以及可选的自动选择。一个批次必须包含 1–20 个候选。

上传前 Connector 必须完成 include/exclude、`private`/`no-ai`/`no-cloud`、附件、正文显示字段预览和用户授权。扁平的 `content_type`、`title`、`actions` 只作为旧客户端别名保留；新客户端使用 4.1 的结构。

### 6.3 上传上下文观测

```http
POST /v1/hub/context/observations
Authorization: Bearer <connector_token>
```

```json
{
  "protocol_version": "1",
  "observations": [{
    "observation_id": "obs_0123456789abcdef0123456789abcdef",
    "receiver_id": "rcv_…",
    "device_id": "dev_…",
    "source": "manual",
    "state": "walking",
    "confidence": 1,
    "ttl_seconds": 1800,
    "place_label": "riverside-park",
    "local_hour": 17,
    "habit_id": "",
    "note_type": "mindflow",
    "workflow_stage": "sparks"
  }]
}
```

手工修正的置信度必须为 `1`；`confirmed_habit` 必须携带已接受的 `habit_id`。返回观测 ID 和融合后的 ContextSnapshot。过期原始观测和快照按 retention 清理，V1 默认不超过 30 天。

### 6.4 账户端创建选择

```http
POST /v1/hub/devices/{deviceId}/selections
Authorization: Bearer <access_token>
```

```json
{
  "content_id": "cnt_…",
  "revision_id": "rev_…",
  "reason": "用户在 Obsidian 中点击发送到屏幕",
  "score": 1,
  "policy_version": "manual-v1",
  "model_version": "none",
  "expires_at": ""
}
```

内容必须属于账户内与该设备绑定的 Receiver。成功时事务创建 `selection_id`、`delivery_id` 并递增 `state_version`。

### 6.5 设备长轮询 desired

```http
GET /v1/hub/devices/{deviceId}/desired?after=<local_version>&wait=25
Authorization: Device <device_secret>
If-None-Match: "hub-<version>-<hash-prefix>"
```

行为：

- `after` 是设备已处理的最高 version；`wait` 被限制到 0–25 秒。
- 若存在 `state_version > after`，立即返回选择和 `card`，并设置 `ETag`、`Cache-Control: no-store`。
- 等待期内出现新选择，最迟应在一次轮询周期内返回；模拟器验收目标为状态变化后 5 秒内收到。
- 超时且无更新返回 `204 No Content`。
- 如果 ETag 仍有效，可返回 `304 Not Modified`。
- 网络错误使用带抖动的指数退避，但设备不得把本地 version 回退。

返回示例：

```json
{
  "selection_id": "sel_…",
  "delivery_id": "dlv_…",
  "state_version": 8,
  "selected_at": "2026-07-19T10:30:00Z",
  "expires_at": "",
  "score": 0.87,
  "reason": "当前写作阶段与候选匹配",
  "policy_version": "rules-v1",
  "model_version": "local-rules",
  "allow_vibration": false,
  "card": {
    "content_id": "cnt_…",
    "revision_id": "rev_…",
    "content_type": "note_continue",
    "title": "继续这篇笔记",
    "body": "…",
    "prompt": "…",
    "actions": ["open", "respond", "later", "skip"],
    "reason": "…",
    "content_hash": "<sha256>",
    "expires_at": ""
  }
}
```

### 6.6 设备 display ACK

```http
POST /v1/hub/devices/{deviceId}/display-acks
Authorization: Device <device_secret>
Content-Type: application/json
```

请求体见 4.4。响应包含 `accepted`、`duplicate` 和原因。设备应在完整刷新成功后 ACK；不要在开始绘制前 ACK。若刷新失败，提交 `failed` 便于诊断，然后继续保留上一个本地 displayed/version。

### 6.7 查看设备状态

```http
GET /v1/hub/devices/{deviceId}/state
Authorization: Bearer <access_token>
```

返回 selected、displayed、`in_sync`、`last_seen_at`、当前 Tap URL、实际 NDEF 字节数和 NTAG213 是否可容纳。该接口不接受 Device secret，也不返回 secret 或 Vault 路径。

### 6.8 选择反馈

```http
POST /v1/hub/selections/{selectionId}/feedback
Authorization: Bearer <access_token>
```

```json
{
  "event_id": "evt_2bfa6e1ac43d4827b946a13b06663303",
  "action": "later",
  "at": "2026-07-19T10:35:00Z",
  "note_written": false
}
```

反馈可为 `useful`、`skipped`、`later`、`answered`、`opened`、`opened_no_write`。`event_id` 提供幂等性。反馈影响冷却和后续规则分数，但不得隐式接受习惯候选。

### 6.9 Tap Router 与短时会话

```http
GET /t/v1/{tapId}
```

Hub 按“displayed 优先，selected 回退”解析卡片，创建约 5 分钟的服务器端 Tap session，并冻结 `selection_id`、`content_id` 和 `revision_id`。页面必须发送：

```text
Cache-Control: no-store
Referrer-Policy: no-referrer
Content-Security-Policy: 限制到本页所需最小范围
```

读取 Tap 页面或以下 GET 不消耗会话：

```http
GET /v1/hub/tap-sessions/{sessionId}
```

它返回冻结卡片和 `requires_login_to_write: true`。成功提交反馈或 Capture 才消耗会话；过期或已消耗会话不得再次写入。

### 6.10 Tap 反馈与加密 Capture

```http
POST /v1/hub/tap-sessions/{sessionId}/feedback
Authorization: Bearer <access_token>
X-CSRF-Token: <tap_session_csrf>
```

```http
POST /v1/hub/tap-sessions/{sessionId}/captures
Authorization: Bearer <access_token>
X-CSRF-Token: <tap_session_csrf>
```

Capture 请求示例：

```json
{
  "idempotency_key": "cap-client-uuid",
  "receiver_id": "rcv_…",
  "ciphertext": "<base64url ciphertext>",
  "encryption": {
    "version": 1,
    "algorithm": "ECDH-P256+HKDF-SHA256+A256GCM",
    "ephemeral_public_key": {},
    "nonce": "<12 字节 base64url>",
    "salt": "<16 字节 base64url>",
    "additional_data": "dG93cml0ZS1odWItY2FwdHVyZS12MQ"
  },
  "size_bytes": 512,
  "intent": "respond",
  "target_revision": "rev_冻结内容修订"
}
```

明文在客户端加密，包含 `protocolVersion`、唯一 `captureId`、冻结的 `selectionId`/`contentId`、`intent`、回答 `body`、opaque `writeTargetRef`、冻结 `targetRevision` 和 `createdAt`。HKDF `info` 与 AES-GCM AAD 都固定为 UTF-8 `towrite-hub-capture-v1`；`additional_data` 是它的 base64url，AES-GCM ciphertext 包含 128-bit tag。Hub 复用现有 E2EE Capture 队列，只保存密文、必要加密元数据和 opaque 关联，供 Connector 拉取后交给 CaptureService 完成追加、新建、问题回答、冲突检测、幂等提交和安全撤销。

`vault_path`、`absolute_path`、`selection_text`、`clipboard` 等字段不得出现在 Hub 加密元数据中。相同 `idempotency_key` 重试返回原 capture，不得产生第二次写入。

### 6.11 设备与 Tap 密钥轮换

账户端可调用：

```http
POST /v1/hub/devices/{deviceId}/secret/rotate
POST /v1/hub/devices/{deviceId}/tap-id/rotate
Authorization: Bearer <access_token>
```

device secret 轮换后只显示一次新值，旧值立即失效。tap ID 轮换会撤销旧标签入口；用户需要重新写标签。

### 6.12 Mailbox 与外部留言

账户端：

```http
POST /v1/hub/mailboxes
POST /v1/hub/mailboxes/{mailboxId}/sender-keys
DELETE /v1/hub/mailboxes/{mailboxId}/sender-keys/{senderKeyId}
Authorization: Bearer <access_token>
```

留言者：

```http
POST /v1/hub/mailboxes/{mailboxId}/messages
Authorization: Sender <sender_key>
```

```json
{
  "title": "记得吃饭",
  "body": "已经很晚了，先去吃点东西吧。",
  "prompt": "",
  "request_display": true,
  "idempotency_key": "sender-client-uuid"
}
```

`sender_key` 只授予一个 mailbox 的 `messages:create`，支持过期、撤销、每 key 限频和幂等。它不得读取设备、selected/displayed、ACK、笔记、Receiver 队列或设置。普通 sender 的消息进入审核/候选流；只有用户明确标记的可信 sender 规则才可请求自动显示，且仍受勿扰和振动政策约束。

### 6.13 首次配对与 Connector 写回

插件首次连接向导按以下顺序调用需要账户鉴权的 Cloud Relay 接口：

```http
POST /v1/auth/email/start
POST /v1/auth/email/verify
POST /v1/receivers
POST /v1/devices
POST /v1/pairing/sessions
POST /v1/pairing/claim
POST /v1/hub/devices/{deviceId}/tap-id/rotate
```

账户 access token 只存在于设置对话框内存，不写入插件数据。Receiver pull token 与 P-256 私钥保存在本地插件数据中。256-bit device secret 只显示一次，供写入 ESP32 安全存储；插件不持久化它。

Connector 后续用 Receiver 凭据调用 `GET /v1/receivers/{receiverId}/captures/pending` 拉取手机端加密回答。在本地解密并经 CaptureService 冲突检查成功写入后，调用 `POST /v1/captures/{captureId}/ack`，请求体为空；ACK 不上传 Vault 路径。失败或冲突项目继续留在队列中供检查和重试。

## 7. 上下文融合与推荐 Agent

### 7.1 固定流水线

```text
Context Fusion
  → Candidate Retrieval
  → Privacy / Policy Gate
  → 本地规则评分
  → 可选 AI 白名单重排
  → Selection Store
  → Device Delivery
  → Feedback
```

候选源包括 WorkflowIndex、LocalKnowledgeIndex、问题库、CaptureService、HabitLearningService 和 Backend CaptureCore。Connector 最多上传 20 个隐私过滤后的候选。

### 7.2 状态进入、保持和退出

- `do_not_disturb` 手工观测立即生效。
- 其他手工修正置信度为 `1`，在 TTL 内优先于自动观测。
- 普通状态置信度至少 `0.75`，并连续出现两次观测后才进入。
- 已进入状态在置信度仍至少 `0.45` 时保持。
- 低于 `0.45` 持续 5 分钟后才退出为 `unknown`。
- 所有观测都必须有 TTL；过期观测不参与融合。
- V1 的 `semantic_place` 是用户给出的粗粒度名称，不是精确定位。

### 7.3 习惯审批

- pending 习惯只进入建议中心，不能参与候选评分、通知或振动。
- 只有达到本地证据门槛并由用户接受的习惯，才能以 `confirmed_habit` 观测或 `accepted_habit` policy 参与推荐。
- AI 可以合并或改写候选说明，但不能将候选状态改为 accepted。
- 清空学习数据后，不得在另一个隐藏数据库保留唯一副本。

### 7.4 选择保持、冷却与振动

- 自动选择默认至少保持 30 分钟。
- 用户手工切换、内容过期或高优先级到期事项可以突破保持期。
- 最近展示、跳过和重复内容进入冷却；`later` 与 `skipped` 应降低近期分数。
- 勿扰期间不推进自动显示状态。
- 只有到期事项、已确认习惯或用户显式允许的可信 sender 规则可以请求振动。
- 默认安静时段为 23:00–08:00；安静时段内不振动。
- 已确认习惯振动每日最多 3 次。

### 7.5 AI 与 Skills 的权限边界

可信 Backend 可以使用 LiteLLM、Skills 和 Agent Registry，但必须遵守：

- 输入仅含 Connector 提供的候选 ID 和用户在发送字段预览中授权的字段。
- AI 只能返回候选白名单中的 ID、顺序和有长度限制的解释。
- 未知、重复、越权 ID 一律丢弃；超时、离线、模型错误或协议不兼容时立即使用本地规则顺序。
- AI 不得发明笔记、`source_ref`、`write_target_ref`、设备、路径或习惯接受状态。
- AI 不得直接调用 selection、vibration、Vault write 或 mailbox 权限。
- `character_letter` 是用户显式开启的 Composer Skill；生成结果仍作为普通候选经过隐私和策略门。

## 8. 隐私、日志与数据保留

Connector 默认排除系统目录、模板、附件以及带 `private`、`no-ai`、`no-cloud` 或等价 frontmatter 标记的内容。上传预览应显示 provider、发送字段和候选数量。

默认不得上传或记录：

- 完整笔记正文、选区、剪贴板内容；
- 绝对 Vault 路径或可还原的本地路径；
- 按键内容、按键数；
- 联系人、SSID、网络名；
- 精确坐标或持续后台定位；
- device secret、Connector token、Receiver token；
- 未经用户确认的习惯作为长期规则。

编辑器按键路径只做常量级内存状态标记。候选构建、索引、网络同步必须在 debounce 后的后台任务中完成，不得阻塞输入。

应用日志应对 Authorization、cookie、CSRF、Tap session、URL query、密文元数据中的敏感字段做脱敏；反向代理/CDN 的访问日志需要另行配置。Tap 页面禁止 Referrer 泄漏。小时级清理任务将原始上下文与候选批次保留不超过 30 天、在 Tap session 过期 1 天后删除无 Capture 关联的会话、按 pending/ACKed 配置删除过期 Capture 密文，并将非当前的 selection/display 审计记录保留 90 天。删除账户会撤销凭据并物理删除 Hub 领域数据；删除单个设备会立即撤销该设备、Tap、mailbox 与 sender 凭据，但不影响同一账户的其他设备。

## 9. ESP32 与模拟器接入

### 9.1 设备状态机

设备持久化：

```text
device_id
device_secret（安全存储）
applied_state_version
displayed content/revision/selection
last ETag
```

推荐循环：

```text
1. GET desired?after=applied_state_version&wait=25
2. 204/304：立即发起下一次长轮询
3. 200：校验 JSON、content_hash、version > applied_state_version
4. 在离屏缓冲中布局并刷新墨水屏
5. 刷新成功：POST status=displayed 的 ACK
6. ACK accepted=true：持久化新的 applied_state_version 和 displayed
7. 刷新或 ACK 失败：保留旧版本，带抖动退避后重试
```

必须避免：先写本地 version 再刷新、在渲染前 ACK、接受较低 version、把 ACK 结果反向写成 selected、在日志中打印完整 secret。

### 9.2 HTTP 与功耗建议

- 公网只使用 HTTPS，并校验服务器证书和时间。
- 客户端超时应大于 25 秒的长轮询窗口并留出网络余量，例如 35 秒。
- `204`/`304` 后可以立即继续；网络故障使用 1、2、4、8…秒的抖动退避并设置上限。
- `allow_vibration=false` 时不得振动；设备仍可静默刷新。
- 内容过长由设备端按屏幕能力截断并显示省略号，不能在小屏内滚动。

### 9.3 设备模拟器

模拟器位于独立的 ObsidianAI-Backend 仓库。从该仓库根目录按以下模式运行（具体参数以脚本 `--help` 为准）：

```powershell
python scripts/eink_device_simulator.py `
  --base-url https://hub.example.com `
  --device-id dev_0123456789abcdef0123456789abcdef `
  --device-secret <一次性配对密钥>
```

模拟器应打印卡片、ETag 和 state version，模拟刷新后提交 ACK。端到端验收：创建新 selected 后，模拟器在 5 秒内收到；ACK 后账户状态的 `in_sync` 为 true；旧 ACK 不改变状态。

## 10. NFC 入口摘要

NTAG213 V1 只写一条 URI Record：

```text
<PUBLIC_BASE_URL>/t/v1/<tap_id>
```

不得写 device secret、API key、access token、selected/content ID 或 Vault 路径。V1 是 HTTPS PWA，不写 Android Application Record。Hub 的设备状态接口会返回该 URL 的实际 NDEF 占用字节数；超过 NTAG213 的 144 字节用户区时必须拒绝生成/写入。

完整操作见 [NTAG213 与 NFC Tools 操作指南](ntag213-nfc-tools.zh-CN.md)。

## 11. 兼容与验收清单

- Quote0、Push Feed、旧 External API 和现有 Capture 客户端继续工作。
- 只有 device ID、错误 token 或跨设备 token 均返回 401/403。
- secret 与 tap ID 轮换后旧值立即失效。
- Hub 重启后 selected/displayed/state version 不变。
- 重复 poll、ACK、反馈和 Capture 按各自幂等 ID 安全重试。
- 乱序 ACK 不回滚 displayed；ACK 永不修改 selected。
- Tap 在 selected 已变但未 ACK 时仍打开屏幕上的 displayed；无 ACK 时回退 selected。
- URL、日志、重定向和 Referrer 不含长期凭据。
- private/no-ai/excluded 内容、正文、选区、精确路径和精确位置不进入 Hub 或 AI payload。
- AI 越权 ID、超时、离线或无模型时安全回退本地规则。
- pending 习惯不影响推荐；接受后才生效。
- 勿扰、安静时段、每日振动上限和低置信上下文严格生效。
- Mailbox sender key 无权读取设备、ACK、笔记或设置，并通过限流、撤销和恶意内容测试。
- 编辑器输入路径不执行同步 I/O、网络请求或全库扫描。
- 端到端路径通过：候选 → selected → 模拟器 ACK → NFC/PWA → 加密队列 → CaptureService 写回。

## 12. 版本演进

不兼容变更必须发布新的 major 路径或协议版本。新增可选 JSON 字段可以保持 V1，但客户端必须忽略未知字段。未来原生手机端的位置/运动识别、Android App Link/AAR、NTAG 424 DNA 和真实墨水屏驱动均不应改变 V1 的核心不变量：Hub 最小知情、selected 服务端权威、displayed 只由 ACK 推进、标签不携带长期凭据。
