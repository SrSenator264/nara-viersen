# Flamo: System aktualisieren (git pull) und nur den SERVER neu starten. Bruecken laufen weiter.
# Wird vom Knopf "حدّث النظام" (update.html) ueber die Aufgabe Flamo-Update gestartet. Keine Geheimnisse.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
New-Item -ItemType Directory -Force -Path (Join-Path $root 'logs') | Out-Null
$logFile = Join-Path $root 'logs\update.log'
$statFile = Join-Path $root 'logs\update-status.json'
function Log($m) { $l = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m; Add-Content -Path $logFile -Value $l -Encoding UTF8; Write-Host $l }
function Stat($state, $ok, $from, $to, $msg) {
  $o = [ordered]@{ state = $state; ok = $ok; time = (Get-Date).ToString('o'); from = $from; to = $to; message = $msg }
  [IO.File]::WriteAllText($statFile, ($o | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding $false))
}
Stat 'RUNNING' $null $null $null 'عم يحدّث ...'
Log 'Update gestartet'

# git finden: PATH, Standard-Installation, GitHub Desktop (eingebautes git)
$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git) { $git = @("$env:ProgramFiles\Git\cmd\git.exe", "${env:ProgramFiles(x86)}\Git\cmd\git.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1 }
if (-not $git) { $git = Get-ChildItem @('C:\Users\*\AppData\Local\GitHubDesktop\app-*\resources\app\git\cmd\git.exe','C:\Users\*\AppData\Local\GitHubDesktop\app-*\resources\app\git\mingw64\bin\git.exe') -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName }
if (-not $git) { Log 'FEHLER: git nicht gefunden'; Stat 'DONE' $false $null $null 'git مو موجود على هالكمبيوتر'; exit 1 }
Log "git: $git"

$sd = 'safe.directory=*'
function G { param([string[]]$a) $out = & $git -c $sd @a 2>&1; $script:gcode = $LASTEXITCODE; ($out | Out-String).Trim() }
$before = G @('rev-parse', 'HEAD')
$f = G @('fetch', 'origin', 'main'); if ($gcode -ne 0) { Log "fetch fehlgeschlagen: $f"; Stat 'DONE' $false $before $before ("ما قدرت أجيب التحديث: " + $f.Substring(0, [Math]::Min(300, $f.Length))); exit 1 }
$p = G @('pull', '--ff-only', 'origin', 'main')
if ($gcode -ne 0) { Log "pull fehlgeschlagen: $p"; Stat 'DONE' $false $before $before ("فشل الدمج، ما تغيّر شي: " + $p.Substring(0, [Math]::Min(300, $p.Length))); exit 1 }
$after = G @('rev-parse', 'HEAD')
Log "pull ok: $before -> $after"
if ($before -eq $after) { Stat 'DONE' $true $before $after 'النظام محدّث أصلاً، ما في جديد.'; exit 0 }

# nur den Server neu starten (nicht die Bruecken)
$port = 4185
$envFile = Join-Path $root '.env'
if (Test-Path $envFile) { foreach ($l in Get-Content $envFile) { if ($l -match '^\s*PORT\s*=\s*(\d+)') { $port = [int]$Matches[1]; break } } }
Stat 'RUNNING' $null $before $after 'نزل التحديث، عم يعيد تشغيل السيرفر ...'
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 3
$started = $false
try { Start-ScheduledTask -TaskName 'NARA-Server' -ErrorAction Stop; $started = $true } catch { Log "Task NARA-Server nicht startbar: $($_.Exception.Message)" }
if (-not $started) {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if ($node) { $env:PORT = "$port"; Start-Process -FilePath 'cmd.exe' -ArgumentList "/c cd /d `"$root`" && `"$node`" server.js >> logs\server.log 2>&1" -WindowStyle Hidden; $started = $true }
}
Start-Sleep -Seconds 6
$up = [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
if ($up) { Log 'Server laeuft wieder'; Stat 'DONE' $true $before $after 'تم التحديث وشغّال السيرفر ✅' }
else { Log 'FEHLER: Server nach Neustart nicht erreichbar'; Stat 'DONE' $false $before $after 'نزل التحديث بس السيرفر ما رجع. اضغط NARA Kasse على سطح المكتب.' }
