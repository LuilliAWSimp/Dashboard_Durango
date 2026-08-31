# Dashboard Durango · Homologación 11B
## KPIs en azul oscuro + cards con referencia visual Zapopan (modo claro)

### Objetivo
Ajustar el **modo claro** para que:

1. **Todos los KPI cards** se muestren con **fondo azul oscuro y texto blanco** para mejorar contraste.
2. Las **cards operativas de elementos** (por ejemplo, tarjetas de Líneas, Pozos, Lavadoras, etc.) adopten una apariencia más cercana a la referencia visual de **Zapopan**:
   - superficie clara,
   - título y métricas con mejor jerarquía,
   - pastillas de estado más visibles,
   - bloques métricos internos más definidos.

### Archivo modificado
- `frontend/src/styles/global.css`

### Cambios aplicados

#### 1) KPI cards en azul oscuro
Se reforzó la personalización de `.kpi-card` dentro de `.pozos-shell.theme-light` para que en modo claro:
- el fondo quede en **gradiente azul oscuro**,
- el texto principal, unidad y subtítulo/trend queden en **tonos blancos / azul muy claro**,
- el glow y la decoración interna sigan visibles sin perder contraste.

#### 2) Cards operativas estilo Zapopan
Se ajustaron los estilos de:
- `.operational-element-card`
- `.operational-card-head`
- `.metric-pair`
- `.operational-card-footer`
- `.open-detail-link`

Con esto:
- la tarjeta principal queda blanca con borde azul suave,
- los encabezados quedan más oscuros y legibles,
- las métricas internas usan bloques gris-azulados más parecidos a la referencia,
- el footer queda más limpio y claro,
- los estados “ACTIVO” / similares ganan mayor presencia visual.

#### 3) Estados dentro del encabezado operativo
Se ajustaron las pastillas de estado del encabezado para que:
- estados normales/activos usen azul oscuro con texto blanco,
- warning conserve semántica ámbar,
- estados neutros/sin datos se mantengan claros pero visibles.

### Alcance
- **Sólo se toca presentación visual del frontend**.
- **No se modifica lógica, datos, endpoints ni autenticación**.
- Los cambios están orientados específicamente al **modo claro**.

### Nota
No fue posible ejecutar `vite build` dentro de este entorno porque el binario de Vite no está disponible aquí (`vite: not found`). Aun así, el incremental contiene únicamente cambios de CSS, sin alterar la estructura funcional del proyecto.
