# DGO-C02 — Homologación visual de Concesiones

## Base de aplicación

**Sólo aplicar sobre Durango con DGO-C01 ya instalado.** El ZIP contiene exclusivamente archivos nuevos/modificados con rutas relativas a la raíz del proyecto; se puede extraer sobre esa raíz y aceptar la sustitución de los archivos coincidentes. No es un proyecto completo.

**Commit sugerido para GitHub Desktop:** `DGO-C02 | Homologar interfaz y análisis documental de concesiones`

## Cambios de experiencia

1. **Tarjetas por pozo de ancho completo:** volumen autorizado, título, identificador de BOS, archivo PDF, participación porcentual sobre el total de cuotas registradas y selección visual del pozo activo. La barra es **participación en el total registrado**, no consumo de la concesión.
2. **Sección analítica más próxima al demo original** con dos vistas:
   - **Cuotas autorizadas:** gráfica de barras verticales en m³/año, eje de referencia y leyenda, calculada automáticamente con los datos que devuelve `GET /api/v1/concessions`. Cambios hechos por admin se ven al refrescar la API.
   - **Extracción mensual:** espacio visual con meses y estado explícito **Sin histórico mensual conciliado**, sin barras inventadas ni promedios atribuidos a lecturas reales. No se interpretan `extracted_year_m3`, `remaining_m3` ni `usage_percent` mientras el backend los envíe `null`.
3. **Expediente por pozo enriquecido:** panel de volumen de referencia, participación sobre el total, número de título, origen, sensor, vigencias, uso por verificar, estado de extracción, remanente pendiente, documento adjunto y bitácora.
4. **Estado de integración visible:** captura provisional, validación documental y conciliación BOS.
5. **Responsive y modo claro/oscuro** en estilos acotados a `.concessions-page` / `.con-v2`, sin cambiar CSS de otras secciones.

## Contratos C01 preservados

- API y persistencia SQLite **sin modificaciones**.
- `admin` puede abrir **Administrar**, actualizar volumen/título/vigencias/observaciones, previsualizar/subir PDF y publicar; roles `operator` y `viewer` sólo consultan.
- La descarga de PDF, historial de auditoría, consulta periódica de 30 segundos y refresco al recuperar foco siguen funcionando.
- No hay cambios de base de datos, migraciones, dependencias, sensores, BOS, históricos, balance o reportes.
- La validación documental sigue pendiente y la incorporación de un PDF no equivale a aprobación regulatoria.

## Importante para el usuario final

Los números 460,908 y 364,407 m³/año vienen de una fotografía del correo: son **provisionales**. No se debe confundir la distribución matemática de estas cuotas entre pozos (aprox. 55.8 % y 44.2 %) con el porcentaje consumido. Los gráficos de extracción real, remanente y proyección necesitan reconciliación posterior con las lecturas de BOS, el ciclo legal y vigencias de cada título.

## Archivos en este incremental

- **Modificado:** `frontend/src/pages/pozos/sections/ConcesionesSection.tsx`
- **Modificado:** `frontend/src/styles/pages/concesiones.css`
- **Nuevo:** `frontend/src/utils/durangoConcessionVisual.ts`
- **Nuevo:** `frontend/tests/concesionesVisualDgoC02.test.ts`
- **Nuevo:** `docs/incrementales/INCREMENTAL_DGO_C02_HOMOLOGACION_VISUAL_CONCESIONES.md` (esta guía)

## Validación dirigida

1. Instalar encima de **DGO-C01** y recompilar / reiniciar el frontend según el proceso habitual de la planta. **No es necesario reiniciar o migrar SQLite por este incremental**, aunque podría convenir reiniciar la interfaz para desplegar los assets nuevos.
2. Entrar como `viewer`: seleccionar cada pozo, cambiar entre **Cuotas autorizadas** / **Extracción mensual**, comprobar que **Administrar** no aparezca.
3. Entrar como `admin`: editar en un pozo un volumen de prueba, comprobar que las dos barras y porcentajes de reparto cambien después de **Guardar y publicar**. Restaurar el valor validado por el cliente después de la prueba. Verificar que siguen funcionando PDF, descarga y auditoría.
4. Confirmar que no aparecen consumos ficticios, proyecciones ni saldos regulados sin conciliar.
5. Revisar desktop/móvil y temas claro/oscuro, comprobar que páginas distintas a Concesiones conservan su estilo.
6. Validar que una segunda sesión ve los cambios tras el refresco normal (máximo 30 s mientras está activa y enfocada).

## Pruebas en entorno de trabajo

- Frontend (Node): `node --experimental-strip-types --test frontend/tests/*.test.ts`: **202 correctas** (196 anteriores + 6 de DGO-C02).
- Backend existente: `DB_MODE=demo PYTHONPATH=backend python -m pytest backend/tests -q`: **190 correctas**, sin cambios al backend.
- `ConcesionesSection.tsx` transpilado por API de TypeScript **sin diagnósticos sintácticos**.
- **No se pudo completar un build real de Vite**: el entorno no dispone de la instalación íntegra de `frontend/node_modules`; la instalación npm offline no encontró todos los paquetes requeridos. Ejecutar `npm install` o `npm ci` en el equipo con acceso a dependencias, seguido del build habitual, antes de despliegue.
