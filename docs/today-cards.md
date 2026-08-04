# Today summary, Task Pool, and synced cards

ToWrite separates work committed to today from work that may be scheduled later:

- **Today** reads the configured Daily plan, which defaults to `Daily/YYYY-MM-DD.md`.
- **Task Pool** defaults to `Planning/Task Pool.md`. Incomplete checkboxes in ordinary notes are registered there after save. Scheduling one creates a linked Daily assignment instead of an unrelated duplicate.
- The sidebar, Dashboard, floating window, embedded cards, and progress counters all read the same state.

## Quick access

Use the Obsidian command palette:

- `ToWrite: Today: open dashboard`
- `ToWrite: Workbench: open work pool`
- `ToWrite: Focus Now: open floating window`

The Focus ribbon icon opens Focus Now. Focus mode shows the current task and timer; compact mode shows the Today list. Its message strip rotates the Daily focus, custom lines, and Inbox/question reminders. Configure custom lines and the interval in ToWrite's Daily settings.

Pinning protects the Obsidian leaf from replacement; it is not an operating-system always-on-top permission.

## Embed Today in any note

Run `ToWrite: Today: insert synced card into note`, or add:

````markdown
```towrite-today
mode: list
limit: 3
```
````

The rendered card shows the theme, completed/total count, progress, and the current and next tasks. It can open or complete tasks and provides shortcuts to the full Dashboard and floating window. It is a synchronized view, not a copy of the tasks.

Options:

- `mode: compact`
- `mode: list`
- `limit: 1` through `6`
- `show-completed: true`
