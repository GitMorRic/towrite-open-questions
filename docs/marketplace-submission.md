# Marketplace Submission Guide

This document prepares ToWrite Open Questions for Obsidian Community Plugins.

Official references:

- Submission requirements: <https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins>
- Submit your plugin: <https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin>
- Manifest reference: <https://docs.obsidian.md/Reference/Manifest>
- Obsidian developer policies: <https://docs.obsidian.md/Developer+policies>

## Current Marketplace Identity

- Plugin id: `towrite-open-questions`
- Plugin name: `ToWrite Open Questions`
- Development version: `0.3.0-beta.1` (not suitable for marketplace submission)
- Minimum app version: `1.7.2`
- Desktop only: `true`

Why desktop-only: the optional External API uses Node.js `http` to run a local server. Obsidian community review expects plugins that use Node.js or Electron APIs to set `isDesktopOnly` to `true`.

## Files Required In The Repository Root

- `manifest.json`
- `versions.json`
- `README.md`
- `LICENSE`

Recommended but not required:

- `README.zh-CN.md`
- `CHANGELOG.md`
- `docs/release-checklist.md`
- `docs/marketplace-submission.md`
- screenshots or GIFs in `docs/assets/`

## Release Assets

Each GitHub release must upload the Obsidian-loadable files:

- `main.js`
- `manifest.json`
- `styles.css`

Do not ask users to install the generated GitHub source ZIP. That ZIP contains source code, tests, and development files, not the ready-to-load plugin bundle.

## Submission Steps

1. Make the GitHub repository public.
2. Confirm the default branch contains root `manifest.json`, `versions.json`, `README.md`, and `LICENSE`.
3. Run `npm.cmd run test`.
4. Run `npm.cmd run build`.
5. Set a stable `x.y.z` version in `manifest.json`, `package.json`, and `versions.json`.
6. Create a Git tag that exactly matches that version, for example `0.3.0` (no `v` prefix).
7. Create a non-prerelease GitHub release using that exact tag.
8. Upload `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` as release assets.
9. Test a clean vault install from those three assets.
10. Sign in at <https://community.obsidian.md>, connect GitHub, open **Plugins**, choose **New plugin**, and provide the public repository URL.

Older guides mention opening a pull request against `obsidianmd/obsidian-releases`. Current official docs use the Obsidian community submission portal instead.

## Suggested Submission Text

Short description:

> Track ToThink and ToWrite annotations beside your source notes.

Longer description:

> ToWrite Open Questions adds a ToThink / ToWrite annotation layer for unfinished thinking and unfinished writing inside Obsidian. Capture cards from Markdown selections, PDF selections, explicit rules, or inline trigger suggestions; keep the current note's unresolved items visible in the sidebar; jump back to source lines or PDF highlights; configure Workflow Stages for file lifecycle tracking; and export JSON for dashboards, widgets, or eink devices. Optional AI and the desktop External API are disabled by default.

Privacy note for reviewers:

> Core indexing and capture recommendations are local-first. Cards, capture targets, and learning exports are stored inside the user's vault. Markdown is only created, appended, or changed after an explicit user action such as pinning an anchor, committing a capture, or undoing it. External API, Backend integration, AI, habit learning, and notifications are opt-in; tokens and API keys are stored in local Obsidian plugin data and are not included in exports.

## Screenshots And GIFs To Prepare

Use a clean demo vault with fake data. Do not show private notes, API tokens, or real AI keys.

Recommended media:

1. `docs/assets/sidebar-current-note.png`
   - Current note on the left, ToWrite sidebar on the right.
   - Show ToThink and ToWrite sections, card counts, and compact card rows.

2. `docs/assets/selection-toolbar.gif`
   - Select Markdown text, click `Think` or `Write`, card appears in sidebar.

3. `docs/assets/pdf-highlight.gif`
   - Select PDF text, create a card, show non-destructive highlight and jump-back.

4. `docs/assets/card-editing.png`
   - Show title, source text, note field, `[[wikilink]]` preview, status/kind chips, and action buttons.

5. `docs/assets/dashboard.png`
   - Show the built-in dashboard or example web dashboard with parsed cards, not raw JSON only.

6. `docs/assets/external-api-settings.png`
   - Show External API settings with the token blurred.

7. `docs/assets/eink-example.jpg`
   - Optional physical eink display or a mock screen showing `/api/v1/eink` output.

## Review Risks

Already addressed:

- `id` no longer contains `obsidian`.
- `name` no longer uses a colon.
- `isDesktopOnly` is now `true` because the plugin uses Node.js `http`.
- AI is opt-in and documented.
- External API is opt-in, token-protected, and documented.
- Markdown writes require an explicit user action and capture writes provide a preview and guarded undo.
- Release assets are limited to `main.js`, `manifest.json`, and `styles.css`.
- `authorUrl` points to the maintainer's public GitHub profile.

Remaining things to verify before submission:

- Merge the final code into the GitHub default branch; the current `main` branch still contains the older `0.2.7` implementation.
- Replace the prerelease version/tag with a stable `x.y.z` version and an exact, no-prefix GitHub tag.
- Run the Obsidian plugin checker and address any startup-performance findings on a large vault.
- The public repository URL should match the final plugin id/name.
- Do a clean vault smoke test after switching from the old manual folder id `obsidian-towrite` to `towrite-open-questions`.
- Keep screenshots free of private note text and credentials.
- Make sure no release ZIP includes `node_modules`, vault data, `.obsidian-open-questions`, API tokens, or AI keys.

## Does Everything Need To Be English?

The plugin can support Chinese UI and Chinese documentation. The marketplace-facing `README.md`, manifest `description`, GitHub release notes, and submission text should be English because Obsidian's public review and directory are English-first. Keep `README.zh-CN.md` as a full Chinese companion document.
