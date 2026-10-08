@echo off
rem Einmalig: Sides (Loco Chicken) Bestelluebersicht oeffnen und die Datenstruktur aufzeichnen.
rem Bitte selbst einloggen. Nichts wird gesendet. Fenster nach ca. 5 Minuten schliessen.
cd /d "%~dp0"
title NARA Sides Aufzeichnung
node sides-discover.mjs
pause
