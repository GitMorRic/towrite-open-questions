# ToWrite External API 中文文档

External API 用来让 Obsidian 之外的设备读取 ToThink / ToWrite 卡片、Workflow Stages 文件状态，并把卡片状态或灵感备注写回。

注意：External API 只在 Obsidian 桌面端可用。当前市场版插件设置为 `isDesktopOnly: true`，因为本地 HTTP 服务使用 Node.js `http`。

## 启用方式

1. 打开 Obsidian 桌面端。
2. 进入 `Settings -> Community plugins -> ToWrite Open Questions`。
3. 打开 `External API`。
4. 复制 `API token`。
5. 默认本机访问地址是：

```text
http://127.0.0.1:48321
```

如果 ESP32、手机或另一台电脑需要通过局域网访问，把 `API bind host` 改成：

```text
0.0.0.0
```

然后使用运行 Obsidian 那台电脑的局域网 IP，例如：

```text
http://192.168.1.20:48321
```

## 鉴权

GET 接口支持两种写法：

```text
Authorization: Bearer <token>
```

或：

```text
?token=<token>
```

POST / PATCH 接口只接受 header：

```text
Authorization: Bearer <token>
Content-Type: application/json
```

## 快速测试

PowerShell：

```powershell
$token = "填你的 token"
$base = "http://127.0.0.1:48321"
Invoke-RestMethod "$base/api/v1/deck?token=$token"
Invoke-RestMethod "$base/api/v1/workflows?token=$token"
Invoke-RestMethod "$base/api/v1/device-feed?token=$token&page=home&profile=mobile-eink"
```

浏览器 fetch：

```js
const API_BASE = "http://127.0.0.1:48321";
const TOKEN = "填你的 token";
const res = await fetch(`${API_BASE}/api/v1/workflows?token=${encodeURIComponent(TOKEN)}`);
const payload = await res.json();
console.log(payload.stages);
```

ESP32 URL 示例：

```text
http://192.168.1.20:48321/api/v1/eink?token=填你的token&limit=3
```

内置 Dashboard：

```text
http://127.0.0.1:48321/dashboard?token=填你的token
```

Dashboard 会把 `deck`、`questions`、`articles`、`workflows` 解析成 UI，同时保留原始 JSON 预览，方便调试。

手机小屏 / 墨水屏模拟页：

```text
http://127.0.0.1:48321/device?token=填你的token
```

如果通过 Tailscale 从手机访问电脑，把插件设置里的 `API bind host` 改成 `0.0.0.0`，并开启“允许 GET 查询参数 token”，然后把 `127.0.0.1` 换成电脑的 Tailscale IP。

设置页还可以填写“手机/远程访问基地址”，例如 `https://电脑名.tailxxxx.ts.net:48321` 或 `http://100.x.y.z:48321`。这个地址只用于生成可复制链接和 companion 输入链接，不改变 API 实际监听地址。

## 读取接口

### `GET /health`

健康检查，不需要 token。

```json
{
  "ok": true,
  "plugin": "towrite-open-questions",
  "version": "0.1.0",
  "schemaVersion": 1
}
```

### `GET /api/v1/questions`

返回完整问题列表，适合 dashboard 或脚本。

常用参数：

- `token`：GET query token。
- `status`：逗号分隔，例如 `open,blocked`。
- `lane`：`think` 或 `write`。
- `kind`：`research`、`todo` 等。
- `search`：搜索问题、标题、标签、来源、备注。
- `limit`：最大返回数量，最高 200。

### `GET /api/v1/articles`

