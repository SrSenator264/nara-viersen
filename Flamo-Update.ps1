# Flamo: sicheres Update. Nur der SERVER wird neu gestartet, die Plattform-Bruecken laufen weiter. Keine Geheimnisse im Skript.
# Wird vom Knopf in update.html ueber die Aufgabe Flamo-Update gestartet. Modus kommt aus logs\update-request.json:
#   update   = neue Version holen. Ablauf: Kontrolle der alten Version -> Daten-Backup -> git pull -> Code-Pruefung
#              (Server laeuft noch!) -> Neustart -> Gesundheits-Pruefung -> bei Fehler automatisch zurueck + Daten zurueck.
#   rollback = zurueck zur Version vor dem letzten erfolgreichen Update (Daten bleiben, nur Code).
#   test     = Schutz ausprobieren: Backup pruefen, Neustart, "so tun als ob kaputt", zurueck. Aendert weder Code noch Daten.
# Eine Version, die einmal zurueckgerollt wurde, wird nicht wieder installiert, bis eine neuere kommt (logs\update-blocked.json).
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$logFile = Join-Path $logs 'update.log'
$statFile = Join-Path $logs 'update-status.json'
$reqFile = Join-Path $logs 'update-request.json'
$histFile = Join-Path $logs 'update-history.json'
$blockFile = Join-Path $logs 'update-blocked.json'
$backupRoot = Join-Path $root 'backups\updates'
$utf8 = New-Object Text.UTF8Encoding $false
$script:mode = 'update'

function Log($m) { $l = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $script:mode, $m; Add-Content -Path $logFile -Value $l -Encoding UTF8; Write-Host $l }
function Save-Json($path, $obj) { [IO.File]::WriteAllText($path, (ConvertTo-Json -InputObject $obj -Depth 6 -Compress), $utf8) }
function Read-Json($path) { try { if (Test-Path $path) { return ([IO.File]::ReadAllText($path).TrimStart([char]0xFEFF) | ConvertFrom-Json) } } catch { } return $null }
function Stat($state, $ok, $from, $to, $msg) {
  Save-Json $statFile ([ordered]@{ state = $state; ok = $ok; mode = $script:mode; time = (Get-Date).ToString('o'); from = $from; to = $to; message = $msg })
}
function Short($s) { if ($s) { return "$s".Substring(0, [Math]::Min(7, "$s".Length)) } return '-' }
function Clip($s) { $t = "$s"; return $t.Substring(0, [Math]::Min(300, $t.Length)) }

