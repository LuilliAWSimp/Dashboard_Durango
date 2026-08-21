$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$paths = @(
  'backend/app/auth',
  'backend/app/scripts/create_admin.py',
  'backend/app/scripts/__init__.py',
  'backend/tests/test_frontend_auth_contract.py',
  'backend/tests/test_local_auth.py',
  'docs/AUTENTICACION_LOCAL_DURANGO.md',
  'frontend/src/pages/UsersPage.tsx',
  'frontend/src/pages/UsersPage.jsx',
  'backend/data/auth.sqlite3',
  'backend/data/auth.sqlite3-shm',
  'backend/data/auth.sqlite3-wal',
  'frontend/dist',
  'frontend/node_modules/.vite'
)

foreach ($path in $paths) {
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Recurse -Force
    Write-Host "Eliminado: $path"
  }
}

Get-ChildItem -Path 'backend' -Recurse -Directory -Filter '__pycache__' -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

if (Test-Path -LiteralPath 'backend/app/scripts') {
  $remaining = Get-ChildItem -LiteralPath 'backend/app/scripts' -Force -ErrorAction SilentlyContinue
  if (-not $remaining) {
    Remove-Item -LiteralPath 'backend/app/scripts' -Force -ErrorAction SilentlyContinue
  }
}

Write-Host ''
Write-Host 'Limpieza de autenticacion local de Durango completada.' -ForegroundColor Green
Write-Host 'Reinicia backend y frontend despues de aplicar el incremental.'
