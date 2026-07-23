# ESP32-S3 墨水屏：今日卡组与三键协议

这个示例实现本地设备侧的 `towrite-device/v2`：

1. 轮询 ToWrite 希望设备显示的卡片；
2. 真正刷新物理墨水屏；
3. ACK 本次已经显示的精确状态；
4. 只针对这份已 ACK 状态发送单击、双击或长按事件。

顺序不能颠倒。假设 ToWrite 已经选择 B，但墨水屏像素仍是 A，按键必须
继续针对 A。仅仅下载 B 的 JSON，不能把设备的 `displayedTuple` 改成 B。

今日卡组固定有三类页面：

- `daily_overview`：日期、今日主题、当前任务、之后两项、最小下一步和
  全部今日任务的完成进度；
- `daily_plan_item`：单个任务的目标、下一步、预计时间和开始时间；
- `daily_result`：已完成与剩余任务，不显示全部积压、字数等数据。

Echo、ToThink 和 ToWrite 卡片继续使用同一个渲染入口。

## 1. 三键行为

三个轻触按键均为“一端接 GPIO、一端接 GND”，固件启用
`INPUT_PULLUP`。

| 按键 | 单击 | 双击 | 长按 |
| --- | --- | --- | --- |
| 左键 | 上一页面 | 上一任务卡 | 预留 |
| 主键 | 开始并打开当前笔记 | 打开只新建的 Capture | 预留录音 |
| 右键 | 下一页面 | 下一任务卡 | 安全完成当前任务 |

固件参数固定为：

- 45 ms 消抖；
- 320 ms 双击判定窗口；
- 700 ms 长按阈值。

单击会等 320 ms 窗口结束才发送；长按会取消待发送的单击。最终动作仍由
ToWrite 校验，例如右键长按只有在已 ACK 的当前任务卡上才可能完成任务。

## 2. Obsidian 与固件配置

在 `ToWrite 设置 → API 与设备` 开启：

```text
External API = 开启
API bind host = 0.0.0.0
API port = 48321
```

每块屏幕创建一个独立设备 target，并生成 target-scoped token。不要把
External API 管理员 token 烧入设备。示例只在 `Authorization` 请求头
发送 token，因此 query-token 可以继续关闭。

修改固件：

```cpp
const char* WIFI_SSID = "你的 Wi-Fi";
const char* WIFI_PASSWORD = "你的 Wi-Fi 密码";
const char* API_BASE_URL = "http://192.168.1.20:48321";
const char* DEVICE_TARGET_ID = "local-web";
const char* DEVICE_TOKEN = "该 target 的独立 token";

const int MAIN_BUTTON_PIN = 6;
const int LEFT_BUTTON_PIN = 5;
const int RIGHT_BUTTON_PIN = 4;
```

按你的 ESP32-S3 开发板和墨水屏载板原理图选择空闲 GPIO，不要直接照抄
示例引脚。安装 `ArduinoJson` 和你的屏幕驱动，例如 `GxEPD2`。

普通 ESP32 本身不是 Tailscale 节点，通常不能直接访问私有
`*.ts.net` Serve 地址。可以使用同一局域网、电脑热点，或显式配置
subnet router。

## 3. 轮询、物理刷新与 ACK

设备轮询：

```http
GET /api/v1/eink?targetId=local-web&limit=1&cursor=0
Authorization: Bearer <target-scoped-token>
```

除了 `focus[0]` 中的卡片，响应还包含精确的目标状态：

```json
{
  "playlist": {
    "desired": {
      "deviceId": "local-web",
      "selectionId": "sel_local_...",
      "stateVersion": 12,
      "contentId": "cnt_local_...",
      "revisionId": "rev_local_...",
      "cardId": "daily-overview:2026-07-24",
      "playlistRevision": "einkrev_..."
    }
  }
}
```

示例会先确认 `focus[0].id` 与 `desired.cardId` 一致，再调用
`renderCard()`。接入真实驱动时，只有屏幕控制器确认刷新完成后才能返回
`true`。

刷新成功之后才发送：

```http
POST /api/v1/device/display-acks
Authorization: Bearer <target-scoped-token>
Content-Type: application/json

{
  "eventId": "ack-唯一值",
  "deviceId": "local-web",
  "selectionId": "sel_local_...",
  "stateVersion": 12,
  "contentId": "cnt_local_...",
  "revisionId": "rev_local_...",
  "cardId": "daily-overview:2026-07-24",
  "playlistRevision": "einkrev_..."
}
```

只有 ACK 返回 HTTP 200，固件才把它复制到本地 `displayedTuple`。新像素
刷新完成后，旧 tuple 会立即失效；如果 ACK 失败，新 tuple 会暂存在另一处
等待重试，同时禁用按键。遇到冲突则清除本地 tuple，重新轮询、刷新并 ACK。

## 4. Schema v2 按键事件

每个手势都携带完整的已显示状态：

```http
POST /api/v1/device/events
Authorization: Bearer <target-scoped-token>
Content-Type: application/json

{
  "schemaVersion": 2,
  "eventId": "evt-唯一值",
  "targetId": "local-web",
  "deviceId": "local-web",
  "selectionId": "sel_local_...",
  "stateVersion": 12,
  "contentId": "cnt_local_...",
  "revisionId": "rev_local_...",
  "cardId": "daily-overview:2026-07-24",
  "playlistRevision": "einkrev_...",
  "button": "primary",
  "gesture": "single"
}
```

服务端根据 `button + gesture` 决定动作，设备不能在请求里任意指定
`action`。重复 `eventId` 是幂等的；tuple 过期时返回 HTTP 409，不会误开
或误完成另一张卡。

响应里的 `displayMessage` 会交给 `renderCommandStatus()` 做状态区局部
刷新。示例会把常见结果缩短为：

- `Opened`：已打开；
- `Waiting for computer`：等待电脑；
- `Computer offline`：电脑离线；
- `Conflict - refreshing`：状态冲突，正在刷新；
- `Recording unavailable`：录音尚未启用。

把 `renderCard()`、`renderEmpty()`、`renderCommandStatus()`、
`renderConnectionStatus()` 和 `renderError()` 替换为真实屏幕调用。按键
结果和连接状态建议只刷新底部窄区域，避免每 5 秒健康轮询都刷新整屏。

## 5. 安全与排查

- target token 不进入 URL 或 JSON，也不会写到串口日志。
- 每块屏幕使用不同 target/token；轮换一块屏幕的密钥不会影响其他设备。
- HTTP 401/403：target 与 token 不匹配，或权限不足。
- HTTP 409：眼前显示的 tuple 已过期；示例会立即重新拉取并 ACK。
- `Computer offline`：ESP32 无法通过 Wi-Fi 访问 Obsidian External API。
- 主键长按返回 `Recording unavailable` 是 V1 的正常行为，不会伪造录音。

不要把真实 Wi-Fi 密码、token 或私有设备地址提交到 GitHub。
