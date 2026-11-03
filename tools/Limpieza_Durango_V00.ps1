# DGO-V00: limpieza optativa de logs temporales del ZIP base.
# Sin -Aplicar es solo simulacion. No toca SQL, BOS, SQLite, exportaciones ni .env.
[CmdletBinding()]
param([switch]$Aplicar)

$ErrorActionPreference = 'Stop'
$raiz = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$archivos = @(
    @{ Nombre = 'build.log';  SHA256 = '8889b1598da2cba18490ade1ee9fa60699ee86e095a23d65d021dee6e56ac36a' },
    @{ Nombre = 'build2.log'; SHA256 = 'fe1e21282372190a5cd1dcf29703e1c39d13ca95614c97944a287d862c3301bd' }
)

foreach ($item in $archivos) {
    $ruta = Join-Path $raiz $item.Nombre
    if (-not (Test-Path -LiteralPath $ruta -PathType Leaf)) {
        Write-Host "[SIN CAMBIOS] No existe $($item.Nombre)"
        continue
    }
    $huella = (Get-FileHash -LiteralPath $ruta -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($huella -ne $item.SHA256) {
        Write-Warning "No se elimina $($item.Nombre): el contenido cambio desde el ZIP auditado."
        continue
    }
    if (-not $Aplicar) {
        Write-Host "[SIMULACION] Se puede eliminar $($item.Nombre) (hash verificado)."
        continue
    }
    Remove-Item -LiteralPath $ruta -Force
    Write-Host "[ELIMINADO] $($item.Nombre)"
}

if (-not $Aplicar) {
    Write-Host 'No se ha eliminado ningun archivo. Para aplicar: .\tools\Limpieza_Durango_V00.ps1 -Aplicar'
}
