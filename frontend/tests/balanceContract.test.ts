import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Balance consume el contrato backend y no reconstruye un balance oficial en frontend', () => {
  const source = read('src/pages/pozos/sections/BalanceSection.tsx');
  assert.match(source, /dashboard\?\.balance/);
  assert.doesNotMatch(source, /operational_comparison_m3/);
  assert.doesNotMatch(source, /candidate_consumption_total_m3/);
  assert.match(source, /En validación física/);
  assert.match(source, /Sin cálculo de balance/);
  assert.doesNotMatch(source, /Number\(wells\.total_m3/);
  assert.doesNotMatch(source, /Pozos − Líneas − Lavadoras − Jarabes/);
});

test('Balance tiene hoja modular propia y no agrega estilos nuevos al global', () => {
  const main = read('src/main.jsx');
  const balanceCss = read('src/styles/pages/balance.css');
  assert.match(main, /import '\.\/styles\/pages\/balance\.css';/);
  assert.match(balanceCss, /\.water-balance-page/);
  assert.match(balanceCss, /pending|Contrato|contract/i);
  assert.match(balanceCss, /\[data-theme='light'\] \.water-balance-page/);
});

test('Capabilities marca Balance como pendiente de validacion fisica', () => {
  const capabilities = read('src/config/plantCapabilities.ts');
  assert.match(capabilities, /balance:\s*'pending_physical_validation'/);
});
