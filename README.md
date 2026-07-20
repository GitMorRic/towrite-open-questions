# ToWrite Open Questions

[简体中文](README.zh-CN.md)

ToWrite Open Questions is a desktop-only Obsidian plugin for keeping unfinished thinking and unfinished writing attached to the exact notes, PDF passages, and draft fragments where they started.

It is not a general TODO list. It gives your vault a ToThink / ToWrite annotation layer so missing evidence, unclear reasoning, and "continue this later" fragments stay visible without interrupting the writing flow.

## Features

- Capture `ToThink` and `ToWrite` cards from Markdown selections, PDF selections, explicit Markdown rules, or inline trigger suggestions.
- Keep the current note's cards at the top of the sidebar, separated into collapsible ToThink and ToWrite sections.
- Jump from a card back to the source line or PDF highlight.
- Edit card title, source body, note, status, type, lane, color, and tags from the sidebar.
- Write Obsidian-style `[[wikilinks]]` in card notes; previews can open existing notes or create missing notes.
- Store selection cards in sidecar JSON without changing your Markdown unless you explicitly pin a source anchor.
- Highlight source text in the editor, with per-card and global compact display modes.
- Configure Workflow Stages that group Markdown files by folder prefixes, frontmatter tags, or inline `#tags`.
- Configure Article Types that group notes by content area such as MindFlow, Tech, or Project; the sidebar and dashboard show both type and Workflow stage.
- Export JSON for dashboards, desktop widgets, scripts, and eink devices.
- Run an optional local desktop HTTP API for JSON, RSS, SSE events, dashboard views, mobile device previews, companion phone input, and note/status/capture writeback.
- Run an optional Push Engine and Quote0 integration for eink overview dashboards, rotating ToThink/ToWrite cards, and NFC phone writeback.
- Optionally connect to Device Hub V1 for privacy-filtered recommendations, server-authoritative `selected` state, ESP32 long polling/display ACKs, and a credential-free NFC/PWA answer flow.
- Run optional OpenAI-compatible summaries and local-note recommendations after you configure your own endpoint.
- Open a native Smart Capture modal for a new idea, a Markdown selection, or an answer to a ToThink/ToWrite card, with local destination recommendations and a conflict-safe preview.
- Optionally learn coarse work-session and routing patterns. Detected patterns remain pending until you explicitly confirm them.
- Optionally connect a separately licensed Obsidian AI Backend to rerank local destination candidates or improve habit-candidate wording; capture continues to work without it.

## Screenshots

![Sidebar current note and selection toolbar](docs/assets/sidebar-current-note%20and%20selection-toolbar.png)

![Small-screen and External API overview](docs/assets/to-write-elink-api-overview.png)

![Web dashboard](docs/assets/to-write-web-dashboard.png)

For launch messaging and demo scripts, see the Chinese [promo and demo guide](docs/promo-demo-guide.zh-CN.md).

## Desktop Only

This plugin is marked `isDesktopOnly: true` because the optional External API uses Node.js `http` to run a local server inside Obsidian Desktop. Core indexing is local-first, but the current marketplace build is desktop-only to comply with Obsidian community plugin review requirements.

## Quick Start

1. Open the ToWrite sidebar from the ribbon icon or command palette.
2. Select text in a Markdown note or PDF.
3. Click `Think` or `Write` in the floating toolbar.
4. Use the sidebar card to edit the title, note, status, and type.
5. Click the arrow on a card to jump back to the source.

## Local-First Smart Capture

Open Smart Capture from the ribbon, the command palette, a Markdown selection, or a question card. The native Obsidian modal supports three intents:

- `New`: save a standalone idea.
- `Selection`: keep the selected text and source context while deciding where the note belongs.
- `Answer`: append to the question card by default; optionally also archive the answer as a note.

ToWrite computes and displays at most three local destination candidates before any optional network request:

