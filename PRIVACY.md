# ToWrite Open Questions Privacy

[简体中文](PRIVACY.zh-CN.md)

Last updated: 2026-07-19

This document describes the ToWrite Open Questions Obsidian plugin. The optional Device Hub, Obsidian AI Backend, OpenAI-compatible providers, Quote0/Dot services, tunnels, and sync providers are separate systems with their own privacy terms and operator policies.

## Local-First Defaults

- ToThink/ToWrite indexing, three-candidate capture recommendation, capture preview, and habit inference run inside Obsidian Desktop.
- Habit learning, proactive notifications, External API, AI, Device Hub, and Obsidian AI Backend integration are opt-in. Device Hub, Backend integration, and notifications are disabled by default.
- ToWrite does not include vendor analytics, advertising identifiers, or a ToWrite-operated telemetry service.
- Saving a capture writes only to the destination you confirm: an eligible existing note, a new note in a recommended folder or Workflow stage, or the configured Inbox.

## Vault And Plugin Data

ToWrite may store selected source text, PDF excerpts, titles, notes, tags, statuses, source paths, Workflow classifications, frontmatter, capture metadata, and card state in Obsidian plugin data and in the configured export directory.

When habit learning is enabled, ToWrite also maintains:

```text
.obsidian-open-questions/learning/events.jsonl
.obsidian-open-questions/learning/habits.json
```

When the AI assistant is used, its current local conversation is also mirrored in a user-readable file:

```text
.obsidian-open-questions/ai/conversations.json
```

The plugin's local data may contain the same learning state. These files are user-readable and can be exported or cleared from settings. Treat the plugin data file and `.obsidian-open-questions/` as private Vault data; Vault sync or backup software may copy them according to that software's configuration.

When Device Hub is configured, Obsidian plugin data can additionally contain the Hub base URL, Receiver ID and pull token, Receiver P-256 public/private JWK, opaque-reference HMAC secret, device ID, Tap URL, sync timestamps, and cached selected/displayed identifiers. These values are not written to the user-readable ToWrite export files, but Obsidian plugin data is ordinary local data rather than an encrypted operating-system keystore and may be copied by Vault sync or backup software.

The Hub onboarding access token is kept only in the in-memory setup form and is not added to persisted plugin settings. A newly provisioned or rotated `device_secret` is shown once for transfer to the ESP32 and is not persisted by ToWrite. Closing or clearing the setup form loses that one-time value.

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

For Device Hub recommendation reranking, the plugin sends at most 20 already-filtered candidate IDs, content types, bounded titles, reason codes, scores, coarse state/place/mode labels, and accepted-habit rule data. It deliberately omits display body, `write_target_ref`, Vault path, selection text, and pending habits. Unknown returned IDs are discarded and the local candidate objects remain authoritative.

## Optional Device Hub

Device Hub is disabled by default. Enabling it sends a separately deployed Hub only the data needed for an eink card and its delivery state. Before upload, the Connector applies the configured include/exclude folders, tags, and frontmatter rules and converts local source/write targets into keyed opaque references.

Depending on the selected settings and candidate, the Hub can receive:

- user, Receiver, device, binding, Tap, and mailbox identifiers;
- content type, bounded title, optional display body, prompt, allowed actions, reason code, score, expiry, and opaque source/write-target references;
- coarse context state, confidence, timestamps, TTL, manually entered semantic place/mode labels, and accepted-habit evidence;
- selected and displayed identifiers, state version, selection reason, display ACK status, render hash, firmware version, battery percentage, last-seen time, and explicit feedback;
- guest mailbox messages and their moderation/trust state when that feature is configured;
- PWA answer ciphertext, P-256/AES-GCM envelope metadata, an opaque frozen selection/content/write-target association, byte size, and expiry.

Display-card fields are plaintext at the Hub because the Hub and device must deliver and render them. Display body sharing is off by default; title, prompt, reason, and other approved card fields can still leave the Vault when sync is enabled. Inspect the send preview before enabling a public Hub.

PWA answer text is encrypted in the browser for the Receiver using ephemeral P-256 ECDH, HKDF-SHA256, and AES-256-GCM. The Hub stores ciphertext and routing/envelope metadata, not the answer plaintext or Receiver private key. This encryption does not hide the display card from the Hub, does not protect a compromised browser or Connector, and does not replace account login, CSRF checks, or idempotency.

