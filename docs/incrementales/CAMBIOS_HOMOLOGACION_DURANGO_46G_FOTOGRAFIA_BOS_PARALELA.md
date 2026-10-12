# Durango 46G - Fotografia BOS paralela

## Objetivo
Reducir el tiempo de la lectura operativa actual que alimenta Resumen, KPIs, cards y tablas sin modificar formulas, sensores, reglas de negocio ni consultas SQL individuales.

## Cambios
- La ruta current-only del dashboard ahora consulta en paralelo las cuatro fuentes operativas independientes:
  - dbo.SensorsBOS_Pozo.
  - dbo.SensorsBOS_Linea.
  - dbo.SensorsBOS_Lavadoras.
  - dbo.SensorsBOS_Tanque para Jarabes.
- Cada worker utiliza su propia sesion SQLAlchemy; no se comparte una sesion entre threads.
- El payload final conserva las mismas fuentes, normalizaciones, estados, orden y contratos anteriores.
- La suma de errores de las fuentes requeridas Pozos/Lineas se conserva para mantener el mismo diagnostico de conexion SQL.
- El camino paralelo solo se activa en lecturas automaticas current-only, que son el hot path de Resumen y navegacion entre modulos.
- Las actualizaciones manuales con force_refresh, las consultas con rango y las cargas con historico conservan el flujo secuencial anterior.
- Se mantienen intactas las optimizaciones 46B, 46C, 46D, 46E y 46F.

## No se modifico
- SQL fisico ni sentencias SELECT de cada fuente.
- BOS/SCADA.
- Sensores, IDs, slots ni factores de conversion.
- Flujo, totalizadores, volumen, actividad, tiempo activo, cobertura o validacion.
- Turnos.
- Historicos y exportaciones.
- Reportes.
- Balance.
- Frontend, CSS o diseno.

## Validacion dirigida
- 53 pruebas dirigidas aprobadas con DB_MODE=sqlite.
- Se comprobo que las cuatro fuentes current-only comienzan antes de que finalice cualquiera de ellas.
- Se comprobo que cada worker recibe una sesion SQLAlchemy independiente.
- Se comprobo que el conteo de errores de Pozos/Lineas se conserva.
- Se ejecutaron regresiones de 46B, 46C, 46D, 46E y 46F.
- Se ejecuto regresion de corte SCADA, Jarabes/zonas horarias y servicios de agua.
- py_compile correcto para water_bos_service.py.
- No se realizaron consultas reales contra SQL Server/BOS durante las pruebas.

## Archivos modificados
- backend/app/services/water_bos_service.py
- backend/tests/test_durango_current_parallel_sources_46g.py
- CAMBIOS_HOMOLOGACION_DURANGO_46G_FOTOGRAFIA_BOS_PARALELA.md
