# ToWrite Open Questions

[简体中文](README.zh-CN.md)

ToWrite is a desktop-only Obsidian workspace for turning unfinished notes, open questions, and ordinary Markdown checkboxes into a calm daily plan. Markdown remains the source of truth: you can keep writing in Daily Notes and use the Workbench only when you want to arrange, start, complete, or review work.

![ToWrite sidebar and source controls](docs/assets/sidebar-current-note%20and%20selection-toolbar.png)

## Three-minute start

1. Enable ToWrite in **Settings → Community plugins**.
2. Run **ToWrite: Open workspace** from the command palette.
3. Open today's Daily Note and write normal Markdown tasks.
4. Return to **Today** to start one task, or use **Work pool** to arrange existing notes and questions.
5. Open **Journal** to review completed, migrated, returned, and abandoned work.

ToWrite follows Obsidian's Daily Notes folder, filename format, and template when the core Daily Notes plugin is configured. A custom Daily folder remains available in ToWrite settings.

## Write naturally in Daily Notes

No technical metadata is inserted while you type or while the Dashboard refreshes.

```md
## ToDo

- [ ] Project
  1. [[Echo MVP]]
  2. [[Release notes]]

- [ ] Writing
  - [ ] Draft the introduction
  - [ ] Verify the examples
```

- A checkbox with ordinary numbered/link children is a category and does not count toward progress.
- A nested checkbox is a task; a checkbox parent may also be a task.
- A numbered link under a category can appear as a leaf work item, but unrelated ordinary lists are ignored.
- A task link opens its own note; otherwise it can inherit the nearest category note.
- An explicit `towrite-kind:: task` overrides category inference.

Tasks without an ID use an in-memory reference. Only an explicit action—start, complete, edit properties, migrate, send to a device, or add to the pool—materializes a stable `^daily_*` ID on the same verified line. If the line changed, the action is cancelled instead of writing beside another task.

## One workbench, four views

### Today

Shows today's ordered plan, current focus, project-colored progress, previous-day migration, and the optional 2.7-inch e-ink preview. The complete list stays in Markdown order.

### Work pool

Combines active Markdown tasks, ToThink/ToWrite questions, Inbox notes, and Workflow notes without copying them into one database. Saved views can group by project, source, stage, article type, note, or native status.

### Status

Explains and summarizes Workflow stages, Article Types, question states, Inbox, and tags. It is an analysis view; source notes remain authoritative.

### Journal

Shows daily and calendar-month totals for planned/completed tasks, active and paused time, interruptions, migrations, returns, and abandoned work. Transition events are stored locally in readable JSONL. A confirmed write-back updates only the marked `ToWrite Journal` block in the Daily Note.

## Focus Now

Run **ToWrite: Focus Now: open floating window** for a pinned Obsidian leaf containing only the current task and compact Today summary. Clicking a task starts or resumes it and opens the resolved note, heading, block, or safe HTTPS target. **Later** pauses timing and stores a local reading checkpoint.

Use **ToWrite: Locate current focused task** from the command palette or bind your own hotkey. Double-clicking blank space in a Markdown editor performs the same action; links and selected text are not intercepted.

## ToThink and ToWrite annotations

Select Markdown or PDF text and create a ToThink/ToWrite card. Cards can jump back to their source, keep notes in a sidecar without rewriting the document, and participate in the Work pool and device candidate list. The original annotation workflow remains available alongside Daily planning.

## Markdown truth and private metadata

- Notes, Daily plans, checkboxes, frontmatter, and readable JSON/JSONL are authoritative.
- `^daily_*`, `^task_*`, and `towrite-*` fields exist only for stable references and conflict-safe updates.
- Technical fields are atomic and hidden in Source, Live Preview, and Reading views unless the debug setting is enabled.
- ToWrite does not record keystrokes or upload note bodies for activity statistics.
- API keys and long-lived tokens are stored with Obsidian SecretStorage (Obsidian 1.11.4+), not in plugin `data.json`.

## Optional connections and disclosure

All network features are off by default.

| Feature | Default | Data sent when enabled |
| --- | --- | --- |
| OpenAI-compatible AI | Off | The previewed fields and local candidate IDs needed for the selected action |
| Trusted Backend | Off | Privacy-filtered candidate metadata; it cannot invent Vault paths |
| External API | Off | Data requested by an authenticated local client |
| Device Hub / NFC | Off | Approved display-card snapshots and opaque source references |
| Quote0 / Push targets | Off | The selected card or dashboard payload |

Full protocols and setup guides live in [`docs/`](docs/):

- [Daily Dashboard and Markdown contract](docs/daily-dashboard.md)
- [Navigation adapters](docs/navigation-adapters.md)
- [Device Hub protocol](docs/device-hub-protocol.md)
- [NTAG213 / NFC Tools](docs/ntag213-nfc-tools.md)
- [External API (Chinese)](docs/api.zh-CN.md)

## Compatibility and installation

- Obsidian **1.11.4 or newer**
- Desktop only (`isDesktopOnly: true`)
- Windows, macOS, and Linux desktop builds supported by Obsidian

Install from **Community plugins** by searching for **ToWrite Open Questions**. For manual installation, copy `main.js`, `manifest.json`, and `styles.css` from a release into:

```text
<vault>/.obsidian/plugins/towrite-open-questions/
```

## Troubleshooting

- **Today is empty:** confirm the selected Daily Note source and that tasks are inside the configured ToDo section or supported free-form Daily area.
- **A task changed before an action:** refresh; ToWrite deliberately refuses stale writes.
- **A link does not open:** use a valid `[[wikilink]]` or relative Markdown link and check for duplicate note names.
- **Typing feels slow:** disable optional editor suggestions or reduce Work pool include rules; indexing and network work are debounced and never run in the key handler.
- **Technical fields are visible:** run the repair command and ensure the debug “show technical fields” setting is off.

See [marketplace submission notes](docs/marketplace-submission.md), [security policy](SECURITY.md), and [privacy policy](PRIVACY.md) before reporting sensitive issues.

## Development

```bash
npm ci
npm test
npm run typecheck
npm run build
```

The production build validates package/manifest/versions consistency, required release assets, and a 2 MiB `main.js` limit.

## License

MIT. See [LICENSE](LICENSE). Optional Backend software is distributed separately under its own license.
