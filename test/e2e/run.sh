#!/usr/bin/env bash
# WSL/Linux E2E runner — bash mirror of run.ps1. Starts the report server,
# drives test/e2e/harness.html in a headless Chromium-family browser, and exits
# with the server's pass/fail code. Zero new dependencies: uses whatever Chrome/
# Chromium is already on PATH (or Windows Edge via WSL interop as a fallback).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT=$(( (RANDOM % 499) + 8500 )) # random to avoid bind races on rapid reruns

# Pick a headless browser: Linux Chrome/Chromium first, then Windows Edge via interop.
BROWSER=""
for b in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$b" >/dev/null 2>&1; then BROWSER="$b"; break; fi
done
if [ -z "$BROWSER" ]; then
  for p in "/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe" \
           "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"; do
    [ -x "$p" ] && BROWSER="$p" && break
  done
fi
if [ -z "$BROWSER" ]; then
  echo "E2E: no headless browser found (install chromium/google-chrome, or enable WSL interop for Edge)" >&2
  exit 1
fi
echo "e2e browser: $BROWSER"

PROFILE="$(mktemp -d /tmp/sy-e2e-XXXXXX)"
SHOT="/tmp/sy-e2e-final.png"
cleanup() { [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null; rm -rf "$PROFILE"; }
trap cleanup EXIT

# Start the report server (exits 0 on all-pass, 1 on failure/timeout).
node "$ROOT/test/e2e/server.mjs" "$PORT" &
SRV=$!
sleep 2

# Drive the harness. --virtual-time-budget fast-forwards timers; the harness
# steps the sim via G.update() because rAF starves under virtual time.
# --no-sandbox is required for headless Chrome under WSL.
"$BROWSER" --headless=new --disable-gpu --no-sandbox --no-first-run \
  --user-data-dir="$PROFILE" --window-size=1100,900 --virtual-time-budget=60000 \
  --screenshot="$SHOT" "http://localhost:$PORT/test/e2e/harness.html" >/dev/null 2>&1 || true

# The server exits itself on report/timeout; wait collects its code.
wait "$SRV"
code=$?
SRV=""
exit "$code"
