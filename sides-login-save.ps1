# Speichert die Sides-Zugangsdaten verschlüsselt (Windows DPAPI, nur dieser Windows-Benutzer auf diesem PC kann sie lesen).
# Die Sides-Bridge meldet sich damit selbst wieder an, wenn Sides abmeldet. Nichts davon geht ins GitHub.
$dir = if ($env:SIDES_DATA_DIR) { $env:SIDES_DATA_DIR } else { 'D:\NARA-Playwright\sides-data' }
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Write-Host ''
Write-Host 'Sides Auto-Login einrichten' -ForegroundColor Cyan
Write-Host 'Benutzername und Passwort wie beim normalen Sides-Login eingeben.'
$user = Read-Host 'Benutzername / E-Mail'
$pass = Read-Host 'Passwort' -AsSecureString
if (-not $user -or $pass.Length -eq 0) { Write-Host 'Abgebrochen - nichts gespeichert.' -ForegroundColor Yellow; exit 1 }
@{ user = $user; pass = ($pass | ConvertFrom-SecureString) } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $dir 'login.dat')
Write-Host 'Gespeichert (verschluesselt). Die Bridge meldet sich ab jetzt selbst an.' -ForegroundColor Green
Write-Host 'Loeschen: einfach diese Datei entfernen ->' (Join-Path $dir 'login.dat')
