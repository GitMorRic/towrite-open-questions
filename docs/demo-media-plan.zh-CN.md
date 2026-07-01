# Demo 素材与录屏规划

这份文档用于准备 ToWrite Open Questions 的 GitHub README、BRAT 说明、Obsidian 社区审核和日常介绍素材。目标是用一个干净 demo vault 展示真实工作流，但不暴露任何私人笔记、API token、AI key、Tailscale 域名或真实项目内容。

## 总体目标

Demo 要让别人快速理解三件事：

1. ToWrite 不是普通 TODO，而是贴在原文旁边的 ToThink / ToWrite 批注层。
2. 批注能回到 Markdown 行或 PDF 高亮位置，并能继续写标题、批注、提醒、状态和双链。
3. 批注和 Workflow Stages 可以通过 dashboard、External API、手机小屏和墨水屏设备订阅出来。

## 建议素材目录

在一个新的干净 vault 里准备这些文件夹：

```text
ToWrite Demo Vault/
  00-Raw/
    Device Inbox.md
    Web Clips/
      机器人腰部折叠机构.md
  MindFlow/
    00-Raw/
      每天都觉得前一天的我是傻瓜.md
    01-Sparks/
      写作项目的状态屏.md
    02-Growth/
      用碎片时间完成一件大事.md
    03-Archive/
      一篇已经完成的短文.md
  Techbench/
    00-Raw/
      WebPush 服务调研.md
    01-Initialize/
      墨水屏通信协议.md
    02-Processing/
      低功耗传感器节点设计.md
    03-Archive/
      金属探伤资料归档.md
  OC-Story/
    00-Raw/
      废城广播.md
    Lore/
      城市边界与信标.md
    Persona/
      林鸢.md
    Storyboard/
      第一章开场.md
  Demo-PDF/
    sensor-datasheet-demo.pdf
```

如果没有合适的 PDF，建议自己写一个短 Markdown，再导出为 PDF。不要使用有版权风险或含私人信息的真实 datasheet 截图。

## Workflow Stages 设置示例

在插件设置里启用 Workflow Stages，并配置这些 stage：

```text
Raw
folderPrefixes:
00-Raw
MindFlow/00-Raw
Techbench/00-Raw
OC-Story/00-Raw
tags:
raw
capture
```

```text
Sparks
folderPrefixes:
MindFlow/01-Sparks
tags:
spark
idea
```

```text
Initialize
folderPrefixes:
Techbench/01-Initialize
tags:
initialize
draft
```

```text
Processing
folderPrefixes:
Techbench/02-Processing
OC-Story/Lore
OC-Story/Storyboard
tags:
processing
next
```

```text
Archive
folderPrefixes:
MindFlow/03-Archive
Techbench/03-Archive
tags:
archive
done
```

建议 `staleAfterDays` 分别设置为 14、7、21、10、0，这样 dashboard 和 device 页面可以展示 stale / next action 的概念。

## 示例笔记 1：技术写作

路径：

```text
Techbench/02-Processing/低功耗传感器节点设计.md
```

内容：

```markdown
---
title: 低功耗传感器节点设计
tags: [processing, hardware, eink]
description: 记录一个低功耗传感器节点从原型到可部署版本的设计取舍。
next_action: 对比深睡眠唤醒电流和墨水屏刷新电流，补一张功耗预算表。
---

# 低功耗传感器节点设计

这个节点会每 30 分钟醒来一次，读取温湿度、电池电压和门磁状态，然后把摘要同步到本地网络里的 dashboard。为了避免持续点亮屏幕，显示层暂时考虑 2.7 寸墨水屏。

?? 需要确认 ESP32-S3 深睡眠时外设断电后，RTC 唤醒和 WiFi 重连的平均耗时。

## 功耗预算

初步估算里，传感器读取本身不是主要耗电点，真正的大头可能是 WiFi 连接和墨水屏刷新。

这里还要补充每种刷新策略下的电池续航估算，最好做成表格。

## 通信协议

设备端不要理解 Obsidian 数据结构，只请求 `/api/v1/device-feed`，由桌面端插件返回已经整理好的页面模型。

需要确认如果设备离线 24 小时，再重新上线时是否需要显示 missed reminders。

## 下一步

- [ ] [?] 查 ESP32-S3 深睡眠唤醒和 WiFi 重连的实测数据
- [ ] [ ] 画一张 device-feed 到墨水屏渲染的流程图
```

