import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { request, restoreSession, setSessionLostHandler } from '@/lib/api/client';
import { tokens } from '@/lib/auth/token.store';
import { queryClient } from '@/lib/query';

export type User = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  preferences: { hide_balance: boolean };
  notification_preferences: {
    send_time: string;
    quiet_hours: { start: string; end: string } | null;
    push: boolean;
    email_fallback: boolean;
  };
};

type Status = 'loading' | 'signedIn' | 'signedOut';

type AuthResult = {
  user: Pick<User, 'id' | 'name' | 'email' | 'timezone'>;
  access_token: string;
  access_expires_in: number;
  refresh_token: string;
};

type AuthContextValue = {
  status: Status;
  user: User | null;
  signIn: ({ email, password }: { email: string; password: string }) => Promise<void>;
  signUp: ({
    email,
    password,
    name,
  }: {
    email: string;
    password: string;
    name: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const deviceInfo = () => ({
  platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
  name: Device.deviceName ?? undefined,
});

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const loadProfile = () => request<User>('/me');

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  const markedSignedOut = useCallback(() => {
    queryClient.clear();
    setUser(null);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    setSessionLostHandler(markedSignedOut);
  }, [markedSignedOut]);

  useEffect(() => {
    let cancelled = false;
    const restored = async () => {
      const stored = await tokens.getRefresh();
      if (!stored) {
        if (!cancelled) markedSignedOut();
        return;
      }

      try {
        await restoreSession();
        const profile = await loadProfile();
        if (!cancelled) {
          setUser(profile);
          setStatus('signedIn');
        }
      } catch {
        if (!cancelled) markedSignedOut();
      }
    };
    restored();
    return () => {
      cancelled = true;
    };
  }, [markedSignedOut]);
  const startSession = useCallback(async (result: AuthResult) => {
    await tokens.setRefresh(result.refresh_token);
    tokens.setAccess(result.access_token);
    const profile = await loadProfile();
    setUser(profile);
    setStatus('signedIn');
  }, []);

  const signIn = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      const result = await request<AuthResult>('/auth/login', {
        method: 'POST',
        body: { email, password, device: deviceInfo() },
        auth: false,
      });
      await startSession(result);
    },
    [startSession]
  );

  const signUp = useCallback(
    async ({ email, password, name }: { email: string; password: string; name: string }) => {
      const result = await request<AuthResult>('/auth/register', {
        method: 'POST',
        body: { email, password, name, device: deviceInfo(), timezone: timezone() },
        auth: false,
      });
      await startSession(result);
    },
    [startSession]
  );
  const signOut = useCallback(async () => {
    const refreshToken = await tokens.getRefresh();
    if (refreshToken) {
      await request('/auth/logout', {
        method: 'POST',
        body: { refresh_token: refreshToken },
        auth: false,
      }).catch(() => {});
    }
    await tokens.clear();
    markedSignedOut();
  }, [markedSignedOut]);

  const value = useMemo(
    () => ({ status, user, signIn, signUp, signOut }),
    [status, user, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must use inside AuthProvider');
  return value;
};
