# Conexión SQL Server ARCA

Este proyecto queda apuntando a la instancia SQL Server de tu captura:

```txt
Servidor: SERVER-SCADA\SQLSCADA
Base de datos: ARCA
Autenticación: Windows Authentication
Usuario esperado: SERVER-SCADA\Administrador
```

La configuración principal está en `backend/.env`:

```env
DB_MODE=sqlserver
DATABASE_MODE=sqlserver
SQLSERVER_HOST=SERVER-SCADA\SQLSCADA
SQLSERVER_DATABASE=ARCA
SQLSERVER_DRIVER=ODBC Driver 17 for SQL Server
SQLSERVER_TRUST_CERT=true
SQLSERVER_ENCRYPT=no
SQLSERVER_USE_WINDOWS_AUTH=true
SQLSERVER_SOURCE_MODE=table
SQLSERVER_SOURCE_TABLE=dbo.v_dashboard_measurements
```

El backend también incluye alias compatibles con versiones anteriores:

```env
DB_SERVER=SERVER-SCADA\SQLSCADA
DB_NAME=ARCA
DB_DRIVER=ODBC Driver 17 for SQL Server
DB_TRUSTED_CONNECTION=true
```

Ejecuta el backend desde Windows con el mismo usuario que abre SQL Server Management Studio / Azure Data Studio. En tu captura es `SERVER-SCADA\Administrador`:

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Luego prueba:

```txt
http://localhost:8000/health/db
http://localhost:8000/docs
```

Para que el dashboard energético use la vista canónica, ejecuta `database/sqlserver/create_dashboard_views_arca.sql` dentro de la base `ARCA` y verifica:

```sql
SELECT TOP 10 * FROM dbo.v_dashboard_measurements;
```

El módulo hídrico intenta leer estas fuentes reales si existen en `ARCA`:

```txt
dbo.SensorsBOS_Pozo
dbo.SensorsBOS_Tanque
dbo.SensorsBOS_Linea
iot.sensors
iot.wells_monitoring
iot.sp_get_energy_water
```

Si tienes instalado ODBC Driver 18 en vez de 17, cambia en `backend/.env`:

```env
SQLSERVER_DRIVER=ODBC Driver 18 for SQL Server
DB_DRIVER=ODBC Driver 18 for SQL Server
```

Si vas a correr el backend desde otra máquina o con un usuario que no tenga permisos por Windows Authentication, cambia a usuario/password SQL:

```env
SQLSERVER_USE_WINDOWS_AUTH=false
DB_TRUSTED_CONNECTION=false
SQLSERVER_USERNAME=tu_usuario_sql
SQLSERVER_PASSWORD=tu_password_sql
```