适合创建的卡片：

- ToThink：`需要确认 ESP32-S3...`
- ToWrite：`这里还要补充每种刷新策略...`
- ToThink / todo：`查 ESP32-S3 深睡眠...`

建议在卡片里补这些演示内容：

```text
标题：确认 ESP32-S3 唤醒成本
批注：先看 Espressif 官方文档，再找两篇实际测量文章。可以关联 [[墨水屏通信协议]]。
状态：open
类型：research
提醒：明天 09:00
颜色：amber
```

```text
标题：补功耗预算表
批注：表格至少包含 deep sleep、WiFi connect、sensor read、eink refresh 四行。
状态：open
类型：todo
lane：ToWrite
颜色：sky
```

## 示例笔记 2：随笔和灵感

路径：

```text
MindFlow/01-Sparks/写作项目的状态屏.md
```

内容：

```markdown
---
title: 写作项目的状态屏
tags: [spark, writing, device]
description: 想做一个不会打断写作、但会轻轻提醒我还有哪些线索没收束的小屏幕。
next: 先把首页只保留 5 个关键数字，再做卡片翻页。
---

# 写作项目的状态屏

我想要一个小屏幕，不是为了制造更多提醒，而是为了让未完成的线索保持一种安静的存在感。

这里还要补充它和普通 TODO 列表的区别：它不是任务队列，而是写作上下文的浮标。

它应该能看到 ToThink、ToWrite、Workflow stage，以及最近的下一步动作。

?? 如果提醒太频繁，会不会反而破坏写作流？

## 交互

短按回首页，长按录音。左右按键翻页。右侧键在来源笔记页进入那篇文章的卡片队列。

继续写：为什么“可见但不打扰”是这个工具的核心气质。
```

适合展示：

- 普通 Markdown 选区创建 ToWrite。
- 触发词候选出现 `+ Think` / `+ Write`。
- 用户点击叉号忽略误判候选。
- 卡片批注里写 `[[写作状态屏设计]]`，展示双链可点击。

## 示例笔记 3：小说 / 角色设定

路径：

```text
OC-Story/Lore/城市边界与信标.md
```

内容：

```markdown
---
title: 城市边界与信标
tags: [processing, lore, story]
summary: 废城外围的信标系统既是导航设施，也是居民心理安全边界的一部分。
next_action: 给第一章加一个通过信标迷路的场景。
---

# 城市边界与信标

废城的边界不是一条墙，而是一圈慢慢失效的信标。老居民能从信标的噪声里听出天气、距离和方向。

哥哥，你还爱我吗？

这句话是角色台词，不应该被识别成 ToThink。录屏时可以展示普通问句不会自动变成卡片。

?? 信标声音应该更像电台噪声，还是更像潮汐？

继续写：林鸢第一次越过第三信标时，应该听见一个不属于她年代的呼号。
```

适合展示：

- 普通中文问句不被误判。
- `??` 明确规则会创建 ToThink。
- `继续写` 触发 ToWrite 候选。
- Workflow 把 `OC-Story/Lore` 归入 Processing。

## 示例 PDF 素材

建议自己做一个 `sensor-datasheet-demo.pdf`，内容可以包括：

```text
Demo Sensor Module

Electrical Characteristics

Sleep current: 12 uA typical
Wake-up time: 180 ms typical
Radio connection time: 1.8 s typical
Display refresh current: 24 mA peak

Application Notes

For battery-powered devices, radio connection time usually dominates energy consumption. Batch updates and local caching can significantly improve battery life.
```

演示动作：

