# ESP32S3 墨水屏示例

这个示例展示 ESP32S3 如何从 ToWrite External API 拉取 `/api/v1/eink`，并把 ToThink / ToWrite 卡片显示到墨水屏。

示例不绑定具体墨水屏驱动。你可以把 `renderCard()` 中的 `Serial.println()` 替换为 GxEPD2、Waveshare、LilyGo 等屏幕库的绘制代码。

## ToWrite 设置

因为 ESP32S3 是局域网设备，需要在 Obsidian ToWrite 设置里：

```text
External API = on
API bind host = 0.0.0.0
API port = 48321
Allow GET query token = on
```

然后找到运行 Obsidian 的电脑 IP，例如：

```text
192.168.1.20
```

ESP32 会请求：

```text
http://192.168.1.20:48321/api/v1/eink?token=你的token&limit=3
```

## Arduino 依赖

在 Arduino IDE 或 PlatformIO 中安装：

- `ArduinoJson`

ESP32 core 自带：

- `WiFi.h`
- `HTTPClient.h`

## 配置

打开 `esp32s3-eink.ino`，修改：

```cpp
const char* WIFI_SSID = "你的 WiFi";
const char* WIFI_PASSWORD = "你的 WiFi 密码";
const char* API_HOST = "192.168.1.20";
const int API_PORT = 48321;
const char* API_TOKEN = "你的 token";
```

## 适配墨水屏

把这个函数替换为你的屏幕绘制代码：

```cpp
void renderCard(const String& title, const String& question, const String& article, const String& lane, const String& summaryText)
```

建议墨水屏显示：

- 顶部：open / candidate / blockedArticles 统计。
- 主体：当前 focus 卡片的 title、body、article。旧字段 `question` 仍可作为兼容备用。
- 底部：lane、kind、刷新时间。

## 安全注意

- 不要把真实 WiFi 密码和 token 提交到 GitHub。
- 只在可信局域网内使用 `0.0.0.0`。
- 如果要公网访问，建议用 Tailscale、Cloudflare Tunnel 或反向代理保护。
