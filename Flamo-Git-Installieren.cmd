@echo off
net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'"
  exit /b
)
title Flamo - Git installieren
winget install --id Git.Git -e --source winget --silent --accept-source-agreements --accept-package-agreements
echo.
if exist "%ProgramFiles%\Git\cmd\git.exe" (echo OK: Git ist installiert: %ProgramFiles%\Git\cmd\git.exe) else (echo FEHLER: git.exe nicht gefunden)
pause
