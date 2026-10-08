@echo off
setlocal
cd /d "%~dp0"
"D:\NARA-OCR-PY312\Scripts\python.exe" "%~dp0local-ocr-test.py" %*
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo Local OCR output: "%~dp0local-ocr-output"
pause
exit /b %EXIT_CODE%
