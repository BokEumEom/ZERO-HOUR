# PostToolUse hook: warn when an edit introduces Math.random() into a daily-seeded
# game core. Daily-challenge fairness ([ADR-0002]) requires every gameplay-affecting
# random to draw from the per-run seeded s.rng(); Math.random() is cosmetic-only.
# This is a preventive companion to the rng-fairness-auditor agent: it fires at
# write-time, but only when the change text actually adds Math.random( to a seeded
# game's game.js. shepards-dog is a standalone non-seeded game, so it is skipped.
# Exit 2 = non-blocking reminder to Claude (the edit already happened; some
# Math.random() in game.js is legitimately cosmetic, e.g. the free-play seed).
$data = [Console]::In.ReadToEnd() | ConvertFrom-Json
$p = $data.tool_input.file_path
if (-not $p) { exit 0 }
$n = $p -replace '/', '\'
# Seeded game cores only: js\games\<id>\game.js, excluding shepards-dog.
if ($n -notmatch '\\js\\games\\(?!shepards-dog\\)[^\\]+\\game\.js$') { exit 0 }
# Inspect the incoming change (Edit -> new_string, Write -> content), not the whole
# file, so a pre-existing cosmetic Math.random() does not re-fire on every edit.
$added = "$($data.tool_input.new_string)$($data.tool_input.content)"
if ($added -notmatch 'Math\.random\(') { exit 0 }
[Console]::Error.WriteLine("FAIRNESS CHECK: this edit adds Math.random() to a daily-seeded game core (${p}). If the draw affects spawn position/count, drops, drop probability, enemy entry edge, boss attack choice, or score, it BREAKS daily determinism — use the per-run s.rng() instead. Cosmetic-only use (particles, screen shake, audio noise, the free-play seed string) is fine. When unsure, run the rng-fairness-auditor agent.")
exit 2
