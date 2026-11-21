@echo off
rem Realistische Test-Bestellungen (Kasse, Vor Ort, Website, Lieferando, Uber, Loco). "NARA-Simulate.cmd 60" = 60 Bestellungen. "NARA-Simulate.cmd clear" storniert sie wieder.
rem Alles isTest: nichts geht an die TSE, in die Buchhaltung oder die Tagesabschluss-Zahlen.
cd /d "%~dp0"
set "PORT=4185"
if exist ".env" for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do if /i "%%a"=="PORT" set "PORT=%%b"
node scripts\simulate-orders.mjs %1 %2
pause
