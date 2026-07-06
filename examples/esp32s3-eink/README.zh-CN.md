# ESP32S3 墨水屏示例

这个示例说明 ESP32S3 如何从 ToWrite Open Questions 的 External API 拉取小屏数据，并把 ToThink / ToWrite / Workflow 状态显示到墨水屏上。

推荐第一版使用 `/api/v1/device-feed`。它返回的是已经为设备整理好的 view model，ESP32 不需要理解 Obsidian 的完整数据结构，只要按 `screens[]`、`items[]` 和 `actions[]` 渲染即可。旧的 `/api/v1/eink` 仍可作为只刷卡片的兼容接口。

## 电脑端准备

在 Obsidian 插件设置里打开 `API & Device`：

```text
External API = on
API bind host = 0.0.0.0
API port = 48321
Allow GET query token = on
```

如果电脑开启 Windows 移动热点，ESP32 连上这个热点后，电脑通常是：

```text
192.168.137.1
```

如果 ESP32 和电脑连接同一个路由器 Wi-Fi，请使用电脑在该局域网里的 IP，例如：

```text
192.168.1.20
```

如果手机/电脑通过 Tailscale 访问，则可以使用 Tailscale IP 或 MagicDNS 域名；ESP32 通常不建议第一版直接跑 Tailscale，先用同一 Wi-Fi 或电脑热点最稳。

## 推荐请求

2.7 寸横屏墨水屏可以请求：

```text
http://192.168.137.1:48321/api/v1/device-feed?token=你的token&profile=eink-bw&width=264&height=176&inches=2.7&page=home
```

常用页面：

```text
page=home       # 首页总览
page=cards      # ToThink / ToWrite 卡片
page=workflow   # Workflow stages 文件状态
page=articles   # 来源笔记，也就是哪些 Obsidian 文件里有卡片
```

常用过滤：

```text
lane=think      # 只看 ToThink
lane=write      # 只看 ToWrite
stage=sparks    # 只看某个 workflow stage
sourceFile=00-Raw/Example.md  # 只看某篇来源笔记里的卡片
cursor=1        # 翻页游标
```

## Arduino 依赖

Arduino IDE 或 PlatformIO 中安装：

- `ArduinoJson`
- 你的墨水屏驱动，例如 `GxEPD2`
- 中文字体方案，例如 `U8g2_for_Adafruit_GFX` 或你自己的点阵字体

ESP32 core 自带：

- `WiFi.h`
- `HTTPClient.h`

## 示例代码怎么改

打开 `esp32s3-eink.ino`，至少修改：

```cpp
const char* WIFI_SSID = "你的 WiFi";
const char* WIFI_PASSWORD = "你的 WiFi 密码";
const char* API_HOST = "192.168.137.1";
const int API_PORT = 48321;
const char* API_TOKEN = "你的 token";
```

当前 `.ino` 仍演示旧 `/api/v1/eink` 的最小卡片拉取，适合先验证网络和 token。接入真实墨水屏时建议改成 `/api/v1/device-feed`，按 `screen.type` 渲染不同页面。

## 五键交互建议

真实硬件可以只实现五个键，屏幕内也会显示同样提示：

| 键 | 短按 | 长按建议 |
| --- | --- | --- |
| 左一 | 新想法 / 打开手机输入页 | 可选：显示二维码 |
| 左二 | 上一页 / 上一张 | 快速回到上一个页面 |
| 中键 | 首页 | 语音记录新想法，交给手机 companion 或后续语音模块 |
| 右二 | 下一页 / 下一张 | 从首页进入卡片页 |
| 右一 | 当前操作，例如回答卡片、看卡片、打开来源 | 可选：语音回答当前卡片 |

ESP32 第一版建议只做“显示 + 翻页 + 二维码/短链接”。复杂输入交给手机页面 `/device/input`，这样硬件端保持简单。

## 防火墙排查

如果 ESP32 请求失败：

1. 确认 Obsidian 正在运行，External API 已开启。
2. 电脑浏览器打开同一个 URL，确认能返回 JSON。
3. 手机连接同一个 Wi-Fi，打开同一个 URL，确认不是电脑防火墙拦截。
4. Windows 防火墙允许 `Obsidian.exe` 或允许 TCP `48321` 入站。
5. ESP32 串口里打印 HTTP 状态码，`401/403` 多半是 token，`-1` 或超时多半是网络/防火墙/IP。

## 安全注意

- 不要把真实 Wi-Fi 密码、API token、Tailscale 域名提交到 GitHub。
- `0.0.0.0` 只建议在可信局域网、电脑热点或 Tailscale 内使用。
- 如果开放公网访问，请放在 HTTPS、反向代理和额外鉴权之后。