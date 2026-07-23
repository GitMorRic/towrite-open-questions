# ESP32-S3 墨水屏：模板优先翻页示例

这个示例使用 ToWrite External API 的兼容小屏接口，实现：

- 插件里“立即显示”的模板卡会在约 5 秒内成为当前卡；
- 右键短按显示下一张，左键短按显示上一张；
- 队列顺序固定为“已保存且开启小屏翻页的 Echo 模板卡 → ToThink / ToWrite 卡”；
- 到达末尾后回到第一张；
- 轮询发现内容没有变化时，不重复刷新墨水屏。

`/api/v1/eink` 仍保留原有字段，因此旧渲染代码可以继续使用；新增的 `sourceType`、`contentType`、`actions` 和 `playlist` 用于识别 Echo 卡及共享游标。

## 1. Obsidian 端准备

在 `ToWrite 设置 → API 与设备` 中开启：

```text
External API = 开启
API bind host = 0.0.0.0
API port = 48321
```

不需要开启 query token。新示例把 token 放在 `Authorization` 请求头，不会出现在 URL、串口日志或路由器历史里。

再创建一个 `local-web` 设备目标：

```text
Target ID = local-web
Capabilities = buttons
Button mappings:
  right: next
  left: prev
```

为这个 target 生成独立随机 token。不要把 External API 的主 token 烧进 ESP32；每块屏幕应使用自己 target 的 token。

## 2. 将模板加入翻页队列

打开 `ToWrite 设置 → 收件箱与设备库 → Echo 墨水屏卡片`：

1. 选择一个参考模板或新建空白卡。
2. 修改卡片内容。
3. 打开“加入小屏按键翻页”。
4. 点击“保存”或“保存并显示”。

模板必须先保存才会进入队列。插件设置中的“小屏按键翻页队列”会显示 Echo 与 ToThink / ToWrite 各有多少张，并提供“测试下一页”按钮。

## 3. 固件配置

安装 Arduino 依赖：

- `ArduinoJson`
- 你的墨水屏驱动，例如 `GxEPD2`
- 如需中文，安装适合屏幕库的中文字库

修改 `esp32s3-eink.ino`：

```cpp
const char* WIFI_SSID = "你的 Wi-Fi";
const char* WIFI_PASSWORD = "你的 Wi-Fi 密码";
const char* API_BASE_URL = "http://192.168.1.20:48321";
const char* DEVICE_TARGET_ID = "local-web";
const char* DEVICE_TOKEN = "该 target 的独立 token";

const int NEXT_BUTTON_PIN = 4;      // 示例：GPIO 4
const int PREVIOUS_BUTTON_PIN = 5;  // 没有上一页键时填 -1
```

按钮一端接对应 GPIO，另一端接 GND。示例启用了 `INPUT_PULLUP`，所以按下时为低电平。不要照抄 GPIO 号；应按你的开发板原理图选择没有被墨水屏、启动模式或其他外设占用的引脚。

如果电脑开启 Windows 移动热点，电脑通常是 `192.168.137.1`；同一路由器下则使用电脑的局域网 IP。普通 ESP32 默认不在 tailnet 内，不能直接访问私有的 `*.ts.net` Tailscale Serve 地址；这种情况下继续使用同一 Wi-Fi、电脑热点或 subnet router。

## 4. 翻页协议

固件每 5 秒读取一次：

```http
GET /api/v1/eink?targetId=local-web&limit=1&cursor=0
Authorization: Bearer <target-token>
```

右键短按发送：

```http
POST /api/v1/device/events
Authorization: Bearer <target-token>
Content-Type: application/json

{
  "schemaVersion": 1,
  "eventId": "每次按键唯一的值",
  "targetId": "local-web",
  "deviceId": "ESP32 芯片标识",
  "button": "right"
}
```

ToWrite 会先原子地切换共享当前卡，再返回 `200`。固件随后重新请求 `cursor=0`，因此插件里的“下一页”、ESP32 按键和手动“立即显示”看到的是同一个当前状态。重复发送同一 `eventId` 不会翻两页。

## 5. 接入真实墨水屏

替换示例中的 `renderCard()`：

```cpp
void renderCard(
  const String& title,
  const String& body,
  const String& article,
  const String& lane,
  const String& sourceType,
  const String& summaryText
)
```

建议 2.7 英寸屏只显示一个核心信息、来源以及最多三个操作提示。模板卡的 `sourceType` 为 `echo`，划线卡为 `question`。

## 6. 排查

如果 ToThink / ToWrite 能显示但模板不能显示：

1. 确认模板已经保存，不只是打开了模板草稿。
2. 确认“加入小屏按键翻页”已开启。
3. 在设置中点击“测试下一页”，观察小屏是否切换。
4. 确认固件请求的是 `limit=1&cursor=0`，并每次都带 `targetId` 和 Bearer token。
5. `401` 表示 target ID 与 token 不匹配；超时通常是 IP、防火墙或 Obsidian 未运行。

使用 PowerShell 验证时，token 仍放请求头：

```powershell
$headers = @{ Authorization = "Bearer <target-token>" }
Invoke-RestMethod "http://192.168.1.20:48321/api/v1/eink?targetId=local-web&limit=1&cursor=0" -Headers $headers
```

## 7. 屏幕连接状态

示例会把以下状态作为卡片底部的小字传给渲染函数：

```text
WiFi OK | API OK | target local-web | sync @123s (0s ago)
```

- `renderCard()` 与 `renderEmpty()` 在整张卡片内容变化时绘制这个 footer；
- `renderConnectionStatus()` 只用于状态区的局部刷新，稳定连接时最多每分钟一次，不会因为 5 秒轮询而整屏刷新；
- HTTP、JSON 与 Wi-Fi 错误会进入 `renderError()`，因此真实驱动应把错误画到屏幕状态区，而不只是写入串口；
- 状态与错误文本不会包含 API token。

若显示 `API ERR | HTTP 401`，请检查 `DEVICE_TARGET_ID` 是否与该 target 的独立 token 完全匹配。若显示 `WiFi OFF`，请检查 Wi-Fi 和 ESP32 是否能访问电脑的局域网地址。

不要把真实 Wi-Fi 密码、token 或设备地址提交到 GitHub。
