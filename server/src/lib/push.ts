import { importPKCS8, SignJWT } from "jose";
import { logger } from "./logger.js";

export type PushDevice = { token: string; platform: "ANDROID" | "IOS" };
export type PushMessage = {
  title: string;
  body: string;
  data: Record<string, string>;
};
export type PushResult = { token: string; result: "ok" | "invalid" | "error" };

export type PushClient = {
  isConfigured(): boolean;
  send(devices: PushDevice[], message: PushMessage): Promise<PushResult[]>;
};

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

const readAccount = (): ServiceAccount | null => {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw || raw.trim() === "") return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      return null;
    }
    return parsed as ServiceAccount;
  } catch {
    return null;
  }
};

let cached: { key: string; token: string; expiresAt: number } | undefined;

const accessToken = async (account: ServiceAccount) => {
  if (
    cached &&
    cached.key === account.client_email &&
    cached.expiresAt > Date.now() + 60_000
  ) {
    return cached.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await importPKCS8(account.private_key, "RS256"));

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`fcm token request failed: ${response.status}`);

  const json = (await response.json()) as { access_token: string; expires_in: number };
  cached = {
    key: account.client_email,
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cached.token;
};

const isInvalidToken = (status: number, body: any) => {
  const code = body?.error?.status;
  const details: any[] = body?.error?.details ?? [];
  return (
    status === 404 ||
    code === "NOT_FOUND" ||
    code === "INVALID_ARGUMENT" ||
    details.some((detail) => detail?.errorCode === "UNREGISTERED")
  );
};

export const pushClient: PushClient = {
  isConfigured: () => readAccount() !== null,

  async send(devices, message) {
    const account = readAccount();
    if (!account) {
      return devices.map((device) => ({ token: device.token, result: "error" as const }));
    }

    let token: string;
    try {
      token = await accessToken(account);
    } catch (error) {
      logger.warn("fcm authentication failed", { error: String(error) });
      return devices.map((device) => ({ token: device.token, result: "error" as const }));
    }

    const url = `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`;

    return Promise.all(
      devices.map(async (device): Promise<PushResult> => {
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token: device.token,
                notification: { title: message.title, body: message.body },
                data: message.data,
                android: { priority: "HIGH" },
                apns: {
                  headers: { "apns-priority": "10" },
                  payload: { aps: { sound: "default" } },
                },
              },
            }),
          });

          if (response.ok) return { token: device.token, result: "ok" };

          const body = await response.json().catch(() => null);
          if (response.status === 401) cached = undefined;
          return {
            token: device.token,
            result: isInvalidToken(response.status, body) ? "invalid" : "error",
          };
        } catch (error) {
          logger.warn("fcm send failed", { error: String(error) });
          return { token: device.token, result: "error" };
        }
      }),
    );
  },
};
