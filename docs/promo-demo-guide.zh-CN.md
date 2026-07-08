# ToWrite Open Questions 讲解与宣传素材

这份文档用于给朋友、写作者、研究者或团队成员演示插件。建议讲解时不要先讲 API，而是先讲一个很具体的写作痛点：笔记里经常有“这里还没想清楚”“这里还要补证据”“这里晚点继续写”，普通 TODO 会丢掉上下文，ToWrite 把这些缺口留在原文旁边。

## 一句话

ToWrite Open Questions 给 Obsidian 加一层 ToThink / ToWrite 批注索引，让未完成的思考和写作缺口一直贴着原文、可跳转、可统计、可推送到小屏设备。

## 30 秒介绍

写笔记时，我们经常不是“不知道下一步”，而是下一步散落在正文里：某句话缺证据，某段还没展开，某篇文章只是 raw idea。ToWrite 让你直接从选区创建 ToThink 或 ToWrite 卡片，右侧栏优先显示当前笔记的问题，也能看到其他笔记、文章类型和 Workflow 阶段。它还可以把这些数据导出给 dashboard、手机小屏、Quote0 墨水屏，甚至用 NFC 一碰打开手机输入页，把答案写回 Obsidian。

## 适合强调的卖点

- 原文优先：问题不会脱离上下文，卡片能跳回 Markdown 行或 PDF 高亮。
- 写作友好：ToThink 是“还要想清楚”，ToWrite 是“还要写出来”，比普通 TODO 更贴近创作流程。
- 非侵入：选区卡片默认写入 sidecar JSON，不强行污染 Markdown。
- 分类清楚：Article Types 管内容类型，Workflow Stages 管生命周期，二者可以通过 `#mindflow/spark` 这样的层级 tag 同时匹配。
- 设备友好：同一套数据可以进右侧栏、dashboard、`/device` 手机页和 Quote0。
- 本地优先：External API、AI、Quote0 都是可选配置；不开启时核心索引在本地运行。

## 3 分钟演示流程

1. 打开一篇正在写的技术笔记，选中一段“还没想清楚”的文字，点浮动工具条里的 `ToThink`。
2. 选中另一段“还要扩写”的文字，点 `ToWrite`。
3. 看右侧栏：当前笔记的 ToThink / ToWrite 分区在最上方，可以折叠、编辑、跳回原文。
4. 给笔记加一个 tag，例如 `#mindflow/spark`，刷新后看“其他笔记”里的分类 tab 和 Workflow tab。
5. 打开 dashboard，展示未解决、候选、ToThink、ToWrite、type、stage 的统计。
6. 打开 Quote0 设置页的预览，说明文本卡片和首页 dashboard 的区别。
7. 如果有设备，发送主页到 Quote0；如果没有设备，打开 `/device` 手机小屏页作为模拟。
8. 用手机打开 `/device/input`，写一条 note，演示写回 Obsidian。

## 文本案例 1：技术笔记

把下面内容放进一篇 Markdown 笔记，然后演示选区创建 ToThink / ToWrite：

```markdown
---
tags:
  - tech/processing
---

# 低功耗传感器节点设计

这个节点需要在电池供电下连续运行半年。现在的方案是 ESP32-C3 + BME280 + 光照传感器，深睡眠时只保留 RTC 唤醒。

?? 需要确认 BME280 在低温环境下的测量漂移，以及是否要做温度补偿。

我还没有把电源预算算完整。传感器采样、电台发送、深睡眠漏电需要分别估算，并给出一版最坏情况。

这里要继续写：把电源预算拆成表格，然后给出 500mAh 电池下的保守续航估计。
```

演示重点：

- `??` 会被解析为 ToThink。
- 选中“这里要继续写...”创建 ToWrite。
- `#tech/processing` 同时给出 type=`tech` 和 stage=`processing`。

## 文本案例 2：写作草稿

```markdown
---
tags:
  - mindflow/spark
---

# 我的技术与能力

我的能力主要围绕机器人和软硬件原型展开。机器人本身就是机械结构、电子硬件、嵌入式、控制、软件和交互的交叉系统，所以我习惯从完整系统而不是单点技术出发。

这里需要再想一下：我到底更想强调“跨学科整合能力”，还是强调“能快速把想法做成可测试原型”？

接下来要补一段具体例子，最好写一个从想法、草图、硬件、软件到现场测试的完整闭环。
```

演示重点：

- ToThink 是“定位表达重点”。
- ToWrite 是“补具体例子”。
- 这篇笔记即使暂时没有问题卡，只要有 `#mindflow/spark` 也会出现在分类和 Workflow 统计里。

## 文本案例 3：论文/PDF 阅读

```markdown
# 一篇论文的阅读记录

这篇论文声称某个方法在低数据条件下稳定提升，但实验部分的 ablation 不够清楚。

需要从 PDF 里选中对应实验表格，创建一个 ToThink：它到底证明了什么，哪些变量没有控制？

继续写：把论文贡献拆成“方法、数据、实验、局限”四段，每段只保留一个判断。
```

演示重点：

- PDF 选区可以创建非破坏式高亮卡片。
- Markdown 阅读笔记和 PDF 来源可以一起进入同一个问题队列。

## 社媒/社区发布文案

短版：

> 我做了一个 Obsidian 插件 ToWrite Open Questions。它不是 TODO，而是把“还没想清楚”和“还要继续写”的内容贴在原文旁边，支持 Markdown/PDF 选区、右侧栏、workflow/tag 统计、dashboard、小屏设备和 Quote0 推送。

长版：

> 写笔记时，最容易丢的不是任务，而是上下文里的“缺口”：这段还要补证据，那句话还要想清楚，这篇 raw idea 还没进入 processing。ToWrite Open Questions 给 Obsidian 加了一层 ToThink / ToWrite 批注索引。你可以从 Markdown 或 PDF 选区创建卡片，右侧栏优先显示当前笔记的问题，也可以按 Article Type 和 Workflow Stage 看其他笔记。数据可以导出到 dashboard、手机小屏和 Quote0 墨水屏，NFC 一碰还能打开手机写回页。

## 常见问题回答

- 和 TODO 的区别：TODO 通常只记录动作，ToWrite 保留动作出现的原文位置、上下文、状态和写回入口。
- 会不会污染 Markdown：选区卡片默认进 sidecar JSON，只有主动固定原文锚点时才写入 block id。
- 手机能不能用：当前市场版是桌面端插件，因为 External API 用到 Obsidian Desktop 的 Node HTTP 能力；手机可以通过 `/device` 和 `/device/input` 访问桌面端提供的页面。
- 和 Quote0 的关系：Quote0 是一个设备适配器；核心数据仍来自 ToWrite 的本地索引和 Push Engine。
- 数据是否泄露：External API、AI、Quote0 都默认关闭；Quote0 云端会收到被推送的当前卡片或 dashboard 内容，因此敏感笔记不建议推送到云端设备。

## 演示时的节奏

先用选区创建一张卡，让用户看到“原文旁边的未完成思考”；再展示分类和 Workflow，因为这回答“笔记多了以后怎么找”；最后展示 Quote0 或手机小屏，因为这回答“离开 Obsidian 后怎么被提醒和写回”。
