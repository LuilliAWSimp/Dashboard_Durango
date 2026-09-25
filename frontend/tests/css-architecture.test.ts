import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('main carga tokens, legado y capas modulares en orden estable', () => {
  const main = read('src/main.jsx');
  const expected = [
    "import './styles/tokens.css';",
    "import './styles/global.css';",
    "import './styles/pages/shell.css';",
    "import './styles/pages/login.css';",
    "import './styles/pages/usuarios.css';",
    "import './styles/theme.css';",
    "import './styles/pages/resumen.css';",
    "import './styles/pages/operational-modules.css';",
    "import './styles/pages/detalles.css';",
    "import './styles/pages/historicos.css';",
    "import './styles/pages/turnos.css';",
    "import './styles/pages/revision-diaria.css';",
    "import './styles/pages/reportes.css';",
    "import './styles/pages/balance.css';",
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
  assert.doesNotMatch(globalCss, /Homologacion Durango 11B:/);
  assert.doesNotMatch(globalCss, /Homologacion Durango 11C:/);
  assert.doesNotMatch(globalCss, /Homologacion Durango 11F:/);
  assert.doesNotMatch(globalCss, /Homologacion Durango 11J:/);
  assert.doesNotMatch(globalCss, /Durango live summary refresh/);
  assert.doesNotMatch(globalCss, /Durango operational alerts and notifications/);
  assert.doesNotMatch(globalCss, /Detalle técnico de pozo/);
  assert.doesNotMatch(globalCss, /Historical aggregation control/);
  assert.doesNotMatch(globalCss, /Operational cuts by shift/);
  assert.doesNotMatch(globalCss, /Durango homologacion 04: historico modular completo/);
  assert.doesNotMatch(globalCss, /\/\* Daily Review \*\//);
  assert.doesNotMatch(globalCss, /\.reportes-page \{/);
  assert.doesNotMatch(globalCss, /Homologacion Durango 11D:/);
  assert.doesNotMatch(globalCss, /Homologacion Durango 11E:/);
  assert.doesNotMatch(globalCss, /Homologacion Durango 11: modo claro\/oscuro/);
  assert.doesNotMatch(globalCss, /Homologacion Durango 11A:/);
  assert.doesNotMatch(globalCss, /Durango · autenticación local y administración de usuarios/);
  assert.doesNotMatch(globalCss, /Pantalla de precarga inicial Durango/);
  assert.doesNotMatch(globalCss, /Pozos domain polish/);
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
  const resumen = read('src/styles/pages/resumen.css');
  const modules = read('src/styles/pages/operational-modules.css');
  const details = read('src/styles/pages/operational-cards-details.css');
  const detailBase = read('src/styles/pages/detalles.css');
  const history = read('src/styles/pages/historicos.css');
  const shifts = read('src/styles/pages/turnos.css');
  const review = read('src/styles/pages/revision-diaria.css');
  const reports = read('src/styles/pages/reportes.css');
  const balance = read('src/styles/pages/balance.css');
  const shared = read('src/styles/shared.css');
  const shell = read('src/styles/pages/shell.css');
  const login = read('src/styles/pages/login.css');
  const users = read('src/styles/pages/usuarios.css');
  const theme = read('src/styles/theme.css');

  assert.match(resumen, /\.dashboard-resumen-page/);
  assert.match(resumen, /\.summary-operational-kpis/);
  assert.match(resumen, /\.operational-alerts-panel/);
  assert.match(resumen, /\.water-type-card/);
  assert.match(modules, /\.operational-module-page/);
  assert.match(modules, /\.operational-element-card/);
  assert.match(modules, /\.metric-pair/);
  assert.match(details, /\.well-detail-main-head/);
  assert.match(detailBase, /\.well-detail-hero/);
  assert.match(history, /\.history-aggregation-trigger/);
  assert.match(history, /\.module-history-export-actions/);
  assert.match(shifts, /\.shift-summary-card/);
  assert.match(shifts, /\.shift-detail-disclosure/);
  assert.match(review, /\.daily-review-page/);
  assert.match(review, /\.daily-review-header-panel/);
  assert.match(reports, /\.durango-report-page/);
  assert.match(reports, /\.scheduled-email-panel/);
  assert.match(balance, /\.water-balance-page/);
  assert.match(balance, /\.water-balance-contract-panel/);
  assert.match(details, /\.operational-card-footer/);
  assert.match(shared, /\.export-excel-button/);
  assert.match(shared, /\.export-pdf-button/);
  assert.match(shell, /\.pozos-shell \.sidebar/);
  assert.match(shell, /\.plant-context-bar/);
  assert.match(login, /\.login-shell/);
  assert.match(login, /\.initial-loader-screen/);
  assert.match(users, /\.users-page/);
  assert.match(users, /\.users-create-form/);
  assert.match(theme, /Homologacion Durango 11:/);
  assert.match(theme, /Homologacion Durango 11A:/);
});

test('Resumen y modulos operativos exponen scopes reales sin alterar el layout', () => {
  const dashboard = read('src/pages/pozos/sections/DashboardBaseSection.tsx');
  const operational = read('src/pages/pozos/components/OperationalModuleSection.tsx');
  const resumen = read('src/styles/pages/resumen.css');
  const modules = read('src/styles/pages/operational-modules.css');

  assert.match(dashboard, /className="dashboard-resumen-page"/);
  assert.match(operational, /operational-module-page operational-module-\$\{module\}-page/);
  assert.match(resumen, /\.dashboard-resumen-page\s*\{\s*display:\s*contents;/s);
  assert.match(modules, /\.operational-module-page\s*\{\s*display:\s*contents;/s);
});


test('Detalles, historicos y turnos exponen scopes semanticos', () => {
  const detail = read('src/pages/pozos/components/OperationalDetailSection.tsx');
  const history = read('src/pages/pozos/components/ModuleHistoryPanel.tsx');
  const shifts = read('src/pages/pozos/components/ShiftConsumptionPanel.tsx');
  const elementHistory = read('src/pages/pozos/components/ElementHistoryPanel.tsx');

  assert.match(detail, /operational-detail-hero operational-detail-\$\{module\}/);
  assert.match(detail, /className="operational-detail-history"/);
  assert.match(history, /operational-history-panel operational-history-\$\{fixedView \|\| \(fixedModule \? module : globalView\)\}/);
  assert.match(shifts, /operational-shifts-panel operational-shifts-\$\{group\}/);
  assert.match(elementHistory, /operational-element-history operational-history-\$\{module\}/);
});


test('Revision diaria y Reportes tienen frontera modular real', () => {
  const reviewSection = read('src/pages/pozos/sections/RevisionDiariaSection.tsx');
  const reportSection = read('src/pages/pozos/sections/ReportesSection.tsx');
  const reviewCss = read('src/styles/pages/revision-diaria.css');
  const reportCss = read('src/styles/pages/reportes.css');

  assert.match(reviewSection, /className="daily-review-page"/);
  assert.match(reportSection, /className="reportes-page durango-report-page"/);
  assert.match(reviewCss, /display:\s*contents/);
  assert.match(reportCss, /report-summary-card/);
});


test('Shell, Login y Usuarios tienen frontera modular y tema transversal', () => {
  const app = read('src/App.jsx');
  const loginPage = read('src/pages/LoginPage.jsx');
  const usersPage = read('src/pages/UsersPage.tsx');
  const shellCss = read('src/styles/pages/shell.css');
  const loginCss = read('src/styles/pages/login.css');
  const usersCss = read('src/styles/pages/usuarios.css');
  const themeCss = read('src/styles/theme.css');

  assert.match(app, /shellClass="pozos-shell"/);
  assert.match(loginPage, /className="login-shell"/);
  assert.match(usersPage, /className="users-page"/);
  assert.match(shellCss, /Interfaz operativa compacta/);
  assert.match(loginCss, /Pantalla de precarga inicial Durango/);
  assert.match(usersCss, /users-table/);
  assert.match(themeCss, /theme-light/);
});
