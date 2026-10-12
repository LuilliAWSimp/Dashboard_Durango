# Homologación Durango 19 — Balance de Agua con contrato físico protegido

## Objetivo

Alinear la pantalla Balance de Agua con la guía maestra sin declarar como oficial una topología hidráulica que el proyecto Durango todavía no documenta por completo.

## Criterio aplicado

El proyecto sí dispone de volúmenes conciliados/validados para Pozos, Líneas, Lavadoras y Jarabes, pero el ZIP no confirma todavía:

- cuál es la fuente base física oficial del balance;
- si ambos pozos alimentan exactamente el mismo alcance;
- cuáles medidores aguas abajo son consumos finales aditivos;
- cuáles podrían estar en serie y provocar doble conteo;
- si existen entradas paralelas, reúso o cambio de inventario;
- qué subconjunto debe formar parte de un balance oficial.

Por ello el sistema conserva un **comparativo operativo observado**, pero mantiene bloqueada la **diferencia no conciliada oficial**.

## Backend

### Servicio central nuevo

Se agregó:

`backend/app/services/durango_balance_service.py`

Este servicio es ahora la única fuente de interpretación del Balance de Durango.

Entrega:

- estado `pending_physical_validation`;
- candidato observado de fuente: Pozos monitoreados;
- candidatos observados de consumo: Líneas, Lavadoras y Jarabes;
- cobertura por grupo;
- comparativo operativo observado;
- preguntas físicas pendientes;
- `unreconciled_difference_m3 = null` mientras el contrato no esté confirmado.

La UI ya no reconstruye `Pozos - Líneas - Lavadoras - Jarabes` por su cuenta.

### Protección cero/null

Un grupo sin volumen validado no se convierte a `0.00` para completar artificialmente el balance.

Si existe volumen parcial, se conserva la cobertura parcial y el comparativo queda marcado como parcial.

### Capability

Backend y frontend declaran:

`balance = pending_physical_validation`

## Frontend

La pantalla Balance ahora distingue claramente entre:

- volumen observado en pozos;
- consumos candidatos medidos;
- comparativo operativo observado;
- diferencia no conciliada oficial.

Mientras la topología siga pendiente:

- no se llama pérdida o fuga a ninguna diferencia;
- no se publica una diferencia no conciliada oficial;
- se muestran las validaciones físicas que faltan;
- el comparativo permanece disponible como referencia operacional.

## CSS

Se creó:

`frontend/src/styles/pages/balance.css`

Todo cambio visual nuevo de Balance debe vivir ahí.

`global.css` no fue modificado en este incremental.

## Validación

- 3/3 pruebas backend específicas de Balance: OK.
- 65/65 pruebas frontend: OK.
- sintaxis Python: OK.
- sintaxis TS/TSX modificada mediante `transpileModule`: OK.
- importación backend con DB de prueba SQLite: OK.
- `global.css` sin cambios: OK.

El `npm run typecheck` completo no pudo iniciarse porque este entorno no contiene las definiciones locales `@types/node` y `vite/client`. No se instalaron dependencias adicionales para forzar esa comprobación.

## Pendiente para convertirlo en Balance oficial

Confirmar físicamente:

1. fuente base;
2. alcance que alimenta esa fuente;
3. consumos finales aditivos;
4. medidores en serie/doble conteo;
5. entradas paralelas;
6. reúso;
7. confiabilidad de totalizadores del balance.

Hasta entonces, el dashboard queda deliberadamente en modo protegido.
