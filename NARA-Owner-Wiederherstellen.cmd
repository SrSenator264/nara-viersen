@echo off
rem Inhaber-Rolle zurueckholen (nur auf diesem PC).
rem Ablauf: NARA stoppen -> Inhaber wiederherstellen -> NARA nochmal stoppen (falls es automatisch neu gestartet wurde) -> NARA starten.
cd /d "%~dp0"
title NARA Inhaber wiederherstellen
call "%~dp0NARA-Stop.cmd"
ping -n 4 127.0.0.1 >nul
node scripts\restore-owner.cjs
echo.
echo Server wird neu gestartet / عم يعيد تشغيل السيرفر...
call "%~dp0NARA-Stop.cmd"
ping -n 4 127.0.0.1 >nul
call "%~dp0NARA-Start.cmd"
echo.
echo Fertig / خلص. سجّل دخول من جديد.
pause
