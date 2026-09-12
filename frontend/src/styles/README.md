# Arquitectura CSS de Durango

`global.css` queda como base heredada estable. No es el destino automatico de nuevas correcciones visuales.

## Responsabilidades

- `tokens.css`: valores globales y aliases semanticos `--arca-*`.
- `shared.css`: patrones que son realmente compartidos por varias pantallas.
- `pages/*.css`: reglas pertenecientes a una pantalla, familia funcional o responsabilidad concreta.
- `global.css`: legado/base. Solo se toca por una correccion transversal justificada o una migracion dirigida y verificada.

## Regla para cambios nuevos

1. identificar la pantalla/componente real;
2. localizar la regla ganadora antes de editar;
3. preferir el archivo de responsabilidad correcto;
4. delimitar selectores al contexto (`.pozos-shell`, pagina o componente);
5. no mover y redisenar en el mismo cambio;
6. comprobar claro/oscuro y consumidores que comparten clases;
7. retirar la regla heredada solo cuando su reemplazo este verificado.

La migracion es gradual. No se crean hojas vacias para aparentar modularizacion.
