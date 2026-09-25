import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, LogOut, ShieldCheck, UserRound, X } from 'lucide-react';
import { changeOwnPassword } from '../services/authService';
import '../styles/pages/session-controls.css';

const ROLE_LABELS = {
  admin: 'Administrador',
  operator: 'Operador',
  viewer: 'Consulta',
};

function passwordErrorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  return 'No se pudo actualizar la contraseña. Intenta nuevamente.';
}

function ChangePasswordModal({ open, onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, saving]);

  useEffect(() => {
    if (!open) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSaving(false);
      setError('');
      setSuccess('');
    }
  }, [open]);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!currentPassword) {
      setError('Escribe tu contraseña actual.');
      return;
    }
    if (newPassword.length < 10) {
      setError('La nueva contraseña debe tener al menos 10 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    if (currentPassword === newPassword) {
      setError('La nueva contraseña debe ser diferente de la contraseña actual.');
      return;
    }

    setSaving(true);
    try {
      const result = await changeOwnPassword(currentPassword, newPassword);
      const revoked = Number(result?.other_sessions_revoked || 0);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(
        revoked > 0
          ? `Contraseña actualizada. Se cerraron ${revoked} ${revoked === 1 ? 'sesión adicional' : 'sesiones adicionales'}; esta sesión continúa activa.`
          : 'Contraseña actualizada. Esta sesión continúa activa.',
      );
    } catch (requestError) {
      setError(passwordErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="session-password-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="session-password-modal" role="dialog" aria-modal="true" aria-labelledby="session-password-title">
        <div className="session-password-modal-head">
          <div>
            <span className="session-password-kicker">Seguridad de la cuenta</span>
            <h2 id="session-password-title">Cambiar contraseña</h2>
          </div>
          <button type="button" className="session-password-close" onClick={onClose} disabled={saving} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <form className="session-password-form" onSubmit={submit}>
          <label>
            <span>Contraseña actual</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              disabled={saving}
              autoFocus
            />
          </label>
          <label>
            <span>Nueva contraseña</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              disabled={saving}
            />
            <small>Mínimo 10 caracteres, con al menos una letra y un número.</small>
          </label>
          <label>
            <span>Confirmar contraseña</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              disabled={saving}
            />
          </label>

          {error ? <div className="session-password-message error" role="alert">{error}</div> : null}
          {success ? <div className="session-password-message success" role="status">{success}</div> : null}

          <div className="session-password-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={saving}>Cerrar</button>
            <button type="submit" className="primary" disabled={saving || Boolean(success)}>
              <KeyRound size={16} /> {saving ? 'Actualizando…' : 'Actualizar contraseña'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}

export default function SessionCard({ user, collapsed = false, onLogout }) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const displayName = user?.display_name || user?.name || user?.username || 'Usuario';
  const username = user?.username || 'usuario';
  const role = ROLE_LABELS[user?.role] || user?.role || 'Usuario';

  if (!user) return null;

  if (collapsed) {
    return (
      <div className="session-card collapsed-session-card" aria-label={`Sesión activa: ${displayName}`}>
        <button type="button" className="session-icon-button" title={`${displayName} · ${role}`} aria-label={`${displayName} · ${role}`}>
          <UserRound size={17} />
        </button>
        <button type="button" className="session-icon-button" onClick={() => setPasswordOpen(true)} title="Cambiar contraseña" aria-label="Cambiar contraseña">
          <KeyRound size={17} />
        </button>
        <button type="button" className="session-icon-button danger" onClick={onLogout} title="Cerrar sesión" aria-label="Cerrar sesión">
          <LogOut size={17} />
        </button>
        <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      </div>
    );
  }

  return (
    <div className="session-card">
      <div className="session-card-label"><ShieldCheck size={14} /> SESIÓN ACTIVA</div>
      <div className="session-card-user">
        <div className="session-card-avatar"><UserRound size={18} /></div>
        <div className="session-card-copy">
          <strong title={displayName}>{displayName}</strong>
          <span>{username} · {role}</span>
        </div>
      </div>
      <div className="session-card-actions">
        <button type="button" onClick={() => setPasswordOpen(true)}><KeyRound size={15} /> Cambiar contraseña</button>
        <button type="button" className="danger" onClick={onLogout}><LogOut size={15} /> Cerrar sesión</button>
      </div>
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}