返回按文章聚合的 ToThink / ToWrite 统计。

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-29T08:00:00.000Z",
  "vaultName": "My Vault",
  "data": [
    {
      "filePath": "notes/example.md",
      "title": "example",
      "open": 3,
      "candidate": 1,
      "resolved": 2,
      "ignored": 0,
      "think": 2,
      "write": 2,
      "needsWork": true,
      "topIssues": []
    }
  ]
}
```

### `GET /api/v1/workflows`

返回 Workflow Stages 文件状态。这个接口是只读的，不会移动文件，也不会修改 metadata。

常用参数：

- `stage=<id>`：只返回某个 stage，例如 `processing`。
- `limit=20`：每个 stage 返回多少个文件，最高 200。
- `search=...`：搜索文件路径、标题、描述、下一步、标签或 frontmatter。
- `compact=1`：压缩文件对象，省略 `frontmatter`，适合小屏幕。

返回示例：

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-29T08:00:00.000Z",
  "vaultName": "My Vault",
  "enabled": true,
  "counts": {
    "stages": 2,
    "uniqueFiles": 12
  },
  "stages": [
    {
      "id": "processing",
      "title": "Processing",
      "description": "需要推进",
      "color": "sky",
      "limit": 20,
      "staleAfterDays": 10,
      "count": 5,
      "staleCount": 2,
      "files": [
        {
          "filePath": "Techbench/02-Processing/墨水屏.md",
          "title": "墨水屏怎么驱动和通信",
          "description": "需要整理 ESP32S3、刷新策略和 WebPush 服务。",
          "tags": ["processing", "hardware"],
          "frontmatter": {
            "tags": ["processing", "hardware"]
          },
          "createdAt": "2026-06-20T08:00:00.000Z",
          "updatedAt": "2026-06-25T08:00:00.000Z",
          "ageDays": 4,
          "stale": false,
          "openQuestionCount": 2,
          "thinkCount": 1,
          "writeCount": 1,
          "nextAction": "查 e-paper 局刷策略",
          "openUri": "obsidian://open?..."
        }
      ]
    }
  ]
}
```

字段说明：

- `title` 来源优先级：frontmatter `title` -> 第一个 H1 -> 文件名。
- `description` 来源优先级：frontmatter `description` / `summary` -> 第一段正文，最多 180 字。
- `nextAction` 来源优先级：frontmatter `next` / `next_action` / `todo` / `action` -> 同文件第一个未解决卡片标题或正文 -> 空。
- `stale` 只做数据标记；第一版不会主动通知或移动文件。

### `GET /api/v1/eink`

返回墨水屏友好的兼容 payload。现在 Echo 模板卡与 ToThink / ToWrite 共用一个队列：已保存且开启小屏翻页的 Echo 卡在前，划线卡在后，末尾循环。默认最多 12 张，可用 `limit` 和 `cursor` 控制。

建议 ESP32 使用 target 绑定的 token，而不是 External API 主 token：

```http
GET /api/v1/eink?targetId=desk-eink&limit=1&cursor=0
Authorization: Bearer <target-token>
```

响应继续保留旧 `focus[].title/body/question/article/lane` 字段，并增加：

- `focus[].sourceType`：`echo` 或 `question`。
- `focus[].displayCategory`：`echo`、`tothink` 或 `towrite`。Echo 必须显示为样板，不能因为兼容字段 `lane=write` 而归入 ToWrite。
- `focus[].contentType` 与 `focus[].actions`：模板卡的内容类型和屏幕操作。
- `playlist.cursor/nextCursor/previousCursor/total/revision`：共享翻页与兼容游标状态。
- `playlist.queueTotal/currentInQueue/currentIndex/currentPosition/currentId`：当前卡在未旋转固定队列中的位置；`currentIndex` 从 0 开始，`currentPosition` 从 1 开始。未加入翻页的手动卡会返回 `currentInQueue=false`、`currentIndex=-1` 和 `currentPosition=0`，应显示为“单张预览”。即使设备始终请求 `cursor=0`，翻页后这里的数字也会变化。

`currentInQueue=true` 时，屏幕页码应渲染为 `currentPosition / queueTotal`；否则显示“单张预览”。不要使用固定请求中的 `cursor`，也不要使用 ToThink / ToWrite 的内容总数。`lane`、`status`、`kind`、`filePath`、`folderPath` 和 `search` 过滤仍用于问题卡；使用这些过滤时不混入 Echo 卡。

### `GET /api/v1/deck`

返回刷卡片用的紧凑队列，适合桌面卡片、小组件、手机快捷入口。

`body` 是正文的新字段，`question` 会继续保留给旧客户端兼容。

### `GET /api/v1/device-feed`

返回“设备视图模型”，适合手机模拟墨水屏、ESP32 墨水屏、桌面小卡片或其他轻客户端。这个接口不是原始数据转发，而是由 Obsidian 端提前整理好首页、Workflow、卡片和来源笔记状态；设备端只需要渲染。

常用参数：