# ---- Modus lesen (nur frische Anfrage, max. 10 Minuten alt) ----
$req = Read-Json $reqFile
Remove-Item $reqFile -Force -ErrorAction SilentlyContinue
if ($req -and $req.mode -and $req.at) {
  try {
    $at = $req.at  # PowerShell 7 macht aus ISO-Text schon ein DateTime, 5.1 nicht
    if ($at -isnot [datetime]) { $at = [datetime]::Parse("$at", [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind) }
    $age = ((Get-Date).ToUniversalTime() - $at.ToUniversalTime()).TotalMinutes
    if ($age -lt 10 -and @('update', 'rollback', 'test') -contains "$($req.mode)") { $script:mode = "$($req.mode)" }
  } catch { }
}

# ---- .env (Port, Telegram) ----
$cfg = @{}
$envFile = Join-Path $root '.env'
if (Test-Path $envFile) { foreach ($l in Get-Content $envFile -Encoding UTF8) { if ($l -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') { $cfg[$Matches[1]] = $Matches[2].Trim('"', "'") } } }
$port = 4185
if ("$($cfg['PORT'])" -match '^\d+$') { $port = [int]$cfg['PORT'] }
$base = "http://127.0.0.1:$port"

function Notify($text) {
  $bot = "$($cfg['TELEGRAM_BOT_TOKEN'])"
  $chats = @("$($cfg['TELEGRAM_CHAT_ID'])".Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if (-not $bot -or $chats.Count -eq 0) { Log 'Telegram nicht eingerichtet - keine Nachricht'; return }
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
  foreach ($c in $chats) {
    try {
      $body = ConvertTo-Json -InputObject ([ordered]@{ chat_id = $c; text = $text }) -Compress
      Invoke-RestMethod -Method Post -Uri ('https://api.telegram.org/bot' + $bot + '/sendMessage') -ContentType 'application/json; charset=utf-8' -Body ($utf8.GetBytes($body)) -TimeoutSec 10 | Out-Null
    } catch { Log ('Telegram fehlgeschlagen: ' + "$($_.Exception.Message)".Replace($bot, '***')) }
  }
}

function Add-History($ok, $from, $to, $msg) {
  $list = New-Object System.Collections.ArrayList
  [void]$list.Add([ordered]@{ time = (Get-Date).ToString('o'); mode = $script:mode; ok = $ok; from = $from; to = $to; message = $msg })
  $old = Read-Json $histFile
  if ($old) { foreach ($x in $old) { if ($list.Count -lt 30) { [void]$list.Add($x) } } }
  Save-Json $histFile @($list.ToArray())
}
function Block-Version($sha, $why) { if ($sha) { Save-Json $blockFile ([ordered]@{ sha = $sha; time = (Get-Date).ToString('o'); reason = $why }) } }
function Finish($ok, $from, $to, $msg, $tg) {
  if ($ok) { Log "FERTIG ok: $msg" } else { Log "FERTIG FEHLER: $msg" }
  Stat 'DONE' $ok $from $to $msg
  Add-History $ok $from $to $msg
  if ($tg) { Notify $tg }
  if ($ok) { exit 0 } else { exit 1 }
}

Stat 'RUNNING' $null $null $null 'عم يبلّش ...'
Log "Start (Modus $($script:mode))"

# ---- git und node finden (PATH, Standard-Installation, GitHub Desktop) ----
$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git) { $git = @("$env:ProgramFiles\Git\cmd\git.exe", "${env:ProgramFiles(x86)}\Git\cmd\git.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1 }
if (-not $git) { $git = Get-ChildItem @('C:\Users\*\AppData\Local\GitHubDesktop\app-*\resources\app\git\cmd\git.exe', 'C:\Users\*\AppData\Local\GitHubDesktop\app-*\resources\app\git\mingw64\bin\git.exe') -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName }
if (-not $git) { Finish $false $null $null 'git مو موجود على هالكمبيوتر، ما تغيّر شي.' $null }
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1 }
Log "git: $git | node: $node"

$sd = 'safe.directory=*'
function G { param([string[]]$a) $out = & $git -c $sd @a 2>&1; $script:gcode = $LASTEXITCODE; ($out | Out-String).Trim() }
function Head { G @('rev-parse', 'HEAD') }

# ---- Code-Pruefung (scripts\update-check.cjs der Version, die gerade auf der Platte liegt) ----
function Run-Check {
  $chk = Join-Path $root 'scripts\update-check.cjs'
  if (-not $node -or -not (Test-Path $chk)) { return $null }
  $o = & $node $chk $root 2>&1 | Out-String
  try { return ($o.Trim() | ConvertFrom-Json) } catch { return [pscustomobject]@{ ok = $false; failed = @([pscustomobject]@{ file = 'scripts/update-check.cjs'; error = (Clip $o) }) } }
}
function Failed-Files($r) { $s = @(); if ($r -and $r.failed) { foreach ($f in $r.failed) { $s += "$($f.file)" } } return $s }

# ---- npm nur wenn sich package.json / package-lock.json geaendert hat ----
function Deps-Changed($a, $b) { if (-not $a -or -not $b -or $a -eq $b) { return $false } $d = G @('diff', '--name-only', $a, $b, '--', 'package.json', 'package-lock.json'); return [bool]$d }
function Npm-Install {
  if (-not $node) { return $false }
  $npm = Join-Path (Split-Path $node) 'npm.cmd'
  if (-not (Test-Path $npm)) { $npm = (Get-Command npm -ErrorAction SilentlyContinue).Source }
  if (-not $npm) { Log 'npm nicht gefunden'; return $false }
  Log 'npm install (Abhaengigkeiten geaendert) ...'
  $o = & $npm install --no-audit --no-fund 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { Log ('npm install fehlgeschlagen: ' + (Clip $o)); return $false }
  return $true
}

# ---- Daten sichern / zurueckholen (data\*.json = Bestellungen, Konten, Kunden, Einstellungen) ----
function Backup-Data($tag) {
  $dir = Join-Path $backupRoot ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $tag)
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $src = Join-Path $root 'data'
  if (Test-Path $src) { foreach ($f in (Get-ChildItem -Path $src -File | Where-Object { $_.Extension -eq '.json' })) { Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $dir $f.Name) -Force } }
  $v = $null
  if ($node) { $o = & $node (Join-Path $root 'scripts\update-check.cjs') --verify-backup $dir 2>&1 | Out-String; try { $v = $o.Trim() | ConvertFrom-Json } catch { $v = $null } }
  # alte Sicherungen aufraeumen: die neuesten 15 bleiben
  Get-ChildItem -Path $backupRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -Skip 15 | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  $n = @(Get-ChildItem -Path $dir -File -ErrorAction SilentlyContinue).Count
  return [pscustomobject]@{ dir = $dir; count = $n; verified = [bool]($v -and $v.ok) ; checked = [bool]$v }
}
function Restore-Data($dir) {
  if (-not $dir -or -not (Test-Path $dir)) { return }
  $dst = Join-Path $root 'data'
  $keep = Join-Path $backupRoot ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-stand-vom-fehler')
  New-Item -ItemType Directory -Force -Path $keep | Out-Null
  foreach ($f in (Get-ChildItem -Path $dst -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -eq '.json' })) { Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $keep $f.Name) -Force }
  foreach ($f in (Get-ChildItem -Path $dir -File | Where-Object { $_.Extension -eq '.json' })) { Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $dst $f.Name) -Force }
  Log "Daten zurueckgeholt aus $dir (Stand vom Fehler aufgehoben in $keep)"
}

