Option Explicit
Dim shell, script
Set shell = CreateObject("WScript.Shell")
script = "C:\Users\droma\Documents\Codex\2026-09-08\new-chat\restart-nara.ps1"
shell.Run "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & script & """", 0, False