- `profile=mobile-eink`：手机 PWA 模拟墨水屏，默认值，适合触摸和较大字号。
- `profile=eink-bw`：真实黑白小墨水屏，文本更短、页面更紧凑，适合 ESP32 一类设备。
- `profile=desktop-card`：桌面小组件 profile，信息密度更高。
- `page=home`：首页总览。
- `page=cards`：ToThink / ToWrite 卡片翻页。
- `page=workflow`：Workflow 文件状态翻页。
- `page=articles`：有问题文章翻页。
- `cursor=0`：分页游标，响应里的 `navigation.nextCursor` 可直接用于下一页。
- `limit=1`：每屏返回多少项；手机刷卡片默认 1。
- `targetId=desk-eink`：可选设备目标 ID；用于生成 `deliveryId` 和回写上下文。
- `lane=think` 或 `lane=write`：只看某一类卡片。
- `stage=processing`：只看某个 Workflow stage。
- `width` / `height` / `inches`：设备屏幕尺寸。服务端会据此返回 `orientation`、`aspectRatio`、`ppi` 和 `layout`；横屏设备会自动使用更紧凑的文本长度和布局。

示例：

```text
GET /api/v1/device-feed?token=填你的token&profile=mobile-eink&page=cards&cursor=0&limit=1
GET /api/v1/device-feed?token=填你的token&profile=eink-bw&page=workflow&stage=processing
GET /api/v1/device-feed?token=填你的token&profile=eink-bw&page=cards&width=264&height=176&inches=2.7
GET /api/v1/device-feed?token=填你的token&page=cards&sourceFile=MindFlow%2F01-Sparks%2Fidea.md
```

