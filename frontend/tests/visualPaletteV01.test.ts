import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const styles = join(process.cwd(), 'src/styles/durangoVisualSystem.css');
const main = join(process.cwd(), 'src/main.jsx');
const css = readFileSync(styles, 'utf8');
const mainSource = readFileSync(main, 'utf8');

const dark = [
  ['--dgo-surface', '#061a28'],
  ['--dgo-raised', '#0a2638'],
  ['--dgo-border', '#224151'],
  ['--dgo-text', '#eef6fa'],
  ['--dgo-muted', '#a7bdc9'],
  ['--dgo-accent', '#73d1f3'],
  ['--dgo-active', '#103e53'],
] as const;

const light = [
  ['--dgo-surface', '#ffffff'],
  ['--dgo-raised', '#f2f7fa'],
  ['--dgo-border', '#cfdee6'],
  ['--dgo-text', '#163344'],
  ['--dgo-muted', '#526b7a'],
  ['--dgo-accent', '#096d94'],
  ['--dgo-active', '#e2f3fa'],
] as const;

function themeBlock(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `No CSS block for ${selector}`);
  const body = css.slice(start + selector.length + 2);
  return body.slice(0, body.indexOf('}'));
}

test('V01: colors match Las Fuentes LF16 in both themes', () => {
  const darkBlock = themeBlock('.pozos-shell');
  const lightBlock = themeBlock('.pozos-shell.theme-light');
  for (const [variable, value] of dark) assert.match(darkBlock, new RegExp(`${variable}:\\s*${value};`, 'i'));
  for (const [variable, value] of light) assert.match(lightBlock, new RegExp(`${variable}:\\s*${value};`, 'i'));
});

test('V01: PDF, Excel and primary actions keep LF16 semantic colors', () => {
  assert.match(css, /--dgo-button-primary:\s*#087ba5;/i);
  assert.match(css, /--dgo-button-excel:\s*#14653b;/i);
  assert.match(css, /--dgo-button-pdf:\s*#913347;/i);
  assert.match(css, /\.export-excel-button/);
  assert.match(css, /\.module-history-excel-button/);
  assert.match(css, /\.export-pdf-button/);
  assert.match(css, /\.module-history-pdf-button/);
});

test('V01: scoped CSS loads after legacy shared CSS and preserves chart series', () => {
  const imports = [...mainSource.matchAll(/import '\.\/styles\/([^']+\.css)';/g)].map((value) => value[1]);
  // V01 must follow legacy CSS. Later visual increments may add scoped layers.
  assert.ok(imports.indexOf('shared.css') < imports.indexOf('durangoVisualSystem.css'));
  assert.ok(imports.slice(imports.indexOf('durangoVisualSystem.css') + 1).every((file) => file.startsWith('durango')));
  assert.ok(css.trimStart().startsWith('/* DGO-V01'));
  assert.doesNotMatch(css, /\.recharts-(?:line|bar|area|scatter|curve).*\b(?:fill|stroke)\s*:/);
  assert.doesNotMatch(css, /\b(?:zoom|transform:\s*scale)\s*:/);
});