The Tap URL contains only a revocable random `tap_id`. It contains no account token, Receiver token, device secret, content ID, or Vault path. Anyone who reads or copies the tag may view the approved frozen card, so the tag is not proof of physical presence. Writing an answer still requires an authenticated account session and the Tap-session CSRF value.

### Reference Hub retention and deletion

The current reference implementation has these V1 behaviors; another Hub operator may choose a stricter policy and must disclose it separately:

| Data | Current V1 behavior |
| --- | --- |
| Context observations, snapshots, and candidate batches | The reference cleanup worker physically removes rows beyond the 30-day cutoff. |
| Encrypted PWA Captures | Created with a 30-day expiry and omitted from pending delivery after expiry. The hourly cleanup worker physically removes expired pending/failed Captures and ACKed Captures after the configured shorter ACKed-retention interval. |
| Tap sessions | Stop authorizing writes after about five minutes or after successful consumption. Unlinked sessions are physically removed one day after expiry; a session linked to a Capture remains until that Capture/link is purged. |
| Content revisions, selections, ACKs, feedback, and mailbox records | Non-current delivery/audit rows use a 90-day hard-deletion cutoff. Rows still referenced by current selected/displayed state or a pending encrypted writeback are retained until the reference is released. |
| Device deletion/revocation | Immediately denies device authentication and revokes active bindings, Tap entries, device mailboxes, and sender keys. Historical delivery/audit rows may remain. |
| Account deletion | Revokes sessions/devices/Receivers, marks queued Captures deleted, and physically removes all Hub-domain rows for that account. Backups remain subject to the deployment operator's separately disclosed backup-expiry policy. |

The cleanup worker is a required service in the reference deployment; disabling it suspends physical retention cleanup. “30 days” applies to raw context/candidate data, not every Hub table. Operators must separately configure backup expiry, proxy/CDN logs, and deletion verification.

## Other Optional Network Features

- OpenAI-compatible AI is disabled by default. Loading models sends an authenticated `GET /models` request to the configured Base URL. Testing connectivity sends a small real chat-completion request with the selected model and may consume provider quota.
- Direct AI assistant requests are sent only after the user submits a message. The context inspector discloses the fields first. A direct request can include the user's message, recent local conversation history, the active Vault-relative note path and body (bounded to 12,000 characters), selected text (bounded to 4,000 characters), and bounded unresolved-question summaries.
- In Backend assistant mode, a request can include the active Vault-relative note path, selected text, unresolved-question summaries, recent history, and the selected Backend model, Skill path, or Agent ids. Loading the Skill library and Agent picker requests their user-visible catalogs from the configured Backend. The Backend may read the named note and may retain its own run logs or outputs according to its configuration and privacy terms.
- The direct assistant may expose the `ask_user_choice` function schema to a compatible model. The returned options are normalized and shown locally; selecting one adds the choice to local chat history and sends it in the next explicit assistant request. A choice card does not execute a Vault write or arbitrary tool.
- The capture-target reranking privacy boundary described above is unchanged: it does not receive note bodies or selected text. AI assistant chat is a separate, explicit user action with a separately disclosed payload.
- External API is disabled by default and normally binds to `127.0.0.1`. Enabling LAN/tunnel access makes the selected API data reachable according to the user's token and network controls.
- Quote0, Push targets, and remote input send data only after the user configures those services and destinations.
- ToWrite does not perform web search on its own.

## Notifications

Proactive notifications are disabled by default. New habit candidates stay silent in the sidebar. When notifications are enabled, only due reminders and confirmed habits are eligible. The default quiet period is `23:00-08:00`, and the default limit is three habit notifications per day. Notification text can be visible on screen and may reveal a title or trigger reason to someone nearby.

## User Controls

Users can:

- leave learning, notifications, Backend, AI, and External API disabled;
- leave Device Hub disabled, pause its background sync, or remove its local Receiver/device configuration;
- preview Device Hub candidate fields, keep display body sharing off, rotate the Receiver/device/Tap credentials, and revoke a copied Tap URL;
- pause learning collection;
- inspect evidence before accepting a habit;
- edit, dismiss, or postpone a habit candidate;
- constrain capture indexing with include/exclude folders, tags, and frontmatter;
- export learning events and habits in user-readable formats;
- clear all learning events, candidates, and accepted learned habits.
- inspect the AI assistant payload fields before sending and clear its local conversation history.

For deployment and token guidance, see [SECURITY.md](SECURITY.md).
