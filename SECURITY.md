# ToWrite Open Questions Security

[简体中文](SECURITY.zh-CN.md)

Last updated: 2026-07-19

## Security Model

ToWrite is a local Obsidian Desktop plugin. It can read eligible Vault Markdown and write user-confirmed cards, captures, exports, and settings. Optional integrations expand that boundary and must be enabled and secured by the user.

The plugin is not a network perimeter, identity provider, encrypted secret store, or sandbox for an untrusted Vault. Anyone who can modify plugin files, Obsidian plugin data, or Vault exports can alter the data ToWrite reads.

## Secure Defaults

- External API, habit learning, proactive notifications, AI, Device Hub, and Obsidian AI Backend integration are opt-in.
- External API binds to `127.0.0.1` by default.
- Smart Capture builds and previews local candidates before any optional Backend request.
- Excluded folders, tags, and truthy privacy frontmatter are filtered before local candidate scoring or Backend reranking.
- Habit candidates have no effect until explicitly accepted; notification delivery is disabled by default and respects quiet hours.

## Tokens And Keys

External API tokens, restricted device tokens, Backend tokens, AI keys, and device-service keys are stored in Obsidian plugin data. They are not written to ToWrite JSON exports, but plugin data is normally plain local data and may be included by Vault sync or backup tools.

- Use different random tokens for the full External API, restricted phone/Quote0 input, Device Hub Receiver, and the Obsidian AI Backend.
- For the legacy local/Quote0 workflow, give phone or small-screen clients a restricted token instead of the full External API token. A new Device Hub NFC tag contains no token at all.
- The Backend token is sent as `X-Capture-Token`; do not put it in URLs, screenshots, logs, example files, or issue reports.
- The configured AI Base URL receives the AI API key. Use only a provider or proxy you trust, prefer HTTPS, and verify the URL before loading models or testing the connection.
- Treat third-party Skills, Agent cards, note content, and model output as untrusted instructions. Interactive choice cards are bounded and display-only; any future write/delete/network tool must use a separate explicit approval contract.
- Query-string tokens can appear in browser history, reverse-proxy logs, referrer data, and screenshots. Keep “allow query token for reads” disabled unless a legacy local client requires it; never use such a URL for a Device Hub NFC tag, and rotate the token after accidental exposure.
- Do not commit or publish `.obsidian/plugins/towrite-open-questions/data.json`, `.obsidian-open-questions/`, `.env` files, exported diagnostics, or real device URLs containing credentials.

## Network Exposure

Keep External API on `127.0.0.1` for local-only use. Binding to `0.0.0.0` exposes the listener to reachable network peers. For LAN, Tailscale, or public-tunnel access:

- require a strong token;
- prefer Tailscale or another authenticated private network;
- use HTTPS at the endpoint or reverse proxy when traffic can leave a trusted host;
- restrict source networks with a firewall or proxy access policy;
- do not expose the API directly to the public internet without authentication and transport protection;
- verify that dashboards, SSE, RSS, phone input, and write endpoints reveal only what you intend.

Use HTTPS for any non-loopback Obsidian AI Backend. A plain `http://` Backend token and reranking metadata can be observed by anyone able to inspect that network path.

## Device Hub Security Boundary

Device Hub uses separate credentials for separate principals:

| Principal | Credential | Scope |
| --- | --- | --- |
| Account/PWA | short-lived account Bearer token | the account's authorized Receiver/device setup and one authenticated Tap submission |
| ToWrite Receiver | Receiver pull token in `Authorization: Bearer ...` | candidate/context upload, bound device state/actions, and this Receiver's encrypted Capture queue |
| ESP32 | one-time-provisioned 256-bit `device_secret` in `Authorization: Device ...` | desired state, ACK, and `useful`/`later`/`skip` feedback for exactly the device ID in the path |
| NFC tag | random revocable `tap_id` in a canonical HTTPS path | view the approved frozen card; it is not write authority |
| Guest sender | independently issued `sender_key` | `messages:create` for exactly one mailbox |

An ID is never a credential. Device IDs are random and non-sequential, but knowing one must not authorize a request. The Hub stores only the device-secret hash and binds it to one user/device. A wrong or cross-device secret is rejected; rotation or device revocation invalidates the old secret immediately.

