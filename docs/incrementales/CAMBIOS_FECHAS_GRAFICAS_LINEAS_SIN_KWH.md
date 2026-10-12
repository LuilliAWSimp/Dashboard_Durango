# Cambios: fechas solo en gráficas y líneas sin kWh

## Fechas
- Se elimina el selector global de fechas de las vistas operativas.
- Las tarjetas, estados, comunicación, pozos y líneas usan siempre la última lectura real de SQL Server ARCA.
- Las gráficas tienen su propio selector compacto de fechas.
- El selector de la gráfica consulta histórico sin afectar tarjetas ni estados actuales.

## Resumen
- La gráfica `Producción de agua vs consumo energético` ahora tiene selector propio de fechas.
- Si hay rango seleccionado, la gráfica usa datos del periodo.
- Si no hay rango, se conserva vista de última lectura / datos disponibles.

## Pozos
- El detalle de pozo mantiene sus tarjetas con última lectura actual.
- La gráfica del detalle de pozo usa su propio selector de fechas.
- Se agregó soporte para histórico de flujo desde `dbo.SensorsBOS_Pozo` cuando no hay datos suficientes desde `iot.sp_get_energy_water`.

## Líneas
- Las líneas ya no muestran `kWh` en tarjetas ni tablas.
- El detalle de línea ya no reutiliza el detalle de pozo.
- El detalle de línea muestra flujo, totalizador, sensor y comunicación.
- La gráfica de línea usa histórico de `dbo.SensorsBOS_Linea` y no muestra energía.

## Reportes
- Los reportes siguen usando `daily` y datos del periodo seleccionado, no el totalizador acumulado como consumo diario.
