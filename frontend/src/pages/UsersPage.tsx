import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { KeyRound, RefreshCw, ShieldCheck, UserPlus, UserX } from 'lucide-react';
import PanelHeader from './pozos/components/PanelHeader';
import { createUser, listUsers, resetUserPassword, revokeUserSessions, updateUser } from '../services/authService';
import { useNotifications } from './pozos/components/NotificationCenter';
import type { User } from '../types';


function readableError(error: unknown): string {
  const candidate = error as { response?: { data?: { detail?: string } }; message?: string };
  return candidate.response?.data?.detail || candidate.message || 'No fue posible completar la operación.';
}

function localDate(value?: string | null): string {
  if (!value) return 'Sin acceso registrado';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Sin acceso registrado' : parsed.toLocaleString('es-MX');
}

export default function UsersPage() {
  const { notify } = useNotifications();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ username: '', display_name: '', password: '', role: 'viewer' });
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');

  const activeAdmins = useMemo(() => users.filter((user) => user.role === 'admin' && user.is_active).length, [users]);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      setUsers(await listUsers());
    } catch (err) {
      const message = readableError(err);
      setError(message);
      notify({ tone: 'error', title: 'No se pudieron cargar usuarios', message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setError('');
      setNotice('');
      await createUser({ ...form, role: form.role as 'admin' | 'operator' | 'viewer', is_active: true });
      setForm({ username: '', display_name: '', password: '', role: 'viewer' });
      setNotice('Usuario creado correctamente.');
      notify({ tone: 'success', title: 'Usuario creado', message: 'El usuario quedó disponible para Durango.' });
      await load();
    } catch (err) {
      const message = readableError(err);
      setError(message);
      notify({ tone: 'error', title: 'No se pudo crear el usuario', message });
    }
  };

  const patch = async (user: User, changes: Record<string, unknown>) => {
    try {
      setBusyId(user.id || null);
      setError('');
      setNotice('');
      await updateUser(user.id!, changes);
      setNotice('Usuario actualizado.');
      notify({ tone: 'success', title: 'Usuario actualizado' });
      await load();
    } catch (err) {
      const message = readableError(err);
      setError(message);
      notify({ tone: 'error', title: 'No se pudo actualizar el usuario', message });
    } finally {
      setBusyId(null);
    }
  };

  const submitPasswordReset = async (event: FormEvent) => {
    event.preventDefault();
    if (!resetTarget) return;
    try {
      setBusyId(resetTarget.id || null);
      setError('');
      await resetUserPassword(resetTarget.id!, resetPasswordValue);
      setNotice('Contraseña actualizada. Las sesiones anteriores fueron revocadas.');
      notify({ tone: 'success', title: 'Contraseña actualizada', message: 'Las sesiones anteriores fueron revocadas.' });
      setResetTarget(null);
      setResetPasswordValue('');
    } catch (err) {
      const message = readableError(err);
      setError(message);
      notify({ tone: 'error', title: 'No se pudo restablecer la contraseña', message });
    } finally {
      setBusyId(null);
    }
  };

  const revoke = async (user: User) => {
    if (!window.confirm(`¿Cerrar todas las sesiones de ${user.username}?`)) return;
    try {
      setBusyId(user.id || null);
      setError('');
      await revokeUserSessions(user.id!);
      setNotice('Sesiones revocadas.');
      notify({ tone: 'success', title: 'Sesiones revocadas' });
    } catch (err) {
      const message = readableError(err);
      setError(message);
      notify({ tone: 'error', title: 'No se pudieron revocar sesiones', message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <section className="panel fade-up users-admin-header">
        <PanelHeader title="Usuarios" subtitle="Administración local de accesos para Planta Durango." />
        <p className="panel-subtitle">Las contraseñas y sesiones se administran en el servidor. No se muestran credenciales ni información técnica.</p>
      </section>

      <section className="panel fade-up users-create-panel">
        <PanelHeader title="Crear usuario" subtitle="La contraseña debe tener al menos 10 caracteres, una letra y un número." />
        <form className="users-create-form" onSubmit={handleCreate}>
          <label><span>Usuario</span><input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} autoComplete="off" required /></label>
          <label><span>Nombre visible</span><input value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} required /></label>
          <label><span>Contraseña inicial</span><input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" minLength={10} required /></label>
          <label><span>Rol</span><select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}><option value="viewer">Consulta</option><option value="operator">Operador</option><option value="admin">Administrador</option></select></label>
          <button type="submit" className="primary-action users-create-button"><UserPlus size={16} /> Crear usuario</button>
        </form>
        {notice ? <div className="status-pill normal users-status">{notice}</div> : null}
        {error ? <div className="status-pill alert users-status">{error}</div> : null}
      </section>

      {resetTarget ? (
        <div className="report-email-modal" role="dialog" aria-modal="true" aria-label="Restablecer contraseña">
          <form className="report-email-card panel users-password-modal" onSubmit={submitPasswordReset}>
            <div><h3>Restablecer contraseña</h3><p>Usuario: {resetTarget.username}</p></div>
            <label className="report-email-field"><span>Nueva contraseña</span><input type="password" value={resetPasswordValue} onChange={(event) => setResetPasswordValue(event.target.value)} autoComplete="new-password" minLength={10} required /></label>
            <p className="panel-subtitle">Debe tener al menos 10 caracteres, una letra y un número. Todas las sesiones anteriores serán revocadas.</p>
            <div className="report-email-actions"><button type="button" className="ghost-action" onClick={() => { setResetTarget(null); setResetPasswordValue(''); }} disabled={busyId === resetTarget.id}>Cancelar</button><button type="submit" className="primary-action" disabled={busyId === resetTarget.id}>Actualizar contraseña</button></div>
          </form>
        </div>
      ) : null}

      <section className="panel fade-up users-list-panel">
        <div className="users-list-heading"><PanelHeader title="Usuarios registrados" subtitle={`${users.length} usuarios · ${activeAdmins} administradores activos`} /><button type="button" className="ghost-action" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Actualizar</button></div>
        <div className="users-table-wrap">
          <table className="users-table">
            <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th>Acciones</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={String(user.id)}>
                  <td><strong>{user.username}</strong></td>
                  <td>{user.display_name || user.name}</td>
                  <td><select value={user.role} onChange={(event) => void patch(user, { role: event.target.value })} disabled={busyId === user.id}><option value="admin">Administrador</option><option value="operator">Operador</option><option value="viewer">Consulta</option></select></td>
                  <td><span className={`status-pill ${user.is_active ? 'normal' : 'alert'}`}>{user.is_locked ? 'Bloqueado temporalmente' : user.is_active ? 'Activo' : 'Desactivado'}</span></td>
                  <td>{localDate(user.last_login_at as string | undefined)}</td>
                  <td><div className="users-row-actions"><button type="button" className="ghost-action" onClick={() => { setResetTarget(user); setResetPasswordValue(''); setError(''); }} disabled={busyId === user.id}><KeyRound size={14} /> Contraseña</button><button type="button" className="ghost-action" onClick={() => void revoke(user)} disabled={busyId === user.id}><ShieldCheck size={14} /> Cerrar sesiones</button><button type="button" className="ghost-action" onClick={() => void patch(user, { is_active: !user.is_active })} disabled={busyId === user.id}><UserX size={14} /> {user.is_active ? 'Desactivar' : 'Activar'}</button></div></td>
                </tr>
              ))}
              {!loading && !users.length ? <tr><td colSpan={6}>No hay usuarios registrados.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
