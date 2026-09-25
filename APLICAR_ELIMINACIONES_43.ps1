$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$manifest = Join-Path $repoRoot 'ELIMINAR_ARCHIVOS_INCREMENTAL_43.txt'
if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
    throw 'No se encontro ELIMINAR_ARCHIVOS_INCREMENTAL_43.txt junto al script.'
}

$rootFull = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd('\\', '/') + [System.IO.Path]::DirectorySeparatorChar
$removed = 0
$missing = 0

Get-Content -LiteralPath $manifest | ForEach-Object {
    $relative = $_.Trim()
    if (-not $relative -or $relative.StartsWith('#')) { return }

    $target = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $relative))
    if (-not $target.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Ruta fuera del repositorio rechazada: $relative"
    }

    if (Test-Path -LiteralPath $target -PathType Leaf) {
        Remove-Item -LiteralPath $target -Force
        Write-Host "Eliminado: $relative"
        $removed += 1
    } else {
        Write-Host "Ya no existe: $relative"
        $missing += 1
    }
}

Write-Host "Incremental 43: $removed archivos eliminados; $missing ya estaban ausentes."
