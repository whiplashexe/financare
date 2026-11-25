import { tokens } from '@/lib/auth/token.store';
import { API_URL } from './config';
import { ApiError } from './error';

type Options = {
  method?: string;
  body?: unknown;
  auth?: boolean;
};

type Envelope<T> = {
  success: boolean;
  message: string;
  statusCode: number;
  code?: string;
  errors?: Record<string, string[]>;
  data?: T;
};

type RefreshResult = {
  access_token: string;
  access_expires_in: number;
  refresh_token: string;
};

let refreshing: Promise<void> | null = null;
let onSessionLost: () => void = () => {};

export const setSessionLostHandler = (handler: () => void) => {
  onSessionLost = handler;
};

const send = async <T>(path: string, options: Options, retried: boolean): Promise<T> => {
  const { method = 'GET', body, auth = true } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const access = tokens.getAccess();
  if (auth && access) headers.Authorization = `Bearer ${access}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Tidak bisa terhubung ke server');
  }

  if (res.status === 401 && auth && !retried) {
    await refreshSession();
    return send<T>(path, options, true);
  }

  if (res.status === 204) return undefined as T;

  const json = (await res.json().catch(() => null)) as Envelope<T> | null;

  if (!res.ok || !json?.success) {
    const retryAfter = Number(res.headers.get('Retry-After')) || undefined;
    throw new ApiError(
      res.status,
      json?.code ?? 'UNKNOWN',
      json?.message ?? 'Terjadi kesalahan',
      json?.errors,
      retryAfter
    );
  }

  return json.data as T;
};

export const request = <T>(path: string, options: Options = {}) => send<T>(path, options, false);

const doRefresh = async () => {
  const refreshToken = await tokens.getRefresh();

  if (!refreshToken) {
    onSessionLost();
    throw new ApiError(401, 'UNAUTHORIZED', 'Sesi berakhir');
  }

  try {
    const result = await request<RefreshResult>('/auth/refresh', {
      method: 'POST',
      body: { refresh_token: refreshToken },
      auth: false,
    });
    await tokens.setRefresh(result.refresh_token);
    tokens.setAccess(result.access_token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await tokens.clear();
      onSessionLost();
    }
    throw error;
  }
};

const refreshSession = () => {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
};

export const restoreSession = () => refreshSession();
