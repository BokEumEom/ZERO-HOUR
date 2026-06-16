#!/usr/bin/env bash
# Full test suite for WSL/Linux — bash mirror of run-all.ps1:
#   unit + static (node --test) -> E2E (headless Chrome) -> standalone build sync.
# Zero new dependencies: uses node and whatever Chrome/Chromium is on PATH.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
fail=0

echo "=== unit + static (node --test) ==="
# Run each test file individually: node --test on the directory tries to execute
# helpers.mjs (a shared module, not a test) and errors.
for f in test/unit/*.test.mjs; do
  node --test "$f" || fail=$((fail + 1))
done

echo; echo "=== e2e (headless Chrome/Chromium) ==="
bash test/e2e/run.sh || fail=$((fail + 1))

echo; echo "=== standalone build sync ==="
tmp="$(mktemp /tmp/sy-build-check-XXXXXX.html)"
node .claude/skills/build-standalone/build.mjs "$tmp" >/dev/null 2>&1
if [ "$(sha256sum standalone.html | cut -d' ' -f1)" = "$(sha256sum "$tmp" | cut -d' ' -f1)" ]; then
  echo "PASS: standalone.html reproducible from sources"
else
  echo "FAIL: standalone.html out of sync with sources (run /build-standalone)"
  fail=$((fail + 1))
fi
rm -f "$tmp"

echo
if [ "$fail" = 0 ]; then echo "=== result: ALL PASS ==="; else echo "=== result: FAIL ($fail group(s)) ==="; fi
exit "$fail"
