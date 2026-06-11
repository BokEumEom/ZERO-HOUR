# E2E runner: starts the report server, drives the harness in headless Edge,
# prints results, exits with the server's pass/fail code.
$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot\..\.."
$port = 8419

$server = Start-Process node -ArgumentList "`"$root\test\e2e\server.mjs`"", $port -NoNewWindow -PassThru
Start-Sleep -Seconds 2

$edge = @("$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
          "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") |
        Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Error 'Edge not found'; exit 1 }

$edgeProfile = Join-Path $env:TEMP ("sy-e2e-" + [guid]::NewGuid())
& $edge --headless=new --disable-gpu --no-first-run --user-data-dir="$edgeProfile" `
  --window-size=1100,900 --virtual-time-budget=60000 `
  --screenshot="$env:TEMP\sy-e2e-final.png" "http://localhost:$port/test/e2e/harness.html" | Out-Null

$server.WaitForExit(30000) | Out-Null
if (-not $server.HasExited) {
  Write-Error 'server did not exit'
  Stop-Process -Id $server.Id -Force
  Remove-Item $edgeProfile -Recurse -Force -Confirm:$false -ErrorAction SilentlyContinue
  exit 1
}
$server.WaitForExit() # PS 5.1: ExitCode is only populated after the untimed overload
Remove-Item $edgeProfile -Recurse -Force -Confirm:$false -ErrorAction SilentlyContinue
exit $server.ExitCode