1. 打开 PDF。
2. 选中 `radio connection time usually dominates energy consumption`。
3. 点击 `Think`。
4. 侧栏出现 PDF 卡片。
5. PDF 页面出现非破坏式高亮。
6. 点击卡片跳转按钮，回到 PDF 高亮位置。

截图时不要使用真实厂商资料、带水印论文或私人 PDF。

## 截图与动图清单

### 1. 侧栏总览

文件名：

```text
docs/assets/sidebar-current-note.png
```

画面：

- 左侧是 `低功耗传感器节点设计.md`。
- 右侧是 ToWrite 侧栏。
- 展示当前笔记、ToThink 分区、ToWrite 分区、卡片数量、搜索框和顶部按钮。
- 至少一张卡片折叠，一张卡片展开。

要点：

- 体现“当前笔记的批注浮到最上面”。
- 展示卡片有 lane、状态、类型、标题、原文、批注、提醒、动作按钮。

### 2. Markdown 选区创建卡片

文件名：

```text
docs/assets/selection-toolbar.gif
```

录屏脚本：

1. 选中 `这里还要补充每种刷新策略下的电池续航估算`。
2. 浮动工具条出现。
3. 点击 `Write`。
4. 右侧出现 ToWrite 卡片。
5. 在标题处自动生成或手动改成 `补功耗预算表`。

时长建议：8 到 12 秒。

### 3. PDF 高亮与跳转

文件名：

```text
docs/assets/pdf-highlight.gif
```

录屏脚本：

1. 在 demo PDF 中选中一段电流或刷新时间。
2. 点击 `Think`。
3. 侧栏显示 PDF 卡片。
4. 高亮 overlay 出现。
5. 滚动到别处，再点击卡片跳转按钮回到高亮。

时长建议：12 到 18 秒。

### 4. 卡片编辑

文件名：

```text
docs/assets/card-editing.png
```

画面：

- 展开一张 ToThink 卡。
- 标题处于预览态，不是大输入框。
- 批注里包含 `[[墨水屏通信协议]]`。
- 提醒显示 `明天 09:00` 或 `今天 21:00`。
- 底部动作按钮包含跳转、固定原文锚点、编辑、复制、隐藏高亮、完成、AI、删除。

注意：

- 不要截到真实 token。
- 不要截到私人路径。

### 5. Workflow Stages 设置

文件名：

```text
docs/assets/workflow-settings.png
```

画面：

- Workflow Stages 已开启。
- 展示 Raw / Sparks / Processing 等折叠卡片。
- 只展开一个 stage，能看到 folderPrefixes、tags、limit、staleAfterDays。

要点：

- 说明 Workflow 是文件生命周期，不是 ToThink / ToWrite 卡片。

### 6. Dashboard

文件名：

```text
docs/assets/dashboard.png
```

打开方式：

```text
http://127.0.0.1:48321/dashboard?token=<demo-token>
```

画面：

- 顶部统计：ToThink、ToWrite、未解决、有问题文章。
- 左侧或主区域展示待解决卡片。
- 右侧展示来源笔记统计。
- Workflow 区块展示 Raw、Sparks、Processing 数量和下一步。

注意：

- token 必须打码。
- 如果地址栏显示 token，录屏时裁掉地址栏，或者使用单独 demo token。

### 7. 手机 / 墨水屏模拟

文件名：

```text
docs/assets/device-preview.gif
```

打开方式：

```text
http://127.0.0.1:48321/device?token=<demo-token>&profile=mobile-eink
```

录屏脚本：

1. 首页显示 ToThink / ToWrite / Workflow 数量。
2. 点下一页进入卡片页。
3. 展示主卡 + 下一张预览。
4. 点来源笔记页，选择一篇笔记进入专属卡片队列。
5. 展示屏幕内五键提示：新想法、上一页、首页+录音、下一页、手机输入。

如果手机录屏：

- 使用 Tailscale 或本机安全 demo 网络。
- 不显示真实 Tailscale MagicDNS 或公网域名。
- token 打码。

### 8. External API 设置

文件名：

```text
docs/assets/external-api-settings.png
```

画面：

