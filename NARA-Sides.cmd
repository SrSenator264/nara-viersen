@echo off
rem NARA Sides-Bridge (Loco Chicken): liest die Sides-Bestellungen (nur lesen) und schickt sie an die Kasse.
rem Wird von NARA-Start.cmd automatisch gestartet. Startet sich selbst neu, falls es abstuerzt.
setlocal
cd /d "%~dp0"
set "PORT=4185"
if exist ".env" for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
  if /i "%%a"=="PORT" set "PORT=%%b"
  if /i "%%a"=="NARA_SERVICE_KEY" set "NARA_SERVICE_KEY=%%b"
  if /i "%%a"=="SIDES_URL" set "SIDES_URL=%%b"
  if /i "%%a"=="SIDES_PLAYWRIGHT_PROFILE" set "SIDES_PLAYWRIGHT_PROFILE=%%b"
)
set "NARA_BASE_URL=http://127.0.0.1:%PORT%"
if not exist "logs" mkdir "logs"
:loop
echo [%date% %time%] Sides-Bridge startet (Server %NARA_BASE_URL%) >> logs\sides.log
node sides-bridge.mjs >> logs\sides.log 2>&1
echo [%date% %time%] Bridge beendet - Neustart in 15 Sekunden >> logs\sides.log
timeout /t 15 /nobreak >nul
goto loop
