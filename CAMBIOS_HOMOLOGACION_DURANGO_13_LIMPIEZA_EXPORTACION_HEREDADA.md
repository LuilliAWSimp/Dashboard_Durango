# Homologacion Durango 13 — Limpieza de datos heredados y API de exportacion

## Objetivo

Retirar del runtime de Durango una API antigua de exportacion hidraulica que
construia respuestas con cifras demostrativas y que ya no era consumida por el
frontend vigente.

La regla aplicada es simple:

```text
Dato real confirmado -> puede exportarse
Dato demostrativo/heredado -> no debe exponerse como dato operativo
```

## Hallazgo

Seguian presentes y registrados:

```text
backend/app/api/routes/water_export.py
backend/app/services/water_export_service.py
```

El servicio contenia valores estaticos de ejemplo para:

- entrada total de agua;
- agua tratada;
- pozos;
- tanques;
- balance;
- CIP;
- concesiones;
- series horarias/mensuales.

El router se publicaba desde `backend/app/main.py` bajo:

```text
/api/v1/water/export/{section}/{format_name}
```

Esos datos no pertenecen al contrato hidraulico real actual de Durango.

## Cambio aplicado

- Se retiro `water_export_router` de `backend/app/main.py`.
- El endpoint heredado deja de publicarse en el runtime.
- Se eliminaron del servicio los datasets demostrativos.
- Se conserva un stub de compatibilidad que falla explicitamente si algun codigo
  antiguo intenta reutilizar `get_water_dashboard_payload()`.
- El archivo de rutas heredado conserva un `APIRouter` vacio, pero ya no esta
  registrado y no publica endpoints.

## Exportaciones que NO cambian

No se modifica la exportacion vigente del dashboard:

- Historico operativo por modulo.
- Exportaciones de detalle.
- Excel 5 min.
- Reportes diarios.
- Historico completo.
- Exportacion de la vista desde el frontend.
- Correo/reportes que usan los servicios actuales.

El frontend actual no tenia referencias a `/api/v1/water/export/...`.

## Archivos modificados

### Backend

```text
backend/app/main.py
backend/app/api/routes/water_export.py
backend/app/services/water_export_service.py
```

### Documentacion

```text
CAMBIOS_HOMOLOGACION_DURANGO_13_LIMPIEZA_EXPORTACION_HEREDADA.md
```

## Validacion dirigida

- Compilacion/sintaxis Python de los archivos modificados.
- Busqueda estatica de referencias al router heredado.
- Confirmacion de que el frontend no consume `/api/v1/water/export/...`.
- Sin suites generales de backend/frontend porque no se tocaron calculos,
  SQL Server, historicos, reportes activos ni componentes visuales.
