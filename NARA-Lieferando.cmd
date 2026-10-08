@echo off
rem NARA Lieferando-Bridge: liest die Live-Bestellungen (Playwright) und schickt sie an die Kasse.
rem Wird von NARA-Start.cmd automatisch gestartet. Startet sich selbst neu, falls es abstuerzt.
setlocal
cd /d "%~dp0"
set "PORT=4185"
if exist ".env" for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
  if /i "%%a"=="PORT" set "PORT=%%b"
  if /i "%%a"=="NARA_SERVICE_KEY" set "NARA_SERVICE_KEY=%%b"
  if /i "%%a"=="NARA_PLAYWRIGHT_PROFILE" set "NARA_PLAYWRIGHT_PROFILE=%%b"
  if /i "%%a"=="NARA_DATA_DIR" set "NARA_DATA_DIR=%%b"
  if /i "%%a"=="NARA_PRINTER_HOST" set "NARA_PRINTER_HOST=%%b"
  if /i "%%a"=="NARA_PRINTER_PORT" set "NARA_PRINTER_PORT=%%b"
  if /i "%%a"=="NARA_RECEIPT_LANG" set "NARA_RECEIPT_LANG=%%b"
)
set "NARA_BASE_URL=http://127.0.0.1:%PORT%"
if not exist "logs" mkdir "logs"
:loop
echo [%date% %time%] Lieferando-Bridge startet (Server %NARA_BASE_URL%) >> logs\lieferando.log
node lieferando-playwright-bridge.mjs >> logs\lieferando.log 2>&1
echo [%date% %time%] Bridge beendet - Neustart in 15 Sekunden >> logs\lieferando.log
ping -n 16 127.0.0.1 >nul
goto loop
