$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$manifest = Join-Path $repoRoot 'ELIMINAR_ARCHIVOS_INCREMENTAL_44.txt'

if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
    throw 'No se encontro ELIMINAR_ARCHIVOS_INCREMENTAL_44.txt junto al script.'
}

$rootFull = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd([char[]]@('\','/')) + [System.IO.Path]::DirectorySeparatorChar
$deleted = 0
$alreadyAbsent = 0

Get-Content -LiteralPath $manifest | ForEach-Object {
    $relative = $_.Trim()
    if ([string]::IsNullOrWhiteSpace($relative)) { return }

    $target = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $relative))
    if (-not $target.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Ruta fuera del repositorio rechazada: $relative"
    }

    if (Test-Path -LiteralPath $target -PathType Leaf) {
        Remove-Item -LiteralPath $target -Force
        Write-Host "Eliminado: $relative"
        $script:deleted += 1
    } else {
        Write-Host "Ya ausente: $relative"
        $script:alreadyAbsent += 1
    }
}

Write-Host "Incremental 44: $deleted archivos eliminados; $alreadyAbsent ya estaban ausentes."
