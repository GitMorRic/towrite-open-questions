# 外部按键、精确笔记、手机语音与 Agent 链路

本页描述 ToWrite 0.5 的本地优先闭环。Markdown 仍是数据真源；设备、Hub
和模型都不能直接提供 Vault 路径或系统命令。

## 1. 按键打开笔记工作区

任务可声明本机命名动作和精确目标：

```md
- [ ] 完成产品结构
  [towrite-action:: note-focus]
  [towrite-target:: [[项目/ToWrite#^product-structure]]]
```

`note-focus` 会先按现有目标优先级解析任务，打开来源文件的 block、heading、
文本锚点、行或 PDF 页，再在右侧打开 ToWrite 今日列表。ESP32 仍只提交
`note-focus` 对应卡片的 displayed tuple，不接收文件路径。

定位稳定性由高到低为 block ID、heading、文本锚点、行号。找不到明确请求的
位置时会返回错误，不会静默跳到文件顶部。

## 2. desired、displayed 与按键

```text
GET /api/v1/eink
→ 物理屏幕刷新成功
→ POST /api/v1/device/display-acks
→ displayed tuple 生效
→ POST /api/v1/device/events
→ Connector 校验 tuple 与 eventId
→ 本机动作/导航适配器
```

屏幕只保存显示卡片、状态 tuple、target-scoped token、按键映射和设备遥测。
Hub 只保存可显示快照与 opaque ID；真实目标解析留在 Obsidian Connector。

## 3. 手机录音与归类

主键双击创建五分钟、一次性的 handoff。手机 PWA 支持：

- `MediaRecorder` 原始录音，单声道、低码率、最长 45 秒；
- 浏览器 SpeechRecognition 听写，作为可选增强而非唯一录音来源；
- IndexedDB 保存离线文字和 Blob；
- 提交前预览“追加笔记 / 创建工作池待办 / 交给 Agent”；
- 音频通过 `/api/v1/device/handoff-assets` 暂存，后续请求只携带 assetRef；
- 服务端把音频写入 Daily 附件目录并在 Markdown 中使用 `![[...]]` 引用。

归类相关接口：

```text
POST /api/v1/capture/route-preview
POST /api/v1/capture/route-commit
POST /api/v1/agent-runs/{runId}/approve
```

route preview 不写 Markdown。创建待办使用由 idempotency key 派生的稳定
`task_<128-bit>` ID，网络重试不会产生重复任务。

## 4. Agent 安全边界

当前 Agent 路径实现的是审批状态机，而不是任意自治执行：

```text
proposed → approved → executing → succeeded | failed
```

手机只能生成 `create_todo` 白名单提案。提案、参数、风险等级、批准状态和结果
保存在本地有界审计记录中；用户再次点击确认后，Connector 才调用
TaskPoolService。Shell、删除、外部发信、凭据读取和模型提供的文件路径均不支持。

未来接入模型时，模型只能把授权文本转换成同一份结构化提案，不能绕过本地
审批和执行器。

## 5. 仍需真实硬件信息

`examples/esp32s3-eink/towrite-panel-driver.h` 继续失败关闭。要实现真实显示，
必须先确认屏幕控制器、开发板、SPI 引脚、BUSY/RESET/DC/CS、电源和驱动库；
在这些信息未知时不写假的 Waveshare/GxEPD2 配置。

确认硬件后还需完成中文字体子集、离屏排版、全刷/局刷、残影清理、BLE 或
SoftAP 配网、NVS、签名 OTA、回滚、看门狗、功耗与 500 次刷新测试。
