import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Bell, CheckCircle2, Info, Maximize2, Minus, RadioTower, X } from 'lucide-react';
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
  dedupeKey?: string;
}

interface NotificationItem extends NotificationInput {
  id: string;
  createdAt: number;
}

interface NotificationContextValue {
  notify: (input: NotificationInput) => void;
  notifyOperationalAlerts: (alerts: WaterOperationalAlert[]) => void;
  dismissAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);
const DEFAULT_TOAST_DURATION_MS = 10_000;
const MAX_VISIBLE_TOASTS = 1;
const MAX_QUEUED_TOASTS = 8;

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

  const dismissAll = useCallback(() => {
    setItems([]);
  }, []);

  const notify = useCallback((input: NotificationInput) => {
    const item: NotificationItem = {
      ...input,
      id: notificationId(input.tone),
      createdAt: Date.now(),
      durationMs: input.durationMs ?? DEFAULT_TOAST_DURATION_MS,
    };

    setItems((current) => {
      const withoutDuplicate = input.dedupeKey
        ? current.filter((existing) => existing.dedupeKey !== input.dedupeKey)
        : current;
      return [item, ...withoutDuplicate].slice(0, MAX_QUEUED_TOASTS);
    });
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
      dedupeKey: `water-alert:${alert.id}`,
    }));
  }, [notify]);

  const value = useMemo(
    () => ({ notify, notifyOperationalAlerts, dismissAll }),
    [notify, notifyOperationalAlerts, dismissAll],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {enableWaterAlerts ? <WaterAlertsCoordinator /> : null}
      <ToastViewport items={items} onDismiss={dismiss} onDismissAll={dismissAll} />
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const value = useContext(NotificationContext);
  if (!value) throw new Error('useNotifications debe usarse dentro de NotificationProvider');
  return value;
}

function ToastViewport({
  items,
  onDismiss,
  onDismissAll,
}: {
  items: NotificationItem[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}) {
  const navigate = useNavigate();
  const [minimized, setMinimized] = useState(false);
  const visible = items.slice(0, MAX_VISIBLE_TOASTS);
  const hiddenCount = Math.max(0, items.length - visible.length);

  useEffect(() => {
    if (!items.length) setMinimized(false);
  }, [items.length]);

  useEffect(() => {
    if (minimized) return undefined;
    const timers = visible
      .filter((item) => Number(item.durationMs || 0) > 0)
      .map((item) => window.setTimeout(() => onDismiss(item.id), item.durationMs));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [visible, minimized, onDismiss]);

  if (!items.length) return null;

  if (minimized) {
    return (
      <div className="toast-viewport toast-viewport-minimized" aria-label="Notificaciones minimizadas">
        <div className="toast-minimized-pill" role="status">
          <button
            type="button"
            className="toast-minimized-open"
            onClick={() => setMinimized(false)}
            aria-label={`Expandir ${items.length} ${items.length === 1 ? 'notificación' : 'notificaciones'}`}
          >
            <Bell size={17} aria-hidden="true" />
            <span>{items.length === 1 ? '1 notificación' : `${items.length} notificaciones`}</span>
            <Maximize2 size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="toast-minimized-close"
            onClick={onDismissAll}
            aria-label="Cerrar todas las notificaciones"
            title="Cerrar todas"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="toast-viewport"
      aria-live={visible.some((item) => item.ariaLive === 'assertive') ? 'assertive' : 'polite'}
      aria-label="Notificaciones"
    >
      <div className="toast-toolbar">
        <div className="toast-toolbar-copy">
          <Bell size={15} aria-hidden="true" />
          <span>{items.length === 1 ? '1 notificación' : `${items.length} notificaciones`}</span>
          {hiddenCount ? <small>{hiddenCount} en cola</small> : null}
        </div>
        <div className="toast-toolbar-actions">
          <button type="button" onClick={() => setMinimized(true)} aria-label="Minimizar notificaciones" title="Minimizar">
            <Minus size={15} />
          </button>
          <button type="button" onClick={onDismissAll} aria-label="Cerrar todas las notificaciones" title="Cerrar todas">
            <X size={15} />
            <span>Cerrar todas</span>
          </button>
        </div>
      </div>

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

      {hiddenCount ? <div className="toast-more">+{hiddenCount} en cola</div> : null}
    </div>
  );
}
