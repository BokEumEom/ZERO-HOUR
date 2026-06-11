# Full test suite: unit + static -> E2E -> standalone build sync (rubric #12).
$ErrorActionPreference = 'Continue'
$root = Resolve-Path "$PSScriptRoot\.."
$fail = 0

Write-Host "=== unit + static (node --test) ==="
node --test "$root\test\unit\*.test.mjs"
if ($LASTEXITCODE -ne 0) { $fail++ }

Write-Host "`n=== e2e (headless Edge) ==="
powershell -NoProfile -ExecutionPolicy Bypass -File "$root\test\e2e\run.ps1"
if ($LASTEXITCODE -ne 0) { $fail++ }

Write-Host "`n=== standalone build sync ==="
# build to a temp file and hash-compare: the checked-in bundle must equal a
# fresh build of the current sources
$tmpBuild = Join-Path $env:TEMP 'sy-build-check.html'
node "$root\.claude\skills\build-standalone\build.mjs" $tmpBuild
if ($LASTEXITCODE -ne 0) { $fail++ }
elseif ((Get-FileHash "$root\standalone.html").Hash -ne (Get-FileHash $tmpBuild).Hash) {
  Write-Host 'FAIL: standalone.html out of sync with sources (run /build-standalone)'
  $fail++
} else { Write-Host 'PASS: standalone.html reproducible from sources' }
Remove-Item $tmpBuild -Force -Confirm:$false -ErrorAction SilentlyContinue

Write-Host "`n=== result: $(if ($fail) { "FAIL ($fail group(s))" } else { 'ALL PASS' }) ==="
exit $fail
