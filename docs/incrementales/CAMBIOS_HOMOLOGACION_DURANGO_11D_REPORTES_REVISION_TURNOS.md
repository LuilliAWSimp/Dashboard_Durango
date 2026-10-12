# Dashboard Durango · Homologación 11D
## Reportes + Revisión diaria + Turnos en modo claro

### Objetivo
Cerrar el primer bloque de pulido visual pendiente del modo claro, manteniendo intacta la lógica hidráulica y los datos.

### Cambios

#### Reportes
- Todos los `report-summary-card` pasan a fondo azul oscuro con texto blanco en modo claro.
- Se conserva un acento ámbar superior cuando una tarjeta requiere revisión, sin convertir toda la tarjeta a pastel.
- El aviso informativo inferior deja de usar una superficie gris/oscura heredada y adopta azul ARCA con texto blanco.
- Se aumenta el contraste de labels, cifras y textos secundarios dentro de los KPIs de Reportes.

#### Revisión diaria
- Se agregan clases específicas para el encabezado, los KPIs y el panel de detalle diario.
- Se refuerza el contraste de títulos y subtítulos.
- La tabla de detalle usa encabezado azul claro, texto azul oscuro, filas blancas y alternancia azul muy suave.
- Hover de filas más visible sin recurrir a gris como superficie.

#### Turnos
Se estandarizan tres estados visuales en modo claro:

- **Cierre definitivo**: card blanca/azul muy claro, borde azul fuerte y acento azul.
- **Corte parcial**: amarillo vivo (`#FFD84D` aprox.), borde ámbar fuerte y texto oscuro.
- **Pendiente**: cian vivo, borde azul brillante y texto azul oscuro.

El estado se comunica por la tarjeta completa, no sólo por el badge.

También los desplegables inferiores de cada turno reciben las mismas clases `completed`, `partial` y `pending`, por lo que ya no se pierden contra el fondo cuando están cerrados.

### Archivos modificados
- `frontend/src/pages/pozos/sections/RevisionDiariaSection.tsx`
- `frontend/src/pages/pozos/components/ShiftConsumptionPanel.tsx`
- `frontend/src/styles/global.css`

### No se modificó
- backend
- SQL Server
- sensores o mapeos
- autenticación
- SMTP
- correo programado
- cálculos de turnos
- cálculo de volúmenes
- reglas de calidad

### Dependencia
Aplicar después de los incrementales visuales `11A`, `11B` y `11C`.
