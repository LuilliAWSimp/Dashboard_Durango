import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildDurangoNavigation,
  isDurangoSectionAccessible,
} from '../src/config/plantCapabilities.ts';

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Concesión queda fuera de navegación hasta tener fuente legal confirmada', () => {
  const items = buildDurangoNavigation({}, 'viewer');
  assert.equal(items.some((item) => item.key === 'concesion'), false);
  assert.equal(isDurangoSectionAccessible('concesion', {}, 'viewer'), false);

  const capabilities = read('src/config/plantCapabilities.ts');
  assert.match(capabilities, /concession:\s*false/);
});

test('Balance permanece visible sólo como módulo en validación física', () => {
  const items = buildDurangoNavigation({}, 'viewer');
  const balance = items.find((item) => item.key === 'balance');
  assert.equal(balance?.label, 'Balance de Agua · En validación');
  assert.equal(isDurangoSectionAccessible('balance', {}, 'viewer'), true);
});

test('Balance no publica una resta entre grupos sin contrato físico confirmado', () => {
  const source = read('src/pages/pozos/sections/BalanceSection.tsx');
  assert.match(source, /Volúmenes observados por grupo/);
  assert.match(source, /Sin cálculo de balance/);
  assert.match(source, /no se suman ni restan entre sí/);
  assert.doesNotMatch(source, /operational_comparison_m3/);
  assert.doesNotMatch(source, /candidate_consumption_total_m3/);
  assert.doesNotMatch(source, /Pozos − Líneas − Lavadoras − Jarabes/);
});

test('Balance conserva los cuatro grupos separados y no inventa fuente oficial', () => {
  const source = read('src/pages/pozos/sections/BalanceSection.tsx');
  assert.match(source, /Fuente base/);
  assert.match(source, /Consumos finales aditivos/);
  assert.match(source, /Doble conteo/);
  assert.match(source, /Diferencia no conciliada/);
  assert.match(source, /Bloqueada/);
});
