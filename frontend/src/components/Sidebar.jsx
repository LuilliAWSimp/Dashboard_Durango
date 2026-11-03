import {
  Activity,
  ArrowLeftRight,
  BellRing,
  Droplets,
  Factory,
  FileBarChart2,
  FlaskConical,
  Gauge,
  GitBranch,
  Home,
  Lamp,
  LayoutGrid,
  LineChart as LineChartIcon,
  Menu,
  Settings,
  Snowflake,
  Truck,
  Waves,
  UsersRound,
  ShieldCheck,
  Sun,
  Moon,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import BrandLogo from './BrandLogo';
import SessionCard from './SessionCard.jsx';

const iconMap = {
  dashboard: Home,
  subestacion: Factory,
  linea1: LineChartIcon,
  linea2: LineChartIcon,
  linea3: LineChartIcon,
  lineas: LineChartIcon,
  jarabes: Waves,
  tag: Gauge,
  ptar: Gauge,
  refrigeracion: Snowflake,
  auxiliares: Settings,
  alumbrado: Lamp,
  transporte: Truck,
  transformador1: Activity,
  transformador2: Activity,
  transformador3: Activity,
  transformador4: Activity,
  transformador5: Activity,
  alertas: BellRing,
  'multi-plant-dashboard': LayoutGrid,
  'pozos-dashboard': Droplets,
  'pozos-pozos': Waves,
  'pozos-consumos': Waves,
  'pozos-tanques': Gauge,
  'pozos-lineas': GitBranch,
  'pozos-flujos': Waves,
  'pozos-balance': ArrowLeftRight,
  'pozos-concesion': ShieldCheck,
  'pozos-revision': FileBarChart2,
  'pozos-cip': FlaskConical,
  'pozos-uv': ShieldCheck,
  'pozos-reportes': FileBarChart2,
  usuarios: UsersRound,
};

function getIcon(key, iconKey) {
  return iconMap[iconKey || key] || Activity;
}

export default function Sidebar({
  collapsed,
  onToggle,
  sections = [],
  basePath = '',
  brandTitle = 'PLANTA DURANGO',
  brandSubtitle = '',
  domainSwitchPath,
  domainSwitchLabel = 'Cambiar dominio',
  theme = 'dark',
  onThemeToggle,
  mobileOpen = false,
  onMobileClose,
  onNavigate,
  user,
  onLogout,
}) {
  const toggleMenu = () => {
    if (mobileOpen) onMobileClose?.();
    else onToggle?.();
  };
  const menuLabel = mobileOpen ? 'Cerrar menú' : collapsed ? 'Expandir menú' : 'Contraer menú';

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`.trim()}>
      <div className="brand-row">
        <button type="button" className="menu-button" onClick={toggleMenu} title={menuLabel} aria-label={menuLabel} aria-controls="durango-sidebar-nav" aria-expanded={!collapsed || mobileOpen}><Menu size={18} /></button>
        {!collapsed && (
          <>
            <div className="brand-mark logo-mark"><BrandLogo className="brand-logo sidebar-logo" /></div>
            <div className="brand-copy">
              <div className="brand-title">{brandTitle}</div>
              {brandSubtitle ? <div className="brand-subtitle">{brandSubtitle}</div> : null}
            </div>
          </>
        )}
      </div>

      {onThemeToggle ? (
        <div className="sidebar-theme-control">
          <button
            type="button"
            className="nav-item theme-toggle-button"
            onClick={onThemeToggle}
            aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
            aria-pressed={theme === 'light'}
            title={collapsed ? (theme === 'dark' ? 'Modo claro' : 'Modo oscuro') : undefined}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            {!collapsed && <span>{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>}
          </button>
        </div>
      ) : null}

      <nav id="durango-sidebar-nav" className="sidebar-nav" aria-label="Secciones de Durango">
        {sections.map((group) => (
          <div className="nav-group" key={group.group}>
            {!collapsed && <div className="nav-group-title">{group.group}</div>}
            {group.items.map((item) => {
              const Icon = getIcon(item.key, item.iconKey);
              return (
                <NavLink key={item.key} to={`${basePath}/${item.key}`} title={collapsed ? item.label : undefined} aria-label={item.label} onClick={onNavigate} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Icon size={18} />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <SessionCard user={user} collapsed={collapsed} onLogout={onLogout} />

      {domainSwitchPath ? (
        <div className="sidebar-footer">
          <NavLink to={domainSwitchPath} title={domainSwitchLabel} aria-label={domainSwitchLabel} onClick={onNavigate} className="nav-item switch-domain-link">
            <ArrowLeftRight size={16} />
            {!collapsed && <span>{domainSwitchLabel}</span>}
          </NavLink>
        </div>
      ) : null}
    </aside>
  );
}
