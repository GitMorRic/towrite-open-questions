# NTAG213 与 NFC Tools 操作指南

本文说明如何把 ToWrite Device Hub V1 的静态碰一碰入口写入 NTAG213。标签只负责让手机打开 HTTPS PWA；当前屏幕显示什么、碰一下后打开什么，都由 Hub 根据同一设备的 selected/displayed 状态动态解析。

## 0. 当前可用能力与限制

当前 V1 已经可以完成以下开发闭环：

```text
Obsidian 中保存的 ToThink / ToWrite 卡片
→ 插件生成并发送隐私过滤后的候选
→ Device Hub 形成 selected 状态
→ 设备模拟器显示并提交 ACK，推进 displayed 状态
→ 手机碰 NTAG213 或点击“模拟碰一碰”打开 HTTPS PWA
→ 手机提交回答
→ 加密 Capture 队列
→ 在线的 ToWrite Connector 拉取并写回 Obsidian
```

右侧栏的 **现在 → 墨水屏推荐** 卡片可以预览当前标题、提示、推荐理由、设备在线状态以及 `selected` / `displayed` 是否一致；设置页的 **模拟碰一碰** 可以在写实体标签之前预览手机页面。

目前尚未交付真实 ESP32 墨水屏驱动。私有 Tailscale Serve 也只允许 tailnet 内的客户端访问：手机和电脑可以使用，运行在电脑或 tailnet 主机上的设备模拟器也可以使用；没有加入 tailnet 的普通 ESP32 不能直接访问这个私有地址。实际墨水屏暂时用模拟器代替。

### 0.1 当前电脑上的 Tailscale Serve 拓扑

当前开发入口是：

```text
Device Hub http://127.0.0.1:8080
→ Tailscale Serve HTTPS :10000
→ https://desktop-lea3h79.taild09a3c.ts.net:10000
```

这是 **tailnet 私有 HTTPS**，不是公网入口。使用前确认：

- 电脑已登录 Tailscale；
- 手机安装并开启 Tailscale，并登录同一个 tailnet；
- tailnet ACL 允许手机访问这台电脑的 10000 端口；
- Obsidian 和 Device Hub 在这台电脑上运行；
- 不要执行 `tailscale serve reset`，也不要覆盖已有的 443/8443 Serve 配置。

在 Backend 仓库根目录启动本地 Hub 和清理 Worker：

```powershell
cd D:\Engineering\Project\ObsidianAI-Backend
.\cloud-relay\scripts\tailscale_dev_hub.ps1 -Action Setup `
  -PublicBaseUrl "https://desktop-lea3h79.taild09a3c.ts.net:10000"
```

然后在管理员 PowerShell 中只为 10000 端口建立 Serve 映射：

```powershell
tailscale serve --bg --https=10000 http://127.0.0.1:8080
tailscale serve status
```

检查本地进程和 HTTPS 健康状态：

```powershell
.\cloud-relay\scripts\tailscale_dev_hub.ps1 -Action Status
Invoke-RestMethod https://desktop-lea3h79.taild09a3c.ts.net:10000/health
```

还应在已连接同一 tailnet 的手机浏览器中打开：

```text
https://desktop-lea3h79.taild09a3c.ts.net:10000/health
```

停止或重新启动本地进程可使用 `-Action Stop` / `-Action Start`。如果要单独关闭这条 HTTPS 映射，运行：

```powershell
tailscale serve --https=10000 off
```

### 0.2 在 ToWrite 中一键生成随机 ID 和 NFC URL

`device_id`、`tap_id` 和设备密钥都不需要、也不应该由用户手工编造。Hub 使用安全随机数在配对时生成它们：

- `device_id` 形如 `dev_<32 位 UUID4 hex>`，只用于定位设备，不是凭据；
- `tap_id` 形如 `tap_<22 字符 base64url>`，是可撤销、可轮换的静态碰一碰入口；
- `device_secret` 是一次性显示的 256-bit 设备鉴权密钥，只给模拟器或未来 ESP32，绝不能写进 NFC 标签。

在 Obsidian 中按以下顺序操作：

1. 打开 **设置 → ToWrite Open Questions → Device Hub**。
2. 开启 **连接 ToWrite Device Hub**。
3. 在 **Hub URL** 填完整 origin：

   ```text
   https://desktop-lea3h79.taild09a3c.ts.net:10000
   ```

   这里只填协议、主机和端口；不要追加 `/t/v1/`、query 或 fragment。
4. 在 **账号登录与一键配对** 中填写当前 Tailscale 的精确 LoginName；GitHub 登录形如 `username@github`，不是 GitHub 注册邮箱。点击 **发送验证码**。
5. 私有开发模式只有在 Tailscale 注入的身份邮箱与所填邮箱相同时，才会把开发验证码返回给插件并自动填入；点击 **验证登录**。账号访问令牌只保留在本次设置会话的内存中。
6. 点击 **一键创建并配对**。插件会在需要时自动创建本地 P-256 接收密钥，并让 Hub 创建 Receiver、设备、配对绑定和 Tap URL。
7. 一次性 `device_secret` 只在本次设置会话中显示。如需运行模拟器，明确点击 **复制给 ESP32 / 模拟器** 并妥善保存；**不要粘贴到 NFC Tools**。
8. 找到 **NFC Tools 写入内容（完整 Tap URL）**。确认显示 `可写入 NTAG213` 且不超过 `144 bytes`，点击 **复制完整 URL**。这段完整 URL 才是应写入 NFC Tools 的内容。
9. 先点击 **模拟碰一碰**，确认 PWA 能打开，再写实体标签。

点击 **轮换 NFC 地址** 会生成新的 `tap_id` 并立即撤销旧地址；此后旧实体标签会失效，必须把新完整 URL 重新写入标签。这不是普通“刷新”。

需要模拟真实屏幕 ACK 时，在 Backend 仓库根目录运行以下模式的命令；`device_id` 使用插件显示的值，`device_secret` 使用一键配对时保存的一次性值：

```powershell
.\.venv\Scripts\python.exe scripts\eink_device_simulator.py `
  --base-url https://desktop-lea3h79.taild09a3c.ts.net:10000 `
  --device-id dev_<插件显示的32位hex> `
  --device-secret <一次性设备密钥>
```

