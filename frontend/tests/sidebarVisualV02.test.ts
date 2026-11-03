import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/durangoSidebarLF16.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8');
const session = readFileSync(new URL('../src/components/SessionCard.jsx', import.meta.url), 'utf8');

test('V02 loads after the V01 palette without overwriting it', () => {
  const v01 = main.indexOf("import './styles/durangoVisualSystem.css'");
  const v02 = main.indexOf("import './styles/durangoSidebarLF16.css'");
  assert.ok(v01 > -1 && v02 > v01);
  assert.match(css, /\.pozos-shell \.sidebar \{\s*width: 252px;\s*flex: 0 0 252px;/);
  assert.match(css, /\.pozos-shell \.sidebar\.collapsed \{\s*width: 72px;\s*flex: 0 0 72px;/);
});

test('V02 uses LF16 logo, navigation and hit-target geometry', () => {
  assert.match(css, /grid-template-areas: 'logo toggle' 'identity identity';/);
  assert.match(css, /width: 108px;/);
  assert.match(css, /min-height: 42px;/);
  assert.match(css, /\.sidebar\.collapsed \.nav-item[\s\S]*?width: 44px;/);
  assert.match(css, /border-radius: 8px;/);
});

test('V02 keeps Durango navigation and session functions instead of replacing them', () => {
  assert.match(sidebar, /sections\.map\(/);
  assert.match(sidebar, /<NavLink key=\{item\.key\}/);
  assert.match(sidebar, /onClick=\{onNavigate\}/);
  assert.match(sidebar, /<SessionCard user=\{user\} collapsed=\{collapsed\} onLogout=\{onLogout\}/);
  assert.match(session, /changeOwnPassword/);
  assert.match(session, /onLogout/);
  assert.match(app, /buildDurangoNavigation\(runtimeCapabilities, user\?\.role\)/);
});

test('V02 mobile menu closes on navigation, overlay and Escape; no permanent rail', () => {
  assert.match(app, /mobileDrawerOpen/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(app, /onNavigate=\{closeMobileDrawer\}/);
  assert.match(app, /className="dgo-sidebar-mobile-overlay"/);
  assert.match(app, /className="dgo-mobile-topbar"/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /\.pozos-shell \.main-shell \{ margin-left: 0;/);
  assert.match(css, /visibility: hidden;/);
  assert.match(css, /visibility: visible;/);
});

test('V02 keeps session and theme actions in icon rail and both themes', () => {
  assert.match(sidebar, /aria-pressed=\{theme === 'light'\}/);
  assert.match(sidebar, /onClick=\{onThemeToggle\}/);
  assert.match(css, /\.pozos-shell\.theme-light \.sidebar\.collapsed \.sidebar-theme-control \.theme-toggle-button/);
  assert.match(css, /\.pozos-shell\.theme-light \.sidebar \.session-card-actions button/);
  assert.match(css, /\.session-icon-button\.danger:hover/);
});
