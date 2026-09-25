# Homologacion Durango 18 - Freeze y modularizacion gradual de CSS

## Objetivo

Aplicar la regla de la guia maestra de dejar `global.css` como base heredada estable y mover responsabilidad visual de forma gradual, sin redisenar pantallas ni hacer una migracion masiva de alto riesgo.

## Cambios

- `global.css` queda marcado explicitamente como base heredada congelada.
- Se extraen los tokens globales a `styles/tokens.css`, conservando las variables heredadas para no romper consumidores actuales.
- Se agregan aliases semanticos `--arca-*` para adopcion gradual.
- Las reglas de cards operativas y detalle individual de los incrementales 11F/11G salen de `global.css` y pasan a `styles/pages/operational-cards-details.css`.
- El codigo visual compartido Excel/PDF del incremental 11J sale de `global.css` y pasa a `styles/shared.css`.
- `main.jsx` carga las capas en un orden explicito que conserva la cascada previa: tokens -> global heredado -> responsabilidad de pagina -> shared.
- Se documenta la responsabilidad de cada hoja en `styles/README.md`.
- Se agrega una prueba dirigida que comprueba el orden de imports, el freeze y que los bloques migrados no regresen duplicados a `global.css`.

## Resultado cuantitativo

- `global.css` antes: 9,218 lineas.
- `global.css` despues: 8,983 lineas.
- 235 lineas heredadas salen del archivo global y quedan bajo responsabilidades mas claras.
- No se crean hojas vacias ni se intenta mover toda la hoja global en un solo cambio.

## Regla a partir de este incremental

Las nuevas correcciones visuales deben ir preferentemente a:

- `tokens.css` para valores compartidos;
- `shared.css` solo para patrones realmente transversales;
- `styles/pages/*.css` para una pantalla/familia funcional concreta.

`global.css` solo debe crecer cuando exista una razon transversal justificada o una migracion dirigida que lo requiera.

## Validacion dirigida

- comparacion automatica de los bloques migrados contra el contenido previo: OK;
- variables heredadas preservadas: OK;
- 11F/11G retirados de `global.css` y preservados en su hoja modular: OK;
- 11J retirado de `global.css` y preservado en `shared.css`: OK;
- orden de cascada documentado y verificado: OK;
- 4 pruebas de arquitectura CSS: OK;
- balance basico de llaves CSS: OK;
- no se ejecutaron suites generales del dashboard porque no se modifico logica funcional ni datos.
