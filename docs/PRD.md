# ToWrite PRD

## Product Intent

ToWrite helps writers track unfinished thinking and unfinished writing inside Obsidian Markdown notes.
Its main unit is an open question, not a task. A question records what remains unresolved, where it appears, and what context future-you needs to continue.

ToWrite has two lanes:

- ToThink: unresolved reasoning, evidence, research, or decisions.
- ToWrite: unfinished writing, expansion, rewriting, or continuation.

## Target Users

- Technical writers collecting evidence and explanations.
- Researchers drafting notes with unresolved citations or experiments.
- Makers documenting hardware/software decisions.
- Writers who leave placeholders such as "add more here" and later lose the original context.

## Core User Stories

- As a writer, I can leave explicit open-question rules and see them in the sidebar.
- As a writer, I can get inline suggestions for trigger words without ToWrite saving them automatically.
- As a writer, I can select a passage and capture it as ToThink or ToWrite without editing the Markdown body.
- As a reader, I can select text in a PDF and capture a ToThink or ToWrite card attached to that PDF.
- As a reviewer, I can open a note and immediately see what is still unresolved in that note.
- As a dashboard builder, I can read exported JSON and show blocked articles elsewhere.

## V1 Scope

- Markdown-only question extraction.
- Trigger-word suggestions shown inline with add buttons.
- Selection questions stored in sidecar JSON.
- PDF selections stored in sidecar JSON with source file, selected text, page number, and normalized highlight rectangles.
- Current-note-first sidebar.
- Full-vault dashboard.
- Obsidian-native right sidebar collapse when the view is docked in the right sidebar.
- JSON exports.
- Localized settings page with editable trigger-word list.

## V2 AI And Local Knowledge Scope

- Optional AI settings: enabled, base URL, API key, model, auto-run, per-session auto limit, and local-note reranking.
- AI is disabled by default and only calls an OpenAI-compatible `/chat/completions` endpoint after explicit user configuration.
- Local recommendations are built inside the plugin with Obsidian `Vault` and `MetadataCache`, not an external Obsidian CLI.
- The local index uses filenames, paths, frontmatter, tags, headings, heading path, and note snippets.
- Saved ToThink/ToWrite cards can be refreshed manually for summary, next action, related notes, and related concepts.
- Optional background processing only handles saved formal questions, skips trigger suggestions, and respects the session limit.
- AI failures are stored as card-level errors and must not break indexing, jumping, or export.

## Non Goals

- Mutating PDF files or embedding annotations into PDF content.
- Guaranteed PDF jump precision across every Obsidian/PDF viewer DOM change.
- Cloud sync service.
- Built-in cloud relay, account system, or managed public hosting.
- Web search or unattended token use.
- Full task manager replacement.

## Interaction Model

1. The user writes naturally.
2. ToWrite indexes explicit rules as saved open questions.
3. Trigger words create inline suggestions with a small add button; they are not saved until the user clicks.
4. The user selects text and records it as ToThink or ToWrite with one click.
5. The sidebar shows current note questions first.
6. The user jumps back, resolves, ignores, pins, edits, or exports questions.

## Data Model

An `OpenQuestion` includes lane, title, question, note, tags, color, kind, status, source position, optional block id, optional page, optional selection anchor, timestamps, and optional AI output fields.

An `OpenQuestionSuggestion` is lighter: lane, color, source line, text, and context. It is editor-only until the user accepts it.

Selection anchors use offsets plus surrounding context. If source text changes too much, the question becomes orphaned instead of silently pointing to the wrong place.

## Success Criteria

- A note with unresolved writing issues becomes scannable in under two seconds.
- Trigger-word matches never enter exports or sidebar lists before user acceptance.
- Selection questions do not modify Markdown by default.
- JSON exports are stable enough for external dashboards.
- The plugin can be packaged as standard Obsidian release assets.
