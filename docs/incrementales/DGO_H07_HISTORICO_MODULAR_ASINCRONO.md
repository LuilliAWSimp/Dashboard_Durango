# DGO-H07 — Histórico operativo modular sin timeout HTTP

**Base:** DGO-H06. **Entrega:** ZIP incremental de solo archivos cambiados o nuevos.

## Problema observado
En Resumen, el histórico por módulo de 1 día tardaba demasiado y al consultar 2 días aparecía «No fue posible consultar el histórico operativo», sin detalles en la consola. El navegador consumía `/api/v1/water/history/module` con **timeout de 30 segundos**; el backend podía continuar trabajando después de que el navegador había cortado. Al fallar la nueva consulta, podían permanecer dibujados los datos anteriores, creando una presentación ambigua. El servidor también invalidaba la clave de caché del día actual **en cada minuto**, aun con TTL configurado.

## Cambios
1. **Trabajos por módulo:** `POST /api/v1/water/history/module/jobs` inicia una consulta autenticada y protegida por CSRF. El backend usa una cola en memoria de máximo un cálculo BOS modular activo y hasta 8 trabajos esperando/en proceso; se rechazan nuevas solicitudes cuando alcanza el límite.
2. **Estado y resultado:** `GET /api/v1/water/history/module/jobs/{id}` informa `queued | running | ready | failed`. `GET /api/v1/water/history/module/jobs/{id}/result` entrega los mismos datos que el endpoint modular original una vez listo. La consulta ya no depende de una conexión HTTP abierta durante todo el cálculo.
3. **Cliente:** el frontend inicia el trabajo, consulta su estado cada 2.5 s y recibe el resultado final. Cada petición HTTP es corta; la operación tiene una espera máxima de 15 minutos para evitar quedar indefinidamente en progreso si BOS se atasca.
4. **Reutilización controlada:** se reutiliza un trabajo en cola, activo o recién completado del mismo usuario y parámetros. Los resultados completados caducan y se eliminan de memoria. Los trabajos no contienen contraseñas ni archivos de la planta.
5. **Caché del día actual:** la clave del histórico modular se agrupa en ventanas de 5 minutos, con TTL mínimo de 5 minutos mientras incluya el día actual. Un refresco manual sigue usando `force_refresh` y genera nueva consulta. **La gráfica histórica puede llevar hasta unos minutos de retraso** frente a la lectura instantánea de SCADA; no sustituye la información en vivo de los KPIs.
6. **Estados visuales claros:** al cambiar módulo, rango o agrupación se oculta la gráfica anterior. Se indica si el trabajo está en cola, consultando BOS o si no pudo completarse. Los errores de red/timeout ahora muestran información comprensible, no solamente el mensaje genérico.

## Seguridad y roles
- Todos los roles autenticados (`admin`, `operator`, `viewer`) pueden consultar históricos, como antes.
- La creación del job es `POST` con sesión y CSRF; se añade **solo esta ruta** a las mutaciones de autoservicio ya permitidas por el middleware.
- El estado y resultado solo son accesibles para el **usuario dueño** (ID interno); consultar un ID ajeno devuelve 404.
- No se filtran detalles de conexión SQL Server/ODBC en errores.

## Límites y consideraciones
- Esta implementación **no modifica SQL Server, BOS, totalizadores, fórmulas de conciliación, ni la validación física**. Se conservan las políticas existentes de 1 día/minuto, 7 días/15 min, 31 días/hora y 366 días/diario.
- El procesamiento subyacente puede seguir tardando si BOS/SQL Server tarda. El cambio **elimina el timeout del navegador como causa inmediata**, limita concurrencia, mejora el reuso y facilita distinguir estados. No se garantiza una duración fija.
- La cola es **local a una única instancia FastAPI**. Al reiniciar backend, los trabajos en curso y resultados en memoria desaparecen; habrá que consultar nuevamente. Si la IPC ejecuta varios procesos/workers, hará falta almacenamiento compartido de trabajos (no incluido).
- Los endpoints síncronos existentes `/history/module` y las exportaciones siguen disponibles por compatibilidad.
- La mejora se refiere al histórico **por módulo del Resumen**. Los detalles de un sensor usan `/history` y tienen su propio flujo anterior.
- No se tocan SQLite de autenticación o Concesiones, `.gitignore`, ni la cola H01 de reportes.

## Instalación y validación en IPC
1. Respaldar proyecto; aplicar sobre H06 **sin sobrescribir ninguna SQLite operativa**.
2. Reiniciar backend y reconstruir frontend. Ambos requieren actualizarse juntos; el cliente nuevo usa los endpoints de jobs nuevos.
3. Abrir Resumen / Histórico por módulo: consultar 1 día, luego 2 días (`Por hora`), esperar hasta que el trabajo termine y verificar el gráfico del rango correcto.
4. Cambiar fechas durante la consulta: no debe permanecer el gráfico anterior atribuido al nuevo rango.
5. Volver a seleccionar un rango ya consultado: comprobar que el reuso reciente evita consultar de nuevo a BOS de inmediato. `Actualizar` debe obligar a actualizar.
6. Probar simultáneamente desde dos sesiones y con roles `viewer`/`operator`/`admin`; todos consultan, pero no pueden leer IDs de trabajos de otras cuentas.
7. Revisar logs del backend en la IPC y tiempos reales de BOS, antes de afirmar una mejora numérica. Si persiste lentitud, investigar planes de consulta/índices sobre `iot.readings_minute` y la lectura física de validación, **sin desactivar las reglas de calidad**.

## Verificación local
Pruebas automatizadas con SQLite de prueba y loaders simulados; no se accedió a BOS ni a la IPC real. Compilación completa de Vite/TypeScript pendiente porque el entorno carece de dependencias `node_modules`.

**Commit sugerido:** `DGO-H07 | Evitar timeout del histórico modular con jobs y corregir caché y estados visuales`
