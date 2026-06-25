---
name: build-standalone
description: Rebuild standalone.html by inlining the local js/ modules and css/ stylesheets into index.html so it runs as a single offline file
disable-model-invocation: true
---

# Build Standalone

Regenerates `standalone.html` from the dev sources (`index.html` + `js/` + `css/`).

## Steps

1. Run the bundled build script from the project root:

   ```
   node .claude/skills/build-standalone/build.mjs
   ```

   It inlines every local `<script src="js/...">` and every local
   `<link rel="stylesheet" href="css/...">` directly into the HTML, preserving
   load order. The game is vanilla JS with no framework/CDN dependencies, so the
   build is fully offline — Google Fonts `<link>`s are intentionally left external.
   Requires Node 18+. (The script still fetches any `https://` script src, but
   index.html currently has none.)

2. Verify the output:
   - The script itself fails if any original `<script src>` tag was not replaced.
   - Sanity-check the size (roughly 0.3 MB — the inlined `js/` modules + `css/`
     dominate; there are no heavyweight library bundles).
   - If possible, open the file in a browser (or via Playwright MCP) and confirm
     the title screen renders and a run can start.
   - The `test/run-all` suite hash-compares the checked-in `standalone.html`
     against a fresh build, so it must be regenerated whenever `index.html`,
     `js/`, or `css/` change.

3. Report the new file size to the user.

## Notes

- `standalone.html` is a **generated artifact** — never hand-edit it.
  A PreToolUse hook in `.claude/settings.json` blocks direct edits.
- On Vercel the file is served at `/standalone.html` as a downloadable
  single-file version of the game.
- To write to a different path (e.g. for a test build), pass it as an argument:
  `node .claude/skills/build-standalone/build.mjs out-test.html`
