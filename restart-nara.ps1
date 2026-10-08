param()
$ErrorActionPreference = 'Stop'
$root = 'C:\Users\droma\Documents\Codex\2026-09-08\new-chat'
$logs = Join-Path $root 'logs'
$startupLog = Join-Path $logs 'startup.log'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
function Log($message) { Add-Content -LiteralPath $startupLog -Value ((Get-Date).ToString('o') + ' RESTART ' + $message) }
$port = 4185
$envFile = Join-Path $root '.env'
if (Test-Path -LiteralPath $envFile) {
  foreach ($line in (Get-Content -LiteralPath $envFile)) {
    $match = [regex]::Match($line, '^\s*PORT\s*=\s*(\d+)\s*$')
    if ($match.Success) { $port = [int]$match.Groups[1].Value; break }
  }
}
function Get-PortOwners {
  $owners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  if (-not $owners) { $owners = @(netstat -ano -p tcp | Select-String (':'+$port+'\s+.*LISTENING\s+\d+$') | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique) }
  return @($owners | Where-Object { $_ -and $_ -ne $PID } | ForEach-Object { [int]$_ } | Sort-Object -Unique)
}
try {
  $oldOwners = @(Get-PortOwners)
  foreach ($owner in $oldOwners) { Log "stopping PID $owner on port $port"; Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue }
  $free = $false
  for ($i=0; $i -lt 40; $i++) { if (@(Get-PortOwners).Count -eq 0) { $free = $true; break }; Start-Sleep -Milliseconds 250 }
  if (-not $free) { Log "ERROR port $port did not become free; no server started"; exit 1 }
  $launcher = Join-Path $root 'start-nara-hidden.ps1'
  $child = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',$launcher,'-SkipBrowser') -WorkingDirectory $root -WindowStyle Hidden -PassThru
  $ready = $false
  for ($i=0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 250
    try { $response = Invoke-WebRequest -Uri ("http://localhost:{0}/api/admin-data" -f $port) -UseBasicParsing -TimeoutSec 1; if ($response.StatusCode -eq 200) { $ready = $true; break } } catch {}
  }
  $owners = @(Get-PortOwners)
  if (-not $ready -or $owners.Count -ne 1) { Log "ERROR server not ready or listener count=$($owners.Count); child=$($child.Id)"; exit 1 }
  Log "ready PID $($owners[0]) on port $port"
  Start-Process ("http://localhost:{0}/ai-control.html" -f $port)
  exit 0
} catch { Log ('ERROR ' + $_.Exception.Message); exit 1 }
