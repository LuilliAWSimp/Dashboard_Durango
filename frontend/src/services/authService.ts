import api, { clearCsrfToken, clearTabSession, hasTabSession, setCsrfToken, setTabSession } from './api';
import type { User } from '../types';

export { hasTabSession };

export interface SessionResponse {
  user: User;
  csrf_token: string;
  tab_session?: string;
  expires_at: string;
}

export interface SetupStatusResponse {
  configured: boolean;
}

export interface UserCreatePayload {
  username: string;
  display_name: string;
  password: string;
  role: 'admin' | 'operator' | 'viewer';
  is_active?: boolean;
}

export async function getSetupStatus(): Promise<SetupStatusResponse> {
  const { data } = await api.get<SetupStatusResponse>('/auth/setup-status');
  return data;
}

export async function login(username: string, password: string): Promise<SessionResponse> {
  const { data } = await api.post<SessionResponse>('/auth/login', { username, password });
  setTabSession(data.tab_session);
  setCsrfToken(data.csrf_token);
  return data;
}

export async function getCurrentSession(): Promise<SessionResponse> {
  const { data } = await api.get<SessionResponse>('/auth/me');
  setCsrfToken(data.csrf_token);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    clearCsrfToken();
    clearTabSession();
  }
}

export async function listUsers(): Promise<User[]> {
  const { data } = await api.get<User[]>('/auth/users');
  return data;
}

export async function createUser(payload: UserCreatePayload): Promise<User> {
  const { data } = await api.post<User>('/auth/users', payload);
  return data;
}

export async function updateUser(userId: number | string, payload: Partial<UserCreatePayload>): Promise<User> {
  const { data } = await api.patch<User>(`/auth/users/${userId}`, payload);
  return data;
}

export async function resetUserPassword(userId: number | string, password: string): Promise<void> {
  await api.post(`/auth/users/${userId}/reset-password`, { password });
}

export async function revokeUserSessions(userId: number | string): Promise<void> {
  await api.post(`/auth/users/${userId}/revoke-sessions`);
}
