# ToWrite Open Questions 安全说明

[English](SECURITY.md) | 简体中文

最后更新：2026-07-19

## 安全模型

ToWrite 是本地 Obsidian Desktop 插件。它可以读取符合条件的 Vault Markdown，并写入用户确认的卡片、记录、导出和设置。可选集成会扩大这个边界，必须由用户主动启用并负责保护。

插件不是网络边界、身份提供方、加密密钥库，也不能把不可信 Vault 沙箱化。任何可以修改插件文件、Obsidian 插件数据或 Vault 导出的人，都可能改变 ToWrite 读取的数据。

## 安全默认值

- External API、习惯学习、主动通知、AI、Device Hub 和 Obsidian AI Backend 接入均为可选功能。
- External API 默认只绑定 `127.0.0.1`。
- 智能记录会先在本地生成并预览候选，然后才可能发起可选 Backend 请求。
- 排除文件夹、tags 和 truthy 隐私 frontmatter 会在本地候选评分和 Backend 重排前生效。
- 习惯候选只有在明确接受后才会生效；通知默认关闭，并遵守安静时段。

## Token 与密钥

External API token、受限设备 token、Backend token、AI key 和设备服务 key 保存在 Obsidian 插件数据中，不会写入 ToWrite JSON 导出。但插件数据通常是本地明文数据，也可能被 Vault 同步或备份软件复制。

- 完整 External API、受限手机/Quote0 输入、Device Hub Receiver 和 Obsidian AI Backend 应使用不同的随机 token。
- 旧版本地/Quote0 流程中的手机或小屏客户端应使用受限 token，不要复用完整 External API token；新的 Device Hub NFC 标签完全不包含 token。
- Backend token 通过 `X-Capture-Token` 发送；不要把它放进 URL、截图、日志、示例文件或 issue。
- 配置的 AI Base URL 会接收到 AI API Key。只使用你信任的服务商或代理，优先使用 HTTPS，并在获取模型或测试连接前核对 URL。
- 第三方 Skill、Agent 卡片、笔记正文和模型输出都应视为不可信指令。当前交互选择卡片有数量和长度限制，并且只负责展示；未来任何写入、删除或联网工具都必须使用独立的显式审批契约。
- 查询参数 token 可能出现在浏览器历史、反向代理日志、referrer 和截图中。除非旧版本地客户端确实需要，否则保持“允许 GET 查询参数 token”关闭；绝不能把这种 URL 用作 Device Hub NFC 标签，意外暴露后立即轮换。
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

## Device Hub 安全边界

Device Hub 为不同调用方使用不同凭据：

| 调用方 | 凭据 | 权限范围 |
| --- | --- | --- |
| 账户/PWA | 短期账户 Bearer token | 账户内获准的 Receiver/设备配置，以及一次已认证 Tap 提交 |
| ToWrite Receiver | `Authorization: Bearer ...` 中的 Receiver pull token | 候选/上下文上传、绑定设备状态与动作、本 Receiver 的加密 Capture 队列 |
| ESP32 | 一次性配发的 256-bit `device_secret`，使用 `Authorization: Device ...` | 只读路径中同一 device ID 的 desired，并提交该设备 ACK |
| NFC 标签 | canonical HTTPS 路径中的随机可撤销 `tap_id` | 查看获准的冻结卡片，不授予写权限 |
| 外部留言者 | 独立签发的 `sender_key` | 仅一个 mailbox 的 `messages:create` |

ID 从来不是凭据。device ID 虽然随机且不可顺序枚举，但知道 ID 不能授权请求。Hub 只保存 device secret 的 hash，并绑定到唯一用户/设备；错误或跨设备 secret 会被拒绝，轮换或撤销设备后旧 secret 立即失效。

ToWrite 会把 Receiver pull token、Receiver P-256 私钥 JWK 和 opaque 引用 HMAC secret 保存到 Obsidian 插件数据中。该数据通常是本地明文，也可能被同步或备份。请把它当作 Vault 凭据保护，不要公开 `data.json`；暴露后应重新配对/撤销 Receiver。引导流程的账户 token 只存在内存，ToWrite 不持久化一次性 device secret；请直接把后者转移到 ESP32 的安全存储，不要写进笔记、URL、标签、截图或日志。