不要把命令中的设备密钥截图、提交到 Git 或复制到 NFC 标签。

### 0.3 划线内容如何联动

临时选区不会在打字或划线时自动上传。正确流程是：

1. 在 Markdown 中选中文字；PDF 划线卡在 V1 默认按附件隐私规则留在本地，不进入 Hub；
2. 使用选区工具条或命令，把它保存成 **ToThink** 或 **ToWrite** 卡片；
3. 保存后的活动卡片会自动进入右侧栏的 **设备内容库**。这个库不是正文副本：Markdown/sidecar 仍是真源，卡片只额外保存入库、Agent/循环资格与每日时间窗；解决、隐藏、手工移出或后来命中 `private`/`no-cloud` 后会退出可发送集合；
4. 卡片底部的显示器上箭头用于 **立即显示**；点击或右键书库图标可加入/移出、切换 Agent/循环资格，或设置该卡每天的 `HH:mm` 显示时间；
5. 右侧栏可切换四种方式：**手动**只接受显式发送；**Agent**在本地最多 20 条白名单内用规则与可选 AI 重排；**循环**按稳定顺序播放；**定时**只在卡片的每日时间窗中选择。手工显示优先，并从设备 ACK 后保持默认 30 分钟；等待 ACK 时任何自动模式都不能覆盖；
6. 右侧栏的墨水屏推荐卡会显示 selected 标题、提示和理由；selected 与 displayed 不一致时，还会单独显示屏幕当前仍在显示的卡片；
7. 设备模拟器 ACK 后，`displayed` 与 `selected` 一致；循环间隔只从这次成功 ACK 开始计算。碰 NFC 会打开眼前这张卡的 PWA；
8. 在 PWA 回答后，保持 Obsidian Connector 在线并再次同步，回答会通过加密队列交给 CaptureService，按冻结目标安全追加到来源笔记的 Captures 区段。V1 尚未把这次回答同时写入 ToThink/ToWrite 卡片的活动流。

循环和定时目前借鉴 Quote0 的节目单体验，但没有复用 Quote0“API 发送成功即推进 cursor”的语义：Device Hub 必须等真实 `display ACK` 才推进。当前 V1 调度器运行在 Obsidian Connector 内，关闭 Obsidian 后暂停并保持屏幕最后内容；要实现全天候 Agent/循环/定时，仍需下一版 Hub 增加持久节目单、eligibility withdraw 和服务端 worker。

默认的 **发送获准显示的正文片段** 是关闭的，因此 Hub 只收到显示标题、通用提示、动作、分数和理由，不会因为刚刚选中文字就上传完整正文。用户明确开启该选项后，已保存且通过 include/exclude、`private`、`no-ai`、`no-cloud` 等隐私规则的候选，才可以发送截断后的获准显示片段。Vault 绝对路径和长期 token 始终不会发送。

