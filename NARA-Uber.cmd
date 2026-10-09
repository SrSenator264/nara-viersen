@echo off
rem NARA Uber-Bridge: liest die Uber-Eats-Bestellungen (merchants.ubereats.com/orders) (nur lesen) und schickt sie an die Kasse.
rem Wird von NARA-Start.cmd automatisch gestartet. Startet sich selbst neu, falls es abstuerzt.
setlocal
cd /d "%~dp0"
set "PORT=4185"
if exist ".env" for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
  if /i "%%a"=="PORT" set "PORT=%%b"
  if /i "%%a"=="NARA_SERVICE_KEY" set "NARA_SERVICE_KEY=%%b"
  if /i "%%a"=="UBER_URL" set "UBER_URL=%%b"
  if /i "%%a"=="UBER_PLAYWRIGHT_PROFILE" set "UBER_PLAYWRIGHT_PROFILE=%%b"
)
set "NARA_BASE_URL=http://127.0.0.1:%PORT%"
if not exist "logs" mkdir "logs"
:loop
echo [%date% %time%] Uber-Bridge startet (Server %NARA_BASE_URL%) >> logs\uber.log
node uber-bridge.mjs >> logs\uber.log 2>&1
echo [%date% %time%] Bridge beendet - Neustart in 15 Sekunden >> logs\uber.log
ping -n 16 127.0.0.1 >nul
goto loop
