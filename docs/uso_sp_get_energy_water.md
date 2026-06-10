# Uso de `iot.sp_get_energy_water` en el dashboard

## Decisión técnica

El stored procedure `iot.sp_get_energy_water` debe usarse como la fuente principal para consumos acumulados de agua y energía por pozo, especialmente en reportes diarios, semanales y mensuales.

El dashboard conserva las lecturas directas de BOS para variables instantáneas:

- estado operativo del pozo
- flujo instantáneo de entrada/salida
- calidad/comunicación
- última lectura
- tanques y líneas de producción

El SP se usa para métricas de periodo:

- `m3_value`
- `kwh_value`
- `kwh_por_m3`
- sensor de agua
- sensor de energía

## Implementación en backend

El servicio `backend/app/services/water_bos_service.py` ahora ejecuta:

```sql
EXEC iot.sp_get_energy_water
    @period = :period,
    @well_id = :well_id,
    @sensor_id = :sensor_id,
    @start_date = :start_date,
    @end_date = :end_date;
```

Después agrupa el resultado por `well_id` y lo mezcla con los pozos obtenidos de `dbo.SensorsBOS_Pozo`.

## Regla recomendada

No reemplazar completamente `dbo.SensorsBOS_Pozo` con el SP, porque el SP no trae todo lo operativo del pozo. Lo correcto es usar ambos:

| Uso | Fuente recomendada |
|---|---|
| Flujo instantáneo | `dbo.SensorsBOS_Pozo` |
| Estado encendido/apagado | `dbo.SensorsBOS_Pozo` |
| Comunicación/calidad | `dbo.SensorsBOS_Pozo` |
| Consumo diario de agua | `iot.sp_get_energy_water` |
| Consumo diario de energía | `iot.sp_get_energy_water` |
| kWh/m³ | `iot.sp_get_energy_water` |
| Reporte diario | `iot.sp_get_energy_water` + BOS |

## Recomendación para el SP

Dentro del SP conviene castear `well_id` desde JSON:

```sql
TRY_CAST(JSON_VALUE(s.metadata,'$.well_id') AS INT) AS well_id
```

También conviene validar `@period`:

```sql
IF @period NOT IN ('hourly', 'daily', 'monthly', 'yearly')
BEGIN
    THROW 50001, 'Periodo inválido. Usa hourly, daily, monthly o yearly.', 1;
END;
```
