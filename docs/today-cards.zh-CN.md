# 今日汇总、任务池与同步卡片

ToWrite 把“今天承诺要做的事情”和“以后可能要做的事情”分开：

- **今日汇总**来自当前计划源，默认是 `Daily/YYYY-MM-DD.md`。
- **总任务池**默认保存在 `Planning/Task Pool.md`。普通笔记中的未完成 checkbox 会在保存后自动登记到这里；安排到某一天时，Daily 里创建的是 assignment，不是另一份互不关联的任务。
- 完成任务后，今日进度、任务池状态、侧栏摘要、悬浮窗和嵌入卡片会读取同一份状态并刷新。

## 最快的打开方式

在 Obsidian 命令面板中搜索：

- `ToWrite: Today: open dashboard`：直接打开今日编排与汇总。
- `ToWrite: Workbench: open work pool`：直接打开统一工作池。
- `ToWrite: Focus Now: open floating window`：打开独立的“现在专注”小窗；小窗可以折叠，并可 Pin 防止被其他 Obsidian 页面替换。

左侧 Ribbon 的专注图标也会打开“现在专注”。专注模式只保留当前任务和计时；“今日缩略”模式显示当天清单。顶部信息带会轮播今日焦点、用户自定义句子和 Inbox/问题提醒；句子与间隔可在 ToWrite 的“今日”设置中修改。

> Pin 是 Obsidian 的视图固定，不等同于操作系统级“永远置顶”。独立 Pop-out 可以放在桌面任意位置；是否压在其他软件上方仍由系统窗口管理器决定。

## 插入到任意笔记

把光标放在目标笔记中，运行：

`ToWrite: Today: insert synced card into note`

插件会插入：

````markdown
```towrite-today
mode: list
limit: 3
```
````

在 Live Preview 或阅读视图中，它会渲染为同步卡片，包含：

- 今日主题；
- 已完成数 / 总数；
- 今日进度条；
- 当前任务和后续任务；
- “完整今日”和“桌面小窗”快捷入口。

点击任务行会开始或继续该任务，并打开解析出的笔记、网页或计划原文；点击勾选按钮会完成该任务。Markdown 计划发生变化后，卡片会自动刷新。

可选参数：

- `mode: compact`：只显示一条任务并隐藏底部入口。
- `mode: list`：显示列表。
- `limit: 1` 到 `6`：控制显示几条。
- `show-completed: true`：允许卡片中包含已完成项。

代码块只是一张视图，不复制任务数据。删除代码块只会移除这张卡片，不会删除 Daily 或任务池中的任务。
