# Release Checklist

## Before Tagging

- Confirm `manifest.json` uses the marketplace id `towrite-open-questions`.
- Update `manifest.json` version.
- Update `package.json` version.
- Update `versions.json`.
- Update `CHANGELOG.md`.
- Run `npm.cmd run test`.
- Run `npm.cmd run build`.

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
- Restart Obsidian and confirm state persists.

## Marketplace Submission

- Make the GitHub repository public.
- Create a GitHub release with a tag matching `manifest.json`.
- Upload the three release assets.
- Submit through Obsidian's community plugin request flow.
- See [marketplace-submission.md](marketplace-submission.md).
