# NTAG213 与 NFC Tools 操作指南

本文说明如何把 ToWrite Device Hub V1 的静态碰一碰入口写入 NTAG213。标签只负责让手机打开 HTTPS PWA；当前屏幕显示什么、碰一下后打开什么，都由 Hub 根据同一设备的 selected/displayed 状态动态解析。

## 1. 标签里只写什么

V1 的 NTAG213 **只写一条 NDEF URI Record**：

```text
https://<PUBLIC_BASE_URL>/t/v1/<tap_id>
```

示例：

```text
https://hub.example.com/t/v1/tap_GQn5qrmjSRmV8dO5CjgnhA
```

其中：

- `PUBLIC_BASE_URL` 是固定、公开、使用有效 HTTPS 证书的 canonical origin。
- `tap_id` 是 Hub 生成的、至少 128-bit、可撤销和可轮换的随机入口 ID。
- 相同标签不需要随着推荐内容变化而重写。Hub 会优先打开最近一次成功 ACK 的 displayed 内容；设备还没有 ACK 时才回退 selected。

## 2. 绝对不能写入标签的内容

不得把以下内容写到 NDEF、URL query、URL fragment、附加 Text Record 或备注 Record 中：

- `device_secret`；
- Hub/Connector/Receiver 的 API key 或 Bearer token；
- `selected_content_id`、`displayed_content_id`、`selection_id`；
- Obsidian Vault 路径、笔记路径或文件名映射；
- 用户 ID、邮箱、精确位置；
- PWA 登录 cookie、CSRF token 或 Tap session ID。

正确的标签内容只相当于一个可撤销的公开入口。即使有人读取或复制标签，也不能只凭这个 URL 写 Vault、读取设备状态或控制屏幕。

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

1. Hub 已部署到最终或可稳定测试的 HTTPS 域名。
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

1. 在 Obsidian Device Hub 面板选择内容 A，并发送到屏幕。
2. 让设备/模拟器长轮询到 A、完成显示并提交成功 ACK。
3. 查看 Hub 状态：`selected=A`、`displayed=A`、`in_sync=true`。
4. 手机碰 NTAG213，应打开 A 的回答页面。
5. 在 Obsidian 选择内容 B，但暂时停止设备/模拟器，使 B 尚未 ACK。
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
