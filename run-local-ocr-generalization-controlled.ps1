$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$env:NARA_LOCAL_PREPARSER_ENABLED='1'
$env:NARA_LOCAL_PREPARSER_PYTHON='D:\NARA-OCR-PY312\Scripts\python.exe'
node .\run-local-ocr-generalization-controlled.js
