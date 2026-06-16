#!/usr/bin/env bash
# Stop hook (WSL/Linux): run the headless E2E suite when watched source files
# changed since the last pass — so finishing a turn auto-verifies the game
# without re-running the ~30s suite on every turn. Never blocks the stop
# (always exits 0); failures are reported to the user via stderr.
#
# Wired from .claude/settings.local.json (machine-local) because it needs a
# Linux headless browser; the committed .claude/settings.json keeps the
# Windows/PowerShell hooks. Disable by removing the Stop entry there.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" 2>/dev/null || exit 0
MARK="$ROOT/.claude/.e2e-last-pass"

# Only meaningful where a Linux headless browser exists (skip silently elsewhere).
command -v google-chrome >/dev/null 2>&1 || command -v google-chrome-stable >/dev/null 2>&1 \
  || command -v chromium >/dev/null 2>&1 || command -v chromium-browser >/dev/null 2>&1 || exit 0

# Run only if something the game ships from actually changed since the last pass.
if [ -f "$MARK" ]; then
  newer="$(find index.html css js test/e2e -type f \
    \( -name '*.html' -o -name '*.css' -o -name '*.js' \) -newer "$MARK" 2>/dev/null | head -1)"
  [ -z "$newer" ] && exit 0
fi

echo "[e2e-hook] sources changed — running WSL E2E (headless Chrome)…" >&2
if bash test/e2e/run.sh >/tmp/sy-e2e-hook.log 2>&1; then
  touch "$MARK"
  echo "[e2e-hook] E2E PASS — $(grep -o 'E2E: [0-9/]* assertions passed' /tmp/sy-e2e-hook.log | tail -1)" >&2
else
  echo "[e2e-hook] E2E FAILED — last lines (full log: /tmp/sy-e2e-hook.log):" >&2
  tail -8 /tmp/sy-e2e-hook.log >&2
fi
exit 0
