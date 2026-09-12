# Homologación Durango 11I — Reset de scroll al navegar

## Objetivo
Corregir la navegación del Dashboard de Durango para que, al cambiar de sección o abrir/cambiar un detalle operativo, la vista comience nuevamente desde la parte superior.

## Comportamiento anterior
Si el usuario hacía scroll hasta la parte baja de una sección y después cambiaba a otra, React conservaba la posición vertical y la nueva sección aparecía también desplazada hacia abajo.

## Cambio aplicado
En `PozosDashboardPage.jsx` se agregó un efecto dependiente únicamente de:

- `section`
- `itemId`

Cuando cualquiera de esos valores cambia, en el siguiente frame de render se ejecuta:

- `window.scrollTo({ top: 0, left: 0, behavior: 'auto' })`

## Qué sí reinicia la vista
- Resumen → Pozos
- Pozos → Líneas
- Líneas → Lavadoras
- Lavadoras → Jarabes
- Revisión diaria → Reportes
- Reportes → Usuarios
- Entrar de una card a su detalle
- Cambiar de Pozo 1 a Pozo 2 dentro del detalle
- Volver del detalle al módulo

## Qué NO reinicia la vista
El efecto no depende de los parámetros de consulta ni de estados internos, por lo que no se ejecuta al:

- cambiar fechas;
- cambiar agrupación;
- cambiar Flujo / Totalizador / Ambos;
- seleccionar o deseleccionar sensores;
- actualizar una gráfica;
- recibir un polling/refresco automático.

## Archivo modificado
- `frontend/src/pages/PozosDashboardPage.jsx`

## Alcance
No se modifica backend, SQL Server, sensores, mapeos, autenticación, reportes ni cálculos hidráulicos.
