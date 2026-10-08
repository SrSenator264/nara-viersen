@echo off
setlocal
cd /d "%~dp0"
set "PORT=4185"
if exist ".env" for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do if /i "%%a"=="PORT" set "PORT=%%b"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do taskkill /PID %%p /F >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" | Where-Object { ($_.CommandLine -like '*NARA-Lieferando.cmd*' -or $_.CommandLine -like '*NARA-Sides.cmd*') } | ForEach-Object { taskkill /PID $_.ProcessId /T /F }" >nul 2>&1
exit /b 0
