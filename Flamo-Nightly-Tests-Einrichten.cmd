@echo off
REM Plant die nächtlichen Tests (03:30) im Windows-Aufgabenplaner. Einmal ausführen.
set "DIR=%~dp0"
schtasks /create /tn "Flamo Nightly Tests" /tr "cmd /c cd /d \"%DIR%\" && node scripts\nightly-e2e.cjs" /sc daily /st 03:30 /f
echo.
echo Fertig. Test jetzt: schtasks /run /tn "Flamo Nightly Tests"
pause
