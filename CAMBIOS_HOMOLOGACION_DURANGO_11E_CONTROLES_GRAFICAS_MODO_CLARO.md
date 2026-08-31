# Dashboard Durango · Homologación 11E
## Controles globales, fechas y gráficas en modo claro

### Objetivo
Cerrar los pendientes visuales de controles e históricos en modo claro sin modificar sensores, SQL Server, autenticación ni reglas hidráulicas.

### 1. Selectores de fecha unificados
Se normalizó el contrato visual para:
- selectores de rango,
- Revisión diaria,
- turnos,
- Reportes,
- histórico operativo,
- flujo minuto a minuto.

En modo claro usan superficies blancas y azules ARCA:
- fondo blanco,
- texto azul oscuro,
- borde azul visible,
- labels azul oscuro,
- botón principal azul con texto blanco,
- botón secundario azul claro,
- estado/rango en azul claro.

Se eliminan fondos grises como superficie funcional.

### 2. Flujo / Totalizador / Ambos
El selector deja de heredar la cápsula oscura en modo claro.

- contenedor azul claro,
- opción inactiva con texto azul oscuro,
- hover azul claro,
- opción activa azul oscuro + texto blanco.

### 3. Elementos visibles
Se reforzó el contraste de:
- `Elementos visibles`,
- `Seleccionar todos`,
- `Deseleccionar todos`,
- chips de sensores/elementos.

### 4. Gráficas en modo claro
Se aumentó el contraste de:
- grid horizontal y vertical,
- ejes,
- ticks,
- labels,
- leyenda,
- líneas de referencia.

Las series conservan sus colores propios.

### 5. Modo Ambos: línea + barras
Se recuperó la diferenciación visual solicitada:

- **Flujo** se muestra como línea.
- **Volumen del intervalo** se muestra como barras/rectángulos.
- Flujo y volumen utilizan paletas diferentes.
- Flujo usa eje izquierdo (L/s).
- Volumen usa eje derecho (m³).

Importante: las barras usan `volume_m3` real del bucket, no la variación acumulada del totalizador.

El modo `Totalizador` por sí solo conserva:
- Variación del periodo.
- Valor absoluto.

### 6. Trazabilidad de exportación
El conjunto usado por Excel/PDF en modo `Ambos` ahora exporta:
- Flujo.
- Volumen del intervalo.

Así se mantiene la semántica de los datos visibles.

### Archivos modificados
- `frontend/src/pages/pozos/components/ModuleHistoryPanel.tsx`
- `frontend/src/pages/pozos/components/WellsMinuteFlowPanel.tsx`
- `frontend/src/pages/pozos/moduleComparisonCore.ts`
- `frontend/src/pages/pozos/sections/RevisionDiariaSection.tsx`
- `frontend/src/styles/global.css`
- `frontend/tests/durangoThemeToggle.test.ts`
- `frontend/tests/moduleComparison.test.ts`

### Pruebas
Regresión frontend completa:
- 48 pruebas ejecutadas.
- 48 correctas.
- 0 fallos.

### Alcance excluido
No se modifican:
- backend,
- SQL Server,
- sensores,
- mapeos,
- autenticación,
- SMTP,
- correo programado,
- turnos,
- reglas de conciliación/validación.
