@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut($d+'\NARA Kasse.lnk'); $s.TargetPath='%~dp0NARA-Start.cmd'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.IconLocation='%SystemRoot%\System32\shell32.dll,13'; $s.Save(); $t=(New-Object -ComObject WScript.Shell).CreateShortcut($d+'\NARA Stop.lnk'); $t.TargetPath='%~dp0NARA-Stop.cmd'; $t.WorkingDirectory='%~dp0'; $t.WindowStyle=7; $t.IconLocation='%SystemRoot%\System32\shell32.dll,27'; $t.Save()"
echo Fertig. Auf dem Desktop: "NARA Kasse" und "NARA Stop".
pause
