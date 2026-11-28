import { request } from '@/lib/api/client';
import type { User } from '@/lib/auth/auth.context';

export type Preferences = User['preferences'];

export const updatePreferences = (input: Preferences) =>
  request<Preferences>('/me/preferences', { method: 'PATCH', body: input });
