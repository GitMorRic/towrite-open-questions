# ToWrite Open Questions Privacy

[简体中文](PRIVACY.zh-CN.md)

Last updated: 2026-07-12

This document describes the ToWrite Open Questions Obsidian plugin. The optional Obsidian AI Backend, OpenAI-compatible providers, Quote0/Dot services, tunnels, and sync providers are separate systems with their own privacy terms.

## Local-First Defaults

- ToThink/ToWrite indexing, three-candidate capture recommendation, capture preview, and habit inference run inside Obsidian Desktop.
- Habit learning, proactive notifications, External API, AI, and Obsidian AI Backend integration are opt-in. The Backend integration and notifications are disabled by default.
- ToWrite does not include vendor analytics, advertising identifiers, or a ToWrite-operated telemetry service.
- Saving a capture writes only to the destination you confirm: an eligible existing note, a new note in a recommended folder or Workflow stage, or the configured Inbox.

## Vault And Plugin Data

ToWrite may store selected source text, PDF excerpts, titles, notes, tags, statuses, source paths, Workflow classifications, frontmatter, capture metadata, and card state in Obsidian plugin data and in the configured export directory.

When habit learning is enabled, ToWrite also maintains:

```text
.obsidian-open-questions/learning/events.jsonl
.obsidian-open-questions/learning/habits.json
```

The plugin's local data may contain the same learning state. These files are user-readable and can be exported or cleared from settings. Treat the plugin data file and `.obsidian-open-questions/` as private Vault data; Vault sync or backup software may copy them according to that software's configuration.

## Learning Data Boundary

Learning is disabled by default. If enabled, only allow-listed structural events are retained:

- file switches and coarse edit-presence periods;
- timestamps, timezone offset, and applicable Article Type or Workflow stage;
- the locally suggested and explicitly selected capture destination;
- question actions such as opened, answered, resolved, ignored, or reminded;
- explicit suggestion feedback such as accepted, edited, dismissed, postponed, or opened.

Raw local events can contain Vault-relative file paths and opaque question, capture, target, or suggestion identifiers. Derived work-session summaries and inferred habit rules omit precise file paths.

Learning events deliberately do not contain note bodies, capture bodies, selected text, clipboard contents, individual keystrokes, keystroke counts, contacts, network history, or physical location. Edit activity is coalesced into coarse presence periods instead of a per-change log.

Raw learning events are automatically purged after 30 days. Pending, accepted, and dismissed habit records—including their aggregate evidence—remain until the user clears them. Clearing learning data removes events and learned habit records; manually configured Push rules are separate.

Inference can only create a pending habit candidate. A candidate affects capture routing or habit notifications only after the user explicitly accepts it. Dismissing or postponing a candidate does not silently activate it.

## Local Capture Recommendations

ToWrite searches only the locally eligible Markdown scope. Include-folder settings are applied first; excluded folders, excluded tags, and truthy excluded frontmatter keys remove a note before local scoring or optional Backend processing.

The modal displays at most three candidates. A late optional rerank does not replace a destination the user has already selected. The user sees the final path and preview before saving.

## Optional Obsidian AI Backend

The Backend is not required. When target reranking is enabled, ToWrite sends the configured Backend:

- protocol version, capture id, and intent;
- optional title and up to 20 tags;
- coarse source flags (whether a source file or question exists), heading depth, and entry point;
- only the locally filtered candidate ids, kinds, actions, headings, stages, scores, confidence levels, and reasons.

The capture body, selected text, detected links, exact source-file path, candidate paths, heading names from the source, and question id are not included in the Backend reranking request. The candidate allow-list is built only after the local include/exclude and privacy filters have removed ineligible notes.

The Backend response can reorder or relabel those candidate ids, but the plugin ignores unknown ids; the Backend cannot introduce an arbitrary Vault destination through this interface.

Backend habit-suggestion wording is a separate switch and is disabled by default. When enabled, it sends aggregate evidence rather than raw learning events or note content. The local rule and pending/accepted/dismissed status remain authoritative; a Backend response cannot accept a habit.

The Backend access token is stored in Obsidian plugin data and sent in the `X-Capture-Token` header. It is not placed in Backend URLs or learning exports. Obsidian plugin data is not an encrypted secret store, so protect the Vault and any synced plugin data.

## Other Optional Network Features

- OpenAI-compatible AI is disabled by default. When enabled, card content needed for the requested summary or recommendation is sent to the endpoint configured by the user.
- External API is disabled by default and normally binds to `127.0.0.1`. Enabling LAN/tunnel access makes the selected API data reachable according to the user's token and network controls.
- Quote0, Push targets, and remote input send data only after the user configures those services and destinations.
- ToWrite does not perform web search on its own.

## Notifications

Proactive notifications are disabled by default. New habit candidates stay silent in the sidebar. When notifications are enabled, only due reminders and confirmed habits are eligible. The default quiet period is `23:00-08:00`, and the default limit is three habit notifications per day. Notification text can be visible on screen and may reveal a title or trigger reason to someone nearby.

## User Controls

Users can:

- leave learning, notifications, Backend, AI, and External API disabled;
- pause learning collection;
- inspect evidence before accepting a habit;
- edit, dismiss, or postpone a habit candidate;
- constrain capture indexing with include/exclude folders, tags, and frontmatter;
- export learning events and habits in user-readable formats;
- clear all learning events, candidates, and accepted learned habits.

For deployment and token guidance, see [SECURITY.md](SECURITY.md).
