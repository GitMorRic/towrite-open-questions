# Today Dashboard and Daily Plan

[简体中文](daily-dashboard.zh-CN.md)

ToWrite keeps daily planning separate from the all-vault status index:

- **Today** is the planning surface for today or tomorrow. It shows the theme, current item, next two items, progress, ordering controls, planning candidates, and a 2.7-inch display preview.
- **Data and retrospective** is a secondary area inside Today for writing/activity counters, completed work, scheduled cards, and deterministic summaries. These measurements do not crowd the e-ink overview.
- **All status** shows complete-index counts by Workflow stage, Article Type, Inbox state, stale state, and ToThink/ToWrite status. These counts are not derived from the current plan.
- The sidebar contains only a compact Today summary and a Dashboard entry point. Today counts are not added to the existing All/ToThink/ToWrite/Inbox counters.

Daily planning works without AI and without the optional Backend. AI is off by default and may reorder planning candidates or rewrite a summary from the same structured data. It cannot calculate statistics, add or complete tasks, or change device state.

## Markdown is the source of truth

The Daily Plan V2 contract is `towrite-daily-plan/v2`. Settings select exactly one plan source:

1. **Daily notes** (default): `Daily/YYYY-MM-DD.md`.
2. **Fixed planning document**: `Planning/Daily Plans.md` by default, with one `## YYYY-MM-DD` section per date.

Existing installations continue to use their configured daily-note location. ToWrite does not move old plans automatically. The Dashboard provides a Today/Tomorrow switch, opens the active Markdown source, and writes every edit back to that same source.

The configured plan heading defaults to `## 今日计划`, with a Tasks-compatible `## ToDo` section. A complete V2 item looks like this:

```markdown
## 今日计划

[towrite-theme:: Advance Echo MVP]

## ToDo

- [ ] Write the MVP experiment plan 🔺 📅 2026-07-24
  [towrite-kind:: edit_note] [towrite-device:: rotation]
  [towrite-primary:: true] [towrite-minimum:: true]
  [towrite-goal:: Decide whether an ambient display is more effective than a software Todo]
  [towrite-next:: List the A/B metrics and success threshold]
  [towrite-estimate:: 15m]
  [towrite-target:: [[Echo MVP]]]
  ^daily_r4nd0m
```

| Field | Values | Meaning |
| --- | --- | --- |
| Checkbox | `[ ]`, `[/]`, `[x]` | To do, the unique current item, or complete. |
| `towrite-kind` | `task`, `create_note`, `edit_note`, `send_card` | What the item represents. |
| `towrite-device` | `none`, `manual`, `scheduled`, `rotation`, `agent` | Whether and how the item may enter the device queue. |
| `towrite-at` | A local ISO date-time | One-time scheduled display time. |
| `towrite-theme` | Free text on the plan | The day’s short theme, not a duplicate task. |
| `towrite-primary` | `true` | Marks at most one primary item. If absent, the first incomplete item is primary. |
| `towrite-minimum` | `true` | Marks at most one “complete this even if the day is disrupted” item. |
| `towrite-goal` | Free text | The result or reason for doing the item. |
| `towrite-next` | Free text | The smallest concrete next step shown on the overview and task card. |
| `towrite-estimate` | A duration such as `15m` | An estimate, not tracked keystroke time. |
| `towrite-target` | A wikilink or safe local Markdown link | The explicit note to open. If absent, target inheritance is resolved as described below. |
| Tasks priority | `🔺`, `⏫`, `🔼`, `🔽`, `⏬` | Highest, high, normal, low, or lowest. Priority affects only items already opted into device/Agent selection. |
| `⏳` / `📅` | `YYYY-MM-DD` | Scheduled and due dates compatible with common Tasks syntax. |
| `✅` | `YYYY-MM-DD` | Written when the item is explicitly completed. |
| Block ID | `^daily_<random>` | Stable identity used for idempotency and conflict checks. |

Markdown order is device order. Starting an item atomically changes it to `[/]` and restores every other `[/]` item in that day to `[ ]`. Completing an item changes it to `[x]`. Runtime start, pause, resume, and completion timestamps are not written into the task body; completion never advances a linked note’s Workflow stage.

Users may edit the Markdown directly. Metadata and the block ID may be inline or use indented continuation lines. ToWrite preserves unknown descriptions, nested lists, and user-authored text beneath a task; it changes only the checkbox and fields it owns. Every mutation uses a revision derived from the source, block ID, and the **complete logical task block**. If any part changed after the Dashboard, NFC page, or device card loaded it, ToWrite returns a conflict rather than rewriting a newer task.

