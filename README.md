# Dashboard ARCA — Planta Durango

Dashboard operativo para monitoreo hidráulico de Planta Durango. El proyecto usa React + Vite en frontend y FastAPI en backend, con lecturas operativas provenientes de SQL Server / Blue Open Studio (BOS).

## Estado funcional al cierre de homologación

Módulos activos:

- Resumen.
- Pozos.
- Líneas.
- Lavadoras.
- Jarabes.
- Revisión diaria.
- Reportes.
- Turnos.
- Usuarios, sólo para rol `admin`.

Módulo visible con contrato protegido:

- Balance de Agua — **En validación física**. Presenta los grupos por separado y no publica una diferencia oficial hasta confirmar la topología física.

Módulos deshabilitados para Durango:

- Tanques.
- CIP.
- Lámparas UV.
- Consumos heredados.
- Energía.
- Concesión.

Concesión permanece deshabilitada mientras no existan título, volumen autorizado, vigencia/ciclo y relación legal título ↔ pozo confirmados.

## Mapeo operativo confirmado

### Pozos

- Pozo 1 — sensor `1001`, `POZO_FLOW_OUT[0]`.
- Pozo 2 — sensor `1051`, `POZO_FLOW_OUT[1]`.

Pozo 1 conserva la regla temporal de calibración: antes del `2026-08-11 12:15` local el flujo raw se normaliza desde m³/h; desde ese corte se usa L/s directo.

### Líneas

- Línea 1 — sensor `2002`.
- Línea 3 — sensor `2006`.
- Línea 4 — sensor `2008`.
- Línea 5 — sensor `2010`.

### Lavadoras

- Lavadora Línea 2 — sensor `2004`, `LINEA_FLOW_IN[1]`.
- Lavadora Vidrio — `operational_key=lavadora_vidrio`, fuente `LAVADORAS_0`.
- Lavadora Ref Pet — `operational_key=lavadora_ref_pet`, fuente `LAVADORAS_1`.

### Jarabes

- Jarabes — sensor actual `3004`, `TANQUE_FLOW_IN[1]`.
- Se conserva el corte histórico del canal anterior `3010` para no relabelar datos previos incorrectamente.

Corte general de configuración SCADA validada: `2026-08-04 18:16` hora local.

## Turnos

- Turno 1: `00:00–07:00`.
- Turno 2: `07:00–15:00`.
- Turno 3: `15:00–00:00` del día siguiente.

La interfaz distingue el estado temporal del corte de la calidad/disponibilidad de datos. Un cero válido no se trata como ausencia de información.

## Históricos y exportaciones

Los históricos compartidos soportan:

- agrupación `1m`, `15m`, `1h`, `1d` según el rango permitido;
- Flujo, Totalizador o Ambos;
- totalizador por variación o valor absoluto;
- volumen por intervalo o acumulado progresivo en detalle;
- Excel;
- PDF;
- Excel 5 min.

El contrato de exportación sigue la regla **lo que se ve = lo que se exporta** para módulo, elementos, rango, agrupación, métrica y modo visible.

## Reportes

Reportes soportados:

- Vista previa operativa.
- PDF.
- Excel.
- HTML.
- Correo manual.
- Correo programado con hora exacta.

La estructura canónica es:

1. Resumen.
2. Pozos.
3. Líneas.
4. Lavadoras.
5. Jarabes.
6. Turnos/anexos cuando correspondan.

Los nombres de archivo incluyen fecha o rango y hora de generación compatible con Windows.

## Autenticación

La autenticación de Durango es local e independiente mediante SQLite. Usa:

- cookies HTTP-only de sesión;
- `browser_session`;
- CSRF;
- roles `admin`, `operator` y `viewer`;
- expiración y revocación de sesiones.

No incluir `.env`, credenciales, contraseñas ni bases SQLite de producción en los incrementales o commits.

## Stack

### Frontend

- React 18.
- Vite.
- JavaScript/TypeScript canónico sin pares duplicados JS/TS.
- Recharts.
- Axios.
- CSS modular por área.

### Backend

- FastAPI.
- SQLAlchemy.
- SQL Server / PyODBC.
- Pandas.
- OpenPyXL.
- ReportLab.
- SQLite para autenticación y programación persistente de correos.

## Estructura principal

```text
frontend/
  src/
    components/
    config/
    hooks/
    pages/
      pozos/
        components/
        hooks/
        sections/
    services/
    styles/

backend/
  app/
    api/
    auth/
    services/
  tests/

tools/
  audit_runtime_baseline.py
```

Al cierre del Incremental 45, los **64 archivos de código frontend existentes están alcanzables desde `main.jsx`**, sin pares JS/TS duplicados ni imports relativos sin resolver.

## Instalación frontend

```powershell
cd frontend
npm install
npm run dev
```

Validaciones recomendadas con dependencias instaladas:

```powershell
npm test
npm run typecheck
npm run build
```

## Instalación backend

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Python 3.11/3.12 es la referencia recomendada para despliegue por compatibilidad con PyODBC y dependencias binarias.

## Pruebas

Frontend:

```powershell
cd frontend
npm test
```

Backend aislado de SQL Server, cuando se quiera validar lógica sin conectar a planta:

```powershell
$env:DB_MODE="sqlite"
$env:DATABASE_URL="sqlite:///./test_dashboard.db"
python -m pytest -q tests
```

Las pruebas aisladas no sustituyen la validación final contra SQL Server/BOS real de planta.

## Auditor de runtime

```powershell
python .\tools\audit_runtime_baseline.py --incremental 45 --write .\docs\RUNTIME_BASELINE_DURANGO_45.md
```

El auditor registra imports frontend, CSS alcanzable, rutas React, literales API y routers FastAPI sin consultar SQL Server ni BOS.

## Pendientes externos al cierre técnico

- Confirmar físicamente qué grupos forman el Balance oficial antes de habilitar aritmética de balance.
- Mantener Concesión deshabilitada hasta disponer de evidencia legal completa.
- Hacer smoke test en la PC de planta contra SQL Server/BOS después del despliegue.
- Probar un envío SMTP real y una ejecución programada en el entorno productivo.

## Licencia

Uso interno / privado.
