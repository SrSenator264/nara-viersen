@echo off
rem Sides Auto-Login: Zugangsdaten einmal verschluesselt speichern (nur auf diesem PC).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sides-login-save.ps1"
pause