| Candidate | Result |
| --- | --- |
| Most relevant existing note | Append under the configured capture heading. |
| Recommended folder or Workflow stage | Create a new Markdown note with a previewed path. |
| Inbox fallback | Use the configured Inbox when the stronger matches are uncertain. |

The local index respects the Capture include/exclude folders, excluded tags, and truthy privacy frontmatter settings. You can inspect the path and excerpt, change the candidate, then save with `Ctrl/Cmd+Enter`. A successful capture can be opened immediately and, when a safe undo token is available, undone without overwriting later edits.

The Obsidian AI Backend is an optional enhancement, not a dependency. Local candidates appear first and remain the allow-list; an enabled Backend may asynchronously reorder those candidates and revise their displayed reason, but it cannot introduce an arbitrary vault path. If the Backend is disabled, offline, incompatible, or times out, local capture and local recommendations continue normally.

Backend implementers can use the versioned [ToWrite v1 integration contract](docs/obsidian-ai-backend-towrite-v1.md).

## Habit Learning And Proactive Suggestions

Habit learning is off by default. When enabled, ToWrite records coarse structural events such as file switches, edit-presence periods, confirmed capture destinations, question actions, and suggestion feedback. It does not record note bodies, selections, clipboard contents, or individual keystrokes as learning events.

Raw learning events are automatically purged after 30 days. Pattern inference can create a pending habit candidate, but a pending candidate cannot change routing or generate a habit notification. Only a habit you explicitly accept can influence future behavior. You can inspect evidence, edit the label, dismiss or postpone a candidate, export the learning data, or clear all learned data.

Proactive notifications are also off by default. When enabled, only due reminders and confirmed habits can notify; new habit candidates stay silently in the sidebar. The default quiet period is `23:00-08:00`, with a default limit of three habit notifications per day.

See [PRIVACY.md](PRIVACY.md) for the exact learning-event and optional Backend data boundaries.

## Supported Markdown Rules

```markdown
?? Has anyone measured the voltage drop across 16 WS2812 LEDs? ^oq_ws2812_vdrop

- [ ] [?] Find measured WS2812 voltage-drop data #open-question

> [!question] WS2812 voltage-drop evidence
> id: oq_ws2812_vdrop
> kind: research
> status: open
> lane: think
> tags: ws2812, power
> color: amber
>
> Does anyone have measured data for this?
```

Short trigger phrases such as "continue writing", "needs evidence", or custom trigger words are shown as inline suggestions. They are not saved or exported until you click the `+ Think` or `+ Write` button in the editor.

## PDF Support

PDF cards are non-destructive. ToWrite stores the PDF file path, selected text, page number, and normalized selection rectangles in sidecar JSON. It draws an overlay highlight in Obsidian's PDF viewer and uses those stored rectangles to jump back to the relevant page and position when possible.

ToWrite does not modify the PDF file itself.

## Workflow Stages

Workflow Stages are a file/project lifecycle index separate from ToThink / ToWrite cards. You can configure stages such as `Raw`, `Sparks`, `Initialize`, `Processing`, and `Archive`, each with:

- `folderPrefixes[]`, such as `MindFlow/01-Sparks`.
- `tags[]`, matched against frontmatter tags and inline `#tags`.
- display title, description, color, per-stage limit, and stale-after-days.

The feature is disabled by default. When enabled, it exports `workflows.json` and exposes `GET /api/v1/workflows` for dashboards, widgets, eink devices, or later AI reminders.

Use `Stage` for lifecycle state, such as Raw, Sparks, Initialize, Processing, and Archive. Use top-level folders or tags for content areas, such as MindFlow, Techbench, or OCStory. If you later want API/dashboard breakdowns by both area and stage, that should become a separate `Workflow Areas` dimension instead of duplicating stages into long names such as `raw-mindflow` and `raw-techbench`.

## Article Types, Sidebar, And Dashboard

