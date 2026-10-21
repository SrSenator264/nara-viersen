# Einmalig (Admin): Aufgabe Flamo-Update anlegen. Laeuft NUR auf Knopfdruck (kein Trigger), als SYSTEM.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ps1 = Join-Path $root 'Flamo-Update.ps1'
if (-not (Test-Path $ps1)) { throw "fehlt: $ps1" }
$act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`"" -WorkingDirectory $root
$pri = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
Unregister-ScheduledTask -TaskName 'Flamo-Update' -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName 'Flamo-Update' -Action $act -Principal $pri -Settings $set | Out-Null
Write-Host 'Fertig: Aufgabe Flamo-Update angelegt (laeuft nur auf Knopfdruck in update.html).'
