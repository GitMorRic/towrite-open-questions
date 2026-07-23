# Today Dashboard and Daily Plan

[简体中文](daily-dashboard.zh-CN.md)

ToWrite keeps daily planning separate from the all-vault status index:

- **Today** shows the current day’s plan, writing/activity counters, completed work, scheduled device cards, a deterministic summary, and a 2.7-inch display preview.
- **All status** shows complete-index counts by Workflow stage, Article Type, Inbox state, stale state, and ToThink/ToWrite status. These counts are not derived from the current day’s plan.
- The sidebar contains only a compact Today summary and an entry point to the Dashboard. Today counts are not added to the existing All/ToThink/ToWrite/Inbox counters.

Daily planning works without AI and without the optional Backend. AI is off by default and may only rewrite a summary from the same structured counters and plan labels; it does not calculate statistics, add tasks, complete tasks, or change device state.

## Markdown is the source of truth

The default daily note is `Daily/YYYY-MM-DD.md`. ToWrite reads Tasks-compatible checkboxes from the configured `## ToDo` section:

```markdown
## ToDo

- [ ] Add evidence to [[Writing notes]] ⏳ 2026-07-23 📅 2026-07-23
  [towrite-kind:: edit_note] [towrite-device:: scheduled]
  ^daily_r4nd0m
```

The current contract is `towrite-daily-plan/v1`:

| Field | Values | Meaning |
| --- | --- | --- |
| Checkbox | `[ ]`, `[/]`, `[x]` | To do, in progress, or complete. |
| `towrite-kind` | `task`, `create_note`, `edit_note`, `send_card` | What the item represents. |
| `towrite-device` | `none`, `manual`, `scheduled`, `rotation`, `agent` | Whether and how the item may enter the device queue. |
| `towrite-at` | A local ISO date-time | One-time scheduled display time. |
| Tasks priority | `🔺`, `⏫`, `🔼`, `🔽`, `⏬` | Highest, high, normal, low, or lowest. Priority affects only items already opted into device/Agent selection. |
| `⏳` / `📅` | `YYYY-MM-DD` | Scheduled and due dates compatible with common Tasks syntax. |
| `✅` | `YYYY-MM-DD` | Written when the item is explicitly completed. |
| Block ID | `^daily_<random>` | Stable identity used for idempotency and conflict checks. |

Users may edit this Markdown directly. Metadata and the block ID may be inline or use the indented continuation form above. Every mutation compares the task revision derived from its source path, block ID, and complete logical task block. If that block changed after the Dashboard, NFC page, or device card loaded it, ToWrite returns a conflict instead of completing or rewriting a different task.

Completing a daily item checks its checkbox and writes the completion date. It does not automatically advance a linked note’s Workflow stage.

The deterministic summary is previewed before it is written idempotently to the configured `## 今日总结` (or custom) section. AI wording may reference only plugin-owned metric placeholders; any extra number, unknown placeholder, or non-JSON response is rejected and falls back to the deterministic summary.

## Activity counters and privacy

Activity tracking is independent of habit learning and can be paused or cleared without changing Daily Markdown.

- A **writing unit** is one visible CJK character or one Latin word after Markdown markup is removed.
- **Positive units** add only growth between deferred measurements; **net units** include deletions.
- New notes, uniquely modified notes, completed tasks, resolved questions, Capture commits, selected cards, and displayed cards are counted as structured events.
- Measurements run after debounced Vault changes. The editor keystroke path does not read the full document, perform network requests, or count individual keys.
- Tracking begins when the feature is enabled. Earlier activity is not reconstructed and the Dashboard marks the tracking boundary.
- Raw, content-free activity events are retained for 30 days by default (configurable from 1 to 365 days). Daily aggregates remain until the user clears them.
- Activity events do not contain note bodies, selections, clipboard content, audio, or individual keystrokes. Local file keys and opaque item IDs may still be sensitive metadata.

Settings provide user-readable export and one-click clearing for events, aggregates, and measurement baselines. Clearing metrics does not remove daily notes or tasks.

