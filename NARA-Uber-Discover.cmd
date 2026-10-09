@echo off
rem Einmalig: Uber Eats Orders (merchants.ubereats.com/orders) oeffnen und die Datenstruktur der Bestellungen aufzeichnen.
rem Bitte selbst einloggen. Nichts wird gesendet. Fenster nach ca. 5 Minuten schliessen.
cd /d "%~dp0"
title NARA Uber Aufzeichnung
node uber-discover.mjs
pause
