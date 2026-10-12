# DGO-C06 - Analitica visual, respaldo SQLite y limpieza de Git

## Requisito previo
Aplicar sobre **DGO-C05** (que ya incluye DGO-C04A). Entregar solo rutas modificadas.

## Cambios visuales
- La **extraccion mensual** sigue siendo la grafica principal, con volumen real procesado en SQLite.
- Indicadores por pozo: volumen acumulado, mes en curso, dias con volumen valido, mes de mayor extraccion.
- Debajo de la grafica mensual se visualiza el **estado de los 12 meses**: fuera de periodo, sin datos, parcial o con lecturas. Fuera de periodo/sin datos no se registran como cero.
- Grafica acumulada mas compacta, sin interpolar meses sin lecturas.
- Se mantiene la separacion entre volumen observado y saldo legal, y toda la administracion de documentos.
- Estilos solo en Concesiones, con responsive oscuro/claro.

## Datos persistentes
El historico de 70 dias que termino de cargar vive en:
`backend/data/concessions.sqlite3`

**NO borrar, renombrar ni copiar encima del archivo.** Ni Git ni la instalacion del ZIP deben sustituirlo.

La UI ya consulta SQLite; abrir pagina o entrar desde otra computadora no vuelve a leer 70 dias desde BOS.

## Respaldo automatico diario (NUEVO)
El backend arranca un proceso liviano que genera un respaldo diario con la API `sqlite3.Connection.backup()`, validado con `PRAGMA quick_check` y la presencia de tablas.

Ruta predeterminada: una carpeta hermana del repositorio en la IPC:
`..\ARCA_Durango_Backups\concesiones\concessions_AAAA-MM-DD.sqlite3`

Configuracion opcional: variable de entorno `ARCA_CONCESSIONS_BACKUP_DIR` para enviar los respaldos a otra unidad persistente, **fuera del repositorio**. Se conservan **7 archivos diarios**; fallos se registran en logs y no interrumpen el backend. Este respaldo en la misma unidad no sustituye una copia externa ante falla del disco.

El respaldo no copia los `-wal` ni `-shm`, y tampoco fuerza a cerrar el dashboard. Incluye tanto las cuotas/documentos referenciados en SQLite como los consumos y cursor de sincronizacion. **Los PDFs originales se guardan como archivos aparte y deben respaldarse tambien** desde `backend/data/concessions/documents/`.

El respaldo automatico empieza tras iniciar el servidor (retraso breve), y comprueba la fecha una vez por hora.

## GitHub Desktop: desvincular solo una vez (opcional y recomendado)
`gitignore` oculta archivos no rastreados, pero Git puede seguir mostrando la SQLite si fue incluida anteriormente.

1. **Antes de operar:** comprobar que Concesiones abre y conserva su historico; guardar un respaldo fuera del repositorio. Esperar a que aparezca la copia diaria; el script se negara a continuar si no la encuentra.
2. Desde GitHub Desktop en la IPC elegir `Repository > Open in Command Prompt` (o abrir PowerShell en la carpeta raiz del proyecto, con Git instalado).
3. Comprobar sin cambiar nada:
   `powershell -ExecutionPolicy Bypass -File tools\Desvincular_SQLite_Concesiones_Git.ps1`
4. Si detecta correctamente base y respaldo, ejecutar explicitamente:
   `powershell -ExecutionPolicy Bypass -File tools\Desvincular_SQLite_Concesiones_Git.ps1 -Confirmar`
5. Volver a GitHub Desktop: pueden verse **eliminaciones preparadas del indice** de los tres archivos; es esperado y **no significa borrado fisico**. Hacer un commit UNICO de limpieza, junto con `.gitignore` si aun falta. Verificar que la base sigue fisicamente en `backend/data`.
6. En posteriores sincronizaciones, los archivos SQLite/WAL/SHM ya no deben aparecer como cambios.

**No usar `Discard changes`, restauracion de rama ni checkout para limpiar los archivos de la base viva.** El script solo usa `git rm --cached` sobre las rutas exactas. Si Git no esta accesible desde PowerShell, se recomienda abrir la terminal de GitHub Desktop y repetir; no se deben borrar archivos manualmente.

## Archivos modificados/nuevos
- `.gitignore` (modificado)
- `backend/app/main.py` (modificado)
- `backend/app/services/concession_backup_service.py` (nuevo)
- `backend/tests/test_durango_concessions_c06_backup.py` (nuevo)
- `frontend/src/pages/pozos/sections/ConcesionesSection.tsx` (modificado)
- `frontend/src/styles/pages/concesiones.css` (modificado)
- `frontend/src/utils/durangoConcessionOperational.ts` (modificado)
- `frontend/tests/concesionesVisualDgoC06.test.ts` (nuevo)
- `tools/Desvincular_SQLite_Concesiones_Git.ps1` (nuevo)

## No cambia
BOS / SQL Server, cuota legal, PDFs, permisos de administracion, ni los datos de la SQLite actual.

## Validacion dirigida
1. Verificar que 70/70 guardados sigue disponible al reiniciar y abrir en otro navegador.
2. Confirmar que las tarjetas de 2 pozos y las graficas usan exactamente los datos de C05.
3. Revisar dos modos y movil, estados parciales/sin datos.
4. Comprobar respaldo nuevo fuera del repositorio; validar integridad y numero de archivos diarios.
5. Ejecutar la limpieza de Git solo despues de verificar respaldos y la ruta de la base.
