# Dashboard ARCA Durango — Modernización cerrada

Estado de referencia: **Incremental 45**.

## Contrato físico conservado

- Pozos: `1001` Pozo 1, `1051` Pozo 2.
- Líneas: `2002` Línea 1, `2006` Línea 3, `2008` Línea 4, `2010` Línea 5.
- Lavadora Línea 2: `2004` / `LINEA_FLOW_IN[1]`.
- Lavadora Vidrio: `operational_key=lavadora_vidrio` / `LAVADORAS_0`.
- Lavadora Ref Pet: `operational_key=lavadora_ref_pet` / `LAVADORAS_1`.
- Jarabes: sensor actual `3004` / `TANQUE_FLOW_IN[1]`, conservando su corte histórico desde `3010`.
- Corte general SCADA validado: `2026-08-04T18:16:00` local.
- Pozo 1 conserva su corte de recalibración de flujo del `2026-08-11 12:15` local.

## Capacidades finales

Activas:

- Pozos.
- Líneas.
- Lavadoras.
- Jarabes.
- Revisión diaria.
- Reportes.
- Turnos.

Protegida:

- Balance de Agua: `pending_physical_validation`.

Deshabilitadas:

- Tanques.
- CIP.
- UV.
- Consumos heredados.
- Energía.
- Concesión.

## Cierre técnico

- Históricos globales, modulares e individuales homologados.
- Exportaciones PDF/Excel/Excel 5 min alineadas con selección visible.
- Detalles con KPIs del periodo y navegación contextual.
- Polling común de 60 s respetando caché; refresh manual puede forzar.
- Rangos largos segmentados y con política de agrupación.
- Resumen ejecutivo y cards simplificados.
- Revisión diaria y Turnos V2 homologados.
- Reportes PDF/Excel/HTML/correo con estructura, fechas y copy comunes.
- Navegación gobernada por capabilities.
- Balance sin aritmética física no confirmada.
- Concesión fuera del runtime hasta contar con evidencia legal.
- CSS modular cerrado; `global.css` acotado.
- JS/TS canonizado: sin pares duplicados.
- Legado frontend retirado: todo archivo de código restante pertenece al runtime.

## Estado verificable del Incremental 45

- Frontend: **185/185 pruebas**.
- Backend: **172/172 pruebas** en modo SQLite aislado.
- Código frontend alcanzable: **64/64 archivos**.
- CSS alcanzable: **18 hojas**.
- Imports relativos rotos: **0**.
- Pares JS/TS o JSX/TSX duplicados: **0**.
- Errores sintácticos frontend: **0**.
- `compileall` backend/app + backend/tests: **sin errores**.

## Pendientes que no deben resolverse por inferencia

1. **Balance oficial:** requiere confirmación física de fuente base, consumos aditivos y doble conteo.
2. **Concesión:** requiere título, volumen autorizado, vigencia/ciclo, relación título ↔ pozo y base acumulada oficial.
3. **Validación productiva:** smoke test contra SQL Server/BOS, correo SMTP real y ejecución programada en la PC de planta.

No introducir Tanques, UV, CIP, Energía, Concesión ni nuevas relaciones de Balance por semejanza con otra planta.
