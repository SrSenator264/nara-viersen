# NARA-Autostart-Komplett.ps1  (Flamo Shop-PC: alles startet von selbst)
# Start ueber Flamo-Autostart-Einrichten.cmd (fragt nach Administrator-Rechten).
# Ergebnis:
#   1) Server + Tunnel-Haertung + kein Ruhezustand (NARA-Autostart-Installieren.ps1)
#   2) Aufgabe "NARA-Kasse-Logon": nach der Windows-Anmeldung starten Kasse + Bruecken
#      (Lieferando, Loco/Sides, Uber) automatisch (NARA-Start.cmd)
#   3) Windows-Updates starten den PC nicht waehrend der Oeffnungszeit neu (Active Hours)
# Rueckgaengig: Unregister-ScheduledTask -TaskName NARA-Server, NARA-Kasse-Logon -Confirm:$false
# Enthaelt keine Geheimnisse.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
# Active Hours: Windows darf NICHT neu starten zwischen diesen Uhrzeiten (max. 18 Stunden Spanne)
$activeStart = 10   # 10:00
$activeEnd   = 4    # 04:00 (naechster Tag)

try {
  # 1) Server, Tunnel, Ruhezustand
  & (Join-Path $root 'NARA-Autostart-Installieren.ps1')

  # 2) Kasse + Bruecken nach Anmeldung (30 s Verzoegerung, damit Netzwerk/Server bereit sind)
  $user = "$env:USERDOMAIN\$env:USERNAME"
  $startCmd = Join-Path $root 'NARA-Start.cmd'
  if (-not (Test-Path $startCmd)) { throw "NARA-Start.cmd nicht gefunden in $root" }
  $act = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$startCmd`"" -WorkingDirectory $root
  $trg = New-ScheduledTaskTrigger -AtLogOn -User $user
  $trg.Delay = 'PT30S'
  $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  $pri = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  Unregister-ScheduledTask -TaskName 'NARA-Kasse-Logon' -Confirm:$false -ErrorAction SilentlyContinue
  Register-ScheduledTask -TaskName 'NARA-Kasse-Logon' -Action $act -Trigger $trg -Principal $pri -Settings $set | Out-Null
  Write-Host "OK: Aufgabe NARA-Kasse-Logon angelegt (Kasse + Bruecken nach Anmeldung von $user)."

  # 3) Windows Update: Active Hours
  $ux = 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'
  if (-not (Test-Path $ux)) { New-Item -Path $ux -Force | Out-Null }
  Set-ItemProperty -Path $ux -Name 'ActiveHoursStart' -Value $activeStart -Type DWord
  Set-ItemProperty -Path $ux -Name 'ActiveHoursEnd' -Value $activeEnd -Type DWord
  Set-ItemProperty -Path $ux -Name 'SmartActiveHoursState' -Value 2 -Type DWord
  Write-Host ("OK: Windows-Update Active Hours {0}:00 - {1}:00 (kein Neustart in dieser Zeit)." -f $activeStart, $activeEnd)

  Write-Host ""
  Write-Host "Fertig. Noch von Hand: Auto-Login + BIOS 'After Power Loss = Power On'."
} catch {
  Write-Host ("FEHLER: " + $_.Exception.Message) -ForegroundColor Red
}
Read-Host "Enter zum Schliessen"
