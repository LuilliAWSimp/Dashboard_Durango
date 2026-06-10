# Cambios aplicados

Esta version corrige los errores reportados en la pantalla de Pozos:

1. Rango de fechas
   - El boton Actualizar ahora limpia la cache del frontend.
   - Se fuerza una nueva consulta aunque el usuario use el mismo rango.
   - Reportes ahora envia `start_date` y `end_date`, no una sola fecha.

2. Estado de comunicacion de pozos
   - Si el pozo trae flujo real (`flujo_entrada` o `flujo_salida` > 0), se muestra como `Encendido` y `Normal`.
   - La calidad del tag solo marca `Sin comunicacion` cuando no hay flujo.

3. Unidades de flujo
   - Los flujos de pozos se muestran como `L/s`, igual que en SCADA.

4. Dependencias backend
   - El `requirements.txt` incluye `pydantic-settings` y `email-validator` para evitar errores de importacion.

Despues de reemplazar archivos, reinicia backend y frontend.
