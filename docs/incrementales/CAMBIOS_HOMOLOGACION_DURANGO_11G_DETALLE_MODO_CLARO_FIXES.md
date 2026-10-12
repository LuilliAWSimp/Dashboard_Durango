# Homologación Durango 11G — Fixes visuales en detalle individual (modo claro)

## Objetivo
Atender observaciones del usuario dentro del detalle individual de cards operativas, especialmente en modo claro, sin modificar el resto del dashboard.

## Ajustes realizados
- Subtítulo del detalle individual con azul oscuro y mejor contraste.
- Navegación entre elementos (anterior/siguiente/nombre actual/flechas) en azul oscuro.
- Chips/meta del bloque `Rango del detalle` sin gris: fondo azul muy claro y texto azul oscuro.
- Estado vacío del histórico sin fondo gris oscuro: superficie clara, borde azul y texto legible.
- Selector de turnos completamente azul, con texto y flecha blancos, sin el detalle blanco visual.

## Archivo modificado
- `frontend/src/styles/global.css`

## Alcance
- Sólo ajustes visuales del modo claro.
- No se modificó backend, SQL Server, sensores, mapeos, autenticación ni cálculos.
