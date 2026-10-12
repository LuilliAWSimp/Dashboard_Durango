# DGO-C04A — Hotfix visual de Concesiones

## Se aplica sobre
- `Incremental_DGO_C04_Durango.zip`

## Objetivo
Corregir la maquetación rota del módulo **Concesiones de agua** después del incremental DGO-C04.

## Ajustes incluidos
1. **Tarjetas de concesión por pozo**
   - Se reforzó la estructura visual del encabezado, valor principal, barra y pie.
   - Se reemplazaron wrappers estructurales sensibles por contenedores más robustos.
   - Se mejoró el ajuste cuando el texto del título / sensor / estado crece.

2. **Resumen operativo mensual**
   - Se aseguraron las cards de métricas (`Acumulado`, `Promedio`, `Mes de mayor volumen`) para que mantengan formato de tarjeta y no aparezcan corridas como texto plano.

3. **Ruta de validación**
   - Se reestructuró el bloque para mantener la separación visual de encabezado y pasos.

4. **Estado de sincronización**
   - Se reforzó la maquetación del panel de sincronización (`con-sync-*`) para que el progreso y el footer conserven separación visual.

5. **CSS defensivo / robusto**
   - Se agregaron reglas de hotfix para navegadores/entornos donde ciertos wrappers se estaban renderizando de forma inline.
   - Se mejoró el comportamiento responsive para evitar que elementos se monten o pierdan jerarquía visual.

## Archivos modificados
- `frontend/src/pages/pozos/sections/ConcesionesSection.tsx`
- `frontend/src/styles/pages/concesiones.css`

## No se tocó
- Backend
- Endpoints
- Lógica de sincronización DGO-C04
- Cálculo de histórico / BOS / SQLite

## Validación sugerida
1. Abrir **Concesiones de agua**.
2. Verificar que las tarjetas **Concesiones por pozo** ya no muestren el contenido corrido en una sola línea.
3. Verificar que el bloque **Extracción mensual** muestre nuevamente las tres métricas como tarjetas.
4. Verificar que **Información de la concesión** mantenga su tabla/ficha ordenada.
5. Verificar que **Estado de integración** muestre cada paso en su card correspondiente.
6. Probar en oscuro, claro y si es posible en una resolución intermedia.
