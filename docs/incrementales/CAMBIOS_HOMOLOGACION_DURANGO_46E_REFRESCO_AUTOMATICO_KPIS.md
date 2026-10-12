# Incremental 46E — Refresco automático efectivo de KPIs

## Objetivo

Corregir el caso observado en planta donde el ciclo visual de 60 s avanzaba, pero las KPIs del Resumen podían conservar valores anteriores hasta cambiar de sección. La optimización mantiene intactas las fórmulas y reduce trabajo redundante entre Resumen y Revisión Diaria.

## Cambios

- `useSqlChartDashboard` conserva `force_refresh=true` exclusivamente para acciones manuales.
- El polling automático de 60 s ahora omite únicamente la caché cliente del dashboard mediante `bypassCache`.
- `bypassCache` es una opción interna del frontend y no se envía como parámetro al backend.
- La deduplicación de peticiones `inFlight` continúa activa incluso cuando el polling omite la caché cliente.
- La caché backend del periodo que incluye el día actual baja de 60 s a 50 s para que expire antes del siguiente ciclo compartido de 60 s.
- La caché histórica cerrada conserva 10 minutos.
- Las KPIs actuales del Resumen pasan a utilizar el periodo que ya entrega `/water/dashboard/dashboard`.
- Revisión Diaria deja de volver a solicitarse cada vez que cambia `lastRefreshAt`.
- Revisión Diaria queda utilizada para las referencias de día anterior y semana anterior; esas referencias no necesitan recalcularse cada minuto.
- Los resúmenes derivados de Lavadoras y Jarabes conservan volumen validado, actividad, cobertura y estados de calidad requeridos por las KPIs y la tabla comparativa.

## No se tocó

- Fórmulas de volumen, flujo, totalizador o tiempo activo.
- Sensores, IDs, operational keys ni factores.
- Turnos.
- SQL físico ni estructura de tablas.
- BOS/SCADA.
- Reglas de validación o conciliación.
- Frecuencia visible de actualización: continúa en 60 s.
- Históricos, gráficas, exportaciones, Reportes o Balance.
- CSS o diseño.

## Validación dirigida

- Frontend: 42/42 pruebas dirigidas aprobadas sobre auto-refresh, caché, Resumen, Revisión Diaria, cards y presentación operativa.
- Backend: 7/7 pruebas dirigidas aprobadas sobre periodo, caché 46B, deduplicación 46C, paralelismo 46D y servicios de agua/Revisión Diaria.
- `py_compile` correcto para el servicio de periodo y la prueba 46E.
- `tsc --noEmit` continúa mostrando deuda TypeScript preexistente en `KpiCard.style`, contrato `minute` y exportación del histórico; no aparecieron errores nuevos asociados a `bypassCache` ni a `useSqlChartDashboard`.
- No se hicieron consultas reales a SQL Server ni BOS.

## Validación manual recomendada

1. Abrir Resumen y anotar los volúmenes actuales.
2. Permanecer en Resumen hasta pasar uno o dos ciclos de 60 s.
3. Confirmar que las KPIs cambian sin navegar a otra sección cuando existan lecturas nuevas.
4. Confirmar que la tarjeta `Última actualización` avance junto con los datos y no por separado.
5. Después de un refresco automático, abrir Pozos, Líneas, Lavadoras y Jarabes; deben reutilizar el periodo recién actualizado.
6. Confirmar que los valores coinciden entre Resumen y cada módulo.
7. Probar `Actualizar` manualmente y confirmar que continúa forzando una lectura nueva.

## Archivos modificados

- `frontend/src/services/waterService.js`
- `frontend/src/pages/pozos/hooks/useSqlChartDashboard.ts`
- `frontend/src/pages/pozos/sections/DashboardBaseSection.tsx`
- `backend/app/services/water_period_service.py`
- `frontend/tests/optimization46E.test.ts`
- `backend/tests/test_durango_period_refresh_46e.py`
