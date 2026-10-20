@echo off
setlocal
title Flamo - Daten einspielen (SHOP-PC)
cd /d "%~dp0"
set "ZIP="
for %%p in ("%USERPROFILE%\Downloads\flamo-daten.zip" "%USERPROFILE%\OneDrive\Downloads\flamo-daten.zip" "%USERPROFILE%\Desktop\flamo-daten.zip" "%USERPROFILE%\OneDrive\Desktop\flamo-daten.zip") do if exist %%p set "ZIP=%%~p"
if "%ZIP%"=="" (echo FEHLER: flamo-daten.zip nicht gefunden ^(Downloads/Desktop^) & pause & exit /b 1)
echo Gefunden: %ZIP%
echo Stoppe NARA ...
call "%~dp0NARA-Stop.cmd"
timeout /t 3 /nobreak >nul
set "TS=%DATE:~6,4%%DATE:~3,2%%DATE:~0,2%-%TIME:~0,2%%TIME:~3,2%"
set "TS=%TS: =0%"
if exist "%~dp0data" robocopy "%~dp0data" "C:\Flamo-Backup\data-vorher-%TS%" /E /NFL /NDL /NJH /NJS >nul
set "X=%TEMP%\flamo-unpack"
if exist "%X%" rmdir /s /q "%X%"
powershell -NoProfile -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%X%' -Force"
if errorlevel 1 (echo FEHLER beim Entpacken & pause & exit /b 1)
if not exist "%X%\data" (echo FEHLER: data im Zip fehlt & pause & exit /b 1)
robocopy "%X%\data" "%~dp0data" /E /NFL /NDL /NJH /NJS >nul
for %%d in (data sides-data uber-data) do (
  if exist "%X%\pw\%%d" robocopy "%X%\pw\%%d" "C:\Flamo-Playwright\%%d" /E /NFL /NDL /NJH /NJS >nul
)
rmdir /s /q "%X%"
echo Starte NARA ...
call "%~dp0NARA-Start.cmd"
echo.
echo Fertig. Backup der alten Daten: C:\Flamo-Backup
pause
