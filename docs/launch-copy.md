# Launch Copy

## Short Description

Track ToThink and ToWrite annotations beside your source notes.

## Longer Description

ToWrite Open Questions is for notes that are almost done, except for the parts that still need proof, clarification, citation, measurement, or another pass of thinking.

Capture a card from a Markdown selection, PDF selection, explicit Markdown rule, or inline trigger suggestion. ToWrite keeps the current note's unresolved items visible first, separates ToThink and ToWrite into collapsible sections, jumps back to source lines or PDF highlights, and exports JSON for dashboards, desktop widgets, scripts, or eink devices.

Optional AI can summarize a saved card, suggest the next writing move, and rerank related local notes from your vault. It is disabled by default, uses your own OpenAI-compatible endpoint, and does not perform web search.

The desktop External API is also disabled by default. When enabled, it can serve token-protected JSON, RSS, SSE events, a dashboard, and status/note writeback for local tools.

## Tagline Options

- Keep unfinished thinking visible.
- A ToThink / ToWrite layer for serious notes.
- Track what your draft still needs to think through or write out.
- Turn writing gaps into navigable source-linked cards.

## Screenshot And GIF Plan

1. Current-note-first sidebar beside a technical note.
2. ToThink and ToWrite sections collapsed and expanded.
3. Inline trigger suggestion with a small `+ Think` / `+ Write` add button.
4. Selection toolbar with one-click Think and Write capture.
5. PDF selection creating a non-destructive overlay highlight.
6. Card editing with title, source text, note, `[[wikilink]]`, and action buttons.
7. Dashboard showing parsed open cards and article counts.
8. External API settings with token blurred.
9. Optional eink card output.

## Release Post Outline

- The problem: notes contain unresolved thinking that normal TODO lists lose.
- The solution: ToWrite indexes open questions and writing gaps where they appear.
- Show current-note-first sidebar and collapsible ToThink / ToWrite sections.
- Show Markdown and PDF selection capture.
- Explain non-invasive sidecar storage and explicit source-anchor pinning.
- Mention JSON export, built-in dashboard, and eink/desktop widget use cases.
- Mention opt-in AI for local note recommendations.
- Mention desktop-only status due to the optional local HTTP API.
- Invite feedback on rule syntax, card UI, and writing workflows.
