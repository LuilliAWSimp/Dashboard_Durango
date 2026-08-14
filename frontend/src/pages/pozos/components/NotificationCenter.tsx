import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, RadioTower, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchWaterDashboard } from '../../../services/waterService';
import useAutoRefresh from '../../../hooks/useAutoRefresh';
import {
  buildWaterAlertRoute,
  createOperationalAlertToastTracker,
  evaluateDurangoWaterAlerts,
  type WaterOperationalAlert,
} from '../waterOperationalAlerts';
import type { DashboardData } from '../types';

export type NotificationTone = 'success' | 'warning' | 'critical' | 'error' | 'info';

export interface NotificationInput {
  tone: NotificationTone;
  title: string;
  message?: string;
  route?: string;
  actionLabel?: string;
  durationMs?: number;
  ariaLive?: 'polite' | 'assertive';
}

interface NotificationItem extends NotificationInput {
  id: string;
  createdAt: number;
}

interface NotificationContextValue {
  notify: (input: NotificationInput) => void;
  notifyOperationalAlerts: (alerts: WaterOperationalAlert[]) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);
const DEFAULT_TOAST_DURATION_MS = 10_000;
const MAX_VISIBLE_TOASTS = 3;

function notificationId(prefix = 'toast') {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function iconFor(tone: NotificationTone) {
  if (tone === 'success') return <CheckCircle2 size={18} />;
  if (tone === 'critical' || tone === 'error') return <RadioTower size={18} />;
  if (tone === 'warning') return <AlertTriangle size={18} />;
  return <Info size={18} />;
}

function toneFromAlert(alert: WaterOperationalAlert): NotificationTone {
  return alert.severity === 'critical' ? 'critical' : 'warning';
}

function WaterAlertsCoordinator() {
  const { notifyOperationalAlerts } = useNotifications();
  const inFlightRef = useRef(false);

  const refreshAlerts = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const data = await fetchWaterDashboard('dashboard', {
        include_history: false,
        include_energy_water: false,
        force_refresh: true,
      });
      notifyOperationalAlerts(evaluateDurangoWaterAlerts(data as DashboardData));
    } catch {
      // Las fallas temporales de consulta no deben bloquear la UI ni generar alarmas falsas.
    } finally {
      inFlightRef.current = false;
    }
  }, [notifyOperationalAlerts]);

  useEffect(() => {
    void refreshAlerts();
  }, [refreshAlerts]);

  useAutoRefresh(true, () => { void refreshAlerts(); });
  return null;
}

export function NotificationProvider({ children, enableWaterAlerts = false }: { children: ReactNode; enableWaterAlerts?: boolean }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const trackerRef = useRef(createOperationalAlertToastTracker());

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback((input: NotificationInput) => {
    const item: NotificationItem = {
      ...input,
      id: notificationId(input.tone),
      createdAt: Date.now(),
      durationMs: input.durationMs ?? DEFAULT_TOAST_DURATION_MS,
    };
    setItems((current) => [item, ...current].slice(0, 8));
  }, []);

  const notifyOperationalAlerts = useCallback((alerts: WaterOperationalAlert[]) => {
    const newlyActive = trackerRef.current.next(alerts);
    newlyActive.forEach((alert) => notify({
      tone: toneFromAlert(alert),
      title: alert.title,
      message: `${alert.name} · ${alert.message}`,
      route: buildWaterAlertRoute(alert),
      actionLabel: 'Ver detalle',
      ariaLive: alert.severity === 'critical' ? 'assertive' : 'polite',
    }));
  }, [notify]);

  const value = useMemo(() => ({ notify, notifyOperationalAlerts }), [notify, notifyOperationalAlerts]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {enableWaterAlerts ? <WaterAlertsCoordinator /> : null}
      <ToastViewport items={items} onDismiss={dismiss} />
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const value = useContext(NotificationContext);
  if (!value) throw new Error('useNotifications debe usarse dentro de NotificationProvider');
  return value;
}

function ToastViewport({ items, onDismiss }: { items: NotificationItem[]; onDismiss: (id: string) => void }) {
  const navigate = useNavigate();
  const visible = items.slice(0, MAX_VISIBLE_TOASTS);
  const hiddenCount = Math.max(0, items.length - visible.length);

  useEffect(() => {
    const timers = visible
      .filter((item) => Number(item.durationMs || 0) > 0)
      .map((item) => window.setTimeout(() => onDismiss(item.id), item.durationMs));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [visible, onDismiss]);

  if (!items.length) return null;

  return (
    <div className="toast-viewport" aria-live={visible.some((item) => item.ariaLive === 'assertive') ? 'assertive' : 'polite'} aria-label="Notificaciones">
      {visible.map((item) => {
        const clickable = Boolean(item.route);
        const open = () => {
          if (!item.route) return;
          onDismiss(item.id);
          navigate(item.route);
        };
        return (
          <article
            key={item.id}
            className={`toast-card ${item.tone} ${clickable ? 'clickable' : ''}`}
            role={clickable ? 'button' : 'status'}
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? open : undefined}
            onKeyDown={(event) => {
              if (!clickable || (event.key !== 'Enter' && event.key !== ' ')) return;
              event.preventDefault();
              open();
            }}
          >
            <div className="toast-icon" aria-hidden="true">{iconFor(item.tone)}</div>
            <div className="toast-copy">
              <strong>{item.title}</strong>
              {item.message ? <p>{item.message}</p> : null}
              {item.route ? <span>{item.actionLabel || 'Ver detalle'}</span> : null}
            </div>
            <button
              type="button"
              className="toast-close"
              aria-label="Cerrar notificación"
              onClick={(event) => {
                event.stopPropagation();
                onDismiss(item.id);
              }}
            >
              <X size={16} />
            </button>
          </article>
        );
      })}
      {hiddenCount ? <div className="toast-more">+{hiddenCount} alertas adicionales</div> : null}
    </div>
  );
}
