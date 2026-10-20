@echo off
rem Einmalig: 6 Lieferando-Bestellungen vom 20.10. nachtragen (Backup, Duplikat-Schutz, Rueckfrage j/n).
rem Voraussetzung: NARA-Server laeuft (NARA-Start). Danach kann diese Datei geloescht werden.
setlocal
cd /d "%~dp0"
node Flamo-Fehlende-Lieferando.mjs
echo.
pause