# ---- Code auf eine Version setzen ----
function Reset-Code($sha) {
  $r = G @('reset', '--keep', $sha)
  if ($gcode -ne 0) {
    Log "reset --keep ging nicht ($(Clip $r)) -> lokale Aenderungen in git stash, dann reset --hard"
    G @('stash', 'push', '-m', ('flamo-update ' + (Get-Date -Format 'yyyyMMdd-HHmmss'))) | Out-Null
    G @('reset', '--hard', $sha) | Out-Null
  }
  return ((Head) -eq $sha)
}

# ---- Server stoppen / starten / pruefen ----
function Stop-Server {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  for ($i = 0; $i -lt 15; $i++) { if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Seconds 1 }
  Start-Sleep -Seconds 1
}
function Start-Server {
  $started = $false
  try { Start-ScheduledTask -TaskName 'NARA-Server' -ErrorAction Stop; $started = $true } catch { Log "Aufgabe NARA-Server nicht startbar: $($_.Exception.Message)" }
  if (-not $started -and $node) { $env:PORT = "$port"; Start-Process -FilePath 'cmd.exe' -ArgumentList "/c cd /d `"$root`" && `"$node`" server.js >> logs\server.log 2>&1" -WindowStyle Hidden; $started = $true }
  return $started
}
function Http($p) {
  try { $r = Invoke-WebRequest -Uri ($base + $p) -UseBasicParsing -TimeoutSec 8; return [pscustomobject]@{ code = [int]$r.StatusCode; body = [string]$r.Content } }
  catch { $c = 0; try { $c = [int]$_.Exception.Response.StatusCode } catch { }; return [pscustomobject]@{ code = $c; body = '' } }
}
# gibt $null zurueck wenn alles gesund ist, sonst den Grund (Arabisch, fuer die Seite)
function Test-Health {
  $up = $false; $until = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $until) { $h = Http '/api/health'; if ($h.code -eq 200 -and $h.body -match '"ok"\s*:\s*true') { $up = $true; break }; Start-Sleep -Seconds 2 }
  if (-not $up) { return 'السيرفر ما رجع يرد خلال دقيقة' }
  Start-Sleep -Seconds 4  # bleibt er auch oben?
  $checks = @(
    @{ p = '/api/health'; m = '"ok"\s*:\s*true' },
    @{ p = '/api/auth/me'; m = '"ok"\s*:\s*true' },
    @{ p = '/api/menu'; m = '"categories"' },
    @{ p = '/kasse.html'; m = 'nara-auth\.js' },
    @{ p = '/live-orders.html'; m = 'nara-auth\.js' },
    @{ p = '/nara-app.html'; m = 'nara-auth\.js' }
  )
  foreach ($c in $checks) {
    $good = $false
    for ($i = 0; $i -lt 3; $i++) { $r = Http $c.p; if ($r.code -eq 200 -and $r.body -match $c.m) { $good = $true; break }; Start-Sleep -Seconds 2 }
    if (-not $good) { return ('الفحص فشل عند ' + $c.p) }
  }
  return $null
}
function Restart-And-Check { Stop-Server; if (-not (Start-Server)) { return 'ما قدرت شغّل السيرفر' }; return (Test-Health) }