ToWrite persists its Receiver pull token, Receiver P-256 private JWK, and opaque-reference HMAC secret in Obsidian plugin data. That data is normally plaintext and may be synced or backed up. Protect it like a Vault credential, do not publish `data.json`, and re-provision/revoke the Receiver if it is exposed. The onboarding account token is memory-only, and ToWrite does not persist the one-time device secret; transfer the latter directly to secure ESP32 storage without putting it in a note, URL, tag, screenshot, or log.

The public Hub origin must be one canonical HTTPS origin without embedded credentials, query, fragment, or a path prefix. Plain HTTP is accepted only for explicit loopback development. Configure the reverse proxy/CDN as part of the security boundary: application-level redaction cannot remove credentials that an upstream proxy has already logged. Disable verbose request logging, strip unexpected query strings, preserve `Referrer-Policy: no-referrer`, and reject redirects to a different origin.

The server's `selected` state is the desired display. `displayed` changes only after an authenticated, exact successful ACK matching the current selection, version, content, and revision. Duplicate, late, failed, reordered, or cross-device ACKs are audit-only and cannot roll either state backward. An NFC Tap resolves the last acknowledged displayed content first and falls back to selected only before the device's first successful ACK.

PWA answer text is encrypted in the browser to the Receiver with ephemeral P-256 ECDH, HKDF-SHA256, and AES-256-GCM. The Hub still sees the approved display card, ciphertext size, encryption/routing metadata, account/device linkage, and timing. E2EE therefore protects answer plaintext from an honest-but-curious relay; it does not protect a compromised browser, plugin, Receiver private key, or display snapshot. Vault writeback also requires an authenticated Tap session, CSRF, an idempotency key, frozen selection/content checks, local opaque-target resolution, and CaptureService conflict checks.

NTAG213 tags are readable and cloneable. A `tap_id` proves only that the caller obtained the public entry URL, not that they touched the original tag or are beside the display. Suspected copies are handled by rotating the Tap ID and rewriting the trusted tag. Use a separately designed NTAG 424 DNA flow if cryptographic anti-cloning is required.

Sender keys never share device credentials and cannot read devices, ACKs, notes, Receiver queues, or settings. Keep untrusted messages in moderation; only an explicit trusted-sender rule may request display, and do-not-disturb/quiet-hour/vibration policy still applies.

The reference Hub's expiry and deletion semantics are documented in [PRIVACY.md](PRIVACY.md). Its required cleanup worker enforces 30-day raw-context/candidate, one-day expired-unlinked-Tap, and 90-day non-current audit cutoffs; account deletion physically removes Hub-domain rows. Deployments must still configure worker availability, backup expiry, proxy/CDN logs, and deletion verification.

## Smart Capture Integrity

The optional Backend receives an allow-list of locally filtered candidates. Backend results are matched by candidate id; unknown candidate ids are ignored, so the reranker cannot directly inject an arbitrary path. Device Hub reranking also omits display body and write-target reference; the Backend receives only bounded candidate metadata and accepted-habit rules.

Capture preview records a target revision. Commits use the preview/candidate revision to detect stale targets, and an undo token is returned only when a later safe undo can be checked. Do not bypass a conflict warning or manually reuse an undo token. Undo is intended to remove only the plugin's own unchanged write, not later user edits.

Review the final path and action (`append` or `create`) before saving, especially when a folder name, selection, or Backend-generated reason looks unexpected. Keep sensitive notes outside the configured include scope or mark them with an excluded tag/frontmatter key.

## Learning And Notification Safety

Learning events are structural but can still reveal when a Vault was active, which file path was open, and which destination was selected. Protect the learning export like other private Vault data. Raw events are purged after 30 days; habit records remain until cleared.

Only accepted habits can influence behavior. New habit candidates cannot trigger system notifications. Notifications are disabled by default, use `23:00-08:00` quiet hours by default, and can expose titles or reasons on screen when enabled.

## Optional Services And Licenses

The ToWrite Open Questions plugin is MIT licensed. The optional Obsidian AI Backend is separately distributed and separately licensed; the plugin's MIT license does not cover Backend code, deployment, hosted service, or data handling. Review the Backend package's license, privacy, and security documents before enabling it.

Device Hub operators, OpenAI-compatible providers, Quote0/Dot, reverse proxies, tunnels, and sync services are also independent. Their authentication, retention, logging, breach response, deletion, and availability are outside this plugin's control.

## Reporting A Security Issue

Use a private security-reporting channel for the repository when one is available. Do not include real tokens, private note content, Vault paths, device identifiers, or publicly reachable URLs in a public issue. Rotate any credential that may have been disclosed.
