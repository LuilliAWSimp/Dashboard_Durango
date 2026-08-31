# Homologación Durango 11 — Modo claro/oscuro y contrato visual global

## Objetivo

Añadir a Durango el contrato visual reusable definido durante la homologación de Zapopan/Guadalupe sin modificar la lógica hidráulica ni la seguridad del proyecto.

El modo oscuro actual continúa siendo el predeterminado. El modo claro es opcional y se activa desde el sidebar.

## Persistencia

La preferencia se almacena en:

```text
arca-durango-theme
```

Valores admitidos:

```text
dark
light
```

Si no existe valor o `localStorage` no está disponible, se usa `dark`.

La aplicación escucha también el evento `storage`, por lo que cambiar el tema en otra pestaña puede sincronizar la preferencia.

## Selector

El sidebar muestra:

- `Modo claro` cuando el tema actual es oscuro.
- `Modo oscuro` cuando el tema actual es claro.

El selector permanece disponible con el sidebar expandido o colapsado.

## Contrato visual del modo claro

### Sidebar

El sidebar se mantiene azul oscuro en ambos temas para conservar identidad y contraste.

### Header

En modo claro usa azul ARCA/agua en lugar del gradiente rojo del tema oscuro.

### Superficies

- fondo general azul muy claro;
- paneles blancos;
- bordes azules suaves;
- tipografía azul marino;
- textos secundarios azul/gris azulado de alto contraste.

### KPIs

Regla global:

> Los KPIs permanecen azules con texto blanco tanto en modo oscuro como en modo claro.

Esto evita que los indicadores ejecutivos pierdan jerarquía visual.

### Tablas

- encabezados azul claro;
- texto azul oscuro;
- divisores suaves;
- contenedores blancos.

### Formularios

Inputs, selects y textarea usan fondo blanco, texto oscuro y `color-scheme: light` para que calendarios y controles nativos sean legibles.

### Gráficas

No se cambian colores de series. Sólo se adaptan:

- cuadrícula;
- ejes;
- ticks;
- leyendas;
- tooltips.

### Estados

- estados normales: azul oscuro + blanco;
- pendientes/sin datos: azul claro;
- advertencias: amarillo suave;
- críticos: rojo suave.

No se usan fondos grises oscuros para estados neutros en modo claro.

### Exportaciones

Los botones Excel mantienen verde y los PDF conservan su semántica visual.

## Archivos modificados

```text
frontend/src/App.jsx
frontend/src/components/Sidebar.jsx
frontend/src/components/Sidebar.tsx
frontend/src/styles/global.css
```

## Prueba agregada

```text
frontend/tests/durangoThemeToggle.test.ts
```

Verifica:

1. oscuro predeterminado;
2. persistencia `arca-durango-theme`;
3. clases `theme-dark/theme-light`;
4. selector presente en JSX y TSX;
5. sidebar azul;
6. paneles claros;
7. KPIs azules con texto blanco;
8. tablas, controles y gráficas adaptadas.

## Fuera de alcance

No se modificó:

- SQL Server;
- sensores;
- mapeos;
- conciliación;
- calidad;
- turnos;
- reportes y cálculos;
- SMTP;
- correo programado;
- autenticación;
- roles;
- `.env`.
