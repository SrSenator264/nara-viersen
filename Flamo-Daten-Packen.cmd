@echo off
setlocal
title Flamo - Daten packen (ALTER PC)
cd /d "%~dp0"
echo Stoppe NARA ...
call "%~dp0NARA-Stop.cmd"
timeout /t 3 /nobreak >nul
set "STG=%TEMP%\flamo-pack"
set "OUT=%USERPROFILE%\Desktop\flamo-daten.zip"
if exist "%STG%" rmdir /s /q "%STG%"
mkdir "%STG%"
if not exist "%~dp0data" (echo FEHLER: %~dp0data nicht gefunden & pause & exit /b 1)
robocopy "%~dp0data" "%STG%\data" /E /NFL /NDL /NJH /NJS >nul
for %%d in (data sides-data uber-data) do (
  if exist "D:\NARA-Playwright\%%d" robocopy "D:\NARA-Playwright\%%d" "%STG%\pw\%%d" /E /NFL /NDL /NJH /NJS >nul
)
if exist "%OUT%" del "%OUT%"
powershell -NoProfile -Command "Compress-Archive -Path '%STG%\*' -DestinationPath '%OUT%' -CompressionLevel Optimal"
if errorlevel 1 (echo FEHLER beim Packen & pause & exit /b 1)
rmdir /s /q "%STG%"
for %%f in ("%OUT%") do echo.&echo Fertig: %%~nxf  (%%~zf Bytes) liegt auf dem Desktop.
echo Jetzt per Taildrop an kassie senden. Das NARA auf diesem PC bleibt GESTOPPT.
pause
