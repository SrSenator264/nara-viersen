# NARA-Autostart-Installieren.ps1
# Einmal als Administrator ausfuehren (Rechtsklick auf PowerShell -> "Als Administrator ausfuehren"):
#   powershell -ExecutionPolicy Bypass -File "C:\Users\droma\Documents\GitHub\nara-viersen\NARA-Autostart-Installieren.ps1"
# Ergebnis:
#   1) NARA-Server startet automatisch beim Hochfahren (auch ohne Anmeldung), startet bei Absturz neu.
#   2) Die Tunnel-Aufgabe "cloudflared-nara" bekommt dieselben Sicherheits-Einstellungen (Neustart bei Fehler, Akku ok, kein Zeitlimit).
#   3) Der Rechner geht am Netzstrom nicht mehr in den Ruhezustand.
# Enthaelt keine Geheimnisse. Rueckgaengig: Unregister-ScheduledTask -TaskName NARA-Server -Confirm:$false

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $root 'server.js'))) { throw "server.js nicht gefunden in $root" }
$node = (Get-Command node -ErrorAction Stop).Source
Write-Host "Projekt: $root"
Write-Host "Node:    $node"

New-Item -ItemType Directory -Force -Path (Join-Path $root 'logs') | Out-Null

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

# 1) NARA-Server
$cmd = "/c cd /d `"$root`" && set `"PORT=4185`" && `"$node`" server.js >> logs\server.log 2>&1"
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmd -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Unregister-ScheduledTask -TaskName 'NARA-Server' -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName 'NARA-Server' -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
Write-Host "OK: Aufgabe NARA-Server angelegt (Start beim Hochfahren)."

# 2) Tunnel-Aufgabe haerten (falls vorhanden)
if (Get-ScheduledTask -TaskName 'cloudflared-nara' -ErrorAction SilentlyContinue) {
  Set-ScheduledTask -TaskName 'cloudflared-nara' -Settings $settings | Out-Null
  Write-Host "OK: cloudflared-nara gehaertet (Neustart bei Fehler, Akku ok)."
} else { Write-Host "Hinweis: Aufgabe cloudflared-nara nicht gefunden." }

# 3) Kein Ruhezustand am Netzstrom
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
Write-Host "OK: Kein Ruhezustand am Netzstrom."

# Jetzt sofort starten, falls Port 4185 noch frei ist
$busy = Get-NetTCPConnection -LocalPort 4185 -State Listen -ErrorAction SilentlyContinue
if (-not $busy) { Start-ScheduledTask -TaskName 'NARA-Server'; Start-Sleep 4 }
Write-Host ("NARA lokal: " + (curl.exe -s -o NUL -w "%{http_code}" --max-time 5 http://127.0.0.1:4185/api/menu))
Write-Host "Fertig."
