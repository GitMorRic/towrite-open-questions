# 网页 Dashboard 示例

这个示例是一个静态网页 dashboard，用 ToWrite External API 查看全库 ToThink / ToWrite 状态。

## 功能

- 读取：

```text
GET /api/v1/deck?token=...
GET /api/v1/questions?token=...
GET /api/v1/articles?token=...
```

- 实时更新：

```text
GET /api/v1/events?token=...
```

- 写回：

```text
POST /api/v1/questions/<id>/status
POST /api/v1/questions/<id>/notes
```

- 支持按 lane、status、搜索词过滤。
- 默认展示待解决问题卡片，底部保留 `deck`、`questions`、`articles` 原始 JSON 预览和复制。

插件也内置了一个同类页面：

```text
http://127.0.0.1:48321/dashboard?token=你的token
```

如果只是自己本机使用，优先用这个内置页面即可；本示例适合你后续改造成自己的独立网页客户端。

## 使用

1. 在 Obsidian 桌面端启用 ToWrite External API。
2. 打开 `index.html`。
3. 填写：

```text
API Base: http://127.0.0.1:48321
Token: 你的 token
```

4. 点击「连接」。

## 放到本地静态服务器

也可以在本目录启动一个静态服务器：

```powershell
python -m http.server 8088
```

然后打开：

```text
http://127.0.0.1:8088
```

## 注意

- 浏览器直接打开 `index.html` 也可以运行，因为 ToWrite API 返回了 CORS header。
- SSE 使用 query token，因为浏览器 `EventSource` 不能直接设置 Authorization header。
- 如果 dashboard 放到另一台机器上，ToWrite 的 bind host 要改成 `0.0.0.0`。
