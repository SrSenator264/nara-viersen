@echo off
setlocal
cd /d "%~dp0"
set "PORT=4185"
if exist ".env" for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do if /i "%%a"=="PORT" set "PORT=%%b"
if not exist "logs" mkdir "logs"
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul
if errorlevel 1 (
  start "NARA Server (nicht schliessen)" /min cmd /c "node server.js >> logs\server.log 2>&1"
  timeout /t 3 /nobreak >nul
)
start "" "http://localhost:%PORT%/kasse.html"
rem Lieferando-Bridge nur starten, wenn sie noch nicht laeuft (schnelle Pruefung, blockiert die Kasse nicht)
powershell -NoProfile -Command "if(Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" | Where-Object { $_.CommandLine -like '*NARA-Lieferando.cmd*' }){exit 0}else{exit 1}" >nul 2>&1
if errorlevel 1 start "NARA Lieferando (nicht schliessen)" /min cmd /c ""%~dp0NARA-Lieferando.cmd""
powershell -NoProfile -Command "if(Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" | Where-Object { $_.CommandLine -like '*NARA-Sides.cmd*' }){exit 0}else{exit 1}" >nul 2>&1
if errorlevel 1 start "NARA Sides Loco (nicht schliessen)" /min cmd /c ""%~dp0NARA-Sides.cmd""
exit /b 0
