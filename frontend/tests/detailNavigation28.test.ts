import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildOperationalReturnState,
  buildOperationalSiblingPath,
  clearOperationalReturnState,
  operationalReturnLabel,
  resolveOperationalReturnTarget,
} from '../src/pages/pozos/operationalNavigation.ts';

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Volver conserva la pantalla real de origen con sus filtros', () => {
  const state = buildOperationalReturnState('/pozos/dashboard', '?tab=alertas&fecha=2026-09-25', { source: 'alerta' });
  assert.equal(
    resolveOperationalReturnTarget(state, '/pozos/pozos?start=2026-09-25'),
    '/pozos/dashboard?tab=alertas&fecha=2026-09-25',
  );
  assert.equal(operationalReturnLabel('/pozos/dashboard?tab=alertas'), 'Volver al Resumen');
  assert.equal(operationalReturnLabel('/pozos/pozos?start=2026-09-25'), 'Volver a Pozos');
  assert.equal(operationalReturnLabel('/pozos/lineas'), 'Volver a Líneas');
  assert.equal(operationalReturnLabel('/pozos/flujos'), 'Volver a Lavadoras');
  assert.equal(operationalReturnLabel('/pozos/jarabes'), 'Volver a Jarabes');
});

test('rutas hermanas preservan rango agrupacion y admiten operational_key', () => {
  assert.equal(
    buildOperationalSiblingPath('/pozos/pozos', 1051, '?start=2026-09-01&end=2026-09-02&aggregation=hourly'),
    '/pozos/pozos/1051?start=2026-09-01&end=2026-09-02&aggregation=hourly',
  );
  assert.equal(
    buildOperationalSiblingPath('/pozos/flujos/', 'lavadora_ref_pet', 'start=2026-09-25&aggregation=minute'),
    '/pozos/flujos/lavadora_ref_pet?start=2026-09-25&aggregation=minute',
  );
});

test('al volver se limpia solo el estado interno de retorno y se conserva estado ajeno', () => {
  assert.deepEqual(
    clearOperationalReturnState({ returnTo: '/pozos/lineas', fromOperationalModule: true, source: 'alerta', keep: 7 }),
    { source: 'alerta', keep: 7 },
  );
  assert.equal(clearOperationalReturnState({ returnTo: '/pozos/lineas', fromOperationalModule: true }), undefined);
});

test('destinos externos o protocol-relative nunca sustituyen el fallback local', () => {
  assert.equal(resolveOperationalReturnTarget({ returnTo: 'https://example.com' }, '/pozos/pozos'), '/pozos/pozos');
  assert.equal(resolveOperationalReturnTarget({ returnTo: '//example.com/x' }, '/pozos/pozos'), '/pozos/pozos');
});

test('detalle reemplaza entre hermanos y Volver reemplaza el detalle por su origen', () => {
  const detail = read('src/pages/pozos/components/OperationalDetailSection.tsx');
  assert.match(detail, /buildOperationalSiblingPath\(backPath, identity, activeSearch\)/);
  assert.match(detail, /navigate\(buildOperationalSiblingPath[\s\S]*?replace: true,[\s\S]*?state: location\.state/);
  assert.match(detail, /navigate\(returnTarget, \{[\s\S]*?replace: true,[\s\S]*?clearOperationalReturnState\(location\.state\)/);
  assert.match(detail, /<ArrowLeft size=\{16\} \/> \{returnLabel\}/);
  assert.match(detail, /aria-label=\{`Anterior: \$\{previous\.name\}`\}/);
  assert.match(detail, /aria-label=\{`Siguiente: \$\{next\.name\}`\}/);
});