- External API 开关。
- API 访问地址和 dashboard/device 复制按钮。
- bind host、port、token。
- token 需要打码，只保留开头或直接覆盖。

要点：

- 体现 API 默认关闭，用户主动开启。
- 如果展示 `0.0.0.0`，旁边要说明仅用于局域网 / Tailscale / 隧道。

## GitHub README 推荐图序

README 顶部可以放 1 张主图，不要一开始堆太多：

```markdown
![ToWrite sidebar with current-note cards](docs/assets/sidebar-current-note.png)
```

后面功能段落再插：

```markdown
![Create ToWrite card from selection](docs/assets/selection-toolbar.gif)
![PDF highlight jump-back](docs/assets/pdf-highlight.gif)
![Device preview](docs/assets/device-preview.gif)
```

如果图片太多，建议在 README 里只放 3 到 4 张，其余放到 `docs/` 或 release 页面。

## Demo 拍摄顺序

建议一次录一条完整主 demo，另外拆几个短 GIF。

主 demo 脚本：

1. 打开干净 vault 和 ToWrite 侧栏。
2. 选中 Markdown 句子，创建 ToWrite。
3. 编辑标题和批注，输入一个 `[[双链]]`。
4. 点击跳转按钮回到原文。
5. 展示 `??` 明确 ToThink 规则。
6. 切到 PDF，创建 PDF 卡片，展示高亮和跳转。
7. 打开 dashboard，展示卡片和 Workflow 统计。
8. 打开 `/device`，展示手机 / 墨水屏视图。
9. 回到设置页，快速展示 External API 和 Workflow 配置。

建议时长：

- 主 demo：60 到 90 秒。
- 功能 GIF：8 到 18 秒一条。
- 社区审核截图：静态图优先，动图作为补充。

## 批注多样性清单

至少准备这些卡片，避免截图看起来单一：

| lane | 类型 | 状态 | 示例标题 | 来源 |
| --- | --- | --- | --- | --- |
| ToThink | research | open | 确认 ESP32-S3 唤醒成本 | Markdown |
| ToWrite | todo | open | 补功耗预算表 | Markdown |
| ToThink | evidence | candidate | 找 radio connection 实测数据 | PDF |
| ToWrite | explanation | paused | 解释状态屏和 TODO 的区别 | Markdown |
| ToThink | citation | blocked | 找引用来源 | Markdown |
| ToWrite | other | resolved | 扩写第一章信标场景 | Markdown |

每张卡片最好有一点差异：

- 有的有 note，有的没有 note。
- 有的有 reminder。
- 有的有 `[[wikilink]]`。
- 有的 pinned source anchor。
- 有的折叠，有的展开。
- 至少一张 PDF 卡。
- 至少一张 Workflow 来源文件。

## 隐私与画面检查

发布任何截图 / GIF 前检查：

- 地址栏没有真实 token。
- 设置页 token、AI key 已打码。
- 没有真实 Tailscale MagicDNS。
- 没有真实私人 IP、邮箱、手机号、聊天记录。
- 没有私人 vault 路径或同步冲突文件名。
- 没有真实论文、教材、datasheet 的版权敏感页面。
- `.obsidian-open-questions/` 导出 JSON 不要作为公开素材直接展示。

## 可选视觉规范

- 使用干净浅色主题，减少主题本身抢戏。
- 侧栏宽度保持 380 到 480 px，卡片信息能读清。
- 浏览器 dashboard 截图建议 1440 x 900 或 1600 x 1000。
- 手机 / device 录屏建议裁掉浏览器地址栏。
- 鼠标移动慢一点，点击后停 0.5 秒，让观众看清变化。
- 截图文件名使用英文和短横线，便于 GitHub 引用。

## 最小可发布素材包

如果时间很少，至少准备这四个：

```text
docs/assets/sidebar-current-note.png
docs/assets/selection-toolbar.gif
docs/assets/pdf-highlight.gif
docs/assets/dashboard.png
```

如果要强调小屏 / API，再补：

```text
docs/assets/device-preview.gif
docs/assets/workflow-settings.png
docs/assets/external-api-settings.png
```
