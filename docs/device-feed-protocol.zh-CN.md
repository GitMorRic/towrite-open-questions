# Device Feed 协议

`/api/v1/device-feed` 是给墨水屏、手机小屏、桌面小组件准备的稳定接口。它不会直接返回完整 Obsidian 原始数据，而是由电脑端先整理成适合设备渲染的 view model。

这样做的目的：

- ESP32 不需要理解 ToWrite 的全部内部模型。
- 小屏设备只需要按 `screen.type`、`item.type`、`action.id` 渲染。
- 后续电脑端可以继续优化摘要、排序、分页和 AI 提醒，硬件端尽量不改。

## 请求地址

```text
GET /api/v1/device-feed?token=...&profile=eink-bw&width=264&height=176&inches=2.7&page=home
```

需要先在插件设置中启用 External API。ESP32 这类不能发送 `Authorization` header 的设备，需要打开“允许 GET 查询参数 token”。

## Query 参数

| 参数 | 示例 | 说明 |
| --- | --- | --- |
| `token` | `tw_xxx` | API token。允许 query token 时可放在 URL 中。 |
| `profile` | `eink-bw` | 设备类型：`mobile-eink`、`eink-bw`、`desktop-card`。 |
| `width` | `264` | 屏幕像素宽度。 |
| `height` | `176` | 屏幕像素高度。 |
| `inches` | `2.7` | 屏幕对角线英寸，用于计算 ppi。 |
| `page` | `home` | 页面：`home`、`cards`、`workflow`、`articles`。 |
| `cursor` | `1` | 翻页游标。第一页可省略或为 `0`。 |
| `limit` | `1` | 每页数量。小屏建议省略，让服务器按 profile 自动决定。 |
| `lane` | `think` | 卡片过滤：`think` 或 `write`。 |
| `stage` | `sparks` | Workflow stage 过滤。 |
| `sourceFile` | `00-Raw/A.md` | 只显示某篇来源笔记里的卡片。 |

## Profile 含义

| profile | 用途 | 特点 |
| --- | --- | --- |
| `mobile-eink` | 手机模拟墨水屏 | 保留较多文字，适合触屏和手机浏览器。 |
| `eink-bw` | 黑白墨水屏 | 文本更短、信息密度更稳，适合 ESP32。 |
| `desktop-card` | 桌面小组件 | 可显示更多卡片和预览。 |

`profile` 不是设备注册表，也不是远程管理后台。它只是告诉服务器：请按照这种设备能力来裁剪文本、分页和动作。

## 返回结构

顶层结构固定如下：

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-03T01:00:00.000Z",
  "vaultName": "Capture",
  "profile": "eink-bw",
  "device": {},
  "summary": {},
  "workflow": {},
  "screens": [],
  "navigation": {},
  "actions": []
}
```

设备端建议：

- 用 `schemaVersion` 判断协议版本。
- 用 `profile` 和 `device.layout` 判断布局。
- 用 `screens[0]` 作为当前屏幕。
- 不要依赖中文 label 做逻辑判断，要依赖 `screen.type`、`item.type` 和 `action.id`。

## device

```json
{
  "width": 264,
  "height": 176,
  "inches": 2.7,
  "orientation": "landscape",
  "aspectRatio": 1.5,
  "ppi": 117.5,
  "layout": "landscape-compact",
  "page": "cards",
  "lane": "write",
  "stage": "sparks",
  "sourceFile": "00-Raw/A.md",
  "limit": 1
}
```

`layout` 可能是：

- `landscape-compact`：横屏小屏，例如 2.7 寸 264×176。
- `portrait-card`：竖屏手机模拟。
- `desktop-card`：桌面组件。

## summary

```json
{
  "think": 9,
  "write": 2,
  "unresolved": 11,
  "candidate": 0,
  "blockedArticles": 4,
  "workflowFiles": 6,
  "workflowStages": 5,
  "remindersDue": 0,
  "remindersUpcoming": 1
}
```

首页、状态栏、顶部小计都可以直接使用这些字段。

## workflow

```json
{
  "enabled": true,
  "uniqueFiles": 6,
  "stages": [
    {
      "id": "sparks",
      "title": "Sparks",
      "description": "灵感",
      "color": "amber",
      "count": 3,
      "staleCount": 1,
      "nextActions": []
    }
  ]
}
```

`workflow` 对应插件设置里的 Workflow Stages。它表示文件/项目生命周期，不等于 ToThink/ToWrite 批注。

## screens

`screens` 是当前请求真正要渲染的屏幕数组。第一版通常只取 `screens[0]`。

### home

首页包含 stats、workflow-stage、next-actions 或 empty：

```json
{
  "id": "home",
  "type": "home",
  "title": "小屏首页",
  "subtitle": "ToThink / ToWrite / Workflow 总览",
  "items": []
}
```

### cards

卡片页包含一张或多张主卡。2.7 寸横屏通常只显示一张主卡，并用 `peekItems` 放下一张预览。

### workflow

Workflow 页展示某个 stage 下的文件：标题、描述、下一步、是否 stale、ToThink/ToWrite 数量。

### articles

`articles` 在 UI 上叫“来源笔记”。它表示哪些 Obsidian 文件里有 ToThink/ToWrite 卡片。选择某篇来源笔记后，可以用 `sourceFile` 进入该文件的卡片队列。

## item 类型

| item.type | 出现页面 | 说明 |
| --- | --- | --- |
| `stats` | home | 首页数字栅格。 |
| `workflow-stage` | home | Workflow stage 小计。 |
| `next-actions` | home | 最近下一步。 |
| `card` | cards | ToThink / ToWrite 卡片。 |
| `workflow-file` | workflow | 某个 stage 下的 Markdown 文件。 |
| `article` | articles | 有卡片的来源笔记。 |
| `empty` | 任意 | 空状态文本。 |

## action 类型

| action.id | 用途 |
| --- | --- |
| `prev` | 上一页或上一张。 |
| `next` | 下一页或下一张。 |
| `quickCapture` | 打开手机 companion，记录新想法。 |
| `answerCard` | 打开手机 companion，回答当前卡片。 |
| `openSource` | 打开 Obsidian 来源 URI。 |
| `viewCards` | 从来源笔记进入该文件的卡片队列。 |

真实 ESP32 可以把这些 action 映射到五个物理键；手机模拟页可以直接点击。

## 2.7 寸横屏渲染建议

264×176 这类小屏不要再做屏内纵向滚动。建议每屏固定：

- 顶部：标题 + 页码/状态小计。
- 中间：主内容，最多一张主卡或一个文件条目。
- 底部：五键提示：新想法 / 上一页 / 首页+长按录音 / 下一页 / 当前操作。

如果内容太长，设备端应截断并显示省略号，不要让用户在墨水屏页面内滚动。

## 写入闭环

`device-feed` 本身是只读接口。写入走：

```text
POST /api/v1/questions/<id>/notes
POST /api/v1/captures
```

小屏设备不建议直接做复杂输入。推荐显示 `companionUrl` 或二维码，让手机打开 `/device/input` 完成文字/语音输入和保存位置选择。

## 安全

- URL 中的 token 等同密码，不要截图公开或提交仓库。
- 局域网/热点下可以用 HTTP；公网或 Tailscale MagicDNS 推荐 HTTPS。
- 设备端日志不要打印完整 token。