### 0.4 Serve 与 Funnel 的边界

| 模式 | 谁能访问 | 当前用途 | 认证要求 |
|---|---|---|---|
| Tailscale Serve | 同一 tailnet 且 ACL 允许的设备 | 当前手机、电脑和模拟器开发测试 | 可使用 Tailscale 身份约束的开发邮箱验证码 |
| Tailscale Funnel | 公网 | 未来没有 Tailscale 的 ESP32 或外部手机 | 必须配置真实 SMTP，关闭开发验证码，并重新检查限流、日志和公网安全 |
| 自有域名/反向代理 | 取决于部署 | 正式生产 | 有效 HTTPS、稳定 canonical origin 和完整生产认证 |

当前配置包含 `TAILSCALE_SERVE_DEV_LOGIN=true`，它依赖 Serve 提供的 `Tailscale-User-Login` 身份头。Funnel 不提供这个私有身份保证，因此**不要直接把当前 10000 端口切成 Funnel**。将来公开前应先配置 SMTP、把开发登录关闭，并完成公网威胁模型和双平台测试。Funnel 支持的 HTTPS 端口受 Tailscale 限制，当前常用选择是 443、8443 或 10000。

## 1. 标签里只写什么

V1 的 NTAG213 **只写一条 NDEF URI Record**：

```text
<PUBLIC_BASE_URL>/t/v1/<tap_id>
```

示例：

```text
https://hub.example.com/t/v1/tap_GQn5qrmjSRmV8dO5CjgnhA
```

当前私有 Serve 环境中，插件实际复制出的地址会是以下形式，其中最后一段必须使用插件生成的真实值：

```text
https://desktop-lea3h79.taild09a3c.ts.net:10000/t/v1/tap_<22字符随机ID>
```

其中：

- `PUBLIC_BASE_URL` 已经包含 `https://`，是固定、使用有效证书的 canonical origin；它可以是公网可达地址，也可以像当前 Serve 一样只在 tailnet 内可达。
- `tap_id` 是 Hub 生成的、至少 128-bit、可撤销和可轮换的随机入口 ID。
- 相同标签不需要随着推荐内容变化而重写。Hub 会优先打开最近一次成功 ACK 的 displayed 内容；设备还没有 ACK 时才回退 selected。

## 2. 绝对不能写入标签的内容

不得把以下内容写到 NDEF、URL query、URL fragment、附加 Text Record 或备注 Record 中：

- `device_secret`；
- `device_id`；
- Hub/Connector/Receiver 的 API key 或 Bearer token；
- `selected_content_id`、`displayed_content_id`、`selection_id`；
- Obsidian Vault 路径、笔记路径或文件名映射；
- 用户 ID、邮箱、精确位置；
- PWA 登录 cookie、CSRF token 或 Tap session ID。

正确的标签内容只相当于一个可撤销的入口。即使有人读取或复制标签，也不能只凭这个 URL 写 Vault、读取设备状态或控制屏幕；在私有 Serve 模式下，访问者还必须能够进入同一 tailnet 并通过 ACL。

## 3. 为什么 V1 不写 AAR

V1 使用标准 HTTPS PWA，因此不写 Android Application Record（AAR），也不写 Quote0 使用的 `tech.mindreset.dot.alpha`：

- iPhone 与 Android 都能把标准 URI Record 交给浏览器处理。
- 当前没有需要强制启动的自有 Android package。
- AAR 会占用额外的 NDEF 空间，也会让标签错误绑定到其他产品的应用。

