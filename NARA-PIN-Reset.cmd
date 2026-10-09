@echo off
rem PIN vom Inhaber neu setzen (nur auf diesem PC). Stoppt NARA, setzt den PIN, startet NARA wieder.
cd /d "%~dp0"
title NARA PIN zuruecksetzen
call "%~dp0NARA-Stop.cmd"
ping -n 3 127.0.0.1 >nul
node scripts\reset-owner-pin.cjs
echo.
pause
call "%~dp0NARA-Start.cmd"
