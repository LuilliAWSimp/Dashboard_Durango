# Cambios: fechas solo para graficas/reportes y reporte diario real

## Frontend

- Se quito el filtro global de fechas de la parte superior de Control Hidrico.
- El resumen, tarjetas, estados y cards de pozos vuelven a usar siempre la lectura mas reciente disponible en SQL Server ARCA.
- El selector de fechas ahora aparece dentro de la grafica "Produccion de agua vs consumo energetico" y solo afecta esa grafica.
- El modulo Reportes ahora tiene su propio selector de fechas.
- Reportes inicia por defecto en HOY.
- Las exportaciones internas del reporte usan el mismo periodo seleccionado en Reportes.

## Backend

- El reporte diario ya no usa `totalizador_m3` como consumo del dia.
- Para el periodo consultado calcula el consumo con:
  - `iot.sp_get_energy_water` cuando hay datos del SP.
  - Si no hay SP, usa diferencia de totalizador: lectura final - lectura inicial del periodo.
- Si no se manda fecha al reporte, se consulta HOY.
- El endpoint de dashboard operativo sin fecha sigue tomando la lectura mas reciente.

## Validacion

- Backend compila con `python -m compileall backend/app`.
- Frontend compila con `npm run build`.
