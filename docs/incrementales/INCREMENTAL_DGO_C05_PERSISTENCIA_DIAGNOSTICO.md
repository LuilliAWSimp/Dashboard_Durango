# DGO-C05 — Persistencia verificable, diagnóstico y tarjetas de Concesiones

## Base y aplicación

- **Aplicar SOBRE DGO-C04A**, que a su vez sigue a C04. No es un ZIP completo.
- Contiene únicamente archivos nuevos/modificados y sus rutas relativas.
- Reemplazar archivos y reiniciar backend + reconstruir frontend como en otras entregas.
- No incluir ni sobrescribir las bases de datos existentes (`*.sqlite3`), su WAL o documentos.

## ¿Se tienen que volver a consultar los 70 días?

**No.** Ya desde C04 los consumos diarios, mensuales y el cursor de procesamiento viven en `backend/data/concessions.sqlite3` (ruta configurable con `CONCESSION_DATABASE_PATH`).

- El `GET /api/v1/concessions/history/monthly?year=2026` consulta sólo SQLite; no ejecuta ningún SQL de BOS.
- `concession_sync_state.next_backfill_day` conserva el último día procesado y reanuda a partir del siguiente tras reiniciar la IPC.
- Cada usuario ve la misma información de la IPC, incluso tras refrescar el navegador.
- En condiciones normales, tras 70/70 el sincronizador sólo lee días recientes cada ~15 minutos y agrega los nuevos días conforme avance el calendario.
- Una reconstrucción manual de 7 días es una petición administrativa aparte, no ocurre al abrir la pantalla.
- **La sincronización 70/70 representa días procesados, NO 70 días con lecturas válidas.** C05 distingue ambos.

**Importante**: si el archivo `concessions.sqlite3` se borra, se reemplaza por uno vacío, cambia su ruta o se implementa otra IPC sin compartir los datos, será necesario recomputar lo faltante. Verificar que la carpeta `backend/data` sea persistente y no se reemplace durante despliegues.

### Respaldo recomendado

Además de respaldar los PDF en `backend/data/concessions/documents`, realizar copias de `concessions.sqlite3`. Para obtener una copia coherente con la IPC encendida, usar el mecanismo de respaldo en línea de SQLite (API `sqlite3.Connection.backup`); no copiar solamente el `.sqlite3` mientras haya un fichero WAL activo. Si la IPC está detenida correctamente también puede copiarse el archivo cerrado. No distribuir estas bases dentro de incrementales.

## Cambios de C05

1. **Migración segura de SQLite**: agrega campos opcionales de primer y último totalizador diario, eventos descartados y discontinuidades. Usa `ALTER TABLE` solamente cuando faltan columnas; los registros C04 se mantienen intactos.
2. **Diagnóstico por pozo y año**: días esperados, procesados, con volumen válido, sin lecturas, excluidos y cobertura de muestras cuando es calculable. Las lecturas de inicio/fin son referenciales y podrían estar ausentes para el histórico antiguo; **no se usan como consumo**.
3. **Tarjetas de pozos**: sustituyen el texto "Extracción operativa en construcción" por el volumen medido disponible en SQLite para el año seleccionado. Sigue marcado como operativo/parcial, nunca legal.
4. **Estado de sincronización**: se muestra que los datos ya están guardados en SQLite y que consultar desde otra pestaña o navegador no obliga a recalcular.
5. **Actualización incremental justa**: cuando los días de ayer y hoy están desactualizados, se prioriza el más antiguo por última sincronización; esto evita que ayer impida procesar hoy.
6. **Cobertura responsable**: si faltan expectativas de muestras en días procesados, el porcentaje aparece como no determinado en vez de dar una cifra engañosa. El cero real validado cuenta como día válido.

## No se modifica

- Configuración de BOS, sensores ni consultas industriales fuera del sincronizador.
- Roles, autenticación, PDF, archivos de documentos ni auditoría.
- Otros módulos del dashboard.
- Cálculo del saldo legal (sigue pendiente hasta validar título y vigencia).

## Pruebas dirigidas en la IPC

1. **Antes de instalar, respaldo**: guardar copia segura de la SQLite persistente y de la carpeta de documentos.
2. Revisar Concesiones: progreso previamente completo (p. ej., 70/70) debe **seguir completo** al reiniciar backend y al abrir desde otro navegador.
3. Abrir y refrescar varias veces: respuesta rápida, sin nuevo procesamiento inicial de 70 días ni 120 segundos de timeout.
4. En tarjetas de pozo comprobar que el valor de extracción observada coincide con el panel del mismo pozo y año.
5. En calidad de datos comprobar conteos por pozo. Un día procesado sin observaciones NO suma consumo cero; un cero medido válido sí se cuenta.
6. Contrastar volúmenes con Histórico de Pozos para las mismas fechas. Las lecturas finales de SCADA acumuladas desde su propia puesta en marcha no son directamente el consumo desde el corte SCADA.
7. Probar modo oscuro/claro y ventanas reducidas.

## Validación del paquete

- Tests backend: 203 aprobados (ejecutados con `DB_MODE=demo`, aislados de SQL Server).
- Tests frontend: 204 aprobados.
- Sintaxis TSX: transpile de TypeScript sin diagnósticos.
- Compilación Vite completa pendiente del entorno con dependencias de frontend instaladas.
- Sin conexión a la IPC real/BOS desde este entorno; pendiente de validación en planta.