返回结构摘要：

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-29T08:00:00.000Z",
  "vaultName": "Capture",
  "profile": "mobile-eink",
  "device": {
    "page": "home",
    "limit": 1,
    "width": 390,
    "height": 844,
    "inches": 6.3,
    "orientation": "portrait",
    "aspectRatio": 0.462,
    "ppi": 145.1,
    "layout": "portrait-card"
  },
  "summary": {
    "think": 4,
    "write": 1,
    "unresolved": 5,
    "candidate": 0,
    "blockedArticles": 2,
    "workflowFiles": 18,
    "workflowStages": 5,
    "remindersDue": 1,
    "remindersUpcoming": 2
  },
  "workflow": {
    "enabled": true,
    "uniqueFiles": 18,
    "stages": [
      {
        "id": "processing",
        "title": "Processing",
        "count": 7,
        "staleCount": 2,
        "nextActions": []
      }
    ]
  },
  "screens": [
    {
      "id": "home",
      "type": "home",
      "title": "小屏首页",
      "items": []
    }
  ],
  "navigation": {
    "page": "home",
    "cursor": "0",
    "limit": 1,
    "total": 1,
    "hasPrev": false,
    "hasNext": false
  },
  "actions": []
}
```

卡片页会返回一张或多张主卡，另带 `peekItems` 作为下一张预览。卡片项里会包含 `reminderAt`、`reminderNote`、`reminderDue`、`answerUrl`、`openUri`、`deliveryId` 和 `sourceRef`。`answerUrl` 会带上 `candidateId`、`deliveryId`、`sourceFile`、`sourceLine` 等回写上下文，手机输入页会把这些字段保存进 metadata。

`screens[].actions` 会返回可渲染动作：

- `answerCard` / `kind=respond`：打开 `/device/input?questionId=...`，用于回答当前卡片并追加 note。
- `quickCapture` / `kind=capture`：打开 `/device/input`，用于记录独立灵感。
- `viewCards`：从来源笔记页进入 `page=cards&sourceFile=...`，只刷当前笔记里的卡片。
- `openSource` / `kind=open-source`：打开 Obsidian 来源链接。
- `prev` / `next`：翻页。

真实墨水屏可以只显示二维码、短链接或硬件按钮；手机、桌面组件可以直接把 `url` 或兼容字段 `uri` 渲染成链接。硬件不需要理解 ToThink/ToWrite 业务，只需要执行 action。

### `GET /dashboard`

返回内置网页 dashboard，需要 token。它会请求 `/api/v1/deck`、`/api/v1/questions`、`/api/v1/articles`、`/api/v1/workflows` 和 `/api/v1/events`，展示：

- ToThink / ToWrite 批注卡片。
- Workflow Stages 文件状态、数量、stale 标记和下一步。
- 文章维度统计。
- `deck` / `questions` / `articles` / `workflows` 原始 JSON 预览。

等价路径：

```text
GET /api/v1/dashboard
```

### `GET /device`

返回内置手机小屏预览页，需要 token。推荐手机和电脑通过 Tailscale 连接，并开启“允许 GET 查询参数 token”后访问：

```text
http://电脑Tailscale-IP:48321/device?token=填你的token
```

页面会调用 `/api/v1/device-feed`，支持左右滑动和上一页/下一页按钮。页面内置屏幕模拟器，可以选择 2.7 寸、2.13 寸、4.2 寸等预设，也可以手动输入宽度、高度和英寸数；模拟屏幕会按比例居中显示，并在屏幕底部显示按键提示。

卡片页会显示“回答”和“新想法”。这些按钮会打开 `/device/input` 手机 companion 页面：回答卡片时追加到该卡片 note；独立灵感会写入设置里的 Inbox 文件或目标文件夹。手机预览页中间键长按会直接调用浏览器 Web Speech API，识别完成后用 `POST /api/v1/captures` 保存为新想法，不需要跳到输入页。

模拟屏幕底部使用五键提示栏：`新想法 / 上一页 / 首页+录音 / 下一页 / 手机输入或当前动作`。中间键短按回首页，长按语音记录；最右侧会优先打开当前卡片的回答页，在来源笔记页会进入该笔记的卡片队列，没有卡片时退回快速记录页。真实硬件可以把这五个提示对应到实体按键。

在 HTTPS、Tailscale Serve 或 localhost 等安全上下文里，`/device` 可以安装成 PWA。当前 PWA 提醒依赖页面打开时的 SSE 连接；页面完全关闭后的后台推送需要后续 Web Push、桌面端常驻任务或 AI 提醒服务。

如果不想手动拼 URL，可以在插件设置里填写“手机/远程访问基地址”，然后复制“手机小屏页面”这一行。

### `GET /device/input`

返回手机 companion 输入页，需要 token。它面向“真实墨水屏不负责复杂输入”的场景：小屏只显示入口，手机负责输入。

回答某张卡片：

```text
GET /device/input?token=填你的token&questionId=oq_xxx
```

快速记录独立灵感：

```text
GET /device/input?token=填你的token
```

带回写上下文的示例：

```text
GET /device/input?token=填你的token&questionId=oq_xxx&targetId=desk-eink&candidateId=oq_xxx&deliveryId=delivery_abc&sourceFile=note.md&sourceLine=12
```

页面支持：

- 文本输入。
- 移动端浏览器 Web Speech API 语音转文字；不上传音频。
- tags 输入。
- 选择保存到默认 Inbox 文件、目标文件夹或 Workflow stage。
- 带 `questionId` 时默认提交到 `POST /api/v1/questions/<id>/notes`；也可以切换为另存为新想法。

提交时会附带 `metadata`，例如：

```json
{
  "source_device": "device-input",
  "target_id": "desk-eink",
  "candidate_id": "oq_xxx",
  "delivery_id": "delivery_abc",
  "source_file": "note.md",
  "source_line": "12",
  "input_mode": "answer",
  "created_at": "2026-07-09T04:00:00.000Z"
}
```

### `GET /device/go`

统一跳转入口，适合静态 NFC、二维码、手机快捷方式和不方便动态改写链接的自研硬件。

```text
GET /device/go?token=填你的受限token&targetId=desk-eink&intent=respond
```

- `intent=respond`：根据 `targetId` 当前推送卡片打开回答页。
- `intent=capture`：打开统一快速记录页。
- `intent=open`：优先打开 Obsidian `obsidian://open` 来源链接，失败时可回退到输入页。
- `intent=next` / `prev` / `later` / `skipped`：用于实体按键或设备端动作，服务端返回下一步 URL。

如果设备支持动态链接，仍可以直接使用 `/device/input?questionId=...`；如果设备只有一个静态 NFC tag，推荐固定写入 `/device/go?targetId=...`。

### `POST /api/v1/device/events`

硬件按键事件入口。适合 ESP32、自研小屏、手机 App 或桌面小组件把“中键短按 / 右键长按”等事件交给 Obsidian Hub 解析。

必须使用受限 target token 或完整 API token：

