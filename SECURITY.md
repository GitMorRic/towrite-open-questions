# ToWrite Open Questions Security

[简体中文](SECURITY.zh-CN.md)

Last updated: 2026-07-12

## Security Model

ToWrite is a local Obsidian Desktop plugin. It can read eligible Vault Markdown and write user-confirmed cards, captures, exports, and settings. Optional integrations expand that boundary and must be enabled and secured by the user.

The plugin is not a network perimeter, identity provider, encrypted secret store, or sandbox for an untrusted Vault. Anyone who can modify plugin files, Obsidian plugin data, or Vault exports can alter the data ToWrite reads.

## Secure Defaults

- External API, habit learning, proactive notifications, AI, and Obsidian AI Backend integration are opt-in.
- External API binds to `127.0.0.1` by default.
- Smart Capture builds and previews local candidates before any optional Backend request.
- Excluded folders, tags, and truthy privacy frontmatter are filtered before local candidate scoring or Backend reranking.
- Habit candidates have no effect until explicitly accepted; notification delivery is disabled by default and respects quiet hours.

## Tokens And Keys

External API tokens, restricted device tokens, Backend tokens, AI keys, and device-service keys are stored in Obsidian plugin data. They are not written to ToWrite JSON exports, but plugin data is normally plain local data and may be included by Vault sync or backup tools.

- Use different random tokens for the full External API, restricted phone/Quote0 input, and the Obsidian AI Backend.
- Give phone, NFC, or small-screen clients a restricted token instead of the full API token.
- The Backend token is sent as `X-Capture-Token`; do not put it in URLs, screenshots, logs, example files, or issue reports.
- The configured AI Base URL receives the AI API key. Use only a provider or proxy you trust, prefer HTTPS, and verify the URL before loading models or testing the connection.
- Treat third-party Skills, Agent cards, note content, and model output as untrusted instructions. Interactive choice cards are bounded and display-only; any future write/delete/network tool must use a separate explicit approval contract.
- Query-string tokens can appear in browser history, reverse-proxy logs, referrer data, and screenshots. Keep “allow query token for reads” disabled unless a client requires it; rotate the token after accidental exposure.
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

## Smart Capture Integrity

The optional Backend receives an allow-list of locally filtered candidates. Backend results are matched by candidate id; unknown candidate ids are ignored, so the reranker cannot directly inject an arbitrary path.

Capture preview records a target revision. Commits use the preview/candidate revision to detect stale targets, and an undo token is returned only when a later safe undo can be checked. Do not bypass a conflict warning or manually reuse an undo token. Undo is intended to remove only the plugin's own unchanged write, not later user edits.

Review the final path and action (`append` or `create`) before saving, especially when a folder name, selection, or Backend-generated reason looks unexpected. Keep sensitive notes outside the configured include scope or mark them with an excluded tag/frontmatter key.

## Learning And Notification Safety

Learning events are structural but can still reveal when a Vault was active, which file path was open, and which destination was selected. Protect the learning export like other private Vault data. Raw events are purged after 30 days; habit records remain until cleared.

Only accepted habits can influence behavior. New habit candidates cannot trigger system notifications. Notifications are disabled by default, use `23:00-08:00` quiet hours by default, and can expose titles or reasons on screen when enabled.

## Optional Services And Licenses

The ToWrite Open Questions plugin is MIT licensed. The optional Obsidian AI Backend is separately distributed and separately licensed; the plugin's MIT license does not cover Backend code, deployment, hosted service, or data handling. Review the Backend package's license, privacy, and security documents before enabling it.

OpenAI-compatible providers, Quote0/Dot, reverse proxies, tunnels, and sync services are also independent. Their authentication, retention, logging, breach response, and availability are outside this plugin's control.

## Reporting A Security Issue

Use a private security-reporting channel for the repository when one is available. Do not include real tokens, private note content, Vault paths, device identifiers, or publicly reachable URLs in a public issue. Rotate any credential that may have been disclosed.