Article Types are a second dimension for content areas. The default examples are `mindflow`, `tech`, and `project`, and each type can be renamed, recolored, and matched by folder prefixes or tags.

Hierarchical tags are split into both dimensions. For example, `#mindflow/spark` can match type=`mindflow` and stage=`spark`; a plain `#spark` tag can still match the Workflow stage. A note does not need any ToThink/ToWrite cards to appear in the classified note list: matching a type or stage is enough.

The sidebar exposes three layers of filtering:

- ToThink / ToWrite lane filter for current-note cards and expanded article cards.
- Article Type tabs from the configured type list, including zero-count types.
- Workflow stage tabs from the configured stage list, including zero-count stages.

The Obsidian dashboard view, External API `/api/v1/device-feed`, and Quote0 dashboard all use the same question, article, and workflow/tag indexes. Each surface adapts the display: the sidebar keeps editing controls, the dashboard favors scan-friendly tables and metrics, Quote0 Text API compresses content into a few lines, and Quote0 Canvas/Image dashboards prioritize home metrics and Workflow status.

## Quote0 And Push

Quote0 output has two common modes:

- Text cards: send the next ToThink/ToWrite card with title, question, next action, recent note, stage, and status.
- Home overview: send a dashboard through Text / Image / Canvas API with ToThink, ToWrite, unresolved articles, reminders, Workflow files, and stage status.

The legacy Quote0 NFC link points to `External API publicBaseUrl + /device/input?token=<quote0-nfc-token>&questionId=<id>` by default. The Quote0 NFC token is restricted to phone input, input context, appending notes, and capture creation. It is not the full External API token. This query-token route is retained only for the local/Quote0 compatibility workflow; do not use it for a new Device Hub NFC tag.

For NFC writeback to work, Obsidian Desktop must be running, External API must be enabled, `bindHost` should be `0.0.0.0` for LAN/Tailscale access, and `publicBaseUrl` must be reachable from the phone, for example `http://100.x.y.z:48321` or `http://192.168.1.20:48321`. In Dot App/Content Studio, add the Text / Image / Canvas API content to the Quote0 Loop content list; otherwise Dot API may accept updates while the screen keeps showing another Loop item.

By default, the plugin also calls Dot's device switch/refresh endpoint (`/next`) after a successful send to reduce visible delay. This still depends on Dot cloud queueing, the active Loop item, and physical eink refresh time. Turn off "Force refresh after send" if your Loop advances to the wrong item.

## Device Hub V1

Device Hub is an optional, separately deployed path for an ESP32/eink device and an HTTPS phone PWA:

```text
Obsidian privacy-filtered candidates
  -> Hub selected state
  -> ESP32 HTTPS long poll
  -> display ACK
  -> static NFC Tap URL
  -> encrypted PWA answer
  -> Receiver queue
  -> local CaptureService writeback
```

The plugin sends at most 20 locally filtered candidates with opaque source/write-target references. Display body sharing is off by default. An optional trusted Backend may rerank only those candidate IDs and cannot inject a Vault path, switch the screen, or request vibration. The Hub's `selected` state says what the server wants; `displayed` changes only after an exact successful device ACK. NFC therefore opens the most recently acknowledged displayed content, falling back to selected only before the first successful ACK.

New Device Hub tags contain exactly one URI record:

```text
<PUBLIC_BASE_URL>/t/v1/<tap_id>
```

They contain no API token, device secret, content ID, or Vault path. The old `/device/go`, `/device/input?token=...`, and query-token preview routes remain local/Quote0 compatibility features and are not the Device Hub NFC contract.

See the bilingual [Device Hub V1 protocol](docs/device-hub-protocol.md), the [Chinese protocol](docs/device-hub-protocol.zh-CN.md), and the [NTAG213/NFC Tools guide](docs/ntag213-nfc-tools.md) ([中文](docs/ntag213-nfc-tools.zh-CN.md)).

## Data Files

ToWrite writes vault-readable JSON under the configured export directory:

