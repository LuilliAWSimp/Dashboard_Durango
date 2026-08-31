# Homologación Durango 11J — colores globales Excel / PDF

## Regla visual
Se unifica el código de color de las acciones de exportación en todo el dashboard:

- **Excel:** verde con texto blanco.
- **PDF:** rojo vino / borgoña sobrio con texto blanco.

El tono PDF evita el rojo brillante reservado a alarmas, errores o estados críticos.

## Alcance
Se aplica a:
- Histórico operativo por módulo.
- Excel conciliado de 5 minutos.
- Reportes diarios.
- Histórico completo de planta.
- Botones de exportación del encabezado cuando estén disponibles.

Los estilos se conservan tanto en modo oscuro como en modo claro.

## Archivos modificados
- `frontend/src/pages/pozos/sections/ReportesSection.tsx`
- `frontend/src/components/Header.jsx`
- `frontend/src/components/Header.tsx`
- `frontend/src/styles/global.css`

No se modificó ninguna rutina de generación, datos, backend, sensores, SQL Server, autenticación ni correo.
