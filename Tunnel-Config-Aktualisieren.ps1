# Tunnel-Config-Aktualisieren.ps1
# Als Administrator ausfuehren:
#   powershell -ExecutionPolicy Bypass -File "C:\Users\droma\Documents\GitHub\nara-viersen\Tunnel-Config-Aktualisieren.ps1"
# Uebernimmt tunnel\config.example.yml in die echte Tunnel-Config (SYSTEM-Profil), behaelt dabei deinen
# credentials-file-Pfad, legt eine Sicherung an und startet die Aufgabe cloudflared-nara neu.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $root 'tunnel\config.example.yml'
$dst  = 'C:\Windows\System32\config\systemprofile\.cloudflared\config.yml'
if (-not (Test-Path $src)) { throw "Nicht gefunden: $src" }
if (-not (Test-Path $dst)) { throw "Nicht gefunden: $dst (Tunnel noch nie eingerichtet?)" }

$old  = Get-Content $dst -Raw
$cred = ($old -split "`r?`n" | Where-Object { $_ -match '^\s*credentials-file\s*:' } | Select-Object -First 1)
if (-not $cred) { throw "Keine credentials-file-Zeile in $dst gefunden." }

$new = (Get-Content $src -Raw) -replace '(?m)^\s*credentials-file\s*:.*$', $cred.Trim()
Copy-Item $dst ($dst + '.bak-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
[System.IO.File]::WriteAllText($dst, $new, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "OK: Config aktualisiert ($($cred.Trim()))"

Stop-ScheduledTask -TaskName 'cloudflared-nara' -ErrorAction SilentlyContinue
Start-Sleep 2
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName 'cloudflared-nara'
Start-Sleep 6
Write-Host ("Oeffentlich /api/push/key (401 = erreichbar, Login noetig): " + (curl.exe -s -o NUL -w "%{http_code}" --max-time 10 https://app.flamo.co.de/api/push/key))
Write-Host ("Oeffentlich driver.html (200 erwartet):                  " + (curl.exe -s -o NUL -w "%{http_code}" --max-time 10 https://app.flamo.co.de/driver.html))
