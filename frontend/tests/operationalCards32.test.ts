import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { operationalVolumeLabel } from '../src/pages/pozos/operationalTerminology.ts';

const sectionSource = readFileSync(new URL('../src/pages/pozos/components/OperationalModuleSection.tsx', import.meta.url), 'utf8');
const moduleCss = readFileSync(new URL('../src/styles/pages/operational-modules.css', import.meta.url), 'utf8');

test('cards V2 eliminan Actividad del periodo como bloque redundante', () => {
  assert.doesNotMatch(sectionSource, /<MetricPair label="Actividad del periodo"/);
  assert.match(sectionSource, /Flujo actual/);
  assert.match(sectionSource, /Totalizador actual/);
});

test('cards V2 mantienen terminologia fisica de volumen por modulo', () => {
  assert.equal(operationalVolumeLabel('well', { scope: 'period' }), 'Volumen bombeado del periodo');
  assert.equal(operationalVolumeLabel('line', { scope: 'period' }), 'Volumen consumido del periodo');
  assert.equal(operationalVolumeLabel('flow', { scope: 'period' }), 'Volumen consumido del periodo');
  assert.match(sectionSource, /operationalVolumeLabel\(module, \{ scope: 'period' \}\)/);
  assert.match(sectionSource, /emphasis/);
});

test('cards V2 distinguen visualmente cada familia operativa', () => {
  assert.match(sectionSource, /Droplets/);
  assert.match(sectionSource, /GitBranch/);
  assert.match(sectionSource, /Waves/);
  assert.match(sectionSource, /FlaskConical/);
  assert.match(sectionSource, /label: 'Pozo'/);
  assert.match(sectionSource, /label: 'Línea'/);
  assert.match(sectionSource, /label: 'Lavadora'/);
  assert.match(sectionSource, /label: 'Proceso'/);
});

test('cards V2 usan volumen destacado y layout compacto sin tocar global.css', () => {
  assert.match(moduleCss, /Durango 32 · Cards operativas V2/);
  assert.match(moduleCss, /\.operational-element-card \{\s*min-height: 260px;/);
  assert.match(moduleCss, /\.operational-metric-grid \.metric-pair:last-child \{\s*grid-column: 1 \/ -1;/);
  assert.match(moduleCss, /\.pozos-shell\.theme-light \.operational-card-icon/);
  assert.match(moduleCss, /background: #eaf6fd !important;/);
});

test('card conserva estado arriba, ultima lectura abajo y un unico acceso al detalle', () => {
  assert.match(sectionSource, /<StatusBadge type=\{statusType\(rawState\)\}>\{state\}<\/StatusBadge>/);
  assert.match(sectionSource, /last-reading-label/);
  assert.match(sectionSource, />Ver detalle<\/span>/);
  assert.match(sectionSource, /aria-label=\{`Abrir detalle de \$\{itemName\(row, index\)\}`\}/);
});