$cur = Head
if (-not ($cur -match '^[0-9a-f]{40}$')) { Finish $false $null $null ('ما قدرت أقرا النسخة الحالية: ' + (Clip $cur)) $null }

# =====================================================================
if ($script:mode -eq 'test') {
  Stat 'RUNNING' $null $cur $cur '🧪 تجربة الحماية: عم نحفظ نسخة من البيانات ...'
  $bk = Backup-Data 'test'
  if ($bk.count -eq 0) { Finish $false $cur $cur '🧪 التجربة فشلت: ما لقيت ملفات بيانات لأحفظها (data\*.json).' '🧪❌ Flamo: تجربة الحماية فشلت، ما في ملفات بيانات.' }
  if ($bk.checked -and -not $bk.verified) { Finish $false $cur $cur '🧪 التجربة فشلت: النسخة الاحتياطية ما بتنقرا.' '🧪❌ Flamo: النسخة الاحتياطية ما بتنقرا.' }
  $chk = Run-Check
  if ($chk -and -not $chk.ok) { Log ('Hinweis: Pruefung meldet schon jetzt: ' + ((Failed-Files $chk) -join ', ')) }
  Stat 'RUNNING' $null $cur $cur '🧪 عم نعيد تشغيل السيرفر ونفحصه ...'
  $e1 = Restart-And-Check
  if ($e1) { Finish $false $cur $cur ("🧪 مشكلة حقيقية: بعد إعادة التشغيل $e1. اضغط NARA Kasse على سطح المكتب.") ("🚨 Flamo: بتجربة الحماية السيرفر ما رجع ($e1).") }
  Stat 'RUNNING' $null $cur $cur '🧪 عم نعمل كأنو التحديث خربان ونرجع للنسخة القديمة ...'
  Log 'Test: simulierter Fehler -> Rueckweg'
  Stop-Server
  if (-not (Reset-Code $cur)) { Finish $false $cur (Head) '🧪 التجربة فشلت: الرجوع للنسخة ما زبط.' '🚨 Flamo: بتجربة الحماية الرجوع للنسخة ما زبط.' }
  if (-not (Start-Server)) { Finish $false $cur $cur '🧪 التجربة فشلت: ما قدرت شغّل السيرفر.' '🚨 Flamo: بتجربة الحماية السيرفر ما اشتغل.' }
  $e2 = Test-Health
  if ($e2) { Finish $false $cur $cur ("🧪 التجربة فشلت بعد الرجوع: $e2") ("🚨 Flamo: بتجربة الحماية بعد الرجوع: $e2") }
  $msg = "🧪 التجربة نجحت ✅ النسخة الاحتياطية ($($bk.count) ملفات) سليمة، وإعادة التشغيل والفحص والرجوع كلهم شغّالين."
  Finish $true $cur $cur $msg ('🧪✅ Flamo: تجربة حماية التحديث نجحت. ' + "($($bk.count) ملفات بيانات محفوظة)")
}

