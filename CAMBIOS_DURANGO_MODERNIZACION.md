# Dashboard ARCA Durango - Modernización incremental

Base: Dashboard_Durango-test (2).zip

- Mapeos conservados: Pozos 1001/1051; Líneas 2002, 2006, 2004, 2008, 2010; Flujos 3002, 3004, 3006.
- Tanques y Concesión permanecen pendientes de validación. Energía permanece deshabilitada.
- Fuente histórica preferente: iot.readings_minute; fallback BOS limitado a un día.
- Diagnóstico de niveles: docs/diagnostico_niveles_durango.sql.
- vite.config.js es la fuente canónica; vite.config.ts solo reexporta para compatibilidad.
- No se incluye .env ni credenciales.