公网 Hub 必须使用一个不含用户名、密码、query、fragment 或额外 path prefix 的 canonical HTTPS origin；明文 HTTP 只允许显式 loopback 开发。反向代理/CDN 也是安全边界的一部分：应用层脱敏无法删除上游代理已经记录的凭据。应关闭详细请求日志、拒绝意外 query、保留 `Referrer-Policy: no-referrer`，并拒绝跨 origin 重定向。

服务端 `selected` 是 desired；只有经过设备鉴权、且 selection/version/content/revision 全部匹配当前选择的成功 ACK 才能推进 `displayed`。重复、迟到、失败、乱序或跨设备 ACK 只记审计，不能回滚状态。NFC Tap 优先解析最近一次已 ACK 的 displayed；设备尚无成功 ACK 时才回退 selected。

PWA 使用临时 P-256 ECDH、HKDF-SHA256 和 AES-256-GCM 在浏览器中为 Receiver 加密回答正文。Hub 仍能看到获准的显示卡片、密文大小、加密/路由元数据、账户/设备关联与时间信息。E2EE 只保护回答明文不被诚实但好奇的 relay 看到；它不能保护已被入侵的浏览器、插件、Receiver 私钥或显示快照。写回 Vault 还必须经过账户认证、Tap CSRF、幂等 ID、冻结 selection/content 校验、本地 opaque 目标解析和 CaptureService 冲突检查。

普通 NTAG213 可读也可复制。`tap_id` 只能证明调用者拿到了公开入口，不能证明其触碰了原标签或位于设备旁。怀疑被复制时应轮换 Tap ID 并重写可信标签；需要加密抗克隆时，应另行设计 NTAG 424 DNA 方案。

sender key 不共享设备凭据，也不能读取设备、ACK、笔记、Receiver 队列或设置。未信任留言应进入审核；只有显式可信 sender 规则可以请求显示，并且仍受勿扰、安静时段和振动策略约束。

参考 Hub 的到期与删除语义见 [PRIVACY.zh-CN.md](PRIVACY.zh-CN.md)。必需的 cleanup worker 会执行原始上下文/候选 30 天、过期且无关联 Tap 1 天、非当前审计 90 天的 cutoff；删除账户会物理删除 Hub 领域行。部署方仍必须保证 worker 可用，并配置备份过期、代理/CDN 日志和删除验证。

## 智能记录完整性

可选 Backend 接收的是已经通过本地过滤的候选白名单。插件按 candidate id 匹配 Backend 返回结果并忽略未知 id，因此重排接口不能直接注入任意路径。Device Hub 重排还会排除 display body 和 write-target 引用；Backend 只接收有长度限制的候选元数据与已接受习惯规则。

记录预览会保存目标 revision，提交时使用 preview/candidate revision 检测过期目标。只有后续可以安全检查撤销条件时才会返回 undo token。不要绕过冲突警告，也不要手工重复使用 undo token。撤销只应移除插件自己尚未被用户继续修改的写入，不能覆盖之后的编辑。

保存前请检查最终路径和 `append`/`create` 操作，特别是文件夹名、选区或 Backend 返回理由异常时。敏感笔记应放在 include 范围之外，或使用被排除的 tag/frontmatter key。

## 学习与通知安全

学习事件虽然不含正文，但仍可能暴露 Vault 的活跃时间、打开的文件路径和用户选择的目标。请像保护其他私有 Vault 数据一样保护学习导出。原始事件 30 天后清理；习惯记录会保留到用户清空。

只有已接受习惯才会影响行为。新的习惯候选不能触发系统通知。通知默认关闭，默认安静时段为 `23:00-08:00`；启用后，通知可能在屏幕上显示标题或理由。

## 可选服务与许可

ToWrite Open Questions 插件使用 MIT License。可选 Obsidian AI Backend 独立分发、独立许可；插件的 MIT 授权不覆盖 Backend 代码、部署、托管服务或数据处理。启用前请阅读 Backend 分发包中的许可、隐私和安全文档。

Device Hub 运营方、OpenAI-compatible 服务、Quote0/Dot、反向代理、隧道和同步服务也都是独立系统。它们的认证、保留、日志、事故响应、删除和可用性不受本插件控制。

## 报告安全问题

如果仓库提供私密安全报告渠道，请优先使用。不要在公开 issue 中附上真实 token、私有笔记内容、Vault 路径、设备标识或公网可达 URL。任何可能已经泄露的凭据都应立即轮换。
