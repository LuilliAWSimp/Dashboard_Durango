# Incremental 32 — Cards operativas V2

## Objetivo
Homologar las tarjetas de Pozos, Líneas, Lavadoras y Jarabes con una jerarquía visual común, reducir información redundante y mantener la terminología hidráulica correcta sin modificar datos ni cálculos.

## Cambios
- Se retiró `Actividad del periodo` como cuarto bloque de cada card; el estado ya se comunica en la pastilla superior y la última lectura en el pie.
- Cada card conserva únicamente los tres datos principales: Flujo actual, Totalizador actual y Volumen del periodo.
- El volumen del periodo ocupa una fila completa y destacada para mejorar la lectura.
- Se conserva la terminología física:
  - Pozos: `Volumen bombeado del periodo`.
  - Líneas, Lavadoras y Jarabes: `Volumen consumido del periodo`.
- Se añadieron iconos diferenciados por familia: Pozo, Línea, Lavadora y proceso Jarabes.
- Se simplificó el subtítulo de la sección de cards y el CTA pasa de `Abrir detalle` a `Ver detalle`.
- La comunicación normal sigue oculta; sólo se muestra en la card cuando requiere atención.
- Se redujo la altura mínima de la card y se ajustó la composición responsive.
- Modo claro mantiene superficies blanco/azul y no agrega grises nuevos.
- Los estilos nuevos viven en `operational-modules.css`; `global.css` permanece sin cambios.

## Sin cambios
- Backend, SQL Server y BOS.
- Sensores, IDs, operational_key, factores y unidades.
- Cálculos de flujo, volumen, totalizador, conciliación y calidad.
- Históricos, exportaciones, turnos, revisión diaria, reportes, autenticación y Balance de Agua.

## Validación dirigida
- 33 pruebas frontend seleccionadas aprobadas.
- Auditor runtime: 82 archivos alcanzables, 63 de código, 18 CSS y 0 imports relativos sin resolver.
- `global.css` confirmado sin cambios.
- Backend confirmado sin cambios.
- No se ejecutaron suites completas.
- No se realizaron consultas reales a SQL Server ni BOS.
