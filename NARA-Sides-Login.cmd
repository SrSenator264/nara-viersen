@echo off
rem Sides Auto-Login: Zugangsdaten einmal verschluesselt speichern (nur auf diesem PC).
setlocal
cd /d "%~dp0"
if exist ".env" for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
  if /i "%%a"=="SIDES_DATA_DIR" set "SIDES_DATA_DIR=%%b"
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sides-login-save.ps1"
pause
