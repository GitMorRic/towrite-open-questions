# 按一下打开对应位置：导航架构与接入指南

## 当前已启用的目标

当前版本注册了 Obsidian、受限网页与本机批准深链接三种 Adapter：

- Obsidian：支持文件、heading、block、上下文文本锚点、行号和 PDF 页码。
- 网页：只识别用户显式填写的
  `[towrite-target:: https://example.com/path#fragment]`。普通任务正文中的
  URL 不会执行；HTTP、带账号密码的 URL、`file:`、`data:` 和
  `javascript:` 会被拒绝，打开时使用 `noopener,noreferrer`。
- 本机深链接：只能来自设置页中的命名动作，例如 `vscode://`。硬件只知道
  action ID；`file:`、`javascript:`、`ms-settings:`、浏览器协议、电话/短信
  与任何 Shell/可执行文件调用都会被拒绝。

Daily 任务可以声明：

```md
[towrite-action:: writing-focus]
```

内置 `note-focus` 会在主编辑区打开任务的真实目标，同时在右侧打开完整今日
列表。它适合实体主键“一按回到上下文”的工作流：

```md
[towrite-action:: note-focus]
[towrite-target:: [[项目/ToWrite#^next-action]]]
```

`writing-focus` 必须先在 ToWrite 设置的“命名桌面动作”中创建并启用。动作
可打开今日页、专注布局、Vault 内明确目标、显式 HTTPS，或单独批准的应用
深链接。远端和 ESP32 永远只看到 opaque action/card ID。

用户在悬浮今日小窗点击“稍后”后，插件会把当前笔记的上下文文本锚点和
最后行号写到本地
`.obsidian-open-questions/daily/navigation-checkpoints.json`。下次点击同一
任务时，断点优先于静态标题或 block；目标发生变化后旧断点自动失效。
外部网页目前不能把滚动位置回传给 Obsidian，V1 应使用 URL fragment
保存网页位置。

## 已实现的 V1

当前主键单击链路是：

```text
ESP32 拉取 desired
  → 墨水屏完成物理刷新
  → ESP32 ACK displayed tuple
  → 主键单击（等待双击判定窗口结束）
  → POST /api/v1/device/events
  → ToWrite 校验 token、eventId 和 displayed tuple
  → 本地解析目标
  → 必要时开始或继续当前 displayed 任务
  → 注册的 Adapter 打开 Obsidian 精确位置或显式 HTTPS 目标
```

按钮永远针对屏幕实际显示的 `displayed`，不是服务器刚选中但尚未刷到屏幕的 `selected`。如果屏幕显示 A，而服务器已经准备 B，按键仍然只能打开 A。

概要页和任务页都采用“先开始/继续，再打开”的一致语义。已经进行中的
任务只打开，不重复写入计时转换。

Daily 任务的目标优先级是：

```text
命名 [towrite-action:: ...]
  → 显式 [towrite-target:: ...]
  → 子任务自己的链接
  → 最近父分类的链接
  → 任务自己的 ^daily_* block
  → 今日 Dashboard
```

问题卡片使用更稳健的位置顺序：

```text
稳定 block ID → 上下文文本锚点 → 最后一次行号
```

heading 或 block 已被删除时，插件不会假装成功后只打开文件顶部；它会返回冲突/目标不存在。

## 在没有真实按键时验证

1. 在 `设置 → ToWrite → API 与设备` 启用 External API。
2. 让设备或模拟器至少完成一次 `/api/v1/eink` 拉取、物理渲染和 `/api/v1/device/display-acks`。
3. 打开 Obsidian 命令面板。
4. 运行 `ToWrite: Device: simulate main-button single click`。
5. 插件应打开当前 displayed 卡片对应的笔记位置。

如果提示“还没有设备已 ACK 的 displayed 卡片”，说明问题仍在拉取/渲染/ACK 之前；这时不应绕过 displayed 校验直接打开 selected。

## ESP32 必填配置

示例位于 `examples/esp32s3-eink/`。至少需要填写：

```cpp
const char* WIFI_SSID = "...";
const char* WIFI_PASSWORD = "...";
const char* API_BASE_URL = "http://电脑局域网IP:48321";
const char* DEVICE_TARGET_ID = "设置页里的 target id";
const char* DEVICE_TOKEN = "该 target 独立的 scoped token";

const int MAIN_BUTTON_PIN = 6;   // 按实际板卡修改
const int LEFT_BUTTON_PIN = 5;
const int RIGHT_BUTTON_PIN = 4;
```

示例默认 GPIO 是 `-1`，不改就不会产生任何按钮事件。ESP32 直接访问电脑时，External API 的 bind host 需要是 `0.0.0.0`，Windows 防火墙也要允许该端口。Capture Bridge `48322`、Capture PWA `8790` 和 External API `48321` 是三条不同用途的链路。

## 为什么不让 ESP32 直接发送文件路径

硬件事件只发送：

- 唯一 `eventId`；
- 设备 ID；
- `selection/content/revision/card/playlist` displayed tuple；
- 物理 button 与 gesture。

它不发送 Vault 路径、网页 URL 或自定义 URI。ToWrite 在本地通过冻结快照把 opaque card 映射成目标。这样即使硬件或 Hub 收到恶意输入，也不能要求电脑执行任意路径或协议。

## 扩展到网页和其他笔记软件

代码现在使用版本化 `NavigationTarget` 和 `NavigationAdapter`：

- `obsidian`：本地文件 + heading/block/text/line/PDF page；
- `web`：显式 HTTPS URL + fragment/text fragment；
- `deep-link`：只由本机命名动作构造的应用 URI；
- `provider`：预留其他笔记软件的 adapter ID + resource ID + location ID。

V1 已注册 Obsidian、Web 与 DeepLink Adapter。未来新增能力时，不修改按键协议，只增加受控 Adapter：

```text
displayed card
  → opaque navigation_ref
  → Connector 本地授权与解析
  → NavigationRouter
      ├─ ObsidianAdapter（已启用）
      ├─ WebAdapter（已启用；仅显式 HTTPS）
      ├─ DeepLinkAdapter（已启用；仅本机命名白名单）
      └─ OtherNotesAdapter（未来；固定 provider + resource ID）
```

网页 Adapter 应只允许 `https:`，并使用域名 allowlist；其他笔记软件优先保存不可变 page/block ID，不直接执行设备传来的 deep link。若软件支持官方深链，就由对应 Adapter 在本地生成；若不支持，需要浏览器扩展、本地 helper 或该软件自己的 Connector。

这种设计把“按键是什么”与“目标由哪个软件打开”分开：硬件协议保持稳定，新增网页、Notion 类工具或其他笔记应用时，不需要重刷 NFC 标签，也不需要让 Hub 获得 Vault 路径。
