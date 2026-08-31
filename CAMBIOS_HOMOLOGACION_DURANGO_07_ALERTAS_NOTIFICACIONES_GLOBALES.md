# Homologación Durango 07 — Alertas y notificaciones globales

## Objetivo

Homologar la experiencia global de notificaciones de Durango sin modificar la lógica hidráulica que decide cuándo existe una alerta.

Este incremental trabaja únicamente sobre la presentación, cola y control de los avisos emergentes.

## Contrato de notificaciones

- Máximo **1 notificación visible** a la vez.
- Máximo **8 notificaciones conservadas** en la cola global.
- La notificación más reciente ocupa la posición visible.
- Al cerrar o vencer la visible, la siguiente de la cola pasa a mostrarse.
- Las alertas operativas activas se deduplican por identidad/código.
- Una alerta que permanece activa durante varios refresh no crea toasts repetidos.
- Si una alerta se resuelve y posteriormente vuelve a aparecer, sí puede generar un nuevo toast.

## Minimizar / expandir

El centro global puede minimizarse.

Al minimizar:

- se conserva la cola;
- se muestra una cápsula compacta con el total pendiente;
- el temporizador del toast visible se pausa;
- se puede expandir otra vez sin perder avisos.

## Cerrar todas

Se agrega una acción explícita **Cerrar todas**.

Esta acción limpia únicamente las notificaciones visuales pendientes. No altera el estado físico de las alertas ni modifica el evaluador hidráulico.

Si una condición operativa continúa activa, el tracker la considera todavía activa y no vuelve a producir un toast en cada polling. Sólo podrá reaparecer como aviso nuevo después de resolverse y activarse nuevamente.

## Deduplicación

`NotificationInput` admite `dedupeKey`.

Las alertas de agua utilizan:

```text
water-alert:<alert.id>
```

Esto permite que, además del tracker de alertas activas, la propia cola pueda reemplazar una entrada con la misma identidad en caso de una notificación repetida.

## Navegación

Se conserva el comportamiento existente:

- Pozo → detalle de Pozo.
- Línea → detalle de Línea.
- Lavadora / Jarabes → detalle correspondiente.

Seleccionar `Ver detalle` elimina ese toast de la cola y navega al elemento.

## Lógica hidráulica preservada

No se modificó `waterOperationalAlerts.ts`.

Siguen siendo las mismas condiciones las que generan:

- `Sin comunicación`;
- `Lectura no reciente`;
- `Volumen no validable`.

Un flujo cero con lectura reciente y comunicación correcta sigue sin ser una alerta.

## Archivos modificados

```text
frontend/src/pages/pozos/components/NotificationCenter.tsx
frontend/src/styles/global.css
frontend/tests/waterOperationalAlerts.test.ts
CAMBIOS_HOMOLOGACION_DURANGO_07_ALERTAS_NOTIFICACIONES_GLOBALES.md
```

## Pruebas

Se ejecutó:

```text
node --experimental-strip-types --test tests/waterOperationalAlerts.test.ts
```

Resultado:

```text
17 pruebas correctas
0 fallos
```

Se añadieron regresiones específicas para comprobar:

- `MAX_VISIBLE_TOASTS = 1`;
- cola máxima de 8;
- deduplicación de alertas;
- minimizar;
- expandir;
- `Cerrar todas`.

## No modificado

- backend;
- SQL Server;
- `.env`;
- autenticación;
- SMTP;
- sensores y mapeos;
- turnos;
- conciliación;
- reportes;
- histórico;
- reglas de Pozo 1;
- cambio histórico de Jarabes.

## Validación visual sugerida

1. Abrir Dashboard con una alerta activa.
2. Verificar que sólo aparece un toast aunque existan varias alertas.
3. Confirmar el contador `N en cola`.
4. Cerrar la visible y comprobar que aparece la siguiente.
5. Minimizar y confirmar que queda la cápsula compacta.
6. Expandir y verificar que la cola continúa intacta.
7. Usar `Cerrar todas` y verificar que desaparece el centro.
8. Abrir una alerta con `Ver detalle` y comprobar navegación al elemento correcto.
