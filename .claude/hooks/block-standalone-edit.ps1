# PreToolUse hook: block direct edits to the generated standalone bundle.
$data = [Console]::In.ReadToEnd() | ConvertFrom-Json
$p = $data.tool_input.file_path
if ($p -and (($p -replace '/', '\') -match '(^|\\)standalone\.html$')) {
  [Console]::Error.WriteLine("BLOCKED: 'standalone.html' is a generated bundle. Edit index.html or js/ sources instead, then have the user run /build-standalone to regenerate.")
  exit 2
}
exit 0
