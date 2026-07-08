# Release Checklist

## Before Tagging

- Confirm `manifest.json` uses the marketplace id `towrite-open-questions`.
- Update `manifest.json` version.
- Update `package.json` version.
- Update `versions.json`.
- Update `CHANGELOG.md`.
- Run `npm.cmd run test`.
- Run `npm.cmd run build`.
- Confirm README, CHANGELOG, and versions.json match the current version.
- Confirm docs, tests, and logs do not contain real Dot API keys, External API tokens, or AI keys.

## Release Assets

Upload exactly these files from `dist/`:

- `main.js`
- `manifest.json`
- `styles.css`

Do not upload a vault folder, `data.json`, `.obsidian-open-questions`, API tokens, AI keys, `node_modules`, or source archives as installation assets.

## Local Smoke Test

- Install the three files in a clean vault under `.obsidian/plugins/towrite-open-questions/`.
- Enable `ToWrite Open Questions`.
- Create a `??` Markdown question.
- Create a Markdown selection card.
- Create a PDF selection card and verify overlay highlight/jump-back.
- Collapse and expand ToThink / ToWrite sections.
- Toggle single-card and global compact editor highlights.
- Export JSON.
- Open the Dashboard and confirm Article Type, Workflow Stage, ToThink, and ToWrite counts match the sidebar.
- Open `/api/v1/device-feed?page=home` and `/api/v1/device-feed?page=articles`; workflow/tag-only notes should appear in device data.
- If testing Quote0: fetch devices, send a test card, send next card, send home dashboard, force refresh, and confirm Dot App/Content Studio Loop uses the matching Text / Image / Canvas API content.
- If testing NFC: confirm External API is enabled, bind host/publicBaseUrl are reachable from the phone, and `/device/input` can append a note or create a capture.
- Restart Obsidian and confirm state persists.

## Marketplace Submission

- Make the GitHub repository public.
- Create a GitHub release with a tag matching `manifest.json`.
- Upload the three release assets.
- Submit through Obsidian's community plugin request flow.
- See [marketplace-submission.md](marketplace-submission.md).
