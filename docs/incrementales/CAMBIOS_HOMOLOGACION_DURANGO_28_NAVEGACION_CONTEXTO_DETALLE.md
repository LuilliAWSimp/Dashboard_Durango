# Durango 28 - Navegación contextual entre elementos

## Objetivo
Homologar la navegación de detalle para Pozos, Líneas, Lavadoras y Jarabes sin alterar datos hidráulicos ni contratos backend.

## Cambios
- `Volver` resuelve y muestra el origen real de la navegación: Resumen, Pozos, Líneas, Lavadoras o Jarabes.
- El retorno conserva el `pathname + search` original, por lo que filtros y contexto de la pantalla de origen no se pierden.
- Al ejecutar `Volver`, el detalle se reemplaza por el origen en vez de agregar otra entrada al historial del navegador.
- Se limpia únicamente el estado interno `returnTo/fromOperationalModule` al volver, conservando cualquier estado ajeno.
- Anterior/Siguiente continúa reemplazando la card actual para no acumular una cadena de detalles en el historial.
- La navegación entre hermanos usa un helper común y conserva exactamente rango y agrupación activos.
- Soporta tanto IDs numéricos como `operational_key` (por ejemplo lavadoras sin `sensor_id`).
- Se agregaron etiquetas accesibles `Anterior:` y `Siguiente:` sin alterar la lógica hidráulica.

## Fuera de alcance
No se modificó SQL Server, BOS, sensores, IDs, cálculos, conciliación, backend, endpoints, exportaciones, Reportes, Revisión diaria, Turnos, Balance ni CSS/global.css.
