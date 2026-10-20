@echo off
setlocal
title Flamo - Daten einspielen (SHOP-PC)
cd /d "%~dp0"
set "Z1="
set "Z2="
if exist "%~dp0nara-data.zip" set "Z1=%~dp0nara-data.zip"
if exist "%~dp0platform-data.zip" set "Z2=%~dp0platform-data.zip"
if not "%Z1%"=="" goto :found
for /f "usebackq delims=" %%a in (`powershell -NoProfile -Command "$d=@((New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path,[Environment]::GetFolderPath('Desktop'),(Join-Path $env:USERPROFILE 'Downloads'),(Join-Path $env:USERPROFILE 'OneDrive\Downloads'));$f=Get-ChildItem -Path $d -Filter nara-data.zip -ErrorAction SilentlyContinue|Select-Object -First 1;if($f){$f.FullName}"`) do set "Z1=%%a"
for /f "usebackq delims=" %%a in (`powershell -NoProfile -Command "$d=@((New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path,[Environment]::GetFolderPath('Desktop'),(Join-Path $env:USERPROFILE 'Downloads'),(Join-Path $env:USERPROFILE 'OneDrive\Downloads'));$f=Get-ChildItem -Path $d -Filter platform-data.zip -ErrorAction SilentlyContinue|Select-Object -First 1;if($f){$f.FullName}"`) do set "Z2=%%a"
:found
if "%Z1%"=="" (echo FEHLER: nara-data.zip nicht gefunden ^(weder in C:\Flamo noch Downloads^) & pause & exit /b 1)
echo Kundendaten: %Z1%
if "%Z2%"=="" (echo Plattform-Daten: nicht vorhanden ^(wird uebersprungen^) ) else echo Plattform-Daten: %Z2%
echo Stoppe NARA ...
call "%~dp0NARA-Stop.cmd"
timeout /t 3 /nobreak >nul
set "TS=%DATE:~6,4%%DATE:~3,2%%DATE:~0,2%-%TIME:~0,2%%TIME:~3,2%"
set "TS=%TS: =0%"
if exist "%~dp0data" robocopy "%~dp0data" "C:\Flamo-Backup\data-vorher-%TS%" /E /NFL /NDL /NJH /NJS >nul
set "X=%TEMP%\flamo-unpack"
if exist "%X%" rmdir /s /q "%X%"
powershell -NoProfile -Command "Expand-Archive -LiteralPath '%Z1%' -DestinationPath '%X%\a' -Force"
if errorlevel 1 (echo FEHLER beim Entpacken & pause & exit /b 1)
set "SRC=%X%\a\data"
if not exist "%SRC%" set "SRC=%X%\a"
robocopy "%SRC%" "%~dp0data" /E /NFL /NDL /NJH /NJS >nul
if not "%Z2%"=="" (
  powershell -NoProfile -Command "Expand-Archive -LiteralPath '%Z2%' -DestinationPath '%X%\b' -Force"
  for %%d in (data sides-data uber-data) do if exist "%X%\b\%%d" robocopy "%X%\b\%%d" "C:\Flamo-Playwright\%%d" /E /NFL /NDL /NJH /NJS >nul
)
rmdir /s /q "%X%"
echo Starte NARA ...
call "%~dp0NARA-Start.cmd"
echo.
echo Fertig. Backup der alten Daten: C:\Flamo-Backup
pause
