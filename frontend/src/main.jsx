import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/global.css';
import './styles/pages/resumen.css';
import './styles/pages/operational-modules.css';
import './styles/pages/detalles.css';
import './styles/pages/historicos.css';
import './styles/pages/turnos.css';
import './styles/pages/operational-cards-details.css';
import './styles/shared.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
