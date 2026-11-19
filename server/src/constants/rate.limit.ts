export const AUTH_IP_LIMIT = { limit: 5, windowMs: 60 * 1000 } as const;

export const LOGIN_FAIL_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 } as const;

export const REFRESH_IP_LIMIT = { limit: 30, windowMs: 60 * 1000 } as const;

export const FORGOT_PASSWORD_LIMIT = {
  limit: 3,
  windowMs: 15 * 60 * 1000,
} as const;

export const UPLOAD_SIGN_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 } as const;
