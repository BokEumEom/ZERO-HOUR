# E2E runner: starts the report server, drives the harness in headless Edge,
# prints results, exits with the server's pass/fail code.
$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot\..\.."
$port = Get-Random -Minimum 8500 -Maximum 8999 # random to avoid bind races on rapid reruns

# Codex/CI shells can expose both Path and PATH, which breaks Start-Process
# on Windows PowerShell's case-insensitive environment dictionary.
$pathValue = [System.Environment]::GetEnvironmentVariable('Path', 'Process')
[System.Environment]::SetEnvironmentVariable('PATH', $null, 'Process')
[System.Environment]::SetEnvironmentVariable('Path', $pathValue, 'Process')

$server = Start-Process node -ArgumentList "`"$root\test\e2e\server.mjs`"", $port -NoNewWindow -PassThru
$server.Handle | Out-Null # PS 5.1: cache the handle now, or .ExitCode reads back $null later
Start-Sleep -Seconds 2

$edge = @("$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
          "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") |
        Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Error 'Edge not found'; exit 1 }

$edgeProfile = Join-Path $env:TEMP ("sy-e2e-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $edgeProfile | Out-Null
$edgeArgs = @(
  '--headless=new',
  '--disable-gpu',
  '--disable-gpu-compositing',
  '--disable-software-rasterizer',
  '--no-sandbox',
  '--no-first-run',
  "--user-data-dir=$edgeProfile",
  '--window-size=1100,900',
  '--virtual-time-budget=60000',
  "--screenshot=$env:TEMP\sy-e2e-final.png",
  "http://localhost:$port/test/e2e/harness.html"
)
& $edge @edgeArgs | Out-Null
$edgeCode = $LASTEXITCODE

$server.WaitForExit(30000) | Out-Null
if (-not $server.HasExited) {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  Remove-Item $edgeProfile -Recurse -Force -Confirm:$false -ErrorAction SilentlyContinue
  Write-Error 'server did not exit'
  exit 1
}
$server.WaitForExit() # PS 5.1: ExitCode is only populated after the untimed overload
Remove-Item $edgeProfile -Recurse -Force -Confirm:$false -ErrorAction SilentlyContinue
if ($edgeCode -ne 0) { Write-Error "Edge exited with code $edgeCode"; exit $edgeCode }
$code = $server.ExitCode
if ($null -eq $code) { Write-Error 'could not read e2e exit code'; exit 1 }
exit $code
