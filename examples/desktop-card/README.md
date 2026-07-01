# 浏览器桌面卡片示例

这个示例用 ToWrite External API 的 `/api/v1/deck` 做一个轻量卡片窗口。它适合放在浏览器、WebView、小窗工具或桌面侧边栏里。

## 准备

1. 在 Obsidian 桌面端启用 ToWrite 插件。
2. 打开 ToWrite 设置里的 `External API`。
3. 复制 `API token`。
4. 如果只在本机打开本示例，保持：

```text
API bind host = 127.0.0.1
API port = 48321
```

## 使用

打开 `index.html`，在页面设置里填：

```text
API Base: http://127.0.0.1:48321
Token: 你的 token
```

点「保存并刷新」后，卡片会读取：

```text
GET /api/v1/deck?token=...
```

## 功能

- 上一张 / 下一张卡片。
- 刷新卡片队列。
- 追加备注：

```text
POST /api/v1/questions/<id>/notes
```

- 标记已解决：

```text
POST /api/v1/questions/<id>/status
```

## 注意

- POST 请求使用 `Authorization: Bearer <token>`。
- 这个示例不会保存真实 token 到仓库；页面会把你输入的 token 存在当前浏览器的 `localStorage`。
- 如果从另一台设备访问 Obsidian API，需要把 ToWrite 的 bind host 改成 `0.0.0.0`，并使用运行 Obsidian 的电脑 IP。
