import api from './api';
import type { AuthState, User } from '../types';

const TOKEN_KEY = 'siem_demo_token';
const USER_KEY = 'siem_demo_user';

interface LoginResponse {
  access_token: string;
  user: User;
  [key: string]: unknown;
}

type StoredAuth = Pick<AuthState, 'token' | 'user'>;

export async function login(username: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', { username, password });
  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data;
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getAuth(): StoredAuth {
  const token = localStorage.getItem(TOKEN_KEY);
  const user = localStorage.getItem(USER_KEY);
  return { token, user: user ? (JSON.parse(user) as User) : null };
}
