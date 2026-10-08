param([switch]$SkipBrowser)
$ErrorActionPreference = 'Stop'
$root = 'C:\Users\droma\Documents\Codex\2026-09-08\new-chat'
$server = Join-Path $root 'server.js'
$logs = Join-Path $root 'logs'
$node = 'C:\Program Files\nodejs\node.exe'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$startupLog = Join-Path $logs 'startup.log'
$errorLog = Join-Path $logs 'server-error.log'
try {
  $serverText = Get-Content -Raw -LiteralPath $server
  $envFile = Join-Path $root '.env'
  $port = $null
  if (Test-Path -LiteralPath $envFile) {
    foreach ($line in (Get-Content -LiteralPath $envFile)) {
      $envMatch = [regex]::Match($line, '^\s*PORT\s*=\s*(\d+)\s*$')
      if ($envMatch.Success) { $port = [int]$envMatch.Groups[1].Value; break }
    }
  }
  $match = [regex]::Match($serverText, 'process\.env\.PORT\)\|\|(\d+)')
  if ($null -eq $port) {
    if (-not $match.Success) { throw 'Could not determine the configured NARA port from server.js.' }
    $port = [int]$match.Groups[1].Value
  }
  $urlBase = "http://localhost:$port"
  function Test-NaraReady {
    try { $response = Invoke-WebRequest -Uri "$urlBase/api/admin-data" -UseBasicParsing -TimeoutSec 2; return $response.StatusCode -eq 200 } catch { return $false }
  }
  function Open-NaraPage {
    if ($SkipBrowser) { return }
    try { Start-Process "$urlBase/inventory-foundation.html#invoices" }
    catch { Add-Content -LiteralPath $startupLog -Value ((Get-Date).ToString('o') + ' BROWSER_WARNING ' + $_.Exception.Message) }
  }
  if (Test-NaraReady) {
    Add-Content -LiteralPath $startupLog -Value ((Get-Date).ToString('o') + " already running on port $port")
    Open-NaraPage
    exit 0
  }
  if (-not (Test-Path -LiteralPath $node)) { throw "Node executable not found: $node" }
  $stdoutLog = Join-Path $logs 'server.log'
  $process = Start-Process -FilePath $node -ArgumentList @($server) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $errorLog -PassThru
  Add-Content -LiteralPath $startupLog -Value ((Get-Date).ToString('o') + " started PID $($process.Id) on port $port path=$server cwd=$root")
  $ready = $false
  1..30 | ForEach-Object { if (-not $ready) { Start-Sleep -Milliseconds 500; $ready = Test-NaraReady } }
  if (-not $ready) { throw "NARA server did not become ready on port $port. See $errorLog" }
  Open-NaraPage
} catch {
  Add-Content -LiteralPath $startupLog -Value ((Get-Date).ToString('o') + ' ERROR ' + $_.Exception.Message)
  exit 1
}
