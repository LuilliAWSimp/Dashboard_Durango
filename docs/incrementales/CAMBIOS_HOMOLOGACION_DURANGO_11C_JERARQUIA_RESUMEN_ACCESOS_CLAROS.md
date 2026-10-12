# Dashboard Durango · Homologación 11C
## Jerarquía del Resumen + Accesos operativos en modo claro

### Objetivo
Corregir tres detalles visuales/jerárquicos detectados en el Resumen después de la homologación del modo claro.

### 1. Se elimina el selector de fechas superior del Resumen
Se retiró el bloque `SqlChartDateControls` que aparecía dentro del encabezado **Resumen hídrico de Durango**.

El Resumen vuelve a comportarse como un snapshot operativo del **día actual**, por lo que no necesita un selector global adicional en la parte superior.

No se modifican las consultas ni la conciliación del backend. El controlador conserva el rango de hoy internamente para:
- KPIs diarios;
- comparativos diarios;
- histórico del Resumen;
- alertas.

### 2. Comparativo diario baja de jerarquía
El bloque **Comparativo diario por módulo** se movió.

Orden anterior:
1. Encabezado / selector
2. KPIs
3. Comparativo diario
4. Histórico operativo
5. Flujo de pozos
6. Alertas

Orden nuevo:
1. Encabezado del Resumen
2. KPIs
3. Histórico operativo por módulo
4. Gráfica de flujo de pozos
5. **Comparativo diario por módulo**
6. Alertas y prioridades
7. Accesos operativos

Esto da mayor prioridad visual a la operación e históricos, dejando el comparativo como información analítica secundaria antes de las alertas.

Como ya no existe selector superior, también se ajustaron los textos:
- `Seleccionado` → `Día actual`
- `Día seleccionado ...` → `Día actual ...`

### 3. Accesos operativos adaptados al modo claro
Las cards de **Accesos operativos** ya no conservan el fondo oscuro del modo nocturno.

En `theme-light` ahora usan:
- fondo blanco;
- borde azul suave;
- título azul marino;
- texto secundario gris-azulado;
- badge `DISPONIBLE` azul oscuro con texto blanco;
- hover con borde y sombra azul suave.

El modo oscuro permanece sin cambios.

### Archivos modificados
- `frontend/src/pages/pozos/sections/DashboardBaseSection.tsx`
- `frontend/src/styles/global.css`

### No se modifica
- backend;
- SQL Server;
- sensores/mapeos;
- conciliación;
- reportes;
- SMTP;
- autenticación;
- correo programado;
- reglas del totalizador.

### Aplicación
Aplicar después de los incrementales visuales 11, 11A y 11B.
