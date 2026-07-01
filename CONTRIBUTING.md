# Contributing

Thanks for helping improve ToWrite Open Questions.

This project is an Obsidian desktop plugin. Please keep changes focused, local-first, and respectful of user vault privacy.

## Development

Install dependencies and verify the project before opening a pull request:

```powershell
npm.cmd install
npm.cmd run test
npm.cmd run build
```

Build output is written to `dist/`.

## Branches

- `main`: stable release branch.
- `dev`: active development branch.
- `feat/*`: new features.
- `fix/*`: bug fixes.
- `docs/*`: documentation-only changes.
- `release/*`: version and release preparation.

For small projects, a lightweight flow is enough:

1. Create a feature branch from `dev`.
2. Commit focused changes.
3. Run tests and build.
4. Merge into `dev`.
5. Merge `dev` into `main` only when preparing a stable release.

## Commit Messages

Use concise conventional-style messages when possible:

```text
feat: add workflow stage summaries
fix: restore PDF highlight jump
docs: update API examples
chore: prepare 0.2.0 release
```

## Pull Requests

Before opening a PR:

- Run `npm.cmd run test`.
- Run `npm.cmd run build`.
- Update `README.md`, `README.zh-CN.md`, `CHANGELOG.md`, or files under `docs/` when behavior changes.
- Keep UI copy available in both English and Chinese when adding user-facing docs or examples.
- Keep screenshots and demo data free of private notes, tokens, or API keys.

## Privacy And Data

Do not commit:

- Vault content.
- `.obsidian-open-questions/`.
- Obsidian plugin `data.json`.
- API tokens, AI keys, or `.env` files.
- `node_modules/`, `dist/`, or `release/`.
- Real Tailscale hostnames, private LAN URLs, or personal note excerpts.

The plugin may store selected source text, PDF excerpts, notes, tags, paths, and workflow summaries in user-controlled vault data. Treat all exported JSON and sidecar files as private user data.

## Release Checklist

Release tags must match `manifest.json` exactly, for example `0.2.0` rather than `v0.2.0`.

Before publishing a release:

```powershell
npm.cmd run test
npm.cmd run build
```

Each GitHub release must upload these individual assets:

- `main.js`
- `manifest.json`
- `styles.css`

Do not use GitHub's generated source archive as the install package. A manual install ZIP can be uploaded as an extra convenience asset, but BRAT and Obsidian Community Plugins expect the individual plugin files.

## Obsidian Review Notes

The plugin is marked `isDesktopOnly: true` because the optional External API uses Node.js `http`.

External API and AI features must remain opt-in. The plugin should not modify Markdown unless the user explicitly chooses an action such as pinning a source anchor.
