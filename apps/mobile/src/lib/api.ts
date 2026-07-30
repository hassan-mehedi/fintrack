import { Platform } from 'react-native';

import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, tokenStorage } from './tokens';

// Android emulators reach the host machine via 10.0.2.2, not localhost
const defaultHost = Platform.select({
  android: 'http://10.0.2.2:4000',
  default: 'http://localhost:4000',
});

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? defaultHost!;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  plan: 'free' | 'pro';
  currency: string;
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setOnSessionExpired(callback: () => void) {
  onSessionExpired = callback;
}

export async function loadTokens() {
  accessToken = await tokenStorage.get(ACCESS_TOKEN_KEY);
  refreshToken = await tokenStorage.get(REFRESH_TOKEN_KEY);
}

export function hasSession(): boolean {
  return refreshToken !== null;
}

async function persistTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  await tokenStorage.set(ACCESS_TOKEN_KEY, access);
  await tokenStorage.set(REFRESH_TOKEN_KEY, refresh);
}

async function clearTokens() {
  accessToken = null;
  refreshToken = null;
  await tokenStorage.remove(ACCESS_TOKEN_KEY);
  await tokenStorage.remove(REFRESH_TOKEN_KEY);
}

async function rawFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, body?.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export async function refreshSession(): Promise<boolean> {
  if (!refreshToken) return false;

  const response = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    await clearTokens();
    onSessionExpired?.();
    return false;
  }

  const data = (await response.json()) as { accessToken: string; refreshToken: string };
  await persistTokens(data.accessToken, data.refreshToken);
  return true;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await rawFetch(path, init);
  if (response.status === 401 && (await refreshSession())) {
    return parseResponse<T>(await rawFetch(path, init));
  }
  return parseResponse<T>(response);
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const response = await fetch(`${API_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await parseResponse<{
    accessToken: string;
    refreshToken: string;
    user: SessionUser;
  }>(response);

  await persistTokens(data.accessToken, data.refreshToken);
  return data.user;
}

export async function logout() {
  if (refreshToken) {
    await fetch(`${API_URL}/v1/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
  }
  await clearTokens();
}

export async function fetchCurrentUser(): Promise<SessionUser> {
  const data = await apiFetch<{ user: SessionUser }>('/v1/me');
  return data.user;
}
