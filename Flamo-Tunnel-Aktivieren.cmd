@echo off
net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'"
  exit /b
)
title Flamo - Tunnel aktivieren (SHOP-PC)
powershell -NoProfile -Command "Enable-ScheduledTask -TaskName cloudflared-nara | Out-Null; Start-ScheduledTask -TaskName cloudflared-nara; Start-Sleep 8; Get-ScheduledTask cloudflared-nara | Select-Object -ExpandProperty State; if(Get-Process cloudflared -ErrorAction SilentlyContinue){'cloudflared LAEUFT'}else{'cloudflared LAEUFT NICHT'}"
echo.
pause
