$ErrorActionPreference='Stop'
$project=Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath='D:\NARA-OCR-PY312'
$pythonCandidates=@(
  'C:\Users\droma\AppData\Local\Programs\Python\Python312\python.exe',
  'C:\Python312\python.exe'
)
$base=$pythonCandidates | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
if(-not $base){$base=(Get-Command py -ErrorAction SilentlyContinue)?.Source}
if(-not $base){$base=(Get-Command python -ErrorAction SilentlyContinue)?.Source}
if(-not $base){throw 'Python 3.12 was not found. Install/repair Python 3.12, then run this script again.'}
Write-Host "Using base Python: $base"
if(Test-Path -LiteralPath $envPath){
  $backup="$envPath.broken-$(Get-Date -Format yyyyMMdd-HHmmss)"
  Move-Item -LiteralPath $envPath -Destination $backup
  Write-Host "Preserved old OCR environment at $backup"
}
& $base -m venv $envPath
$venvPython=Join-Path $envPath 'Scripts\python.exe'
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install paddlepaddle paddleocr
& $venvPython -c "import paddle, paddleocr; print('PADDLEOCR_READY', paddle.__version__)"
$settings=Join-Path $project 'local-preparser-settings.json'
Set-Content -LiteralPath $settings -Value '{"developmentOnly":true,"enabled":true,"python":"D:/NARA-OCR-PY312/Scripts/python.exe"}' -Encoding UTF8
Write-Host 'OCR environment ready. Restart NARA and run the invoice 500282875 regression test.'
