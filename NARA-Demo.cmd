@echo off
rem Demo-Bestellungen fuer Kueche/Live Orders/Fahrer. "NARA-Demo.cmd clear" loescht sie wieder (storniert).
cd /d "%~dp0"
set "PORT=4185"
if exist ".env" for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do if /i "%%a"=="PORT" set "PORT=%%b"
node scripts\demo-orders.mjs %1
pause
