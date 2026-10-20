# Flamo Shop-PC: Cloudflare-Tunnel vorbereiten (NICHT starten). Admin noetig.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dir  = 'C:\Flamo-Tunnel'
$id   = 'cb7cd52a-c59b-4c72-86da-e3f26310b92f'
$cred = Join-Path $dir "$id.json"
if (-not (Test-Path $cred)) { throw "Schluesseldatei fehlt: $cred" }
$exe = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $exe) { $exe = (Get-ChildItem "$env:ProgramFiles*\cloudflared\cloudflared.exe","$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Cloudflare.cloudflared*\cloudflared.exe" -ErrorAction SilentlyContinue | Select-Object -First 1).FullName }
if (-not $exe) { throw 'cloudflared.exe nicht gefunden' }
$cfg = Join-Path $dir 'config.yml'
$txt = Get-Content (Join-Path $root 'tunnel\config.example.yml') -Raw
$txt = [regex]::Replace($txt, '(?m)^credentials-file:.*$', "credentials-file: $cred")
[IO.File]::WriteAllText($cfg, $txt, (New-Object Text.UTF8Encoding $false))
& $exe tunnel --config $cfg ingress validate
if ($LASTEXITCODE -ne 0) { throw 'config.yml ungueltig' }
Unregister-ScheduledTask -TaskName 'cloudflared-nara' -Confirm:$false -ErrorAction SilentlyContinue
$act = New-ScheduledTaskAction -Execute $exe -Argument "tunnel --config `"$cfg`" run"
$trg = New-ScheduledTaskTrigger -AtStartup
$pri = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$set = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'cloudflared-nara' -Action $act -Trigger $trg -Principal $pri -Settings $set | Out-Null
Disable-ScheduledTask -TaskName 'cloudflared-nara' | Out-Null
Write-Host 'Fertig: config.yml ok, Task cloudflared-nara angelegt (DEAKTIVIERT, Tunnel laeuft NICHT).'