```text
.obsidian-open-questions/
  index.json
  articles.json
  eink-compact.json
  workflows.json
  learning/
    events.jsonl
    habits.json
  questions/
    <question-sidecar>.json
```

These exports may contain selected note text, PDF excerpts, titles, notes, tags, statuses, source paths, Workflow file summaries, frontmatter, card metadata, and—when learning is enabled—coarse activity events and habit candidates. Do not publish the export folder unless you intend to share that content.

## External API

The External API is disabled by default. When enabled, it requires a token and runs only in Obsidian Desktop.

Default local endpoint:

```text
http://127.0.0.1:48321
```

Useful routes:

```text
GET   /health
GET   /api/v1/questions
GET   /api/v1/articles
GET   /api/v1/workflows
GET   /api/v1/eink
GET   /api/v1/deck
GET   /api/v1/device-feed
GET   /api/v1/rss.xml
GET   /api/v1/events
GET   /dashboard
GET   /device
GET   /device/go
GET   /device/input
POST  /api/v1/questions/<id>/status
POST  /api/v1/questions/<id>/notes
POST  /api/v1/captures
POST  /api/v1/device/events
POST  /api/v1/device/handoffs
PATCH /api/v1/questions/<id>
```

Use `127.0.0.1` for local widgets. Use `0.0.0.0` only when you intentionally want LAN or tunnel access, and protect remote access with your own network controls such as Tailscale, Cloudflare Tunnel, a reverse proxy, HTTPS, or a firewall.

### Phone And Small-Screen Preview

For the legacy local External API preview only, if your phone and desktop are connected through Tailscale, set the External API bind host to `0.0.0.0`, enable query-token reads, then open:

```text
http://<desktop-tailscale-ip>:48321/device?token=<your-token>
```

`/device` simulates an eink or small-screen device. It calls `GET /api/v1/device-feed`, which returns a server-prepared view model for home, cards, next-card previews, workflow files, and source-note status pages. Supported profiles are `mobile-eink` for the phone/PWA preview, `eink-bw` for compact black-and-white eink devices, and `desktop-card` for denser desktop widgets. Clients can pass `width`, `height`, and `inches`; landscape screens receive a compact layout automatically.

Query-token URLs can leak through browser history, screenshots, proxy logs, and Referrer headers. Keep query-token reads disabled unless this legacy client requires them, never write such a URL to a new Device Hub NFC tag, and rotate the token after exposure.

Real eink hardware can stay simple: display the card, a QR/short link, or a hardware-button action. In this legacy local workflow, the companion `/device/input` page handles text input, mobile Web Speech dictation, tags, target folders, answering a card via `POST /api/v1/questions/<id>/notes`, or saving a standalone idea through `POST /api/v1/captures`. A compatibility NFC tag can point at `/device/go?targetId=...`, where the desktop plugin resolves the latest card into an input page, source note, or quick capture. Hardware buttons can POST to `/api/v1/device/events` and use the same action layer. New Device Hub tags instead use `/t/v1/<tap_id>` and never carry a query token. The phone preview also shows a direct `Voice` action so you can dictate a new idea without leaving the `/device` page.

The phone preview shows a five-key hint bar inside the simulated screen: `New Idea / Previous / Home + Voice / Next / Phone Input or current action`. Tap the center key to return home; long-press it to dictate a new idea and save it through Device Capture. On source-note pages, the right key becomes `Cards` and opens that note's filtered card queue. Real hardware can map the same labels to physical buttons around the display.

Cards can also store a manual `reminderAt` time. Reminder fields are exposed through `/api/v1/questions`, `/api/v1/deck`, and `/api/v1/device-feed`. The PWA can notify while the page is open over SSE; full background push will require a later Web Push or always-on reminder service.

You can also fill the External API "Phone / remote base URL" setting, for example `http://<desktop-tailscale-ip>:48321`, then copy the generated phone device URL from the settings page.

