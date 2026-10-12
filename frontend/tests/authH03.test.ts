import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../src/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

test('H03: login admite usuario o correo sin cambiar contrato API', () => {
  assert.match(read('pages/LoginPage.jsx'), /Usuario o correo/);
  assert.match(read('services/authService.js'), /post\('\/auth\/login', \{ username, password \}\)/);
});

test('H03: administracion permite creacion y edicion de identificador', () => {
  const source = read('pages/UsersPage.tsx');
  assert.match(source, /Usuario o correo/);
  assert.match(source, /username: user\.username \|\| ''/);
  assert.match(source, /editLocal\(user\.id, \{ username: event\.target\.value \}\)/);
  assert.match(source, /resetUserPassword/);
  assert.match(source, /revokeUserSessions/);
});
