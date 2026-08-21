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
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import type { SidebarSection } from '../types';
import BrandLogo from './BrandLogo';

const iconMap: Record<string, LucideIcon> = {
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
};

function getIcon(key: string, iconKey?: string): LucideIcon {
  return iconMap[iconKey || key] || Activity;
}

export interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  sections?: SidebarSection[];
  basePath?: string;
  brandTitle?: string;
  brandSubtitle?: string;
  domainSwitchPath?: string;
  domainSwitchLabel?: string;
}

export default function Sidebar({
  collapsed,
  onToggle,
  sections = [],
  basePath = '',
  brandTitle = 'PLANTA ZAPOPAN',
  brandSubtitle = '',
  domainSwitchPath,
  domainSwitchLabel = 'Cambiar dominio',
}: SidebarProps) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand-row">
        <button className="menu-button" onClick={onToggle} title={collapsed ? 'Expandir menu' : 'Contraer menu'} aria-label={collapsed ? 'Expandir menu' : 'Contraer menu'}><Menu size={18} /></button>
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

      <nav className="sidebar-nav">
        {sections.map((group) => (
          <div className="nav-group" key={group.group}>
            {!collapsed && <div className="nav-group-title">{group.group}</div>}
            {group.items.map((item) => {
              const Icon = getIcon(item.key, item.iconKey);
              return (
                <NavLink key={item.key} to={`${basePath}/${item.key}`} title={item.label} aria-label={item.label} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Icon size={16} />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {domainSwitchPath ? (
        <div className="sidebar-footer">
          <NavLink to={domainSwitchPath} title={domainSwitchLabel} aria-label={domainSwitchLabel} className="nav-item switch-domain-link">
            <ArrowLeftRight size={16} />
            {!collapsed && <span>{domainSwitchLabel}</span>}
          </NavLink>
        </div>
      ) : null}
    </aside>
  );
}