```http
POST /api/v1/device/events
Authorization: Bearer <restricted-device-token>
Content-Type: application/json
```

请求：

```json
{
  "schemaVersion": 1,
  "eventId": "desk-eink-000123",
  "targetId": "desk-eink",
  "deviceId": "small-screen-01",
  "deliveryId": "delivery_abc",
  "candidateId": "oq_xxx",
  "button": "center",
  "action": "respond",
  "occurredAt": "2026-07-09T12:00:00+08:00"
}
```

`eventId` 幂等；离线设备可以缓存事件，恢复网络后补交，完全相同的重复提交不会重复记录 feedback 或重复翻页。相同 `eventId` 携带不同内容会返回 `409`。target token 与 `targetId` 强绑定，不能控制另一块屏幕。

响应：

```json
{
  "ok": true,
  "duplicate": false,
  "action": "respond",
  "targetId": "desk-eink",
  "candidateId": "oq_xxx",
  "deliveryId": "delivery_abc",
  "feedUrl": "http://192.168.1.20:48321/api/v1/push/feed?targetId=desk-eink",
  "displayMessage": "Open phone input"
}
```

硬件事件响应不会把 Bearer token 回显到 `openUrl`。需要手机输入时，先通过 `/api/v1/device/handoffs` 创建短时 handoff，而不是把长期 token 放进 URL。`right → next` 与 `left → prev` 会切换和 `/api/v1/eink` 相同的共享队列。

每个 Push target 可以在设置页编辑按键映射，默认：

- `center -> respond`
- `center-long -> capture`
- `center-double -> open`
- `left -> prev`
- `right -> next`
- `right-long -> later`

### `POST /api/v1/device/handoffs`

创建短期 handoff 链接，适合把短 URL 写进二维码/NFC，避免直接暴露长期 token。

```json
{
  "targetId": "desk-eink",
  "intent": "capture",
  "candidateId": "oq_xxx",
  "ttlSeconds": 300
}
```

响应：

```json
{
  "id": "dho_xxx",
  "expiresAt": "2026-07-09T04:05:00.000Z",
  "url": "http://192.168.1.20:48321/device/go?handoff=dho_xxx"
}
```

handoff 默认 5 分钟有效，最长 30 分钟；重启 Obsidian 后内存中的 handoff 会失效。

### `GET /api/v1/rss.xml`

返回 RSS 2.0，可给 RSS 阅读器订阅。建议只在可信网络或隧道内使用。

### `GET /api/v1/events`

SSE 实时订阅。连接后先收到 `snapshot`，之后每次卡片变化会收到 `update`。事件 payload 中包含 questions、articles 和 workflows 摘要；如果需要完整 Workflow 文件列表，请同时请求 `/api/v1/workflows`。

```js
const stream = new EventSource(`${API_BASE}/api/v1/events?token=${encodeURIComponent(TOKEN)}`);
stream.addEventListener("snapshot", (event) => {
  console.log(JSON.parse(event.data));
});
stream.addEventListener("update", (event) => {
  console.log(JSON.parse(event.data));
});
```

## 写回接口

### `POST /api/v1/questions/<id>/status`

修改卡片状态，也可以同时追加一条备注。

```powershell
$token = "填你的 token"
$base = "http://127.0.0.1:48321"
$id = "oq_xxx"
$body = @{
  status = "resolved"
  note = "桌面卡片里处理完了。"
  clientId = "desktop-card"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "$base/api/v1/questions/$id/status" `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body $body
