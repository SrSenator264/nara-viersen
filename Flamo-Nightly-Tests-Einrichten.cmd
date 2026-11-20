@echo off
REM Plant die naechtlichen Tests (03:30) im Windows-Aufgabenplaner. Einmal ausfuehren.
schtasks /create /tn "Flamo Nightly Tests" /tr "\"%~dp0scripts\run-nightly.cmd\"" /sc daily /st 03:30 /f
if errorlevel 1 (
  echo FEHLER: Aufgabe wurde NICHT angelegt.
) else (
  echo Fertig. Test jetzt mit: schtasks /run /tn "Flamo Nightly Tests"
)
pause
