# Dashboard ARCA

Sistema de monitoreo operativo y analítico para infraestructura hidráulica e industrial.

El proyecto integra visualización de datos, reportes, análisis operativo y monitoreo de activos como:

* Pozos
* Líneas
* Tanques
* Balance hidráulico
* Concesión
* Revisión diaria
* Lámparas UV
* Consumos
* Reportes operativos

El frontend está desarrollado con React + Vite y actualmente se encuentra en proceso de migración y modularización gradual hacia TypeScript.

---

# Características principales

## Dashboard operativo

Visualización centralizada de:

* Producción de agua
* Consumo energético
* KPIs operativos
* Estados de comunicación
* Tendencias históricas
* Métricas por periodo
* Comparativas entre activos

## Módulo de Pozos

Incluye:

* Tarjetas operativas
* Tabla comparativa
* Detalle individual de pozo
* Gráficas de agua y energía por periodo
* Timeline histórico
* Métricas derivadas
* Soporte para rangos de fecha

## Módulo de Líneas

Incluye:

* Monitoreo de líneas
* Estados operativos
* Detalle de línea
* Históricos y tendencias
* Comparativas

## Módulo de Tanques

Incluye:

* Nivel y capacidad
* Distribución
* Estado operativo
* Tendencias

## Balance hidráulico

Visualización de:

* Entrada
* Distribución
* Consumo
* Balance operativo

## Revisión diaria

Incluye:

* Prioridades de inspección
* Eventos operativos
* Indicadores del día
* Seguimiento operativo

## Lámparas UV

Vista operativa basada en flujo asociado.

Importante:

La vista UV NO simula diagnóstico técnico completo de lámparas.

Actualmente se basa únicamente en:

* Flujo asociado
* Estado inferido
* Comunicación
* Tendencia operativa

No se inventan métricas no disponibles en la base de datos como:

* intensidad UV
* vida útil
* horas acumuladas
* desinfección garantizada

## Reportes

Incluye exportación de:

* PDF
* Excel
* HTML
* Vista previa operativa

Características:

* Logo integrado en PDF
* Manejo de rangos de fecha
* Generación dinámica
* Compatibilidad con Chromium
* Correcciones para exportación segura de PDF

---

# Stack tecnológico

## Frontend

* React 18
* Vite
* TypeScript (migración gradual)
* Recharts
* Axios
* CSS personalizado

## Backend

* FastAPI
* SQLAlchemy
* Pandas
* ReportLab
* PyODBC
* SQL Server

---

# Estructura actual del proyecto

```text
frontend/
  src/
    components/
    hooks/
    services/
    data/
    pages/
      pozos/
        components/
        hooks/
        sections/
        chartBuilders.ts
        dateUtils.ts
        normalizers.ts
        types.ts
      PozosDashboardPage.jsx

backend/
  app/
  exports/
```

---

# Estado actual de la arquitectura

El proyecto originalmente concentraba gran parte de la lógica operativa en:

```text
PozosDashboardPage.jsx
```

Actualmente esa lógica ya fue modularizada en:

* sections/
* hooks/
* components/
* utilidades compartidas

Beneficios:

* menor riesgo al modificar secciones
* mantenimiento más sencillo
* mejor separación de responsabilidades
* mejor base para TypeScript
* menos cambios colaterales
* mejor colaboración entre desarrolladores

---

# Migración gradual a TypeScript

La migración a TypeScript es incremental.

Actualmente:

* existe configuración TS
* existe separación modular
* ya hay archivos `.tsx`
* existen tipos y utilidades compartidas

La migración se realiza por fases para evitar romper:

* reportes
* exportaciones
* gráficas
* lógica SQL
* navegación

---

# Requisitos

## Requisitos recomendados

* Node.js 20+
* Python 3.11 o 3.12
* SQL Server
* ODBC Driver 17 o 18 for SQL Server

Importante:

Python 3.14 actualmente NO es recomendado para este proyecto debido a incompatibilidades con:

* pyodbc
* Pillow
* pydantic-core

---

# Instalación frontend

```bash
cd frontend
npm install
npm run dev
```

---

# Instalación backend

```bash
cd backend
py -3.12 -m venv .venv
.venv\Scripts\activate

python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

Ejecutar backend:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

---

# Inicio rápido con .bat

El proyecto puede iniciarse mediante un archivo `.bat` que:

* levanta backend
* levanta frontend
* abre automáticamente el navegador

Ejemplo:

```bat
@echo off
title Dashboard ARCA

set PROJECT_DIR=C:\Ruta\Dashboard-arca

start "Backend ARCA" cmd /k "cd /d %PROJECT_DIR%\backend && .venv\Scripts\activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

start "Frontend ARCA" cmd /k "cd /d %PROJECT_DIR%\frontend && npm run dev"

timeout /t 8 /nobreak > nul
start http://localhost:5173
```

---

# Base de datos

Actualmente el sistema trabaja principalmente con:

* SQL Server
* procedimientos almacenados
* lecturas BOS
* datos históricos de sensores

El proyecto también incluye:

* fallbacks
* mocks
* degradación controlada

para permitir desarrollo sin acceso completo a SQL Server.

---

# Exportaciones

El sistema soporta:

* PDF
* Excel
* HTML
* Imagen

Las exportaciones PDF fueron ajustadas para evitar problemas de Chromium relacionados con:

```js
window.open + noopener
```

Ahora utilizan:

* Blob
* URL.createObjectURL
* flujo de impresión más seguro

---

# Desarrollo

## Validaciones recomendadas

```bash
npm run typecheck
npm run build
npm run dev
```

---

# Notas importantes

## Conteo incorrecto de HTML en GitHub

GitHub puede mostrar un porcentaje alto de HTML debido a:

```text
backend/exports/
```

Esto corresponde a reportes generados/exportados y no al frontend principal.

Se recomienda usar:

```gitattributes
backend/exports/** linguist-vendored
frontend/dist/** linguist-generated
```

---

# Estado del proyecto

El sistema actualmente se encuentra:

* funcional
* modularizado
* preparado para continuar migración TS
* preparado para futuras integraciones SQL reales
* preparado para crecimiento de módulos

---

# Licencia

Uso interno / privado.