将来发布自有 Android App 后，可以评估 Android App Links，并在确有必要时增加第二条 AAR；届时只能填写自己的 package name，并重新核算实际 NDEF 字节数。平台行为以 [Android 官方 NFC 文档](https://developer.android.com/develop/connectivity/nfc/nfc) 为准。

## 4. NTAG213 容量与实际 NDEF 字节数

根据 [NXP NTAG213/215/216 产品规格](https://www.nxp.com/products/NTAG213_215_216)，NTAG213 有 144 字节用户存储空间。这里的 144 字节不等于“可以输入 144 个可见字符”，因为 NDEF Record、URI 类型和 TLV 都有开销。

ToWrite/Hub 生成器必须显示：

```text
Tap URL:          https://…
NDEF bytes:       71 / 144
NTAG213 fits:     yes
```

如果显示 `NDEF bytes > 144` 或 `NTAG213 fits: no`，必须拒绝写入，不要依赖 NFC Tools 自动截断。

### 4.1 V1 计算方式

对于使用标准 URI prefix compression 的单条短 URI Record，生成器按实际 UTF-8 字节计算：

```text
1. 从 URL 中压缩 https:// 或 https://www. 前缀
2. URI payload = 1 字节 URI 前缀码 + 其余 URL 的 UTF-8 字节
3. 加入 NDEF short-record header、URI 类型和 payload length
4. 加入 NDEF TLV 与 terminator
```

对常见的 `https://` URL，当前 V1 可理解为：

```text
实际占用约为 8 + 去掉 https:// 后其余部分的 UTF-8 字节数
```

最终以插件/Hub 显示的实际 `ntag213_bytes` 为准。域名应尽量简短且只使用 canonical origin；不要加入追踪 query、长期 token 或重复路径。第三方写入工具如果未使用相同的 URI 前缀压缩，实际占用可能不同，因此写完后还必须执行 Read 验证。

## 5. 写入前准备

写标签前确认：

1. Hub 已部署到最终或可稳定测试的 HTTPS origin，例如当前 tailnet 私有的 `*.ts.net:10000` 地址。
2. `PUBLIC_BASE_URL` 没有用户名、密码、query 或 fragment，反向代理不会把它重定向到含 token 的地址。
3. Obsidian 的 Device Hub 设置已经绑定正确设备，并能看到 selected/displayed 状态。
4. 在插件中生成或刷新该设备的 Tap URL。
5. 页面显示 `NTAG213 fits: yes`，且字节数不超过 144。
6. 用手机浏览器直接打开 URL，确认不会出现证书警告。
7. 准备一枚未锁定、可写的 NTAG213，并确认不是仅支持厂商私有格式的标签。

开发期建议在标签外壳上标记设备名称，但不要印出 device secret。

## 6. NFC Tools 固定操作步骤

以下步骤在 iPhone 和 Android 版 NFC Tools 中名称可能有轻微翻译差异，但顺序固定：

```text
Write
→ Add a record
→ URL/URI
→ 粘贴服务器生成地址
→ Write
→ Read 验证
→ 分别用 iPhone/Android 测试
```

详细操作：

1. 打开 **NFC Tools**，进入 **Write（写入）**。
2. 点击 **Add a record（添加记录）**。
3. 选择 **URL/URI**。不要选 Text、Custom data、Social network、Application 或 AAR。
4. 完整粘贴插件生成的地址，例如：

   ```text
   https://hub.example.com/t/v1/tap_GQn5qrmjSRmV8dO5CjgnhA
   ```

5. 检查待写列表中只有这一条 URI Record，没有旧的 Text/AAR/Unknown Record。
6. 点击 **Write（写入）**。
7. 按手机提示把 NTAG213 靠近 NFC 天线，保持不动，直到 NFC Tools 明确提示写入成功。
8. 进入 **Read（读取）**，再次贴近标签。
9. 验证读取结果满足：

   - 记录数为 1；
   - 类型为 URI/URL；
   - URL 与插件生成值逐字一致；
   - 无 token、query、fragment、AAR 或额外文本；
   - 标签仍显示可写（开发期）。

10. 关闭 NFC Tools，分别用一台 iPhone 和一台 Android 手机直接碰标签，验证系统能打开 HTTPS 页面。

## 7. 功能验收：屏幕与手机必须一致

建议按以下顺序完成一次真实验收：

1. 在 Obsidian 的问题卡 A 底部点击 **将这条卡片发送到墨水屏**。
2. 让设备/模拟器长轮询到 A、完成显示并提交成功 ACK。
3. 查看 Hub 状态：`selected=A`、`displayed=A`、`in_sync=true`。
4. 手机碰 NTAG213，应打开 A 的回答页面。
5. 在问题卡 B 底部执行同一操作，但暂时停止设备/模拟器，使 B 尚未 ACK。
6. 查看状态：`selected=B`、`displayed=A`、`in_sync=false`。
7. 再次碰标签，页面仍应打开 A，因为眼前屏幕还是 A。
8. 恢复设备，让它显示 B 并 ACK。
9. 第三次碰标签，此时应打开 B。
10. 在 PWA 输入回答，提交后确认它进入加密 Capture 队列，并由 ToWrite 写回正确目标。

如果第 7 步打开了 B，说明 Tap Router 错误地只使用 selected；不要锁定标签或正式部署，先修复服务器逻辑。

## 8. iPhone 与 Android 测试要点

### iPhone

- 使用支持后台标签读取的机型和已启用 NFC 的系统环境。
- 手机解锁并亮屏；把标签靠近通常位于机身顶部的 NFC 天线区域。
- 点击系统通知后应进入 HTTPS 页面。
- Safari 地址栏不得出现 token、secret 或本地 Vault 路径。

### Android

- 在系统设置中开启 NFC。
- 手机解锁；将标签靠近机背 NFC 天线区域，不同机型位置可能不同。
- 系统应把 URI 交给浏览器或用户选择的 HTTPS 处理器。
- V1 不应提示安装 `tech.mindreset.dot.alpha`，也不应强制打开无关应用。

两个平台都应验证：

- HTTPS 证书有效；
- 页面不会把 Tap URL 重定向到含长期凭据的 URL；
- 未登录时可以看本次获准卡片，但写入要求登录/配对；
- 刷新 GET 不会消耗 Tap session；成功提交才消耗；
- 页面带 `no-referrer` 和 `no-store` 行为。

## 9. 开发期不要锁标签

开发阶段不要在 NFC Tools 中使用 Lock、Read-only、Password protection 或永久写保护：

- 测试域名、canonical origin 或 Tap ID 可能变化。
- Tap ID 轮换后旧 URL 会被撤销，需要重写实体标签。
- NTAG213 的部分锁定位一旦设置不可恢复，写错后只能更换标签。

只有同时满足以下条件后才考虑设置只读：

1. 正式域名和 HTTPS 证书已稳定；
2. Tap Router 路由和 canonical origin 不再变化；
3. 插件显示实际 NDEF 字节数合规；
4. iPhone 和 Android 都完成 selected/displayed 一致性测试；
5. PWA 登录、CSRF、幂等和加密写回都通过；
6. 已接受“以后轮换 Tap ID 就需要更换或重写标签”的运维成本。

设置只读前先导出或安全记录设备与实体标签的对应关系，但不要把 secret 记录在标签外壳上。

## 10. 标签可复制与安全边界

普通 NTAG213 的 NDEF 内容可以被读取和复制。攻击者可以制作一个包含相同 Tap URL 的标签。因此：

- `tap_id` 只证明访问者拿到了入口，不能证明访问者在设备旁边，也不能证明是原标签。
- Tap 页面只能展示已批准的最小显示快照。
- 写入 Vault 始终要求登录/已配对手机会话、CSRF 校验和幂等 ID。
- Tap session 约 5 分钟有效并冻结本次 selection；成功提交后消费。
- 怀疑标签被复制时，立即在 Device Hub 轮换 Tap ID。旧标签随即失效，再把新 URL 写入可信标签。

如果业务未来需要更强的抗克隆和每次触碰动态认证，应另行升级到支持加密动态消息的 **NTAG 424 DNA**，并重新设计服务端验证、密钥注入和制造流程。不要把 NTAG213 描述为抗克隆标签。

## 11. 常见问题排查

### 电脑能打开 HTTPS，但手机打不开

1. 在手机 Tailscale App 中确认状态为已连接，并确认手机与电脑属于同一个 tailnet。
2. 在电脑运行 `tailscale serve status`，确认 10000 正向代理到 `http://127.0.0.1:8080`。
3. 运行 `tailscale_dev_hub.ps1 -Action Status`，确认 API、Worker 和本地 health 都正常。
4. 在手机浏览器先打开 `/health`，不要先用 NFC 排查；确认 URL 包含 `:10000`。
5. 检查 tailnet ACL、手机使用的 Tailscale 账号和 MagicDNS/FQDN。不要把 `desktop-lea3h79.taild09a3c.ts.net` 换成 `127.0.0.1` 或普通局域网 HTTP 地址。

### 插件提示 Hub URL 无效

- Hub URL 必须是完整 canonical origin，例如 `https://desktop-lea3h79.taild09a3c.ts.net:10000`。
- 不要填写 `/health`、`/v1`、`/t/v1/...`、用户名、密码、query 或 fragment。
- 正式手机/NFC 路径必须使用 HTTPS；只有插件所在电脑上的 localhost 开发才允许 HTTP。

### 验证码没有自动出现或一键配对失败

- 私有 Serve 开发登录要求填写的 LoginName 与 `Tailscale-User-Login` 完全匹配；GitHub 身份形如 `username@github`。确认 Obsidian 请求走的是 `https://...ts.net:10000`，而不是绕过 Serve 直接访问 `127.0.0.1:8080`。
- 账号令牌只在当前设置会话内存中保存；重新打开设置后可能需要再次发送验证码并验证。
- 先点击 **测试连接**，再检查 Backend 的 `cloud-relay/data/logs/` 与 `tailscale serve status`。
- 如果 Receiver/设备已存在，界面会显示轮换按钮而不是再次显示 **一键创建并配对**。

### 右侧栏没有“墨水屏推荐”或没有划线内容

- 确认已开启 Device Hub，并完成 Receiver 和设备配对，然后点击 **立即同步** 或 **刷新状态**。
- 临时划线不会直接成为候选；必须先保存为 ToThink/ToWrite 卡片。
- 检查 include/exclude 文件夹、tags、frontmatter 以及 `private`、`no-ai`、`no-cloud` 规则。被排除的卡片不会离开本地。
- 默认不发送正文片段；如果标题出现但没有选区正文，这是预期行为。只有明确开启 **发送获准显示的正文片段** 后才会发送经过过滤和截断的显示内容。

### PWA 能打开，但回答没有回到 Obsidian

- 确认手机已完成 PWA 登录/配对，提交时没有 CSRF、过期 Tap session 或冲突提示。
- 保持 Obsidian 和 ToWrite Connector 在线，点击 **立即同步** 拉取加密队列。
- 检查 PWA 回写 E2EE 接收密钥仍与 Receiver 配对；轮换密钥前应先处理旧队列。
- 如果目标笔记自预览后发生变化，CaptureService 会保留冲突而不是覆盖。回到插件检查冲突并重新预览/提交。

### 模拟器可用，但 ESP32 不可用

这是当前私有 Serve 模式的预期边界。普通 ESP32 没有加入 tailnet 时无法访问 `*.ts.net:10000` 的私有入口。继续使用设备模拟器完成 `desired → ACK → displayed` 验收；等真实硬件和公网认证准备好后，再安全迁移到 Funnel、自有域名或其他受保护的公网入口。

### NFC Tools 提示容量不足

- 回到插件确认 `ntag213_bytes`；超过 144 必须换更短 canonical domain/path 或使用容量更大的标签。
- 删除待写列表中的额外 Text、AAR 和旧 Record。
- 不要通过删除 `https://` 来省空间；公网入口必须使用 HTTPS。
- 不要用 URL shortener，除非它属于你控制的 canonical origin 且保证不记录/泄漏敏感参数。

### 写入成功但手机无反应

- 用 NFC Tools 的 Read 确认 Record 类型是 URI，不是普通文本。
- 检查手机 NFC 是否开启、是否解锁，以及天线位置。
- 直接在浏览器打开同一 URL，排除 DNS、证书或反向代理问题。
- 用另一台 iPhone/Android 交叉验证。

### 页面显示 404

- Tap ID 可能已轮换或撤销；在 Device Hub 设置中生成当前 URL 并重写标签。
- 设备可能尚无 selected；先发送一个候选到设备。
- 检查反向代理是否把 `/t/v1/` 路由到了 Device Hub。

### 页面内容与屏幕不同

- 查看 selected/displayed 是否 `in_sync`。
- 如果设备刚收到新选择但未 ACK，Tap 应打开旧 displayed，这是正确行为。
- 如果已 ACK 仍不同，检查 ACK 的 selection/version/content/revision 是否完全匹配并被服务端接受。
- 旧 ACK、失败 ACK 或乱序 ACK 不得推进 displayed。

### 标签疑似被复制

1. 在账户端轮换该设备的 Tap ID。
2. 确认旧 URL 返回 404/已撤销。
3. 把新 URL 写入可信标签并重新做双平台测试。
4. 检查 Tap 与 Capture 审计，不要轮换 device secret 来替代 Tap ID 轮换；两者是不同权限域。

## 12. 交付记录模板

正式安装时可以保存以下不含秘密的信息：

```text
设备名称：
device_id：dev_…
标签型号：NTAG213
Tap URL 域名：https://…
tap_id 后 6 位：
NDEF bytes：___ / 144
iPhone 测试日期：
Android 测试日期：
selected/displayed 一致性测试：通过 / 未通过
PWA 加密写回测试：通过 / 未通过
标签是否只读：否（默认） / 是（正式验证后）
```

此记录不得包含 device secret、Bearer token、Receiver token、PWA cookie 或 Vault 路径。
