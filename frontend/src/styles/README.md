# Arquitectura CSS de Durango

`global.css` queda como base heredada estable. No es el destino automatico de nuevas correcciones visuales.

## Responsabilidades

- `tokens.css`: valores globales y aliases semanticos `--arca-*`.
- `shared.css`: patrones que son realmente compartidos por varias pantallas.
- `pages/resumen.css`: Resumen ejecutivo, KPIs propios del Resumen y alertas embebidas.
- `pages/operational-modules.css`: superficies/KPIs/cards compartidos por Pozos, Lineas, Lavadoras y Jarabes.
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
