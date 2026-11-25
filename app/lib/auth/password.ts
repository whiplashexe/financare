import { request } from '@/lib/api/client';

export const forgotPassword = ({ email }: { email: string }) => {
  request<void>('/auth/forgot-password', {
    method: 'POST',
    body: { email },
    auth: false,
  });
};

export const resetPassword = ({ token, newPassword }: { token: string; newPassword: string }) => {
  request<void>('/auth/reset-password', {
    method: 'POST',
    body: { token, new_password: newPassword },
    auth: false,
  });
};