```

### `POST /api/v1/questions/<id>/notes`

追加灵感备注，不改变正文 Markdown。

```js
await fetch(`${API_BASE}/api/v1/questions/${encodeURIComponent(id)}/notes`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    text: "手机上突然想到：这里可以补一个对比表。",
    clientId: "phone",
    metadata: {
      target_id: "desk-eink",
      candidate_id: id,
      delivery_id: "delivery_abc",
      source_file: "note.md",
      source_line: "12",
      input_mode: "answer"
    }
  })
});
```

`metadata` 可选；来自 `/device/input`、NFC 或硬件按键时建议带上，便于后续统计、AI 复盘和追踪“这条记录从哪块屏幕/哪张卡片回来”。

### `POST /api/v1/captures`

记录独立灵感，用于手机 companion、语音输入、桌面小组件或真实墨水屏的“新想法”入口。这个接口不会依赖某张卡片。

必须使用 `Authorization: Bearer <token>`；不能只靠 query token 写入。

请求 body：

```json
{
  "title": "可选标题",
  "text": "必填正文。可以来自手机输入或语音转文字。",
  "tags": ["capture", "device"],
  "target": {
    "kind": "inboxFile",
    "inboxFile": "00-Raw/Device Inbox.md"
  },
  "clientId": "phone",
  "metadata": {
    "target_id": "desk-eink",
    "candidate_id": "oq_xxx",
    "delivery_id": "delivery_abc",
    "source_file": "note.md",
    "source_line": "12",
    "input_mode": "capture"
  }
}
```

`target` 支持三种：

- `{ "kind": "inboxFile", "inboxFile": "00-Raw/Device Inbox.md" }`：追加到一个 Markdown Inbox 文件。
- `{ "kind": "folderPath", "folderPath": "01-Sparks" }`：在目标文件夹中新建一篇 Markdown 笔记。
- `{ "kind": "stageId", "stageId": "sparks" }`：使用对应 Workflow stage 的第一个文件夹前缀；如果没有配置，会退回到 Device Capture 设置里的目标文件夹。

PowerShell 示例：

```powershell
$token = "填你的 token"
$base = "http://127.0.0.1:48321"
$body = @{
  title = "手机灵感"
  text = "这里可以继续展开成一篇文章。"
  tags = @("capture", "phone")
  target = @{
    kind = "folderPath"
    folderPath = "01-Sparks"
  }
  clientId = "phone"
} | ConvertTo-Json -Depth 4

Invoke-RestMethod `
  -Method Post `
  -Uri "$base/api/v1/captures" `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body $body
```

响应：

```json
{
  "data": {
    "filePath": "01-Sparks/20260630T1030-phone-idea.md",
    "title": "手机灵感",
    "tags": ["capture", "phone"],
    "targetKind": "folderPath",
    "createdAt": "2026-06-30T10:30:00.000Z",
    "openUri": "obsidian://open?..."
  }
}
```

### `PATCH /api/v1/questions/<id>`

修改卡片标题、正文或提醒时间。这个接口不会改变 PDF 高亮坐标，也不会修改 Markdown/PDF 原文。

```js
await fetch(`${API_BASE}/api/v1/questions/${encodeURIComponent(id)}`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    title: "新的短标题",
    body: "新的正文内容",
    reminderAt: "2026-06-30T10:00:00.000Z",
    reminderNote: "到时候继续处理这张卡片"
  })
});
```

说明：

- `body` 是 `question` 的新语义别名；旧客户端继续使用 `question` 也可以。
- `reminderAt` 使用 ISO 时间字符串；传空字符串或 `null` 可以清空提醒。`reminderNote` 是提醒补充说明。
- 对 PDF 卡片，`source.pdfAnchor` / `sourceRects` 仍指向原始选区，用于高亮和跳转。
- Workflow 第一版只读，不提供通过 API 移动文件夹或改 frontmatter 的写接口。

## 安全建议

- 默认使用 `127.0.0.1`，只给本机小组件访问。
- 只有需要局域网设备访问时才改成 `0.0.0.0`。
- 不要把 token 发到公共仓库。
- 公网访问建议放在 Tailscale、Cloudflare Tunnel、frp、Nginx/Caddy 等外部通道后面。
- 插件不内置账号系统、HTTPS 证书或云中继；这些由你自己的网络层负责。

## Device Feed 与墨水屏协议

如果要接入 ESP32S3、墨水屏、手机小屏或桌面小组件，优先使用：

```text
GET /api/v1/device-feed?token=...&profile=eink-bw&width=264&height=176&inches=2.7&page=home
```

完整字段说明见：[Device Feed 协议](device-feed-protocol.zh-CN.md)。

示例 JSON：

- [eink-bw 首页](examples/device-feed-eink-bw-home.json)
- [eink-bw 卡片页](examples/device-feed-eink-bw-cards.json)
- [eink-bw Workflow 页](examples/device-feed-eink-bw-workflow.json)
- [eink-bw 来源笔记页](examples/device-feed-eink-bw-articles.json)

设置页的 `API & Device -> 设备 Profiles` 可以保存常用屏幕参数，并生成可复制的 device-feed URL。
