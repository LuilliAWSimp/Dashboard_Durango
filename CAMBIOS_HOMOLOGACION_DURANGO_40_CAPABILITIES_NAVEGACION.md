# Homologación Durango 40 — Capabilities y navegación

## Objetivo

Hacer que la navegación visible de Durango dependa del contrato real de capacidades de planta en lugar de una lista hardcodeada en `App.jsx`.

## Cambios

### Contrato de capabilities

Se amplió el contrato backend/frontend con capacidades explícitas para:

- Pozos;
- Líneas;
- Flujos como familia técnica;
- Lavadoras;
- Jarabes;
- Revisión diaria;
- Reportes;
- Turnos;
- Balance;
- Concesión.

También quedan declarados explícitamente como no disponibles:

- Tanques;
- CIP;
- Lámparas UV;
- Consumos heredados;
- Energía.

Balance conserva `pending_physical_validation` y Concesión conserva `pending_validation`; este incremental no los convierte en módulos confirmados.

### Navegación dinámica

`App.jsx` ya no contiene `POZOS_MENU_ITEMS`.

La precarga de `/water/dashboard/dashboard` ya entrega `plant_capabilities`; el frontend extrae ese contrato y construye el menú desde `plantCapabilities.ts`.

Política actual:

- `true` -> visible y accesible;
- `false` -> oculto y bloqueado;
- `pending_validation` / `pending_physical_validation` -> visible pero identificado como pendiente/en validación.

Por ello:

- `Balance de Agua` se presenta como `Balance de Agua · En validación`;
- `Concesión` se presenta como `Concesión · Pendiente`.

La decisión física/administrativa final sobre estos dos módulos se mantiene para el Incremental 41.

### Protección de rutas

`PozosDashboardPage` valida la sección contra el mismo contrato.

Una ruta directa a una sección deshabilitada, heredada o inexistente redirige a `/pozos/dashboard` en lugar de renderizar silenciosamente el Resumen bajo una URL incorrecta.

Usuarios continúa dependiendo del rol `admin`; no se modela como capability física de planta.

### Compatibilidad

Si un backend anterior omite una capability nueva, el frontend usa el contrato local como fallback para no romper la navegación durante despliegues parciales.

## Validación

- 37/37 pruebas frontend focales de capabilities/navegación y regresiones inmediatas: OK.
- 104/104 pruebas frontend dirigidas del bloque modernizado: OK.
- 23/23 pruebas backend dirigidas de capabilities, Balance y SCADA: OK.
- `py_compile` de capabilities y prueba nueva: OK.
- auditor runtime: 84 archivos alcanzables, 65 de código, 18 CSS, 0 imports relativos sin resolver.
- CSS sin cambios respecto al Incremental 39.
- `global.css` sin cambios.
- No se ejecutaron suites completas.
- No se consultó SQL Server ni BOS.

## Fuera de alcance

No se modificaron sensores, IDs, `operational_key`, factores, unidades, SQL, BOS, conciliación, cálculos de flujo/volumen/totalizador, históricos, exportaciones, SMTP, autenticación ni reglas físicas del Balance.
