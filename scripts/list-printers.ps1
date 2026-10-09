# list-printers.ps1 - Namen aller installierten Windows-Drucker (eine Zeile pro Drucker)
$ErrorActionPreference = 'SilentlyContinue'
try { Get-Printer | ForEach-Object { $_.Name } }
catch { Get-WmiObject Win32_Printer | ForEach-Object { $_.Name } }
