# PostToolUse hook: after editing game logic or a unit test, re-run the node --test
# unit suite so logic regressions surface immediately. The full E2E suite only runs
# on Stop (settings.local.json), so without this a broken simulation/scoring change
# can sit unnoticed for a whole turn. Scoped to the sources the unit suite covers
# (game / medals / store) plus the test files themselves, to stay quiet otherwise.
# Exit 2 feeds stderr back to Claude (non-blocking; the edit already happened).
$data = [Console]::In.ReadToEnd() | ConvertFrom-Json
$p = $data.tool_input.file_path
if (-not $p) { exit 0 }
$n = $p -replace '/', '\'
# Only the sources the unit suite actually exercises, plus the tests themselves.
if ($n -notmatch '\\(game|medals|store)\.js$' -and $n -notmatch '\\test\\unit\\.*\.test\.mjs$') { exit 0 }
# Enumerate test files individually: `node --test test/unit/` would try to execute
# helpers.mjs (a shared module, not a test) and error. Relative paths avoid the
# space in the project directory name.
$rel = (Get-ChildItem "test\unit\*.test.mjs" -ErrorAction SilentlyContinue | ForEach-Object { "test\unit\$($_.Name)" }) -join ' '
if (-not $rel) { exit 0 }
# Run through cmd so 2>&1 merges at the cmd layer (PS 5.1 otherwise wraps each
# native stderr line in a NativeCommandError).
$out = (cmd /c "node --test $rel 2>&1") | Out-String
if ($LASTEXITCODE -ne 0) {
  $tail = ($out -split "`n" | Select-Object -Last 40) -join "`n"
  [Console]::Error.WriteLine("UNIT TESTS FAILING after editing ${p}:`n$tail`nFix this before continuing.")
  exit 2
}
exit 0
