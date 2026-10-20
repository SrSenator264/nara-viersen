@echo off
rem Startet NARA-Autostart-Komplett.ps1 mit Administrator-Rechten (Windows fragt einmal nach: "Ja" klicken).
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%~dp0NARA-Autostart-Komplett.ps1'"
