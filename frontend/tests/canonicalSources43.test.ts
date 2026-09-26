import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const srcRoot = fileURLToPath(new URL('../src/', import.meta.url));
const codeExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

test('no quedan basenames duplicados JS/TS o JSX/TSX en frontend/src', () => {
  const groups = new Map<string, string[]>();
  for (const file of walk(srcRoot)) {
    const extension = extname(file);
    if (!codeExtensions.has(extension)) continue;
    const key = file.slice(0, -extension.length);
    groups.set(key, [...(groups.get(key) || []), file]);
  }
  const duplicates = [...groups.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([key, files]) => ({ key: relative(srcRoot, key), files: files.map((file) => relative(srcRoot, file)) }));
  assert.deepEqual(duplicates, []);
});

test('se preservan las fuentes que ya estaban en el runtime antes de canonizar', () => {
  const runtimeCanonicalFiles = [
    'components/BrandLogo.jsx',
    'components/Header.jsx',
    'components/KpiCard.jsx',
    'components/Sidebar.jsx',
    'pages/LoginPage.jsx',
    'services/api.js',
    'services/authService.js',
    'services/dailyWaterReportExportService.js',
    'services/waterExportService.js',
    'services/waterReportService.js',
    'services/waterService.js',
  ];
  for (const file of runtimeCanonicalFiles) {
    assert.equal(existsSync(join(srcRoot, file)), true, `${file} debe permanecer como fuente canónica runtime`);
  }
});
