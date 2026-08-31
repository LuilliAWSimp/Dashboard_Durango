# Homologación Durango 11H — botón Volver en modo claro

## Objetivo
Corregir el botón **"Volver"** dentro del detalle individual de Pozos/Líneas/Flujos para que deje de usar apariencia gris poco integrada al tema claro.

## Cambios aplicados
- Se ajustó el estilo de `.back-inline-button` exclusivamente en `theme-light`.
- El botón ahora usa un fondo azul grisáceo consistente con la paleta clara del dashboard.
- Se forzó texto blanco para mejorar la legibilidad.
- Se actualizaron `hover` y `focus-visible` para conservar contraste y coherencia visual.

## Archivo incluido
- `frontend/src/styles/global.css`

## Resultado esperado
- El botón **Volver** ya no se muestra con fondo gris plano en modo claro.
- El contraste del texto mejora y el botón se percibe como una acción navegable del mismo sistema visual.
