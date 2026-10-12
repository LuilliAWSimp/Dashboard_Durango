# Arquitectura CSS de Durango

`global.css` queda como base heredada estable. No es el destino automatico de nuevas correcciones visuales.

## Responsabilidades

- `tokens.css`: valores globales y aliases semanticos `--arca-*`.
- `shared.css`: patrones que son realmente compartidos por varias pantallas.
- `theme.css`: contrato transversal claro/oscuro heredado 11/11A; mantiene la precedencia del tema sin devolverla a `global.css`.
- `pages/shell.css`: Shell operativo, Sidebar, Header, navegación, contexto de planta y selector de tema.
- `pages/login.css`: Login y precarga inicial.
- `pages/usuarios.css`: administración local de usuarios.
- `pages/resumen.css`: Resumen ejecutivo, KPIs propios del Resumen y alertas embebidas.
- `pages/operational-modules.css`: superficies/KPIs/cards compartidos por Pozos, Lineas, Lavadoras y Jarabes.
- `pages/detalles.css`: estructura base del detalle operativo.
- `pages/historicos.css`: controles, tooltips y exportaciones del histórico.
- `pages/turnos.css`: cortes y presentación compartida de turnos.
- `pages/revision-diaria.css`: Revisión diaria, diagnósticos y contraste propio.
- `pages/reportes.css`: Reportes, preview, correo programado e histórico completo.
- `pages/balance.css`: Balance de Agua; cualquier ajuste visual nuevo del módulo debe vivir aquí, no en `global.css`.
- `pages/operational-cards-details.css`: cards/detalles operativos migrados en la primera fase.
- `pages/session-controls.css`: sesion lateral y cambio propio de contrasena.
- `pages/*.css`: cualquier otra pantalla, familia funcional o responsabilidad concreta que se migre despues.
- `global.css`: legado/base. Solo se toca por una correccion transversal justificada o una migracion dirigida y verificada.

## Scopes activos

- `.dashboard-resumen-page`: frontera del Resumen.
- `.operational-module-page`: frontera comun de modulos.
- `.operational-module-well-page`, `.operational-module-line-page`, `.operational-module-flow-page`: scopes derivados disponibles cuando una diferencia real del modulo lo justifique.

Los wrappers usan `display: contents` para aportar una frontera CSS sin introducir una caja nueva en el layout.

## Regla para cambios nuevos

1. identificar la pantalla/componente real;
2. localizar la regla ganadora antes de editar;
3. preferir el archivo de responsabilidad correcto;
4. delimitar selectores al contexto (`.pozos-shell`, pagina o componente);
5. no mover y redisenar en el mismo cambio;
6. comprobar claro/oscuro y consumidores que comparten clases;
7. retirar la regla heredada solo cuando su reemplazo este verificado.

La migracion es gradual. No se crean hojas vacias para aparentar modularizacion y no se trasladan bloques muertos solo para reducir el numero de lineas de `global.css`.

## Durango 18E — cierre estructural de la fase CSS

La fase 18/18B/18C/18D/18E deja propietarios definidos para Shell, Login, Usuarios, Resumen, módulos operativos, Detalles, Históricos, Turnos, Revisión diaria y Reportes. El contrato transversal de tema 11/11A vive ahora en `theme.css`.

`global.css` sigue existiendo como base heredada estable: contiene patrones antiguos, módulos físicos todavía no migrados (por ejemplo Balance/Concesión/UV cuando corresponda) y utilidades cuya responsabilidad aún no justifica una migración. Que permanezcan allí no significa que `global.css` vuelva a ser destino para trabajo nuevo.

La fase CSS se considera **estructuralmente cerrada**, no porque `global.css` esté vacío, sino porque el trabajo nuevo ya tiene destinos claros, las capas están ordenadas y las migraciones futuras pueden hacerse por responsabilidad cuando exista trabajo real sobre cada módulo.

## Durango 19 — Balance de Agua

Al intervenir funcionalmente el Balance se creó `pages/balance.css`. Desde este punto cualquier corrección visual nueva del Balance debe ir a esa hoja. Las reglas antiguas que todavía permanezcan en `global.css` se consideran legado y sólo deben migrarse mediante un cambio dirigido y verificado.

## Durango 42 — cierre CSS V2

El cierre V2 retira de `global.css` familias completas que ya no pertenecen al runtime navegable de Durango: Resumen/Pozos antiguos, Tanques, UV y Concesión. El Balance migra su base visual viva a `pages/balance.css`; las tablas y estados reutilizados pasan a `shared.css`; y la base de `metric-pair` de las cards vive en `pages/operational-modules.css`.

`global.css` continúa existiendo como base heredada para primitivas y contratos compartidos cuya migración no debe hacerse a ciegas. Desde este punto no debe contener estilos de módulos deshabilitados por capabilities ni recuperar reglas específicas de Balance. La eliminación física de componentes legacy queda separada para el incremental de limpieza de legado.
