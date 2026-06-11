# PostToolUse hook: after editing game sources, remind that the standalone
# bundle is now stale. Exit 2 feeds stderr to Claude (non-blocking; the tool
# already ran).
$data = [Console]::In.ReadToEnd() | ConvertFrom-Json
$p = $data.tool_input.file_path
if (-not $p) { exit 0 }
$n = $p -replace '/', '\'
if ($n -match '\\js\\[^\\]+\.(js|jsx)$' -or $n -match '\\css\\[^\\]+\.css$' -or $n -match '(^|\\)index\.html$') {
  [Console]::Error.WriteLine("Note: a game source file changed, so 'standalone.html' is now stale. Suggest the user run /build-standalone before shipping the single-file build. (Do not edit the standalone file directly.)")
  exit 2
}
exit 0
