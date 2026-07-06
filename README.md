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
- Export JSON for dashboards, desktop widgets, scripts, and eink devices.
- Run an optional local desktop HTTP API for JSON, RSS, SSE events, dashboard views, mobile device previews, companion phone input, and note/status/capture writeback.
- Run optional OpenAI-compatible summaries and local-note recommendations after you configure your own endpoint.

## Screenshots

![Sidebar current note and selection toolbar](docs/assets/sidebar-current-note%20and%20selection-toolbar.png)

![Small-screen and External API overview](docs/assets/to-write-elink-api-overview.png)

![Web dashboard](docs/assets/to-write-web-dashboard.png)

## Desktop Only

This plugin is marked `isDesktopOnly: true` because the optional External API uses Node.js `http` to run a local server inside Obsidian Desktop. Core indexing is local-first, but the current marketplace build is desktop-only to comply with Obsidian community plugin review requirements.

## Quick Start

1. Open the ToWrite sidebar from the ribbon icon or command palette.
2. Select text in a Markdown note or PDF.
3. Click `Think` or `Write` in the floating toolbar.
4. Use the sidebar card to edit the title, note, status, and type.
5. Click the arrow on a card to jump back to the source.

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

## Data Files

ToWrite writes vault-readable JSON under the configured export directory:

```text
.obsidian-open-questions/
  index.json
  articles.json
  eink-compact.json
  workflows.json
  questions/
    <question-sidecar>.json
```

These exports may contain selected note text, PDF excerpts, titles, notes, tags, statuses, source paths, Workflow file summaries, frontmatter, and card metadata. Do not publish the export folder unless you intend to share that content.

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
GET   /device/input
POST  /api/v1/questions/<id>/status
POST  /api/v1/questions/<id>/notes
POST  /api/v1/captures
PATCH /api/v1/questions/<id>
```

Use `127.0.0.1` for local widgets. Use `0.0.0.0` only when you intentionally want LAN or tunnel access, and protect remote access with your own network controls such as Tailscale, Cloudflare Tunnel, a reverse proxy, HTTPS, or a firewall.

### Phone And Small-Screen Preview

If your phone and desktop are connected through Tailscale, set the External API bind host to `0.0.0.0`, enable query-token reads, then open:

```text
http://<desktop-tailscale-ip>:48321/device?token=<your-token>
```

`/device` simulates an eink or small-screen device. It calls `GET /api/v1/device-feed`, which returns a server-prepared view model for home, cards, next-card previews, workflow files, and source-note status pages. Supported profiles are `mobile-eink` for the phone/PWA preview, `eink-bw` for compact black-and-white eink devices, and `desktop-card` for denser desktop widgets. Clients can pass `width`, `height`, and `inches`; landscape screens receive a compact layout automatically.

Real eink hardware can stay simple: display the card, a QR/short link, or a hardware-button action. The companion `/device/input` page handles text input, mobile Web Speech dictation, tags, target folders, answering a card via `POST /api/v1/questions/<id>/notes`, or saving a standalone idea through `POST /api/v1/captures`. The phone preview also shows a direct `Voice` action so you can dictate a new idea without leaving the `/device` page.

The phone preview shows a five-key hint bar inside the simulated screen: `New Idea / Previous / Home + Voice / Next / Phone Input or current action`. Tap the center key to return home; long-press it to dictate a new idea and save it through Device Capture. On source-note pages, the right key becomes `Cards` and opens that note's filtered card queue. Real hardware can map the same labels to physical buttons around the display.

Cards can also store a manual `reminderAt` time. Reminder fields are exposed through `/api/v1/questions`, `/api/v1/deck`, and `/api/v1/device-feed`. The PWA can notify while the page is open over SSE; full background push will require a later Web Push or always-on reminder service.

You can also fill the External API "Phone / remote base URL" setting, for example `http://<desktop-tailscale-ip>:48321`, then copy the generated phone device URL from the settings page.

See [docs/api.zh-CN.md](docs/api.zh-CN.md) for detailed API examples.

## AI And Local Knowledge

AI is disabled by default. When enabled, ToWrite calls an OpenAI-compatible `/chat/completions` endpoint configured by the user. It can summarize saved cards, suggest next actions, and rerank related local notes recalled from filenames, paths, tags, headings, frontmatter, and snippets.

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
- `Refresh open question index`
- `Export open question JSON`
- `Add ToThink from selection`
- `Add ToWrite from selection`

## Privacy

Core indexing runs locally inside Obsidian. External API and AI features are opt-in. API tokens and AI API keys are stored in local Obsidian plugin data and are not written to exported JSON.

Because ToWrite stores selected source text in sidecar JSON and export files, treat those files as part of your private vault data.

## License

MIT. See [LICENSE](LICENSE).

For ESP32/e-ink integrations, see the Chinese device protocol guide: [docs/device-feed-protocol.zh-CN.md](docs/device-feed-protocol.zh-CN.md).