export const AUTH_IP_LIMIT = { limit: 5, windowMs: 60 * 1000 } as const;

export const LOGIN_FAIL_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 } as const;
