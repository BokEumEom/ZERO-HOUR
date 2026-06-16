# PostToolUse hook: syntax-check an edited JS file with `node --check`.
# This project has no build step, so a parse error otherwise only surfaces when
# the page is loaded in a browser. `node --check` is parse-only (it never runs
# the file), so top-level browser globals are fine. `.jsx` is skipped — JSX is
# not valid plain JS. Exit 2 feeds stderr back to Claude (non-blocking; the edit
# already happened).
$data = [Console]::In.ReadToEnd() | ConvertFrom-Json
$p = $data.tool_input.file_path
if (-not $p) { exit 0 }
if ($p -notmatch '\.(js|mjs)$') { exit 0 }   # only plain JS / ESM; skip .jsx, .json, .css, ...
if (-not (Test-Path $p)) { exit 0 }           # deleted/renamed
# Run through cmd so the 2>&1 merge happens at the cmd layer; PS 5.1 then sees
# plain text instead of wrapping each native stderr line in a NativeCommandError.
$out = (cmd /c "node --check `"$p`" 2>&1") | Out-String
if ($LASTEXITCODE -ne 0) {
  [Console]::Error.WriteLine("SYNTAX ERROR in ${p} (node --check):`n$out`nFix it before continuing - there is no build step to catch this otherwise.")
  exit 2
}
exit 0
