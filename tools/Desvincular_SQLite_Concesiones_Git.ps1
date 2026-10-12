# DGO-C06 - Ejecucion manual UNA VEZ en la IPC de Durango.
# Quita SOLO el seguimiento del indice de Git; NO borra los archivos locales.
# Requiere una copia diaria validada creada previamente por el backend.
param([switch]$Confirmar)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$db = Join-Path $repo 'backend\data\concessions.sqlite3'
if (-not (Test-Path -LiteralPath $db -PathType Leaf)) {
    throw 'No se encuentra concessions.sqlite3. No se hara ningun cambio en Git.'
}
$backupDir = $env:ARCA_CONCESSIONS_BACKUP_DIR
if ([string]::IsNullOrWhiteSpace($backupDir)) {
    $backupDir = Join-Path (Split-Path $repo -Parent) 'ARCA_Durango_Backups\concesiones'
}
$backup = @(Get-ChildItem -LiteralPath $backupDir -Filter 'concessions_????-??-??.sqlite3' -File -ErrorAction SilentlyContinue)
if ($backup.Count -eq 0) {
    throw "No se encontro un respaldo SQLite en $backupDir. Instala C06, reinicia el backend y verifica el respaldo antes de limpiar Git."
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'No se encontro git. Ejecuta el script desde la terminal Git de GitHub Desktop.'
}
$rootFromGit = (& git -C $repo rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $rootFromGit) { throw 'No se encontro un repositorio Git en esta carpeta.' }
if (-not $Confirmar) {
    Write-Host 'Simulacion: no se hizo ningun cambio.' -ForegroundColor Yellow
    Write-Host 'Base activa detectada:' $db
    Write-Host 'Respaldo detectado:' ($backup | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
    Write-Host 'Para realizar la operacion, vuelve a ejecutarlo con -Confirmar.'
    exit 0
}
$paths = @(
    'backend/data/concessions.sqlite3',
    'backend/data/concessions.sqlite3-wal',
    'backend/data/concessions.sqlite3-shm',
    'backend/data/concessions.sqlite3-journal'
)
foreach ($relative in $paths) {
    $tracked = & git -C $repo ls-files --error-unmatch -- $relative 2>$null
    if ($LASTEXITCODE -ne 0) { continue }
    & git -C $repo rm --cached -f -- $relative | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "No se pudo quitar del indice: $relative" }
}
if (-not (Test-Path -LiteralPath $db -PathType Leaf)) {
    throw 'ALERTA: la base activa no aparece. Deten el procedimiento y revisa el respaldo.'
}
Write-Host 'Listo. El archivo SQLite local sigue presente.' -ForegroundColor Green
Write-Host 'GitHub Desktop mostrara eliminaciones PREPARADAS para el indice, no eliminaciones fisicas. Revisa y haz un unico commit de limpieza.'
Write-Host 'No uses Discard Changes ni Restablecer sobre la base activa.'
