# ToWrite Open Questions 安全说明

[English](SECURITY.md) | 简体中文

最后更新：2026-07-12

## 安全模型

ToWrite 是本地 Obsidian Desktop 插件。它可以读取符合条件的 Vault Markdown，并写入用户确认的卡片、记录、导出和设置。可选集成会扩大这个边界，必须由用户主动启用并负责保护。

插件不是网络边界、身份提供方、加密密钥库，也不能把不可信 Vault 沙箱化。任何可以修改插件文件、Obsidian 插件数据或 Vault 导出的人，都可能改变 ToWrite 读取的数据。

## 安全默认值

- External API、习惯学习、主动通知、AI 和 Obsidian AI Backend 接入均为可选功能。
- External API 默认只绑定 `127.0.0.1`。
- 智能记录会先在本地生成并预览候选，然后才可能发起可选 Backend 请求。
- 排除文件夹、tags 和 truthy 隐私 frontmatter 会在本地候选评分和 Backend 重排前生效。
- 习惯候选只有在明确接受后才会生效；通知默认关闭，并遵守安静时段。

## Token 与密钥

External API token、受限设备 token、Backend token、AI key 和设备服务 key 保存在 Obsidian 插件数据中，不会写入 ToWrite JSON 导出。但插件数据通常是本地明文数据，也可能被 Vault 同步或备份软件复制。

- 完整 External API、受限手机/Quote0 输入和 Obsidian AI Backend 应使用不同的随机 token。
- 手机、NFC 或小屏客户端应使用受限 token，不要复用完整 API token。
- Backend token 通过 `X-Capture-Token` 发送；不要把它放进 URL、截图、日志、示例文件或 issue。
- 查询参数 token 可能出现在浏览器历史、反向代理日志、referrer 和截图中。除非客户端确实需要，否则保持“允许 GET 查询参数 token”关闭；意外暴露后立即轮换。
- 不要提交或公开 `.obsidian/plugins/towrite-open-questions/data.json`、`.obsidian-open-questions/`、`.env`、诊断导出或包含真实凭据的设备 URL。

## 网络暴露

只在本机使用时，请保持 External API 绑定 `127.0.0.1`。绑定 `0.0.0.0` 会让所有可达的网络节点访问监听端口。用于局域网、Tailscale 或公网隧道时：

- 必须设置高强度 token；
- 优先使用 Tailscale 等有身份认证的私有网络；
- 流量会离开可信主机时，在服务端或反向代理处使用 HTTPS；
- 用防火墙或代理访问策略限制来源网络；
- 不要在缺少认证和传输保护时把 API 直接暴露到公网；
- 检查 dashboard、SSE、RSS、手机输入和写入接口是否只暴露了你准备分享的数据。

非 loopback 的 Obsidian AI Backend 应使用 HTTPS。明文 `http://` 传输的 Backend token 和重排元数据可能被能够观察网络链路的人读取。

## 智能记录完整性

可选 Backend 接收的是已经通过本地过滤的候选白名单。插件按 candidate id 匹配 Backend 返回结果并忽略未知 id，因此重排接口不能直接注入任意路径。

记录预览会保存目标 revision，提交时使用 preview/candidate revision 检测过期目标。只有后续可以安全检查撤销条件时才会返回 undo token。不要绕过冲突警告，也不要手工重复使用 undo token。撤销只应移除插件自己尚未被用户继续修改的写入，不能覆盖之后的编辑。

保存前请检查最终路径和 `append`/`create` 操作，特别是文件夹名、选区或 Backend 返回理由异常时。敏感笔记应放在 include 范围之外，或使用被排除的 tag/frontmatter key。

## 学习与通知安全

学习事件虽然不含正文，但仍可能暴露 Vault 的活跃时间、打开的文件路径和用户选择的目标。请像保护其他私有 Vault 数据一样保护学习导出。原始事件 30 天后清理；习惯记录会保留到用户清空。

只有已接受习惯才会影响行为。新的习惯候选不能触发系统通知。通知默认关闭，默认安静时段为 `23:00-08:00`；启用后，通知可能在屏幕上显示标题或理由。

## 可选服务与许可

ToWrite Open Questions 插件使用 MIT License。可选 Obsidian AI Backend 独立分发、独立许可；插件的 MIT 授权不覆盖 Backend 代码、部署、托管服务或数据处理。启用前请阅读 Backend 分发包中的许可、隐私和安全文档。

OpenAI-compatible 服务、Quote0/Dot、反向代理、隧道和同步服务也都是独立系统。它们的认证、保留、日志、事故响应和可用性不受本插件控制。

## 报告安全问题

如果仓库提供私密安全报告渠道，请优先使用。不要在公开 issue 中附上真实 token、私有笔记内容、Vault 路径、设备标识或公网可达 URL。任何可能已经泄露的凭据都应立即轮换。
