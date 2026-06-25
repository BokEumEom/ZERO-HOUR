#!/usr/bin/env bash
# Visual gallery runner — captures PNGs of representative game-render states for
# eyeballing (boss shape, elite beam, missiles, loot/1UP, cockpit frame, hulls).
# Companion to gallery.mjs / gallery.html. Dev tool, NOT a pass/fail gate.
# Usage: bash test/e2e/gallery.sh [outDir]   (default: /tmp/sy-gallery)
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${1:-/tmp/sy-gallery}"
PORT=$(( (RANDOM % 499) + 8500 ))

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
[ -z "$BROWSER" ] && { echo "gallery: no headless browser found (install chromium/chrome, or enable Edge interop)" >&2; exit 1; }

mkdir -p "$OUT"; rm -f "$OUT"/*.png 2>/dev/null
node "$ROOT/test/e2e/gallery.mjs" "$ROOT" "$OUT" "$PORT" &
SRV=$!
PROFILE="$(mktemp -d /tmp/sy-gal-XXXXXX)"
BR=""
cleanup() { [ -n "$BR" ] && kill "$BR" 2>/dev/null; kill "$SRV" 2>/dev/null; rm -rf "$PROFILE"; }
trap cleanup EXIT
sleep 2

# Background chrome: headless render in real time stays running (it never self-exits
# without --virtual-time-budget), so we drive it in the background and wait on the
# SERVER, which exits when the harness POSTs /done (or on its own 120s timeout).
"$BROWSER" --headless=new --disable-gpu --no-sandbox --no-first-run \
  --user-data-dir="$PROFILE" --window-size=1100,900 \
  "http://127.0.0.1:$PORT/gallery.html" >/dev/null 2>&1 &
BR=$!

wait "$SRV" 2>/dev/null
echo "gallery PNGs in: $OUT"
ls "$OUT"/*.png 2>/dev/null
