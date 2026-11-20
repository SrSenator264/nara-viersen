@echo off
REM Startet die naechtlichen Tests (wird vom Aufgabenplaner aufgerufen).
cd /d "%~dp0.."
if not exist test-results mkdir test-results
node scripts\nightly-e2e.cjs >> test-results\nightly.log 2>&1
