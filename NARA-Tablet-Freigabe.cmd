@echo off
rem Einmalig: NARA fuer Tablets/Handys im Laden-WLAN freigeben (HOST=0.0.0.0) und Verbindungsseite mit QR-Codes oeffnen.
cd /d "%~dp0"
title NARA Tablet-Freigabe
set "PORT=4185"
if exist ".env" for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do if /i "%%a"=="PORT" set "PORT=%%b"
findstr /b /i /c:"HOST=" .env >nul 2>&1
if errorlevel 1 (
  >>.env echo.
  >>.env echo HOST=0.0.0.0
  echo HOST=0.0.0.0 wurde in .env eingetragen.
) else (
  echo HOST steht schon in .env - bitte pruefen, dass es HOST=0.0.0.0 ist.
)
echo.
echo Falls Windows nach der Firewall fragt: "Private Netzwerke" erlauben.
call "%~dp0NARA-Stop.cmd"
ping -n 3 127.0.0.1 >nul
call "%~dp0NARA-Start.cmd"
ping -n 4 127.0.0.1 >nul
start "" "http://localhost:%PORT%/connect.html"