See [docs/api.zh-CN.md](docs/api.zh-CN.md) for detailed API examples.

## AI And Local Knowledge

AI is disabled by default. When enabled, ToWrite calls an OpenAI-compatible `/chat/completions` endpoint configured by the user. It can summarize saved cards, suggest next actions, and rerank related local notes recalled from filenames, paths, tags, headings, frontmatter, and snippets.

After entering a Base URL and API key, use **Load models** to query the provider's `/models` endpoint, then choose a returned model or keep a manually entered compatible model id. **Test connection** makes a small real chat-completion request with the selected model and reports latency and the returned text.

The **Open AI assistant** command, ribbon button, and sidebar bot button open a native Obsidian chat surface. Assistant replies render with Obsidian's Markdown renderer and each reply can be switched back to its source text. Use `Ctrl/Cmd+Enter` to send and `Shift+Enter` for a new line. In Backend mode, type `/` to search the local Skill library and `@` to add one or more Agents; the selected model, Skill, and Agents remain visible above the composer.

The assistant supports model switching, persistent local history, a context inspector, and safe interactive choice cards. When a model genuinely needs a decision, the direct OpenAI-compatible path can call the `ask_user_choice` function tool; Backend replies use a bounded display-only choice marker. A choice never writes to the Vault by itself. Direct mode uses the configured OpenAI-compatible endpoint; Backend mode reuses the Backend model catalog, LiteLLM routing, Agent roster, Skills, and context-chat endpoints. The assistant shows the fields that will be sent before the user sends a message. History is also mirrored to the user-readable `.obsidian-open-questions/ai/conversations.json` file and can be cleared from the assistant.

ToWrite does not perform web search.

## Installation

### Community Plugins

After approval, install from Obsidian's Community Plugins directory by searching for `ToWrite Open Questions`.

### Manual Install

Download the release assets:

- `main.js`
- `manifest.json`
- `styles.css`

Place them in:

```text
<your-vault>/.obsidian/plugins/towrite-open-questions/
```

Restart Obsidian and enable `ToWrite Open Questions`.

If you used an early manual build in `.obsidian/plugins/obsidian-towrite/`, keep a backup of that folder before switching to the marketplace id.

## Development

```powershell
npm.cmd install
npm.cmd run test
npm.cmd run build
```

Build output is written to `dist/`.

Local Capture vault deployment:

```powershell
npm.cmd run deploy:capture
```

## Commands

- `Open questions sidebar`
- `Open question dashboard`
- `Open smart capture`
- `Open AI assistant`
- `Capture selection to a note or folder`
- `Refresh open question index`
- `Export open question JSON`
- `Add ToThink from selection`
- `Add ToWrite from selection`

## Privacy

Core indexing, the three-candidate capture recommender, and habit inference run locally inside Obsidian. Learning, External API, notifications, AI, Device Hub, and the Obsidian AI Backend integration are opt-in. API tokens, AI API keys, the Device Hub Receiver token, Receiver private key, and opaque-reference secret are stored in local Obsidian plugin data and are not written to exported JSON. Obsidian plugin data is not an encrypted secret store. The Backend token is sent in the `X-Capture-Token` header; Device Hub credentials are sent in authorization headers, never in the Tap URL.

Because ToWrite stores selected source text, source paths, and optional learning events in sidecar JSON and export files, treat those files as part of your private vault data. Read [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) before enabling remote access or optional network services.

## License

The ToWrite Open Questions plugin is MIT licensed. See [LICENSE](LICENSE).

The optional Obsidian AI Backend is a separate project with its own license terms. The plugin's MIT license does not grant rights to Backend code or hosted services; consult the Backend distribution's `LICENSE` and commercial-license documents.

For the new ESP32/eink integration, see [Device Hub V1](docs/device-hub-protocol.md). The older local feed remains documented in the Chinese [device-feed compatibility guide](docs/device-feed-protocol.zh-CN.md).