# =====================================================================
if ($script:mode -eq 'rollback') {
  $target = $null
  $hist = Read-Json $histFile
  if ($hist) { foreach ($h in $hist) { if (-not $target -and $h.ok -and "$($h.mode)" -eq 'update' -and "$($h.to)" -eq $cur -and "$($h.from)" -match '^[0-9a-f]{40}$' -and "$($h.from)" -ne $cur) { $target = "$($h.from)" } } }
  if (-not $target) { Finish $false $cur $cur 'ما في نسخة سابقة معروفة لهالنسخة، ما تغيّر شي.' $null }
  Stat 'RUNNING' $null $cur $target ('↩️ عم نرجع للنسخة ' + (Short $target) + ' ...')
  $bk = Backup-Data 'pre-rollback'
  Stop-Server
  if (-not (Reset-Code $target)) { Reset-Code $cur | Out-Null; Start-Server | Out-Null; Finish $false $cur (Head) 'الرجوع ما زبط، ضلّينا على النسخة الحالية.' '⚠️ Flamo: الرجوع للنسخة السابقة ما زبط.' }
  if (Deps-Changed $cur $target) { Npm-Install | Out-Null }
  Start-Server | Out-Null
  $e = Test-Health
  if (-not $e) { Block-Version $cur 'manual rollback'; Finish $true $cur $target ('↩️ رجعنا للنسخة ' + (Short $target) + ' والسيرفر شغّال ✅ النسخة ' + (Short $cur) + ' ما رح تنركّب مرة تانية لحتى ينزل تحديث أجدد.') ('↩️ Flamo: رجعنا للنسخة ' + (Short $target) + ' والسيرفر شغّال.') }
  Log "Rollback-Version ungesund ($e) -> zurueck auf $cur"
  Stop-Server; Reset-Code $cur | Out-Null
  if (Deps-Changed $target $cur) { Npm-Install | Out-Null }
  Start-Server | Out-Null
  $e2 = Test-Health
  if (-not $e2) { Finish $false $cur $cur ("النسخة السابقة ما اشتغلت ($e)، فرجعنا للنسخة الحالية وهي شغّالة ✅") ('⚠️ Flamo: النسخة السابقة ما اشتغلت، رجعنا للحالية وهي شغّالة.') }
  Finish $false $cur $cur ("🚨 لا السابقة ولا الحالية ردّت ($e2). اضغط NARA Kasse على سطح المكتب.") ('🚨 Flamo: السيرفر ما عم يرد بعد محاولة الرجوع! ' + $e2)
}

# =====================================================================
# update
$before = $cur
$baseline = Run-Check
$baseFail = Failed-Files $baseline
if ($baseFail.Count) { Log ('Alte Version hat schon Pruefungsfehler (zaehlen nicht): ' + ($baseFail -join ', ')) }

Stat 'RUNNING' $null $before $null 'عم جيب آخر نسخة ...'
$f = G @('fetch', 'origin', 'main')
if ($gcode -ne 0) { Finish $false $before $before ('ما قدرت أجيب التحديث: ' + (Clip $f)) $null }
$remote = G @('rev-parse', 'origin/main')
if ($remote -eq $before) { Log 'schon aktuell'; Stat 'DONE' $true $before $before 'النظام محدّث أصلاً، ما في جديد.'; exit 0 }
$blocked = Read-Json $blockFile
if ($blocked -and "$($blocked.sha)" -eq $remote) { Finish $false $before $before ('النسخة ' + (Short $remote) + ' انرجعنا عنها قبل، فما رح نركّبها مرة تانية. استنى نسخة أجدد على GitHub.') $null }