## Device cards and safe completion

Daily items can become `daily_plan_item` cards and summaries can become `daily_summary` cards. The rule-based order is:

1. a manually fixed item;
2. an overdue item;
3. a due one-time schedule;
4. a high-priority Today item;
5. rotation items.

The summary-card policy defaults to **do not send**. Settings can opt it into manual, rotation, or Agent selection, and the Today panel can send one explicit preview. Until the user enables one of those paths, summary cards and built-in samples do not enter the real queue.

Quiet hours may update the display silently, while do-not-disturb freezes automatic card changes. Test/example cards never enter the real queue.

`selected` remains the desired server state and `displayed` advances only after a matching display ACK. NFC and completion resolve `displayed` before a newer `selected` value, so a phone action still targets the card physically visible on the screen.

A device completion request must carry `eventId`, `cardId`, `stateVersion`, and `playlistRevision`. ToWrite accepts it only when:

- the card is still the current displayed card;
- it is a `daily_plan_item`;
- the display state and playlist revision still match; and
- the task’s Markdown revision has not changed.

Duplicate events are idempotent. A late event, an event sent after paging, or a changed task returns `409 Conflict`. On success the task leaves the pending queue and the next eligible card can be selected.

Existing firmware remains compatible with generic card rendering and previous/next paging. It must **not** show or send a completion action until it implements the four-field guarded-completion contract above.

## Capture Bridge v2

`towrite-capture-bridge/v1` remains available for text capture. Version 2 negotiates these optional capabilities:

- `textCapture`
- `voiceCapture`
- `assetUpload`
- `taskComplete`
- `availableOperations`

The NFC page can expose record, complete, and later actions for the frozen displayed card. Browser speech-to-text uses the operating system/browser speech input. Raw recording uses `MediaRecorder` only after the user explicitly starts recording and grants microphone access.

Audio is staged temporarily and committed to the configured Vault attachment folder through ToWrite. If transcription is unavailable or fails, the original recording can still be saved and linked as pending transcription. Audio is not sent to an AI provider without a separate authorization. Undo removes an unchanged inserted block, and removes an unchanged attachment only when no other note references it.

An older Capture plugin is detected through capability negotiation. ToWrite falls back to the v1 text flow and does not pretend that recording or task completion is available.

## One DailyOps writer

The Daily settings expose three writer modes:

| Mode | Behavior |
| --- | --- |
| `local` | The Obsidian plugin is always the Markdown writer. |
| `auto` | ToWrite delegates only when a trusted Backend reports `towrite-daily-ops/v1`, the same `towrite-daily-plan/v1` contract, writer capability, and matching folder/format/heading settings. If the Backend is offline or incompatible, the plugin uses the local writer. |
| `backend` | The Backend must pass the same handshake. If it is unavailable or mismatched, the operation stops with an error instead of silently creating a second writer. |

The handshake chooses one writer for each operation; ToWrite does not concurrently write the same task through both paths. Markdown and stable task IDs/revisions remain authoritative in every mode.

## Versioned local API

When the authenticated External API is enabled, the Daily V1 surface is:

```text
GET   /api/v1/daily/today
GET   /api/v1/daily/summary
POST  /api/v1/daily/items
PATCH /api/v1/daily/items/{id}
POST  /api/v1/daily/items/{id}/complete
POST  /api/v1/daily/summary/write-back
```

Mutation requests use the current task revision. Authentication and the normal External API network-exposure guidance still apply.

## Verification checklist

Release testing covers:

- local create, edit, complete, reopen, summary preview/writeback, export, and clear;
- manual Markdown edits and stale-revision `409` behavior;
- positive/net writing units without synchronous editor-path I/O;
- displayed A / selected B NFC and completion targeting;
- duplicate, stale, late, and post-page device completion events;
- Capture Bridge v1 fallback and v2 capability/permission boundaries;
- Backend writer handshake, `auto` offline fallback, and strict `backend` failure;
- legacy ToThink/ToWrite, Inbox, Echo, Quote0, External API, and paging compatibility.
