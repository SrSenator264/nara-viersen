@echo off
title NARA AI Test Server
cd /d "%~dp0"
set PORT=4185
echo.
echo NARA is starting...
echo Open the cashier: http://localhost:4185/kasse.html
echo Keep this window open while you test the NARA Guide.
echo.
node server.js
pause
