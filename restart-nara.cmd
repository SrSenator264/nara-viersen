@echo off
call "%~dp0NARA-Stop.cmd"
timeout /t 2 /nobreak >nul
call "%~dp0NARA-Start.cmd"
