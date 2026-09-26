# Cierre de homologación — Dashboard ARCA Durango — Incremental 45

## Resultado

La modernización incremental 20–45 queda técnicamente cerrada con el runtime frontend depurado, capacidades de planta centralizadas, contratos históricos/reportes unificados y pruebas frontend/backend completas en el entorno aislado disponible.

Este cierre **no declara validado el Balance físico** ni habilita Concesión. Ambos quedan en el estado definido por evidencia disponible.

## Validación automática final

### Frontend

- Suite completa: **185/185 pruebas**.
- Archivos de código existentes: **64**.
- Archivos de código alcanzables desde `main.jsx`: **64/64**.
- Hojas CSS alcanzables: **18**.
- Imports relativos sin resolver: **0**.
- Pares `.js/.ts` o `.jsx/.tsx` duplicados: **0**.
- Errores sintácticos detectados con parser TypeScript: **0**.

### Backend

- Suite completa en modo SQLite aislado: **172/172 pruebas**.
- `python -m compileall backend/app backend/tests`: **sin errores**.
- Importación de FastAPI: correcta.
- Rutas críticas confirmadas en la aplicación montada:
  - autenticación;
  - dashboard hidráulico;
  - histórico individual;
  - histórico modular;
  - Revisión diaria;
  - Turnos;
  - Reportes;
  - PDF;
  - Excel;
  - correo.

La suite completa se ejecutó con `DB_MODE=sqlite` para evitar conexión real a SQL Server/BOS durante la regresión.

## Dos pruebas heredadas corregidas

La primera corrida backend produjo **170/172** por dos expectativas antiguas:

1. Una prueba intentaba monkeypatchear `water_daily_report_service.get_shift_consumption_data`, dependencia que ya no forma parte de ese servicio. El reporte diario consume el contrato canónico de Revisión diaria y recibe Turnos a través de ese adaptador.
2. Una prueba esperaba `Validado` para un totalizador con una discontinuidad físicamente descartada. El contrato vigente marca correctamente ese caso como `Dato en revisión` / `review`.

Se actualizaron únicamente las pruebas; no fue necesario modificar lógica de producción para obtener **172/172**.

## Estado funcional final

### Activo

- Resumen.
- Pozos.
- Líneas.
- Lavadoras.
- Jarabes.
- Revisión diaria.
- Turnos.
- Reportes.
- Usuarios según rol.

### Visible pero protegido

- **Balance de Agua — En validación física**.
  - No suma automáticamente Líneas + Lavadoras + Jarabes.
  - No publica `Pozos − consumos`.
  - No calcula pérdida, fuga o eficiencia sin contrato físico confirmado.

### Deshabilitado

- Tanques.
- CIP.
- UV.
- Consumos heredados.
- Energía.
- Concesión.

## Contratos confirmados que no deben alterarse por semejanza con otra planta

- Pozos: `1001`, `1051`.
- Líneas: `2002`, `2006`, `2008`, `2010`.
- Lavadora Línea 2: `2004`.
- Lavadora Vidrio: `lavadora_vidrio` / `LAVADORAS_0`.
- Lavadora Ref Pet: `lavadora_ref_pet` / `LAVADORAS_1`.
- Jarabes actual: `3004` / `TANQUE_FLOW_IN[1]` con corte histórico del canal anterior `3010`.
- Corte general SCADA: `2026-08-04 18:16` local.
- Pozo 1: recalibración de flujo `2026-08-11 12:15` local.
- Turnos: 00:00–07:00, 07:00–15:00, 15:00–00:00 del día siguiente.

## Pendientes externos al código

### Balance oficial

Antes de habilitar aritmética oficial se debe confirmar físicamente:

- fuente base del balance;
- qué consumos son aditivos;
- puntos con posible doble conteo;
- interpretación de la diferencia no conciliada.

### Concesión

Mantener deshabilitada hasta disponer de:

- título de concesión;
- volumen autorizado;
- vigencia/ciclo;
- relación título ↔ pozo;
- base acumulada oficial.

### Smoke test productivo

Después de aplicar el incremental en la PC de Durango se recomienda validar contra infraestructura real:

1. Login y renovación de sesión.
2. Resumen y navegación por capabilities.
3. Cards de Pozos/Líneas/Lavadoras/Jarabes.
4. Detalles, anterior/siguiente y botón Volver.
5. Históricos 1m/15m/1h/1d según rango.
6. PDF, Excel y Excel 5 min.
7. Revisión diaria y Turnos.
8. Reporte PDF/Excel/HTML.
9. Correo manual SMTP.
10. Una ejecución programada a hora exacta.
11. Balance visible únicamente como “En validación”.

## Limitación del entorno de cierre

El ZIP de trabajo no contiene `frontend/node_modules`, por lo que `npm run typecheck` no puede resolver `node` ni `vite/client`, y no es posible ejecutar `vite build` en este entorno sin instalar dependencias.

Esto se separa de la validación sintáctica: los **64 archivos de código frontend** fueron parseados sin errores y la suite frontend completa pasó 185/185.

## Línea base final

Consultar:

- `docs/RUNTIME_BASELINE_DURANGO_45.md`
- `CAMBIOS_DURANGO_MODERNIZACION.md`
- `README.md`
