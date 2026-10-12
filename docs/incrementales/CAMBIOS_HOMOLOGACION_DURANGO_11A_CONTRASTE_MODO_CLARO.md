# Homologación Durango 11A — Contrato global de contraste para modo claro

## Objetivo

Corregir la baja legibilidad detectada en el modo claro, especialmente en títulos, subtítulos, labels y textos auxiliares sobre superficies blancas.

El problema no era funcional: varios componentes conservaban colores diseñados para el modo oscuro (`#67d7f5`, `#a9d5e8`, `#8bcce2`, etc.) y, al mostrarse sobre blanco, perdían contraste.

Este incremental establece un contrato visual reusable para Durango y para futuras homologaciones ARCA.

## Paleta canónica del modo claro

| Uso | Color |
|---|---|
| Fondo general | `#F3F8FC` |
| Superficie / card | `#FFFFFF` |
| Título principal | `#0B1F3A` |
| Título de sección/card | `#163A5F` |
| Texto normal | `#334E68` |
| Texto secundario | `#5C7184` |
| Label / eyebrow | `#234A70` |
| Acento visible | `#0369A1` |
| Borde | `#C7DCEB` |
| Fondo secundario | `#E8F3FA` |
| Hover claro | `#F0F7FB` |

## Regla principal

Los cianes claros se permiten como:

- iconos;
- decoración;
- bordes;
- fondos;
- gráficas.

No se deben usar como color principal de texto funcional sobre fondo blanco.

En particular, colores equivalentes a `#7DD3FC`, `#BAE6FD`, `#CFFAFE` o los tonos heredados del modo oscuro no deben utilizarse para títulos, labels o descripciones sobre superficies claras.

## Jerarquía tipográfica

### Título principal

Ejemplos:

- Reportes
- Resumen
- Pozos
- Líneas
- Lavadoras
- Revisión diaria

Color: `#0B1F3A`.

### Título de sección o card

Color: `#163A5F`.

### Texto normal

Color: `#334E68`.

### Texto secundario

Color: `#5C7184`.

### Labels y eyebrows

Ejemplos:

- CENTRO DE REPORTES
- NOMBRE
- PERIODO
- DESTINATARIOS
- FORMATOS
- FECHA
- ACCIONES

Color: `#234A70`.

## Reportes

Se corrigieron específicamente:

- `CENTRO DE REPORTES`;
- título `Reportes`;
- subtítulo de planta;
- descripción de la sección;
- introducción del selector de periodo;
- labels de Tipo, Fecha y Acciones;
- títulos del preview;
- títulos de Pozos, Líneas, Lavadoras y Jarabes;
- contadores de elementos;
- textos secundarios y metadatos.

Las acciones principales permanecen azules con texto blanco. Las acciones secundarias conservan alto contraste.

## Programar correo

Se corrigieron:

- `Automatización`;
- `Programar correo`;
- descripción;
- Nombre, Periodo, Destinatarios y Formatos;
- ayuda de 12 h / 24 h;
- zona horaria y retraso;
- Programaciones;
- próximo envío y último estado;
- botones Enviar ahora / Pausar / Eliminar.

La acción destructiva `Eliminar` usa ahora rojo oscuro sobre fondo rojo muy claro, evitando el rosa casi invisible.

## Formularios

Todos los inputs, selectores y textarea del modo claro usan:

- texto oscuro;
- fondo blanco;
- borde azul-gris visible;
- placeholder con contraste suficiente;
- estado disabled legible.

## Tablas

Contrato:

- encabezado: `#E8F3FA`;
- texto de encabezado: `#234A70`;
- filas: blanco;
- texto: `#334E68`;
- hover: `#F0F7FB`.

## Estados semánticos

| Estado | Fondo | Texto |
|---|---|---|
| Normal / Validado | azul oscuro | blanco |
| Sin datos / neutral | `#E8EDF2` | `#44576A` |
| Cobertura parcial / revisión | `#FFF3CD` | `#765B00` |
| Crítico | `#FDE7E7` | `#A61B1B` |

Estos colores deben conservar el mismo significado en todas las secciones.

## KPIs

No cambian respecto al Incremental 11:

- fondo azul;
- texto blanco;
- misma apariencia en modo claro y oscuro.

No deben transformarse en cards blancas.

## Excepciones deliberadas

El sidebar y header continúan azules. Sus textos siguen siendo blancos/claros porque están sobre una superficie oscura.

## Archivos modificados

- `frontend/src/styles/global.css`
- `frontend/tests/durangoThemeToggle.test.ts`

## Pruebas

Ejecutar:

```powershell
cd frontend
node --experimental-strip-types --test tests/durangoThemeToggle.test.ts
```

Resultado esperado: 6 pruebas correctas.

## No modificado

- backend;
- SQL Server;
- `.env`;
- autenticación;
- sensores;
- mapeos;
- cálculos hidráulicos;
- reportes backend;
- SMTP;
- correo programado;
- turnos.
