import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/global.css';
import './styles/pages/shell.css';
import './styles/pages/login.css';
import './styles/pages/usuarios.css';
import './styles/theme.css';
import './styles/pages/resumen.css';
import './styles/pages/operational-modules.css';
import './styles/pages/detalles.css';
import './styles/pages/historicos.css';
import './styles/pages/turnos.css';
import './styles/pages/revision-diaria.css';
import './styles/pages/reportes.css';
import './styles/pages/balance.css';
import './styles/pages/concesiones.css';
import './styles/pages/operational-cards-details.css';
import './styles/shared.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
// DGO-V01: bounded LF16 visual contract; keep last for predictable cascade.
import './styles/durangoVisualSystem.css';

// DGO-V02: sidebar LF16 geometry, navigation and responsive drawer.
import './styles/durangoSidebarLF16.css';

// DGO-V03: LF16 summary hero and process KPI cards (only dashboard).
import './styles/durangoSummaryLF16.css';

// DGO-V04: LF16 historical controls, responsive chart layout and series palette.
import './styles/durangoHistoryLF16.css';

// DGO-V05: module headers, KPI density and equipment cards aligned with LF16.
import './styles/durangoModulesLF16.css';
