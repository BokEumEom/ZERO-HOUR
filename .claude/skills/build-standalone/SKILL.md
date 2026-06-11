---
name: build-standalone
description: Rebuild standalone.html by inlining js/ modules and CDN libraries into index.html so it runs as a single offline file
disable-model-invocation: true
---

# Build Standalone

Regenerates `standalone.html` from the dev sources (`index.html` + `js/`).

## Steps

1. Run the bundled build script from the project root:

   ```
   node .claude/skills/build-standalone/build.mjs
   ```

   It inlines every local `<script src="js/...">` plus the three CDN libraries
   (React, ReactDOM, Babel Standalone) directly into the HTML, preserving load
   order and the `type="text/babel"` attribute on the JSX panels. Requires
   Node 18+ and network access (for the CDN downloads).

2. Verify the output:
   - The script itself fails if any original `<script src>` tag was not replaced.
   - Sanity-check the size (roughly 3–5 MB raw; the React/Babel dev builds dominate).
   - If possible, open the file in a browser (or via Playwright MCP) and confirm
     the title screen renders and a run can start.

3. Report the new file size to the user.

## Notes

- `standalone.html` is a **generated artifact** — never hand-edit it.
  A PreToolUse hook in `.claude/settings.json` blocks direct edits.
- On Vercel the file is served at `/standalone.html` as a downloadable
  single-file version of the game.
- To write to a different path (e.g. for a test build), pass it as an argument:
  `node .claude/skills/build-standalone/build.mjs out-test.html`
