@echo off
rem Inhaber-Rolle zurueckholen (nur auf diesem PC). Stoppt NARA, stellt den Inhaber wieder her, startet NARA wieder.
cd /d "%~dp0"
title NARA Inhaber wiederherstellen
call "%~dp0NARA-Stop.cmd"
ping -n 3 127.0.0.1 >nul
node scripts\restore-owner.cjs
echo.
pause
call "%~dp0NARA-Start.cmd"
