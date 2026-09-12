import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('main carga tokens, legado y capas modulares en orden estable', () => {
  const main = read('src/main.jsx');
  const expected = [
    "import './styles/tokens.css';",
    "import './styles/global.css';",
    "import './styles/pages/operational-cards-details.css';",
    "import './styles/shared.css';",
  ];

  let previous = -1;
  for (const statement of expected) {
    const index = main.indexOf(statement);
    assert.ok(index > previous, `${statement} debe conservar el orden de cascada`);
    previous = index;
  }
});

test('global.css queda marcado como base heredada congelada', () => {
  const globalCss = read('src/styles/global.css');
  assert.match(globalCss, /BASE HEREDADA CONGELADA - Durango/);
  assert.doesNotMatch(globalCss, /Homologacion Durango 11F:/);
  assert.doesNotMatch(globalCss, /Homologacion Durango 11J:/);
});

test('tokens concentra variables heredadas y aliases semanticos', () => {
  const tokens = read('src/styles/tokens.css');
  assert.match(tokens, /--bg:/);
  assert.match(tokens, /--text:/);
  assert.match(tokens, /--arca-primary:/);
  assert.match(tokens, /--arca-excel:/);
  assert.match(tokens, /--arca-pdf:/);
});

test('responsabilidades migradas viven fuera de global.css', () => {
  const details = read('src/styles/pages/operational-cards-details.css');
  const shared = read('src/styles/shared.css');

  assert.match(details, /\.well-detail-main-head/);
  assert.match(details, /\.operational-card-footer/);
  assert.match(shared, /\.export-excel-button/);
  assert.match(shared, /\.export-pdf-button/);
});