A missing or duplicated `^daily_*` block ID is reported as a diagnostic and that task is not mutated. ToWrite never silently chooses a matching-looking line. Unfinished items are not automatically carried into the next day; the user explicitly moves them, returns them to the project pool, or stops tracking them.

## Hierarchical lists, normalization, and targets

Inside the configured `## ToDo` scope, a numbered or bulleted item with children is a group/category and does not count as a task. A leaf list item is a task candidate. A checkbox item is always a task, including a checkbox nested under another checkbox. Indented prose without a list marker remains an explanation of the preceding task.

The target resolver is shared by the Dashboard, desktop buttons, e-ink cards, Hub commands, NFC, and Capture:

1. explicit `towrite-target`;
2. a safe note link on the task itself;
3. the nearest ancestor group’s note link;
4. the task’s own `^daily_*` block in the plan source;
5. the Today Dashboard.

Wikilinks may include aliases, headings, and blocks. Safe relative `.md` links support spaces, commas, and CJK names. Web URLs, attachments, and unsafe paths are never treated as writable task targets. Every task also carries a `lineageRevision`; changing an inherited parent target after a card or NFC page was loaded therefore returns `409` instead of silently opening a different note.

“Normalize this plan” first shows the detected groups and leaf tasks, inherited targets, broken links, and the exact Markdown diff. Only explicit confirmation converts leaf items to checkboxes and gives them 128-bit random `^daily_*` IDs. Groups, indentation, links, explanations, and unknown content remain intact. A full-document revision protects apply and undo. Legacy timing-looking text is only shown as a suggestion and is never deleted or interpreted without confirmation.

## Task timing ledger

Optional task timing is recorded in the user-readable, content-free ledger:

```text
.obsidian-open-questions/daily/task-timer-events.jsonl
```

Each transition stores opaque task/session/event IDs, `start` / `pause` / `resume` / `complete` / `reopen` / `correct` / `reset`, an absolute timestamp with timezone, and its source. It stores no task body or Vault path. Only transitions write the ledger; the UI can refresh an in-memory elapsed time without writing every second.

Only one task may run at a time. Starting or resuming another task atomically pauses the previous one. The Dashboard shows active time, total span, interruption count, and estimate variance, and exposes session history plus explicit timestamp correction. Open sessions crossing midnight or exceeding the configured review threshold (four hours by default) require confirmation instead of accumulating indefinitely. The ledger is independent of the 30-day activity log and can be viewed, exported, archived, or cleared after confirmation.

ToThink, ToWrite, Inbox, and stale/Echo entries appear as planning candidates. Adding one to Today or Tomorrow is always an explicit user action. Optional AI may reorder that candidate list but cannot make a commitment on the user’s behalf.

The deterministic summary is previewed before it is written idempotently to the configured `## 今日总结` (or custom) section. ToWrite manages only its marker-delimited summary block and never overwrites text outside those markers. AI wording may reference only plugin-owned metric placeholders; invalid output falls back to the deterministic summary.

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

## Three-page e-ink deck and three-button gestures

Every day produces three page types:

1. `daily_overview`: date, theme, current item, the next two items, the current item’s smallest next step, and completed/total progress.
2. `daily_plan_item`: one card for every planned item, with its goal, next step, estimate, and start time.
3. `daily_result`: completed and remaining items. It intentionally omits word counts, note counts, and the all-vault backlog.

The default physical controls are:

- left/right short press: move among Overview, Task, and Result;
- left/right double press: previous/next task while on a Task page;
- left long press: start an unstarted task, resume a paused task, or pause a running task;
- right long press: safely complete the displayed task, only from a Task page;
- main single press: on Overview, atomically start the current item and open its target in desktop Obsidian; on Task, open that task target; on Result, open the plan source;
- main double press: open a create-only Capture modal with the displayed context. Cancelling it creates no empty file;
- main long press: return `recording_not_available`. Hardware recording is reserved but is not presented as successful in V1.

Firmware waits for the double-click window before emitting a single click, debounces for about 45 ms, recognizes double clicks within about 320 ms, and recognizes a long press at about 700 ms. It updates its local displayed tuple only after the screen refresh and matching display ACK succeed.

`selected` remains the desired server state; `displayed` advances only after a matching display ACK. Every V2 gesture carries `eventId`, `deviceId`, `selectionId`, `stateVersion`, `contentId`, `revisionId`, `button`, and `gesture`; local mode also carries `cardId` and `playlistRevision`. Open, create, complete, and NFC operations use the real `displayed` tuple and never fall forward to a newer `selected` card.

Open/create commands expire after about 30 seconds. The Connector records the event ID before a desktop UI side effect so a retry cannot open multiple notes or Capture dialogs. If Obsidian is offline, an old command is not replayed hours later. A failed attempt to focus a minimized desktop window does not roll back the already-started task; the device receives an explicit status.

