# Cambios - tablas por defecto HOY y lineas sin kWh

## Frontend

- Se reforzo la regla de que las lineas no muestran kWh en tarjetas ni tablas.
- La tabla comparativa de Pozos y Lineas ahora tiene su propio selector compacto de fechas.
- La tabla inicia por defecto en HOY.
- Cambiar fechas en la tabla no afecta tarjetas ni estados actuales.
- La grafica Produccion de agua vs consumo energetico inicia por defecto en HOY.
- El boton Restablecer de los filtros historicos vuelve a HOY.

## Backend

- `dbo.SensorsBOS_Linea` ahora calcula `period_m3` con diferencia de totalizador dentro del rango seleccionado.
- Las lineas siguen exponiendo `totalizador_m3` como lectura acumulada, pero para tablas/rangos se usa `period_m3`.

## Uso esperado

- Tarjetas y estado operativo: ultima lectura disponible.
- Graficas/tablas/reportes: HOY por defecto, o rango seleccionado por el usuario.
