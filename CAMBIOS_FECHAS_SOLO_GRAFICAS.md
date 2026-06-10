# Cambios: fechas solo para graficas y reportes

- El selector de fechas global se mantiene fuera de las tarjetas/estado operativo.
- Las tarjetas, estados, comunicacion y lecturas actuales usan la lectura mas reciente de SQL Server ARCA.
- Cada grafica tiene su propio selector de fechas arriba del panel donde se grafica.
- Las graficas consultan SQL Server con `period=hourly` para un dia y `period=daily` para rangos de varios dias.
- Reportes sigue usando `period=daily` para calcular TODAY/rangos por dia y evitar usar totalizadores acumulados como consumo del dia.
- Si una grafica no tiene historico real mapeado en SQL Server ARCA, se muestra un mensaje de datos no mapeados en vez de datos mock.

Endpoints afectados:

- `GET /water/dashboard/{section}?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&period=hourly|daily|monthly`
- `GET /water/reports/daily?date=YYYY-MM-DD`
- `GET /water/reports/daily?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