For completion, ToWrite additionally requires the task’s full Markdown-block revision to match. Duplicate events are idempotent. A late event, post-page event, stale displayed tuple, or changed task returns a conflict. Old gesture schemas remain compatible for paging but cannot trigger desktop opening side effects.

Phone NFC keeps the same displayed-first rule: it freezes the physically visible card and opens the Capture PWA. A remote button does not promise to foreground a phone.

## Capture Bridge v2

`towrite-capture-bridge/v1` remains available for text capture. Version 2 negotiates these optional capabilities:

- `textCapture`
- `createOnlyCapture`
- `voiceCapture`
- `assetUpload`
- `taskComplete`
- `availableOperations`

The create-only desktop flow receives the displayed card context but does not create a file until the user submits. The NFC page can expose record, complete, and later actions for the frozen displayed card. Browser speech-to-text uses the operating system/browser speech input. Raw recording uses `MediaRecorder` only after the user explicitly starts recording and grants microphone access.

Audio is staged temporarily and committed to the configured Vault attachment folder through ToWrite. If transcription is unavailable or fails, the original recording can still be saved and linked as pending transcription. Audio is not sent to an AI provider without separate authorization. Undo removes an unchanged inserted block, and removes an unchanged attachment only when no other note references it.

An older Capture plugin is detected through capability negotiation. ToWrite falls back to the v1 text flow and does not pretend that create-only capture, recording, or task completion is available.

## One DailyOps V2 writer

The Daily settings expose three writer modes:

| Mode | Behavior |
| --- | --- |
| `local` | The Obsidian plugin is always the Markdown writer. |
| `auto` | ToWrite delegates only when a trusted Backend reports `towrite-daily-ops/v2`, the `towrite-daily-plan/v2` contract, writer capability, and the same plan source, document/root, format, and headings. If the Backend is offline or incompatible, the plugin uses the local writer. |
| `backend` | The Backend must pass the same handshake. If it is unavailable or mismatched, the operation stops with an error instead of silently creating a second writer. |

The V2 handshake supports both the date-based daily-note source and the fixed planning document with date sections. V1 plans remain readable for migration, but V2 delegated writes require a V2 handshake. The handshake chooses one writer for each operation; ToWrite does not concurrently write the same task through both paths. Markdown and stable task IDs/full-block revisions remain authoritative in every mode.

## Versioned local API

When the authenticated External API is enabled, the Daily V2 surface includes:

```text
GET   /api/v1/daily/today
GET   /api/v1/daily/plans/{date}
PATCH /api/v1/daily/plans/{date}
POST  /api/v1/daily/plans/{date}/normalization-preview
POST  /api/v1/daily/plans/{date}/normalize
GET   /api/v1/daily/summary
POST  /api/v1/daily/items
PATCH /api/v1/daily/items/{id}
POST  /api/v1/daily/items/{id}/start
POST  /api/v1/daily/items/{id}/pause
POST  /api/v1/daily/items/{id}/resume
POST  /api/v1/daily/items/{id}/complete
GET   /api/v1/daily/items/{id}/timing
PATCH /api/v1/daily/items/{id}/timing
POST  /api/v1/daily/summary/write-back
POST  /api/v1/device/display-acks
POST  /api/v1/device/events
```

Mutation requests use the current full logical task-block revision. Device gesture V2 requires the acknowledged displayed tuple; the old device-event schema does not trigger desktop UI side effects. Authentication and the normal External API network-exposure guidance still apply.

## Verification checklist

Release testing covers:

- both daily-note and fixed-document sources, Today/Tomorrow editing, date rollover, ordering, primary/minimum selection, and no automatic carryover;
- local create, edit, start, pause, resume, complete, reopen, correction, summary preview/writeback, export, archive, and clear;
- hierarchical grouping, target inheritance, normalization preview/undo, preservation of unknown task-block content, duplicate/missing block-ID diagnostics, and atomic unique `[/]`;
- manual Markdown edits and stale full-block/lineage/timing revision `409` behavior;
- positive/net writing units without synchronous editor-path I/O;
- the three-page snapshot and legacy generic-card rendering;
- click/double-click/long-press disambiguation, debounce, and right-long completion guards;
- displayed A / selected B open, create, NFC, and completion targeting;
- duplicate, stale, late, expired, and post-page device events;
- Capture Bridge v1 fallback and v2 capability/permission boundaries;
- Backend V2 writer handshake for both sources, `auto` offline fallback, and strict `backend` failure;
- legacy ToThink/ToWrite, Inbox, Echo, Quote0, External API, and paging compatibility.
