---
name: deploy-check
description: Pre-deploy gate for the Vercel static site — regenerates standalone.html, runs the full test suite, and confirms the bundle is reproducible from source before shipping
disable-model-invocation: true
---

# Deploy Check

A single green/red gate to run before deploying to Vercel. It confirms the
generated `standalone.html` bundle matches the current sources and the whole test
suite passes, so a stale or broken bundle never ships.

This is the release companion to `/build-standalone` (which only regenerates the
bundle). Run this last, after all source changes are committed.

## Steps

1. From the project root, run the full suite (unit + static + headless E2E +
   standalone build-sync check):

   ```
   bash test/run-all.sh
   ```

   The final group rebuilds `standalone.html` to a temp file and compares its
   SHA-256 against the committed `standalone.html` — this is the "bundle is
   reproducible from source" check. Requires Node 18+ and a Chrome/Chromium on
   PATH for E2E.

2. Interpret the result:
   - **`=== result: ALL PASS ===`** → safe to deploy.
   - **`FAIL: standalone.html out of sync with sources`** → the committed bundle is
     stale. Tell the user to run `/build-standalone`, then commit the regenerated
     `standalone.html`, then re-run this check. **Do not** hand-edit the bundle
     (a PreToolUse hook blocks it).
   - Any **unit / static / E2E** failure → report the failing group and the
     relevant output; do not deploy until green.

3. Sanity-check what Vercel will actually serve: `.vercelignore` must still exclude
   dev-only files (`.claude/`, `test/`, JSX sources are dev-only). Flag if a
   newly-added dev file is not ignored.

4. Report a concise verdict to the user: PASS/FAIL per group, the bundle size, and
   a clear "OK to deploy" / "blocked — do X first".

## Notes

- This skill is **read-and-verify only by default** — it does not deploy and does
  not regenerate the committed bundle for you (that is `/build-standalone`, which
  the user runs). It just tells you whether a deploy is safe.
- On Windows without bash, run `test/run-all.ps1` instead — same checks.
- Deploy itself is Vercel's static-site pipeline; there is nothing to build or
  compile beyond the bundle.