Stat 'RUNNING' $null $before $remote 'عم نحفظ نسخة من البيانات ...'
$bk = Backup-Data 'pre-update'
if ($bk.checked -and -not $bk.verified) { Finish $false $before $before 'النسخة الاحتياطية للبيانات ما بتنقرا، فوقّفنا التحديث. ما تغيّر شي.' '⚠️ Flamo: التحديث توقّف لأنو النسخة الاحتياطية ما بتنقرا.' }
Log "Backup: $($bk.count) Dateien in $($bk.dir)"

$p = G @('pull', '--ff-only', 'origin', 'main')
if ($gcode -ne 0) { Finish $false $before $before ('فشل الدمج، ما تغيّر شي: ' + (Clip $p)) $null }
$after = Head
Log "pull ok: $before -> $after"

# Pruefung, WAEHREND der alte Server noch laeuft
Stat 'RUNNING' $null $before $after 'عم نفحص النسخة الجديدة (الكاشير لسا شغّال) ...'
$depsChanged = Deps-Changed $before $after
$why = $null
if ($depsChanged -and -not (Npm-Install)) { $why = 'تنزيل المكتبات (npm) فشل' }
if (-not $why) {
  $chk = Run-Check
  if ($node -and -not $chk) { $why = 'سكربت الفحص ما اشتغل' }
  elseif ($chk -and -not $chk.ok) {
    $new = @(Failed-Files $chk | Where-Object { $baseFail -notcontains $_ } | Select-Object -Unique)
    if ($new.Count) { $why = ('في أخطاء بالكود: ' + (($new | Select-Object -First 4) -join ', ')) }
  }
}
if ($why) {
  Reset-Code $before | Out-Null
  if ($depsChanged) { Npm-Install | Out-Null }
  Block-Version $after $why
  Finish $false $before $before ("❌ $why. رجعنا للنسخة القديمة، والسيرفر ما وقف أبداً ✅") ('⚠️ Flamo: التحديث ' + (Short $after) + " انرفض قبل التشغيل ($why). الكاشير شغّال على النسخة القديمة.")
}

Stat 'RUNNING' $null $before $after 'الفحص تمام، عم نعيد تشغيل السيرفر ...'
$e = Restart-And-Check
if (-not $e) { Finish $true $before $after 'تم التحديث وفحصنا السيرفر، شغّال ✅' ('✅ Flamo: تم التحديث إلى ' + (Short $after) + ' والفحص تمام.') }

# ---- automatisch zurueck ----
Log "Neue Version ungesund: $e -> Rueckweg"
Stat 'RUNNING' $null $before $after ("في مشكلة ($e)، عم نرجع للنسخة القديمة ...")
Stop-Server
Reset-Code $before | Out-Null
if ($depsChanged) { Npm-Install | Out-Null }
Restore-Data $bk.dir
Block-Version $after $e
Start-Server | Out-Null
$e2 = Test-Health
if (-not $e2) { Finish $false $before $before ("❌ التحديث فشل ($e). رجعنا للنسخة القديمة لحالنا، والكاشير شغّال ✅") ('⚠️ Flamo: التحديث ' + (Short $after) + " فشل ($e) ورجعنا للنسخة القديمة تلقائياً. الكاشير شغّال.") }
Finish $false $before $before ("🚨 التحديث فشل والرجوع كمان ما ردّ ($e2). اضغط NARA Kasse على سطح المكتب.") ('🚨 Flamo: التحديث فشل والسيرفر ما عم يرد بعد الرجوع! ' + $e2)
