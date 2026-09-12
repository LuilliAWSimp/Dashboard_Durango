# Incremental 18E — Cierre CSS: Shell + Login + Usuarios + Tema

## Objetivo
Cerrar estructuralmente la fase robusta de migración CSS iniciada en 18, sin vaciar `global.css` a la fuerza ni rediseñar pantallas.

## Cambios

- Nueva responsabilidad `styles/pages/shell.css` para Shell, Sidebar, Header, navegación, contexto de planta y controles propios del shell.
- Nueva responsabilidad `styles/pages/login.css` para Login y precarga inicial.
- Nueva responsabilidad `styles/pages/usuarios.css` para administración local de usuarios.
- Nueva capa transversal `styles/theme.css` con el contrato claro/oscuro heredado 11/11A, conservando su precedencia antes de las hojas por pantalla.
- `UsersPage.tsx` expone ahora el scope `.users-page` mediante `display: contents`.
- `global.css` ya no contiene los bloques de Shell/Login/Usuarios ni el contrato 11/11A.
- `global.css` pasa de 5,952 a 4,243 líneas en 18E.
- Desde el inicio de la fase CSS pasa de 9,218 a 4,243 líneas: 4,975 líneas dejan de ser responsabilidad del global.
- No se interpreta esta reducción como eliminación de estilos: las reglas activas se trasladaron a propietarios explícitos.

## Cierre estructural

La fase 18/18B/18C/18D/18E deja destinos explícitos para:

- Shell / Sidebar / Header;
- Login / precarga;
- Usuarios / auth visual;
- Resumen;
- módulos operativos;
- Detalles;
- Históricos;
- Turnos;
- Revisión diaria;
- Reportes;
- patrones compartidos;
- tema claro/oscuro.

`global.css` continúa como base heredada estable. Conserva patrones antiguos y módulos físicos todavía no migrados de forma dirigida (por ejemplo Balance, Concesión o UV). No vuelve a ser el destino por defecto de correcciones nuevas.

## Validación dirigida

- 12/12 pruebas de arquitectura CSS + presentación/navegación: OK.
- Balance de llaves de todas las hojas CSS: OK.
- `UsersPage.tsx`: transpilación sintáctica OK.
- `main.jsx`: transpilación sintáctica OK.
- Sin restos de los marcadores 11/11A, Shell/Login/Usuarios migrados dentro de `global.css`.
- No se ejecutaron suites hidráulicas/backend.
