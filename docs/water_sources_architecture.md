# Fuentes de pozos cargadas

## Decisión v1

La carga de datos de pozos se implementa como un flujo controlado JSON desde el backend. El frontend nunca ejecuta SQL ni envía scripts SQL para correrlos contra la base. El dominio eléctrico permanece separado y conserva su fuente demo.

## Flujo

1. El usuario entra a `Pozos > Fuentes`.
2. Selecciona un archivo `.json` con la estructura controlada.
3. El backend valida la forma básica del archivo.
4. Si es válido, lo registra en `water_sources/` y lo puede activar.
5. Los endpoints `/api/v1/water/dashboard/{section}` leen la fuente activa y devuelven un contrato estable para el frontend.
6. Si no existe fuente activa, el dashboard muestra estado vacío claro.

## Contrato mínimo del JSON

```json
{
  "name": "Fuente demo de pozos",
  "description": "Opcional",
  "wells": [
    {
      "id": "pozo-1",
      "name": "Pozo 1",
      "entry_m3": 312,
      "supply_hours": 24,
      "active": true,
      "sensors": [
        { "id": "P1-FLOW", "name": "Flujo Pozo 1", "type": "flow", "unit": "m³/h", "value": 13 }
      ]
    }
  ]
}
```

Campos opcionales soportados: `water_consumption`, `tank_levels`, `hourly_flow`, `filters_vs_treated`, `cip_weekly`, `entry_vs_exit`, `monthly_averages`, `daily_indicators`, `report_modules`.

## Riesgos pendientes

- Esta v1 no interpreta dumps SQL ni ejecuta scripts cargados por el usuario por seguridad.
- Para producción real conviene mover el registro de fuentes a una tabla controlada y el archivo a storage administrado.
- El JSON debe generarse desde un proceso ETL o exportador confiable basado en la estructura SQL (`iot.wells_monitoring`, `iot.sensors`, `iot.readings_minute`, `iot.water_daily`, vistas de agua, etc.).
