@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PYTHON=D:\NARA-OCR-PY312\Scripts\python.exe"
set "OCR=%~dp0local-ocr-test.py"
set "OUT=%~dp0local-ocr-output\benchmarks"
if not exist "%OUT%" mkdir "%OUT%"

echo [NARA] Verified benchmark set:
echo   500282754: doc_mukj0krf_oywysk_002.jpeg only
echo   500306999: doc_mug0lcap_d830l5_001.jpeg + _002.jpeg
echo [NARA] The 500282754 document pair is intentionally not used because its _001 page is 500282875.

echo [NARA] Reusing existing verified 500282754 OCR/evidence; no rerun.
if not exist "%OUT%\500282754\lightweight" mkdir "%OUT%\500282754\lightweight"
robocopy "%~dp0local-ocr-output\lightweight" "%OUT%\500282754\lightweight" /E /NFL /NDL /NJH /NJS >nul
call :run_one "500306999" "%~dp0data\documents\doc_mug0lcap_d830l5_001.jpeg" "%~dp0data\documents\doc_mug0lcap_d830l5_002.jpeg"
if errorlevel 1 exit /b 1

echo.
echo [NARA] OCR benchmark outputs are isolated under:
echo   %OUT%
exit /b 0

:run_one
set "ID=%~1"
set "PAGE1=%~2"
set "PAGE2=%~3"
if not exist "%PAGE1%" (
  echo [NARA] Missing OCR input: %PAGE1%
  exit /b 1
)
if /i not "%PAGE1:~-5%"==".jpeg" (
  echo [NARA] Refusing non-JPEG input: %PAGE1%
  exit /b 1
)
if not "%PAGE2%"=="" if not exist "%PAGE2%" (
  echo [NARA] Missing OCR input: %PAGE2%
  exit /b 1
)
if not "%PAGE2%"=="" if /i not "%PAGE2:~-5%"==".jpeg" (
  echo [NARA] Refusing non-JPEG input: %PAGE2%
  exit /b 1
)
echo.
echo [NARA] Running lightweight OCR for invoice %ID%...
if "%PAGE2%"=="" (
  echo [NARA] COMMAND: "%PYTHON%" "%OCR%" --lightweight "%PAGE1%"
  "%PYTHON%" "%OCR%" --lightweight "%PAGE1%"
) else (
  echo [NARA] COMMAND: "%PYTHON%" "%OCR%" --lightweight "%PAGE1%" "%PAGE2%"
  "%PYTHON%" "%OCR%" --lightweight "%PAGE1%" "%PAGE2%"
)
if errorlevel 1 (
  echo [NARA] OCR failed for %ID%.
  exit /b 1
)
if exist "%OUT%\%ID%" rmdir /s /q "%OUT%\%ID%"
mkdir "%OUT%\%ID%"
robocopy "%~dp0local-ocr-output\lightweight" "%OUT%\%ID%\lightweight" /E /NFL /NDL /NJH /NJS >nul
if errorlevel 8 exit /b 1
echo [NARA] Saved %ID% output.
exit /b 0
